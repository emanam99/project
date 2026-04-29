<?php

namespace App\Controllers;

use App\Database;
use App\Helpers\FileUploadValidator;
use App\Helpers\RoleHelper;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

/**
 * Controller V2 untuk file lampiran rencana pengeluaran.
 * Menggunakan uploads_base_path (folder di luar public) - sama dengan SantriBerkasControllerV2.
 * Endpoint: /api/v2/pengeluaran/rencana/*
 */
class PengeluaranRencanaFileControllerV2
{
    private $db;
    private string $uploadsBasePath;
    private string $legacyUploadsPath;

    public function __construct()
    {
        $this->db = Database::getInstance()->getConnection();
        $config = require __DIR__ . '/../../config.php';
        $root = rtrim($config['uploads_base_path'] ?? __DIR__ . '/../..', '/\\');
        $folder = $config['uploads_folder'] ?? 'uploads';
        $uploadsDir = $root . DIRECTORY_SEPARATOR . trim($folder, '/\\');
        $this->uploadsBasePath = rtrim(realpath($uploadsDir) ?: $uploadsDir, DIRECTORY_SEPARATOR . '/');
        $this->legacyUploadsPath = rtrim(realpath(__DIR__ . '/../../uploads') ?: __DIR__ . '/../../uploads', DIRECTORY_SEPARATOR . '/');
    }

    private function jsonResponse(Response $response, array $data, int $statusCode): Response
    {
        $response->getBody()->write(json_encode($data, JSON_UNESCAPED_UNICODE));
        return $response
            ->withStatus($statusCode)
            ->withHeader('Content-Type', 'application/json; charset=utf-8');
    }

    /** Resolve path_file ke path fisik (cek new location dulu, fallback ke legacy) */
    private function resolveFilePath(string $pathFile): ?string
    {
        $pathFile = trim(str_replace(['/', '\\'], DIRECTORY_SEPARATOR, $pathFile), DIRECTORY_SEPARATOR);
        $newPath = $this->uploadsBasePath . DIRECTORY_SEPARATOR . $pathFile;
        if (file_exists($newPath) && is_file($newPath)) {
            return $newPath;
        }
        $legacyPath = $this->legacyUploadsPath . DIRECTORY_SEPARATOR . $pathFile;
        if (file_exists($legacyPath) && is_file($legacyPath)) {
            return $legacyPath;
        }
        return null;
    }

    private function getUploadErrorMessage(int $errorCode): string
    {
        switch ($errorCode) {
            case UPLOAD_ERR_INI_SIZE:
            case UPLOAD_ERR_FORM_SIZE:
                return 'Ukuran file terlalu besar';
            case UPLOAD_ERR_PARTIAL:
                return 'File hanya ter-upload sebagian';
            case UPLOAD_ERR_NO_FILE:
                return 'Tidak ada file yang di-upload';
            case UPLOAD_ERR_NO_TMP_DIR:
                return 'Folder temporary tidak ditemukan';
            case UPLOAD_ERR_CANT_WRITE:
                return 'Gagal menulis file ke disk';
            case UPLOAD_ERR_EXTENSION:
                return 'Upload dihentikan oleh extension';
            default:
                return 'Error tidak diketahui';
        }
    }

    /**
     * Pastikan path berada di dalam folder upload (cegah path traversal / exec dengan path arbitrer).
     */
    private function isPathInsideUploads(string $path): bool
    {
        $real = realpath($path);
        if ($real === false || !is_file($real)) {
            return false;
        }
        $baseNew = realpath($this->uploadsBasePath);
        if ($baseNew !== false) {
            $baseNew = rtrim($baseNew, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR;
            if (strpos($real, $baseNew) === 0) {
                return true;
            }
        }
        $baseLegacy = realpath($this->legacyUploadsPath);
        if ($baseLegacy !== false) {
            $baseLegacy = rtrim($baseLegacy, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR;
            if (strpos($real, $baseLegacy) === 0) {
                return true;
            }
        }
        return false;
    }

    /** Validasi gsPath hanya dari findGhostscript: literal 'gs' atau path ke gswin64c/gswin32c. */
    private function isGhostscriptPathAllowed(string $gsPath): bool
    {
        if ($gsPath === 'gs') {
            return true;
        }
        $normalized = str_replace('/', DIRECTORY_SEPARATOR, $gsPath);
        return (str_ends_with($normalized, 'gswin64c.exe') || str_ends_with($normalized, 'gswin32c.exe'));
    }

    private function compressPdf(string $filePath): ?string
    {
        try {
            $maxSizeBytes = 512 * 1024;
            if (filesize($filePath) <= $maxSizeBytes) {
                return null;
            }
            $gsPath = $this->findGhostscript();
            if ($gsPath) {
                return $this->compressPdfWithGhostscript($filePath, $gsPath, $maxSizeBytes);
            }
            return $this->compressPdfWithPhp($filePath, $maxSizeBytes);
        } catch (\Exception $e) {
            error_log("PengeluaranRencanaFileV2 compressPdf: " . $e->getMessage());
            return null;
        }
    }

    private function findGhostscript(): ?string
    {
        // String tetap, bukan input user
        @exec('gs --version 2>&1', $output, $returnVar);
        if ($returnVar === 0) {
            return 'gs';
        }
        if (strtoupper(substr(PHP_OS, 0, 3)) === 'WIN') {
            $programFiles = getenv('ProgramFiles') ?: 'C:\\Program Files';
            $gsDirs = glob($programFiles . '\\gs\\*');
            if (empty($gsDirs)) {
                $gsDirs = glob((getenv('ProgramFiles(x86)') ?: 'C:\\Program Files (x86)') . '\\gs\\*');
            }
            foreach ($gsDirs as $gsDir) {
                $exe = $gsDir . '\\bin\\gswin64c.exe';
                if (file_exists($exe)) return $exe;
                $exe = $gsDir . '\\bin\\gswin32c.exe';
                if (file_exists($exe)) return $exe;
            }
        }
        return null;
    }

    private function compressPdfWithGhostscript(string $filePath, string $gsPath, int $maxSizeBytes): ?string
    {
        try {
            if (!$this->isPathInsideUploads($filePath)) {
                error_log("compressPdfWithGhostscript: path di luar uploads");
                return null;
            }
            if (!$this->isGhostscriptPathAllowed($gsPath)) {
                error_log("compressPdfWithGhostscript: gsPath tidak diizinkan");
                return null;
            }
            $outputPath = $filePath . '.compressed.pdf';
            $quality = '/ebook';
            $command = escapeshellarg($gsPath) . ' -sDEVICE=pdfwrite -dCompatibilityLevel=1.4 -dPDFSETTINGS=' . $quality .
                ' -dNOPAUSE -dQUIET -dBATCH -dDetectDuplicateImages=true -dCompressFonts=true -r150' .
                ' -sOutputFile=' . escapeshellarg($outputPath) . ' ' . escapeshellarg($filePath) . ' 2>&1';
            exec($command, $output, $returnVar);
            if ($returnVar === 0 && file_exists($outputPath)) {
                if (filesize($outputPath) < filesize($filePath)) {
                    return $outputPath;
                }
                @unlink($outputPath);
            }
        } catch (\Exception $e) {
            error_log("compressPdfWithGhostscript: " . $e->getMessage());
        }
        return null;
    }

    private function compressPdfWithPhp(string $filePath, int $maxSizeBytes): ?string
    {
        try {
            $pdfContent = file_get_contents($filePath);
            if (!$pdfContent) return null;
            $optimized = preg_replace('/\s+/', ' ', $pdfContent);
            $optimized = preg_replace('/%\s*[^\r\n]*[\r\n]/', '', $optimized);
            if (strlen($optimized) < strlen($pdfContent) && strlen($optimized) > 0) {
                $outputPath = $filePath . '.compressed.pdf';
                if (file_put_contents($outputPath, $optimized) && filesize($outputPath) < filesize($filePath)) {
                    return $outputPath;
                }
                @unlink($outputPath);
            }
        } catch (\Exception $e) {
            error_log("compressPdfWithPhp: " . $e->getMessage());
        }
        return null;
    }

    /**
     * POST /api/v2/pengeluaran/rencana/{id}/file - Upload file (v2)
     */
    public function uploadFile(Request $request, Response $response, array $args): Response
    {
        try {
            $idRencana = $args['id'] ?? null;
            $user = $request->getAttribute('user');
            $idAdmin = $user['user_id'] ?? $user['id'] ?? null;

            if (!$idRencana) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'ID rencana tidak valid'], 400);
            }

            $checkSql = "SELECT id FROM pengeluaran___rencana WHERE id = ?";
            $checkStmt = $this->db->prepare($checkSql);
            $checkStmt->execute([$idRencana]);
            if ($checkStmt->rowCount() === 0) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Rencana pengeluaran tidak ditemukan'], 404);
            }

            $uploadedFiles = $request->getUploadedFiles();
            if (empty($uploadedFiles) || !isset($uploadedFiles['file'])) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'File tidak ditemukan'], 400);
            }

            $file = $uploadedFiles['file'];
            $allowedExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf', 'doc', 'docx', 'xls', 'xlsx'];
            $maxSize = 10 * 1024 * 1024;

            $validation = FileUploadValidator::validate($file, $allowedExtensions, $maxSize);
            if (!$validation['success']) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => $validation['message'],
                ], 400);
            }
            $fileType = $validation['mime'];
            $originalName = $file->getClientFilename();
            $extension = $validation['extension'];

            $fileName = uniqid('rencana_' . $idRencana . '_', true) . '.' . $extension;
            $relativePath = 'rencana-pengeluaran/' . $idRencana . '/' . $fileName;
            $uploadDir = $this->uploadsBasePath . DIRECTORY_SEPARATOR . 'rencana-pengeluaran' . DIRECTORY_SEPARATOR . $idRencana;
            if (!is_dir($uploadDir)) {
                mkdir($uploadDir, 0755, true);
            }
            $filePath = $uploadDir . DIRECTORY_SEPARATOR . $fileName;

            $file->moveTo($filePath);

            $postCheck = FileUploadValidator::validateMovedFile($filePath, $extension);
            if (!$postCheck['success']) {
                @unlink($filePath);
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => $postCheck['message'],
                ], 400);
            }
            if (!empty($postCheck['mime'])) {
                $fileType = $postCheck['mime'];
            }
            $finalFileSize = $file->getSize();

            if (($fileType === 'application/pdf' || $extension === 'pdf') && $finalFileSize > 512 * 1024) {
                try {
                    $compressedPath = $this->compressPdf($filePath);
                    if ($compressedPath && file_exists($compressedPath)) {
                        $compressedSize = filesize($compressedPath);
                        if ($compressedSize < $finalFileSize && $compressedSize > 0) {
                            if (file_exists($filePath)) unlink($filePath);
                            if (rename($compressedPath, $filePath)) {
                                $finalFileSize = $compressedSize;
                            } elseif (file_exists($compressedPath)) {
                                unlink($compressedPath);
                            }
                        } elseif (file_exists($compressedPath)) {
                            unlink($compressedPath);
                        }
                    }
                } catch (\Exception $e) {
                    error_log("PDF compression error: " . $e->getMessage());
                }
            }

            $sql = "INSERT INTO pengeluaran___rencana_file (id_pengeluaran_rencana, nama_file, nama_file_simpan, path_file, tipe_file, ukuran_file, id_admin) VALUES (?, ?, ?, ?, ?, ?, ?)";
            $stmt = $this->db->prepare($sql);
            $stmt->execute([$idRencana, $originalName, $fileName, $relativePath, $fileType, $finalFileSize, $idAdmin]);
            $fileId = $this->db->lastInsertId();

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'File berhasil di-upload',
                'data' => ['id' => $fileId, 'nama_file' => $originalName, 'nama_file_simpan' => $fileName, 'tipe_file' => $fileType, 'ukuran_file' => $finalFileSize]
            ], 201);
        } catch (\Exception $e) {
            error_log("PengeluaranRencanaFileV2 upload: " . $e->getMessage());
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Gagal meng-upload file'], 500);
        }
    }

    /**
     * GET /api/v2/pengeluaran/rencana/{id}/file - List file (sama dengan v1, hanya routing)
     */
    public function getFiles(Request $request, Response $response, array $args): Response
    {
        try {
            $idRencana = $args['id'] ?? null;
            if (!$idRencana) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'ID rencana tidak valid'], 400);
            }
            $sql = "SELECT f.*, p.nama as admin_nama FROM pengeluaran___rencana_file f LEFT JOIN pengurus p ON f.id_admin = p.id WHERE f.id_pengeluaran_rencana = ? ORDER BY f.tanggal_dibuat DESC";
            $stmt = $this->db->prepare($sql);
            $stmt->execute([$idRencana]);
            $files = $stmt->fetchAll();
            return $this->jsonResponse($response, ['success' => true, 'data' => $files], 200);
        } catch (\Exception $e) {
            error_log("PengeluaranRencanaFileV2 getFiles: " . $e->getMessage());
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Gagal mengambil daftar file'], 500);
        }
    }

    /**
     * GET /api/v2/pengeluaran/rencana/file/{fileId}/download - Download (resolve ke new/legacy path)
     */
    public function downloadFile(Request $request, Response $response, array $args): Response
    {
        try {
            $fileId = $args['fileId'] ?? null;
            if (!$fileId) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'ID file tidak valid'], 400);
            }
            $stmt = $this->db->prepare("SELECT * FROM pengeluaran___rencana_file WHERE id = ?");
            $stmt->execute([$fileId]);
            $file = $stmt->fetch();
            if (!$file) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'File tidak ditemukan'], 404);
            }
            $physicalPath = $this->resolveFilePath($file['path_file']);
            if (!$physicalPath) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'File tidak ditemukan di server'], 404);
            }
            $response = $response->withHeader('Content-Type', $file['tipe_file']);
            $response = $response->withHeader('Content-Disposition', 'inline; filename="' . $file['nama_file'] . '"');
            $response = $response->withHeader('Content-Length', (string)filesize($physicalPath));
            $response->getBody()->write(file_get_contents($physicalPath));
            return $response;
        } catch (\Exception $e) {
            error_log("PengeluaranRencanaFileV2 download: " . $e->getMessage());
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Gagal mengunduh file'], 500);
        }
    }

    /**
     * DELETE /api/v2/pengeluaran/rencana/file/{fileId} - Hapus file (resolve ke new/legacy path)
     */
    public function deleteFile(Request $request, Response $response, array $args): Response
    {
        try {
            $fileId = $args['fileId'] ?? null;
            $user = $request->getAttribute('user');
            $idAdmin = $user['user_id'] ?? $user['id'] ?? null;
            if (!$fileId) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'ID file tidak valid'], 400);
            }
            $stmt = $this->db->prepare("SELECT * FROM pengeluaran___rencana_file WHERE id = ?");
            $stmt->execute([$fileId]);
            $file = $stmt->fetch();
            if (!$file) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'File tidak ditemukan'], 404);
            }
            $isOwner = ($file['id_admin'] == $idAdmin);
            $idAdminInt = (int) ($idAdmin ?? 0);
            $isSuperAdmin = $idAdminInt > 0 && RoleHelper::pengurusHasSuperAdminRole($idAdminInt);
            if (!$isOwner && !$isSuperAdmin) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Anda tidak memiliki izin untuk menghapus file ini'], 403);
            }
            $physicalPath = $this->resolveFilePath($file['path_file']);
            if ($physicalPath && file_exists($physicalPath)) {
                unlink($physicalPath);
            }
            $this->db->prepare("DELETE FROM pengeluaran___rencana_file WHERE id = ?")->execute([$fileId]);
            return $this->jsonResponse($response, ['success' => true, 'message' => 'File berhasil dihapus'], 200);
        } catch (\Exception $e) {
            error_log("PengeluaranRencanaFileV2 delete: " . $e->getMessage());
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Gagal menghapus file'], 500);
        }
    }
}
