<?php

namespace App\Controllers;

use App\Database;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

/**
 * Controller untuk foto profil pengurus (uploads/pengurus/).
 * Endpoint: /api/v2/profil/foto (upload, delete, serve)
 */
class ProfilFotoController
{
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

    private function getPengurusId(Request $request): ?int
    {
        $payload = $request->getAttribute('user');
        $pengurusId = (int)($payload['user_id'] ?? 0);
        return $pengurusId > 0 ? $pengurusId : null;
    }

    private function getPengurusUploadDir(): string
    {
        $dir = $this->uploadsBasePath . DIRECTORY_SEPARATOR . 'pengurus';
        if (!is_dir($dir)) {
            mkdir($dir, 0755, true);
        }
        return $dir;
    }

    private function resolveFilePath(string $pathFile): string
    {
        $pathFile = trim(str_replace(['/', '\\'], DIRECTORY_SEPARATOR, $pathFile), DIRECTORY_SEPARATOR);
        if (stripos($pathFile, 'uploads') === 0) {
            $pathFile = trim(substr($pathFile, strlen('uploads')), DIRECTORY_SEPARATOR);
        }
        return $this->uploadsBasePath . DIRECTORY_SEPARATOR . $pathFile;
    }

    private function jsonResponse(Response $response, array $data, int $statusCode): Response
    {
        $response->getBody()->write(json_encode($data, JSON_UNESCAPED_UNICODE));
        return $response->withStatus($statusCode)->withHeader('Content-Type', 'application/json; charset=utf-8');
    }

    /**
     * POST /api/v2/profil/foto - Upload foto profil (gambar saja, max 500KB disarankan di frontend).
     */
    public function upload(Request $request, Response $response): Response
    {
        try {
            $pengurusId = $this->getPengurusId($request);
            if ($pengurusId === null) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'User tidak valid'], 403);
            }

            $uploadedFiles = $request->getUploadedFiles();
            $file = $uploadedFiles['foto'] ?? $uploadedFiles['file'] ?? null;
            if (!$file || $file->getError() !== UPLOAD_ERR_OK) {
                $msg = $file ? $this->getUploadErrorMessage($file->getError()) : 'Tidak ada file foto';
                return $this->jsonResponse($response, ['success' => false, 'message' => $msg], 400);
            }

            $mediaType = $file->getClientMediaType();
            $allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
            if (!in_array($mediaType, $allowed, true)) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Hanya file gambar (JPEG, PNG, WebP, GIF) yang diizinkan'], 400);
            }

            $ext = preg_match('#^image/(jpeg|png|webp|gif)$#', $mediaType, $m) ? ($m[1] === 'jpeg' ? 'jpg' : $m[1]) : 'jpg';
            $fileName = $pengurusId . '_' . uniqid('', true) . '.' . $ext;
            $uploadDir = $this->getPengurusUploadDir();
            $filePath = $uploadDir . DIRECTORY_SEPARATOR . $fileName;
            $relativePath = 'uploads/pengurus/' . $fileName;

            $stmt = $this->db->prepare("SELECT foto_profil FROM pengurus WHERE id = ?");
            $stmt->execute([$pengurusId]);
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);
            $oldPath = $row['foto_profil'] ?? null;

            $file->moveTo($filePath);

            if ($oldPath) {
                $oldFull = $this->resolveFilePath($oldPath);
                if (file_exists($oldFull)) {
                    @unlink($oldFull);
                }
            }

            $this->db->prepare("UPDATE pengurus SET foto_profil = ? WHERE id = ?")->execute([$relativePath, $pengurusId]);

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Foto profil berhasil diperbarui',
                'foto_profil' => $relativePath
            ], 200);
        } catch (\Exception $e) {
            error_log('ProfilFotoController::upload ' . $e->getMessage());
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Gagal mengunggah foto'], 500);
        }
    }

    /**
     * DELETE /api/v2/profil/foto - Hapus foto profil.
     */
    public function delete(Request $request, Response $response): Response
    {
        try {
            $pengurusId = $this->getPengurusId($request);
            if ($pengurusId === null) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'User tidak valid'], 403);
            }

            $stmt = $this->db->prepare("SELECT foto_profil FROM pengurus WHERE id = ?");
            $stmt->execute([$pengurusId]);
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);
            $path = $row['foto_profil'] ?? null;

            if ($path) {
                $fullPath = $this->resolveFilePath($path);
                if (file_exists($fullPath)) {
                    @unlink($fullPath);
                }
                $this->db->prepare("UPDATE pengurus SET foto_profil = NULL WHERE id = ?")->execute([$pengurusId]);
            }

            return $this->jsonResponse($response, ['success' => true, 'message' => 'Foto profil telah dihapus'], 200);
        } catch (\Exception $e) {
            error_log('ProfilFotoController::delete ' . $e->getMessage());
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Gagal menghapus foto'], 500);
        }
    }

    /**
     * GET /api/v2/profil/foto - Stream foto profil (untuk ditampilkan di img src via fetch + blob URL).
     */
    public function serve(Request $request, Response $response): Response
    {
        try {
            $pengurusId = $this->getPengurusId($request);
            if ($pengurusId === null) {
                return $response->withStatus(403);
            }

            $stmt = $this->db->prepare("SELECT foto_profil FROM pengurus WHERE id = ?");
            $stmt->execute([$pengurusId]);
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);
            $path = $row['foto_profil'] ?? null;

            if (!$path) {
                // Tanpa foto: 204 agar client tidak memicu "Failed to load resource" (404) di DevTools
                return $response->withStatus(204);
            }

            $fullPath = $this->resolveFilePath($path);
            if (!is_file($fullPath)) {
                return $response->withStatus(204);
            }

            $mime = mime_content_type($fullPath);
            if (!preg_match('#^image/#', $mime)) {
                $mime = 'image/jpeg';
            }

            $response->getBody()->write(file_get_contents($fullPath));
            return $response->withHeader('Content-Type', $mime);
        } catch (\Exception $e) {
            error_log('ProfilFotoController::serve ' . $e->getMessage());
            return $response->withStatus(500);
        }
    }

    private function getUploadErrorMessage(int $code): string
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
