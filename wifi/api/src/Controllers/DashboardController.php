<?php

namespace App\Controllers;

use App\Config\Database;
use App\Helpers\AuthHelper;
use PDO;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

class DashboardController
{
    private PDO $db;

    public function __construct()
    {
        $this->db = Database::getInstance();
    }

    private function json(Response $response, array $payload, int $status = 200): Response
    {
        $response->getBody()->write(json_encode($payload, JSON_UNESCAPED_UNICODE));
        return $response->withHeader('Content-Type', 'application/json')->withStatus($status);
    }

    private function shiftMonth(int $bulan, int $tahun, int $delta): array
    {
        $m = $bulan + $delta;
        $y = $tahun;
        while ($m < 1) {
            $m += 12;
            $y -= 1;
        }
        while ($m > 12) {
            $m -= 12;
            $y += 1;
        }
        return [$m, $y];
    }

    /** Agregat tagihan per pelanggan untuk 1 periode. */
    private function periodeAgg(int $bulan, int $tahun, string $today): array
    {
        $sql = '
            SELECT
                p.id AS pelanggan_id,
                p.nama AS nama_pelanggan,
                COUNT(t.id) AS jumlah_tagihan,
                COALESCE(SUM(t.nominal), 0) AS nominal,
                COALESCE(SUM(COALESCE(bayar.total_bayar, 0)), 0) AS total_bayar,
                MIN(t.jatuh_tempo) AS jatuh_tempo
            FROM tagihan t
            INNER JOIN pelanggan p ON p.id = t.pelanggan_id
            LEFT JOIN (
                SELECT tagihan_id, SUM(nominal) AS total_bayar
                FROM tagihan_bayar
                GROUP BY tagihan_id
            ) bayar ON bayar.tagihan_id = t.id
            WHERE t.periode_bulan = :bulan AND t.periode_tahun = :tahun
            GROUP BY p.id, p.nama
            ORDER BY p.nama ASC
        ';
        $stmt = $this->db->prepare($sql);
        $stmt->execute(['bulan' => $bulan, 'tahun' => $tahun]);
        $rows = $stmt->fetchAll();

        $totalKewajiban = 0.0;
        $totalTerbayar = 0.0;
        $totalSisa = 0.0;
        $jumlahLunas = 0;
        $jumlahBelum = 0;
        $jumlahTagihan = 0;
        $jumlahTerlambat = 0;
        $belumList = [];

        foreach ($rows as $row) {
            $nominal = (float) $row['nominal'];
            $bayar = (float) $row['total_bayar'];
            $sisa = max(0, $nominal - $bayar);
            $lunas = $sisa <= 0.00001;
            $jml = (int) $row['jumlah_tagihan'];
            $jt = (string) ($row['jatuh_tempo'] ?? '');
            $terlambat = !$lunas && $jt !== '' && $jt < $today;

            $totalKewajiban += $nominal;
            $totalTerbayar += $bayar;
            $totalSisa += $sisa;
            $jumlahTagihan += $jml;
            if ($lunas) {
                $jumlahLunas++;
            } else {
                $jumlahBelum++;
                if ($terlambat) {
                    $jumlahTerlambat++;
                }
                $belumList[] = [
                    'pelanggan_id' => (int) $row['pelanggan_id'],
                    'nama_pelanggan' => $row['nama_pelanggan'],
                    'jumlah_tagihan' => $jml,
                    'nominal' => $nominal,
                    'total_bayar' => $bayar,
                    'sisa' => $sisa,
                    'lunas' => false,
                    'jatuh_tempo' => $jt ?: null,
                    'terlambat' => $terlambat,
                    'periode_bulan' => $bulan,
                    'periode_tahun' => $tahun,
                ];
            }
        }

        usort($belumList, static function ($a, $b) {
            if ($a['terlambat'] !== $b['terlambat']) {
                return $a['terlambat'] ? -1 : 1;
            }
            return $b['sisa'] <=> $a['sisa'];
        });

        $pelangganCount = count($rows);
        $koleksiPct = $totalKewajiban > 0.00001
            ? round(($totalTerbayar / $totalKewajiban) * 100, 1)
            : ($pelangganCount > 0 ? 100.0 : 0.0);

        return [
            'jumlah_pelanggan' => $pelangganCount,
            'jumlah_tagihan' => $jumlahTagihan,
            'jumlah_lunas' => $jumlahLunas,
            'jumlah_belum' => $jumlahBelum,
            'jumlah_terlambat' => $jumlahTerlambat,
            'total_kewajiban' => $totalKewajiban,
            'total_terbayar' => $totalTerbayar,
            'total_sisa' => $totalSisa,
            'koleksi_pct' => $koleksiPct,
            'belum_lunas' => $belumList,
        ];
    }

    private function deltaPct(float $curr, float $prev): ?float
    {
        if (abs($prev) < 0.00001) {
            if (abs($curr) < 0.00001) {
                return 0.0;
            }
            return null; // baru ada di periode ini
        }
        return round((($curr - $prev) / abs($prev)) * 100, 1);
    }

    private function deltaAbs(float $curr, float $prev): float
    {
        return round($curr - $prev, 2);
    }

    /** GET /dashboard — ringkasan + tren + chart series. */
    public function index(Request $request, Response $response): Response
    {
        $user = $request->getAttribute('user');
        if (!AuthHelper::canManageData($user['role'] ?? null)) {
            return $this->json($response, ['success' => false, 'message' => 'Akses ditolak'], 403);
        }

        $params = $request->getQueryParams();
        $now = new \DateTimeImmutable('now');
        $bulan = (int) ($params['periode_bulan'] ?? $now->format('n'));
        $tahun = (int) ($params['periode_tahun'] ?? $now->format('Y'));
        if ($bulan < 1 || $bulan > 12) {
            $bulan = (int) $now->format('n');
        }
        if ($tahun < 2000 || $tahun > 2100) {
            $tahun = (int) $now->format('Y');
        }
        $today = $now->format('Y-m-d');

        $pelStmt = $this->db->query(
            'SELECT
                COUNT(*) AS total,
                SUM(CASE WHEN aktif = 1 THEN 1 ELSE 0 END) AS aktif,
                SUM(CASE WHEN aktif = 0 THEN 1 ELSE 0 END) AS nonaktif
             FROM pelanggan'
        );
        $pel = $pelStmt->fetch() ?: ['total' => 0, 'aktif' => 0, 'nonaktif' => 0];

        $curr = $this->periodeAgg($bulan, $tahun, $today);
        [$pBulan, $pTahun] = $this->shiftMonth($bulan, $tahun, -1);
        $prev = $this->periodeAgg($pBulan, $pTahun, $today);

        $belumList = array_slice($curr['belum_lunas'], 0, 10);
        unset($curr['belum_lunas'], $prev['belum_lunas']);

        $tren = [
            'kewajiban' => [
                'curr' => $curr['total_kewajiban'],
                'prev' => $prev['total_kewajiban'],
                'delta' => $this->deltaAbs($curr['total_kewajiban'], $prev['total_kewajiban']),
                'delta_pct' => $this->deltaPct($curr['total_kewajiban'], $prev['total_kewajiban']),
            ],
            'terbayar' => [
                'curr' => $curr['total_terbayar'],
                'prev' => $prev['total_terbayar'],
                'delta' => $this->deltaAbs($curr['total_terbayar'], $prev['total_terbayar']),
                'delta_pct' => $this->deltaPct($curr['total_terbayar'], $prev['total_terbayar']),
            ],
            'sisa' => [
                'curr' => $curr['total_sisa'],
                'prev' => $prev['total_sisa'],
                'delta' => $this->deltaAbs($curr['total_sisa'], $prev['total_sisa']),
                'delta_pct' => $this->deltaPct($curr['total_sisa'], $prev['total_sisa']),
            ],
            'koleksi_pct' => [
                'curr' => $curr['koleksi_pct'],
                'prev' => $prev['koleksi_pct'],
                'delta' => round($curr['koleksi_pct'] - $prev['koleksi_pct'], 1),
                'delta_pct' => $this->deltaPct($curr['koleksi_pct'], $prev['koleksi_pct']),
            ],
            'belum' => [
                'curr' => (float) $curr['jumlah_belum'],
                'prev' => (float) $prev['jumlah_belum'],
                'delta' => (float) ($curr['jumlah_belum'] - $prev['jumlah_belum']),
                'delta_pct' => $this->deltaPct((float) $curr['jumlah_belum'], (float) $prev['jumlah_belum']),
            ],
            'terlambat' => [
                'curr' => (float) $curr['jumlah_terlambat'],
                'prev' => (float) $prev['jumlah_terlambat'],
                'delta' => (float) ($curr['jumlah_terlambat'] - $prev['jumlah_terlambat']),
                'delta_pct' => $this->deltaPct((float) $curr['jumlah_terlambat'], (float) $prev['jumlah_terlambat']),
            ],
        ];

        // Seri 6 bulan terakhir (inkl. bulan aktif)
        $bulanan = [];
        for ($i = 5; $i >= 0; $i--) {
            [$bm, $by] = $this->shiftMonth($bulan, $tahun, -$i);
            $agg = $this->periodeAgg($bm, $by, $today);
            unset($agg['belum_lunas']);
            $bulanan[] = [
                'periode_bulan' => $bm,
                'periode_tahun' => $by,
                'label' => sprintf('%02d/%d', $bm, $by),
                'kewajiban' => $agg['total_kewajiban'],
                'terbayar' => $agg['total_terbayar'],
                'sisa' => $agg['total_sisa'],
                'koleksi_pct' => $agg['koleksi_pct'],
                'jumlah_lunas' => $agg['jumlah_lunas'],
                'jumlah_belum' => $agg['jumlah_belum'],
                'jumlah_terlambat' => $agg['jumlah_terlambat'],
            ];
        }

        // Pembayaran 14 hari terakhir (by tanggal bayar)
        $fromDay = $now->modify('-13 days')->format('Y-m-d');
        $harianStmt = $this->db->prepare(
            'SELECT b.tanggal AS tanggal,
                    COALESCE(SUM(b.nominal), 0) AS total,
                    COUNT(b.id) AS jumlah,
                    SUM(CASE WHEN b.via = \'cash\' THEN b.nominal ELSE 0 END) AS cash,
                    SUM(CASE WHEN b.via = \'tf\' THEN b.nominal ELSE 0 END) AS tf
             FROM tagihan_bayar b
             WHERE b.tanggal BETWEEN ? AND ?
             GROUP BY b.tanggal
             ORDER BY b.tanggal ASC'
        );
        $harianStmt->execute([$fromDay, $today]);
        $harianMap = [];
        foreach ($harianStmt->fetchAll() as $r) {
            $harianMap[$r['tanggal']] = [
                'total' => (float) $r['total'],
                'jumlah' => (int) $r['jumlah'],
                'cash' => (float) $r['cash'],
                'tf' => (float) $r['tf'],
            ];
        }
        $harian = [];
        for ($i = 13; $i >= 0; $i--) {
            $d = $now->modify("-{$i} days")->format('Y-m-d');
            $row = $harianMap[$d] ?? ['total' => 0.0, 'jumlah' => 0, 'cash' => 0.0, 'tf' => 0.0];
            $harian[] = [
                'tanggal' => $d,
                'label' => substr($d, 8, 2) . '/' . substr($d, 5, 2),
                'total' => $row['total'],
                'jumlah' => $row['jumlah'],
                'cash' => $row['cash'],
                'tf' => $row['tf'],
            ];
        }

        // Via breakdown untuk pembayaran pada tanggal di bulan kalender periode
        $viaStmt = $this->db->prepare(
            'SELECT
                COALESCE(SUM(CASE WHEN b.via = \'cash\' THEN b.nominal ELSE 0 END), 0) AS cash,
                COALESCE(SUM(CASE WHEN b.via = \'tf\' THEN b.nominal ELSE 0 END), 0) AS tf,
                COALESCE(SUM(b.nominal), 0) AS total,
                COUNT(b.id) AS jumlah
             FROM tagihan_bayar b
             WHERE YEAR(b.tanggal) = ? AND MONTH(b.tanggal) = ?'
        );
        $viaStmt->execute([$tahun, $bulan]);
        $via = $viaStmt->fetch() ?: ['cash' => 0, 'tf' => 0, 'total' => 0, 'jumlah' => 0];

        $bayarHariIni = $this->db->prepare(
            'SELECT COALESCE(SUM(b.nominal), 0) AS total, COUNT(b.id) AS jumlah
             FROM tagihan_bayar b
             WHERE b.tanggal = ?'
        );
        $bayarHariIni->execute([$today]);
        $bayarToday = $bayarHariIni->fetch() ?: ['total' => 0, 'jumlah' => 0];

        $bayarKemarin = $this->db->prepare(
            'SELECT COALESCE(SUM(b.nominal), 0) AS total, COUNT(b.id) AS jumlah
             FROM tagihan_bayar b
             WHERE b.tanggal = ?'
        );
        $kemarin = $now->modify('-1 day')->format('Y-m-d');
        $bayarKemarin->execute([$kemarin]);
        $bayarYesterday = $bayarKemarin->fetch() ?: ['total' => 0, 'jumlah' => 0];

        return $this->json($response, [
            'success' => true,
            'data' => [
                'periode_bulan' => $bulan,
                'periode_tahun' => $tahun,
                'prev_periode_bulan' => $pBulan,
                'prev_periode_tahun' => $pTahun,
                'pelanggan' => [
                    'total' => (int) $pel['total'],
                    'aktif' => (int) $pel['aktif'],
                    'nonaktif' => (int) $pel['nonaktif'],
                ],
                'periode' => $curr,
                'prev_periode' => $prev,
                'tren' => $tren,
                'pembayaran' => [
                    'hari_ini_total' => (float) $bayarToday['total'],
                    'hari_ini_jumlah' => (int) $bayarToday['jumlah'],
                    'kemarin_total' => (float) $bayarYesterday['total'],
                    'kemarin_jumlah' => (int) $bayarYesterday['jumlah'],
                    'hari_ini_delta' => $this->deltaAbs((float) $bayarToday['total'], (float) $bayarYesterday['total']),
                    'hari_ini_delta_pct' => $this->deltaPct((float) $bayarToday['total'], (float) $bayarYesterday['total']),
                    'periode_total' => (float) $via['total'],
                    'periode_jumlah' => (int) $via['jumlah'],
                    'via_cash' => (float) $via['cash'],
                    'via_tf' => (float) $via['tf'],
                ],
                'charts' => [
                    'bulanan' => $bulanan,
                    'harian' => $harian,
                    'status' => [
                        ['key' => 'lunas', 'label' => 'Lunas', 'value' => $curr['jumlah_lunas']],
                        ['key' => 'belum', 'label' => 'Belum', 'value' => max(0, $curr['jumlah_belum'] - $curr['jumlah_terlambat'])],
                        ['key' => 'terlambat', 'label' => 'Terlambat', 'value' => $curr['jumlah_terlambat']],
                    ],
                    'via' => [
                        ['key' => 'cash', 'label' => 'Cash', 'value' => (float) $via['cash']],
                        ['key' => 'tf', 'label' => 'Transfer', 'value' => (float) $via['tf']],
                    ],
                ],
                'belum_lunas' => $belumList,
            ],
        ]);
    }
}
