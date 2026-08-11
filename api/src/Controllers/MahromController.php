<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Database;
use App\Services\MahromService;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

class MahromController
{
    private \PDO $db;
    private string $uploadsBasePath;
    private const FOTO_MAX_SIZE = 1024 * 1024;
    private const FOTO_ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];

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
        return $response->withStatus($statusCode)->withHeader('Content-Type', 'application/json; charset=utf-8');
    }

    private function svc(): MahromService
    {
        return new MahromService($this->db);
    }

    /**
     * GET /api/v2/mahrom — daftar mahrom (paginated).
     */
    public function getList(Request $request, Response $response): Response
    {
        try {
            $q = $request->getQueryParams();
            $result = $this->svc()->list([
                'search' => $q['search'] ?? '',
                'page' => $q['page'] ?? 1,
                'limit' => $q['limit'] ?? 20,
                'aktif' => array_key_exists('aktif', $q) ? $q['aktif'] : 1,
            ]);
            return $this->jsonResponse($response, [
                'success' => true,
                'data' => $result['items'],
                'pagination' => [
                    'total' => $result['total'],
                    'page' => $result['page'],
                    'limit' => $result['limit'],
                    'total_pages' => $result['total_pages'],
                ],
            ], 200);
        } catch (\Exception $e) {
            error_log('MahromController::getList ' . $e->getMessage());
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Gagal memuat daftar mahrom'], 500);
        }
    }

    /**
     * GET /api/v2/mahrom/hubungan-options
     */
    public function getHubunganOptions(Request $request, Response $response): Response
    {
        return $this->jsonResponse($response, [
            'success' => true,
            'data' => MahromService::HUBUNGAN_OPTIONS,
        ], 200);
    }

    /**
     * GET /api/v2/mahrom/check-nik?nik=&exclude_id=
     */
    public function checkNik(Request $request, Response $response): Response
    {
        try {
            $q = $request->getQueryParams();
            $nik = trim((string) ($q['nik'] ?? ''));
            if ($nik === '') {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Parameter nik wajib diisi'], 400);
            }
            $excludeId = isset($q['exclude_id']) ? (int) $q['exclude_id'] : null;
            $result = $this->svc()->checkNik($nik, $excludeId > 0 ? $excludeId : null);
            if (!$result['success']) {
                return $this->jsonResponse($response, $result, 400);
            }
            return $this->jsonResponse($response, $result, 200);
        } catch (\Exception $e) {
            error_log('MahromController::checkNik ' . $e->getMessage());
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Gagal memeriksa NIK'], 500);
        }
    }

    /**
     * GET /api/v2/mahrom/santri-options?search=
     */
    public function getSantriOptions(Request $request, Response $response): Response
    {
        try {
            $q = $request->getQueryParams();
            $search = trim((string) ($q['search'] ?? ''));
            $limit = isset($q['limit']) ? (int) $q['limit'] : 30;
            $data = $this->svc()->searchSantriOptions($search, $limit);
            return $this->jsonResponse($response, ['success' => true, 'data' => $data], 200);
        } catch (\Exception $e) {
            error_log('MahromController::getSantriOptions ' . $e->getMessage());
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Gagal memuat santri'], 500);
        }
    }

    /**
     * GET /api/v2/mahrom/santri/{santriId} — mahrom terhubung ke santri (untuk kartu CM).
     */
    public function listBySantri(Request $request, Response $response, array $args): Response
    {
        try {
            $santriId = (int) ($args['santriId'] ?? 0);
            if ($santriId <= 0) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'santri_id tidak valid'], 400);
            }
            $list = $this->svc()->listBySantri($santriId);
            return $this->jsonResponse($response, ['success' => true, 'data' => $list], 200);
        } catch (\Exception $e) {
            error_log('MahromController::listBySantri ' . $e->getMessage());
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Gagal memuat mahrom'], 500);
        }
    }

    /**
     * GET /api/v2/mahrom/{id}
     */
    public function getById(Request $request, Response $response, array $args): Response
    {
        try {
            $id = (int) ($args['id'] ?? 0);
            if ($id <= 0) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'ID tidak valid'], 400);
            }
            $row = $this->svc()->getById($id);
            if ($row === null) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Mahrom tidak ditemukan'], 404);
            }
            return $this->jsonResponse($response, ['success' => true, 'data' => $row], 200);
        } catch (\Exception $e) {
            error_log('MahromController::getById ' . $e->getMessage());
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Gagal memuat mahrom'], 500);
        }
    }

    /**
     * POST /api/v2/mahrom
     */
    public function create(Request $request, Response $response): Response
    {
        try {
            $data = $request->getParsedBody() ?? [];
            $result = $this->svc()->create(is_array($data) ? $data : []);
            if (!$result['success']) {
                $status = (($result['code'] ?? '') === 'NIK_EXISTS') ? 409 : 400;
                return $this->jsonResponse($response, $result, $status);
            }
            return $this->jsonResponse($response, $result, 201);
        } catch (\Exception $e) {
            error_log('MahromController::create ' . $e->getMessage());
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Gagal menyimpan mahrom'], 500);
        }
    }

    /**
     * POST /api/v2/mahrom/{id}/link-santri — body: { relasi: [...] }
     */
    public function linkSantri(Request $request, Response $response, array $args): Response
    {
        try {
            $id = (int) ($args['id'] ?? 0);
            $data = $request->getParsedBody() ?? [];
            $relasi = is_array($data) ? ($data['relasi'] ?? []) : [];
            if (!is_array($relasi)) {
                $relasi = [];
            }
            $result = $this->svc()->linkSantri($id, $relasi);
            if (!$result['success']) {
                $code = str_contains($result['message'] ?? '', 'tidak ditemukan') ? 404 : 400;
                return $this->jsonResponse($response, $result, $code);
            }
            return $this->jsonResponse($response, $result, 200);
        } catch (\Exception $e) {
            error_log('MahromController::linkSantri ' . $e->getMessage());
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Gagal menautkan santri'], 500);
        }
    }

    /**
     * PUT /api/v2/mahrom/{id}
     */
    public function update(Request $request, Response $response, array $args): Response
    {
        try {
            $id = (int) ($args['id'] ?? 0);
            $data = $request->getParsedBody() ?? [];
            $result = $this->svc()->update($id, is_array($data) ? $data : []);
            if (!$result['success']) {
                $code = str_contains($result['message'] ?? '', 'tidak ditemukan') ? 404 : 400;
                return $this->jsonResponse($response, $result, $code);
            }
            return $this->jsonResponse($response, $result, 200);
        } catch (\Exception $e) {
            error_log('MahromController::update ' . $e->getMessage());
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Gagal memperbarui mahrom'], 500);
        }
    }

    /**
     * PATCH /api/v2/mahrom/{id}/aktif — body: { aktif: 0|1 }
     */
    public function patchAktif(Request $request, Response $response, array $args): Response
    {
        try {
            $id = (int) ($args['id'] ?? 0);
            $data = $request->getParsedBody() ?? [];
            $aktif = !empty($data['aktif']) && (int) $data['aktif'] !== 0;
            $result = $this->svc()->setAktif($id, $aktif);
            if (!$result['success']) {
                $code = str_contains($result['message'] ?? '', 'tidak ditemukan') ? 404 : 400;
                return $this->jsonResponse($response, $result, $code);
            }
            return $this->jsonResponse($response, ['success' => true, 'aktif' => $aktif], 200);
        } catch (\Exception $e) {
            error_log('MahromController::patchAktif ' . $e->getMessage());
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Gagal mengubah status mahrom'], 500);
        }
    }

    /**
     * GET /api/v2/mahrom/serve-foto?path=uploads/mahrom/xxx.jpg
     */
    public function serveFoto(Request $request, Response $response): Response
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
            if (strpos($path, 'mahrom' . DIRECTORY_SEPARATOR) !== 0 && strpos($path, 'mahrom/') !== 0) {
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
            error_log('MahromController::serveFoto ' . $e->getMessage());
            return $response->withStatus(500);
        }
    }

    /**
     * POST /api/v2/mahrom/upload-foto — Form: foto (file), mahrom_id
     */
    public function uploadFoto(Request $request, Response $response): Response
    {
        try {
            $uploadedFiles = $request->getUploadedFiles();
            $file = $uploadedFiles['foto'] ?? $uploadedFiles['file'] ?? null;

            if (!$file || $file->getError() !== UPLOAD_ERR_OK) {
                $msg = $file ? $this->uploadErrorMessage($file->getError()) : 'Tidak ada file foto';
                return $this->jsonResponse($response, ['success' => false, 'message' => $msg], 400);
            }

            $mediaType = $file->getClientMediaType();
            if (!in_array($mediaType, self::FOTO_ALLOWED_TYPES, true)) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Hanya file gambar (JPEG, PNG, WebP, GIF) yang diizinkan',
                ], 400);
            }

            if ($file->getSize() > self::FOTO_MAX_SIZE) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Ukuran file maksimal 1 MB',
                ], 400);
            }

            $parsedBody = $request->getParsedBody();
            $parsedBody = is_array($parsedBody) ? $parsedBody : [];
            $mahromId = isset($parsedBody['mahrom_id']) ? (int) $parsedBody['mahrom_id'] : 0;
            if ($mahromId <= 0) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'mahrom_id wajib diisi'], 400);
            }

            $stmt = $this->db->prepare('SELECT id, foto_path FROM mahrom WHERE id = ? LIMIT 1');
            $stmt->execute([$mahromId]);
            $mahrom = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$mahrom) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Mahrom tidak ditemukan'], 404);
            }

            $ext = preg_match('#^image/(jpeg|png|webp|gif)$#', $mediaType, $m) ? ($m[1] === 'jpeg' ? 'jpg' : $m[1]) : 'jpg';
            $fileName = 'foto_mahrom_' . $mahromId . '_' . uniqid('', true) . '.' . $ext;
            $uploadDir = $this->getMahromUploadDir();
            $filePath = $uploadDir . DIRECTORY_SEPARATOR . $fileName;
            $relativePath = 'uploads/mahrom/' . $fileName;

            $file->moveTo($filePath);

            $imageInfo = @getimagesize($filePath);
            if ($imageInfo === false || !isset($imageInfo[2]) || !in_array($imageInfo[2], [IMAGETYPE_JPEG, IMAGETYPE_PNG, IMAGETYPE_GIF, IMAGETYPE_WEBP], true)) {
                if (file_exists($filePath)) {
                    @unlink($filePath);
                }
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'File bukan gambar yang valid',
                ], 400);
            }

            $oldPath = trim((string) ($mahrom['foto_path'] ?? ''));
            if ($oldPath !== '') {
                $this->unlinkMahromFotoFile($oldPath);
            }

            $up = $this->db->prepare('UPDATE mahrom SET foto_path = ? WHERE id = ?');
            $up->execute([$relativePath, $mahromId]);

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Foto berhasil diunggah',
                'foto_path' => $relativePath,
            ], 200);
        } catch (\Exception $e) {
            error_log('MahromController::uploadFoto ' . $e->getMessage());
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Gagal mengunggah foto'], 500);
        }
    }

    private function getMahromUploadDir(): string
    {
        $dir = $this->uploadsBasePath . DIRECTORY_SEPARATOR . 'mahrom';
        if (!is_dir($dir)) {
            mkdir($dir, 0755, true);
        }
        return $dir;
    }

    private function unlinkMahromFotoFile(string $pathFile): void
    {
        $pathFile = trim(str_replace(['/', '\\'], DIRECTORY_SEPARATOR, $pathFile), DIRECTORY_SEPARATOR);
        if (stripos($pathFile, 'uploads') === 0) {
            $pathFile = trim(substr($pathFile, strlen('uploads')), DIRECTORY_SEPARATOR);
        }
        if ($pathFile === '' || (strpos($pathFile, 'mahrom' . DIRECTORY_SEPARATOR) !== 0 && strpos($pathFile, 'mahrom/') !== 0)) {
            return;
        }
        $full = $this->uploadsBasePath . DIRECTORY_SEPARATOR . $pathFile;
        if (is_file($full)) {
            @unlink($full);
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
