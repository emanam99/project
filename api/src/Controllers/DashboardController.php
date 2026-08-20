<?php

namespace App\Controllers;

use App\Database;
use App\Helpers\ManageDataResponseCache;
use App\Helpers\TextSanitizer;
use App\Helpers\SantriStatusHelper;
use App\Services\ManageWaBulkService;
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
                'message' => 'Terjadi kesalahan',
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
                'message' => 'Terjadi kesalahan'
            ], 500);
        }
    }

    public function updateKelompokKeterangan(Request $request, Response $response): Response
    {
        try {
            $data = $request->getParsedBody();

            $tipe = $data['tipe'] ?? '';
            $groupBy = $data['group_by'] ?? 'keterangan_1';
            $newValue = TextSanitizer::cleanText($data['new_value'] ?? '');
            $oldKeterangan1 = TextSanitizer::cleanText($data['old_keterangan_1'] ?? '');
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
                'message' => 'Gagal update database'
            ], 500);
        }
    }

    private function getTotalSantri(): int
    {
        $stmt = $this->db->query("SELECT COUNT(*) as total FROM santri s " . SantriStatusHelper::currentStatusJoinSql('s', 'st', 'ss') . " WHERE LOWER(TRIM(COALESCE(st.status_santri, s.status_santri, ''))) IN ('mukim','khoriji')");
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
            $whereConditions[] = 'tahun_ajaran = ?';
            $params[] = $tahunAjaran;
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
            $whereConditions[] = 'tahun_ajaran = ?';
            $params[] = $tahunAjaran;
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
        $stmt = $this->db->query("
            SELECT
                COALESCE(st.status_santri, s.status_santri, '') AS status_santri,
                COUNT(*) as total,
                SUM(
                    CASE
                        WHEN UPPER(TRIM(gender)) = 'L'
                            OR UPPER(TRIM(gender)) = 'LAKI-LAKI'
                            OR UPPER(TRIM(gender)) LIKE 'LAKI%'
                            OR (UPPER(TRIM(gender)) LIKE 'L%' AND LENGTH(TRIM(gender)) <= 2)
                        THEN 1 ELSE 0
                    END
                ) as total_l,
                SUM(
                    CASE
                        WHEN UPPER(TRIM(gender)) = 'P'
                            OR UPPER(TRIM(gender)) = 'PEREMPUAN'
                            OR UPPER(TRIM(gender)) LIKE 'PEREMPUAN%'
                            OR (UPPER(TRIM(gender)) LIKE 'P%' AND LENGTH(TRIM(gender)) <= 2)
                        THEN 1 ELSE 0
                    END
                ) as total_p
            FROM santri s
            " . SantriStatusHelper::currentStatusJoinSql('s', 'st', 'ss') . "
            GROUP BY COALESCE(st.status_santri, s.status_santri, '')
        ");
        $statusLabels = [];
        $statusData = [];
        $statusL = [];
        $statusP = [];

        while ($row = $stmt->fetch(\PDO::FETCH_ASSOC)) {
            $statusLabels[] = $row['status_santri'] ?? '';
            $statusData[] = (int)$row['total'];
            $statusL[] = (int)($row['total_l'] ?? 0);
            $statusP[] = (int)($row['total_p'] ?? 0);
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
        $stmt = $this->db->query("SELECT COALESCE(d.kategori, '') AS kategori, COUNT(*) as total FROM santri s " . SantriStatusHelper::currentStatusJoinSql('s', 'st', 'ss') . " LEFT JOIN daerah___kamar dk ON dk.id = s.id_kamar LEFT JOIN daerah d ON d.id = dk.id_daerah GROUP BY COALESCE(d.kategori, '')");
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
            WHERE masehi >= DATE_SUB(CURDATE(), INTERVAL 15 DAY)
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
            $whereConditions[] = 't.tahun_ajaran = ?';
            $params[] = $tahunAjaran;
        } elseif ($tahunAjaran) {
            $whereConditions[] = "t.tahun_ajaran = ?";
            $params[] = $tahunAjaran;
        } elseif ($tahunAjaranMasehi) {
            $whereConditions[] = "t.tahun_ajaran = ?";
            $params[] = $tahunAjaranMasehi;
        }
        
        $whereSql = count($whereConditions) > 0 ? "WHERE " . $whereConditions[0] : "";
        
        $stmt = $this->db->prepare("
            SELECT
                t.`$groupBy` AS group_value,
                COUNT(*) AS jumlah_tunggakan,
                COALESCE(SUM(t.wajib), 0) AS total,
                COALESCE(SUM(b.total_bayar), 0) AS total_bayar,
                MIN(COALESCE(t.keterangan_2, '')) AS keterangan_2
            FROM uwaba___tunggakan t
            LEFT JOIN (
                SELECT id_tunggakan, COALESCE(SUM(nominal), 0) AS total_bayar
                FROM uwaba___bayar_tunggakan
                GROUP BY id_tunggakan
            ) b ON b.id_tunggakan = t.id
            $whereSql
            GROUP BY t.`$groupBy`
        ");
        if (count($params) > 0) {
            $stmt->execute($params);
        } else {
            $stmt->execute();
        }
        $kelompok = [];
        
        while ($row = $stmt->fetch(\PDO::FETCH_ASSOC)) {
            $groupValue = $row['group_value'] ?? null;
            if ($groupValue === null) {
                continue; // Skip jika nilai groupBy null
            }
            $keterangan2 = $groupBy === 'keterangan_2' ? (string)$groupValue : (string)($row['keterangan_2'] ?? '');
            
            $kelompok[] = [
                $groupBy => $groupValue,
                'keterangan_2' => $keterangan2,
                'jumlah_tunggakan' => (int)$row['jumlah_tunggakan'],
                'total' => (int)$row['total'],
                'total_bayar' => (int)($row['total_bayar'] ?? 0)
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
            $whereConditions[] = 'k.tahun_ajaran = ?';
            $params[] = $tahunAjaran;
        } elseif ($tahunAjaran) {
            $whereConditions[] = "k.tahun_ajaran = ?";
            $params[] = $tahunAjaran;
        } elseif ($tahunAjaranMasehi) {
            $whereConditions[] = "k.tahun_ajaran = ?";
            $params[] = $tahunAjaranMasehi;
        }
        
        $whereSql = count($whereConditions) > 0 ? "WHERE " . $whereConditions[0] : "";
        
        $stmt = $this->db->prepare("
            SELECT
                k.`$groupBy` AS group_value,
                COUNT(*) AS jumlah_tunggakan,
                COALESCE(SUM(k.wajib), 0) AS total,
                COALESCE(SUM(b.total_bayar), 0) AS total_bayar,
                MIN(COALESCE(k.keterangan_2, '')) AS keterangan_2
            FROM uwaba___khusus k
            LEFT JOIN (
                SELECT id_khusus, COALESCE(SUM(nominal), 0) AS total_bayar
                FROM uwaba___bayar_khusus
                GROUP BY id_khusus
            ) b ON b.id_khusus = k.id
            $whereSql
            GROUP BY k.`$groupBy`
        ");
        if (count($params) > 0) {
            $stmt->execute($params);
        } else {
            $stmt->execute();
        }
        $kelompok = [];
        
        while ($row = $stmt->fetch(\PDO::FETCH_ASSOC)) {
            $groupValue = $row['group_value'] ?? null;
            if ($groupValue === null) {
                continue; // Skip jika nilai groupBy null
            }
            $keterangan2 = $groupBy === 'keterangan_2' ? (string)$groupValue : (string)($row['keterangan_2'] ?? '');
            
            $kelompok[] = [
                $groupBy => $groupValue,
                'keterangan_2' => $keterangan2,
                'jumlah_tunggakan' => (int)$row['jumlah_tunggakan'],
                'total' => (int)$row['total'],
                'total_bayar' => (int)($row['total_bayar'] ?? 0)
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
            // Tahun ajaran wajib (per audit Mei 2026) untuk hindari full table scan
            // tanpa filter; fallback ke tahun masehi saat ini agar tidak break klien lama.
            $tahunAjaran = trim((string) ($queryParams['tahun_ajaran'] ?? ''));
            if ($tahunAjaran === '') {
                $tahunAjaran = (string) date('Y');
            }

            // MySQL 5.7+: batasi waktu eksekusi query agar request lambat tidak menggantung worker PHP.
            // Tanpa ini, query Dashboard pada ~5500 santri pernah lebih dari 30 detik di production.
            try {
                $this->db->exec('SET SESSION MAX_EXECUTION_TIME = 15000');
            } catch (\Throwable $e) {
                // MariaDB / MySQL versi lama abaikan; tidak fatal.
            }

            $stmtHariIni = $this->db->query(
                'SELECT COUNT(*) AS c FROM santri___ijin WHERE DATE(tanggal_dibuat) = CURDATE()'
            );
            $ijinHariIni = 0;
            if ($stmtHariIni) {
                $rowHari = $stmtHariIni->fetch(\PDO::FETCH_ASSOC);
                $ijinHariIni = (int) ($rowHari['c'] ?? 0);
            }

            $pagination = $this->parseListPagination($queryParams);

            $cacheKey = null;
            if ($pagination['active']) {
                $cacheKey = ManageDataResponseCache::makeKey('data-santri', $queryParams);
                $cached = ManageDataResponseCache::get($cacheKey);
                if ($cached !== null) {
                    return $this->jsonResponse($response, $cached, 200);
                }
            }

            $taQuoted = $this->db->quote((string) $tahunAjaran);

            $totalRows = null;
            $cursorSantri = $pagination['active'] ? (int) ($pagination['cursor_santri'] ?? 0) : 0;
            if ($pagination['active']) {
                $stmtTotal = $this->db->query('SELECT COUNT(*) FROM santri');
                $totalRows = (int) $stmtTotal->fetchColumn();
            }

            // Query untuk mendapatkan data santri dengan statistik pembayaran UWABA
            // diniyah/formal = nama lembaga (JOIN lembaga); id_diniyah/id_formal untuk ubah masal
            $sqlUwabaGrid = "
                SELECT 
                    s.id,
                    s.nis,
                    s.nama,
                    s.ayah,
                    s.ibu,
                    s.gender,
                    COALESCE(st.status_santri, s.status_santri, '') AS status_santri,
                    COALESCE(d.kategori, '') AS kategori,
                    s.id_diniyah,
                    rd.lembaga_id AS lembaga_id_diniyah,
                    ld.nama AS diniyah,
                    rd.kelas AS kelas_diniyah,
                    rd.kel AS kel_diniyah,
                    s.id_formal,
                    rf.lembaga_id AS lembaga_id_formal,
                    lf.nama AS formal,
                    rf.kelas AS kelas_formal,
                    rf.kel AS kel_formal,
                    lt.tingkatan AS lttq,
                    CASE WHEN lt.kelompok LIKE '%-%' THEN SUBSTRING_INDEX(lt.kelompok,'-',1) ELSE COALESCE(lt.kelompok,'') END AS kelas_lttq,
                    CASE WHEN lt.kelompok LIKE '%-%' THEN SUBSTRING_INDEX(lt.kelompok,'-',-1) ELSE '' END AS kel_lttq,
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
                    /* Banyaknya bulan UWABA (maks. 10 slot per TA): hitung bulan unik, bukan jumlah baris — hindari >10 jika ada duplikat id_santri+id_bulan+tahun */
                    COUNT(DISTINCT COALESCE(sy.id_bulan, NULLIF(TRIM(sy.bulan), ''))) as count_uwaba,
                    COALESCE(ubt.total_bayar_transaksi, 0) AS total_bayar_transaksi,
                    COALESCE(kall.kurang_all_ta, 0) AS kurang_all_ta,
                    COALESCE(ij.ijin_cnt, 0) AS ijin_count
                FROM santri s
                LEFT JOIN (
                    SELECT id_santri, COUNT(*) AS ijin_cnt
                    FROM santri___ijin
                    WHERE tahun_ajaran = {$taQuoted}
                    GROUP BY id_santri
                ) ij ON ij.id_santri = s.id
                LEFT JOIN (
                    SELECT id_santri, COALESCE(SUM(nominal), 0) AS total_bayar_transaksi
                    FROM uwaba___bayar
                    WHERE tahun_ajaran = {$taQuoted}
                    GROUP BY id_santri
                ) ubt ON ubt.id_santri = s.id
                LEFT JOIN (
                    SELECT u.id_santri,
                        COALESCE(SUM(
                            CASE WHEN u.is_disabled = 0
                            THEN GREATEST(0, u.wajib - COALESCE(u.nominal, 0))
                            ELSE 0 END
                        ), 0) AS kurang_all_ta
                    FROM uwaba u
                    GROUP BY u.id_santri
                ) kall ON kall.id_santri = s.id
                LEFT JOIN lembaga___rombel rd ON rd.id = s.id_diniyah
                LEFT JOIN lembaga ld ON ld.id = rd.lembaga_id
                LEFT JOIN lembaga___rombel rf ON rf.id = s.id_formal
                LEFT JOIN lembaga lf ON lf.id = rf.lembaga_id
                LEFT JOIN lttq_tingkatan lt ON lt.id = s.id_lttq_tingkatan
                LEFT JOIN daerah___kamar dk ON dk.id = s.id_kamar
                LEFT JOIN daerah d ON d.id = dk.id_daerah
                " . SantriStatusHelper::currentStatusJoinSql('s', 'st', 'ss') . "
                LEFT JOIN uwaba sy ON s.id = sy.id_santri AND sy.tahun_ajaran = ?
                __UWABA_S_FILTER__
                GROUP BY s.id, s.nis, s.nama, s.ayah, s.ibu, s.gender, COALESCE(st.status_santri, s.status_santri, ''), COALESCE(d.kategori, ''), s.id_diniyah, rd.lembaga_id, ld.nama, rd.kelas, rd.kel, s.id_formal, rf.lembaga_id, lf.nama, rf.kelas, rf.kel, s.id_lttq_tingkatan, lt.tingkatan, lt.kelompok, s.hijriyah, s.masehi, s.saudara_di_pesantren, s.id_kamar, d.id, d.daerah, dk.kamar, s.dusun, s.rt, s.rw, s.desa, s.kecamatan, s.kabupaten
            ";
            $sFilter = ($pagination['active'] && $cursorSantri > 0) ? ('WHERE s.id > ' . $cursorSantri . ' ') : '';
            $sqlUwabaGrid = str_replace('__UWABA_S_FILTER__', $sFilter, $sqlUwabaGrid);
            $sqlUwabaGrid .= ' ORDER BY s.id ASC ';
            if ($pagination['active']) {
                $lim = (int) $pagination['limit'];
                if ($cursorSantri <= 0 && $pagination['offset'] > 0) {
                    $sqlUwabaGrid .= ' LIMIT ' . $lim . ' OFFSET ' . (int) $pagination['offset'];
                } else {
                    $sqlUwabaGrid .= ' LIMIT ' . $lim;
                }
            }
            $stmt = $this->db->prepare($sqlUwabaGrid);
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
                    'lembaga_id_diniyah' => isset($row['lembaga_id_diniyah']) ? (string) $row['lembaga_id_diniyah'] : '',
                    'diniyah' => $row['diniyah'] ?? '',
                    'kelas_diniyah' => $row['kelas_diniyah'] ?? '',
                    'kel_diniyah' => $row['kel_diniyah'] ?? '',
                    'id_formal' => isset($row['id_formal']) ? (int) $row['id_formal'] : null,
                    'lembaga_id_formal' => isset($row['lembaga_id_formal']) ? (string) $row['lembaga_id_formal'] : '',
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
                    'bayar_transaksi' => (int)($row['total_bayar_transaksi'] ?? 0),
                    'kurang_all_ta' => (int)($row['kurang_all_ta'] ?? 0),
                    'count' => (int)$row['count_uwaba'],
                    'ijin_count' => (int) ($row['ijin_count'] ?? 0)
                ];
            }, $data);

            $formattedData = $this->enrichManageDataRowsWithWaMeta($formattedData);

            $payload = ['success' => true, 'data' => $formattedData];
            if ($pagination['active'] && $totalRows !== null) {
                $n = count($formattedData);
                $lastId = 0;
                foreach ($formattedData as $fr) {
                    $lastId = max($lastId, (int) ($fr['id'] ?? 0));
                }
                $hasMoreOffset = ($pagination['offset'] + $n) < $totalRows;
                $hasMoreCursor = $n >= (int) $pagination['limit'] && $lastId > 0;
                $payload['meta'] = [
                    'total' => $totalRows,
                    'offset' => $pagination['offset'],
                    'limit' => $pagination['limit'],
                    'returned' => $n,
                    'has_more' => $cursorSantri > 0 ? $hasMoreCursor : $hasMoreOffset,
                    'next_cursor' => $n > 0 ? $lastId : null,
                ];
                if ($pagination['offset'] === 0 && $cursorSantri === 0) {
                    $payload['ijin_hari_ini'] = $ijinHariIni;
                }
            } else {
                $payload['ijin_hari_ini'] = $ijinHariIni;
            }

            if ($cacheKey !== null) {
                ManageDataResponseCache::set($cacheKey, $payload, 22);
            }

            return $this->jsonResponse($response, $payload, 200);
            
        } catch (\Exception $e) {
            error_log("Get data santri error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Terjadi kesalahan'
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
            $pagination = $this->parseListPagination($queryParams);
            $totalRowsForMeta = null;
            $khususCacheKey = null;
            if ($pagination['active']) {
                $khususCacheKey = ManageDataResponseCache::makeKey('data-khusus', $queryParams);
                $hit = ManageDataResponseCache::get($khususCacheKey);
                if ($hit !== null) {
                    return $this->jsonResponse($response, $hit, 200);
                }
            }

            if ($belumAdaKewajiban) {
                $sql = "
                    SELECT 
                        s.id,
                        s.nis,
                        s.nama,
                        s.gender,
                        COALESCE(st.status_santri, s.status_santri, '') AS status_santri,
                        COALESCE(d.kategori, '') AS kategori,
                        s.id_diniyah,
                        ld.nama AS diniyah,
                        rd.kelas AS kelas_diniyah,
                        rd.kel AS kel_diniyah,
                        s.id_formal,
                        lf.nama AS formal,
                        rf.kelas AS kelas_formal,
                        rf.kel AS kel_formal,
                        lt.tingkatan AS lttq,
                        CASE WHEN lt.kelompok LIKE '%-%' THEN SUBSTRING_INDEX(lt.kelompok,'-',1) ELSE COALESCE(lt.kelompok,'') END AS kelas_lttq,
                        CASE WHEN lt.kelompok LIKE '%-%' THEN SUBSTRING_INDEX(lt.kelompok,'-',-1) ELSE '' END AS kel_lttq,
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
                    LEFT JOIN lttq_tingkatan lt ON lt.id = s.id_lttq_tingkatan
                    LEFT JOIN daerah___kamar dk ON dk.id = s.id_kamar
                    LEFT JOIN daerah d ON d.id = dk.id_daerah
                    " . SantriStatusHelper::currentStatusJoinSql('s', 'st', 'ss') . "
                    WHERE NOT EXISTS (SELECT 1 FROM uwaba___khusus k WHERE k.id_santri = s.id)
                ";
                $cursorBelum = $pagination['active'] ? (int) ($pagination['cursor_santri'] ?? 0) : 0;
                if ($pagination['active']) {
                    $cStmt = $this->db->query(
                        'SELECT COUNT(*) FROM santri s WHERE NOT EXISTS (SELECT 1 FROM uwaba___khusus k WHERE k.id_santri = s.id)'
                    );
                    $totalRowsForMeta = (int) $cStmt->fetchColumn();
                    if ($cursorBelum > 0) {
                        $sql .= ' AND s.id > ' . $cursorBelum;
                    }
                    $sql .= ' ORDER BY s.id ASC';
                    if ($cursorBelum <= 0 && $pagination['offset'] > 0) {
                        $sql .= ' LIMIT ' . (int) $pagination['limit'] . ' OFFSET ' . (int) $pagination['offset'];
                    } else {
                        $sql .= ' LIMIT ' . (int) $pagination['limit'];
                    }
                } else {
                    $sql .= ' ORDER BY s.id ASC';
                }
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
                // Satu baris per id_khusus; agregat bayar via subquery (hindari duplikasi JOIN × SUM).
                $whereSql = '';
                $params = [];
                if (!$showAll) {
                    if ($tahunAjaran && $tahunAjaranMasehi) {
                        $whereSql = ' WHERE k.tahun_ajaran = ?';
                        $params[] = $tahunAjaran;
                    } elseif ($tahunAjaran) {
                        $whereSql = ' WHERE k.tahun_ajaran = ?';
                        $params[] = $tahunAjaran;
                    } elseif ($tahunAjaranMasehi) {
                        $whereSql = ' WHERE k.tahun_ajaran = ?';
                        $params[] = $tahunAjaranMasehi;
                    }
                }

                $cursorSid = (int) ($pagination['cursor_sid'] ?? 0);
                $cursorKid = (int) ($pagination['cursor_kid'] ?? 0);
                if ($pagination['active'] && ($cursorSid > 0 || $cursorKid > 0)) {
                    $cursorCond = '(s.id > ' . $cursorSid . ' OR (s.id = ' . $cursorSid . ' AND k.id > ' . $cursorKid . '))';
                    $whereSql .= ($whereSql === '' ? ' WHERE ' : ' AND ') . $cursorCond;
                }

                $statusJoin = SantriStatusHelper::currentStatusJoinSql('s', 'st', 'ss');

                $sqlFrom = "
                    FROM uwaba___khusus k
                    INNER JOIN santri s ON k.id_santri = s.id
                    LEFT JOIN (
                        SELECT id_khusus, COALESCE(SUM(nominal), 0) AS total_bayar
                        FROM uwaba___bayar_khusus
                        GROUP BY id_khusus
                    ) bk_agg ON bk_agg.id_khusus = k.id
                    LEFT JOIN lembaga___rombel rd ON rd.id = s.id_diniyah
                    LEFT JOIN lembaga ld ON ld.id = rd.lembaga_id
                    LEFT JOIN lembaga___rombel rf ON rf.id = s.id_formal
                    LEFT JOIN lembaga lf ON lf.id = rf.lembaga_id
                    LEFT JOIN lttq_tingkatan lt ON lt.id = s.id_lttq_tingkatan
                    LEFT JOIN daerah___kamar dk ON dk.id = s.id_kamar
                    LEFT JOIN daerah d ON d.id = dk.id_daerah
                    {$statusJoin}
                ";

                $sqlSelect = "
                    SELECT 
                        s.id,
                        s.nis,
                        s.nama,
                        s.gender,
                        COALESCE(st.status_santri, s.status_santri, '') AS status_santri,
                        COALESCE(d.kategori, '') AS kategori,
                        s.id_diniyah,
                        ld.nama AS diniyah,
                        rd.kelas AS kelas_diniyah,
                        rd.kel AS kel_diniyah,
                        s.id_formal,
                        lf.nama AS formal,
                        rf.kelas AS kelas_formal,
                        rf.kel AS kel_formal,
                        lt.tingkatan AS lttq,
                        CASE WHEN lt.kelompok LIKE '%-%' THEN SUBSTRING_INDEX(lt.kelompok,'-',1) ELSE COALESCE(lt.kelompok,'') END AS kelas_lttq,
                        CASE WHEN lt.kelompok LIKE '%-%' THEN SUBSTRING_INDEX(lt.kelompok,'-',-1) ELSE '' END AS kel_lttq,
                        s.hijriyah,
                        s.masehi,
                        s.saudara_di_pesantren,
                        k.id as id_khusus,
                        k.tahun_ajaran,
                        k.lembaga,
                        k.keterangan_1,
                        k.keterangan_2,
                        k.wajib as total_wajib,
                        COALESCE(bk_agg.total_bayar, 0) as total_bayar,
                        (k.wajib - COALESCE(bk_agg.total_bayar, 0)) as total_kurang
                    {$sqlFrom}
                    {$whereSql}
                    ORDER BY s.id ASC, k.id ASC
                ";

                if ($pagination['active']) {
                    $countSql = 'SELECT COUNT(*) ' . $sqlFrom . $whereSql;
                    $stmtCount = $this->db->prepare($countSql);
                    if (count($params) > 0) {
                        $stmtCount->execute($params);
                    } else {
                        $stmtCount->execute();
                    }
                    $totalRowsForMeta = (int) $stmtCount->fetchColumn();

                    $sqlFinal = $sqlSelect;
                    if ($cursorSid === 0 && $cursorKid === 0 && $pagination['offset'] > 0) {
                        $sqlFinal .= ' LIMIT ' . (int) $pagination['limit'] . ' OFFSET ' . (int) $pagination['offset'];
                    } else {
                        $sqlFinal .= ' LIMIT ' . (int) $pagination['limit'];
                    }
                } else {
                    $sqlFinal = $sqlSelect;
                }

                $stmt = $this->db->prepare($sqlFinal);
                if (count($params) > 0) {
                    $stmt->execute($params);
                } else {
                    $stmt->execute();
                }
                $data = $this->dedupeManageDataRowsByKey($stmt->fetchAll(\PDO::FETCH_ASSOC), 'id_khusus');
                
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

            $formattedData = $this->enrichManageDataRowsWithWaMeta($formattedData);

            $payload = ['success' => true, 'data' => $formattedData];
            if ($pagination['active'] && $totalRowsForMeta !== null) {
                $n = count($formattedData);
                $lastSid = 0;
                $lastKid = 0;
                if ($n > 0) {
                    $lr = $formattedData[$n - 1];
                    $lastSid = (int) ($lr['id'] ?? 0);
                    $lastKid = (int) ($lr['id_khusus'] ?? 0);
                }
                $cursorSidQ = (int) ($pagination['cursor_sid'] ?? 0);
                $cursorKidQ = (int) ($pagination['cursor_kid'] ?? 0);
                $cursorBelumQ = (int) ($pagination['cursor_santri'] ?? 0);
                $useCompositeCursor = (!$belumAdaKewajiban) && ($cursorSidQ > 0 || $cursorKidQ > 0);
                $useBelumCursor = $belumAdaKewajiban && $cursorBelumQ > 0;
                $hasMoreOffset = ($pagination['offset'] + $n) < $totalRowsForMeta;
                $hasMoreCursorComposite = $useCompositeCursor && $n >= (int) $pagination['limit'] && ($lastSid > 0 || $lastKid > 0);
                $hasMoreCursorBelum = $useBelumCursor && $n >= (int) $pagination['limit'] && $lastSid > 0;
                $payload['meta'] = [
                    'total' => $totalRowsForMeta,
                    'offset' => $pagination['offset'],
                    'limit' => $pagination['limit'],
                    'returned' => $n,
                    'has_more' => ($useCompositeCursor || $useBelumCursor)
                        ? ($hasMoreCursorComposite || $hasMoreCursorBelum)
                        : $hasMoreOffset,
                    'next_cursor' => $belumAdaKewajiban ? ($n > 0 ? $lastSid : null) : null,
                    'next_cursor_sid' => !$belumAdaKewajiban && $n > 0 ? $lastSid : null,
                    'next_cursor_kid' => !$belumAdaKewajiban && $n > 0 ? $lastKid : null,
                ];
            }

            if ($khususCacheKey !== null) {
                ManageDataResponseCache::set($khususCacheKey, $payload, 22);
            }

            return $this->jsonResponse($response, $payload, 200);
            
        } catch (\Exception $e) {
            error_log("Get data khusus error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Terjadi kesalahan'
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
            $pagination = $this->parseListPagination($queryParams);
            $totalRowsForMeta = null;
            $tunggakanCacheKey = null;
            if ($pagination['active']) {
                $tunggakanCacheKey = ManageDataResponseCache::makeKey('data-tunggakan', $queryParams);
                $hitT = ManageDataResponseCache::get($tunggakanCacheKey);
                if ($hitT !== null) {
                    return $this->jsonResponse($response, $hitT, 200);
                }
            }

            if ($belumAdaKewajiban) {
                $sql = "
                    SELECT s.id, s.nis, s.nama, s.gender, COALESCE(st.status_santri, s.status_santri, '') AS status_santri, COALESCE(d.kategori, '') AS kategori,
                        s.id_diniyah, ld.nama AS diniyah, rd.kelas AS kelas_diniyah, rd.kel AS kel_diniyah,
                        s.id_formal, lf.nama AS formal, rf.kelas AS kelas_formal, rf.kel AS kel_formal,
                        lt.tingkatan AS lttq,
                        CASE WHEN lt.kelompok LIKE '%-%' THEN SUBSTRING_INDEX(lt.kelompok,'-',1) ELSE COALESCE(lt.kelompok,'') END AS kelas_lttq,
                        CASE WHEN lt.kelompok LIKE '%-%' THEN SUBSTRING_INDEX(lt.kelompok,'-',-1) ELSE '' END AS kel_lttq,
                        s.hijriyah, s.masehi, s.saudara_di_pesantren,
                        NULL as id_tunggakan, NULL as tahun_ajaran, NULL as lembaga, NULL as keterangan_1, NULL as keterangan_2,
                        0 as total_wajib, 0 as total_bayar, 0 as total_kurang
                    FROM santri s
                    LEFT JOIN lembaga___rombel rd ON rd.id = s.id_diniyah
                    LEFT JOIN lembaga ld ON ld.id = rd.lembaga_id
                    LEFT JOIN lembaga___rombel rf ON rf.id = s.id_formal
                    LEFT JOIN lembaga lf ON lf.id = rf.lembaga_id
                    LEFT JOIN lttq_tingkatan lt ON lt.id = s.id_lttq_tingkatan
                    LEFT JOIN daerah___kamar dk ON dk.id = s.id_kamar
                    LEFT JOIN daerah d ON d.id = dk.id_daerah
                    " . SantriStatusHelper::currentStatusJoinSql('s', 'st', 'ss') . "
                    WHERE NOT EXISTS (SELECT 1 FROM uwaba___tunggakan t WHERE t.id_santri = s.id)
                ";
                $cursorBelumT = $pagination['active'] ? (int) ($pagination['cursor_santri'] ?? 0) : 0;
                if ($pagination['active']) {
                    $cStmt = $this->db->query(
                        'SELECT COUNT(*) FROM santri s WHERE NOT EXISTS (SELECT 1 FROM uwaba___tunggakan t WHERE t.id_santri = s.id)'
                    );
                    $totalRowsForMeta = (int) $cStmt->fetchColumn();
                    if ($cursorBelumT > 0) {
                        $sql .= ' AND s.id > ' . $cursorBelumT;
                    }
                    $sql .= ' ORDER BY s.id ASC';
                    if ($cursorBelumT <= 0 && $pagination['offset'] > 0) {
                        $sql .= ' LIMIT ' . (int) $pagination['limit'] . ' OFFSET ' . (int) $pagination['offset'];
                    } else {
                        $sql .= ' LIMIT ' . (int) $pagination['limit'];
                    }
                } else {
                    $sql .= ' ORDER BY s.id ASC';
                }
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
                $whereSqlT = '';
                $params = [];
                if (!$showAll) {
                    if ($tahunAjaran && $tahunAjaranMasehi) {
                        $whereSqlT = ' WHERE t.tahun_ajaran = ?';
                        $params[] = $tahunAjaran;
                    } elseif ($tahunAjaran) {
                        $whereSqlT = ' WHERE t.tahun_ajaran = ?';
                        $params[] = $tahunAjaran;
                    } elseif ($tahunAjaranMasehi) {
                        $whereSqlT = ' WHERE t.tahun_ajaran = ?';
                        $params[] = $tahunAjaranMasehi;
                    }
                }

                $cursorSidT = (int) ($pagination['cursor_sid'] ?? 0);
                $cursorTid = (int) ($pagination['cursor_tid'] ?? 0);
                if ($pagination['active'] && ($cursorSidT > 0 || $cursorTid > 0)) {
                    $cursorCondT = '(s.id > ' . $cursorSidT . ' OR (s.id = ' . $cursorSidT . ' AND t.id > ' . $cursorTid . '))';
                    $whereSqlT .= ($whereSqlT === '' ? ' WHERE ' : ' AND ') . $cursorCondT;
                }

                $statusJoinT = SantriStatusHelper::currentStatusJoinSql('s', 'st', 'ss');

                $sqlFromT = "
                    FROM uwaba___tunggakan t
                    INNER JOIN santri s ON t.id_santri = s.id
                    LEFT JOIN (
                        SELECT id_tunggakan, COALESCE(SUM(nominal), 0) AS total_bayar
                        FROM uwaba___bayar_tunggakan
                        GROUP BY id_tunggakan
                    ) bt_agg ON bt_agg.id_tunggakan = t.id
                    LEFT JOIN lembaga___rombel rd ON rd.id = s.id_diniyah
                    LEFT JOIN lembaga ld ON ld.id = rd.lembaga_id
                    LEFT JOIN lembaga___rombel rf ON rf.id = s.id_formal
                    LEFT JOIN lembaga lf ON lf.id = rf.lembaga_id
                    LEFT JOIN lttq_tingkatan lt ON lt.id = s.id_lttq_tingkatan
                    {$statusJoinT}
                ";

                $sqlSelectT = "
                    SELECT s.id, s.nis, s.nama, s.gender, COALESCE(st.status_santri, s.status_santri, '') AS status_santri, COALESCE(d.kategori, '') AS kategori,
                        s.id_diniyah, ld.nama AS diniyah, rd.kelas AS kelas_diniyah, rd.kel AS kel_diniyah,
                        s.id_formal, lf.nama AS formal, rf.kelas AS kelas_formal, rf.kel AS kel_formal,
                        lt.tingkatan AS lttq,
                        CASE WHEN lt.kelompok LIKE '%-%' THEN SUBSTRING_INDEX(lt.kelompok,'-',1) ELSE COALESCE(lt.kelompok,'') END AS kelas_lttq,
                        CASE WHEN lt.kelompok LIKE '%-%' THEN SUBSTRING_INDEX(lt.kelompok,'-',-1) ELSE '' END AS kel_lttq,
                        s.hijriyah, s.masehi, s.saudara_di_pesantren,
                        t.id as id_tunggakan, t.tahun_ajaran, t.lembaga, t.keterangan_1, t.keterangan_2,
                        t.wajib as total_wajib,
                        COALESCE(bt_agg.total_bayar, 0) as total_bayar,
                        (t.wajib - COALESCE(bt_agg.total_bayar, 0)) as total_kurang
                    {$sqlFromT}
                    {$whereSqlT}
                    ORDER BY s.id ASC, t.id ASC
                ";

                if ($pagination['active']) {
                    $countSql = 'SELECT COUNT(*) ' . $sqlFromT . $whereSqlT;
                    $stmtCount = $this->db->prepare($countSql);
                    $stmtCount->execute(count($params) > 0 ? $params : []);
                    $totalRowsForMeta = (int) $stmtCount->fetchColumn();

                    $sqlFinalT = $sqlSelectT;
                    if ($cursorSidT === 0 && $cursorTid === 0 && $pagination['offset'] > 0) {
                        $sqlFinalT .= ' LIMIT ' . (int) $pagination['limit'] . ' OFFSET ' . (int) $pagination['offset'];
                    } else {
                        $sqlFinalT .= ' LIMIT ' . (int) $pagination['limit'];
                    }
                } else {
                    $sqlFinalT = $sqlSelectT;
                }

                $stmt = $this->db->prepare($sqlFinalT);
                $stmt->execute(count($params) > 0 ? $params : []);
                $data = $this->dedupeManageDataRowsByKey($stmt->fetchAll(\PDO::FETCH_ASSOC), 'id_tunggakan');
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

            $formattedData = $this->enrichManageDataRowsWithWaMeta($formattedData);

            $payload = ['success' => true, 'data' => $formattedData];
            if ($pagination['active'] && $totalRowsForMeta !== null) {
                $n = count($formattedData);
                $lastSid = 0;
                $lastTid = 0;
                if ($n > 0) {
                    $lr = $formattedData[$n - 1];
                    $lastSid = (int) ($lr['id'] ?? 0);
                    $lastTid = (int) ($lr['id_tunggakan'] ?? 0);
                }
                $cursorSidQ = (int) ($pagination['cursor_sid'] ?? 0);
                $cursorTidQ = (int) ($pagination['cursor_tid'] ?? 0);
                $cursorBelumQ = (int) ($pagination['cursor_santri'] ?? 0);
                $useCompositeCursor = (!$belumAdaKewajiban) && ($cursorSidQ > 0 || $cursorTidQ > 0);
                $useBelumCursor = $belumAdaKewajiban && $cursorBelumQ > 0;
                $hasMoreOffset = ($pagination['offset'] + $n) < $totalRowsForMeta;
                $hasMoreCursorComposite = $useCompositeCursor && $n >= (int) $pagination['limit'] && ($lastSid > 0 || $lastTid > 0);
                $hasMoreCursorBelum = $useBelumCursor && $n >= (int) $pagination['limit'] && $lastSid > 0;
                $payload['meta'] = [
                    'total' => $totalRowsForMeta,
                    'offset' => $pagination['offset'],
                    'limit' => $pagination['limit'],
                    'returned' => $n,
                    'has_more' => ($useCompositeCursor || $useBelumCursor)
                        ? ($hasMoreCursorComposite || $hasMoreCursorBelum)
                        : $hasMoreOffset,
                    'next_cursor' => $belumAdaKewajiban ? ($n > 0 ? $lastSid : null) : null,
                    'next_cursor_sid' => !$belumAdaKewajiban && $n > 0 ? $lastSid : null,
                    'next_cursor_tid' => !$belumAdaKewajiban && $n > 0 ? $lastTid : null,
                ];
            }

            if ($tunggakanCacheKey !== null) {
                ManageDataResponseCache::set($tunggakanCacheKey, $payload, 22);
            }

            return $this->jsonResponse($response, $payload, 200);
        } catch (\Exception $e) {
            error_log("Get data tunggakan error: " . $e->getMessage());
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Terjadi kesalahan'], 500);
        }
    }

    /**
     * Satu baris per kunci kewajiban (id_khusus / id_tunggakan) — pengaman jika JOIN masih menduplikasi.
     *
     * @param array<int, array<string, mixed>> $rows
     * @return array<int, array<string, mixed>>
     */
    private function dedupeManageDataRowsByKey(array $rows, string $keyField): array
    {
        if ($rows === []) {
            return $rows;
        }
        $seen = [];
        $out = [];
        foreach ($rows as $row) {
            $kid = (int) ($row[$keyField] ?? 0);
            if ($kid <= 0 || isset($seen[$kid])) {
                continue;
            }
            $seen[$kid] = true;
            $out[] = $row;
        }

        return $out;
    }

    /**
     * Tambah kolom nomor WA / wali + agregat jumlah pesan log whatsapp per santri (Manage Data).
     *
     * @param array<int, array<string, mixed>> $rows
     * @return array<int, array<string, mixed>>
     */
    private function enrichManageDataRowsWithWaMeta(array $rows): array
    {
        if ($rows === []) {
            return $rows;
        }
        $idSet = [];
        foreach ($rows as $r) {
            if (isset($r['id']) && (int) $r['id'] > 0) {
                $idSet[(int) $r['id']] = true;
            }
        }
        $idList = array_keys($idSet);
        if ($idList === []) {
            return $rows;
        }
        try {
            $tblWa = $this->db->query("SHOW TABLES LIKE 'whatsapp'")->rowCount() > 0;
            $hasWali = $this->db->query("SHOW COLUMNS FROM santri LIKE 'no_telpon_wali'")->rowCount() > 0;
            $cols = 'id, no_wa_santri, no_telpon' . ($hasWali ? ', no_telpon_wali' : '');
            $ph = implode(',', array_fill(0, count($idList), '?'));
            $st = $this->db->prepare("SELECT {$cols} FROM santri WHERE id IN ({$ph})");
            $st->execute($idList);
            $santriById = [];
            while (($row = $st->fetch(\PDO::FETCH_ASSOC)) !== false) {
                $santriById[(int) $row['id']] = $row;
            }

            $waAgg = [];
            if ($tblWa) {
                $ph2 = implode(',', array_fill(0, count($idList), '?'));
                $st2 = $this->db->prepare("SELECT id_santri, nomor_tujuan, COUNT(*) AS c FROM whatsapp WHERE id_santri IN ({$ph2}) GROUP BY id_santri, nomor_tujuan");
                $st2->execute($idList);
                while (($w = $st2->fetch(\PDO::FETCH_ASSOC)) !== false) {
                    $sid = (int) $w['id_santri'];
                    $norm = ManageWaBulkService::normalizeWaDigits($w['nomor_tujuan'] ?? '');
                    if ($norm === '') {
                        continue;
                    }
                    if (!isset($waAgg[$sid])) {
                        $waAgg[$sid] = [];
                    }
                    $waAgg[$sid][$norm] = (int) $w['c'];
                }
            }

            foreach ($rows as $k => $r) {
                $sid = isset($r['id']) ? (int) $r['id'] : 0;
                $sr = $santriById[$sid] ?? null;
                $noWa = $sr ? trim((string) ($sr['no_wa_santri'] ?? '')) : '';
                $noTel = $sr ? trim((string) ($sr['no_telpon'] ?? '')) : '';
                $noWali = ($sr && $hasWali) ? trim((string) ($sr['no_telpon_wali'] ?? '')) : '';
                $rows[$k]['no_wa_santri'] = $noWa;
                $rows[$k]['no_telpon'] = $noTel;
                $rows[$k]['no_telpon_wali'] = $noWali;
                $primaryNorm = ManageWaBulkService::normalizeWaDigits($noWa !== '' ? $noWa : $noTel);
                $waliNorm = ManageWaBulkService::normalizeWaDigits($noWali);
                $agg = $waAgg[$sid] ?? [];
                $rows[$k]['wa_msg_total'] = array_sum($agg);
                $rows[$k]['wa_msg_ke_nomor_utama'] = $primaryNorm !== '' ? (int) ($agg[$primaryNorm] ?? 0) : 0;
                $rows[$k]['wa_msg_ke_wali'] = $waliNorm !== '' ? (int) ($agg[$waliNorm] ?? 0) : 0;
            }
        } catch (\Throwable $e) {
            error_log('enrichManageDataRowsWithWaMeta: ' . $e->getMessage());
        }

        return $rows;
    }

    /**
     * Sidik ringan untuk cache IndexedDB / invalidasi: fingerprint agregat per dataset Manage Data.
     *
     * GET /api/dashboard/manage-data/revision?dataset=uwaba|khusus|tunggakan & query selaras tab (tahun_ajaran, show_all, …).
     */
    public function getManageDataRevision(Request $request, Response $response): Response
    {
        try {
            $q = $request->getQueryParams();
            $dataset = trim((string) ($q['dataset'] ?? ''));
            if (!in_array($dataset, ['uwaba', 'khusus', 'tunggakan'], true)) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Parameter dataset wajib (uwaba|khusus|tunggakan)'], 400);
            }

            $parts = [];

            if ($dataset === 'uwaba') {
                $ta = (string) ($q['tahun_ajaran'] ?? date('Y'));
                $st = $this->db->prepare(
                    'SELECT COUNT(*) FROM santri UNION ALL '
                    . 'SELECT COUNT(*) FROM uwaba WHERE tahun_ajaran = ? UNION ALL '
                    . 'SELECT COALESCE(SUM(wajib),0) FROM uwaba WHERE tahun_ajaran = ? AND IFNULL(is_disabled,0) = 0 UNION ALL '
                    . 'SELECT COALESCE(SUM(nominal),0) FROM uwaba WHERE tahun_ajaran = ? AND IFNULL(is_disabled,0) = 0 UNION ALL '
                    . 'SELECT COALESCE(MAX(id),0) FROM uwaba WHERE tahun_ajaran = ?'
                );
                $st->execute([$ta, $ta, $ta, $ta]);
                while (($row = $st->fetch(\PDO::FETCH_NUM)) !== false) {
                    $parts[] = (string) ($row[0] ?? '0');
                }
                $payload = ['success' => true, 'revision' => md5(implode('|', $parts)), 'dataset' => 'uwaba', 'tahun_ajaran' => $ta];

                return $this->jsonResponse($response, $payload, 200);
            }

            $showAll = isset($q['show_all']) && $q['show_all'] === 'true';
            $belum = isset($q['belum_ada_kewajiban']) && $q['belum_ada_kewajiban'] === 'true';
            $tahunAjaran = $q['tahun_ajaran'] ?? null;
            $tahunAjaranMasehi = $q['tahun_ajaran_masehi'] ?? null;

            if ($dataset === 'khusus') {
                if ($belum) {
                    $cnt = (int) $this->db->query(
                        'SELECT COUNT(*) FROM santri s WHERE NOT EXISTS (SELECT 1 FROM uwaba___khusus k WHERE k.id_santri = s.id)'
                    )->fetchColumn();
                    $parts[] = 'belum:' . $cnt;
                } elseif ($showAll) {
                    $st = $this->db->query(
                        'SELECT COUNT(*) FROM uwaba___khusus UNION ALL SELECT COALESCE(SUM(wajib),0) FROM uwaba___khusus UNION ALL SELECT COUNT(*) FROM uwaba___bayar_khusus'
                    );
                    $i = 0;
                    while (($row = $st->fetch(\PDO::FETCH_NUM)) !== false && $i < 3) {
                        $parts[] = 'all:' . $i . ':' . ($row[0] ?? '0');
                        ++$i;
                    }
                } else {
                    $w = '';
                    $params = [];
                    if ($tahunAjaran && $tahunAjaranMasehi) {
                        $w = 'WHERE tahun_ajaran = ?';
                        $params[] = $tahunAjaran;
                    } elseif ($tahunAjaran) {
                        $w = 'WHERE tahun_ajaran = ?';
                        $params[] = $tahunAjaran;
                    } elseif ($tahunAjaranMasehi) {
                        $w = 'WHERE tahun_ajaran = ?';
                        $params[] = $tahunAjaranMasehi;
                    }
                    $sql = 'SELECT COUNT(*) FROM uwaba___khusus k ' . $w . ' UNION ALL SELECT COALESCE(SUM(k.wajib),0) FROM uwaba___khusus k ' . $w;
                    $st = $this->db->prepare($sql);
                    $st->execute(array_merge($params, $params));
                    while (($row = $st->fetch(\PDO::FETCH_NUM)) !== false) {
                        $parts[] = (string) ($row[0] ?? '0');
                    }
                    $sqlB = 'SELECT COALESCE(SUM(bk.nominal),0) FROM uwaba___bayar_khusus bk INNER JOIN uwaba___khusus k ON bk.id_khusus = k.id ' . $w;
                    $stb = $this->db->prepare($sqlB);
                    $stb->execute($params);
                    $parts[] = (string) ($stb->fetchColumn() ?: '0');
                }
                $payload = ['success' => true, 'revision' => md5(implode('|', $parts)), 'dataset' => 'khusus'];

                return $this->jsonResponse($response, $payload, 200);
            }

            // tunggakan
            if ($belum) {
                $cnt = (int) $this->db->query(
                    'SELECT COUNT(*) FROM santri s WHERE NOT EXISTS (SELECT 1 FROM uwaba___tunggakan t WHERE t.id_santri = s.id)'
                )->fetchColumn();
                $parts[] = 'belum:' . $cnt;
            } elseif ($showAll) {
                $st = $this->db->query(
                    'SELECT COUNT(*) FROM uwaba___tunggakan UNION ALL SELECT COALESCE(SUM(wajib),0) FROM uwaba___tunggakan UNION ALL SELECT COUNT(*) FROM uwaba___bayar_tunggakan'
                );
                $i = 0;
                while (($row = $st->fetch(\PDO::FETCH_NUM)) !== false && $i < 3) {
                    $parts[] = 'all:' . $i . ':' . ($row[0] ?? '0');
                    ++$i;
                }
            } else {
                $w = '';
                $params = [];
                if ($tahunAjaran && $tahunAjaranMasehi) {
                    $w = 'WHERE tahun_ajaran = ?';
                    $params[] = $tahunAjaran;
                } elseif ($tahunAjaran) {
                    $w = 'WHERE tahun_ajaran = ?';
                    $params[] = $tahunAjaran;
                } elseif ($tahunAjaranMasehi) {
                    $w = 'WHERE tahun_ajaran = ?';
                    $params[] = $tahunAjaranMasehi;
                }
                $sql = 'SELECT COUNT(*) FROM uwaba___tunggakan t ' . $w . ' UNION ALL SELECT COALESCE(SUM(t.wajib),0) FROM uwaba___tunggakan t ' . $w;
                $st = $this->db->prepare($sql);
                $st->execute(array_merge($params, $params));
                while (($row = $st->fetch(\PDO::FETCH_NUM)) !== false) {
                    $parts[] = (string) ($row[0] ?? '0');
                }
                $sqlB = 'SELECT COALESCE(SUM(bt.nominal),0) FROM uwaba___bayar_tunggakan bt INNER JOIN uwaba___tunggakan t ON bt.id_tunggakan = t.id ' . $w;
                $stb = $this->db->prepare($sqlB);
                $stb->execute($params);
                $parts[] = (string) ($stb->fetchColumn() ?: '0');
            }
            $payload = ['success' => true, 'revision' => md5(implode('|', $parts)), 'dataset' => 'tunggakan'];

            return $this->jsonResponse($response, $payload, 200);
        } catch (\Throwable $e) {
            error_log('getManageDataRevision: ' . $e->getMessage());

            return $this->jsonResponse($response, ['success' => false, 'message' => 'Terjadi kesalahan'], 500);
        }
    }

    /**
     * Pagination opsional: ?limit=&offset=&cursor=&cursor_sid=&cursor_kid=&cursor_tid=
     * — untuk muat bertahap (Manage Data UWABA/Khusus/Tunggakan). Cursor menggantikan OFFSET bila diisi.
     */
    private const DASHBOARD_LIST_DEFAULT_LIMIT = 500;
    private const DASHBOARD_LIST_MAX_LIMIT = 1000;

    private function parseListPagination(array $queryParams): array
    {
        // Audit Mei 2026: default limit 500 saat klien tidak kirim `limit=` agar
        // query Manage Data (UWABA/Khusus/Tunggakan) tidak ambil ribuan baris sekaligus.
        $limitRaw = $queryParams['limit'] ?? null;
        $offset = max(0, (int) ($queryParams['offset'] ?? 0));
        $cursorSantri = max(0, (int) ($queryParams['cursor'] ?? 0));
        $cursorSid = max(0, (int) ($queryParams['cursor_sid'] ?? 0));
        $cursorKid = max(0, (int) ($queryParams['cursor_kid'] ?? 0));
        $cursorTid = max(0, (int) ($queryParams['cursor_tid'] ?? 0));

        if ($limitRaw === null || $limitRaw === '') {
            return [
                'active' => true,
                'limit' => self::DASHBOARD_LIST_DEFAULT_LIMIT,
                'offset' => $offset,
                'cursor_santri' => $cursorSantri,
                'cursor_sid' => $cursorSid,
                'cursor_kid' => $cursorKid,
                'cursor_tid' => $cursorTid,
            ];
        }

        return [
            'active' => true,
            'limit' => min(self::DASHBOARD_LIST_MAX_LIMIT, max(1, (int) $limitRaw)),
            'offset' => $offset,
            'cursor_santri' => $cursorSantri,
            'cursor_sid' => $cursorSid,
            'cursor_kid' => $cursorKid,
            'cursor_tid' => $cursorTid,
        ];
    }

    private function jsonResponse(Response $response, array $data, int $statusCode): Response
    {
        $response->getBody()->write(json_encode($data));
        return $response
            ->withStatus($statusCode)
            ->withHeader('Content-Type', 'application/json');
    }
}

