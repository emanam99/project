<?php

namespace App\Controllers;

use App\Database;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

class DashboardController
{
    private $db;

    public function __construct()
    {
        $this->db = Database::getInstance()->getConnection();
    }

    public function getDashboard(Request $request, Response $response): Response
    {
        try {
            $queryParams = $request->getQueryParams();
            $groupBy = $queryParams['group_by'] ?? 'keterangan_1';
            $tahunAjaran = $queryParams['tahun_ajaran'] ?? null; // Tahun hijriyah
            $tahunAjaranMasehi = $queryParams['tahun_ajaran_masehi'] ?? null; // Tahun masehi
            $allowedGroup = ['keterangan_1', 'lembaga', 'tahun_ajaran', 'keterangan_2'];
            
            if (!in_array($groupBy, $allowedGroup)) {
                $groupBy = 'keterangan_1';
            }

            // Total santri
            $totalSantri = $this->getTotalSantri();
            
            // Total pengurus
            $totalPengurus = $this->getTotalPengurus();
            
            // Total tunggakan, bayar, kurang (filter hijriyah OR masehi)
            try {
                $tunggakanData = $this->getTunggakanData($tahunAjaran, $tahunAjaranMasehi);
            } catch (\Exception $e) {
                error_log("Error getTunggakanData: " . $e->getMessage());
                $tunggakanData = ['total' => 0, 'total_bayar' => 0, 'total_kurang' => 0];
            }
            
            // Total khusus, bayar khusus, kurang khusus (filter hijriyah OR masehi)
            try {
                $khususData = $this->getKhususData($tahunAjaran, $tahunAjaranMasehi);
            } catch (\Exception $e) {
                error_log("Error getKhususData: " . $e->getMessage());
                $khususData = ['total' => 0, 'total_bayar' => 0, 'total_kurang' => 0];
            }
            
            // Pembayaran per bulan (12 bulan terakhir)
            try {
            $perBulan = $this->getPembayaranPerBulan();
            } catch (\Exception $e) {
                error_log("Error getPembayaranPerBulan: " . $e->getMessage());
                $perBulan = ['labels' => [], 'data' => []];
            }
            
            // Komposisi santri berdasarkan status_santri dengan breakdown gender
            try {
            $komposisiStatus = $this->getKomposisiStatus();
            } catch (\Exception $e) {
                error_log("Error getKomposisiStatus: " . $e->getMessage());
                $komposisiStatus = [];
            }
            
            // Komposisi santri berdasarkan gender
            try {
            $komposisiGender = $this->getKomposisiGender();
            } catch (\Exception $e) {
                error_log("Error getKomposisiGender: " . $e->getMessage());
                $komposisiGender = [];
            }
            
            // Komposisi santri berdasarkan kategori
            try {
            $komposisiKategori = $this->getKomposisiKategori();
            } catch (\Exception $e) {
                error_log("Error getKomposisiKategori: " . $e->getMessage());
                $komposisiKategori = [];
            }
            
            // Pembayaran Uwaba per Hari (15 hari terakhir)
            try {
            $uwabaPerHari = $this->getUwabaPerHari();
            } catch (\Exception $e) {
                error_log("Error getUwabaPerHari: " . $e->getMessage());
                $uwabaPerHari = ['labels' => [], 'data' => []];
            }
            
            // Data UWABA (total wajib, bayar, kurang)
            try {
                $uwabaData = $this->getUwabaData($tahunAjaran);
            } catch (\Exception $e) {
                error_log("Error getUwabaData: " . $e->getMessage());
                $uwabaData = ['total' => 0, 'total_bayar' => 0, 'total_kurang' => 0];
            }
            
            // Data UWABA per bulan
            try {
                $uwabaPerBulan = $this->getUwabaPerBulan($tahunAjaran);
            } catch (\Exception $e) {
                error_log("Error getUwabaPerBulan: " . $e->getMessage());
                $uwabaPerBulan = [];
            }
            
            // Kelompok total keuangan berdasarkan group_by (filter hijriyah OR masehi)
            try {
                $kelompokTunggakan = $this->getKelompokTunggakan($groupBy, $tahunAjaran, $tahunAjaranMasehi);
            } catch (\Exception $e) {
                error_log("Error getKelompokTunggakan: " . $e->getMessage());
                $kelompokTunggakan = [];
            }
            
            try {
                $kelompokKhusus = $this->getKelompokKhusus($groupBy, $tahunAjaran, $tahunAjaranMasehi);
            } catch (\Exception $e) {
                error_log("Error getKelompokKhusus: " . $e->getMessage());
                $kelompokKhusus = [];
            }

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => [
                    'total_santri' => $totalSantri,
                    'total_pengurus' => $totalPengurus,
                    'total_tunggakan' => $tunggakanData['total'],
                    'total_bayar' => $tunggakanData['total_bayar'],
                    'total_kurang' => $tunggakanData['total_kurang'],
                    'total_khusus' => $khususData['total'],
                    'total_bayar_khusus' => $khususData['total_bayar'],
                    'total_kurang_khusus' => $khususData['total_kurang'],
                    'total_uwaba' => $uwabaData['total'],
                    'total_bayar_uwaba' => $uwabaData['total_bayar'],
                    'total_kurang_uwaba' => $uwabaData['total_kurang'],
                    'uwaba_per_bulan' => $uwabaPerBulan,
                    'per_bulan' => $perBulan,
                    'komposisi_status' => $komposisiStatus,
                    'komposisi_gender' => $komposisiGender,
                    'komposisi_kategori' => $komposisiKategori,
                    'uwaba_per_hari' => $uwabaPerHari,
                    'kelompok_tunggakan' => $kelompokTunggakan,
                    'kelompok_khusus' => $kelompokKhusus
                ]
            ], 200);

        } catch (\Exception $e) {
            error_log("Dashboard error: " . $e->getMessage());
            error_log("Dashboard error trace: " . $e->getTraceAsString());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Error: ' . $e->getMessage(),
                'trace' => $e->getTraceAsString()
            ], 500);
        }
    }

    public function getKelompokDetail(Request $request, Response $response): Response
    {
        try {
            $queryParams = $request->getQueryParams();
            $groupBy = $queryParams['group_by'] ?? 'keterangan_1';
            $groupValue = $queryParams['group_value'] ?? null;
            $tipe = $queryParams['tipe'] ?? 'tunggakan';
            
            if (!$groupValue) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Parameter group_value wajib diisi'
                ], 400);
            }

            $allowedGroup = ['keterangan_1', 'lembaga', 'tahun_ajaran', 'keterangan_2'];
            if (!in_array($groupBy, $allowedGroup)) {
                $groupBy = 'keterangan_1';
            }

            if ($tipe === 'tunggakan') {
                $sql = "SELECT t.id as id, t.id_santri, s.nama, t.tahun_ajaran, t.lembaga, t.keterangan_1, t.wajib as total_tunggakan, COALESCE((SELECT SUM(b.nominal) FROM uwaba___bayar_tunggakan b WHERE b.id_tunggakan = t.id),0) as total_bayar FROM uwaba___tunggakan t JOIN santri s ON t.id_santri = s.id WHERE TRIM(LOWER(t.$groupBy)) = TRIM(LOWER(?))";
            } else {
                $sql = "SELECT k.id as id, k.id_santri, s.nama, k.tahun_ajaran, k.lembaga, k.keterangan_1, k.wajib as total_tunggakan, COALESCE((SELECT SUM(b.nominal) FROM uwaba___bayar_khusus b WHERE b.id_khusus = k.id),0) as total_bayar FROM uwaba___khusus k JOIN santri s ON k.id_santri = s.id WHERE TRIM(LOWER(k.$groupBy)) = TRIM(LOWER(?))";
            }

            $stmt = $this->db->prepare($sql);
            $stmt->execute([$groupValue]);
            $data = $stmt->fetchAll(\PDO::FETCH_ASSOC);

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => $data
            ], 200);

        } catch (\Exception $e) {
            error_log("Kelompok detail error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Error: ' . $e->getMessage()
            ], 500);
        }
    }

    public function updateKelompokKeterangan(Request $request, Response $response): Response
    {
        try {
            $data = $request->getParsedBody();
            
            $tipe = $data['tipe'] ?? '';
            $groupBy = $data['group_by'] ?? 'keterangan_1';
            $newValue = $data['new_value'] ?? '';
            $oldKeterangan1 = $data['old_keterangan_1'] ?? '';
            $ids = $data['id'] ?? null;

            if (!$tipe || !$newValue || !$groupBy) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Parameter tidak lengkap'
                ], 400);
            }

            if (empty($ids) && !$oldKeterangan1) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Parameter tidak lengkap (old_keterangan_1 wajib jika tanpa id)'
                ], 400);
            }

            $allowedGroup = ['keterangan_1', 'lembaga', 'tahun_ajaran', 'keterangan_2'];
            if (!in_array($groupBy, $allowedGroup)) {
                $groupBy = 'keterangan_1';
            }

            $table = $tipe === 'tunggakan' ? 'uwaba___tunggakan' : 'uwaba___khusus';

            if (!empty($ids)) {
                $idsArray = is_string($ids) ? json_decode($ids, true) : $ids;
                if (!is_array($idsArray) || count($idsArray) === 0) {
                    return $this->jsonResponse($response, [
                        'success' => false,
                        'message' => 'ID data tidak ditemukan.'
                    ], 400);
                }
                $in = implode(',', array_fill(0, count($idsArray), '?'));
                $sql = "UPDATE $table SET `$groupBy` = ? WHERE id IN ($in)";
                $params = array_merge([$newValue], $idsArray);
                $stmt = $this->db->prepare($sql);
                $stmt->execute($params);
            } else {
                $sql = "UPDATE $table SET `$groupBy` = ? WHERE TRIM(LOWER($groupBy)) = TRIM(LOWER(?))";
                $stmt = $this->db->prepare($sql);
                $stmt->execute([$newValue, $oldKeterangan1]);
            }

            return $this->jsonResponse($response, [
                'success' => true
            ], 200);

        } catch (\Exception $e) {
            error_log("Update kelompok error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal update database: ' . $e->getMessage()
            ], 500);
        }
    }

    private function getTotalSantri(): int
    {
        $stmt = $this->db->query("SELECT COUNT(*) as total FROM santri WHERE status_santri IN ('mukim','khoriji')");
        $row = $stmt->fetch(\PDO::FETCH_ASSOC);
        return (int)($row['total'] ?? 0);
    }

    private function getTotalPengurus(): int
    {
        $stmt = $this->db->query("SELECT COUNT(*) as total FROM pengurus");
        $row = $stmt->fetch(\PDO::FETCH_ASSOC);
        return (int)($row['total'] ?? 0);
    }

    private function getTunggakanData($tahunAjaran = null, $tahunAjaranMasehi = null): array
    {
        // Filter berdasarkan tahun_ajaran hijriyah OR tahun_ajaran masehi
        $whereConditions = [];
        $params = [];
        
        if ($tahunAjaran && $tahunAjaranMasehi) {
            $whereConditions[] = "(tahun_ajaran = ? OR tahun_ajaran = ?)";
            $params[] = $tahunAjaran;
            $params[] = $tahunAjaranMasehi;
        } elseif ($tahunAjaran) {
            $whereConditions[] = "tahun_ajaran = ?";
            $params[] = $tahunAjaran;
        } elseif ($tahunAjaranMasehi) {
            $whereConditions[] = "tahun_ajaran = ?";
            $params[] = $tahunAjaranMasehi;
        }
        
        $whereSql = count($whereConditions) > 0 ? "WHERE " . $whereConditions[0] : "";
        
        $stmt = $this->db->prepare("SELECT SUM(wajib) as total FROM uwaba___tunggakan $whereSql");
        if (count($params) > 0) {
            $stmt->execute($params);
        } else {
            $stmt->execute();
        }
        $tunggakan = $stmt->fetch(\PDO::FETCH_ASSOC);
        $totalTunggakan = (int)($tunggakan['total'] ?? 0);

        // Query untuk total bayar
        if (count($whereConditions) > 0) {
            $stmt = $this->db->prepare("
                SELECT COALESCE(SUM(bt.nominal),0) as total_bayar 
                FROM uwaba___bayar_tunggakan bt
                INNER JOIN uwaba___tunggakan t ON bt.id_tunggakan = t.id
                WHERE $whereConditions[0]
            ");
            $stmt->execute($params);
        } else {
        $stmt = $this->db->query("SELECT COALESCE(SUM(nominal),0) as total_bayar FROM uwaba___bayar_tunggakan");
        }
        $bayarTunggakan = $stmt->fetch(\PDO::FETCH_ASSOC);
        $totalBayar = (int)($bayarTunggakan['total_bayar'] ?? 0);
        $totalKurang = $totalTunggakan - $totalBayar;

        return [
            'total' => $totalTunggakan,
            'total_bayar' => $totalBayar,
            'total_kurang' => $totalKurang
        ];
    }

    private function getKhususData($tahunAjaran = null, $tahunAjaranMasehi = null): array
    {
        // Filter berdasarkan tahun_ajaran hijriyah OR tahun_ajaran masehi
        $whereConditions = [];
        $params = [];
        
        if ($tahunAjaran && $tahunAjaranMasehi) {
            $whereConditions[] = "(tahun_ajaran = ? OR tahun_ajaran = ?)";
            $params[] = $tahunAjaran;
            $params[] = $tahunAjaranMasehi;
        } elseif ($tahunAjaran) {
            $whereConditions[] = "tahun_ajaran = ?";
            $params[] = $tahunAjaran;
        } elseif ($tahunAjaranMasehi) {
            $whereConditions[] = "tahun_ajaran = ?";
            $params[] = $tahunAjaranMasehi;
        }
        
        $whereSql = count($whereConditions) > 0 ? "WHERE " . $whereConditions[0] : "";
        
        $stmt = $this->db->prepare("SELECT SUM(wajib) as total FROM uwaba___khusus $whereSql");
        if (count($params) > 0) {
            $stmt->execute($params);
        } else {
            $stmt->execute();
        }
        $khusus = $stmt->fetch(\PDO::FETCH_ASSOC);
        $totalKhusus = (int)($khusus['total'] ?? 0);

        // Query untuk total bayar
        if (count($whereConditions) > 0) {
            $stmt = $this->db->prepare("
                SELECT COALESCE(SUM(bk.nominal),0) as total_bayar 
                FROM uwaba___bayar_khusus bk
                INNER JOIN uwaba___khusus k ON bk.id_khusus = k.id
                WHERE $whereConditions[0]
            ");
            $stmt->execute($params);
        } else {
        $stmt = $this->db->query("SELECT COALESCE(SUM(nominal),0) as total_bayar FROM uwaba___bayar_khusus");
        }
        $bayarKhusus = $stmt->fetch(\PDO::FETCH_ASSOC);
        $totalBayarKhusus = (int)($bayarKhusus['total_bayar'] ?? 0);
        $totalKurangKhusus = $totalKhusus - $totalBayarKhusus;

        return [
            'total' => $totalKhusus,
            'total_bayar' => $totalBayarKhusus,
            'total_kurang' => $totalKurangKhusus
        ];
    }

    private function getPembayaranPerBulan(): array
    {
        $stmt = $this->db->query("SELECT DATE_FORMAT(tanggal_dibuat, '%Y-%m') as bulan, SUM(nominal) as total FROM uwaba___bayar_tunggakan WHERE tanggal_dibuat >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH) GROUP BY bulan ORDER BY bulan ASC");
        $bulan = [];
        $totalPerBulan = [];
        while ($row = $stmt->fetch(\PDO::FETCH_ASSOC)) {
            $bulan[] = $row['bulan'];
            $totalPerBulan[] = (int)$row['total'];
        }
        return [
            'labels' => $bulan,
            'data' => $totalPerBulan
        ];
    }

    private function getKomposisiStatus(): array
    {
        $stmt = $this->db->query("SELECT status_santri, COUNT(*) as total FROM santri GROUP BY status_santri");
        $statusLabels = [];
        $statusData = [];
        $statusL = [];
        $statusP = [];

        while ($row = $stmt->fetch(\PDO::FETCH_ASSOC)) {
            $statusLabels[] = $row['status_santri'];
            $statusData[] = (int)$row['total'];
            
            $statusVal = $row['status_santri'];
            
            // Query untuk Laki-laki
            $qL = $this->db->prepare("SELECT COUNT(*) as total FROM santri WHERE status_santri = ? AND (
                UPPER(TRIM(gender)) = 'L' OR 
                UPPER(TRIM(gender)) = 'LAKI-LAKI' OR 
                UPPER(TRIM(gender)) LIKE 'LAKI%' OR
                (UPPER(TRIM(gender)) LIKE 'L%' AND LENGTH(TRIM(gender)) <= 2)
            )");
            $qL->execute([$statusVal]);
            $lCount = (int)($qL->fetch(\PDO::FETCH_ASSOC)['total'] ?? 0);
            
            // Query untuk Perempuan
            $qP = $this->db->prepare("SELECT COUNT(*) as total FROM santri WHERE status_santri = ? AND (
                UPPER(TRIM(gender)) = 'P' OR 
                UPPER(TRIM(gender)) = 'PEREMPUAN' OR 
                UPPER(TRIM(gender)) LIKE 'PEREMPUAN%' OR
                (UPPER(TRIM(gender)) LIKE 'P%' AND LENGTH(TRIM(gender)) <= 2)
            )");
            $qP->execute([$statusVal]);
            $pCount = (int)($qP->fetch(\PDO::FETCH_ASSOC)['total'] ?? 0);
            
            $statusL[] = $lCount;
            $statusP[] = $pCount;
        }

        return [
            'labels' => $statusLabels,
            'data' => $statusData,
            'l' => $statusL,
            'p' => $statusP
        ];
    }

    private function getKomposisiGender(): array
    {
        $stmt = $this->db->query("SELECT gender, COUNT(*) as total FROM santri GROUP BY gender");
        $genderLabels = [];
        $genderData = [];
        while ($row = $stmt->fetch(\PDO::FETCH_ASSOC)) {
            $genderLabels[] = $row['gender'];
            $genderData[] = (int)$row['total'];
        }
        return [
            'labels' => $genderLabels,
            'data' => $genderData
        ];
    }

    private function getKomposisiKategori(): array
    {
        $stmt = $this->db->query("SELECT kategori, COUNT(*) as total FROM santri GROUP BY kategori");
        $kategoriLabels = [];
        $kategoriData = [];
        while ($row = $stmt->fetch(\PDO::FETCH_ASSOC)) {
            $kategoriLabels[] = $row['kategori'];
            $kategoriData[] = (int)$row['total'];
        }
        return [
            'labels' => $kategoriLabels,
            'data' => $kategoriData
        ];
    }

    private function getUwabaPerHari(): array
    {
        $stmt = $this->db->query("
            SELECT 
                DATE(masehi) as tanggal,
                COALESCE(SUM(nominal), 0) as total
            FROM uwaba___bayar 
            WHERE DATE(masehi) >= DATE_SUB(CURDATE(), INTERVAL 15 DAY)
            GROUP BY DATE(masehi)
            ORDER BY tanggal ASC
        ");
        $labels = [];
        $data = [];
        while ($row = $stmt->fetch(\PDO::FETCH_ASSOC)) {
            $labels[] = $row['tanggal'];
            $data[] = (int)$row['total'];
        }
        return [
            'labels' => $labels,
            'data' => $data
        ];
    }

    private function getKelompokTunggakan(string $groupBy, $tahunAjaran = null, $tahunAjaranMasehi = null): array
    {
        // Validate groupBy to prevent SQL injection
        $allowedGroup = ['keterangan_1', 'lembaga', 'tahun_ajaran', 'keterangan_2'];
        if (!in_array($groupBy, $allowedGroup)) {
            $groupBy = 'keterangan_1';
        }
        
        // Filter berdasarkan tahun_ajaran hijriyah OR tahun_ajaran masehi
        $whereConditions = [];
        $params = [];
        
        if ($tahunAjaran && $tahunAjaranMasehi) {
            $whereConditions[] = "(tahun_ajaran = ? OR tahun_ajaran = ?)";
            $params[] = $tahunAjaran;
            $params[] = $tahunAjaranMasehi;
        } elseif ($tahunAjaran) {
            $whereConditions[] = "tahun_ajaran = ?";
            $params[] = $tahunAjaran;
        } elseif ($tahunAjaranMasehi) {
            $whereConditions[] = "tahun_ajaran = ?";
            $params[] = $tahunAjaranMasehi;
        }
        
        $whereSql = count($whereConditions) > 0 ? "WHERE " . $whereConditions[0] : "";
        
        $stmt = $this->db->prepare("SELECT `$groupBy`, COUNT(*) as jumlah_tunggakan, SUM(wajib) as total, MIN(id) as min_id FROM uwaba___tunggakan $whereSql GROUP BY `$groupBy`");
        if (count($params) > 0) {
            $stmt->execute($params);
        } else {
            $stmt->execute();
        }
        $kelompok = [];
        
        while ($row = $stmt->fetch(\PDO::FETCH_ASSOC)) {
            $groupValue = $row[$groupBy] ?? null;
            if ($groupValue === null) {
                continue; // Skip jika nilai groupBy null
            }
            
            $stmtKet2 = $this->db->prepare("SELECT keterangan_2 FROM uwaba___tunggakan WHERE id = ? LIMIT 1");
            $stmtKet2->execute([$row['min_id']]);
            $keterangan2 = ($ket2row = $stmtKet2->fetch(\PDO::FETCH_ASSOC)) ? $ket2row['keterangan_2'] : '';
            
            // Filter bayar berdasarkan tahun_ajaran hijriyah OR tahun_ajaran masehi
            if ($tahunAjaran && $tahunAjaranMasehi) {
                $stmtBayar = $this->db->prepare("SELECT COALESCE(SUM(b.nominal),0) as total_bayar FROM uwaba___bayar_tunggakan b JOIN uwaba___tunggakan t ON b.id_tunggakan = t.id WHERE t.`$groupBy` = ? AND (t.tahun_ajaran = ? OR t.tahun_ajaran = ?)");
                $stmtBayar->execute([$groupValue, $tahunAjaran, $tahunAjaranMasehi]);
            } elseif ($tahunAjaran) {
                $stmtBayar = $this->db->prepare("SELECT COALESCE(SUM(b.nominal),0) as total_bayar FROM uwaba___bayar_tunggakan b JOIN uwaba___tunggakan t ON b.id_tunggakan = t.id WHERE t.`$groupBy` = ? AND t.tahun_ajaran = ?");
                $stmtBayar->execute([$groupValue, $tahunAjaran]);
            } elseif ($tahunAjaranMasehi) {
                $stmtBayar = $this->db->prepare("SELECT COALESCE(SUM(b.nominal),0) as total_bayar FROM uwaba___bayar_tunggakan b JOIN uwaba___tunggakan t ON b.id_tunggakan = t.id WHERE t.`$groupBy` = ? AND t.tahun_ajaran = ?");
                $stmtBayar->execute([$groupValue, $tahunAjaranMasehi]);
            } else {
            $stmtBayar = $this->db->prepare("SELECT COALESCE(SUM(b.nominal),0) as total_bayar FROM uwaba___bayar_tunggakan b JOIN uwaba___tunggakan t ON b.id_tunggakan = t.id WHERE t.`$groupBy` = ?");
                $stmtBayar->execute([$groupValue]);
            }
            $totalBayarKelompok = (int)($stmtBayar->fetchColumn() ?: 0);
            
            $kelompok[] = [
                $groupBy => $groupValue,
                'keterangan_2' => $keterangan2,
                'jumlah_tunggakan' => (int)$row['jumlah_tunggakan'],
                'total' => (int)$row['total'],
                'total_bayar' => $totalBayarKelompok
            ];
        }
        
        return $kelompok;
    }

    private function getKelompokKhusus(string $groupBy, $tahunAjaran = null, $tahunAjaranMasehi = null): array
    {
        // Validate groupBy to prevent SQL injection
        $allowedGroup = ['keterangan_1', 'lembaga', 'tahun_ajaran', 'keterangan_2'];
        if (!in_array($groupBy, $allowedGroup)) {
            $groupBy = 'keterangan_1';
        }
        
        // Filter berdasarkan tahun_ajaran hijriyah OR tahun_ajaran masehi
        $whereConditions = [];
        $params = [];
        
        if ($tahunAjaran && $tahunAjaranMasehi) {
            $whereConditions[] = "(tahun_ajaran = ? OR tahun_ajaran = ?)";
            $params[] = $tahunAjaran;
            $params[] = $tahunAjaranMasehi;
        } elseif ($tahunAjaran) {
            $whereConditions[] = "tahun_ajaran = ?";
            $params[] = $tahunAjaran;
        } elseif ($tahunAjaranMasehi) {
            $whereConditions[] = "tahun_ajaran = ?";
            $params[] = $tahunAjaranMasehi;
        }
        
        $whereSql = count($whereConditions) > 0 ? "WHERE " . $whereConditions[0] : "";
        
        $stmt = $this->db->prepare("SELECT `$groupBy`, COUNT(*) as jumlah_tunggakan, SUM(wajib) as total, MIN(id) as min_id FROM uwaba___khusus $whereSql GROUP BY `$groupBy`");
        if (count($params) > 0) {
            $stmt->execute($params);
        } else {
            $stmt->execute();
        }
        $kelompok = [];
        
        while ($row = $stmt->fetch(\PDO::FETCH_ASSOC)) {
            $groupValue = $row[$groupBy] ?? null;
            if ($groupValue === null) {
                continue; // Skip jika nilai groupBy null
            }
            
            $stmtKet2 = $this->db->prepare("SELECT keterangan_2 FROM uwaba___khusus WHERE id = ? LIMIT 1");
            $stmtKet2->execute([$row['min_id']]);
            $keterangan2 = ($ket2row = $stmtKet2->fetch(\PDO::FETCH_ASSOC)) ? $ket2row['keterangan_2'] : '';
            
            // Filter bayar berdasarkan tahun_ajaran hijriyah OR tahun_ajaran masehi
            if ($tahunAjaran && $tahunAjaranMasehi) {
                $stmtBayar = $this->db->prepare("SELECT COALESCE(SUM(b.nominal),0) as total_bayar FROM uwaba___bayar_khusus b JOIN uwaba___khusus k ON b.id_khusus = k.id WHERE k.`$groupBy` = ? AND (k.tahun_ajaran = ? OR k.tahun_ajaran = ?)");
                $stmtBayar->execute([$groupValue, $tahunAjaran, $tahunAjaranMasehi]);
            } elseif ($tahunAjaran) {
                $stmtBayar = $this->db->prepare("SELECT COALESCE(SUM(b.nominal),0) as total_bayar FROM uwaba___bayar_khusus b JOIN uwaba___khusus k ON b.id_khusus = k.id WHERE k.`$groupBy` = ? AND k.tahun_ajaran = ?");
                $stmtBayar->execute([$groupValue, $tahunAjaran]);
            } elseif ($tahunAjaranMasehi) {
                $stmtBayar = $this->db->prepare("SELECT COALESCE(SUM(b.nominal),0) as total_bayar FROM uwaba___bayar_khusus b JOIN uwaba___khusus k ON b.id_khusus = k.id WHERE k.`$groupBy` = ? AND k.tahun_ajaran = ?");
                $stmtBayar->execute([$groupValue, $tahunAjaranMasehi]);
            } else {
            $stmtBayar = $this->db->prepare("SELECT COALESCE(SUM(b.nominal),0) as total_bayar FROM uwaba___bayar_khusus b JOIN uwaba___khusus k ON b.id_khusus = k.id WHERE k.`$groupBy` = ?");
                $stmtBayar->execute([$groupValue]);
            }
            $totalBayar = (int)($stmtBayar->fetchColumn() ?: 0);
            
            $kelompok[] = [
                $groupBy => $groupValue,
                'keterangan_2' => $keterangan2,
                'jumlah_tunggakan' => (int)$row['jumlah_tunggakan'],
                'total' => (int)$row['total'],
                'total_bayar' => $totalBayar
            ];
        }
        
        return $kelompok;
    }

    private function getUwabaData($tahunAjaran = null): array
    {
        // Total wajib dari uwaba (hanya yang tidak disabled)
        if ($tahunAjaran) {
            $stmt = $this->db->prepare("SELECT COALESCE(SUM(wajib), 0) as total FROM uwaba WHERE is_disabled = 0 AND tahun_ajaran = ?");
            $stmt->execute([$tahunAjaran]);
        } else {
        $stmt = $this->db->query("SELECT COALESCE(SUM(wajib), 0) as total FROM uwaba WHERE is_disabled = 0");
        }
        $uwaba = $stmt->fetch(\PDO::FETCH_ASSOC);
        $totalUwaba = (int)($uwaba['total'] ?? 0);

        // Total bayar dari uwaba.nominal (yang sudah diupdate dari histori)
        // Menggunakan pendekatan yang sama dengan getUwabaPerBulan()
        if ($tahunAjaran) {
            $stmt = $this->db->prepare("
                SELECT COALESCE(SUM(nominal), 0) as total_bayar 
                FROM uwaba
                WHERE is_disabled = 0 AND tahun_ajaran = ?
            ");
            $stmt->execute([$tahunAjaran]);
        } else {
            $stmt = $this->db->query("SELECT COALESCE(SUM(nominal), 0) as total_bayar FROM uwaba WHERE is_disabled = 0");
        }
        $bayarUwaba = $stmt->fetch(\PDO::FETCH_ASSOC);
        $totalBayarUwaba = (int)($bayarUwaba['total_bayar'] ?? 0);
        $totalKurangUwaba = $totalUwaba - $totalBayarUwaba;

        return [
            'total' => $totalUwaba,
            'total_bayar' => $totalBayarUwaba,
            'total_kurang' => $totalKurangUwaba
        ];
    }

    private function getUwabaPerBulan($tahunAjaran = null): array
    {
        // Mapping id_bulan ke nama bulan Hijriyah
        $bulanNames = [
            1 => 'Muharram',
            2 => 'Safar',
            3 => 'Rabi\'ul Awal',
            4 => 'Rabi\'ul Akhir',
            5 => 'Jumadil Awal',
            6 => 'Jumadil Akhir',
            7 => 'Rajab',
            8 => 'Sya\'ban',
            9 => 'Ramadhan',
            10 => 'Syawal',
            11 => 'Dzul Qo\'dah',
            12 => 'Dzul Hijjah'
        ];

        // Urutan bulan untuk dashboard (sesuai urutan di aplikasi: 11, 12, 1-8)
        $bulanOrder = [11, 12, 1, 2, 3, 4, 5, 6, 7, 8];
        
        $result = [];
        
        foreach ($bulanOrder as $idBulan) {
            $bulanName = $bulanNames[$idBulan] ?? "Bulan $idBulan";
            
            // Total wajib per bulan dan count kewajiban (semua termasuk disabled)
            if ($tahunAjaran) {
                $stmt = $this->db->prepare("
                    SELECT 
                        COALESCE(SUM(CASE WHEN is_disabled = 0 THEN wajib ELSE 0 END), 0) as total_wajib,
                        COUNT(*) as total_kewajiban,
                        SUM(CASE WHEN is_disabled = 1 THEN 1 ELSE 0 END) as count_tidak_masuk
                    FROM uwaba 
                    WHERE id_bulan = ? AND tahun_ajaran = ?
                ");
                $stmt->execute([$idBulan, $tahunAjaran]);
            } else {
            $stmt = $this->db->prepare("
                SELECT 
                    COALESCE(SUM(CASE WHEN is_disabled = 0 THEN wajib ELSE 0 END), 0) as total_wajib,
                    COUNT(*) as total_kewajiban,
                    SUM(CASE WHEN is_disabled = 1 THEN 1 ELSE 0 END) as count_tidak_masuk
                FROM uwaba 
                WHERE id_bulan = ?
            ");
            $stmt->execute([$idBulan]);
            }
            $wajibData = $stmt->fetch(\PDO::FETCH_ASSOC);
            
            $totalWajib = (int)($wajibData['total_wajib'] ?? 0);
            $totalKewajiban = (int)($wajibData['total_kewajiban'] ?? 0);
            $countTidakMasuk = (int)($wajibData['count_tidak_masuk'] ?? 0);
            
            // Total bayar lunas per bulan (hanya yang sudah lunas)
            // Karena uwaba___bayar tidak punya id_bulan, kita perlu join dengan uwaba
            // dan hitung total bayar berdasarkan nominal di uwaba (yang sudah diupdate dari histori)
            if ($tahunAjaran) {
                $stmt = $this->db->prepare("
                    SELECT 
                        COALESCE(SUM(CASE WHEN sy.nominal >= sy.wajib AND sy.wajib > 0 THEN sy.nominal ELSE 0 END), 0) as total_bayar_lunas,
                        COUNT(DISTINCT CASE WHEN sy.nominal >= sy.wajib AND sy.wajib > 0 THEN sy.id_santri END) as count_lunas
                    FROM uwaba sy
                    WHERE sy.id_bulan = ? AND sy.is_disabled = 0 AND sy.tahun_ajaran = ?
                ");
                $stmt->execute([$idBulan, $tahunAjaran]);
            } else {
            $stmt = $this->db->prepare("
                SELECT 
                    COALESCE(SUM(CASE WHEN sy.nominal >= sy.wajib AND sy.wajib > 0 THEN sy.nominal ELSE 0 END), 0) as total_bayar_lunas,
                    COUNT(DISTINCT CASE WHEN sy.nominal >= sy.wajib AND sy.wajib > 0 THEN sy.id_santri END) as count_lunas
                FROM uwaba sy
                WHERE sy.id_bulan = ? AND sy.is_disabled = 0
            ");
            $stmt->execute([$idBulan]);
            }
            $bayarData = $stmt->fetch(\PDO::FETCH_ASSOC);
            
            $totalBayarLunas = (int)($bayarData['total_bayar_lunas'] ?? 0);
            $countLunas = (int)($bayarData['count_lunas'] ?? 0);
            
            // Hitung total kurang (total wajib - total bayar lunas)
            $totalKurang = max(0, $totalWajib - $totalBayarLunas);
            
            // Count kurang (yang sudah bayar tapi belum lunas)
            $stmt = $this->db->prepare("
                SELECT COUNT(DISTINCT id_santri) as count_kurang
                FROM uwaba
                WHERE id_bulan = ? 
                    AND is_disabled = 0
                    AND wajib > 0
                    AND nominal > 0
                    AND nominal < wajib
            ");
            $stmt->execute([$idBulan]);
            $kurangData = $stmt->fetch(\PDO::FETCH_ASSOC);
            $countKurang = (int)($kurangData['count_kurang'] ?? 0);
            
            // Count belum bayar (yang belum ada pembayaran sama sekali)
            $stmt = $this->db->prepare("
                SELECT COUNT(DISTINCT id_santri) as count_belum
                FROM uwaba
                WHERE id_bulan = ? 
                    AND is_disabled = 0
                    AND wajib > 0
                    AND (nominal = 0 OR nominal IS NULL)
            ");
            $stmt->execute([$idBulan]);
            $belumData = $stmt->fetch(\PDO::FETCH_ASSOC);
            $countBelum = (int)($belumData['count_belum'] ?? 0);
            
            $result[] = [
                'id_bulan' => $idBulan,
                'nama_bulan' => $bulanName,
                'total_wajib' => $totalWajib,
                'total_kewajiban' => $totalKewajiban,
                'count_tidak_masuk' => $countTidakMasuk,
                'total_bayar' => $totalBayarLunas,
                'count_lunas' => $countLunas,
                'total_kurang' => $totalKurang,
                'count_kurang' => $countKurang,
                'count_belum' => $countBelum
            ];
        }
        
        return $result;
    }

    public function getDataSantri(Request $request, Response $response): Response
    {
        try {
            $queryParams = $request->getQueryParams();
            $tahunAjaran = $queryParams['tahun_ajaran'] ?? date('Y');
            
            // Query untuk mendapatkan data santri dengan statistik pembayaran UWABA
            // diniyah/formal = nama lembaga (JOIN lembaga); id_diniyah/id_formal untuk ubah masal
            $stmt = $this->db->prepare("
                SELECT 
                    s.id,
                    s.nis,
                    s.nama,
                    s.ayah,
                    s.ibu,
                    s.gender,
                    s.status_santri,
                    s.kategori,
                    s.id_diniyah,
                    ld.nama AS diniyah,
                    rd.kelas AS kelas_diniyah,
                    rd.kel AS kel_diniyah,
                    s.id_formal,
                    lf.nama AS formal,
                    rf.kelas AS kelas_formal,
                    rf.kel AS kel_formal,
                    s.lttq,
                    s.kelas_lttq,
                    s.kel_lttq,
                    s.hijriyah,
                    s.masehi,
                    s.saudara_di_pesantren,
                    d.id AS id_daerah,
                    d.daerah,
                    dk.kamar,
                    s.id_kamar,
                    s.dusun,
                    s.rt,
                    s.rw,
                    s.desa,
                    s.kecamatan,
                    s.kabupaten,
                    COALESCE(SUM(CASE WHEN sy.is_disabled = 0 THEN sy.wajib ELSE 0 END), 0) as total_wajib,
                    COALESCE(SUM(CASE WHEN sy.is_disabled = 0 THEN sy.nominal ELSE 0 END), 0) as total_bayar,
                    COALESCE(SUM(CASE WHEN sy.is_disabled = 0 THEN (sy.wajib - COALESCE(sy.nominal, 0)) ELSE 0 END), 0) as total_kurang,
                    COUNT(sy.id) as count_uwaba
                FROM santri s
                LEFT JOIN lembaga___rombel rd ON rd.id = s.id_diniyah
                LEFT JOIN lembaga ld ON ld.id = rd.lembaga_id
                LEFT JOIN lembaga___rombel rf ON rf.id = s.id_formal
                LEFT JOIN lembaga lf ON lf.id = rf.lembaga_id
                LEFT JOIN daerah___kamar dk ON dk.id = s.id_kamar
                LEFT JOIN daerah d ON d.id = dk.id_daerah
                LEFT JOIN uwaba sy ON s.id = sy.id_santri AND sy.tahun_ajaran = ?
                GROUP BY s.id, s.nis, s.nama, s.ayah, s.ibu, s.gender, s.status_santri, s.kategori, s.id_diniyah, ld.nama, rd.kelas, rd.kel, s.id_formal, lf.nama, rf.kelas, rf.kel, s.lttq, s.kelas_lttq, s.kel_lttq, s.hijriyah, s.masehi, s.saudara_di_pesantren, s.id_kamar, d.id, d.daerah, dk.kamar, s.dusun, s.rt, s.rw, s.desa, s.kecamatan, s.kabupaten
                ORDER BY s.id ASC
            ");
            $stmt->execute([$tahunAjaran]);
            $data = $stmt->fetchAll(\PDO::FETCH_ASSOC);
            
            // Format data (diniyah/formal = nama lembaga; id_diniyah/id_formal untuk ubah masal)
            $formattedData = array_map(function($row) {
                return [
                    'id' => $row['id'],
                    'nis' => $row['nis'] ?? null,
                    'nama' => $row['nama'],
                    'ayah' => $row['ayah'] ?? '',
                    'ibu' => $row['ibu'] ?? '',
                    'gender' => $row['gender'] ?? '',
                    'status' => $row['status_santri'] ?? '',
                    'status_santri' => $row['status_santri'] ?? '',
                    'kategori' => $row['kategori'] ?? '',
                    'id_diniyah' => isset($row['id_diniyah']) ? (int) $row['id_diniyah'] : null,
                    'diniyah' => $row['diniyah'] ?? '',
                    'kelas_diniyah' => $row['kelas_diniyah'] ?? '',
                    'kel_diniyah' => $row['kel_diniyah'] ?? '',
                    'id_formal' => isset($row['id_formal']) ? (int) $row['id_formal'] : null,
                    'formal' => $row['formal'] ?? '',
                    'kelas_formal' => $row['kelas_formal'] ?? '',
                    'kel_formal' => $row['kel_formal'] ?? '',
                    'lttq' => $row['lttq'] ?? '',
                    'kelas_lttq' => $row['kelas_lttq'] ?? '',
                    'kel_lttq' => $row['kel_lttq'] ?? '',
                    'hijriyah' => $row['hijriyah'] ?? '',
                    'masehi' => $row['masehi'] ?? '',
                    'saudara_di_pesantren' => $row['saudara_di_pesantren'] ?? '',
                    'id_daerah' => isset($row['id_daerah']) ? (int) $row['id_daerah'] : null,
                    'id_kamar' => isset($row['id_kamar']) ? (int) $row['id_kamar'] : null,
                    'daerah' => $row['daerah'] ?? '',
                    'kamar' => $row['kamar'] ?? '',
                    'dusun' => $row['dusun'] ?? '',
                    'rt' => $row['rt'] ?? '',
                    'rw' => $row['rw'] ?? '',
                    'desa' => $row['desa'] ?? '',
                    'kecamatan' => $row['kecamatan'] ?? '',
                    'kabupaten' => $row['kabupaten'] ?? '',
                    'wajib' => (int)$row['total_wajib'],
                    'bayar' => (int)$row['total_bayar'],
                    'kurang' => (int)$row['total_kurang'],
                    'count' => (int)$row['count_uwaba']
                ];
            }, $data);
            
            return $this->jsonResponse($response, [
                'success' => true,
                'data' => $formattedData
            ], 200);
            
        } catch (\Exception $e) {
            error_log("Get data santri error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Error: ' . $e->getMessage()
            ], 500);
        }
    }

    public function getDataKhusus(Request $request, Response $response): Response
    {
        try {
            $queryParams = $request->getQueryParams();
            $tahunAjaran = $queryParams['tahun_ajaran'] ?? null; // Tahun hijriyah
            $tahunAjaranMasehi = $queryParams['tahun_ajaran_masehi'] ?? null; // Tahun masehi
            $showAll = isset($queryParams['show_all']) && $queryParams['show_all'] === 'true'; // Tampilkan semua data tanpa filter tahun
            $belumAdaKewajiban = isset($queryParams['belum_ada_kewajiban']) && $queryParams['belum_ada_kewajiban'] === 'true'; // Santri yang belum punya record di uwaba___khusus
            
            if ($belumAdaKewajiban) {
                // Santri yang belum ada di tabel uwaba___khusus (belum punya kewajiban khusus)
                $sql = "
                    SELECT 
                        s.id,
                        s.nis,
                        s.nama,
                        s.gender,
                        s.status_santri,
                        s.kategori,
                        s.id_diniyah,
                        ld.nama AS diniyah,
                        rd.kelas AS kelas_diniyah,
                        rd.kel AS kel_diniyah,
                        s.id_formal,
                        lf.nama AS formal,
                        rf.kelas AS kelas_formal,
                        rf.kel AS kel_formal,
                        s.lttq,
                        s.kelas_lttq,
                        s.kel_lttq,
                        s.hijriyah,
                        s.masehi,
                        s.saudara_di_pesantren,
                        NULL as id_khusus,
                        NULL as tahun_ajaran,
                        NULL as lembaga,
                        NULL as keterangan_1,
                        NULL as keterangan_2,
                        0 as total_wajib,
                        0 as total_bayar,
                        0 as total_kurang
                    FROM santri s
                    LEFT JOIN lembaga___rombel rd ON rd.id = s.id_diniyah
                    LEFT JOIN lembaga ld ON ld.id = rd.lembaga_id
                    LEFT JOIN lembaga___rombel rf ON rf.id = s.id_formal
                    LEFT JOIN lembaga lf ON lf.id = rf.lembaga_id
                    WHERE NOT EXISTS (SELECT 1 FROM uwaba___khusus k WHERE k.id_santri = s.id)
                    ORDER BY s.id ASC
                ";
                $stmt = $this->db->prepare($sql);
                $stmt->execute();
                $data = $stmt->fetchAll(\PDO::FETCH_ASSOC);
                $formattedData = array_map(function($row) {
                    return [
                        'id' => $row['id'],
                        'nis' => $row['nis'] ?? null,
                        'nama' => $row['nama'],
                        'gender' => $row['gender'] ?? '',
                        'status' => $row['status_santri'] ?? '',
                        'kategori' => $row['kategori'] ?? '',
                        'id_diniyah' => isset($row['id_diniyah']) ? (int) $row['id_diniyah'] : null,
                        'diniyah' => $row['diniyah'] ?? '',
                        'kelas_diniyah' => $row['kelas_diniyah'] ?? '',
                        'kel_diniyah' => $row['kel_diniyah'] ?? '',
                        'id_formal' => isset($row['id_formal']) ? (int) $row['id_formal'] : null,
                        'formal' => $row['formal'] ?? '',
                        'kelas_formal' => $row['kelas_formal'] ?? '',
                        'kel_formal' => $row['kel_formal'] ?? '',
                        'lttq' => $row['lttq'] ?? '',
                        'kelas_lttq' => $row['kelas_lttq'] ?? '',
                        'kel_lttq' => $row['kel_lttq'] ?? '',
                        'hijriyah' => $row['hijriyah'] ?? '',
                        'masehi' => $row['masehi'] ?? '',
                        'saudara_di_pesantren' => $row['saudara_di_pesantren'] ?? '',
                        'tahun_ajaran' => '',
                        'lembaga' => '',
                        'keterangan_1' => '',
                        'keterangan_2' => '',
                        'wajib' => 0,
                        'bayar' => 0,
                        'kurang' => 0,
                        'id_khusus' => 0
                    ];
                }, $data);
            } else {
                // Query untuk mendapatkan data santri dengan statistik pembayaran Khusus
                // Satu santri bisa punya 2 khusus, jadi load semua
                $sql = "
                    SELECT 
                        s.id,
                        s.nis,
                        s.nama,
                        s.gender,
                        s.status_santri,
                        s.kategori,
                        s.id_diniyah,
                        ld.nama AS diniyah,
                        rd.kelas AS kelas_diniyah,
                        rd.kel AS kel_diniyah,
                        s.id_formal,
                        lf.nama AS formal,
                        rf.kelas AS kelas_formal,
                        rf.kel AS kel_formal,
                        s.lttq,
                        s.kelas_lttq,
                        s.kel_lttq,
                        s.hijriyah,
                        s.masehi,
                        s.saudara_di_pesantren,
                        k.id as id_khusus,
                        k.tahun_ajaran,
                        k.lembaga,
                        k.keterangan_1,
                        k.keterangan_2,
                        k.wajib as total_wajib,
                        COALESCE(SUM(bk.nominal), 0) as total_bayar,
                        (k.wajib - COALESCE(SUM(bk.nominal), 0)) as total_kurang
                    FROM uwaba___khusus k
                    INNER JOIN santri s ON k.id_santri = s.id
                    LEFT JOIN lembaga___rombel rd ON rd.id = s.id_diniyah
                    LEFT JOIN lembaga ld ON ld.id = rd.lembaga_id
                    LEFT JOIN lembaga___rombel rf ON rf.id = s.id_formal
                    LEFT JOIN lembaga lf ON lf.id = rf.lembaga_id
                    LEFT JOIN uwaba___bayar_khusus bk ON k.id = bk.id_khusus
                ";
                
                // Add WHERE clause if tahun_ajaran is provided (hijriyah OR masehi)
                // Skip filter tahun jika show_all = true
                $params = [];
                if (!$showAll) {
                    if ($tahunAjaran && $tahunAjaranMasehi) {
                        $sql .= " WHERE (k.tahun_ajaran = ? OR k.tahun_ajaran = ?)";
                        $params[] = $tahunAjaran;
                        $params[] = $tahunAjaranMasehi;
                    } elseif ($tahunAjaran) {
                        $sql .= " WHERE k.tahun_ajaran = ?";
                        $params[] = $tahunAjaran;
                    } elseif ($tahunAjaranMasehi) {
                        $sql .= " WHERE k.tahun_ajaran = ?";
                        $params[] = $tahunAjaranMasehi;
                    }
                }
                
                $sql .= "
                    GROUP BY s.id, s.nis, s.nama, s.gender, s.status_santri, s.kategori, s.id_diniyah, ld.nama, rd.kelas, rd.kel, s.id_formal, lf.nama, rf.kelas, rf.kel, s.lttq, s.kelas_lttq, s.kel_lttq, s.hijriyah, s.masehi, s.saudara_di_pesantren, k.id, k.tahun_ajaran, k.lembaga, k.keterangan_1, k.keterangan_2, k.wajib
                    ORDER BY s.id ASC, k.id ASC
                ";
                
                $stmt = $this->db->prepare($sql);
                if (count($params) > 0) {
                    $stmt->execute($params);
                } else {
                    $stmt->execute();
                }
                $data = $stmt->fetchAll(\PDO::FETCH_ASSOC);
                
                // Format data (diniyah/formal = nama lembaga; id_diniyah/id_formal untuk ubah masal)
                $formattedData = array_map(function($row) {
                    return [
                        'id' => $row['id'],
                        'nis' => $row['nis'] ?? null,
                        'nama' => $row['nama'],
                        'gender' => $row['gender'] ?? '',
                        'status' => $row['status_santri'] ?? '',
                        'kategori' => $row['kategori'] ?? '',
                        'id_diniyah' => isset($row['id_diniyah']) ? (int) $row['id_diniyah'] : null,
                        'diniyah' => $row['diniyah'] ?? '',
                        'kelas_diniyah' => $row['kelas_diniyah'] ?? '',
                        'kel_diniyah' => $row['kel_diniyah'] ?? '',
                        'id_formal' => isset($row['id_formal']) ? (int) $row['id_formal'] : null,
                        'formal' => $row['formal'] ?? '',
                        'kelas_formal' => $row['kelas_formal'] ?? '',
                        'kel_formal' => $row['kel_formal'] ?? '',
                        'lttq' => $row['lttq'] ?? '',
                        'kelas_lttq' => $row['kelas_lttq'] ?? '',
                        'kel_lttq' => $row['kel_lttq'] ?? '',
                        'hijriyah' => $row['hijriyah'] ?? '',
                        'masehi' => $row['masehi'] ?? '',
                        'saudara_di_pesantren' => $row['saudara_di_pesantren'] ?? '',
                        'tahun_ajaran' => $row['tahun_ajaran'] ?? '',
                        'lembaga' => $row['lembaga'] ?? '',
                        'keterangan_1' => $row['keterangan_1'] ?? '',
                        'keterangan_2' => $row['keterangan_2'] ?? '',
                        'wajib' => (int)$row['total_wajib'],
                        'bayar' => (int)$row['total_bayar'],
                        'kurang' => (int)$row['total_kurang'],
                        'id_khusus' => (int)$row['id_khusus']
                    ];
                }, $data);
            }
            
            return $this->jsonResponse($response, [
                'success' => true,
                'data' => $formattedData
            ], 200);
            
        } catch (\Exception $e) {
            error_log("Get data khusus error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Error: ' . $e->getMessage()
            ], 500);
        }
    }

    public function getDataTunggakan(Request $request, Response $response): Response
    {
        try {
            $queryParams = $request->getQueryParams();
            $tahunAjaran = $queryParams['tahun_ajaran'] ?? null;
            $tahunAjaranMasehi = $queryParams['tahun_ajaran_masehi'] ?? null;
            $showAll = isset($queryParams['show_all']) && $queryParams['show_all'] === 'true';
            $belumAdaKewajiban = isset($queryParams['belum_ada_kewajiban']) && $queryParams['belum_ada_kewajiban'] === 'true';

            if ($belumAdaKewajiban) {
                $sql = "
                    SELECT s.id, s.nis, s.nama, s.gender, s.status_santri, s.kategori,
                        s.id_diniyah, ld.nama AS diniyah, rd.kelas AS kelas_diniyah, rd.kel AS kel_diniyah,
                        s.id_formal, lf.nama AS formal, rf.kelas AS kelas_formal, rf.kel AS kel_formal,
                        s.lttq, s.kelas_lttq, s.kel_lttq, s.hijriyah, s.masehi, s.saudara_di_pesantren,
                        NULL as id_tunggakan, NULL as tahun_ajaran, NULL as lembaga, NULL as keterangan_1, NULL as keterangan_2,
                        0 as total_wajib, 0 as total_bayar, 0 as total_kurang
                    FROM santri s
                    LEFT JOIN lembaga___rombel rd ON rd.id = s.id_diniyah
                    LEFT JOIN lembaga ld ON ld.id = rd.lembaga_id
                    LEFT JOIN lembaga___rombel rf ON rf.id = s.id_formal
                    LEFT JOIN lembaga lf ON lf.id = rf.lembaga_id
                    WHERE NOT EXISTS (SELECT 1 FROM uwaba___tunggakan t WHERE t.id_santri = s.id)
                    ORDER BY s.id ASC
                ";
                $stmt = $this->db->prepare($sql);
                $stmt->execute();
                $data = $stmt->fetchAll(\PDO::FETCH_ASSOC);
                $formattedData = array_map(function($row) {
                    return [
                        'id' => $row['id'], 'nis' => $row['nis'] ?? null, 'nama' => $row['nama'], 'gender' => $row['gender'] ?? '',
                        'status' => $row['status_santri'] ?? '', 'kategori' => $row['kategori'] ?? '',
                        'id_diniyah' => isset($row['id_diniyah']) ? (int) $row['id_diniyah'] : null, 'diniyah' => $row['diniyah'] ?? '',
                        'kelas_diniyah' => $row['kelas_diniyah'] ?? '', 'kel_diniyah' => $row['kel_diniyah'] ?? '',
                        'id_formal' => isset($row['id_formal']) ? (int) $row['id_formal'] : null, 'formal' => $row['formal'] ?? '', 'kelas_formal' => $row['kelas_formal'] ?? '', 'kel_formal' => $row['kel_formal'] ?? '',
                        'lttq' => $row['lttq'] ?? '', 'kelas_lttq' => $row['kelas_lttq'] ?? '', 'kel_lttq' => $row['kel_lttq'] ?? '',
                        'hijriyah' => $row['hijriyah'] ?? '', 'masehi' => $row['masehi'] ?? '', 'saudara_di_pesantren' => $row['saudara_di_pesantren'] ?? '',
                        'tahun_ajaran' => '', 'lembaga' => '', 'keterangan_1' => '', 'keterangan_2' => '',
                        'wajib' => 0, 'bayar' => 0, 'kurang' => 0, 'id_tunggakan' => 0
                    ];
                }, $data);
            } else {
                $sql = "
                    SELECT s.id, s.nis, s.nama, s.gender, s.status_santri, s.kategori,
                        s.id_diniyah, ld.nama AS diniyah, rd.kelas AS kelas_diniyah, rd.kel AS kel_diniyah,
                        s.id_formal, lf.nama AS formal, rf.kelas AS kelas_formal, rf.kel AS kel_formal,
                        s.lttq, s.kelas_lttq, s.kel_lttq, s.hijriyah, s.masehi, s.saudara_di_pesantren,
                        t.id as id_tunggakan, t.tahun_ajaran, t.lembaga, t.keterangan_1, t.keterangan_2,
                        t.wajib as total_wajib, COALESCE(SUM(bt.nominal), 0) as total_bayar, (t.wajib - COALESCE(SUM(bt.nominal), 0)) as total_kurang
                    FROM uwaba___tunggakan t
                    INNER JOIN santri s ON t.id_santri = s.id
                    LEFT JOIN lembaga___rombel rd ON rd.id = s.id_diniyah
                    LEFT JOIN lembaga ld ON ld.id = rd.lembaga_id
                    LEFT JOIN lembaga___rombel rf ON rf.id = s.id_formal
                    LEFT JOIN lembaga lf ON lf.id = rf.lembaga_id
                    LEFT JOIN uwaba___bayar_tunggakan bt ON t.id = bt.id_tunggakan
                ";
                $params = [];
                if (!$showAll) {
                    if ($tahunAjaran && $tahunAjaranMasehi) {
                        $sql .= " WHERE (t.tahun_ajaran = ? OR t.tahun_ajaran = ?)";
                        $params[] = $tahunAjaran;
                        $params[] = $tahunAjaranMasehi;
                    } elseif ($tahunAjaran) {
                        $sql .= " WHERE t.tahun_ajaran = ?";
                        $params[] = $tahunAjaran;
                    } elseif ($tahunAjaranMasehi) {
                        $sql .= " WHERE t.tahun_ajaran = ?";
                        $params[] = $tahunAjaranMasehi;
                    }
                }
                $sql .= " GROUP BY s.id, s.nis, s.nama, s.gender, s.status_santri, s.kategori, s.id_diniyah, ld.nama, rd.kelas, rd.kel, s.id_formal, lf.nama, rf.kelas, rf.kel, s.lttq, s.kelas_lttq, s.kel_lttq, s.hijriyah, s.masehi, s.saudara_di_pesantren, t.id, t.tahun_ajaran, t.lembaga, t.keterangan_1, t.keterangan_2, t.wajib ORDER BY s.id ASC, t.id ASC";
                $stmt = $this->db->prepare($sql);
                $stmt->execute(count($params) > 0 ? $params : []);
                $data = $stmt->fetchAll(\PDO::FETCH_ASSOC);
                $formattedData = array_map(function($row) {
                    return [
                        'id' => $row['id'], 'nis' => $row['nis'] ?? null, 'nama' => $row['nama'], 'gender' => $row['gender'] ?? '',
                        'status' => $row['status_santri'] ?? '', 'kategori' => $row['kategori'] ?? '',
                        'id_diniyah' => isset($row['id_diniyah']) ? (int) $row['id_diniyah'] : null, 'diniyah' => $row['diniyah'] ?? '',
                        'kelas_diniyah' => $row['kelas_diniyah'] ?? '', 'kel_diniyah' => $row['kel_diniyah'] ?? '',
                        'id_formal' => isset($row['id_formal']) ? (int) $row['id_formal'] : null, 'formal' => $row['formal'] ?? '', 'kelas_formal' => $row['kelas_formal'] ?? '', 'kel_formal' => $row['kel_formal'] ?? '',
                        'lttq' => $row['lttq'] ?? '', 'kelas_lttq' => $row['kelas_lttq'] ?? '', 'kel_lttq' => $row['kel_lttq'] ?? '',
                        'hijriyah' => $row['hijriyah'] ?? '', 'masehi' => $row['masehi'] ?? '', 'saudara_di_pesantren' => $row['saudara_di_pesantren'] ?? '',
                        'tahun_ajaran' => $row['tahun_ajaran'] ?? '', 'lembaga' => $row['lembaga'] ?? '', 'keterangan_1' => $row['keterangan_1'] ?? '', 'keterangan_2' => $row['keterangan_2'] ?? '',
                        'wajib' => (int)$row['total_wajib'], 'bayar' => (int)$row['total_bayar'], 'kurang' => (int)$row['total_kurang'],
                        'id_tunggakan' => (int)$row['id_tunggakan']
                    ];
                }, $data);
            }

            return $this->jsonResponse($response, ['success' => true, 'data' => $formattedData], 200);
        } catch (\Exception $e) {
            error_log("Get data tunggakan error: " . $e->getMessage());
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Error: ' . $e->getMessage()], 500);
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

