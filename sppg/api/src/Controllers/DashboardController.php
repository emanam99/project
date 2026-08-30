<?php

namespace App\Controllers;

use App\Config\Database;
use App\Helpers\TenantHelper;
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

    private function sumBetween(int $sppgId, string $from, string $toExclusive): float
    {
        $stmt = $this->db->prepare(
            'SELECT COALESCE(SUM(total), 0) FROM belanja WHERE sppg_id = ? AND tanggal >= ? AND tanggal < ?'
        );
        $stmt->execute([$sppgId, $from, $toExclusive]);
        return (float) $stmt->fetchColumn();
    }

    private function sumOn(int $sppgId, string $ymd): float
    {
        $stmt = $this->db->prepare('SELECT COALESCE(SUM(total), 0) FROM belanja WHERE sppg_id = ? AND tanggal = ?');
        $stmt->execute([$sppgId, $ymd]);
        return (float) $stmt->fetchColumn();
    }

    private function countOn(int $sppgId, string $ymd): int
    {
        $stmt = $this->db->prepare('SELECT COUNT(*) FROM belanja WHERE sppg_id = ? AND tanggal = ?');
        $stmt->execute([$sppgId, $ymd]);
        return (int) $stmt->fetchColumn();
    }

    /** GET /dashboard/summary */
    public function summary(Request $request, Response $response): Response
    {
        $sppgId = TenantHelper::getSppgIdFromRequest($request);
        $today = date('Y-m-d');
        $yesterday = date('Y-m-d', strtotime('-1 day'));
        $bulanIni = date('Y-m-01');
        $bulanDepan = date('Y-m-01', strtotime('+1 month'));
        $bulanLaluAwal = date('Y-m-01', strtotime('first day of last month'));
        $bulanLaluAkhir = $bulanIni;

        $stmtAll = $this->db->prepare('SELECT COALESCE(SUM(total), 0) FROM belanja WHERE sppg_id = ?');
        $stmtAll->execute([$sppgId]);
        $totalSemua = (float) $stmtAll->fetchColumn();

        $totalBulanIni = $this->sumBetween($sppgId, $bulanIni, $bulanDepan);
        $totalBulanLalu = $this->sumBetween($sppgId, $bulanLaluAwal, $bulanLaluAkhir);
        $totalHariIni = $this->sumOn($sppgId, $today);
        $totalKemarin = $this->sumOn($sppgId, $yesterday);
        $catatanHariIni = $this->countOn($sppgId, $today);

        $stmtCount = $this->db->prepare('SELECT COUNT(*) FROM belanja WHERE sppg_id = ?');
        $stmtCount->execute([$sppgId]);
        $jumlahCatatan = (int) $stmtCount->fetchColumn();

        $stmtItems = $this->db->prepare(
            'SELECT COUNT(*) FROM belanja_item bi INNER JOIN belanja b ON b.id = bi.belanja_id WHERE b.sppg_id = ?'
        );
        $stmtItems->execute([$sppgId]);
        $jumlahItem = (int) $stmtItems->fetchColumn();

        $hariBerjalan = max(1, (int) date('j'));
        $rataHarianBulan = $totalBulanIni / $hariBerjalan;

        $pctVsKemarin = null;
        if ($totalKemarin > 0) {
            $pctVsKemarin = round((($totalHariIni - $totalKemarin) / $totalKemarin) * 100, 1);
        } elseif ($totalHariIni > 0) {
            $pctVsKemarin = 100.0;
        } elseif ($totalHariIni == 0.0 && $totalKemarin == 0.0) {
            $pctVsKemarin = 0.0;
        }

        $pctVsBulanLalu = null;
        if ($totalBulanLalu > 0) {
            $pctVsBulanLalu = round((($totalBulanIni - $totalBulanLalu) / $totalBulanLalu) * 100, 1);
        } elseif ($totalBulanIni > 0) {
            $pctVsBulanLalu = 100.0;
        } else {
            $pctVsBulanLalu = 0.0;
        }

        $from14 = date('Y-m-d', strtotime('-13 days'));
        $stmtDaily = $this->db->prepare(
            'SELECT tanggal, COALESCE(SUM(total), 0) AS total, COUNT(*) AS jumlah
             FROM belanja
             WHERE sppg_id = ? AND tanggal >= ? AND tanggal <= ?
             GROUP BY tanggal
             ORDER BY tanggal ASC'
        );
        $stmtDaily->execute([$sppgId, $from14, $today]);
        $byDate = [];
        foreach ($stmtDaily->fetchAll() as $row) {
            $byDate[$row['tanggal']] = [
                'total' => (float) $row['total'],
                'jumlah' => (int) $row['jumlah'],
            ];
        }
        $daily = [];
        for ($i = 13; $i >= 0; $i--) {
            $d = date('Y-m-d', strtotime("-{$i} days"));
            $daily[] = [
                'tanggal' => $d,
                'total' => $byDate[$d]['total'] ?? 0.0,
                'jumlah' => $byDate[$d]['jumlah'] ?? 0,
            ];
        }

        $daily_delta = [];
        for ($i = 0; $i < count($daily); $i++) {
            $prev = $i > 0 ? $daily[$i - 1]['total'] : null;
            $cur = $daily[$i]['total'];
            $delta = $prev === null ? null : $cur - $prev;
            $pct = null;
            if ($prev !== null && $prev > 0) {
                $pct = round((($cur - $prev) / $prev) * 100, 1);
            } elseif ($prev !== null && $cur > 0) {
                $pct = 100.0;
            } elseif ($prev !== null) {
                $pct = 0.0;
            }
            $daily_delta[] = [
                'tanggal' => $daily[$i]['tanggal'],
                'total' => $cur,
                'delta' => $delta,
                'pct' => $pct,
            ];
        }

        $stmtKat = $this->db->prepare(
            "SELECT COALESCE(NULLIF(TRIM(kategori), ''), 'Tanpa kategori') AS nama,
                    COALESCE(SUM(total), 0) AS total,
                    COUNT(*) AS jumlah
             FROM belanja
             WHERE sppg_id = ? AND tanggal >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
             GROUP BY nama
             ORDER BY total DESC
             LIMIT 6"
        );
        $stmtKat->execute([$sppgId]);
        $byKategori = $stmtKat->fetchAll();

        $stmtRek = $this->db->prepare(
            "SELECT COALESCE(r.nama_penerima, 'Tanpa rekening') AS nama,
                    COALESCE(SUM(b.total), 0) AS total,
                    COUNT(*) AS jumlah
             FROM belanja b
             LEFT JOIN rekening r ON r.id = b.rekening_id AND r.sppg_id = b.sppg_id
             WHERE b.sppg_id = ? AND b.tanggal >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
             GROUP BY nama
             ORDER BY total DESC
             LIMIT 6"
        );
        $stmtRek->execute([$sppgId]);
        $byRekening = $stmtRek->fetchAll();

        $stmtRecent = $this->db->prepare(
            'SELECT b.id, b.tanggal, b.keterangan, b.kategori, b.total,
                    r.nama_penerima, u.name AS created_by_name
             FROM belanja b
             LEFT JOIN users u ON u.id = b.created_by
             LEFT JOIN rekening r ON r.id = b.rekening_id
             WHERE b.sppg_id = ?
             ORDER BY b.tanggal DESC, b.id DESC
             LIMIT 8'
        );
        $stmtRecent->execute([$sppgId]);
        $recent = $stmtRecent->fetchAll();

        $stmtTop = $this->db->prepare(
            'SELECT bi.nama_barang, SUM(bi.qty) AS total_qty, SUM(bi.subtotal) AS total_nilai
             FROM belanja_item bi
             INNER JOIN belanja b ON b.id = bi.belanja_id
             WHERE b.sppg_id = ? AND b.tanggal >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
             GROUP BY bi.nama_barang
             ORDER BY total_nilai DESC
             LIMIT 8'
        );
        $stmtTop->execute([$sppgId]);
        $topItems = $stmtTop->fetchAll();

        return $this->json($response, [
            'success' => true,
            'data' => [
                'total_semua' => $totalSemua,
                'total_bulan_ini' => $totalBulanIni,
                'total_bulan_lalu' => $totalBulanLalu,
                'total_hari_ini' => $totalHariIni,
                'total_kemarin' => $totalKemarin,
                'catatan_hari_ini' => $catatanHariIni,
                'jumlah_catatan' => $jumlahCatatan,
                'jumlah_item' => $jumlahItem,
                'rata_harian_bulan' => round($rataHarianBulan, 2),
                'pct_vs_kemarin' => $pctVsKemarin,
                'pct_vs_bulan_lalu' => $pctVsBulanLalu,
                'daily' => $daily,
                'daily_delta' => $daily_delta,
                'by_kategori' => array_map(static function ($r) {
                    return [
                        'nama' => $r['nama'],
                        'total' => (float) $r['total'],
                        'jumlah' => (int) $r['jumlah'],
                    ];
                }, $byKategori),
                'by_rekening' => array_map(static function ($r) {
                    return [
                        'nama' => $r['nama'],
                        'total' => (float) $r['total'],
                        'jumlah' => (int) $r['jumlah'],
                    ];
                }, $byRekening),
                'recent' => $recent,
                'top_items' => $topItems,
            ],
        ]);
    }
}
