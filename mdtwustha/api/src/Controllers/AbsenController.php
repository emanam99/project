<?php

namespace App\Controllers;

use App\Config\Database;
use DateTimeImmutable;
use DateTimeZone;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

class AbsenController {
    private const VALID_STATUS = ['H', 'S', 'I', 'A'];
    private const VALID_JAM = ['jam_1', 'jam_2'];
    private const TIMEZONE = 'Asia/Jakarta';
    private const LOCK_HOUR = 24;

    public function index(Request $request, Response $response): Response {
        $params = $request->getQueryParams();
        $kelasId = $params['kelas_id'] ?? null;

        if (!$kelasId) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Filter kelas wajib']);
        }

        $tanggal = $this->todayString();
        $canEdit = !$this->isAbsenLocked();

        $db = Database::getInstance();
        $stmt = $db->prepare('
            SELECT s.id AS santri_id,
                   s.nomer_induk,
                   s.nama,
                   COALESCE(a.jam_1, \'H\') AS jam_1,
                   COALESCE(a.jam_2, \'H\') AS jam_2,
                   a.id AS absen_id
            FROM santri s
            INNER JOIN santri___kelas sk ON sk.santri_id = s.id AND sk.tanggal_selesai IS NULL
            LEFT JOIN santri___absen a ON a.santri_id = s.id AND a.tanggal = :tanggal
            WHERE sk.kelas_id = :kelas_id
            ORDER BY sk.urutan ASC, s.nama ASC
        ');
        $stmt->execute([
            'kelas_id' => $kelasId,
            'tanggal' => $tanggal,
        ]);
        $rows = $stmt->fetchAll();

        return $this->jsonResponse($response, [
            'success' => true,
            'data' => $rows,
            'meta' => [
                'kelas_id' => $kelasId,
                'tanggal' => $tanggal,
                'can_edit' => $canEdit,
                'lock_hour' => self::LOCK_HOUR,
            ],
        ]);
    }

    public function updateJam(Request $request, Response $response): Response {
        if ($this->isAbsenLocked()) {
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Absensi hari ini sudah ditutup (setelah pukul 24.00). Silakan isi lagi besok.',
            ]);
        }

        $data = $this->parseBody($request);
        $santriId = $data['santri_id'] ?? null;
        $tanggal = $this->todayString();
        $jam = $data['jam'] ?? '';
        $status = strtoupper(trim($data['status'] ?? ''));

        if (!$santriId) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'ID santri wajib']);
        }
        if (!in_array($jam, self::VALID_JAM, true)) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Kolom jam tidak valid']);
        }
        if (!in_array($status, self::VALID_STATUS, true)) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Status absen tidak valid']);
        }

        $clientTanggal = trim($data['tanggal'] ?? '');
        if ($clientTanggal !== '' && $clientTanggal !== $tanggal) {
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Absensi hanya dapat diisi untuk hari ini',
            ]);
        }

        $db = Database::getInstance();

        $stmt = $db->prepare('SELECT id FROM santri WHERE id = :id');
        $stmt->execute(['id' => $santriId]);
        if (!$stmt->fetch()) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Santri tidak ditemukan']);
        }

        $idp = $data['idp'] ?? null;

        $stmt = $db->prepare('SELECT id, jam_1, jam_2 FROM santri___absen WHERE santri_id = :santri_id AND tanggal = :tanggal');
        $stmt->execute(['santri_id' => $santriId, 'tanggal' => $tanggal]);
        $existing = $stmt->fetch();

        if ($existing) {
            $column = $jam;
            $sql = "UPDATE santri___absen SET $column = :status, idp = :idp WHERE id = :id";
            $stmt = $db->prepare($sql);
            $stmt->execute([
                'status' => $status,
                'idp' => $idp,
                'id' => $existing['id'],
            ]);
        } else {
            $jam1 = $jam === 'jam_1' ? $status : 'H';
            $jam2 = $jam === 'jam_2' ? $status : 'H';
            $stmt = $db->prepare('
                INSERT INTO santri___absen (santri_id, tanggal, jam_1, jam_2, idp)
                VALUES (:santri_id, :tanggal, :jam_1, :jam_2, :idp)
            ');
            $stmt->execute([
                'santri_id' => $santriId,
                'tanggal' => $tanggal,
                'jam_1' => $jam1,
                'jam_2' => $jam2,
                'idp' => $idp,
            ]);
        }

        return $this->jsonResponse($response, [
            'success' => true,
            'message' => 'Absen diperbarui',
            'data' => [
                'santri_id' => $santriId,
                'tanggal' => $tanggal,
                'jam' => $jam,
                'status' => $status,
            ],
        ]);
    }

    public function rekap(Request $request, Response $response): Response {
        $params = $request->getQueryParams();
        $kelasId = $params['kelas_id'] ?? null;
        $tanggalAwal = trim($params['tanggal_awal'] ?? '');
        $tanggalAkhir = trim($params['tanggal_akhir'] ?? '');

        if (!$kelasId) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Filter kelas wajib']);
        }
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $tanggalAwal)) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'tanggal_awal harus format YYYY-MM-DD']);
        }
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $tanggalAkhir)) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'tanggal_akhir harus format YYYY-MM-DD']);
        }
        if ($tanggalAwal > $tanggalAkhir) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'tanggal_awal tidak boleh setelah tanggal_akhir']);
        }

        $today = $this->todayString();
        if ($tanggalAkhir > $today) {
            $tanggalAkhir = $today;
        }

        if ($tanggalAwal > $tanggalAkhir) {
            return $this->jsonResponse($response, [
                'success' => true,
                'data' => [],
                'meta' => [
                    'kelas_id' => $kelasId,
                    'tanggal_awal' => $tanggalAwal,
                    'tanggal_akhir' => $tanggalAkhir,
                    'hari_efektif' => 0,
                ],
            ]);
        }

        $db = Database::getInstance();

        $stmt = $db->prepare('
            SELECT s.id AS santri_id, s.nomer_induk, s.nama
            FROM santri s
            INNER JOIN santri___kelas sk ON sk.santri_id = s.id AND sk.tanggal_selesai IS NULL
            WHERE sk.kelas_id = :kelas_id
            ORDER BY sk.urutan ASC, s.nama ASC
        ');
        $stmt->execute(['kelas_id' => $kelasId]);
        $santriList = $stmt->fetchAll();

        if (empty($santriList)) {
            return $this->jsonResponse($response, [
                'success' => true,
                'data' => [],
                'meta' => [
                    'kelas_id' => $kelasId,
                    'tanggal_awal' => $tanggalAwal,
                    'tanggal_akhir' => $tanggalAkhir,
                    'hari_efektif' => $this->countDaysInclusive($tanggalAwal, $tanggalAkhir),
                ],
            ]);
        }

        $santriIds = array_column($santriList, 'santri_id');
        $placeholders = implode(',', array_fill(0, count($santriIds), '?'));

        $stmt = $db->prepare("
            SELECT santri_id, tanggal, jam_1, jam_2
            FROM santri___absen
            WHERE tanggal BETWEEN ? AND ?
              AND santri_id IN ($placeholders)
        ");
        $stmt->execute(array_merge([$tanggalAwal, $tanggalAkhir], $santriIds));
        $absenRows = $stmt->fetchAll();

        $absenMap = [];
        foreach ($absenRows as $row) {
            $sid = $row['santri_id'];
            $tgl = $row['tanggal'];
            if (!isset($absenMap[$sid])) {
                $absenMap[$sid] = [];
            }
            $absenMap[$sid][$tgl] = [
                'jam_1' => $row['jam_1'],
                'jam_2' => $row['jam_2'],
            ];
        }

        $hariEfektif = $this->countDaysInclusive($tanggalAwal, $tanggalAkhir);
        $dates = $this->dateRange($tanggalAwal, $tanggalAkhir);
        $result = [];

        foreach ($santriList as $santri) {
            $sid = $santri['santri_id'];
            $counts = [
                'jam_1' => ['H' => 0, 'S' => 0, 'I' => 0, 'A' => 0],
                'jam_2' => ['H' => 0, 'S' => 0, 'I' => 0, 'A' => 0],
            ];

            foreach ($dates as $date) {
                $record = $absenMap[$sid][$date] ?? null;
                $jam1 = $record['jam_1'] ?? 'H';
                $jam2 = $record['jam_2'] ?? 'H';
                if (isset($counts['jam_1'][$jam1])) {
                    $counts['jam_1'][$jam1]++;
                }
                if (isset($counts['jam_2'][$jam2])) {
                    $counts['jam_2'][$jam2]++;
                }
            }

            $result[] = [
                'santri_id' => $sid,
                'nomer_induk' => $santri['nomer_induk'],
                'nama' => $santri['nama'],
                'jam_1' => $counts['jam_1'],
                'jam_2' => $counts['jam_2'],
            ];
        }

        return $this->jsonResponse($response, [
            'success' => true,
            'data' => $result,
            'meta' => [
                'kelas_id' => $kelasId,
                'tanggal_awal' => $tanggalAwal,
                'tanggal_akhir' => $tanggalAkhir,
                'hari_efektif' => $hariEfektif,
            ],
        ]);
    }

    private function countDaysInclusive(string $awal, string $akhir): int {
        $start = new DateTimeImmutable($awal);
        $end = new DateTimeImmutable($akhir);
        if ($start > $end) {
            return 0;
        }
        return (int) $start->diff($end)->days + 1;
    }

    /** @return string[] */
    private function dateRange(string $awal, string $akhir): array {
        $dates = [];
        $current = new DateTimeImmutable($awal);
        $end = new DateTimeImmutable($akhir);
        while ($current <= $end) {
            $dates[] = $current->format('Y-m-d');
            $current = $current->modify('+1 day');
        }
        return $dates;
    }

    private function now(): DateTimeImmutable {
        return new DateTimeImmutable('now', new DateTimeZone(self::TIMEZONE));
    }

    private function todayString(): string {
        return $this->now()->format('Y-m-d');
    }

    private function isAbsenLocked(): bool {
        return (int) $this->now()->format('G') >= self::LOCK_HOUR;
    }

    private function parseBody(Request $request): array {
        $data = json_decode((string) $request->getBody(), true);
        return is_array($data) ? $data : [];
    }

    private function jsonResponse(Response $response, array $data, int $status = 200): Response {
        $response->getBody()->write(json_encode($data));
        return $response->withHeader('Content-Type', 'application/json')->withStatus($status);
    }
}
