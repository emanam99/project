<?php

namespace App\Controllers;

use App\Database;
use App\Helpers\TextSanitizer;
use App\Helpers\UserAktivitasLogger;
use App\Helpers\ViaPembayaranHelper;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

class PemasukanController
{
    private $db;

    public function __construct()
    {
        $this->db = Database::getInstance()->getConnection();
        $this->ensureColumnsExist();
    }

    /**
     * Ensure dynamic columns exist in pemasukan table
     */
    private function ensureColumnsExist(): void
    {
        try {
            // Check if hijriyah column exists
            $columnCheck = $this->db->query("SHOW COLUMNS FROM pemasukan LIKE 'hijriyah'");
            if ($columnCheck->rowCount() === 0) {
                $this->db->exec("ALTER TABLE pemasukan ADD COLUMN hijriyah VARCHAR(50) NULL AFTER nominal");
                error_log("COLUMN_ADDED: hijriyah column added to pemasukan table");
            }

            // Check if tahun_ajaran column exists
            $columnCheck = $this->db->query("SHOW COLUMNS FROM pemasukan LIKE 'tahun_ajaran'");
            if ($columnCheck->rowCount() === 0) {
                $this->db->exec("ALTER TABLE pemasukan ADD COLUMN tahun_ajaran VARCHAR(20) NULL AFTER hijriyah");
                error_log("COLUMN_ADDED: tahun_ajaran column added to pemasukan table");
            }

            // Check if lembaga column exists
            $columnCheck = $this->db->query("SHOW COLUMNS FROM pemasukan LIKE 'lembaga'");
            if ($columnCheck->rowCount() === 0) {
                $this->db->exec("ALTER TABLE pemasukan ADD COLUMN lembaga VARCHAR(50) NULL AFTER kategori");
                error_log("COLUMN_ADDED: lembaga column added to pemasukan table");
            }
        } catch (\Exception $e) {
            error_log("Error ensuring columns exist: " . $e->getMessage());
        }
    }

    private function jsonResponse(Response $response, array $data, int $statusCode): Response
    {
        $response->getBody()->write(json_encode($data, JSON_UNESCAPED_UNICODE));
        return $response
            ->withStatus($statusCode)
            ->withHeader('Content-Type', 'application/json; charset=utf-8');
    }

    /**
     * POST /api/pemasukan - Buat pemasukan baru
     */
    public function createPemasukan(Request $request, Response $response): Response
    {
        try {
            $data = $request->getParsedBody();
            $user = $request->getAttribute('user');
            
            $idAdmin = $user['user_id'] ?? $user['id'] ?? null;
            $keterangan = TextSanitizer::cleanText($data['keterangan'] ?? '');
            $kategori = $data['kategori'] ?? 'Lainnya';
            $lembaga = $data['lembaga'] ?? null;
            $status = $data['status'] ?? 'Cash';
            $nominal = $data['nominal'] ?? 0;
            $hijriyah = $data['hijriyah'] ?? null;
            $tahunAjaran = $data['tahun_ajaran'] ?? null;

            if (empty($keterangan)) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Keterangan wajib diisi'
                ], 400);
            }

            if (empty($nominal) || $nominal <= 0) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Nominal harus lebih dari 0'
                ], 400);
            }

            // Validasi kategori
            $validKategori = ['UWABA', 'Tunggakan', 'Khusus', 'PSB', 'Beasiswa', 'Lembaga', 'Lainnya', 'Cashback', 'BOS'];
            if ($kategori && !in_array($kategori, $validKategori)) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Kategori tidak valid'
                ], 400);
            }

            // Validasi status
            $validStatus = ['Cash', 'Bank', 'Lainnya'];
            if (!in_array($status, $validStatus)) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Status tidak valid'
                ], 400);
            }

            $sql = "INSERT INTO pemasukan (keterangan, kategori, lembaga, id_admin, status, nominal, hijriyah, tahun_ajaran) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)";
            $stmt = $this->db->prepare($sql);
            $stmt->execute([$keterangan, $kategori, $lembaga, $idAdmin, $status, $nominal, $hijriyah, $tahunAjaran]);
            
            $idPemasukan = $this->db->lastInsertId();

            $stmtNew = $this->db->prepare("SELECT * FROM pemasukan WHERE id = ?");
            $stmtNew->execute([$idPemasukan]);
            $newRow = $stmtNew->fetch(\PDO::FETCH_ASSOC);
            if ($newRow) {
                UserAktivitasLogger::log(null, $idAdmin, UserAktivitasLogger::ACTION_CREATE, 'pemasukan', $idPemasukan, null, $newRow, $request);
            }

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Pemasukan berhasil dibuat',
                'data' => [
                    'id' => $idPemasukan
                ]
            ], 201);

        } catch (\PDOException $e) {
            error_log("Error creating pemasukan: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Terjadi kesalahan saat membuat pemasukan'
            ], 500);
        } catch (\Exception $e) {
            error_log("Error creating pemasukan: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Terjadi kesalahan saat membuat pemasukan'
            ], 500);
        }
    }

    /**
     * GET /api/pemasukan - Dapatkan daftar pemasukan
     */
    public function getPemasukanList(Request $request, Response $response): Response
    {
        try {
            $queryParams = $request->getQueryParams();
            $kategori = $queryParams['kategori'] ?? null;
            $lembaga = $queryParams['lembaga'] ?? null;
            $status = $queryParams['status'] ?? null;
            $tanggalDari = $queryParams['tanggal_dari'] ?? null;
            $tanggalSampai = $queryParams['tanggal_sampai'] ?? null;
            $page = isset($queryParams['page']) ? (int)$queryParams['page'] : 1;
            $limit = isset($queryParams['limit']) ? (int)$queryParams['limit'] : 20;
            $offset = ($page - 1) * $limit;

            $whereClause = '';
            $params = [];
            $conditions = [];

            if ($kategori) {
                $conditions[] = "p.kategori = ?";
                $params[] = $kategori;
            }

            if ($status) {
                $conditions[] = "p.status = ?";
                $params[] = $status;
            }

            if ($lembaga) {
                $conditions[] = "p.lembaga = ?";
                $params[] = $lembaga;
            }

            if ($tanggalDari) {
                $conditions[] = "DATE(p.tanggal_dibuat) >= ?";
                $params[] = $tanggalDari;
            }

            if ($tanggalSampai) {
                $conditions[] = "DATE(p.tanggal_dibuat) <= ?";
                $params[] = $tanggalSampai;
            }

            if (!empty($conditions)) {
                $whereClause = "WHERE " . implode(" AND ", $conditions);
            }

            // Get total count
            $countSql = "SELECT COUNT(*) as total FROM pemasukan p $whereClause";
            $countStmt = $this->db->prepare($countSql);
            $countStmt->execute($params);
            $total = $countStmt->fetch(\PDO::FETCH_ASSOC)['total'];

            // Get data with pagination
            $sql = "SELECT p.*, 
                           pg.nama as admin_nama
                    FROM pemasukan p
                    LEFT JOIN pengurus pg ON p.id_admin = pg.id
                    $whereClause
                    ORDER BY p.tanggal_dibuat DESC
                    LIMIT ? OFFSET ?";
            
            $params[] = $limit;
            $params[] = $offset;
            
            $stmt = $this->db->prepare($sql);
            $stmt->execute($params);
            $pemasukan = $stmt->fetchAll(\PDO::FETCH_ASSOC);

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => [
                    'pemasukan' => $pemasukan,
                    'pagination' => [
                        'page' => $page,
                        'limit' => $limit,
                        'total' => (int)$total,
                        'totalPages' => (int)ceil($total / $limit)
                    ]
                ]
            ], 200);

        } catch (\PDOException $e) {
            error_log("Error getting pemasukan list: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Terjadi kesalahan saat mengambil daftar pemasukan'
            ], 500);
        }
    }

    /**
     * GET /api/pemasukan/{id} - Dapatkan detail pemasukan
     */
    public function getPemasukanDetail(Request $request, Response $response, array $args): Response
    {
        try {
            $id = $args['id'] ?? null;

            if (!$id) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'ID pemasukan tidak valid'
                ], 400);
            }

            $sql = "SELECT p.*, 
                           pg.nama as admin_nama
                    FROM pemasukan p
                    LEFT JOIN pengurus pg ON p.id_admin = pg.id
                    WHERE p.id = ?";
            
            $stmt = $this->db->prepare($sql);
            $stmt->execute([$id]);
            $pemasukan = $stmt->fetch(\PDO::FETCH_ASSOC);

            if (!$pemasukan) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Pemasukan tidak ditemukan'
                ], 404);
            }

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => $pemasukan
            ], 200);

        } catch (\PDOException $e) {
            error_log("Error getting pemasukan detail: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Terjadi kesalahan saat mengambil detail pemasukan'
            ], 500);
        }
    }

    /**
     * PUT /api/pemasukan/{id} - Update pemasukan
     */
    public function updatePemasukan(Request $request, Response $response, array $args): Response
    {
        try {
            $id = $args['id'] ?? null;
            $data = $request->getParsedBody();

            if (!$id) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'ID pemasukan tidak valid'
                ], 400);
            }

            // Check if pemasukan exists and get old row for audit
            $checkSql = "SELECT * FROM pemasukan WHERE id = ?";
            $checkStmt = $this->db->prepare($checkSql);
            $checkStmt->execute([$id]);
            $oldPemasukan = $checkStmt->fetch(\PDO::FETCH_ASSOC);
            if (!$oldPemasukan) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Pemasukan tidak ditemukan'
                ], 404);
            }

            $keterangan = $data['keterangan'] ?? null;
            $kategori = $data['kategori'] ?? null;
            $lembaga = $data['lembaga'] ?? null;
            $status = $data['status'] ?? null;
            $nominal = $data['nominal'] ?? null;
            $hijriyah = $data['hijriyah'] ?? null;
            $tahunAjaran = $data['tahun_ajaran'] ?? null;

            // Build update query dynamically
            $updateFields = [];
            $params = [];

            if ($keterangan !== null) {
                $keterangan = TextSanitizer::cleanText((string) $keterangan);
                if ($keterangan === '') {
                    return $this->jsonResponse($response, [
                        'success' => false,
                        'message' => 'Keterangan tidak boleh kosong'
                    ], 400);
                }
                $updateFields[] = "keterangan = ?";
                $params[] = $keterangan;
            }

            if ($kategori !== null) {
                $validKategori = ['UWABA', 'Tunggakan', 'Khusus', 'PSB', 'Beasiswa', 'Lembaga', 'Lainnya', 'Cashback', 'BOS'];
                if (!in_array($kategori, $validKategori)) {
                    return $this->jsonResponse($response, [
                        'success' => false,
                        'message' => 'Kategori tidak valid'
                    ], 400);
                }
                $updateFields[] = "kategori = ?";
                $params[] = $kategori;
            }

            if ($lembaga !== null) {
                $updateFields[] = "lembaga = ?";
                $params[] = $lembaga !== '' ? $lembaga : null;
            }

            if ($status !== null) {
                $validStatus = ['Cash', 'Bank', 'Lainnya'];
                if (!in_array($status, $validStatus)) {
                    return $this->jsonResponse($response, [
                        'success' => false,
                        'message' => 'Status tidak valid'
                    ], 400);
                }
                $updateFields[] = "status = ?";
                $params[] = $status;
            }

            if ($nominal !== null) {
                if ($nominal <= 0) {
                    return $this->jsonResponse($response, [
                        'success' => false,
                        'message' => 'Nominal harus lebih dari 0'
                    ], 400);
                }
                $updateFields[] = "nominal = ?";
                $params[] = $nominal;
            }

            if ($hijriyah !== null) {
                $updateFields[] = "hijriyah = ?";
                $params[] = $hijriyah;
            }

            if ($tahunAjaran !== null) {
                $updateFields[] = "tahun_ajaran = ?";
                $params[] = $tahunAjaran;
            }

            if (empty($updateFields)) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Tidak ada data yang diupdate'
                ], 400);
            }

            $params[] = $id;
            $sql = "UPDATE pemasukan SET " . implode(", ", $updateFields) . " WHERE id = ?";
            $stmt = $this->db->prepare($sql);
            $stmt->execute($params);

            $stmtNew = $this->db->prepare("SELECT * FROM pemasukan WHERE id = ?");
            $stmtNew->execute([$id]);
            $newPemasukan = $stmtNew->fetch(\PDO::FETCH_ASSOC);
            $user = $request->getAttribute('user');
            $idAdmin = $user['user_id'] ?? $user['id'] ?? null;
            if ($newPemasukan) {
                UserAktivitasLogger::log(null, $idAdmin, UserAktivitasLogger::ACTION_UPDATE, 'pemasukan', $id, $oldPemasukan, $newPemasukan, $request);
            }

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Pemasukan berhasil diupdate'
            ], 200);

        } catch (\PDOException $e) {
            error_log("Error updating pemasukan: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Terjadi kesalahan saat mengupdate pemasukan'
            ], 500);
        }
    }

    /**
     * GET /api/pemasukan/uwaba/pendapatan - Dapatkan total pendapatan UWABA berdasarkan tanggal
     */
    public function getPendapatanUwaba(Request $request, Response $response): Response
    {
        try {
            $queryParams = $request->getQueryParams();
            $tanggal = $queryParams['tanggal'] ?? date('Y-m-d');

            // Validasi format tanggal
            if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $tanggal)) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Format tanggal tidak valid. Gunakan format YYYY-MM-DD'
                ], 400);
            }

            // Query untuk mendapatkan pendapatan UWABA per admin pada tanggal tertentu
            $sql = "SELECT 
                        h.id_admin,
                        pg.nama as admin_nama,
                        COALESCE(SUM(h.nominal), 0) as total_per_admin,
                        COUNT(*) as jumlah_transaksi
                    FROM uwaba___bayar h
                    LEFT JOIN pengurus pg ON h.id_admin = pg.id
                    WHERE DATE(h.masehi) = ?
                    GROUP BY h.id_admin, pg.nama
                    ORDER BY total_per_admin DESC";
            
            $stmt = $this->db->prepare($sql);
            $stmt->execute([$tanggal]);
            $dataPerAdmin = $stmt->fetchAll(\PDO::FETCH_ASSOC);

            // Query untuk mendapatkan detail via per admin
            $listAdmin = [];
            foreach ($dataPerAdmin as $adminRow) {
                $idAdmin = $adminRow['id_admin'];
                
                // Query untuk mendapatkan detail via per admin
                $sqlVia = "SELECT 
                            via,
                            COALESCE(SUM(nominal), 0) as total_via,
                            COUNT(*) as jumlah_transaksi_via
                          FROM uwaba___bayar
                          WHERE DATE(masehi) = ? AND id_admin = ?
                          GROUP BY via
                          ORDER BY total_via DESC";
                
                $stmtVia = $this->db->prepare($sqlVia);
                $stmtVia->execute([$tanggal, $idAdmin]);
                $dataVia = $stmtVia->fetchAll(\PDO::FETCH_ASSOC);
                
                $listVia = ViaPembayaranHelper::mergeAggregatedViaRows($dataVia);
                
                $listAdmin[] = [
                    'id_admin' => $idAdmin,
                    'admin_nama' => $adminRow['admin_nama'] ?? 'Unknown',
                    'total_per_admin' => floatval($adminRow['total_per_admin'] ?? 0),
                    'jumlah_transaksi' => intval($adminRow['jumlah_transaksi'] ?? 0),
                    'list_via' => $listVia
                ];
            }

            // Query untuk mendapatkan total keseluruhan
            $sqlTotal = "SELECT COALESCE(SUM(nominal), 0) as total_pendapatan
                         FROM uwaba___bayar
                         WHERE DATE(masehi) = ?";
            
            $stmtTotal = $this->db->prepare($sqlTotal);
            $stmtTotal->execute([$tanggal]);
            $resultTotal = $stmtTotal->fetch(\PDO::FETCH_ASSOC);
            
            $totalPendapatan = floatval($resultTotal['total_pendapatan'] ?? 0);

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => [
                    'tanggal' => $tanggal,
                    'list_admin' => $listAdmin,
                    'total_pendapatan' => $totalPendapatan
                ]
            ], 200);

        } catch (\PDOException $e) {
            error_log("Error getting pendapatan UWABA: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Terjadi kesalahan saat mengambil pendapatan UWABA'
            ], 500);
        }
    }

    /**
     * GET /api/pemasukan/tunggakan/pendapatan - Dapatkan total pendapatan Tunggakan berdasarkan tanggal
     */
    public function getPendapatanTunggakan(Request $request, Response $response): Response
    {
        try {
            $queryParams = $request->getQueryParams();
            $tanggal = $queryParams['tanggal'] ?? date('Y-m-d');

            // Validasi format tanggal
            if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $tanggal)) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Format tanggal tidak valid. Gunakan format YYYY-MM-DD'
                ], 400);
            }

            // Query untuk mendapatkan pendapatan Tunggakan per admin pada tanggal tertentu
            $sql = "SELECT 
                        b.id_admin,
                        pg.nama as admin_nama,
                        COALESCE(SUM(b.nominal), 0) as total_per_admin,
                        COUNT(*) as jumlah_transaksi
                    FROM uwaba___bayar_tunggakan b
                    LEFT JOIN pengurus pg ON b.id_admin = pg.id
                    WHERE DATE(b.tanggal_dibuat) = ?
                    GROUP BY b.id_admin, pg.nama
                    ORDER BY total_per_admin DESC";
            
            $stmt = $this->db->prepare($sql);
            $stmt->execute([$tanggal]);
            $dataPerAdmin = $stmt->fetchAll(\PDO::FETCH_ASSOC);

            // Query untuk mendapatkan detail via per admin
            $listAdmin = [];
            foreach ($dataPerAdmin as $adminRow) {
                $idAdmin = $adminRow['id_admin'];
                
                // Query untuk mendapatkan detail via per admin
                $sqlVia = "SELECT 
                            via,
                            COALESCE(SUM(nominal), 0) as total_via,
                            COUNT(*) as jumlah_transaksi_via
                          FROM uwaba___bayar_tunggakan
                          WHERE DATE(tanggal_dibuat) = ? AND id_admin = ?
                          GROUP BY via
                          ORDER BY total_via DESC";
                
                $stmtVia = $this->db->prepare($sqlVia);
                $stmtVia->execute([$tanggal, $idAdmin]);
                $dataVia = $stmtVia->fetchAll(\PDO::FETCH_ASSOC);
                
                $listVia = ViaPembayaranHelper::mergeAggregatedViaRows($dataVia);
                
                $listAdmin[] = [
                    'id_admin' => $idAdmin,
                    'admin_nama' => $adminRow['admin_nama'] ?? 'Unknown',
                    'total_per_admin' => floatval($adminRow['total_per_admin'] ?? 0),
                    'jumlah_transaksi' => intval($adminRow['jumlah_transaksi'] ?? 0),
                    'list_via' => $listVia
                ];
            }

            // Query untuk mendapatkan total keseluruhan
            $sqlTotal = "SELECT COALESCE(SUM(nominal), 0) as total_pendapatan
                         FROM uwaba___bayar_tunggakan
                         WHERE DATE(tanggal_dibuat) = ?";
            
            $stmtTotal = $this->db->prepare($sqlTotal);
            $stmtTotal->execute([$tanggal]);
            $resultTotal = $stmtTotal->fetch(\PDO::FETCH_ASSOC);
            
            $totalPendapatan = floatval($resultTotal['total_pendapatan'] ?? 0);

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => [
                    'tanggal' => $tanggal,
                    'list_admin' => $listAdmin,
                    'total_pendapatan' => $totalPendapatan
                ]
            ], 200);

        } catch (\PDOException $e) {
            error_log("Error getting pendapatan Tunggakan: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Terjadi kesalahan saat mengambil pendapatan Tunggakan'
            ], 500);
        }
    }

    /**
     * GET /api/pemasukan/khusus/pendapatan - Dapatkan total pendapatan Khusus berdasarkan tanggal
     */
    public function getPendapatanKhusus(Request $request, Response $response): Response
    {
        try {
            $queryParams = $request->getQueryParams();
            $tanggal = $queryParams['tanggal'] ?? date('Y-m-d');

            // Validasi format tanggal
            if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $tanggal)) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Format tanggal tidak valid. Gunakan format YYYY-MM-DD'
                ], 400);
            }

            // Query untuk mendapatkan pendapatan Khusus per admin pada tanggal tertentu
            $sql = "SELECT 
                        b.id_admin,
                        pg.nama as admin_nama,
                        COALESCE(SUM(b.nominal), 0) as total_per_admin,
                        COUNT(*) as jumlah_transaksi
                    FROM uwaba___bayar_khusus b
                    LEFT JOIN pengurus pg ON b.id_admin = pg.id
                    WHERE DATE(b.tanggal_dibuat) = ?
                    GROUP BY b.id_admin, pg.nama
                    ORDER BY total_per_admin DESC";
            
            $stmt = $this->db->prepare($sql);
            $stmt->execute([$tanggal]);
            $dataPerAdmin = $stmt->fetchAll(\PDO::FETCH_ASSOC);

            // Query untuk mendapatkan detail via per admin
            $listAdmin = [];
            foreach ($dataPerAdmin as $adminRow) {
                $idAdmin = $adminRow['id_admin'];
                
                // Query untuk mendapatkan detail via per admin
                $sqlVia = "SELECT 
                            via,
                            COALESCE(SUM(nominal), 0) as total_via,
                            COUNT(*) as jumlah_transaksi_via
                          FROM uwaba___bayar_khusus
                          WHERE DATE(tanggal_dibuat) = ? AND id_admin = ?
                          GROUP BY via
                          ORDER BY total_via DESC";
                
                $stmtVia = $this->db->prepare($sqlVia);
                $stmtVia->execute([$tanggal, $idAdmin]);
                $dataVia = $stmtVia->fetchAll(\PDO::FETCH_ASSOC);
                
                $listVia = ViaPembayaranHelper::mergeAggregatedViaRows($dataVia);
                
                $listAdmin[] = [
                    'id_admin' => $idAdmin,
                    'admin_nama' => $adminRow['admin_nama'] ?? 'Unknown',
                    'total_per_admin' => floatval($adminRow['total_per_admin'] ?? 0),
                    'jumlah_transaksi' => intval($adminRow['jumlah_transaksi'] ?? 0),
                    'list_via' => $listVia
                ];
            }

            // Query untuk mendapatkan total keseluruhan
            $sqlTotal = "SELECT COALESCE(SUM(nominal), 0) as total_pendapatan
                         FROM uwaba___bayar_khusus
                         WHERE DATE(tanggal_dibuat) = ?";
            
            $stmtTotal = $this->db->prepare($sqlTotal);
            $stmtTotal->execute([$tanggal]);
            $resultTotal = $stmtTotal->fetch(\PDO::FETCH_ASSOC);
            
            $totalPendapatan = floatval($resultTotal['total_pendapatan'] ?? 0);

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => [
                    'tanggal' => $tanggal,
                    'list_admin' => $listAdmin,
                    'total_pendapatan' => $totalPendapatan
                ]
            ], 200);

        } catch (\PDOException $e) {
            error_log("Error getting pendapatan Khusus: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Terjadi kesalahan saat mengambil pendapatan Khusus'
            ], 500);
        }
    }

    /**
     * GET /api/pemasukan/pendaftaran/pendapatan - Dapatkan total pendapatan Pendaftaran berdasarkan tanggal
     */
    public function getPendapatanPendaftaran(Request $request, Response $response): Response
    {
        try {
            $queryParams = $request->getQueryParams();
            $tanggal = $queryParams['tanggal'] ?? date('Y-m-d');

            // Validasi format tanggal
            if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $tanggal)) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Format tanggal tidak valid. Gunakan format YYYY-MM-DD'
                ], 400);
            }

            // Query untuk mendapatkan pendapatan Pendaftaran per admin pada tanggal tertentu
            $sql = "SELECT 
                        b.id_admin,
                        pg.nama as admin_nama,
                        COALESCE(SUM(b.nominal), 0) as total_per_admin,
                        COUNT(*) as jumlah_transaksi
                    FROM psb___transaksi b
                    LEFT JOIN pengurus pg ON b.id_admin = pg.id
                    WHERE DATE(b.masehi) = ?
                    GROUP BY b.id_admin, pg.nama
                    ORDER BY total_per_admin DESC";
            
            $stmt = $this->db->prepare($sql);
            $stmt->execute([$tanggal]);
            $dataPerAdmin = $stmt->fetchAll(\PDO::FETCH_ASSOC);

            // Query untuk mendapatkan detail via per admin
            $listAdmin = [];
            foreach ($dataPerAdmin as $adminRow) {
                $idAdmin = $adminRow['id_admin'];
                
                // Query untuk mendapatkan detail via per admin
                $sqlVia = "SELECT 
                            via,
                            COALESCE(SUM(nominal), 0) as total_via,
                            COUNT(*) as jumlah_transaksi_via
                          FROM psb___transaksi
                          WHERE DATE(masehi) = ? AND id_admin = ?
                          GROUP BY via
                          ORDER BY total_via DESC";
                
                $stmtVia = $this->db->prepare($sqlVia);
                $stmtVia->execute([$tanggal, $idAdmin]);
                $dataVia = $stmtVia->fetchAll(\PDO::FETCH_ASSOC);
                
                $listVia = ViaPembayaranHelper::mergeAggregatedViaRows($dataVia);
                
                $listAdmin[] = [
                    'id_admin' => $idAdmin,
                    'admin_nama' => $adminRow['admin_nama'] ?? 'Unknown',
                    'total_per_admin' => floatval($adminRow['total_per_admin'] ?? 0),
                    'jumlah_transaksi' => intval($adminRow['jumlah_transaksi'] ?? 0),
                    'list_via' => $listVia
                ];
            }

            // Query untuk mendapatkan total keseluruhan
            $sqlTotal = "SELECT COALESCE(SUM(nominal), 0) as total_pendapatan
                         FROM psb___transaksi
                         WHERE DATE(masehi) = ?";
            
            $stmtTotal = $this->db->prepare($sqlTotal);
            $stmtTotal->execute([$tanggal]);
            $resultTotal = $stmtTotal->fetch(\PDO::FETCH_ASSOC);
            
            $totalPendapatan = floatval($resultTotal['total_pendapatan'] ?? 0);

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => [
                    'tanggal' => $tanggal,
                    'list_admin' => $listAdmin,
                    'total_pendapatan' => $totalPendapatan
                ]
            ], 200);

        } catch (\PDOException $e) {
            error_log("Error getting pendapatan Pendaftaran: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Terjadi kesalahan saat mengambil pendapatan Pendaftaran'
            ], 500);
        }
    }

    /**
     * DELETE /api/pemasukan/{id} - Hapus pemasukan
     */
    public function deletePemasukan(Request $request, Response $response, array $args): Response
    {
        try {
            $id = $args['id'] ?? null;

            if (!$id) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'ID pemasukan tidak valid'
                ], 400);
            }

            // Check if pemasukan exists and get full row for audit
            $checkSql = "SELECT * FROM pemasukan WHERE id = ?";
            $checkStmt = $this->db->prepare($checkSql);
            $checkStmt->execute([$id]);
            $oldPemasukan = $checkStmt->fetch(\PDO::FETCH_ASSOC);
            if (!$oldPemasukan) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Pemasukan tidak ditemukan'
                ], 404);
            }

            $user = $request->getAttribute('user');
            $idAdmin = $user['user_id'] ?? $user['id'] ?? null;

            $sql = "DELETE FROM pemasukan WHERE id = ?";
            $stmt = $this->db->prepare($sql);
            $stmt->execute([$id]);

            UserAktivitasLogger::log(null, $idAdmin, UserAktivitasLogger::ACTION_DELETE, 'pemasukan', $id, $oldPemasukan, null, $request);

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Pemasukan berhasil dihapus'
            ], 200);

        } catch (\PDOException $e) {
            error_log("Error deleting pemasukan: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Terjadi kesalahan saat menghapus pemasukan'
            ], 500);
        }
    }
}

