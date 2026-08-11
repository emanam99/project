<?php

namespace App\Controllers;

use App\Database;
use App\Helpers\RoleHelper;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

class ProfilController
{
    private $db;

    public function __construct()
    {
        $this->db = Database::getInstance()->getConnection();
    }

    public function totalPembayaranHariIni(Request $request, Response $response): Response
    {
        try {
            $idAdmin = $request->getQueryParams()['id_admin'] ?? null;
            
            if (!$idAdmin) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'id_admin tidak valid',
                    'total' => 0
                ], 400);
            }

            $idAdmin = intval($idAdmin);
            $u = $request->getAttribute('user');
            $uArr = is_array($u) ? $u : [];
            if (!$this->canQueryTotalPembayaranForAdmin($uArr, $idAdmin)) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Akses ditolak',
                    'total' => 0,
                ], 403);
            }
            // Gunakan CURDATE() langsung dari MySQL untuk memastikan konsistensi dengan timezone database
            // Timezone sudah di-set ke Asia/Jakarta (WIB) di Database.php dan index.php

            // Hitung total untuk admin tertentu
            $totalUwaba = $this->getTotalFromTable('uwaba___bayar', $idAdmin, 'masehi');
            $totalTunggakan = $this->getTotalFromTable('uwaba___bayar_tunggakan', $idAdmin, 'tanggal_dibuat');
            $totalKhusus = $this->getTotalFromTable('uwaba___bayar_khusus', $idAdmin, 'tanggal_dibuat');
            $totalSemua = $totalUwaba + $totalTunggakan + $totalKhusus;

            // Hitung breakdown by via untuk admin tertentu
            $viaUwaba = $this->getTotalByViaFromTable('uwaba___bayar', $idAdmin, 'masehi');
            $viaTunggakan = $this->getTotalByViaFromTable('uwaba___bayar_tunggakan', $idAdmin, 'tanggal_dibuat');
            $viaKhusus = $this->getTotalByViaFromTable('uwaba___bayar_khusus', $idAdmin, 'tanggal_dibuat');

            // Hitung total keseluruhan (tanpa filter id_admin)
            $totalUwabaSemua = $this->getTotalFromTable('uwaba___bayar', null, 'masehi');
            $totalTunggakanSemua = $this->getTotalFromTable('uwaba___bayar_tunggakan', null, 'tanggal_dibuat');
            $totalKhususSemua = $this->getTotalFromTable('uwaba___bayar_khusus', null, 'tanggal_dibuat');
            $totalSemuaKeseluruhan = $totalUwabaSemua + $totalTunggakanSemua + $totalKhususSemua;

            return $this->jsonResponse($response, [
                'success' => true,
                'total' => $totalSemua,
                'total_keseluruhan' => $totalSemuaKeseluruhan,
                'detail' => [
                    'uwaba' => $totalUwaba,
                    'tunggakan' => $totalTunggakan,
                    'khusus' => $totalKhusus
                ],
                'detail_via' => [
                    'uwaba' => $viaUwaba,
                    'tunggakan' => $viaTunggakan,
                    'khusus' => $viaKhusus
                ],
                'detail_keseluruhan' => [
                    'uwaba' => $totalUwabaSemua,
                    'tunggakan' => $totalTunggakanSemua,
                    'khusus' => $totalKhususSemua
                ]
            ], 200);

        } catch (\PDOException $e) {
            error_log("Total pembayaran PDO error: " . $e->getMessage());
            error_log("Error code: " . $e->getCode());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal menghitung total pembayaran',
                'total' => 0
            ], 500);
        } catch (\Exception $e) {
            error_log("Total pembayaran error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal menghitung total pembayaran',
                'total' => 0
            ], 500);
        }
    }

    /**
     * Hanya super_admin (token atau DB) yang boleh melihat total untuk id_admin lain; selain itu hanya data sendiri (pengurus.id).
     */
    private function canQueryTotalPembayaranForAdmin(array $uArr, int $requestedAdminId): bool
    {
        if (RoleHelper::tokenHasAnyRoleKey($uArr, ['super_admin'])) {
            return true;
        }
        $pid = RoleHelper::getPengurusIdFromPayload($uArr);
        if ($pid !== null && $pid > 0 && RoleHelper::pengurusHasSuperAdminRole($pid)) {
            return true;
        }
        $tokenAdminId = isset($uArr['user_id']) ? (int) $uArr['user_id'] : (int) ($uArr['id'] ?? 0);

        return $tokenAdminId > 0 && $tokenAdminId === $requestedAdminId;
    }

    private function getTotalFromTable(string $table, ?int $idAdmin, string $dateColumn): float
    {
        try {
            // Gunakan CURDATE() dari MySQL untuk memastikan menggunakan tanggal hari ini sesuai timezone database
            // Ini lebih akurat daripada menggunakan date() dari PHP yang mungkin berbeda timezone
            if ($idAdmin !== null) {
                // Query dengan filter id_admin
                if ($table === 'uwaba___bayar') {
                    $stmt = $this->db->prepare("
                        SELECT COALESCE(SUM(nominal), 0) as total 
                        FROM {$table} 
                        WHERE id_admin = ? 
                        AND DATE({$dateColumn}) = CURDATE()
                    ");
                    $stmt->execute([$idAdmin]);
                } else {
                    $stmt = $this->db->prepare("
                        SELECT COALESCE(SUM(nominal), 0) as total 
                        FROM {$table} 
                        WHERE id_admin = ? 
                        AND DATE({$dateColumn}) = CURDATE()
                    ");
                    $stmt->execute([$idAdmin]);
                }
            } else {
                // Query tanpa filter id_admin (untuk total keseluruhan)
                $stmt = $this->db->prepare("
                    SELECT COALESCE(SUM(nominal), 0) as total 
                    FROM {$table} 
                    WHERE DATE({$dateColumn}) = CURDATE()
                ");
                $stmt->execute();
            }

            $result = $stmt->fetch(\PDO::FETCH_ASSOC);
            return floatval($result['total'] ?? 0);
        } catch (\PDOException $e) {
            // Jika tabel tidak ada, return 0 tanpa log error (tabel mungkin belum dibuat)
            if ($e->getCode() == '42S02' || strpos($e->getMessage(), "doesn't exist") !== false) {
                return 0;
            }
            error_log("Error calculating total from {$table}: " . $e->getMessage());
            error_log("Error code: " . $e->getCode());
            return 0;
        } catch (\Exception $e) {
            error_log("Error calculating total from {$table}: " . $e->getMessage());
            return 0;
        }
    }

    /**
     * Get total breakdown by via (payment method) for a specific admin
     * Returns array with via as key and total as value
     */
    private function getTotalByViaFromTable(string $table, int $idAdmin, string $dateColumn): array
    {
        try {
            $stmt = $this->db->prepare("
                SELECT 
                    COALESCE(via, 'Cash') as via,
                    COALESCE(SUM(nominal), 0) as total 
                FROM {$table} 
                WHERE id_admin = ? 
                AND DATE({$dateColumn}) = CURDATE()
                GROUP BY via
                ORDER BY via
            ");
            $stmt->execute([$idAdmin]);

            $result = [];
            while ($row = $stmt->fetch(\PDO::FETCH_ASSOC)) {
                $via = $row['via'] ?? 'Cash';
                $result[$via] = floatval($row['total'] ?? 0);
            }

            return $result;
        } catch (\PDOException $e) {
            // Jika tabel tidak ada, return array kosong tanpa log error
            if ($e->getCode() == '42S02' || strpos($e->getMessage(), "doesn't exist") !== false) {
                return [];
            }
            error_log("Error calculating total by via from {$table}: " . $e->getMessage());
            error_log("Error code: " . $e->getCode());
            return [];
        } catch (\Exception $e) {
            error_log("Error calculating total by via from {$table}: " . $e->getMessage());
            return [];
        }
    }

    public function totalPemasukanPengeluaranHariIni(Request $request, Response $response): Response
    {
        try {
            $queryParams = $request->getQueryParams();
            $tahunAjaran = $queryParams['tahun_ajaran'] ?? null;

            // Hitung saldo awal tahun (dari tahun ajaran sebelumnya)
            $saldoAwalTahun = 0;
            if ($tahunAjaran) {
                // Parse tahun ajaran hijriyah (format: "1445-1446")
                $parts = explode('-', $tahunAjaran);
                if (count($parts) === 2) {
                    $startYear = intval($parts[0]);
                    $prevStartYear = $startYear - 1;
                    $prevEndYear = $startYear;
                    $prevTahunAjaran = sprintf('%d-%d', $prevStartYear, $prevEndYear);

                    // Hitung total pemasukan tahun ajaran sebelumnya
                    $stmtPemasukanPrev = $this->db->prepare("
                        SELECT COALESCE(SUM(nominal), 0) as total 
                        FROM pemasukan
                        WHERE tahun_ajaran = ?
                    ");
                    $stmtPemasukanPrev->execute([$prevTahunAjaran]);
                    $resultPemasukanPrev = $stmtPemasukanPrev->fetch(\PDO::FETCH_ASSOC);
                    $totalPemasukanPrev = floatval($resultPemasukanPrev['total'] ?? 0);

                    // Hitung total pengeluaran tahun ajaran sebelumnya
                    $stmtPengeluaranPrev = $this->db->prepare("
                        SELECT COALESCE(SUM(nominal), 0) as total 
                        FROM pengeluaran
                        WHERE tahun_ajaran = ?
                    ");
                    $stmtPengeluaranPrev->execute([$prevTahunAjaran]);
                    $resultPengeluaranPrev = $stmtPengeluaranPrev->fetch(\PDO::FETCH_ASSOC);
                    $totalPengeluaranPrev = floatval($resultPengeluaranPrev['total'] ?? 0);

                    $saldoAwalTahun = $totalPemasukanPrev - $totalPengeluaranPrev;
                }
            }

            // Filter berdasarkan tahun ajaran jika parameter ada
            if ($tahunAjaran) {
                // Hitung total pemasukan untuk tahun ajaran tertentu
                $stmtPemasukan = $this->db->prepare("
                    SELECT COALESCE(SUM(nominal), 0) as total 
                    FROM pemasukan
                    WHERE tahun_ajaran = ?
                ");
                $stmtPemasukan->execute([$tahunAjaran]);
                $resultPemasukan = $stmtPemasukan->fetch(\PDO::FETCH_ASSOC);
                $totalPemasukan = floatval($resultPemasukan['total'] ?? 0);

                // Hitung total pengeluaran untuk tahun ajaran tertentu
                $stmtPengeluaran = $this->db->prepare("
                    SELECT COALESCE(SUM(nominal), 0) as total 
                    FROM pengeluaran
                    WHERE tahun_ajaran = ?
                ");
                $stmtPengeluaran->execute([$tahunAjaran]);
                $resultPengeluaran = $stmtPengeluaran->fetch(\PDO::FETCH_ASSOC);
                $totalPengeluaran = floatval($resultPengeluaran['total'] ?? 0);
            } else {
                // Hitung total pemasukan keseluruhan (semua waktu)
                $stmtPemasukan = $this->db->prepare("
                    SELECT COALESCE(SUM(nominal), 0) as total 
                    FROM pemasukan
                ");
                $stmtPemasukan->execute();
                $resultPemasukan = $stmtPemasukan->fetch(\PDO::FETCH_ASSOC);
                $totalPemasukan = floatval($resultPemasukan['total'] ?? 0);

                // Hitung total pengeluaran keseluruhan (semua waktu)
                $stmtPengeluaran = $this->db->prepare("
                    SELECT COALESCE(SUM(nominal), 0) as total 
                    FROM pengeluaran
                ");
                $stmtPengeluaran->execute();
                $resultPengeluaran = $stmtPengeluaran->fetch(\PDO::FETCH_ASSOC);
                $totalPengeluaran = floatval($resultPengeluaran['total'] ?? 0);
            }

            // Hitung sisa saldo = saldo awal tahun + pemasukan - pengeluaran
            $sisaSaldo = $saldoAwalTahun + $totalPemasukan - $totalPengeluaran;

            return $this->jsonResponse($response, [
                'success' => true,
                'saldo_awal_tahun' => $saldoAwalTahun,
                'total_pemasukan' => $totalPemasukan,
                'total_pengeluaran' => $totalPengeluaran,
                'sisa_saldo' => $sisaSaldo
            ], 200);

        } catch (\Exception $e) {
            error_log("Total pemasukan pengeluaran error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Error calculating total pemasukan dan pengeluaran',
                'saldo_awal_tahun' => 0,
                'total_pemasukan' => 0,
                'total_pengeluaran' => 0,
                'sisa_saldo' => 0
            ], 500);
        }
    }

    private function jsonResponse(Response $response, array $data, int $statusCode): Response
    {
        $response->getBody()->write(json_encode($data));
        return $response
            ->withStatus($statusCode)
            ->withHeader('Content-Type', 'application/json');
    }
}

