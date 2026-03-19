<?php

namespace App\Controllers;

use App\Database;
use App\Helpers\TextSanitizer;
use App\Helpers\UserAktivitasLogger;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

class UmrohPengeluaranController
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
     * GET /api/umroh/pengeluaran - Dapatkan daftar pengeluaran
     */
    public function getAllPengeluaran(Request $request, Response $response): Response
    {
        try {
            $queryParams = $request->getQueryParams();
            $kategori = $queryParams['kategori'] ?? null;
            $status = $queryParams['status'] ?? null;
            $sumberUang = $queryParams['sumber_uang'] ?? null;
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

            if ($sumberUang) {
                $conditions[] = "p.sumber_uang = ?";
                $params[] = $sumberUang;
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
            $countSql = "SELECT COUNT(*) as total FROM umroh___pengeluaran p $whereClause";
            $countStmt = $this->db->prepare($countSql);
            $countStmt->execute($params);
            $total = $countStmt->fetch(\PDO::FETCH_ASSOC)['total'];

            // Get data
            $sql = "SELECT p.*, 
                    pa.nama as admin_nama,
                    paa.nama as admin_approve_nama
                    FROM umroh___pengeluaran p
                    LEFT JOIN pengurus pa ON p.id_admin = pa.id
                    LEFT JOIN pengurus paa ON p.id_admin_approve = paa.id
                    $whereClause
                    ORDER BY p.tanggal_dibuat DESC
                    LIMIT ? OFFSET ?";
            
            $params[] = $limit;
            $params[] = $offset;
            
            $stmt = $this->db->prepare($sql);
            $stmt->execute($params);
            $data = $stmt->fetchAll(\PDO::FETCH_ASSOC);

            // Get details for each pengeluaran
            foreach ($data as &$item) {
                $detailSql = "SELECT * FROM umroh___pengeluaran___detail WHERE id_pengeluaran = ?";
                $detailStmt = $this->db->prepare($detailSql);
                $detailStmt->execute([$item['id']]);
                $item['details'] = $detailStmt->fetchAll(\PDO::FETCH_ASSOC);
            }
            unset($item);

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => $data,
                'pagination' => [
                    'page' => $page,
                    'limit' => $limit,
                    'total' => (int)$total,
                    'total_pages' => ceil($total / $limit)
                ]
            ], 200);

        } catch (\Exception $e) {
            error_log("Get all pengeluaran error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Error fetching pengeluaran data',
                'data' => []
            ], 500);
        }
    }

    /**
     * GET /api/umroh/pengeluaran/{id} - Dapatkan detail pengeluaran by ID
     */
    public function getPengeluaranById(Request $request, Response $response, array $args): Response
    {
        try {
            $id = $args['id'] ?? null;

            if (!$id) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'ID pengeluaran wajib diisi'
                ], 400);
            }

            $sql = "SELECT p.*, 
                    pa.nama as admin_nama,
                    paa.nama as admin_approve_nama
                    FROM umroh___pengeluaran p
                    LEFT JOIN pengurus pa ON p.id_admin = pa.id
                    LEFT JOIN pengurus paa ON p.id_admin_approve = paa.id
                    WHERE p.id = ?";
            $stmt = $this->db->prepare($sql);
            $stmt->execute([$id]);
            $data = $stmt->fetch(\PDO::FETCH_ASSOC);

            if ($data) {
                // Get details
                $detailSql = "SELECT * FROM umroh___pengeluaran___detail WHERE id_pengeluaran = ?";
                $detailStmt = $this->db->prepare($detailSql);
                $detailStmt->execute([$id]);
                $data['details'] = $detailStmt->fetchAll(\PDO::FETCH_ASSOC);

                return $this->jsonResponse($response, [
                    'success' => true,
                    'data' => $data
                ], 200);
            } else {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Pengeluaran tidak ditemukan'
                ], 404);
            }

        } catch (\Exception $e) {
            error_log("Get pengeluaran by ID error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Error fetching pengeluaran data'
            ], 500);
        }
    }

    /**
     * POST /api/umroh/pengeluaran - Buat pengeluaran baru
     */
    public function createPengeluaran(Request $request, Response $response): Response
    {
        try {
            $this->db->beginTransaction();

            $data = $request->getParsedBody();
            $data = is_array($data) ? TextSanitizer::sanitizeStringValues($data, []) : [];
            if (!empty($data['details']) && is_array($data['details'])) {
                $data['details'] = array_map(function ($row) {
                    return is_array($row) ? TextSanitizer::sanitizeStringValues($row, []) : $row;
                }, $data['details']);
            }
            $user = $request->getAttribute('user');
            
            $idAdmin = $user['user_id'] ?? $user['id'] ?? null;
            $keterangan = $data['keterangan'] ?? '';
            $kategori = $data['kategori'] ?? null;
            $sumberUang = $data['sumber_uang'] ?? 'Cash';
            $hijriyah = $data['hijriyah'] ?? null;
            $details = $data['details'] ?? [];
            $status = $data['status'] ?? 'Draft';

            if (empty($keterangan)) {
                $this->db->rollBack();
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Keterangan wajib diisi'
                ], 400);
            }

            if (empty($details) || !is_array($details)) {
                $this->db->rollBack();
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Detail item wajib diisi'
                ], 400);
            }

            // Calculate total nominal
            $totalNominal = 0;
            foreach ($details as $detail) {
                $harga = floatval($detail['harga'] ?? 0);
                $jumlah = intval($detail['jumlah'] ?? 1);
                $totalNominal += $harga * $jumlah;
            }

            if ($totalNominal <= 0) {
                $this->db->rollBack();
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Total nominal harus lebih dari 0'
                ], 400);
            }

            // Validasi kategori
            $validKategori = ['Tiket Pesawat', 'Hotel', 'Visa', 'Transportasi', 'Makanan', 'Dokumentasi', 'Souvenir', 'Operasional', 'Lainnya'];
            if ($kategori && !in_array($kategori, $validKategori)) {
                $this->db->rollBack();
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Kategori tidak valid'
                ], 400);
            }

            // Generate kode pengeluaran
            $kodePengeluaran = $this->generateKodePengeluaran();

            // Insert pengeluaran
            $sql = "INSERT INTO umroh___pengeluaran 
                    (kode_pengeluaran, keterangan, kategori, sumber_uang, bank, no_rekening, 
                     id_admin, nominal, hijriyah, bukti_pengeluaran, status) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
            
            $stmt = $this->db->prepare($sql);
            $stmt->execute([
                $kodePengeluaran,
                $keterangan,
                $kategori,
                $sumberUang,
                $data['bank'] ?? null,
                $data['no_rekening'] ?? null,
                $idAdmin,
                $totalNominal,
                $hijriyah,
                $data['bukti_pengeluaran'] ?? null,
                $status
            ]);

            $idPengeluaran = $this->db->lastInsertId();

            // Insert details
            $sqlDetail = "INSERT INTO umroh___pengeluaran___detail 
                         (id_pengeluaran, item, harga, jumlah, satuan, nominal, keterangan, id_admin) 
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?)";
            $stmtDetail = $this->db->prepare($sqlDetail);

            foreach ($details as $detail) {
                $item = trim($detail['item'] ?? '');
                $harga = floatval($detail['harga'] ?? 0);
                $jumlah = intval($detail['jumlah'] ?? 1);
                $satuan = $detail['satuan'] ?? null;
                $nominal = $harga * $jumlah;
                $keteranganDetail = $detail['keterangan'] ?? null;

                if (empty($item)) {
                    $this->db->rollBack();
                    return $this->jsonResponse($response, [
                        'success' => false,
                        'message' => 'Nama item tidak boleh kosong'
                    ], 400);
                }

                $stmtDetail->execute([
                    $idPengeluaran,
                    $item,
                    $harga,
                    $jumlah,
                    $satuan,
                    $nominal,
                    $keteranganDetail,
                    $idAdmin
                ]);
            }

            $this->db->commit();
            $newRow = $this->db->prepare("SELECT * FROM umroh___pengeluaran WHERE id = ?");
            $newRow->execute([$idPengeluaran]);
            $newRow = $newRow->fetch(\PDO::FETCH_ASSOC);
            if ($newRow && $idAdmin !== null) {
                UserAktivitasLogger::log(null, (int) $idAdmin, UserAktivitasLogger::ACTION_CREATE, 'umroh___pengeluaran', $idPengeluaran, null, $newRow, $request);
            }

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Pengeluaran berhasil dibuat',
                'data' => [
                    'id' => $idPengeluaran,
                    'kode_pengeluaran' => $kodePengeluaran
                ]
            ], 201);

        } catch (\PDOException $e) {
            if ($this->db->inTransaction()) {
                $this->db->rollBack();
            }
            error_log("Error creating pengeluaran: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Terjadi kesalahan saat membuat pengeluaran'
            ], 500);
        } catch (\Exception $e) {
            if ($this->db->inTransaction()) {
                $this->db->rollBack();
            }
            error_log("Error creating pengeluaran: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Terjadi kesalahan saat membuat pengeluaran'
            ], 500);
        }
    }

    /**
     * PUT /api/umroh/pengeluaran/{id} - Update pengeluaran
     */
    public function updatePengeluaran(Request $request, Response $response, array $args): Response
    {
        try {
            $this->db->beginTransaction();

            $id = $args['id'] ?? null;
            $data = $request->getParsedBody();
            $data = is_array($data) ? TextSanitizer::sanitizeStringValues($data, []) : [];
            if (!empty($data['details']) && is_array($data['details'])) {
                $data['details'] = array_map(function ($row) {
                    return is_array($row) ? TextSanitizer::sanitizeStringValues($row, []) : $row;
                }, $data['details']);
            }

            if (!$id) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'ID pengeluaran wajib diisi'
                ], 400);
            }

            // Check if pengeluaran exists
            $checkSql = "SELECT id, status FROM umroh___pengeluaran WHERE id = ?";
            $checkStmt = $this->db->prepare($checkSql);
            $checkStmt->execute([$id]);
            $existing = $checkStmt->fetch(\PDO::FETCH_ASSOC);

            if (!$existing) {
                $this->db->rollBack();
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Pengeluaran tidak ditemukan'
                ], 404);
            }

            // Update pengeluaran fields
            $fields = [
                'keterangan', 'kategori', 'sumber_uang', 'bank', 'no_rekening',
                'hijriyah', 'bukti_pengeluaran', 'status'
            ];

            $set = [];
            $params = [];
            foreach ($fields as $field) {
                if (isset($data[$field])) {
                    $set[] = "$field = ?";
                    $params[] = $data[$field];
                }
            }

            // Update details if provided
            if (isset($data['details']) && is_array($data['details'])) {
                // Delete existing details
                $deleteDetail = "DELETE FROM umroh___pengeluaran___detail WHERE id_pengeluaran = ?";
                $deleteStmt = $this->db->prepare($deleteDetail);
                $deleteStmt->execute([$id]);

                // Recalculate total
                $totalNominal = 0;
                foreach ($data['details'] as $detail) {
                    $harga = floatval($detail['harga'] ?? 0);
                    $jumlah = intval($detail['jumlah'] ?? 1);
                    $totalNominal += $harga * $jumlah;
                }

                // Insert new details
                $sqlDetail = "INSERT INTO umroh___pengeluaran___detail 
                             (id_pengeluaran, item, harga, jumlah, satuan, nominal, keterangan, id_admin) 
                             VALUES (?, ?, ?, ?, ?, ?, ?, ?)";
                $stmtDetail = $this->db->prepare($sqlDetail);
                $user = $request->getAttribute('user');
                $idAdmin = $user['user_id'] ?? $user['id'] ?? null;

                foreach ($data['details'] as $detail) {
                    $item = trim($detail['item'] ?? '');
                    $harga = floatval($detail['harga'] ?? 0);
                    $jumlah = intval($detail['jumlah'] ?? 1);
                    $satuan = $detail['satuan'] ?? null;
                    $nominal = $harga * $jumlah;
                    $keteranganDetail = $detail['keterangan'] ?? null;

                    if (!empty($item)) {
                        $stmtDetail->execute([
                            $id,
                            $item,
                            $harga,
                            $jumlah,
                            $satuan,
                            $nominal,
                            $keteranganDetail,
                            $idAdmin
                        ]);
                    }
                }

                // Update nominal
                $set[] = "nominal = ?";
                $params[] = $totalNominal;
            }

            $checkStmt = $this->db->prepare("SELECT * FROM umroh___pengeluaran WHERE id = ?");
            $checkStmt->execute([$id]);
            $oldPengeluaran = $checkStmt->fetch(\PDO::FETCH_ASSOC);
            if (!empty($set)) {
                $params[] = $id;
                $sql = "UPDATE umroh___pengeluaran SET " . implode(', ', $set) . " WHERE id = ?";
                $stmt = $this->db->prepare($sql);
                $stmt->execute($params);
            }

            $this->db->commit();
            $stmtNew = $this->db->prepare("SELECT * FROM umroh___pengeluaran WHERE id = ?");
            $stmtNew->execute([$id]);
            $newRow = $stmtNew->fetch(\PDO::FETCH_ASSOC);
            $user = $request->getAttribute('user');
            $pengurusId = isset($user['user_id']) ? (int) $user['user_id'] : (isset($user['id']) ? (int) $user['id'] : null);
            if ($newRow && $oldPengeluaran && $pengurusId !== null) {
                UserAktivitasLogger::log(null, $pengurusId, UserAktivitasLogger::ACTION_UPDATE, 'umroh___pengeluaran', $id, $oldPengeluaran, $newRow, $request);
            }

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Pengeluaran berhasil diupdate'
            ], 200);

        } catch (\PDOException $e) {
            if ($this->db->inTransaction()) {
                $this->db->rollBack();
            }
            error_log("Error updating pengeluaran: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Terjadi kesalahan saat mengupdate pengeluaran'
            ], 500);
        } catch (\Exception $e) {
            if ($this->db->inTransaction()) {
                $this->db->rollBack();
            }
            error_log("Error updating pengeluaran: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Terjadi kesalahan saat mengupdate pengeluaran'
            ], 500);
        }
    }

    /**
     * POST /api/umroh/pengeluaran/{id}/approve - Approve pengeluaran
     */
    public function approvePengeluaran(Request $request, Response $response, array $args): Response
    {
        try {
            $id = $args['id'] ?? null;
            $user = $request->getAttribute('user');
            $idAdminApprove = $user['user_id'] ?? $user['id'] ?? null;

            if (!$id) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'ID pengeluaran wajib diisi'
                ], 400);
            }

            $sql = "UPDATE umroh___pengeluaran 
                    SET status = 'Approved', 
                        id_admin_approve = ?,
                        tanggal_approve = NOW()
                    WHERE id = ?";
            $stmt = $this->db->prepare($sql);
            $stmt->execute([$idAdminApprove, $id]);

            if ($stmt->rowCount() > 0) {
                return $this->jsonResponse($response, [
                    'success' => true,
                    'message' => 'Pengeluaran berhasil di-approve'
                ], 200);
            } else {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Pengeluaran tidak ditemukan'
                ], 404);
            }

        } catch (\Exception $e) {
            error_log("Error approving pengeluaran: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Terjadi kesalahan saat approve pengeluaran'
            ], 500);
        }
    }

    /**
     * POST /api/umroh/pengeluaran/{id}/reject - Reject pengeluaran
     */
    public function rejectPengeluaran(Request $request, Response $response, array $args): Response
    {
        try {
            $id = $args['id'] ?? null;

            if (!$id) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'ID pengeluaran wajib diisi'
                ], 400);
            }

            $sql = "UPDATE umroh___pengeluaran 
                    SET status = 'Rejected'
                    WHERE id = ?";
            $stmt = $this->db->prepare($sql);
            $stmt->execute([$id]);

            if ($stmt->rowCount() > 0) {
                return $this->jsonResponse($response, [
                    'success' => true,
                    'message' => 'Pengeluaran berhasil di-reject'
                ], 200);
            } else {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Pengeluaran tidak ditemukan'
                ], 404);
            }

        } catch (\Exception $e) {
            error_log("Error rejecting pengeluaran: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Terjadi kesalahan saat reject pengeluaran'
            ], 500);
        }
    }

    /**
     * DELETE /api/umroh/pengeluaran/{id} - Hapus pengeluaran
     */
    public function deletePengeluaran(Request $request, Response $response, array $args): Response
    {
        try {
            $id = $args['id'] ?? null;

            if (!$id) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'ID pengeluaran wajib diisi'
                ], 400);
            }

            $checkSql = "SELECT * FROM umroh___pengeluaran WHERE id = ?";
            $checkStmt = $this->db->prepare($checkSql);
            $checkStmt->execute([$id]);
            $oldRow = $checkStmt->fetch(\PDO::FETCH_ASSOC);
            if (!$oldRow) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Pengeluaran tidak ditemukan'
                ], 404);
            }

            $sql = "DELETE FROM umroh___pengeluaran WHERE id = ?";
            $stmt = $this->db->prepare($sql);
            $stmt->execute([$id]);
            $user = $request->getAttribute('user');
            $pengurusId = isset($user['user_id']) ? (int) $user['user_id'] : (isset($user['id']) ? (int) $user['id'] : null);
            if ($pengurusId !== null) {
                UserAktivitasLogger::log(null, $pengurusId, UserAktivitasLogger::ACTION_DELETE, 'umroh___pengeluaran', $id, $oldRow, null, $request);
            }

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Pengeluaran berhasil dihapus'
            ], 200);

        } catch (\PDOException $e) {
            error_log("Error deleting pengeluaran: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Terjadi kesalahan saat menghapus pengeluaran'
            ], 500);
        } catch (\Exception $e) {
            error_log("Error deleting pengeluaran: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Terjadi kesalahan saat menghapus pengeluaran'
            ], 500);
        }
    }

    /**
     * Generate unique kode pengeluaran
     */
    private function generateKodePengeluaran(): string
    {
        $prefix = 'PGL-UMR-';
        $sql = "SELECT kode_pengeluaran FROM umroh___pengeluaran WHERE kode_pengeluaran LIKE ? ORDER BY kode_pengeluaran DESC LIMIT 1";
        $stmt = $this->db->prepare($sql);
        $stmt->execute([$prefix . '%']);
        $last = $stmt->fetch(\PDO::FETCH_ASSOC);

        if ($last) {
            $lastNumber = (int)str_replace($prefix, '', $last['kode_pengeluaran']);
            $newNumber = $lastNumber + 1;
        } else {
            $newNumber = 1;
        }

        return $prefix . str_pad($newNumber, 4, '0', STR_PAD_LEFT);
    }
}

