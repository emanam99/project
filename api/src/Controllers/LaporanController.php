<?php

namespace App\Controllers;

use App\Database;
use App\Helpers\ViaPembayaranHelper;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

class LaporanController
{
    private $db;

    public function __construct()
    {
        $this->db = Database::getInstance()->getConnection();
    }

    private function jsonResponse(Response $response, array $data, int $statusCode): Response
    {
        $response->getBody()->write(json_encode($data, JSON_UNESCAPED_UNICODE));
        return $response
            ->withStatus($statusCode)
            ->withHeader('Content-Type', 'application/json; charset=utf-8');
    }

    /**
     * GET /api/laporan - Ambil data laporan pembayaran
     * Endpoint ini memerlukan authentication (harus login)
     * Support filter: tanggal, tahun_ajaran, admin
     * Mode: tunggakan, khusus, uwaba, atau pendaftaran
     */
    public function getLaporan(Request $request, Response $response): Response
    {
        try {
            $queryParams = $request->getQueryParams();
            $pageMode = $queryParams['page'] ?? 'tunggakan';
            $tanggal = $queryParams['tanggal'] ?? null;
            $tahunAjaran = $queryParams['tahun_ajaran'] ?? null;
            $admin = $queryParams['admin'] ?? null;

            $where = [];
            $params = [];

            if ($pageMode === 'uwaba') {
                // Untuk mode UWABA, ambil data dari uwaba___bayar
                if ($tanggal) {
                    $where[] = 'DATE(h.masehi) = :tanggal';
                    $params['tanggal'] = $tanggal;
                }
                if ($tahunAjaran) {
                    $where[] = 'h.tahun_ajaran = :tahun_ajaran';
                    $params['tahun_ajaran'] = $tahunAjaran;
                }
                if ($admin) {
                    $where[] = 'h.admin = :admin';
                    $params['admin'] = $admin;
                }
                $whereSql = $where ? ('WHERE ' . implode(' AND ', $where)) : '';
                
                // Query untuk mengambil data pembayaran UWABA dari uwaba___bayar
                $sql = "SELECT h.id, h.id_santri, s.nis, s.nama AS nama_santri, NULL as id_kolom_referensi, h.nominal, h.via, h.hijriyah, h.masehi AS tanggal_dibuat, h.admin, 'UWABA' AS keterangan_1, h.tahun_ajaran 
                        FROM uwaba___bayar h 
                        JOIN santri s ON h.id_santri = s.id 
                        {$whereSql} 
                        ORDER BY h.masehi DESC";
                $stmt = $this->db->prepare($sql);
                $stmt->execute($params);
                $data = $stmt->fetchAll(\PDO::FETCH_ASSOC);
            } elseif ($pageMode === 'pendaftaran') {
                // Untuk mode Pendaftaran, ambil data dari psb___transaksi
                if ($tanggal) {
                    $where[] = 'DATE(t.tanggal_dibuat) = :tanggal';
                    $params['tanggal'] = $tanggal;
                }
                if ($tahunAjaran) {
                    // Filter berdasarkan tahun_hijriyah dari psb___registrasi
                    $where[] = 'r.tahun_hijriyah = :tahun_ajaran';
                    $params['tahun_ajaran'] = $tahunAjaran;
                }
                if ($admin) {
                    $where[] = 't.id_admin = :admin';
                    $params['admin'] = (int)$admin;
                }
                $whereSql = $where ? ('WHERE ' . implode(' AND ', $where)) : '';
                
                // Query untuk mengambil data pembayaran Pendaftaran dari psb___transaksi
                // Menggunakan LEFT JOIN untuk santri karena id_santri bisa null
                // JOIN dengan pengurus untuk mendapatkan nama admin
                $sql = "SELECT t.id, r.id_santri, s.nis, COALESCE(s.nama, CONCAT('Santri ID: ', r.id_santri)) AS nama_santri, t.id_registrasi as id_kolom_referensi, t.nominal, t.via, t.hijriyah, t.tanggal_dibuat, t.id_admin, p.nama AS admin, CONCAT('Pendaftaran - ', COALESCE(r.tahun_hijriyah, '')) AS keterangan_1, r.tahun_hijriyah AS tahun_ajaran 
                        FROM psb___transaksi t 
                        JOIN psb___registrasi r ON t.id_registrasi = r.id 
                        LEFT JOIN santri s ON r.id_santri = s.id 
                        LEFT JOIN pengurus p ON t.id_admin = p.id
                        {$whereSql} 
                        ORDER BY t.tanggal_dibuat DESC";
                $stmt = $this->db->prepare($sql);
                $stmt->execute($params);
                $data = $stmt->fetchAll(\PDO::FETCH_ASSOC);
            } else {
                // Untuk mode tunggakan dan khusus
                $tabelUtama = 'uwaba___tunggakan';
                $tabelBayar = 'uwaba___bayar_tunggakan';
                $idKolomReferensi = 'id_tunggakan';

                if ($pageMode === 'khusus') {
                    $tabelUtama = 'uwaba___khusus';
                    $tabelBayar = 'uwaba___bayar_khusus';
                    $idKolomReferensi = 'id_khusus';
                }

                if ($tanggal) {
                    $where[] = 'DATE(b.tanggal_dibuat) = :tanggal';
                    $params['tanggal'] = $tanggal;
                }
                if ($tahunAjaran) {
                    $where[] = 't.tahun_ajaran = :tahun_ajaran';
                    $params['tahun_ajaran'] = $tahunAjaran;
                }
                if ($admin) {
                    $where[] = 'b.admin = :admin';
                    $params['admin'] = $admin;
                }
                $whereSql = $where ? ('WHERE ' . implode(' AND ', $where)) : '';
                
                // Query untuk mengambil data pembayaran dengan keterangan1 dan tahun_ajaran
                $sql = "SELECT b.id, b.id_santri, s.nis, s.nama AS nama_santri, b.{$idKolomReferensi}, b.nominal, b.via, b.hijriyah, b.tanggal_dibuat, b.admin, t.keterangan_1, t.tahun_ajaran 
                        FROM {$tabelBayar} b 
                        JOIN santri s ON b.id_santri = s.id 
                        JOIN {$tabelUtama} t ON b.{$idKolomReferensi} = t.id 
                        {$whereSql} 
                        ORDER BY b.tanggal_dibuat DESC";
                $stmt = $this->db->prepare($sql);
                $stmt->execute($params);
                $data = $stmt->fetchAll(\PDO::FETCH_ASSOC);
            }

            // Format data untuk tampilan
            foreach ($data as &$row) {
                $row['nominal'] = 'Rp ' . number_format($row['nominal'], 0, ',', '.');
                $row['via'] = ViaPembayaranHelper::normalizeForDisplay(
                    isset($row['via']) && $row['via'] !== '' ? (string) $row['via'] : null
                );
                if (empty($row['keterangan_1'])) {
                    $row['keterangan_1'] = '-';
                }
                if (empty($row['tahun_ajaran'])) {
                    $row['tahun_ajaran'] = '-';
                }
            }

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => $data
            ], 200);

        } catch (\Exception $e) {
            error_log("Laporan error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil data laporan: ' . $e->getMessage()
            ], 500);
        }
    }
}

