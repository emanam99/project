<?php

namespace App\Controllers;

use App\Database;
use App\Helpers\TextSanitizer;
use App\Helpers\UserAktivitasLogger;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

class JabatanController
{
    private $db;

    public function __construct()
    {
        $this->db = Database::getInstance()->getConnection();
    }

    /**
     * GET /api/jabatan - Get all jabatan with pagination and filters
     */
    public function getAllJabatan(Request $request, Response $response): Response
    {
        try {
            $queryParams = $request->getQueryParams();
            
            // Pagination
            $page = isset($queryParams['page']) ? (int)$queryParams['page'] : 1;
            $limit = isset($queryParams['limit']) ? (int)$queryParams['limit'] : 10;
            $offset = ($page - 1) * $limit;
            
            // Filters
            $search = $queryParams['search'] ?? '';
            $kategoriFilter = $queryParams['kategori'] ?? '';
            $lembagaFilter = $queryParams['lembaga_id'] ?? '';
            $statusFilter = $queryParams['status'] ?? '';
            
            // Build WHERE clause
            $whereConditions = [];
            $params = [];
            
            if (!empty($search)) {
                $whereConditions[] = "(j.nama LIKE ? OR j.deskripsi LIKE ?)";
                $searchParam = "%{$search}%";
                $params[] = $searchParam;
                $params[] = $searchParam;
            }
            
            if (!empty($kategoriFilter)) {
                $whereConditions[] = "j.kategori = ?";
                $params[] = $kategoriFilter;
            }
            
            if (!empty($lembagaFilter)) {
                $whereConditions[] = "j.lembaga_id = ?";
                $params[] = $lembagaFilter;
            }
            
            if (!empty($statusFilter)) {
                $whereConditions[] = "j.status = ?";
                $params[] = $statusFilter;
            }
            
            $whereClause = !empty($whereConditions) ? "WHERE " . implode(" AND ", $whereConditions) : "";
            
            // Get total count
            $countParams = $params;
            $countSql = "SELECT COUNT(*) as total FROM jabatan j {$whereClause}";
            $countStmt = $this->db->prepare($countSql);
            $countStmt->execute($countParams);
            $total = $countStmt->fetch(\PDO::FETCH_ASSOC)['total'];
            
            // Get data with pagination
            $sql = "SELECT 
                        j.id,
                        j.nama,
                        j.kategori,
                        j.lembaga_id,
                        l.nama as lembaga_nama,
                        j.deskripsi,
                        j.urutan,
                        j.status,
                        j.tanggal_dibuat,
                        j.tanggal_update
                    FROM jabatan j
                    LEFT JOIN lembaga l ON j.lembaga_id = l.id
                    {$whereClause}
                    ORDER BY j.urutan ASC, j.nama ASC
                    LIMIT ? OFFSET ?";
            
            $params[] = $limit;
            $params[] = $offset;
            
            $stmt = $this->db->prepare($sql);
            $stmt->execute($params);
            $jabatanList = $stmt->fetchAll(\PDO::FETCH_ASSOC);
            
            return $this->jsonResponse($response, [
                'success' => true,
                'data' => [
                    'jabatan' => $jabatanList,
                    'pagination' => [
                        'page' => $page,
                        'limit' => $limit,
                        'total' => (int)$total,
                        'total_pages' => ceil($total / $limit)
                    ]
                ]
            ], 200);
            
        } catch (\Exception $e) {
            error_log("Get all jabatan error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil data jabatan: ' . $e->getMessage()
            ], 500);
        }
    }
    
    /**
     * GET /api/jabatan/{id} - Get jabatan by ID
     */
    public function getJabatanById(Request $request, Response $response, array $args): Response
    {
        try {
            $jabatanId = $args['id'] ?? '';
            
            if (empty($jabatanId)) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Jabatan ID diperlukan'
                ], 400);
            }
            
            $sql = "SELECT 
                        j.id,
                        j.nama,
                        j.kategori,
                        j.lembaga_id,
                        l.nama as lembaga_nama,
                        j.deskripsi,
                        j.urutan,
                        j.status,
                        j.tanggal_dibuat,
                        j.tanggal_update
                    FROM jabatan j
                    LEFT JOIN lembaga l ON j.lembaga_id = l.id
                    WHERE j.id = ?";
            
            $stmt = $this->db->prepare($sql);
            $stmt->execute([$jabatanId]);
            $jabatan = $stmt->fetch(\PDO::FETCH_ASSOC);
            
            if (!$jabatan) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Jabatan tidak ditemukan'
                ], 404);
            }
            
            return $this->jsonResponse($response, [
                'success' => true,
                'data' => [
                    'jabatan' => $jabatan
                ]
            ], 200);
            
        } catch (\Exception $e) {
            error_log("Get jabatan by ID error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil data jabatan: ' . $e->getMessage()
            ], 500);
        }
    }
    
    /**
     * POST /api/jabatan - Create new jabatan
     */
    public function createJabatan(Request $request, Response $response): Response
    {
        try {
            $data = $request->getParsedBody();
            $user = $request->getAttribute('user');
            
            // Validation
            if (empty($data['nama']) || trim($data['nama']) === '') {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Nama jabatan tidak boleh kosong'
                ], 400);
            }
            
            // Validate kategori
            $allowedKategori = ['struktural', 'diniyah', 'formal'];
            $kategori = $data['kategori'] ?? 'struktural';
            if (!in_array($kategori, $allowedKategori)) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Kategori tidak valid. Harus salah satu dari: ' . implode(', ', $allowedKategori)
                ], 400);
            }
            
            // Validate status
            $allowedStatus = ['aktif', 'nonaktif'];
            $status = $data['status'] ?? 'aktif';
            if (!in_array($status, $allowedStatus)) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Status tidak valid. Harus salah satu dari: ' . implode(', ', $allowedStatus)
                ], 400);
            }
            
            // Insert jabatan
            $sql = "INSERT INTO jabatan (nama, kategori, lembaga_id, deskripsi, urutan, status) 
                    VALUES (?, ?, ?, ?, ?, ?)";
            
            $stmt = $this->db->prepare($sql);
            $stmt->execute([
                TextSanitizer::cleanText($data['nama'] ?? ''),
                $kategori,
                $data['lembaga_id'] ?? null,
                TextSanitizer::cleanTextOrNull($data['deskripsi'] ?? null),
                isset($data['urutan']) ? (int)$data['urutan'] : 0,
                $status
            ]);
            
            $jabatanId = (int) $this->db->lastInsertId();
            $newRow = $this->db->prepare("SELECT * FROM jabatan WHERE id = ?");
            $newRow->execute([$jabatanId]);
            $newRow = $newRow->fetch(\PDO::FETCH_ASSOC);
            $pengurusId = isset($user['user_id']) ? (int) $user['user_id'] : (isset($user['id']) ? (int) $user['id'] : null);
            if ($newRow && $pengurusId !== null) {
                UserAktivitasLogger::log(null, $pengurusId, UserAktivitasLogger::ACTION_CREATE, 'jabatan', $jabatanId, null, $newRow, $request);
            }
            
            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Jabatan berhasil dibuat',
                'data' => [
                    'id' => $jabatanId
                ]
            ], 201);
            
        } catch (\Exception $e) {
            error_log("Create jabatan error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal membuat jabatan: ' . $e->getMessage()
            ], 500);
        }
    }
    
    /**
     * PUT /api/jabatan/{id} - Update jabatan
     */
    public function updateJabatan(Request $request, Response $response, array $args): Response
    {
        try {
            $jabatanId = $args['id'] ?? '';
            $data = $request->getParsedBody();
            
            if (empty($jabatanId)) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Jabatan ID diperlukan'
                ], 400);
            }
            
            $checkStmt = $this->db->prepare("SELECT * FROM jabatan WHERE id = ?");
            $checkStmt->execute([$jabatanId]);
            $oldJabatan = $checkStmt->fetch(\PDO::FETCH_ASSOC);
            if (!$oldJabatan) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Jabatan tidak ditemukan'
                ], 404);
            }
            
            // Validation
            if (isset($data['nama']) && empty(trim($data['nama']))) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Nama jabatan tidak boleh kosong'
                ], 400);
            }
            
            // Validate kategori if provided
            if (isset($data['kategori'])) {
                $allowedKategori = ['struktural', 'diniyah', 'formal'];
                if (!in_array($data['kategori'], $allowedKategori)) {
                    return $this->jsonResponse($response, [
                        'success' => false,
                        'message' => 'Kategori tidak valid'
                    ], 400);
                }
            }
            
            // Validate status if provided
            if (isset($data['status'])) {
                $allowedStatus = ['aktif', 'nonaktif'];
                if (!in_array($data['status'], $allowedStatus)) {
                    return $this->jsonResponse($response, [
                        'success' => false,
                        'message' => 'Status tidak valid'
                    ], 400);
                }
            }
            
            // Build update query
            $updateFields = [];
            $updateParams = [];
            
            if (isset($data['nama'])) {
                $updateFields[] = "nama = ?";
                $updateParams[] = TextSanitizer::cleanText($data['nama'] ?? '');
            }
            
            if (isset($data['kategori'])) {
                $updateFields[] = "kategori = ?";
                $updateParams[] = $data['kategori'];
            }
            
            if (isset($data['lembaga_id'])) {
                $updateFields[] = "lembaga_id = ?";
                $updateParams[] = $data['lembaga_id'] ?: null;
            }
            
            if (isset($data['deskripsi'])) {
                $updateFields[] = "deskripsi = ?";
                $updateParams[] = TextSanitizer::cleanTextOrNull($data['deskripsi']) ?: null;
            }
            
            if (isset($data['urutan'])) {
                $updateFields[] = "urutan = ?";
                $updateParams[] = (int)$data['urutan'];
            }
            
            if (isset($data['status'])) {
                $updateFields[] = "status = ?";
                $updateParams[] = $data['status'];
            }
            
            if (empty($updateFields)) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Tidak ada data yang diupdate'
                ], 400);
            }
            
            $updateParams[] = $jabatanId;
            
            $sql = "UPDATE jabatan SET " . implode(", ", $updateFields) . " WHERE id = ?";
            $stmt = $this->db->prepare($sql);
            $stmt->execute($updateParams);
            $stmtNew = $this->db->prepare("SELECT * FROM jabatan WHERE id = ?");
            $stmtNew->execute([$jabatanId]);
            $newJabatan = $stmtNew->fetch(\PDO::FETCH_ASSOC);
            $user = $request->getAttribute('user');
            $pengurusId = isset($user['user_id']) ? (int) $user['user_id'] : (isset($user['id']) ? (int) $user['id'] : null);
            if ($newJabatan && $pengurusId !== null) {
                UserAktivitasLogger::log(null, $pengurusId, UserAktivitasLogger::ACTION_UPDATE, 'jabatan', $jabatanId, $oldJabatan, $newJabatan, $request);
            }
            
            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Jabatan berhasil diperbarui'
            ], 200);
            
        } catch (\Exception $e) {
            error_log("Update jabatan error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal memperbarui jabatan: ' . $e->getMessage()
            ], 500);
        }
    }
    
    /**
     * DELETE /api/jabatan/{id} - Delete jabatan
     */
    public function deleteJabatan(Request $request, Response $response, array $args): Response
    {
        try {
            $jabatanId = $args['id'] ?? '';
            
            if (empty($jabatanId)) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Jabatan ID diperlukan'
                ], 400);
            }
            
            $checkStmt = $this->db->prepare("SELECT * FROM jabatan WHERE id = ?");
            $checkStmt->execute([$jabatanId]);
            $oldJabatan = $checkStmt->fetch(\PDO::FETCH_ASSOC);
            if (!$oldJabatan) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Jabatan tidak ditemukan'
                ], 404);
            }
            
            // Check if jabatan is used in pengurus___jabatan
            $checkUsedStmt = $this->db->prepare("SELECT COUNT(*) as count FROM pengurus___jabatan WHERE jabatan_id = ?");
            $checkUsedStmt->execute([$jabatanId]);
            $usedCount = $checkUsedStmt->fetch(\PDO::FETCH_ASSOC)['count'];
            
            if ($usedCount > 0) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => "Jabatan tidak dapat dihapus karena masih digunakan oleh {$usedCount} pengurus"
                ], 400);
            }
            
            $deleteStmt = $this->db->prepare("DELETE FROM jabatan WHERE id = ?");
            $deleteStmt->execute([$jabatanId]);
            $user = $request->getAttribute('user');
            $pengurusId = isset($user['user_id']) ? (int) $user['user_id'] : (isset($user['id']) ? (int) $user['id'] : null);
            if ($pengurusId !== null) {
                UserAktivitasLogger::log(null, $pengurusId, UserAktivitasLogger::ACTION_DELETE, 'jabatan', $jabatanId, $oldJabatan, null, $request);
            }
            
            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Jabatan berhasil dihapus'
            ], 200);
            
        } catch (\Exception $e) {
            error_log("Delete jabatan error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal menghapus jabatan: ' . $e->getMessage()
            ], 500);
        }
    }
    
    /**
     * GET /api/jabatan/list - Get simple list of all jabatan (for dropdowns)
     */
    public function getJabatanList(Request $request, Response $response): Response
    {
        try {
            $queryParams = $request->getQueryParams();
            $kategoriFilter = $queryParams['kategori'] ?? '';
            $lembagaFilter = $queryParams['lembaga_id'] ?? '';
            $statusFilter = $queryParams['status'] ?? 'aktif'; // Default hanya aktif
            
            $whereConditions = ["j.status = 'aktif'"]; // Default hanya aktif
            $params = [];
            
            if (!empty($kategoriFilter)) {
                $whereConditions[] = "j.kategori = ?";
                $params[] = $kategoriFilter;
            }
            
            if (!empty($lembagaFilter)) {
                $whereConditions[] = "j.lembaga_id = ?";
                $params[] = $lembagaFilter;
            }
            
            if (!empty($statusFilter) && $statusFilter !== 'aktif') {
                $whereConditions[0] = "j.status = ?";
                $params = array_merge([$statusFilter], $params);
            }
            
            $whereClause = "WHERE " . implode(" AND ", $whereConditions);
            
            $sql = "SELECT j.id, j.nama, j.kategori, j.lembaga_id, l.nama as lembaga_nama
                    FROM jabatan j
                    LEFT JOIN lembaga l ON j.lembaga_id = l.id
                    {$whereClause}
                    ORDER BY j.urutan ASC, j.nama ASC";
            
            $stmt = $this->db->prepare($sql);
            $stmt->execute($params);
            $jabatanList = $stmt->fetchAll(\PDO::FETCH_ASSOC);
            
            return $this->jsonResponse($response, [
                'success' => true,
                'data' => $jabatanList
            ], 200);
            
        } catch (\Exception $e) {
            error_log("Get jabatan list error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil data jabatan: ' . $e->getMessage()
            ], 500);
        }
    }
    
    /**
     * Helper method untuk JSON response
     */
    private function jsonResponse(Response $response, array $data, int $statusCode = 200): Response
    {
        $response->getBody()->write(json_encode($data, JSON_UNESCAPED_UNICODE));
        return $response
            ->withHeader('Content-Type', 'application/json')
            ->withStatus($statusCode);
    }
}

