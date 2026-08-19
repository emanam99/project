<?php

namespace App\Controllers;

use App\Config\Database;
use App\Helpers\AuthHelper;
use App\Helpers\FileUploadValidator;
use PDO;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

class BelanjaFileController
{
    private PDO $db;
    private string $uploadsBase;

    public function __construct()
    {
        $this->db = Database::getInstance();
        $base = rtrim((string) ($_ENV['UPLOADS_PATH'] ?? ''), '/\\');
        if ($base === '') {
            $base = dirname(__DIR__, 2) . DIRECTORY_SEPARATOR . 'uploads';
        }
        $this->uploadsBase = $base;
    }

    private function json(Response $response, array $payload, int $status = 200): Response
    {
        $response->getBody()->write(json_encode($payload, JSON_UNESCAPED_UNICODE));
        return $response->withHeader('Content-Type', 'application/json')->withStatus($status);
    }

    private function findBelanja(int $id): ?array
    {
        $stmt = $this->db->prepare('SELECT id FROM belanja WHERE id = ? LIMIT 1');
        $stmt->execute([$id]);
        $row = $stmt->fetch();
        return $row ?: null;
    }

    /** GET /belanja/{id}/files */
    public function index(Request $request, Response $response, array $args): Response
    {
        $belanjaId = (int) ($args['id'] ?? 0);
        if (!$this->findBelanja($belanjaId)) {
            return $this->json($response, ['success' => false, 'message' => 'Catatan tidak ditemukan'], 404);
        }

        $stmt = $this->db->prepare(
            'SELECT f.id, f.belanja_id, f.nama_file, f.nama_file_simpan, f.path_file, f.tipe_file,
                    f.ukuran_file, f.uploaded_by, f.created_at, u.name AS uploaded_by_name
             FROM belanja_file f
             LEFT JOIN users u ON u.id = f.uploaded_by
             WHERE f.belanja_id = ?
             ORDER BY f.created_at DESC, f.id DESC'
        );
        $stmt->execute([$belanjaId]);

        return $this->json($response, ['success' => true, 'data' => $stmt->fetchAll()]);
    }

    /** POST /belanja/{id}/files — multipart field "file" */
    public function upload(Request $request, Response $response, array $args): Response
    {
        $actor = $request->getAttribute('user');
        if (!AuthHelper::canManageData($actor['role'] ?? null)) {
            return $this->json($response, ['success' => false, 'message' => 'Hanya admin yang dapat meng-upload'], 403);
        }

        $belanjaId = (int) ($args['id'] ?? 0);
        if (!$this->findBelanja($belanjaId)) {
            return $this->json($response, ['success' => false, 'message' => 'Catatan tidak ditemukan'], 404);
        }

        $uploaded = $request->getUploadedFiles();
        if (empty($uploaded['file'])) {
            return $this->json($response, ['success' => false, 'message' => 'File tidak ditemukan'], 400);
        }
        $file = $uploaded['file'];

        $allowed = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf', 'xls', 'xlsx'];
        $validation = FileUploadValidator::validate($file, $allowed);
        if (!$validation['success']) {
            return $this->json($response, ['success' => false, 'message' => $validation['message']], 400);
        }

        $extension = $validation['extension'];
        $originalName = (string) $file->getClientFilename();
        $mime = (string) ($validation['mime'] ?? 'application/octet-stream');

        $saveName = uniqid('belanja_' . $belanjaId . '_', true) . '.' . $extension;
        $relativePath = 'belanja/' . $belanjaId . '/' . $saveName;
        $dir = $this->uploadsBase . DIRECTORY_SEPARATOR . 'belanja' . DIRECTORY_SEPARATOR . $belanjaId;
        if (!is_dir($dir) && !@mkdir($dir, 0755, true) && !is_dir($dir)) {
            return $this->json($response, [
                'success' => false,
                'message' => 'Gagal membuat folder upload. Periksa izin folder uploads.',
            ], 507);
        }
        $fullPath = $dir . DIRECTORY_SEPARATOR . $saveName;

        try {
            $file->moveTo($fullPath);
        } catch (\Throwable $e) {
            error_log('Kasly BelanjaFile upload moveTo: ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Gagal menyimpan file ke server'], 500);
        }

        $post = FileUploadValidator::validateMovedFile($fullPath, $extension);
        if (!$post['success']) {
            @unlink($fullPath);
            return $this->json($response, ['success' => false, 'message' => $post['message']], 400);
        }
        if (!empty($post['mime'])) {
            $mime = $post['mime'];
        }

        $diskSize = @filesize($fullPath);
        $finalSize = $diskSize !== false ? (int) $diskSize : (int) ($validation['size'] ?? 0);

        $ins = $this->db->prepare(
            'INSERT INTO belanja_file (belanja_id, nama_file, nama_file_simpan, path_file, tipe_file, ukuran_file, uploaded_by)
             VALUES (?, ?, ?, ?, ?, ?, ?)'
        );
        $ins->execute([
            $belanjaId,
            $originalName,
            $saveName,
            $relativePath,
            $mime,
            $finalSize,
            $actor['id'] ?? null,
        ]);
        $fileId = (int) $this->db->lastInsertId();

        return $this->json($response, [
            'success' => true,
            'message' => 'File berhasil di-upload',
            'data' => [
                'id' => $fileId,
                'belanja_id' => $belanjaId,
                'nama_file' => $originalName,
                'nama_file_simpan' => $saveName,
                'tipe_file' => $mime,
                'ukuran_file' => $finalSize,
                'uploaded_by' => $actor['id'] ?? null,
                'uploaded_by_name' => $actor['name'] ?? null,
            ],
        ], 201);
    }

    /** GET /belanja/files/{fileId}/download */
    public function download(Request $request, Response $response, array $args): Response
    {
        $fileId = (int) ($args['fileId'] ?? 0);
        $stmt = $this->db->prepare('SELECT * FROM belanja_file WHERE id = ? LIMIT 1');
        $stmt->execute([$fileId]);
        $row = $stmt->fetch();
        if (!$row) {
            return $this->json($response, ['success' => false, 'message' => 'File tidak ditemukan'], 404);
        }

        $path = $this->resolvePath((string) $row['path_file']);
        if ($path === null) {
            return $this->json($response, ['success' => false, 'message' => 'File fisik tidak ditemukan'], 404);
        }

        $mime = (string) ($row['tipe_file'] ?: 'application/octet-stream');
        $name = (string) $row['nama_file'];
        $stream = fopen($path, 'rb');
        if ($stream === false) {
            return $this->json($response, ['success' => false, 'message' => 'Gagal membuka file'], 500);
        }

        $response = $response
            ->withHeader('Content-Type', $mime)
            ->withHeader('Content-Disposition', 'inline; filename="' . str_replace(['"', "\r", "\n"], '', $name) . '"')
            ->withHeader('Content-Length', (string) filesize($path))
            ->withHeader('Cache-Control', 'private, max-age=0, must-revalidate')
            ->withStatus(200);
        $response->getBody()->write(stream_get_contents($stream) ?: '');
        fclose($stream);
        return $response;
    }

    /** DELETE /belanja/files/{fileId} */
    public function delete(Request $request, Response $response, array $args): Response
    {
        $actor = $request->getAttribute('user');
        if (!AuthHelper::canManageData($actor['role'] ?? null)) {
            return $this->json($response, ['success' => false, 'message' => 'Hanya admin yang dapat menghapus'], 403);
        }

        $fileId = (int) ($args['fileId'] ?? 0);
        $stmt = $this->db->prepare('SELECT * FROM belanja_file WHERE id = ? LIMIT 1');
        $stmt->execute([$fileId]);
        $row = $stmt->fetch();
        if (!$row) {
            return $this->json($response, ['success' => false, 'message' => 'File tidak ditemukan'], 404);
        }

        $path = $this->resolvePath((string) $row['path_file']);
        $del = $this->db->prepare('DELETE FROM belanja_file WHERE id = ?');
        $del->execute([$fileId]);
        if ($path) {
            @unlink($path);
        }

        return $this->json($response, ['success' => true, 'message' => 'File dihapus']);
    }

    private function resolvePath(string $pathFile): ?string
    {
        $pathFile = trim(str_replace(['/', '\\'], DIRECTORY_SEPARATOR, $pathFile), DIRECTORY_SEPARATOR);
        if ($pathFile === '' || str_contains($pathFile, '..')) {
            return null;
        }
        $full = $this->uploadsBase . DIRECTORY_SEPARATOR . $pathFile;
        $real = realpath($full);
        $baseReal = realpath($this->uploadsBase);
        if ($real === false || $baseReal === false || !is_file($real)) {
            return null;
        }
        if (!str_starts_with($real, rtrim($baseReal, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR)) {
            return null;
        }
        return $real;
    }
}
