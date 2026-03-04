<?php

namespace App\Controllers;

use App\Database;
use App\Helpers\UserAktivitasLogger;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

class PengaturanController
{
    private $db;

    /** Path folder upload (base + UPLOADS_FOLDER: uploads atau uploads2) */
    private string $uploadsPath;

    public function __construct()
    {
        $this->db = Database::getInstance()->getConnection();
        $config = require __DIR__ . '/../../config.php';
        $base = rtrim($config['uploads_base_path'] ?? __DIR__ . '/../..', '/\\');
        $folder = $config['uploads_folder'] ?? 'uploads';
        $this->uploadsPath = $base . '/' . trim($folder, '/\\');
    }

    private function resolveUploadPath(string $pathFile): string
    {
        $pathFile = preg_replace('#^uploads2?/#', '', str_replace(['\\'], '/', $pathFile));
        return $this->uploadsPath . '/' . ltrim($pathFile, '/');
    }

    private function jsonResponse(Response $response, array $data, int $statusCode): Response
    {
        $response->getBody()->write(json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
        return $response
            ->withStatus($statusCode)
            ->withHeader('Content-Type', 'application/json; charset=utf-8');
    }

    /**
     * GET /api/pengaturan - Ambil semua pengaturan
     */
    public function getAll(Request $request, Response $response): Response
    {
        try {
            $queryParams = $request->getQueryParams();
            $kategori = $queryParams['kategori'] ?? null;

            $sql = "SELECT * FROM psb___pengaturan";
            $params = [];

            if ($kategori) {
                $sql .= " WHERE kategori = ?";
                $params[] = $kategori;
            }

            $sql .= " ORDER BY kategori ASC, urutan ASC, id ASC";

            $stmt = $this->db->prepare($sql);
            $stmt->execute($params);
            $results = $stmt->fetchAll(\PDO::FETCH_ASSOC);

            // Format data - handle jika results kosong
            $formattedData = [];
            if ($results) {
                $formattedData = array_map(function($row) {
                    return [
                        'id' => (int)$row['id'],
                        'key' => $row['key'],
                        'value' => $row['value'],
                        'type' => $row['type'],
                        'label' => $row['label'],
                        'keterangan' => $row['keterangan'],
                        'kategori' => $row['kategori'],
                        'urutan' => (int)$row['urutan'],
                        'tanggal_dibuat' => $row['tanggal_dibuat'],
                        'tanggal_update' => $row['tanggal_update']
                    ];
                }, $results);
            }

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => $formattedData
            ], 200);

        } catch (\PDOException $e) {
            // Jika tabel tidak ada (error code 42S02), return array kosong
            if ($e->getCode() == '42S02' || strpos($e->getMessage(), "doesn't exist") !== false) {
                return $this->jsonResponse($response, [
                    'success' => true,
                    'data' => []
                ], 200);
            }
            error_log("Get all pengaturan PDO error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil data pengaturan: ' . $e->getMessage()
            ], 500);
        } catch (\Exception $e) {
            error_log("Get all pengaturan error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil data pengaturan: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * GET /api/pengaturan/{key} - Ambil pengaturan berdasarkan key
     */
    public function getByKey(Request $request, Response $response, array $args): Response
    {
        try {
            $key = $args['key'] ?? null;

            if (!$key) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Parameter key wajib diisi'
                ], 400);
            }

            $sql = "SELECT * FROM psb___pengaturan WHERE `key` = ?";
            $stmt = $this->db->prepare($sql);
            $stmt->execute([$key]);
            $result = $stmt->fetch(\PDO::FETCH_ASSOC);

            if (!$result) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Pengaturan tidak ditemukan'
                ], 404);
            }

            $formattedData = [
                'id' => (int)$result['id'],
                'key' => $result['key'],
                'value' => $result['value'],
                'type' => $result['type'],
                'label' => $result['label'],
                'keterangan' => $result['keterangan'],
                'kategori' => $result['kategori'],
                'urutan' => (int)$result['urutan'],
                'tanggal_dibuat' => $result['tanggal_dibuat'],
                'tanggal_update' => $result['tanggal_update']
            ];

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => $formattedData
            ], 200);

        } catch (\PDOException $e) {
            // Jika tabel tidak ada, return not found
            if ($e->getCode() == '42S02' || strpos($e->getMessage(), "doesn't exist") !== false) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Pengaturan tidak ditemukan'
                ], 404);
            }
            error_log("Get pengaturan by key PDO error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil pengaturan: ' . $e->getMessage()
            ], 500);
        } catch (\Exception $e) {
            error_log("Get pengaturan by key error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil pengaturan: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * POST /api/pengaturan - Buat pengaturan baru
     */
    public function create(Request $request, Response $response): Response
    {
        try {
            $input = $request->getParsedBody();

            if (!isset($input['key']) || empty($input['key'])) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Key wajib diisi'
                ], 400);
            }

            if (!isset($input['label']) || empty($input['label'])) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Label wajib diisi'
                ], 400);
            }

            $key = $input['key'];
            $value = $input['value'] ?? null;
            $type = $input['type'] ?? 'text';
            $label = $input['label'];
            $keterangan = $input['keterangan'] ?? null;
            $kategori = $input['kategori'] ?? null;
            $urutan = isset($input['urutan']) ? (int)$input['urutan'] : 0;

            // Cek apakah key sudah ada (jika tabel ada)
            try {
                $checkSql = "SELECT id FROM psb___pengaturan WHERE `key` = ?";
                $checkStmt = $this->db->prepare($checkSql);
                $checkStmt->execute([$key]);
                if ($checkStmt->fetch()) {
                    return $this->jsonResponse($response, [
                        'success' => false,
                        'message' => 'Key sudah terdaftar. Gunakan PUT untuk update.'
                    ], 409);
                }
            } catch (\PDOException $e) {
                // Jika tabel tidak ada, lanjutkan untuk insert (tabel akan dibuat oleh migration)
                if ($e->getCode() != '42S02' && strpos($e->getMessage(), "doesn't exist") === false) {
                    throw $e;
                }
            }

            $sql = "INSERT INTO psb___pengaturan (`key`, `value`, `type`, `label`, `keterangan`, `kategori`, `urutan`) 
                    VALUES (?, ?, ?, ?, ?, ?, ?)";
            $stmt = $this->db->prepare($sql);
            $stmt->execute([$key, $value, $type, $label, $keterangan, $kategori, $urutan]);

            $id = (int) $this->db->lastInsertId();
            $newRow = ['id' => $id, 'key' => $key, 'value' => $value, 'type' => $type, 'label' => $label, 'keterangan' => $keterangan, 'kategori' => $kategori, 'urutan' => $urutan];
            $user = $request->getAttribute('user');
            $pengurusId = isset($user['user_id']) ? (int) $user['user_id'] : (isset($user['id']) ? (int) $user['id'] : null);
            if ($pengurusId !== null) {
                UserAktivitasLogger::log(null, $pengurusId, UserAktivitasLogger::ACTION_CREATE, 'psb___pengaturan', $id, null, $newRow, $request);
            }

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Pengaturan berhasil dibuat',
                'data' => [
                    'id' => (int)$id,
                    'key' => $key
                ]
            ], 201);

        } catch (\PDOException $e) {
            // Jika tabel tidak ada
            if ($e->getCode() == '42S02' || strpos($e->getMessage(), "doesn't exist") !== false) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Tabel psb___pengaturan belum dibuat. Silakan jalankan migration SQL terlebih dahulu.'
                ], 500);
            }
            error_log("Create pengaturan PDO error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal membuat pengaturan: ' . $e->getMessage()
            ], 500);
        } catch (\Exception $e) {
            error_log("Create pengaturan error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal membuat pengaturan: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * PUT /api/pengaturan/{id} - Update pengaturan berdasarkan ID
     */
    public function update(Request $request, Response $response, array $args): Response
    {
        try {
            $id = $args['id'] ?? null;
            $input = $request->getParsedBody();

            if (!$id) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Parameter id wajib diisi'
                ], 400);
            }

            // Cek apakah pengaturan ada
            $checkSql = "SELECT * FROM psb___pengaturan WHERE id = ?";
            $checkStmt = $this->db->prepare($checkSql);
            $checkStmt->execute([$id]);
            $existing = $checkStmt->fetch(\PDO::FETCH_ASSOC);

            if (!$existing) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Pengaturan tidak ditemukan'
                ], 404);
            }

            // Build update fields
            $updateFields = [];
            $updateValues = [];

            if (isset($input['value'])) {
                $updateFields[] = "`value` = ?";
                $updateValues[] = $input['value'];
            }

            if (isset($input['type'])) {
                $updateFields[] = "`type` = ?";
                $updateValues[] = $input['type'];
            }

            if (isset($input['label'])) {
                $updateFields[] = "`label` = ?";
                $updateValues[] = $input['label'];
            }

            if (isset($input['keterangan'])) {
                $updateFields[] = "`keterangan` = ?";
                $updateValues[] = $input['keterangan'];
            }

            if (isset($input['kategori'])) {
                $updateFields[] = "`kategori` = ?";
                $updateValues[] = $input['kategori'];
            }

            if (isset($input['urutan'])) {
                $updateFields[] = "`urutan` = ?";
                $updateValues[] = (int)$input['urutan'];
            }

            if (count($updateFields) === 0) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Tidak ada data yang diupdate'
                ], 400);
            }

            $updateValues[] = $id;
            $sql = "UPDATE psb___pengaturan SET " . implode(', ', $updateFields) . " WHERE id = ?";
            $stmt = $this->db->prepare($sql);
            $stmt->execute($updateValues);
            $stmtNew = $this->db->prepare("SELECT * FROM psb___pengaturan WHERE id = ?");
            $stmtNew->execute([$id]);
            $newRow = $stmtNew->fetch(\PDO::FETCH_ASSOC);
            $user = $request->getAttribute('user');
            $pengurusId = isset($user['user_id']) ? (int) $user['user_id'] : (isset($user['id']) ? (int) $user['id'] : null);
            if ($newRow && $pengurusId !== null) {
                UserAktivitasLogger::log(null, $pengurusId, UserAktivitasLogger::ACTION_UPDATE, 'psb___pengaturan', $id, $existing, $newRow, $request);
            }

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Pengaturan berhasil diupdate'
            ], 200);

        } catch (\Exception $e) {
            error_log("Update pengaturan error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengupdate pengaturan: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * PUT /api/pengaturan/key/{key} - Update pengaturan berdasarkan key
     */
    public function updateByKey(Request $request, Response $response, array $args): Response
    {
        try {
            $key = $args['key'] ?? null;
            $input = $request->getParsedBody();

            if (!$key) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Parameter key wajib diisi'
                ], 400);
            }

            // Cek apakah pengaturan ada
            $checkSql = "SELECT * FROM psb___pengaturan WHERE `key` = ?";
            $checkStmt = $this->db->prepare($checkSql);
            $checkStmt->execute([$key]);
            $existing = $checkStmt->fetch(\PDO::FETCH_ASSOC);

            if (!$existing) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Pengaturan tidak ditemukan'
                ], 404);
            }

            // Build update fields
            $updateFields = [];
            $updateValues = [];

            if (isset($input['value'])) {
                $updateFields[] = "`value` = ?";
                $updateValues[] = $input['value'];
            }

            if (isset($input['type'])) {
                $updateFields[] = "`type` = ?";
                $updateValues[] = $input['type'];
            }

            if (isset($input['label'])) {
                $updateFields[] = "`label` = ?";
                $updateValues[] = $input['label'];
            }

            if (isset($input['keterangan'])) {
                $updateFields[] = "`keterangan` = ?";
                $updateValues[] = $input['keterangan'];
            }

            if (isset($input['kategori'])) {
                $updateFields[] = "`kategori` = ?";
                $updateValues[] = $input['kategori'];
            }

            if (isset($input['urutan'])) {
                $updateFields[] = "`urutan` = ?";
                $updateValues[] = (int)$input['urutan'];
            }

            if (count($updateFields) === 0) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Tidak ada data yang diupdate'
                ], 400);
            }

            $updateValues[] = $key;
            $sql = "UPDATE psb___pengaturan SET " . implode(', ', $updateFields) . " WHERE `key` = ?";
            $stmt = $this->db->prepare($sql);
            $stmt->execute($updateValues);
            $stmtNew = $this->db->prepare("SELECT * FROM psb___pengaturan WHERE `key` = ?");
            $stmtNew->execute([$key]);
            $newRow = $stmtNew->fetch(\PDO::FETCH_ASSOC);
            $user = $request->getAttribute('user');
            $pengurusId = isset($user['user_id']) ? (int) $user['user_id'] : (isset($user['id']) ? (int) $user['id'] : null);
            if ($newRow && $pengurusId !== null) {
                UserAktivitasLogger::log(null, $pengurusId, UserAktivitasLogger::ACTION_UPDATE, 'psb___pengaturan', $existing['id'] ?? $key, $existing, $newRow, $request);
            }

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Pengaturan berhasil diupdate'
            ], 200);

        } catch (\Exception $e) {
            error_log("Update pengaturan by key error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengupdate pengaturan: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * DELETE /api/pengaturan/{id} - Hapus pengaturan
     */
    public function delete(Request $request, Response $response, array $args): Response
    {
        try {
            $id = $args['id'] ?? null;

            if (!$id) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Parameter id wajib diisi'
                ], 400);
            }

            $checkSql = "SELECT * FROM psb___pengaturan WHERE id = ?";
            $checkStmt = $this->db->prepare($checkSql);
            $checkStmt->execute([$id]);
            $oldRow = $checkStmt->fetch(\PDO::FETCH_ASSOC);

            if (!$oldRow) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Pengaturan tidak ditemukan'
                ], 404);
            }

            $deleteSql = "DELETE FROM psb___pengaturan WHERE id = ?";
            $deleteStmt = $this->db->prepare($deleteSql);
            $deleteStmt->execute([$id]);
            $user = $request->getAttribute('user');
            $pengurusId = isset($user['user_id']) ? (int) $user['user_id'] : (isset($user['id']) ? (int) $user['id'] : null);
            if ($pengurusId !== null) {
                UserAktivitasLogger::log(null, $pengurusId, UserAktivitasLogger::ACTION_DELETE, 'psb___pengaturan', $id, $oldRow, null, $request);
            }

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Pengaturan berhasil dihapus'
            ], 200);

        } catch (\Exception $e) {
            error_log("Delete pengaturan error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal menghapus pengaturan: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * POST /api/pengaturan/upload-image - Upload gambar untuk pengaturan (logo, header, dll)
     */
    public function uploadImage(Request $request, Response $response): Response
    {
        try {
            $input = $request->getParsedBody();
            $key = $input['key'] ?? null;

            if (!$key) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Parameter key wajib diisi'
                ], 400);
            }

            $uploadedFiles = $request->getUploadedFiles();
            if (empty($uploadedFiles) || !isset($uploadedFiles['file'])) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'File tidak ditemukan'
                ], 400);
            }

            $file = $uploadedFiles['file'];
            
            if ($file->getError() !== UPLOAD_ERR_OK) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Error saat upload file: ' . $file->getError()
                ], 400);
            }

            // Validasi tipe file (hanya gambar)
            $allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
            $fileType = $file->getClientMediaType();
            if (!in_array($fileType, $allowedTypes)) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Tipe file tidak diizinkan. Hanya gambar yang diperbolehkan.'
                ], 400);
            }

            // Validasi ukuran file (max 5MB)
            $maxSize = 5 * 1024 * 1024; // 5MB
            if ($file->getSize() > $maxSize) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Ukuran file terlalu besar. Maksimal 5MB.'
                ], 400);
            }

            // Generate nama file unik
            $extension = pathinfo($file->getClientFilename(), PATHINFO_EXTENSION);
            $fileName = 'pengaturan_' . $key . '_' . uniqid() . '.' . $extension;
            
            // Path: uploads/pengaturan (dari config UPLOADS_BASE_PATH)
            $uploadDir = $this->uploadsPath . '/pengaturan';
            if (!is_dir($uploadDir)) {
                mkdir($uploadDir, 0755, true);
            }

            $filePath = $uploadDir . '/' . $fileName;
            // Path relatif untuk disimpan di database (dari root project)
            $relativePath = 'uploads/pengaturan/' . $fileName;

            // Pindahkan file
            $file->moveTo($filePath);

            // Update atau insert pengaturan
            $checkSql = "SELECT id FROM psb___pengaturan WHERE `key` = ?";
            $checkStmt = $this->db->prepare($checkSql);
            $checkStmt->execute([$key]);
            $existing = $checkStmt->fetch();

            if ($existing) {
                // Hapus file lama jika ada
                $oldValue = $this->db->prepare("SELECT value FROM psb___pengaturan WHERE `key` = ?");
                $oldValue->execute([$key]);
                $oldData = $oldValue->fetch(\PDO::FETCH_ASSOC);
                if ($oldData && $oldData['value']) {
                    $oldFilePath = $this->resolveUploadPath($oldData['value']);
                    if (file_exists($oldFilePath)) {
                        unlink($oldFilePath);
                    }
                }

                // Update
                $updateSql = "UPDATE psb___pengaturan SET `value` = ?, `type` = 'image' WHERE `key` = ?";
                $updateStmt = $this->db->prepare($updateSql);
                $updateStmt->execute([$relativePath, $key]);
            } else {
                // Insert baru
                $insertSql = "INSERT INTO psb___pengaturan (`key`, `value`, `type`, `label`, `kategori`) VALUES (?, ?, 'image', ?, ?)";
                $label = ucfirst(str_replace('_', ' ', $key));
                $kategori = 'Tampilan';
                $insertStmt = $this->db->prepare($insertSql);
                $insertStmt->execute([$key, $relativePath, $label, $kategori]);
            }

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Gambar berhasil diupload',
                'data' => [
                    'key' => $key,
                    'path' => $relativePath,
                    'url' => '/backend/uploads/pengaturan/' . $fileName // URL untuk akses file
                ]
            ], 200);

        } catch (\Exception $e) {
            error_log("Upload image pengaturan error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal upload gambar: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * GET /api/pengaturan/image/{key} - Serve gambar pengaturan
     */
    public function serveImage(Request $request, Response $response, array $args): Response
    {
        try {
            $key = $args['key'] ?? null;

            if (!$key) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Parameter key wajib diisi'
                ], 400);
            }

            // Ambil pengaturan
            $sql = "SELECT value, type FROM psb___pengaturan WHERE `key` = ? AND type = 'image'";
            $stmt = $this->db->prepare($sql);
            $stmt->execute([$key]);
            $setting = $stmt->fetch(\PDO::FETCH_ASSOC);

            if (!$setting || !$setting['value']) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Gambar tidak ditemukan'
                ], 404);
            }

            // Path file
            $filePath = $this->resolveUploadPath($setting['value']);

            if (!file_exists($filePath)) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'File tidak ditemukan di server'
                ], 404);
            }

            // Deteksi MIME type
            $mimeType = mime_content_type($filePath);
            if (!$mimeType) {
                $mimeType = 'image/jpeg'; // Default
            }

            // Set headers untuk display image
            $response = $response->withHeader('Content-Type', $mimeType);
            $response = $response->withHeader('Content-Length', (string)filesize($filePath));
            $response = $response->withHeader('Cache-Control', 'public, max-age=31536000'); // Cache 1 tahun

            // Read file dan kirim
            $fileContent = file_get_contents($filePath);
            $response->getBody()->write($fileContent);

            return $response;

        } catch (\Exception $e) {
            error_log("Serve image pengaturan error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil gambar: ' . $e->getMessage()
            ], 500);
        }
    }
}
