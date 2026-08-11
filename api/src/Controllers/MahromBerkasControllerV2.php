<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Database;
use App\Helpers\FileUploadValidator;
use App\Helpers\PathSafetyHelper;
use App\Helpers\TextSanitizer;
use App\Helpers\UserAktivitasLogger;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

/**
 * Upload berkas mahrom (KTP, KK) ke uploads/mahrom/
 * Endpoint: /api/v2/mahrom-berkas/*
 */
class MahromBerkasControllerV2
{
    private const ALLOWED_JENIS = ['KTP', 'KK'];

    private $db;
    private string $uploadsBasePath;

    public function __construct()
    {
        $this->db = Database::getInstance()->getConnection();
        $config = require __DIR__ . '/../../config.php';
        $root = rtrim($config['uploads_base_path'] ?? __DIR__ . '/../..', '/\\');
        $folder = $config['uploads_folder'] ?? 'uploads';
        $uploadsDir = $root . DIRECTORY_SEPARATOR . trim($folder, '/\\');
        $this->uploadsBasePath = rtrim(realpath($uploadsDir) ?: $uploadsDir, DIRECTORY_SEPARATOR . '/');
    }

    private function jsonResponse(Response $response, array $data, int $statusCode): Response
    {
        $response->getBody()->write(json_encode($data, JSON_UNESCAPED_UNICODE));
        return $response->withHeader('Content-Type', 'application/json')->withStatus($statusCode);
    }

    private function resolveFilePath(string $pathFile): string
    {
        $pathFile = trim(str_replace(['/', '\\'], DIRECTORY_SEPARATOR, $pathFile), DIRECTORY_SEPARATOR);
        if (stripos($pathFile, 'uploads') === 0) {
            $pathFile = trim(substr($pathFile, strlen('uploads')), DIRECTORY_SEPARATOR);
        }
        if ($pathFile === '') {
            return '';
        }
        $resolved = PathSafetyHelper::resolveWithinBase($this->uploadsBasePath, $pathFile, false);
        return $resolved ?? '';
    }

    private function getMahromUploadDir(): string
    {
        $dir = $this->uploadsBasePath . DIRECTORY_SEPARATOR . 'mahrom';
        if (!is_dir($dir)) {
            mkdir($dir, 0755, true);
        }
        return $dir;
    }

    private function resolveMahromId($idMahrom): ?int
    {
        if ($idMahrom === null || $idMahrom === '') {
            return null;
        }
        $id = (int) $idMahrom;
        if ($id <= 0) {
            return null;
        }
        $stmt = $this->db->prepare('SELECT id FROM mahrom WHERE id = ? LIMIT 1');
        $stmt->execute([$id]);
        $row = $stmt->fetch(\PDO::FETCH_ASSOC);
        return $row ? (int) $row['id'] : null;
    }

    private function validateJenis(string $jenis): bool
    {
        return in_array($jenis, self::ALLOWED_JENIS, true);
    }

    /**
     * POST /api/v2/mahrom-berkas/upload
     */
    public function uploadBerkas(Request $request, Response $response): Response
    {
        try {
            $user = $request->getAttribute('user');
            $userArr = is_array($user) ? $user : [];
            $idAdmin = $userArr['user_id'] ?? $userArr['id'] ?? null;

            $parsedBody = $request->getParsedBody();
            $parsedBody = is_array($parsedBody) ? TextSanitizer::sanitizeStringValues($parsedBody, []) : [];
            $idMahrom = $parsedBody['id_mahrom'] ?? null;
            $jenisBerkas = $parsedBody['jenis_berkas'] ?? null;
            $keterangan = $parsedBody['keterangan'] ?? null;

            if (!$idMahrom) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'ID mahrom wajib diisi'], 400);
            }
            if (!$jenisBerkas || !$this->validateJenis($jenisBerkas)) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Jenis berkas tidak valid (KTP atau KK)'], 400);
            }

            $idMahromResolved = $this->resolveMahromId($idMahrom);
            if ($idMahromResolved === null) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Mahrom tidak ditemukan'], 404);
            }
            $idMahrom = $idMahromResolved;

            $uploadedFiles = $request->getUploadedFiles();
            if (empty($uploadedFiles) || !isset($uploadedFiles['file'])) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'File tidak ditemukan'], 400);
            }

            $file = $uploadedFiles['file'];
            $allowedExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf'];
            $maxSize = 10 * 1024 * 1024;

            $validation = FileUploadValidator::validate($file, $allowedExtensions, $maxSize);
            if (!$validation['success']) {
                return $this->jsonResponse($response, ['success' => false, 'message' => $validation['message']], 400);
            }

            $originalName = $file->getClientFilename();
            $extension = $validation['extension'];
            $fileType = $validation['mime'];

            $checkStmt = $this->db->prepare('SELECT id, path_file FROM mahrom___berkas WHERE id_mahrom = ? AND jenis_berkas = ?');
            $checkStmt->execute([$idMahrom, $jenisBerkas]);
            $existingBerkas = $checkStmt->fetch(\PDO::FETCH_ASSOC);

            $sanitizedJenis = preg_replace('/[^a-zA-Z0-9_\-]/', '_', $jenisBerkas);
            $fileName = uniqid('mahrom_' . $idMahrom . '_' . $sanitizedJenis . '_', true) . '.' . $extension;
            $uploadDir = $this->getMahromUploadDir();
            $filePath = $uploadDir . DIRECTORY_SEPARATOR . $fileName;
            $relativePath = 'uploads/mahrom/' . $fileName;

            $file->moveTo($filePath);

            $postCheck = FileUploadValidator::validateMovedFile($filePath, $extension);
            if (!$postCheck['success']) {
                @unlink($filePath);
                return $this->jsonResponse($response, ['success' => false, 'message' => $postCheck['message']], 400);
            }
            if (!empty($postCheck['mime'])) {
                $fileType = $postCheck['mime'];
            }
            $finalFileSize = filesize($filePath);

            if ($existingBerkas) {
                $oldFilePath = $this->resolveFilePath($existingBerkas['path_file']);
                if ($oldFilePath !== '' && file_exists($oldFilePath)) {
                    unlink($oldFilePath);
                }
                $stmt = $this->db->prepare(
                    'UPDATE mahrom___berkas SET nama_file = ?, path_file = ?, ukuran_file = ?, tipe_file = ?, keterangan = ?, id_admin = ?, status_tidak_ada = 0, tanggal_update = CURRENT_TIMESTAMP WHERE id = ?'
                );
                $stmt->execute([$originalName, $relativePath, $finalFileSize, $fileType, $keterangan ?? null, $idAdmin, $existingBerkas['id']]);
                $berkasId = $existingBerkas['id'];
            } else {
                $stmt = $this->db->prepare(
                    'INSERT INTO mahrom___berkas (id_mahrom, jenis_berkas, nama_file, path_file, ukuran_file, tipe_file, keterangan, id_admin) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
                );
                $stmt->execute([$idMahrom, $jenisBerkas, $originalName, $relativePath, $finalFileSize, $fileType, $keterangan, $idAdmin]);
                $berkasId = $this->db->lastInsertId();
            }

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => $existingBerkas ? 'Berkas berhasil diganti' : 'Berkas berhasil di-upload',
                'data' => [
                    'id' => $berkasId,
                    'id_mahrom' => $idMahrom,
                    'jenis_berkas' => $jenisBerkas,
                    'nama_file' => $originalName,
                    'path_file' => $relativePath,
                    'tipe_file' => $fileType,
                    'ukuran_file' => $finalFileSize,
                    'keterangan' => $keterangan,
                ],
            ], $existingBerkas ? 200 : 201);
        } catch (\Exception $e) {
            error_log('MahromBerkasControllerV2 upload: ' . $e->getMessage());
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Gagal meng-upload berkas'], 500);
        }
    }

    /**
     * GET /api/v2/mahrom-berkas/list
     */
    public function getBerkasList(Request $request, Response $response): Response
    {
        try {
            $queryParams = $request->getQueryParams();
            $idMahrom = $queryParams['id_mahrom'] ?? null;
            $jenisBerkas = $queryParams['jenis_berkas'] ?? null;

            if (!$idMahrom) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Parameter id_mahrom wajib diisi'], 400);
            }

            $resolvedId = $this->resolveMahromId($idMahrom);
            if ($resolvedId === null) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Mahrom tidak ditemukan'], 404);
            }

            $sql = 'SELECT b.*, p.nama AS admin_nama FROM mahrom___berkas b LEFT JOIN pengurus p ON b.id_admin = p.id WHERE b.id_mahrom = ?';
            $params = [$resolvedId];
            if ($jenisBerkas && $jenisBerkas !== '') {
                $sql .= ' AND b.jenis_berkas = ?';
                $params[] = $jenisBerkas;
            }
            $sql .= ' ORDER BY b.tanggal_dibuat DESC';

            $stmt = $this->db->prepare($sql);
            $stmt->execute($params);
            $data = $stmt->fetchAll(\PDO::FETCH_ASSOC);

            return $this->jsonResponse($response, ['success' => true, 'id_mahrom' => $resolvedId, 'data' => $data], 200);
        } catch (\Exception $e) {
            error_log('MahromBerkasControllerV2 list: ' . $e->getMessage());
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Gagal mengambil daftar berkas'], 500);
        }
    }

    /**
     * POST /api/v2/mahrom-berkas/delete
     */
    public function deleteBerkas(Request $request, Response $response): Response
    {
        try {
            $parsedBody = $request->getParsedBody();
            $idBerkas = is_array($parsedBody) ? ($parsedBody['id'] ?? null) : null;

            if (!$idBerkas) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'ID berkas wajib diisi'], 400);
            }

            $stmt = $this->db->prepare('SELECT * FROM mahrom___berkas WHERE id = ?');
            $stmt->execute([$idBerkas]);
            $berkas = $stmt->fetch(\PDO::FETCH_ASSOC);

            if (!$berkas) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Berkas tidak ditemukan'], 404);
            }

            $checkStmt = $this->db->prepare('SELECT COUNT(*) AS count FROM mahrom___berkas WHERE path_file = ? AND id != ?');
            $checkStmt->execute([$berkas['path_file'], $idBerkas]);
            $pathUsage = $checkStmt->fetch(\PDO::FETCH_ASSOC);

            $isTidakAda = !empty($berkas['status_tidak_ada']);
            if (($pathUsage['count'] ?? 0) == 0 && !$isTidakAda && !empty($berkas['path_file']) && $berkas['path_file'] !== '-') {
                $filePath = $this->resolveFilePath($berkas['path_file']);
                if ($filePath !== '' && file_exists($filePath)) {
                    unlink($filePath);
                }
            }

            $deleteStmt = $this->db->prepare('DELETE FROM mahrom___berkas WHERE id = ?');
            $deleteStmt->execute([$idBerkas]);

            $user = $request->getAttribute('user');
            $pengurusId = isset($user['user_id']) ? (int) $user['user_id'] : (isset($user['id']) ? (int) $user['id'] : null);
            if ($pengurusId !== null) {
                UserAktivitasLogger::log(null, $pengurusId, UserAktivitasLogger::ACTION_DELETE, 'mahrom___berkas', (int) $idBerkas, $berkas, null, $request);
            }

            return $this->jsonResponse($response, ['success' => true, 'message' => 'Berkas berhasil dihapus'], 200);
        } catch (\Exception $e) {
            error_log('MahromBerkasControllerV2 delete: ' . $e->getMessage());
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Gagal menghapus berkas'], 500);
        }
    }

    /**
     * GET /api/v2/mahrom-berkas/download
     */
    public function downloadBerkas(Request $request, Response $response): Response
    {
        try {
            $queryParams = $request->getQueryParams();
            $idBerkas = $queryParams['id'] ?? null;

            if (!$idBerkas) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'ID berkas wajib diisi'], 400);
            }

            $stmt = $this->db->prepare('SELECT * FROM mahrom___berkas WHERE id = ?');
            $stmt->execute([$idBerkas]);
            $berkas = $stmt->fetch(\PDO::FETCH_ASSOC);

            if (!$berkas) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Berkas tidak ditemukan'], 404);
            }

            if (!empty($berkas['status_tidak_ada']) || (isset($berkas['path_file']) && $berkas['path_file'] === '-')) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Berkas ini ditandai tidak ada, tidak dapat diunduh'], 400);
            }

            $filePath = $this->resolveFilePath($berkas['path_file']);
            if ($filePath === '' || !file_exists($filePath)) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'File tidak ditemukan di server'], 404);
            }

            $response = $response->withHeader('Content-Type', $berkas['tipe_file'] ?? 'application/octet-stream');
            $response = $response->withHeader('Content-Disposition', 'attachment; filename="' . $berkas['nama_file'] . '"');
            $response = $response->withHeader('Content-Length', (string) filesize($filePath));
            $response->getBody()->write(file_get_contents($filePath));

            return $response;
        } catch (\Exception $e) {
            error_log('MahromBerkasControllerV2 download: ' . $e->getMessage());
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Gagal mengunduh berkas'], 500);
        }
    }

    /**
     * POST /api/v2/mahrom-berkas/update
     */
    public function updateBerkas(Request $request, Response $response): Response
    {
        try {
            $user = $request->getAttribute('user');
            $userArr = is_array($user) ? $user : [];
            $idAdmin = $userArr['user_id'] ?? $userArr['id'] ?? null;

            $parsedBody = $request->getParsedBody();
            $parsedBody = is_array($parsedBody) ? TextSanitizer::sanitizeStringValues($parsedBody, []) : [];
            $idBerkas = $parsedBody['id'] ?? null;
            $keterangan = $parsedBody['keterangan'] ?? null;

            if (!$idBerkas) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'ID berkas wajib diisi'], 400);
            }

            $stmt = $this->db->prepare('SELECT * FROM mahrom___berkas WHERE id = ?');
            $stmt->execute([$idBerkas]);
            $berkasLama = $stmt->fetch(\PDO::FETCH_ASSOC);

            if (!$berkasLama) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Berkas tidak ditemukan'], 404);
            }

            $uploadedFiles = $request->getUploadedFiles();
            if (empty($uploadedFiles['file'])) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'File wajib diupload'], 400);
            }

            $file = $uploadedFiles['file'];
            $originalName = $file->getClientFilename();
            $extension = strtolower(pathinfo($originalName, PATHINFO_EXTENSION));
            $allowedExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf'];
            $maxSize = 10 * 1024 * 1024;

            $validation = FileUploadValidator::validate($file, $allowedExtensions, $maxSize);
            if (!$validation['success']) {
                return $this->jsonResponse($response, ['success' => false, 'message' => $validation['message']], 400);
            }
            $fileType = $validation['mime'];
            $extension = $validation['extension'];

            $oldFilePath = $this->resolveFilePath($berkasLama['path_file']);
            if ($oldFilePath !== '' && file_exists($oldFilePath)) {
                unlink($oldFilePath);
            }

            $sanitizedJenis = preg_replace('/[^a-zA-Z0-9_\-]/', '_', $berkasLama['jenis_berkas']);
            $fileName = uniqid('mahrom_' . $berkasLama['id_mahrom'] . '_' . $sanitizedJenis . '_', true) . '.' . $extension;
            $uploadDir = $this->getMahromUploadDir();
            $filePath = $uploadDir . DIRECTORY_SEPARATOR . $fileName;
            $relativePath = 'uploads/mahrom/' . $fileName;

            $file->moveTo($filePath);

            $postCheck = FileUploadValidator::validateMovedFile($filePath, $extension);
            if (!$postCheck['success']) {
                @unlink($filePath);
                return $this->jsonResponse($response, ['success' => false, 'message' => $postCheck['message']], 400);
            }
            if (!empty($postCheck['mime'])) {
                $fileType = $postCheck['mime'];
            }
            $finalFileSize = filesize($filePath);

            $updateStmt = $this->db->prepare(
                'UPDATE mahrom___berkas SET nama_file = ?, path_file = ?, ukuran_file = ?, tipe_file = ?, keterangan = ?, id_admin = ?, status_tidak_ada = 0, tanggal_update = CURRENT_TIMESTAMP WHERE id = ?'
            );
            $updateStmt->execute([$originalName, $relativePath, $finalFileSize, $fileType, $keterangan ?? null, $idAdmin, $idBerkas]);

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Berkas berhasil diganti',
                'data' => [
                    'id' => $idBerkas,
                    'id_mahrom' => $berkasLama['id_mahrom'],
                    'jenis_berkas' => $berkasLama['jenis_berkas'],
                    'nama_file' => $originalName,
                    'path_file' => $relativePath,
                    'tipe_file' => $fileType,
                    'ukuran_file' => $finalFileSize,
                    'keterangan' => $keterangan,
                ],
            ], 200);
        } catch (\Exception $e) {
            error_log('MahromBerkasControllerV2 update: ' . $e->getMessage());
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Gagal mengganti berkas'], 500);
        }
    }
}
