<?php

namespace App\Controllers;

use App\Database;
use App\Helpers\UserAktivitasLogger;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

/**
 * Upload & serve logo lembaga (PNG saja) di uploads/lembaga/.
 */
class LembagaLogoController
{
    private string $uploadsBasePath;
    private \PDO $db;

    private const MAX_SIZE = 2 * 1024 * 1024; // 2 MB

    public function __construct()
    {
        $config = require __DIR__ . '/../../config.php';
        $root = rtrim($config['uploads_base_path'] ?? __DIR__ . '/../..', '/\\');
        $folder = $config['uploads_folder'] ?? 'uploads';
        $uploadsDir = $root . DIRECTORY_SEPARATOR . trim($folder, '/\\');
        $this->uploadsBasePath = rtrim(realpath($uploadsDir) ?: $uploadsDir, DIRECTORY_SEPARATOR . '/');
        $this->db = Database::getInstance()->getConnection();
    }

    private function getLembagaDir(): string
    {
        $dir = $this->uploadsBasePath . DIRECTORY_SEPARATOR . 'lembaga';
        if (!is_dir($dir)) {
            mkdir($dir, 0755, true);
        }
        return $dir;
    }

    private function jsonResponse(Response $response, array $data, int $statusCode): Response
    {
        $response->getBody()->write(json_encode($data, JSON_UNESCAPED_UNICODE));
        return $response->withStatus($statusCode)->withHeader('Content-Type', 'application/json; charset=utf-8');
    }

    /**
     * Hapus file logo di disk jika path valid (dipakai saat hapus lembaga).
     */
    public static function deleteStoredLogo(?string $relativePath): void
    {
        if ($relativePath === null || $relativePath === '') {
            return;
        }
        $config = require __DIR__ . '/../../config.php';
        $root = rtrim($config['uploads_base_path'] ?? __DIR__ . '/../..', '/\\');
        $folder = $config['uploads_folder'] ?? 'uploads';
        $uploadsDir = $root . DIRECTORY_SEPARATOR . trim($folder, '/\\');
        $uploadsBasePath = rtrim(realpath($uploadsDir) ?: $uploadsDir, DIRECTORY_SEPARATOR . '/');

        $path = str_replace(['/', '\\'], DIRECTORY_SEPARATOR, $relativePath);
        if (stripos($path, 'uploads') === 0) {
            $path = trim(substr($path, strlen('uploads')), DIRECTORY_SEPARATOR . '/');
        }
        if (strpos($path, 'lembaga' . DIRECTORY_SEPARATOR) !== 0 && strpos($path, 'lembaga/') !== 0) {
            return;
        }
        $fullPath = $uploadsBasePath . DIRECTORY_SEPARATOR . $path;
        $real = realpath($fullPath);
        if ($real !== false && is_file($real) && strpos($real, $uploadsBasePath) === 0) {
            @unlink($real);
        }
    }

    /**
     * POST /api/lembaga/{id}/logo — multipart field: file atau logo
     */
    public function upload(Request $request, Response $response, array $args): Response
    {
        try {
            $id = isset($args['id']) ? trim((string) $args['id']) : '';
            if ($id === '') {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'ID lembaga tidak valid'], 400);
            }

            $stmt = $this->db->prepare('SELECT * FROM lembaga WHERE id = ?');
            $stmt->execute([$id]);
            $oldRow = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$oldRow) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Lembaga tidak ditemukan'], 404);
            }

            $uploadedFiles = $request->getUploadedFiles();
            $file = $uploadedFiles['file'] ?? $uploadedFiles['logo'] ?? $uploadedFiles['foto'] ?? null;

            if (!$file || $file->getError() !== UPLOAD_ERR_OK) {
                $msg = $file ? $this->uploadErrorMessage($file->getError()) : 'Tidak ada file';
                return $this->jsonResponse($response, ['success' => false, 'message' => $msg], 400);
            }

            $mediaType = strtolower((string) $file->getClientMediaType());
            $originalName = (string) $file->getClientFilename();
            $extension = strtolower(pathinfo($originalName, PATHINFO_EXTENSION));

            if ($mediaType !== 'image/png' || $extension !== 'png') {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Hanya file PNG yang diizinkan untuk logo lembaga',
                ], 400);
            }

            if ($file->getSize() > self::MAX_SIZE) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Ukuran file maksimal 2 MB',
                ], 400);
            }

            $fileName = 'lembaga_' . preg_replace('/[^a-zA-Z0-9_-]/', '_', $id) . '_' . uniqid('', true) . '.png';
            $uploadDir = $this->getLembagaDir();
            $filePath = $uploadDir . DIRECTORY_SEPARATOR . $fileName;

            $file->moveTo($filePath);

            $imageInfo = @getimagesize($filePath);
            if ($imageInfo === false || !isset($imageInfo[2]) || $imageInfo[2] !== IMAGETYPE_PNG) {
                if (file_exists($filePath)) {
                    @unlink($filePath);
                }
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'File bukan gambar PNG yang valid',
                ], 400);
            }

            $relativePath = 'uploads/lembaga/' . $fileName;

            if (!empty($oldRow['logo_path'])) {
                self::deleteStoredLogo($oldRow['logo_path']);
            }

            $waktuIndonesia = (new \DateTime('now', new \DateTimeZone('Asia/Jakarta')))->format('Y-m-d H:i:s');
            $upd = $this->db->prepare('UPDATE lembaga SET logo_path = ?, tanggal_update = ? WHERE id = ?');
            $upd->execute([$relativePath, $waktuIndonesia, $id]);

            $stmtNew = $this->db->prepare('SELECT * FROM lembaga WHERE id = ?');
            $stmtNew->execute([$id]);
            $newRow = $stmtNew->fetch(\PDO::FETCH_ASSOC);

            $user = $request->getAttribute('user');
            $pengurusId = isset($user['user_id']) ? (int) $user['user_id'] : (isset($user['id']) ? (int) $user['id'] : null);
            if ($newRow && $pengurusId !== null) {
                UserAktivitasLogger::log(null, $pengurusId, UserAktivitasLogger::ACTION_UPDATE, 'lembaga', $id, $oldRow, $newRow, $request);
            }

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Logo berhasil diunggah',
                'logo_path' => $relativePath,
                'data' => $newRow,
            ], 200);
        } catch (\Exception $e) {
            error_log('LembagaLogoController::upload ' . $e->getMessage());
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Gagal mengunggah logo'], 500);
        }
    }

    /**
     * DELETE /api/lembaga/{id}/logo — hapus logo dari disk dan DB
     */
    public function deleteLogo(Request $request, Response $response, array $args): Response
    {
        try {
            $id = isset($args['id']) ? trim((string) $args['id']) : '';
            if ($id === '') {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'ID lembaga tidak valid'], 400);
            }

            $stmt = $this->db->prepare('SELECT * FROM lembaga WHERE id = ?');
            $stmt->execute([$id]);
            $oldRow = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$oldRow) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Lembaga tidak ditemukan'], 404);
            }

            if (empty($oldRow['logo_path'])) {
                return $this->jsonResponse($response, ['success' => true, 'message' => 'Tidak ada logo untuk dihapus'], 200);
            }

            self::deleteStoredLogo($oldRow['logo_path']);

            $waktuIndonesia = (new \DateTime('now', new \DateTimeZone('Asia/Jakarta')))->format('Y-m-d H:i:s');
            $upd = $this->db->prepare('UPDATE lembaga SET logo_path = NULL, tanggal_update = ? WHERE id = ?');
            $upd->execute([$waktuIndonesia, $id]);

            $stmtNew = $this->db->prepare('SELECT * FROM lembaga WHERE id = ?');
            $stmtNew->execute([$id]);
            $newRow = $stmtNew->fetch(\PDO::FETCH_ASSOC);

            $user = $request->getAttribute('user');
            $pengurusId = isset($user['user_id']) ? (int) $user['user_id'] : (isset($user['id']) ? (int) $user['id'] : null);
            if ($newRow && $pengurusId !== null) {
                UserAktivitasLogger::log(null, $pengurusId, UserAktivitasLogger::ACTION_UPDATE, 'lembaga', $id, $oldRow, $newRow, $request);
            }

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Logo dihapus',
                'data' => $newRow,
            ], 200);
        } catch (\Exception $e) {
            error_log('LembagaLogoController::deleteLogo ' . $e->getMessage());
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Gagal menghapus logo'], 500);
        }
    }

    /**
     * GET /api/lembaga/serve-logo?path=uploads/lembaga/xxx.png
     */
    public function serve(Request $request, Response $response): Response
    {
        try {
            $params = $request->getQueryParams();
            $path = isset($params['path']) ? trim((string) $params['path']) : '';

            if ($path === '' || preg_match('/\.\./', $path)) {
                return $response->withStatus(400);
            }

            $path = str_replace(['/', '\\'], DIRECTORY_SEPARATOR, $path);
            if (stripos($path, 'uploads') === 0) {
                $path = trim(substr($path, strlen('uploads')), DIRECTORY_SEPARATOR . '/');
            }
            if (strpos($path, 'lembaga' . DIRECTORY_SEPARATOR) !== 0 && strpos($path, 'lembaga/') !== 0) {
                return $response->withStatus(403);
            }

            $fullPath = $this->uploadsBasePath . DIRECTORY_SEPARATOR . $path;
            $real = realpath($fullPath);
            if ($real === false || !is_file($real) || strpos($real, $this->uploadsBasePath) !== 0) {
                return $response->withStatus(404);
            }

            $mime = @mime_content_type($real);
            if ($mime !== 'image/png') {
                $mime = 'image/png';
            }

            $mtime = filemtime($real);
            $etag = '"' . md5($real . (string) $mtime . (string) filesize($real)) . '"';
            $response = $response
                ->withHeader('Content-Type', $mime)
                ->withHeader('Cache-Control', 'public, max-age=604800')
                ->withHeader('Last-Modified', gmdate('D, d M Y H:i:s', $mtime) . ' GMT')
                ->withHeader('ETag', $etag);

            $ifNoneMatch = $request->getHeaderLine('If-None-Match');
            if ($ifNoneMatch !== '' && trim($ifNoneMatch) === $etag) {
                return $response->withStatus(304);
            }

            $response->getBody()->write(file_get_contents($real));
            return $response;
        } catch (\Exception $e) {
            error_log('LembagaLogoController::serve ' . $e->getMessage());
            return $response->withStatus(500);
        }
    }

    private function uploadErrorMessage(int $code): string
    {
        switch ($code) {
            case UPLOAD_ERR_INI_SIZE:
            case UPLOAD_ERR_FORM_SIZE:
                return 'File terlalu besar';
            case UPLOAD_ERR_PARTIAL:
                return 'File hanya ter-upload sebagian';
            case UPLOAD_ERR_NO_FILE:
                return 'Tidak ada file';
            case UPLOAD_ERR_NO_TMP_DIR:
                return 'Folder temporary tidak ditemukan';
            case UPLOAD_ERR_CANT_WRITE:
                return 'Gagal menulis file';
            case UPLOAD_ERR_EXTENSION:
                return 'Upload dihentikan oleh extension';
            default:
                return 'Error upload';
        }
    }
}
