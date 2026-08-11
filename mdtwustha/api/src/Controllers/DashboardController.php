<?php

namespace App\Controllers;

use App\Config\Database;
use DateTimeImmutable;
use DateTimeZone;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

class DashboardController {
    private const TIMEZONE = 'Asia/Jakarta';
    private const VALID_ABSEN = ['H', 'S', 'I', 'A'];

    public function index(Request $request, Response $response): Response {
        $db = Database::getInstance();
        $today = $this->todayString();
        $start = (new DateTimeImmutable($today, new DateTimeZone(self::TIMEZONE)))
            ->modify('-6 days')
            ->format('Y-m-d');
        $dates = $this->dateRange($start, $today);

        $counts = [
            'santri' => (int) $db->query(
                'SELECT COUNT(*) FROM santri___kelas WHERE tanggal_selesai IS NULL'
            )->fetchColumn(),
            'kelas' => (int) $db->query('SELECT COUNT(*) FROM kelas')->fetchColumn(),
            'pengurus' => (int) $db->query('SELECT COUNT(*) FROM pengurus')->fetchColumn(),
            'mapel' => (int) $db->query('SELECT COUNT(*) FROM mapel')->fetchColumn(),
        ];

        $stmt = $db->query('
            SELECT sk.santri_id, sk.kelas_id, k.nama_kelas, k.kel
            FROM santri___kelas sk
            INNER JOIN kelas k ON k.id = sk.kelas_id
            WHERE sk.tanggal_selesai IS NULL
        ');
        $aktif = $stmt->fetchAll();
        $santriIds = array_values(array_unique(array_column($aktif, 'santri_id')));
        $santriCount = count($santriIds);

        $absenByDateSantri = [];
        if ($santriCount > 0) {
            $placeholders = implode(',', array_fill(0, $santriCount, '?'));
            $stmt = $db->prepare("
                SELECT santri_id, tanggal, jam_1, jam_2
                FROM santri___absen
                WHERE tanggal BETWEEN ? AND ?
                  AND santri_id IN ($placeholders)
            ");
            $stmt->execute(array_merge([$start, $today], $santriIds));
            foreach ($stmt->fetchAll() as $row) {
                $absenByDateSantri[$row['tanggal']][$row['santri_id']] = $row;
            }
        }

        $emptyStatus = ['H' => 0, 'S' => 0, 'I' => 0, 'A' => 0];
        $trenAbsen = [];
        $absenHariIni = $emptyStatus + ['slot_total' => 0];

        // Hanya hitung slot yang sudah ada baris absen — belum diabsen ≠ Hadir
        foreach ($dates as $tanggal) {
            $bucket = $emptyStatus;
            foreach ($santriIds as $sid) {
                $row = $absenByDateSantri[$tanggal][$sid] ?? null;
                if (!$row) {
                    continue;
                }
                $j1 = $this->normalizeAbsen($row['jam_1'] ?? null);
                $j2 = $this->normalizeAbsen($row['jam_2'] ?? null);
                $bucket[$j1]++;
                $bucket[$j2]++;
            }
            $bucket['slot_total'] = $santriCount * 2;
            $trenAbsen[] = array_merge(['tanggal' => $tanggal], $bucket);
            if ($tanggal === $today) {
                $absenHariIni = $bucket;
            }
        }

        $stmt = $db->prepare('
            SELECT status, COUNT(*) AS total
            FROM kelas___jurnal_mengajar
            WHERE tanggal = :tanggal
            GROUP BY status
        ');
        $stmt->execute(['tanggal' => $today]);
        $jurnalHariIni = ['mengajar' => 0, 'ijin' => 0, 'sakit' => 0, 'total' => 0];
        foreach ($stmt->fetchAll() as $row) {
            $st = $row['status'];
            if (isset($jurnalHariIni[$st])) {
                $jurnalHariIni[$st] = (int) $row['total'];
                $jurnalHariIni['total'] += (int) $row['total'];
            }
        }

        $perKelasMap = [];
        foreach ($aktif as $row) {
            $kid = $row['kelas_id'];
            if (!isset($perKelasMap[$kid])) {
                $perKelasMap[$kid] = [
                    'kelas_id' => $kid,
                    'nama_kelas' => $row['nama_kelas'],
                    'kel' => $row['kel'],
                    'santri' => 0,
                    'hadir' => 0,
                    'slot_total' => 0,
                ];
            }
            $perKelasMap[$kid]['santri']++;
            $perKelasMap[$kid]['slot_total'] += 2;
            $abs = $absenByDateSantri[$today][$row['santri_id']] ?? null;
            if (!$abs) {
                continue;
            }
            $j1 = $this->normalizeAbsen($abs['jam_1'] ?? null);
            $j2 = $this->normalizeAbsen($abs['jam_2'] ?? null);
            if ($j1 === 'H') {
                $perKelasMap[$kid]['hadir']++;
            }
            if ($j2 === 'H') {
                $perKelasMap[$kid]['hadir']++;
            }
        }

        // Kelas tanpa santri aktif tetap tampil
        $stmt = $db->query('SELECT id, nama_kelas, kel FROM kelas ORDER BY nama_kelas ASC, kel ASC');
        $perKelas = [];
        foreach ($stmt->fetchAll() as $k) {
            $m = $perKelasMap[$k['id']] ?? [
                'kelas_id' => $k['id'],
                'nama_kelas' => $k['nama_kelas'],
                'kel' => $k['kel'],
                'santri' => 0,
                'hadir' => 0,
                'slot_total' => 0,
            ];
            $pct = $m['slot_total'] > 0
                ? round(($m['hadir'] / $m['slot_total']) * 100, 1)
                : 0.0;
            $perKelas[] = [
                'kelas_id' => (string) $m['kelas_id'],
                'nama_kelas' => $m['nama_kelas'],
                'kel' => $m['kel'],
                'santri' => (int) $m['santri'],
                'hadir_pct' => $pct,
            ];
        }

        return $this->jsonResponse($response, [
            'success' => true,
            'data' => [
                'tanggal' => $today,
                'counts' => $counts,
                'absen_hari_ini' => $absenHariIni,
                'jurnal_hari_ini' => $jurnalHariIni,
                'tren_absen' => $trenAbsen,
                'per_kelas' => $perKelas,
            ],
        ]);
    }

    private function normalizeAbsen(?string $status): string {
        $s = strtoupper(trim((string) $status));
        return in_array($s, self::VALID_ABSEN, true) ? $s : 'H';
    }

    /** @return string[] */
    private function dateRange(string $awal, string $akhir): array {
        $dates = [];
        $current = new DateTimeImmutable($awal, new DateTimeZone(self::TIMEZONE));
        $end = new DateTimeImmutable($akhir, new DateTimeZone(self::TIMEZONE));
        while ($current <= $end) {
            $dates[] = $current->format('Y-m-d');
            $current = $current->modify('+1 day');
        }
        return $dates;
    }

    private function todayString(): string {
        return (new DateTimeImmutable('now', new DateTimeZone(self::TIMEZONE)))->format('Y-m-d');
    }

    private function jsonResponse(Response $response, array $data, int $status = 200): Response {
        $response->getBody()->write(json_encode($data));
        return $response->withHeader('Content-Type', 'application/json')->withStatus($status);
    }
}
