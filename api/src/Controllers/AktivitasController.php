<?php

namespace App\Controllers;

use App\Database;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

class AktivitasController
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
     * GET /api/aktivitas - List aktivitas (pemasukan + pengeluaran) digabungkan dan diurutkan berdasarkan tanggal
     * Filter berdasarkan bulan dan tahun
     */
    public function getAktivitasList(Request $request, Response $response): Response
    {
        try {
            $queryParams = $request->getQueryParams();
            $bulan = isset($queryParams['bulan']) ? (int)$queryParams['bulan'] : (int)date('m');
            $tahun = isset($queryParams['tahun']) ? (int)$queryParams['tahun'] : (int)date('Y');

            // Query untuk menggabungkan pemasukan dan pengeluaran berdasarkan bulan
            $sql = "
                SELECT 
                    'pemasukan' as tipe,
                    p.id,
                    p.keterangan,
                    p.kategori,
                    NULL as lembaga,
                    p.nominal,
                    p.status as sumber_uang,
                    p.hijriyah,
                    p.tahun_ajaran,
                    p.tanggal_dibuat,
                    p.tanggal_update,
                    peng.nama as admin_nama,
                    NULL as id_admin_approve,
                    NULL as admin_approve_nama,
                    NULL as id_rencana
                FROM pemasukan p
                LEFT JOIN pengurus peng ON p.id_admin = peng.id
                WHERE YEAR(p.tanggal_dibuat) = ? AND MONTH(p.tanggal_dibuat) = ?
                
                UNION ALL
                
                SELECT 
                    'pengeluaran' as tipe,
                    pe.id,
                    pe.keterangan,
                    pe.kategori,
                    pe.lembaga,
                    pe.nominal,
                    pe.sumber_uang,
                    pe.hijriyah,
                    pe.tahun_ajaran,
                    pe.tanggal_dibuat,
                    pe.tanggal_update,
                    peng2.nama as admin_nama,
                    pe.id_admin_approve,
                    peng3.nama as admin_approve_nama,
                    pe.id_rencana
                FROM pengeluaran pe
                LEFT JOIN pengurus peng2 ON pe.id_admin = peng2.id
                LEFT JOIN pengurus peng3 ON pe.id_admin_approve = peng3.id
                WHERE YEAR(pe.tanggal_dibuat) = ? AND MONTH(pe.tanggal_dibuat) = ?
                
                ORDER BY tanggal_dibuat DESC
            ";

            $stmt = $this->db->prepare($sql);
            $stmt->execute([$tahun, $bulan, $tahun, $bulan]);
            $aktivitas = $stmt->fetchAll(\PDO::FETCH_ASSOC);

            // Hitung saldo saat masuk bulan ini (saldo akhir bulan sebelumnya)
            $sqlSaldoAwal = "
                SELECT 
                    COALESCE(SUM(CASE WHEN tipe = 'pemasukan' THEN nominal ELSE 0 END), 0) - 
                    COALESCE(SUM(CASE WHEN tipe = 'pengeluaran' THEN nominal ELSE 0 END), 0) as saldo_awal
                FROM (
                    SELECT 'pemasukan' as tipe, nominal, tanggal_dibuat FROM pemasukan
                    UNION ALL
                    SELECT 'pengeluaran' as tipe, nominal, tanggal_dibuat FROM pengeluaran
                ) as combined
                WHERE DATE(tanggal_dibuat) < DATE(?) 
            ";
            $tanggalAwalBulan = sprintf('%04d-%02d-01', $tahun, $bulan);
            $stmtSaldoAwal = $this->db->prepare($sqlSaldoAwal);
            $stmtSaldoAwal->execute([$tanggalAwalBulan]);
            $saldoAwal = $stmtSaldoAwal->fetch(\PDO::FETCH_ASSOC)['saldo_awal'] ?? 0;

            // Hitung total pemasukan bulan ini
            $sqlPemasukan = "
                SELECT COALESCE(SUM(nominal), 0) as total 
                FROM pemasukan 
                WHERE YEAR(tanggal_dibuat) = ? AND MONTH(tanggal_dibuat) = ?
            ";
            $stmtPemasukan = $this->db->prepare($sqlPemasukan);
            $stmtPemasukan->execute([$tahun, $bulan]);
            $totalPemasukan = floatval($stmtPemasukan->fetch(\PDO::FETCH_ASSOC)['total'] ?? 0);

            // Hitung total pengeluaran bulan ini
            $sqlPengeluaran = "
                SELECT COALESCE(SUM(nominal), 0) as total 
                FROM pengeluaran 
                WHERE YEAR(tanggal_dibuat) = ? AND MONTH(tanggal_dibuat) = ?
            ";
            $stmtPengeluaran = $this->db->prepare($sqlPengeluaran);
            $stmtPengeluaran->execute([$tahun, $bulan]);
            $totalPengeluaran = floatval($stmtPengeluaran->fetch(\PDO::FETCH_ASSOC)['total'] ?? 0);

            // Sisa saldo = saldo awal + pemasukan - pengeluaran
            $sisaSaldo = $saldoAwal + $totalPemasukan - $totalPengeluaran;

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => [
                    'aktivitas' => $aktivitas,
                    'saldo' => [
                        'saldo_awal' => $saldoAwal,
                        'pemasukan' => $totalPemasukan,
                        'pengeluaran' => $totalPengeluaran,
                        'sisa_saldo' => $sisaSaldo
                    ],
                    'bulan' => $bulan,
                    'tahun' => $tahun
                ]
            ], 200);

        } catch (\Exception $e) {
            error_log("Get aktivitas list error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil daftar aktivitas: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * GET /api/aktivitas/months - Get list of available months
     */
    public function getAvailableMonths(Request $request, Response $response): Response
    {
        try {
            // Get all unique months from pemasukan and pengeluaran
            $sql = "
                SELECT DISTINCT 
                    YEAR(tanggal_dibuat) as tahun,
                    MONTH(tanggal_dibuat) as bulan,
                    DATE_FORMAT(tanggal_dibuat, '%Y-%m') as bulan_tahun
                FROM (
                    SELECT tanggal_dibuat FROM pemasukan
                    UNION ALL
                    SELECT tanggal_dibuat FROM pengeluaran
                ) as combined
                ORDER BY tahun ASC, bulan ASC
            ";

            $stmt = $this->db->prepare($sql);
            $stmt->execute();
            $months = $stmt->fetchAll(\PDO::FETCH_ASSOC);

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => $months
            ], 200);

        } catch (\Exception $e) {
            error_log("Get available months error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil daftar bulan: ' . $e->getMessage(),
                'data' => []
            ], 500);
        }
    }

    /**
     * GET /api/aktivitas/hijriyah - List aktivitas berdasarkan bulan hijriyah
     * Filter berdasarkan bulan dan tahun hijriyah (format: 1447-12-23)
     */
    public function getAktivitasListHijriyah(Request $request, Response $response): Response
    {
        try {
            $queryParams = $request->getQueryParams();
            $bulanHijriyah = isset($queryParams['bulan']) ? (int)$queryParams['bulan'] : null;
            $tahunHijriyah = isset($queryParams['tahun']) ? (int)$queryParams['tahun'] : null;

            if ($bulanHijriyah === null || $tahunHijriyah === null) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Bulan dan tahun hijriyah harus diisi'
                ], 400);
            }

            // Format pattern untuk hijriyah: YYYY-MM-DD atau YYYY-MM-DD HH.MM.SS
            // Ambil 10 karakter pertama untuk mendapatkan YYYY-MM-DD
            $hijriyahPattern = sprintf('%04d-%02d', $tahunHijriyah, $bulanHijriyah);

            // Query untuk menggabungkan pemasukan dan pengeluaran berdasarkan bulan hijriyah
            $sql = "
                SELECT 
                    'pemasukan' as tipe,
                    p.id,
                    p.keterangan,
                    p.kategori,
                    NULL as lembaga,
                    p.nominal,
                    p.status as sumber_uang,
                    p.hijriyah,
                    p.tahun_ajaran,
                    p.tanggal_dibuat,
                    p.tanggal_update,
                    peng.nama as admin_nama,
                    NULL as id_admin_approve,
                    NULL as admin_approve_nama,
                    NULL as id_rencana
                FROM pemasukan p
                LEFT JOIN pengurus peng ON p.id_admin = peng.id
                WHERE p.hijriyah IS NOT NULL 
                    AND p.hijriyah != ''
                    AND LEFT(p.hijriyah, 7) = ?
                
                UNION ALL
                
                SELECT 
                    'pengeluaran' as tipe,
                    pe.id,
                    pe.keterangan,
                    pe.kategori,
                    pe.lembaga,
                    pe.nominal,
                    pe.sumber_uang,
                    pe.hijriyah,
                    pe.tahun_ajaran,
                    pe.tanggal_dibuat,
                    pe.tanggal_update,
                    peng2.nama as admin_nama,
                    pe.id_admin_approve,
                    peng3.nama as admin_approve_nama,
                    pe.id_rencana
                FROM pengeluaran pe
                LEFT JOIN pengurus peng2 ON pe.id_admin = peng2.id
                LEFT JOIN pengurus peng3 ON pe.id_admin_approve = peng3.id
                WHERE pe.hijriyah IS NOT NULL 
                    AND pe.hijriyah != ''
                    AND LEFT(pe.hijriyah, 7) = ?
                
                ORDER BY tanggal_dibuat DESC
            ";

            $stmt = $this->db->prepare($sql);
            $stmt->execute([$hijriyahPattern, $hijriyahPattern]);
            $aktivitas = $stmt->fetchAll(\PDO::FETCH_ASSOC);

            // Hitung saldo saat masuk bulan ini (saldo akhir bulan sebelumnya)
            // Untuk hijriyah, kita hitung berdasarkan tanggal_dibuat yang sesuai dengan hijriyah
            $sqlSaldoAwal = "
                SELECT 
                    COALESCE(SUM(CASE WHEN tipe = 'pemasukan' THEN nominal ELSE 0 END), 0) - 
                    COALESCE(SUM(CASE WHEN tipe = 'pengeluaran' THEN nominal ELSE 0 END), 0) as saldo_awal
                FROM (
                    SELECT 'pemasukan' as tipe, nominal, hijriyah, tanggal_dibuat 
                    FROM pemasukan 
                    WHERE hijriyah IS NOT NULL AND hijriyah != '' AND LEFT(hijriyah, 7) < ?
                    UNION ALL
                    SELECT 'pengeluaran' as tipe, nominal, hijriyah, tanggal_dibuat 
                    FROM pengeluaran 
                    WHERE hijriyah IS NOT NULL AND hijriyah != '' AND LEFT(hijriyah, 7) < ?
                ) as combined
            ";
            $stmtSaldoAwal = $this->db->prepare($sqlSaldoAwal);
            $stmtSaldoAwal->execute([$hijriyahPattern, $hijriyahPattern]);
            $saldoAwal = $stmtSaldoAwal->fetch(\PDO::FETCH_ASSOC)['saldo_awal'] ?? 0;

            // Hitung total pemasukan bulan ini
            $sqlPemasukan = "
                SELECT COALESCE(SUM(nominal), 0) as total 
                FROM pemasukan 
                WHERE hijriyah IS NOT NULL 
                    AND hijriyah != ''
                    AND LEFT(hijriyah, 7) = ?
            ";
            $stmtPemasukan = $this->db->prepare($sqlPemasukan);
            $stmtPemasukan->execute([$hijriyahPattern]);
            $totalPemasukan = floatval($stmtPemasukan->fetch(\PDO::FETCH_ASSOC)['total'] ?? 0);

            // Hitung total pengeluaran bulan ini
            $sqlPengeluaran = "
                SELECT COALESCE(SUM(nominal), 0) as total 
                FROM pengeluaran 
                WHERE hijriyah IS NOT NULL 
                    AND hijriyah != ''
                    AND LEFT(hijriyah, 7) = ?
            ";
            $stmtPengeluaran = $this->db->prepare($sqlPengeluaran);
            $stmtPengeluaran->execute([$hijriyahPattern]);
            $totalPengeluaran = floatval($stmtPengeluaran->fetch(\PDO::FETCH_ASSOC)['total'] ?? 0);

            // Sisa saldo = saldo awal + pemasukan - pengeluaran
            $sisaSaldo = $saldoAwal + $totalPemasukan - $totalPengeluaran;

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => [
                    'aktivitas' => $aktivitas,
                    'saldo' => [
                        'saldo_awal' => $saldoAwal,
                        'pemasukan' => $totalPemasukan,
                        'pengeluaran' => $totalPengeluaran,
                        'sisa_saldo' => $sisaSaldo
                    ],
                    'bulan' => $bulanHijriyah,
                    'tahun' => $tahunHijriyah
                ]
            ], 200);

        } catch (\Exception $e) {
            error_log("Get aktivitas list hijriyah error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil daftar aktivitas hijriyah: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * GET /api/aktivitas/hijriyah/months - Get list of available hijriyah months
     */
    public function getAvailableHijriyahMonths(Request $request, Response $response): Response
    {
        try {
            // Get all unique hijriyah months from pemasukan and pengeluaran
            // Ambil 7 karakter pertama (YYYY-MM) dari hijriyah
            $sql = "
                SELECT DISTINCT 
                    CAST(SUBSTRING(hijriyah, 1, 4) AS UNSIGNED) as tahun,
                    CAST(SUBSTRING(hijriyah, 6, 2) AS UNSIGNED) as bulan,
                    LEFT(hijriyah, 7) as bulan_tahun
                FROM (
                    SELECT hijriyah FROM pemasukan WHERE hijriyah IS NOT NULL AND hijriyah != ''
                    UNION ALL
                    SELECT hijriyah FROM pengeluaran WHERE hijriyah IS NOT NULL AND hijriyah != ''
                ) as combined
                WHERE LENGTH(hijriyah) >= 7
                ORDER BY tahun ASC, bulan ASC
            ";

            $stmt = $this->db->prepare($sql);
            $stmt->execute();
            $months = $stmt->fetchAll(\PDO::FETCH_ASSOC);

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => $months
            ], 200);

        } catch (\Exception $e) {
            error_log("Get available hijriyah months error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil daftar bulan hijriyah: ' . $e->getMessage(),
                'data' => []
            ], 500);
        }
    }
}

