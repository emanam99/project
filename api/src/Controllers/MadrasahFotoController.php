<?php

namespace App\Controllers;

use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

/**
 * Upload & serve foto madrasah (UGT) - simpan di uploads/ugt/.
 * Hanya gambar (JPEG, PNG, WebP, GIF), max 1MB, validasi getimagesize untuk tolak file berbahaya.
 */
class MadrasahFotoController
{
    private string $uploadsBasePath;
    private const MAX_SIZE = 1024 * 1024; // 1 MB
    private const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];

    /** Logo: hanya JPEG/PNG; kompresi di frontend — server max 1 MB + validasi gambar */
    private const LOGO_MAX_SIZE = 1024 * 1024; // 1 MB
    private const LOGO_ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png'];

    public function __construct()
    {
        $config = require __DIR__ . '/../../config.php';
        $root = rtrim($config['uploads_base_path'] ?? __DIR__ . '/../..', '/\\');
        $folder = $config['uploads_folder'] ?? 'uploads';
        $uploadsDir = $root . DIRECTORY_SEPARATOR . trim($folder, '/\\');
        $this->uploadsBasePath = rtrim(realpath($uploadsDir) ?: $uploadsDir, DIRECTORY_SEPARATOR . '/');
    }

    private function getUgtDir(): string
    {
        $dir = $this->uploadsBasePath . DIRECTORY_SEPARATOR . 'ugt';
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
     * POST /api/madrasah/upload-foto - Upload foto madrasah. Simpan di uploads/ugt/.
     * Hanya gambar, max 1MB, validasi getimagesize untuk tolak file berbahaya.
     */
    public function upload(Request $request, Response $response): Response
    {
        try {
            $uploadedFiles = $request->getUploadedFiles();
            $file = $uploadedFiles['foto'] ?? $uploadedFiles['file'] ?? null;

            if (!$file || $file->getError() !== UPLOAD_ERR_OK) {
                $msg = $file ? $this->uploadErrorMessage($file->getError()) : 'Tidak ada file foto';
                return $this->jsonResponse($response, ['success' => false, 'message' => $msg], 400);
            }

            $mediaType = $file->getClientMediaType();
            if (!in_array($mediaType, self::ALLOWED_TYPES, true)) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Hanya file gambar (JPEG, PNG, WebP, GIF) yang diizinkan'
                ], 400);
            }

            if ($file->getSize() > self::MAX_SIZE) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Ukuran file maksimal 1 MB. Kompres gambar di perangkat Anda lalu coba lagi.'
                ], 400);
            }

            $ext = preg_match('#^image/(jpeg|png|webp|gif)$#', $mediaType, $m) ? ($m[1] === 'jpeg' ? 'jpg' : $m[1]) : 'jpg';
            $fileName = 'madrasah_' . uniqid('', true) . '.' . $ext;
            $uploadDir = $this->getUgtDir();
            $filePath = $uploadDir . DIRECTORY_SEPARATOR . $fileName;

            $file->moveTo($filePath);

            // Validasi bahwa file benar-benar gambar (tolak file berbahaya / double extension)
            $imageInfo = @getimagesize($filePath);
            if ($imageInfo === false || !isset($imageInfo[2]) || !in_array($imageInfo[2], [IMAGETYPE_JPEG, IMAGETYPE_PNG, IMAGETYPE_GIF, IMAGETYPE_WEBP], true)) {
                if (file_exists($filePath)) {
                    @unlink($filePath);
                }
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'File bukan gambar yang valid atau format tidak didukung'
                ], 400);
            }

            $relativePath = 'uploads/ugt/' . $fileName;

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Foto berhasil diunggah',
                'foto_path' => $relativePath
            ], 200);
        } catch (\Exception $e) {
            error_log('MadrasahFotoController::upload ' . $e->getMessage());
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Gagal mengunggah foto'], 500);
        }
    }

    /**
     * POST /api/madrasah/upload-logo — hanya PNG/JPEG, maks. 1 MB; kompresi dilakukan di klien.
     */
    public function uploadLogo(Request $request, Response $response): Response
    {
        try {
            $uploadedFiles = $request->getUploadedFiles();
            $file = $uploadedFiles['logo'] ?? $uploadedFiles['file'] ?? null;

            if (!$file || $file->getError() !== UPLOAD_ERR_OK) {
                $msg = $file ? $this->uploadErrorMessage($file->getError()) : 'Tidak ada file logo';
                return $this->jsonResponse($response, ['success' => false, 'message' => $msg], 400);
            }

            $mediaType = strtolower((string) $file->getClientMediaType());
            if (!in_array($mediaType, self::LOGO_ALLOWED_TYPES, true)) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Logo hanya boleh format PNG atau JPEG (.png, .jpg, .jpeg)'
                ], 400);
            }

            $origName = (string) $file->getClientFilename();
            $extLower = strtolower(pathinfo($origName, PATHINFO_EXTENSION));
            if (!in_array($extLower, ['jpg', 'jpeg', 'png'], true)) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Ekstensi file harus .jpg, .jpeg, atau .png'
                ], 400);
            }

            if ($file->getSize() > self::LOGO_MAX_SIZE) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Ukuran logo maksimal 1 MB. Kompres di perangkat lalu unggah lagi.'
                ], 400);
            }

            $isPng = ($mediaType === 'image/png' || $extLower === 'png');
            $workExt = $isPng ? 'png' : 'jpg';
            $fileName = 'madrasah_logo_' . uniqid('', true) . '.' . $workExt;
            $uploadDir = $this->getUgtDir();
            $filePath = $uploadDir . DIRECTORY_SEPARATOR . $fileName;

            $file->moveTo($filePath);

            $imageInfo = @getimagesize($filePath);
            if ($imageInfo === false || !isset($imageInfo[2])) {
                @unlink($filePath);
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'File bukan gambar yang valid'
                ], 400);
            }

            $itype = (int) $imageInfo[2];
            if (!in_array($itype, [IMAGETYPE_JPEG, IMAGETYPE_PNG], true)) {
                @unlink($filePath);
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Logo hanya boleh PNG atau JPEG'
                ], 400);
            }

            $relativePath = 'uploads/ugt/' . basename($filePath);

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Logo berhasil diunggah',
                'logo_path' => $relativePath
            ], 200);
        } catch (\Exception $e) {
            error_log('MadrasahFotoController::uploadLogo ' . $e->getMessage());
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Gagal mengunggah logo'], 500);
        }
    }

    /**
     * GET /api/madrasah/serve-foto?path=uploads/ugt/xxx.jpg - Stream foto madrasah (untuk preview/img src).
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
            if (strpos($path, 'ugt' . DIRECTORY_SEPARATOR) !== 0 && strpos($path, 'ugt/') !== 0) {
                return $response->withStatus(403);
            }

            $fullPath = $this->uploadsBasePath . DIRECTORY_SEPARATOR . $path;
            $real = realpath($fullPath);
            if ($real === false || !is_file($real) || strpos($real, $this->uploadsBasePath) !== 0) {
                return $response->withStatus(404);
            }

            $mime = @mime_content_type($real);
            if (!$mime || !preg_match('#^image/#', $mime)) {
                $mime = 'image/jpeg';
            }

            // Cache: browser & CDN boleh simpan 7 hari; ETag + Last-Modified untuk 304
            $mtime = filemtime($real);
            $etag = '"' . md5($real . (string) $mtime . (string) filesize($real)) . '"';
            $response = $response
                ->withHeader('Content-Type', $mime)
                ->withHeader('Cache-Control', 'public, max-age=604800') // 7 hari
                ->withHeader('Last-Modified', gmdate('D, d M Y H:i:s', $mtime) . ' GMT')
                ->withHeader('ETag', $etag);

            $ifNoneMatch = $request->getHeaderLine('If-None-Match');
            if ($ifNoneMatch !== '' && trim($ifNoneMatch) === $etag) {
                return $response->withStatus(304);
            }

            $response->getBody()->write(file_get_contents($real));
            return $response;
        } catch (\Exception $e) {
            error_log('MadrasahFotoController::serve ' . $e->getMessage());
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
