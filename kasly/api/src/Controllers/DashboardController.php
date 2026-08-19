<?php

namespace App\Controllers;

use App\Config\Database;
use App\Helpers\RekeningHelper;
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

    private function sumBetween(string $jenis, string $from, string $toExclusive): float
    {
        $stmt = $this->db->prepare(
            'SELECT COALESCE(SUM(total), 0) FROM belanja WHERE jenis = ? AND tanggal >= ? AND tanggal < ?'
        );
        $stmt->execute([$jenis, $from, $toExclusive]);
        return (float) $stmt->fetchColumn();
    }

    private function sumOn(string $jenis, string $ymd): float
    {
        $stmt = $this->db->prepare('SELECT COALESCE(SUM(total), 0) FROM belanja WHERE jenis = ? AND tanggal = ?');
        $stmt->execute([$jenis, $ymd]);
        return (float) $stmt->fetchColumn();
    }

    /** GET /dashboard/summary */
    public function summary(Request $request, Response $response): Response
    {
        $today = date('Y-m-d');
        $bulanIni = date('Y-m-01');
        $bulanDepan = date('Y-m-01', strtotime('+1 month'));
        $bulanLaluAwal = date('Y-m-01', strtotime('first day of last month'));

        $masukBulanIni = $this->sumBetween('masuk', $bulanIni, $bulanDepan);
        $keluarBulanIni = $this->sumBetween('keluar', $bulanIni, $bulanDepan);
        $masukBulanLalu = $this->sumBetween('masuk', $bulanLaluAwal, $bulanIni);
        $keluarBulanLalu = $this->sumBetween('keluar', $bulanLaluAwal, $bulanIni);
        $masukHariIni = $this->sumOn('masuk', $today);
        $keluarHariIni = $this->sumOn('keluar', $today);

        $masukSemua = (float) $this->db->query("SELECT COALESCE(SUM(total), 0) FROM belanja WHERE jenis = 'masuk'")->fetchColumn();
        $keluarSemua = (float) $this->db->query("SELECT COALESCE(SUM(total), 0) FROM belanja WHERE jenis = 'keluar'")->fetchColumn();
        $saldo = $masukSemua - $keluarSemua;

        $jumlahCatatan = (int) $this->db->query('SELECT COUNT(*) FROM belanja')->fetchColumn();
        $jumlahItem = (int) $this->db->query('SELECT COUNT(*) FROM belanja_item')->fetchColumn();
        $catatanHariIni = (int) $this->db->query('SELECT COUNT(*) FROM belanja WHERE tanggal = CURDATE()')->fetchColumn();

        $hariBerjalan = max(1, (int) date('j'));
        $rataKeluarHarian = $keluarBulanIni / $hariBerjalan;

        $from14 = date('Y-m-d', strtotime('-13 days'));
        $stmtDaily = $this->db->prepare(
            "SELECT tanggal,
                    COALESCE(SUM(CASE WHEN jenis = 'masuk' THEN total ELSE 0 END), 0) AS masuk,
                    COALESCE(SUM(CASE WHEN jenis = 'keluar' THEN total ELSE 0 END), 0) AS keluar,
                    COUNT(*) AS jumlah
             FROM belanja
             WHERE tanggal >= ? AND tanggal <= ?
             GROUP BY tanggal
             ORDER BY tanggal ASC"
        );
        $stmtDaily->execute([$from14, $today]);
        $byDate = [];
        foreach ($stmtDaily->fetchAll() as $row) {
            $byDate[$row['tanggal']] = [
                'masuk' => (float) $row['masuk'],
                'keluar' => (float) $row['keluar'],
                'jumlah' => (int) $row['jumlah'],
            ];
        }
        $daily = [];
        for ($i = 13; $i >= 0; $i--) {
            $d = date('Y-m-d', strtotime("-{$i} days"));
            $masuk = $byDate[$d]['masuk'] ?? 0.0;
            $keluar = $byDate[$d]['keluar'] ?? 0.0;
            $daily[] = [
                'tanggal' => $d,
                'masuk' => $masuk,
                'keluar' => $keluar,
                'total' => $keluar,
                'jumlah' => $byDate[$d]['jumlah'] ?? 0,
            ];
        }

        $byKategoriKeluar = $this->db->query(
            "SELECT COALESCE(NULLIF(TRIM(kategori), ''), 'Tanpa kategori') AS nama,
                    COALESCE(SUM(total), 0) AS total,
                    COUNT(*) AS jumlah
             FROM belanja
             WHERE jenis = 'keluar' AND tanggal >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
             GROUP BY nama
             ORDER BY total DESC
             LIMIT 6"
        )->fetchAll();

        $byKategoriMasuk = $this->db->query(
            "SELECT COALESCE(NULLIF(TRIM(kategori), ''), 'Tanpa kategori') AS nama,
                    COALESCE(SUM(total), 0) AS total,
                    COUNT(*) AS jumlah
             FROM belanja
             WHERE jenis = 'masuk' AND tanggal >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
             GROUP BY nama
             ORDER BY total DESC
             LIMIT 6"
        )->fetchAll();

        $recent = $this->db->query(
            'SELECT b.id, b.tanggal, b.jenis, b.keterangan, b.kategori, b.total,
                    u.name AS created_by_name
             FROM belanja b
             LEFT JOIN users u ON u.id = b.created_by
             ORDER BY b.tanggal DESC, b.id DESC
             LIMIT 8'
        )->fetchAll();

        $topItems = $this->db->query(
            "SELECT bi.nama_barang, SUM(bi.qty) AS total_qty, SUM(bi.subtotal) AS total_nilai
             FROM belanja_item bi
             INNER JOIN belanja b ON b.id = bi.belanja_id
             WHERE b.jenis = 'keluar' AND b.tanggal >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
             GROUP BY bi.nama_barang
             ORDER BY total_nilai DESC
             LIMIT 8"
        )->fetchAll();

        $rekeningRows = RekeningHelper::listWithSaldo($this->db, false);
        $ringkasRek = RekeningHelper::ringkasByTipe($rekeningRows);

        $mapKat = static function ($r) {
            return [
                'nama' => $r['nama'],
                'total' => (float) $r['total'],
                'jumlah' => (int) $r['jumlah'],
            ];
        };

        return $this->json($response, [
            'success' => true,
            'data' => [
                'saldo' => $saldo,
                'masuk_semua' => $masukSemua,
                'keluar_semua' => $keluarSemua,
                'masuk_bulan_ini' => $masukBulanIni,
                'keluar_bulan_ini' => $keluarBulanIni,
                'masuk_bulan_lalu' => $masukBulanLalu,
                'keluar_bulan_lalu' => $keluarBulanLalu,
                'masuk_hari_ini' => $masukHariIni,
                'keluar_hari_ini' => $keluarHariIni,
                'catatan_hari_ini' => $catatanHariIni,
                'jumlah_catatan' => $jumlahCatatan,
                'jumlah_item' => $jumlahItem,
                'rata_keluar_harian' => round($rataKeluarHarian, 2),
                'daily' => $daily,
                'by_kategori_keluar' => array_map($mapKat, $byKategoriKeluar),
                'by_kategori_masuk' => array_map($mapKat, $byKategoriMasuk),
                'recent' => $recent,
                'top_items' => $topItems,
                'rekening' => $rekeningRows,
                'saldo_bank' => $ringkasRek['bank'],
                'saldo_ewallet' => $ringkasRek['ewallet'],
                'saldo_cash' => $ringkasRek['cash'],
            ],
        ]);
    }
}
