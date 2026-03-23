<?php

namespace App\Controllers;

use App\Database;
use App\Helpers\SantriHelper;
use App\Helpers\TextSanitizer;
use App\Helpers\UserAktivitasLogger;
use App\Helpers\RoleHelper;
use App\Services\WhatsAppService;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

/**
 * Controller V2 untuk upload berkas santri.
 * Menggunakan folder uploads di luar public (berdampingan dengan public_html).
 * Struktur: uploads/santri/
 *
 * Endpoint: /api/v2/santri-berkas/*
 */
class SantriBerkasControllerV2
{
    /** Daftar jenis berkas wajib PSB (sama dengan frontend Dashboard) - semua harus ada (upload atau tandai tidak ada) */
    private const PSB_REQUIRED_BERKAS = [
        'Ijazah SD Sederajat', 'Ijazah SMP Sederajat', 'Ijazah SMA Sederajat', 'SKL',
        'KTP Santri', 'KTP Ayah', 'KTP Ibu', 'KTP Wali',
        'KK Santri', 'KK Ayah', 'KK Ibu', 'KK Wali',
        'Akta Lahir', 'KIP', 'PKH', 'KKS', 'Kartu Bantuan Lain', 'Surat Pindah',
        'Surat Perjanjian Kapdar',
        'Pakta Integritas'
    ];

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
        return $response
            ->withStatus($statusCode)
            ->withHeader('Content-Type', 'application/json; charset=utf-8');
    }

    /**
     * Resolve path_file dari DB ke path absolut.
     * path_file di DB: "uploads/santri/xxx" atau "santri/xxx"
     */
    private function resolveFilePath(string $pathFile): string
    {
        $pathFile = trim(str_replace(['/', '\\'], DIRECTORY_SEPARATOR, $pathFile), DIRECTORY_SEPARATOR);
        if (stripos($pathFile, 'uploads') === 0) {
            $pathFile = trim(substr($pathFile, strlen('uploads')), DIRECTORY_SEPARATOR);
        }
        return $this->uploadsBasePath . DIRECTORY_SEPARATOR . $pathFile;
    }

    /**
     * Dapatkan path folder santri untuk upload
     */
    private function getSantriUploadDir(): string
    {
        $dir = $this->uploadsBasePath . DIRECTORY_SEPARATOR . 'santri';
        if (!is_dir($dir)) {
            mkdir($dir, 0755, true);
        }
        return $dir;
    }

    private function getUploadErrorMessage(int $errorCode): string
    {
        switch ($errorCode) {
            case UPLOAD_ERR_INI_SIZE:
            case UPLOAD_ERR_FORM_SIZE:
                return 'File terlalu besar';
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
     * POST /api/v2/santri-berkas/upload - Upload berkas santri (ke uploads/santri/)
     */
    public function uploadBerkas(Request $request, Response $response): Response
    {
        try {
            $user = $request->getAttribute('user');
            $userArr = is_array($user) ? $user : [];
            $idAdmin = RoleHelper::tokenIsSantriDaftarContext($userArr) ? null : ($userArr['user_id'] ?? $userArr['id'] ?? null);

            $parsedBody = $request->getParsedBody();
            $parsedBody = is_array($parsedBody) ? TextSanitizer::sanitizeStringValues($parsedBody, []) : [];
            $idSantri = $parsedBody['id_santri'] ?? null;
            $jenisBerkas = $parsedBody['jenis_berkas'] ?? null;
            $keterangan = $parsedBody['keterangan'] ?? null;

            if (!$idSantri) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'ID santri wajib diisi'], 400);
            }
            if (!$jenisBerkas) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Jenis berkas wajib diisi'], 400);
            }

            $idSantriResolved = SantriHelper::resolveId($this->db, $idSantri);
            if ($idSantriResolved === null) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Santri tidak ditemukan'], 404);
            }
            $idSantri = $idSantriResolved;

            $uploadedFiles = $request->getUploadedFiles();
            if (empty($uploadedFiles) || !isset($uploadedFiles['file'])) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'File tidak ditemukan'], 400);
            }

            $file = $uploadedFiles['file'];
            if ($file->getError() !== UPLOAD_ERR_OK) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Error saat upload file: ' . $this->getUploadErrorMessage($file->getError())
                ], 400);
            }

            $allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];
            $fileType = $file->getClientMediaType();
            $originalName = $file->getClientFilename();
            $extension = strtolower(pathinfo($originalName, PATHINFO_EXTENSION));
            $allowedExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf'];

            if (!in_array($fileType, $allowedTypes) && !in_array($extension, $allowedExtensions)) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Tipe file tidak diizinkan. Hanya gambar (JPEG, PNG, GIF, WEBP) dan PDF yang diizinkan'
                ], 400);
            }

            $maxSize = 10 * 1024 * 1024;
            if ($file->getSize() > $maxSize) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Ukuran file terlalu besar. Maksimal 10MB'], 400);
            }

            $checkSql = "SELECT id, path_file FROM santri___berkas WHERE id_santri = ? AND jenis_berkas = ?";
            $checkStmt = $this->db->prepare($checkSql);
            $checkStmt->execute([$idSantri, $jenisBerkas]);
            $existingBerkas = $checkStmt->fetch(\PDO::FETCH_ASSOC);

            $isFotoJuara = ($jenisBerkas === 'foto_juara');
            if ($isFotoJuara) {
                $existingBerkas = null;
            }

            $sanitizedJenis = preg_replace('/[^a-zA-Z0-9_\-]/', '_', $jenisBerkas);
            $fileName = uniqid('santri_' . $idSantri . '_' . $sanitizedJenis . '_', true) . '.' . $extension;

            $uploadDir = $this->getSantriUploadDir();
            $filePath = $uploadDir . DIRECTORY_SEPARATOR . $fileName;
            $relativePath = 'uploads/santri/' . $fileName;

            $file->moveTo($filePath);
            $finalFileSize = filesize($filePath);

            if ($existingBerkas) {
                $oldFilePath = $this->resolveFilePath($existingBerkas['path_file']);
                if (file_exists($oldFilePath)) {
                    unlink($oldFilePath);
                }

                $sql = "UPDATE santri___berkas SET nama_file = ?, path_file = ?, ukuran_file = ?, tipe_file = ?, keterangan = ?, id_admin = ?, tanggal_update = CURRENT_TIMESTAMP WHERE id = ?";
                $stmt = $this->db->prepare($sql);
                $stmt->execute([$originalName, $relativePath, $finalFileSize, $fileType, $keterangan ?? null, $idAdmin, $existingBerkas['id']]);
                $berkasId = $existingBerkas['id'];
            } else {
                $sql = "INSERT INTO santri___berkas (id_santri, jenis_berkas, nama_file, path_file, ukuran_file, tipe_file, keterangan, id_admin) VALUES (?, ?, ?, ?, ?, ?, ?, ?)";
                $stmt = $this->db->prepare($sql);
                $stmt->execute([$idSantri, $jenisBerkas, $originalName, $relativePath, $finalFileSize, $fileType, $keterangan, $idAdmin]);
                $berkasId = $this->db->lastInsertId();
            }

            $this->checkBerkasLengkapAndSendWa((int) $idSantri, $request);

            // Jika upload Bukti Pembayaran, kirim WA link ke halaman pembayaran
            if (stripos($jenisBerkas, 'Bukti Pembayaran') !== false) {
                try {
                    $stmtSantri = $this->db->prepare("SELECT nama, no_telpon, no_wa_santri FROM santri WHERE id = ?");
                    $stmtSantri->execute([$idSantri]);
                    $santri = $stmtSantri->fetch(\PDO::FETCH_ASSOC);
                    if ($santri) {
                        $noWa = trim($santri['no_wa_santri'] ?? '') ?: trim($santri['no_telpon'] ?? '');
                        if ($noWa !== '') {
                            WhatsAppService::sendPsbPembayaranLink($noWa, $santri['nama'] ?? '', 'open', isset($santri['id']) ? (int) $santri['id'] : null);
                        }
                    }
                } catch (\Throwable $e) {
                    error_log("SantriBerkasControllerV2 upload: send WA link error " . $e->getMessage());
                }
            }

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => $existingBerkas ? 'Berkas berhasil diganti' : 'Berkas berhasil di-upload',
                'data' => [
                    'id' => $berkasId,
                    'id_santri' => $idSantri,
                    'jenis_berkas' => $jenisBerkas,
                    'nama_file' => $originalName,
                    'path_file' => $relativePath,
                    'tipe_file' => $fileType,
                    'ukuran_file' => $finalFileSize,
                    'keterangan' => $keterangan
                ]
            ], $existingBerkas ? 200 : 201);

        } catch (\Exception $e) {
            error_log("Upload berkas santri v2 error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal meng-upload berkas: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * GET /api/v2/santri-berkas/list - Daftar berkas santri
     * Role santri: hanya daftar berkas sendiri (id dari token). Admin/psb: boleh id_santri di query.
     */
    public function getBerkasList(Request $request, Response $response): Response
    {
        try {
            $user = $request->getAttribute('user');
            $userArr = is_array($user) ? $user : [];
            $queryParams = $request->getQueryParams();
            $idSantri = $queryParams['id_santri'] ?? null;

            if (!RoleHelper::tokenCanQueryAnyPendaftaranSantri($userArr) && RoleHelper::tokenIsSantriDaftarContext($userArr)) {
                // Konteks santri-app: utamakan id dari token (anti-IDOR). Fallback query jika token belum berisi id (santri baru).
                $idFromToken = $userArr['user_id'] ?? $userArr['id'] ?? $userArr['santri_id'] ?? null;
                if ($idFromToken !== null && $idFromToken !== '') {
                    $idSantri = $idFromToken;
                }
            }
            $jenisBerkas = $queryParams['jenis_berkas'] ?? null;

            if (!$idSantri) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Parameter id_santri wajib diisi'], 400);
            }

            $resolvedId = SantriHelper::resolveId($this->db, $idSantri);
            if ($resolvedId === null) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Santri tidak ditemukan'], 404);
            }

            $sql = "SELECT b.*, p.nama AS admin_nama FROM santri___berkas b LEFT JOIN pengurus p ON b.id_admin = p.id WHERE b.id_santri = ?";
            $params = [$resolvedId];
            if ($jenisBerkas && $jenisBerkas !== '') {
                $sql .= " AND b.jenis_berkas = ?";
                $params[] = $jenisBerkas;
            }
            $sql .= " ORDER BY b.tanggal_dibuat DESC";

            $stmt = $this->db->prepare($sql);
            $stmt->execute($params);
            $data = $stmt->fetchAll(\PDO::FETCH_ASSOC);

            return $this->jsonResponse($response, ['success' => true, 'id_santri' => $resolvedId, 'data' => $data], 200);

        } catch (\Exception $e) {
            error_log("Get berkas list v2 error: " . $e->getMessage());
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Gagal mengambil daftar berkas: ' . $e->getMessage()], 500);
        }
    }

    /**
     * DELETE /api/v2/santri-berkas/delete - Hapus berkas santri
     */
    public function deleteBerkas(Request $request, Response $response): Response
    {
        try {
            $parsedBody = $request->getParsedBody();
            $idBerkas = $parsedBody['id'] ?? null;

            if (!$idBerkas) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'ID berkas wajib diisi'], 400);
            }

            $sql = "SELECT * FROM santri___berkas WHERE id = ?";
            $stmt = $this->db->prepare($sql);
            $stmt->execute([$idBerkas]);
            $berkas = $stmt->fetch(\PDO::FETCH_ASSOC);

            if (!$berkas) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Berkas tidak ditemukan'], 404);
            }

            $checkPathSql = "SELECT COUNT(*) as count FROM santri___berkas WHERE path_file = ? AND id != ?";
            $checkStmt = $this->db->prepare($checkPathSql);
            $checkStmt->execute([$berkas['path_file'], $idBerkas]);
            $pathUsage = $checkStmt->fetch(\PDO::FETCH_ASSOC);

            $isTidakAda = !empty($berkas['status_tidak_ada']);
            if ($pathUsage['count'] == 0 && !$isTidakAda && (!empty($berkas['path_file']) && $berkas['path_file'] !== '-')) {
                $filePath = $this->resolveFilePath($berkas['path_file']);
                if (file_exists($filePath)) {
                    unlink($filePath);
                }
            }

            $deleteSql = "DELETE FROM santri___berkas WHERE id = ?";
            $deleteStmt = $this->db->prepare($deleteSql);
            $deleteStmt->execute([$idBerkas]);
            $user = $request->getAttribute('user');
            $pengurusId = isset($user['user_id']) ? (int) $user['user_id'] : (isset($user['id']) ? (int) $user['id'] : null);
            if ($pengurusId !== null) {
                UserAktivitasLogger::log(null, $pengurusId, UserAktivitasLogger::ACTION_DELETE, 'santri___berkas', $idBerkas, $berkas, null, $request);
            }

            return $this->jsonResponse($response, ['success' => true, 'message' => 'Berkas berhasil dihapus'], 200);

        } catch (\Exception $e) {
            error_log("Delete berkas v2 error: " . $e->getMessage());
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Gagal menghapus berkas: ' . $e->getMessage()], 500);
        }
    }

    /**
     * GET /api/v2/santri-berkas/download - Download berkas santri
     */
    public function downloadBerkas(Request $request, Response $response): Response
    {
        try {
            $queryParams = $request->getQueryParams();
            $idBerkas = $queryParams['id'] ?? null;

            if (!$idBerkas) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'ID berkas wajib diisi'], 400);
            }

            $sql = "SELECT * FROM santri___berkas WHERE id = ?";
            $stmt = $this->db->prepare($sql);
            $stmt->execute([$idBerkas]);
            $berkas = $stmt->fetch(\PDO::FETCH_ASSOC);

            if (!$berkas) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Berkas tidak ditemukan'], 404);
            }

            if (!empty($berkas['status_tidak_ada']) || (isset($berkas['path_file']) && $berkas['path_file'] === '-')) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Berkas ini ditandai tidak ada, tidak dapat diunduh'], 400);
            }

            $filePath = $this->resolveFilePath($berkas['path_file']);

            if (!file_exists($filePath)) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'File tidak ditemukan di server'], 404);
            }

            $response = $response->withHeader('Content-Type', $berkas['tipe_file'] ?? 'application/octet-stream');
            $response = $response->withHeader('Content-Disposition', 'attachment; filename="' . $berkas['nama_file'] . '"');
            $response = $response->withHeader('Content-Length', (string) filesize($filePath));
            $response->getBody()->write(file_get_contents($filePath));

            return $response;

        } catch (\Exception $e) {
            error_log("Download berkas v2 error: " . $e->getMessage());
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Gagal mengunduh berkas: ' . $e->getMessage()], 500);
        }
    }

    /**
     * POST /api/v2/santri-berkas/update - Update/ganti berkas santri
     */
    public function updateBerkas(Request $request, Response $response): Response
    {
        try {
            $user = $request->getAttribute('user');
            $userArr = is_array($user) ? $user : [];
            $idAdmin = RoleHelper::tokenIsSantriDaftarContext($userArr) ? null : ($userArr['user_id'] ?? $userArr['id'] ?? null);

            $parsedBody = $request->getParsedBody();
            $parsedBody = is_array($parsedBody) ? TextSanitizer::sanitizeStringValues($parsedBody, []) : [];
            $idBerkas = $parsedBody['id'] ?? null;
            $keterangan = $parsedBody['keterangan'] ?? null;

            if (!$idBerkas) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'ID berkas wajib diisi'], 400);
            }

            $sql = "SELECT * FROM santri___berkas WHERE id = ?";
            $stmt = $this->db->prepare($sql);
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
            $fileType = $file->getClientMediaType();
            $extension = strtolower(pathinfo($originalName, PATHINFO_EXTENSION));
            $allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];
            $allowedExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf'];

            if (!in_array($fileType, $allowedTypes) && !in_array($extension, $allowedExtensions)) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Tipe file tidak diizinkan. Hanya foto (JPEG, PNG, GIF, WEBP) dan PDF yang diizinkan'
                ], 400);
            }

            $maxSize = 10 * 1024 * 1024;
            if ($file->getSize() > $maxSize) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Ukuran file terlalu besar. Maksimal 10MB'], 400);
            }

            $oldFilePath = $this->resolveFilePath($berkasLama['path_file']);
            if (file_exists($oldFilePath)) {
                unlink($oldFilePath);
            }

            $sanitizedJenis = preg_replace('/[^a-zA-Z0-9_\-]/', '_', $berkasLama['jenis_berkas']);
            $fileName = uniqid('santri_' . $berkasLama['id_santri'] . '_' . $sanitizedJenis . '_', true) . '.' . $extension;
            $uploadDir = $this->getSantriUploadDir();
            $filePath = $uploadDir . DIRECTORY_SEPARATOR . $fileName;
            $relativePath = 'uploads/santri/' . $fileName;

            $file->moveTo($filePath);
            $finalFileSize = filesize($filePath);

            $updateSql = "UPDATE santri___berkas SET nama_file = ?, path_file = ?, ukuran_file = ?, tipe_file = ?, keterangan = ?, id_admin = ?, tanggal_update = CURRENT_TIMESTAMP WHERE id = ?";
            $updateStmt = $this->db->prepare($updateSql);
            $updateStmt->execute([
                $originalName,
                $relativePath,
                $finalFileSize,
                $fileType,
                $keterangan !== null ? $keterangan : $berkasLama['keterangan'],
                $idAdmin,
                $idBerkas
            ]);

            $selectSql = "SELECT b.*, p.nama AS admin_nama FROM santri___berkas b LEFT JOIN pengurus p ON b.id_admin = p.id WHERE b.id = ?";
            $selectStmt = $this->db->prepare($selectSql);
            $selectStmt->execute([$idBerkas]);
            $berkasBaru = $selectStmt->fetch(\PDO::FETCH_ASSOC);
            if ($berkasBaru && $idAdmin !== null) {
                UserAktivitasLogger::log(null, (int) $idAdmin, UserAktivitasLogger::ACTION_UPDATE, 'santri___berkas', $idBerkas, $berkasLama, $berkasBaru, $request);
            }

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Berkas berhasil diganti',
                'data' => $berkasBaru
            ], 200);

        } catch (\Exception $e) {
            error_log("Update berkas v2 error: " . $e->getMessage());
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Gagal mengganti berkas: ' . $e->getMessage()], 500);
        }
    }

    /**
     * POST /api/v2/santri-berkas/link - Link berkas ke jenis berkas lain (menggunakan file yang sama)
     */
    public function linkBerkas(Request $request, Response $response): Response
    {
        try {
            $user = $request->getAttribute('user');
            $idAdmin = $user['id'] ?? null;

            $parsedBody = $request->getParsedBody();
            $parsedBody = is_array($parsedBody) ? TextSanitizer::sanitizeStringValues($parsedBody, []) : [];
            $idSantri = $parsedBody['id_santri'] ?? null;
            $jenisBerkas = $parsedBody['jenis_berkas'] ?? null;
            $idBerkasSource = $parsedBody['id_berkas_source'] ?? null;

            if (!$idSantri || !$jenisBerkas || !$idBerkasSource) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Parameter id_santri, jenis_berkas, dan id_berkas_source wajib diisi'
                ], 400);
            }

            $idSantriResolved = SantriHelper::resolveId($this->db, $idSantri);
            if ($idSantriResolved === null) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Santri tidak ditemukan (id_santri/NIS tidak valid)'], 404);
            }
            $idSantri = $idSantriResolved;

            $checkSql = "SELECT id FROM santri___berkas WHERE id_santri = ? AND jenis_berkas = ?";
            $checkStmt = $this->db->prepare($checkSql);
            $checkStmt->execute([$idSantri, $jenisBerkas]);
            $existingBerkas = $checkStmt->fetch(\PDO::FETCH_ASSOC);

            if ($existingBerkas) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Berkas dengan jenis ini sudah ada. Hapus terlebih dahulu jika ingin mengganti.'
                ], 400);
            }

            $sourceSql = "SELECT nama_file, path_file, ukuran_file, tipe_file FROM santri___berkas WHERE id = ? AND id_santri = ?";
            $sourceStmt = $this->db->prepare($sourceSql);
            $sourceStmt->execute([$idBerkasSource, $idSantri]);
            $sourceBerkas = $sourceStmt->fetch(\PDO::FETCH_ASSOC);

            if (!$sourceBerkas) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Berkas source tidak ditemukan'], 404);
            }

            $keterangan = $parsedBody['keterangan'] ?? "Sama dengan " . ($parsedBody['jenis_berkas_source'] ?? 'berkas lain');

            $sql = "INSERT INTO santri___berkas (id_santri, jenis_berkas, nama_file, path_file, ukuran_file, tipe_file, keterangan, id_admin) VALUES (?, ?, ?, ?, ?, ?, ?, ?)";
            $stmt = $this->db->prepare($sql);
            $stmt->execute([
                $idSantri,
                $jenisBerkas,
                $sourceBerkas['nama_file'],
                $sourceBerkas['path_file'],
                $sourceBerkas['ukuran_file'],
                $sourceBerkas['tipe_file'],
                $keterangan,
                $idAdmin
            ]);

            $berkasId = $this->db->lastInsertId();

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Berkas berhasil di-link',
                'data' => [
                    'id' => $berkasId,
                    'id_santri' => $idSantri,
                    'jenis_berkas' => $jenisBerkas,
                    'nama_file' => $sourceBerkas['nama_file'],
                    'path_file' => $sourceBerkas['path_file'],
                    'tipe_file' => $sourceBerkas['tipe_file'],
                    'ukuran_file' => $sourceBerkas['ukuran_file'],
                    'keterangan' => $keterangan
                ]
            ], 201);

        } catch (\Exception $e) {
            error_log("Link berkas v2 error: " . $e->getMessage());
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Gagal link berkas: ' . $e->getMessage()], 500);
        }
    }

    /**
     * POST /api/v2/santri-berkas/mark-tidak-ada - Tandai berkas sebagai tidak ada
     * Body: { id_santri, jenis_berkas }
     */
    public function markTidakAda(Request $request, Response $response): Response
    {
        try {
            $user = $request->getAttribute('user');
            $userArr = is_array($user) ? $user : [];
            $idAdmin = RoleHelper::tokenIsSantriDaftarContext($userArr) ? null : ($userArr['user_id'] ?? $userArr['id'] ?? null);

            $parsedBody = $request->getParsedBody();
            $idSantri = $parsedBody['id_santri'] ?? null;
            $jenisBerkas = $parsedBody['jenis_berkas'] ?? null;

            if (!$idSantri || !$jenisBerkas) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Parameter id_santri dan jenis_berkas wajib diisi'
                ], 400);
            }

            $idSantriResolved = SantriHelper::resolveId($this->db, $idSantri);
            if ($idSantriResolved === null) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Santri tidak ditemukan (id_santri/NIS tidak valid)'], 404);
            }
            $idSantri = $idSantriResolved;

            // Cek apakah sudah ada record (upload atau tidak ada)
            $checkSql = "SELECT id, status_tidak_ada FROM santri___berkas WHERE id_santri = ? AND jenis_berkas = ?";
            $checkStmt = $this->db->prepare($checkSql);
            $checkStmt->execute([$idSantri, $jenisBerkas]);
            $existing = $checkStmt->fetch(\PDO::FETCH_ASSOC);

            if ($existing) {
                if ($existing['status_tidak_ada'] == 1) {
                    return $this->jsonResponse($response, [
                        'success' => true,
                        'message' => 'Berkas sudah ditandai sebagai tidak ada',
                        'data' => ['id' => $existing['id'], 'jenis_berkas' => $jenisBerkas, 'status_tidak_ada' => 1]
                    ], 200);
                }
                // Ada berkas yang diupload - hapus file dulu, lalu update jadi tidak ada
                $delSql = "SELECT path_file FROM santri___berkas WHERE id = ?";
                $delStmt = $this->db->prepare($delSql);
                $delStmt->execute([$existing['id']]);
                $row = $delStmt->fetch(\PDO::FETCH_ASSOC);
                if ($row && $row['path_file'] !== '-' && file_exists($this->resolveFilePath($row['path_file']))) {
                    unlink($this->resolveFilePath($row['path_file']));
                }
                $updateSql = "UPDATE santri___berkas SET nama_file = 'Tidak ada', path_file = '-', ukuran_file = 0, tipe_file = NULL, status_tidak_ada = 1, id_admin = ?, tanggal_update = CURRENT_TIMESTAMP WHERE id = ?";
                $updateStmt = $this->db->prepare($updateSql);
                $updateStmt->execute([$idAdmin, $existing['id']]);
                $berkasId = $existing['id'];
            } else {
                $insertSql = "INSERT INTO santri___berkas (id_santri, jenis_berkas, nama_file, path_file, ukuran_file, tipe_file, keterangan, id_admin, status_tidak_ada) VALUES (?, ?, 'Tidak ada', '-', 0, NULL, 'Berkas tidak tersedia', ?, 1)";
                $insertStmt = $this->db->prepare($insertSql);
                $insertStmt->execute([$idSantri, $jenisBerkas, $idAdmin]);
                $berkasId = $this->db->lastInsertId();
            }

            $this->checkBerkasLengkapAndSendWa((int) $idSantri, $request);

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Berkas berhasil ditandai sebagai tidak ada',
                'data' => ['id' => $berkasId, 'id_santri' => $idSantri, 'jenis_berkas' => $jenisBerkas, 'status_tidak_ada' => 1]
            ], 200);

        } catch (\Exception $e) {
            error_log("Mark tidak ada v2 error: " . $e->getMessage());
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Gagal menandai berkas: ' . $e->getMessage()], 500);
        }
    }

    /**
     * POST /api/v2/santri-berkas/unmark-tidak-ada - Hapus tanda tidak ada
     * Body: { id_santri, jenis_berkas }
     */
    public function unmarkTidakAda(Request $request, Response $response): Response
    {
        try {
            $parsedBody = $request->getParsedBody();
            $idSantri = $parsedBody['id_santri'] ?? null;
            $jenisBerkas = $parsedBody['jenis_berkas'] ?? null;

            if (!$idSantri || !$jenisBerkas) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Parameter id_santri dan jenis_berkas wajib diisi'
                ], 400);
            }

            $idSantriResolved = SantriHelper::resolveId($this->db, $idSantri);
            if ($idSantriResolved === null) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Santri tidak ditemukan (id_santri/NIS tidak valid)'], 404);
            }
            $idSantri = $idSantriResolved;

            $sql = "SELECT id FROM santri___berkas WHERE id_santri = ? AND jenis_berkas = ? AND status_tidak_ada = 1";
            $stmt = $this->db->prepare($sql);
            $stmt->execute([$idSantri, $jenisBerkas]);
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);

            if (!$row) {
                return $this->jsonResponse($response, [
                    'success' => true,
                    'message' => 'Berkas belum ditandai tidak ada'
                ], 200);
            }

            $deleteSql = "DELETE FROM santri___berkas WHERE id = ?";
            $deleteStmt = $this->db->prepare($deleteSql);
            $deleteStmt->execute([$row['id']]);

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Tanda tidak ada berhasil dihapus'
            ], 200);

        } catch (\Exception $e) {
            error_log("Unmark tidak ada v2 error: " . $e->getMessage());
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Gagal menghapus tanda: ' . $e->getMessage()], 500);
        }
    }

    /**
     * Cek apakah semua berkas wajib PSB sudah ditangani (upload atau tidak ada).
     * Jika lengkap, kirim WA ringkasan ke no_telpon dan no_wa_santri hanya bila request dari aplikasi daftar (bukan UWABA).
     */
    private function checkBerkasLengkapAndSendWa(int $idSantri, Request $request): void
    {
        try {
            $body = $request->getParsedBody();
            if (!is_array($body)) {
                $body = [];
            }
            $appSource = $request->getHeaderLine('X-App-Source') ?: ($body['app_source'] ?? 'daftar');
            $appSource = strtolower(trim($appSource)) === 'uwaba' ? 'uwaba' : 'daftar';
            if ($appSource === 'uwaba') {
                return;
            }
            $stmt = $this->db->prepare("SELECT jenis_berkas, path_file, COALESCE(status_tidak_ada, 0) AS status_tidak_ada FROM santri___berkas WHERE id_santri = ?");
            $stmt->execute([$idSantri]);
            $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);

            $byJenis = [];
            foreach ($rows as $r) {
                $jenis = trim($r['jenis_berkas'] ?? '');
                if ($jenis === '') continue;
                $byJenis[$jenis] = [
                    'path_file' => $r['path_file'] ?? '',
                    'status_tidak_ada' => (int) ($r['status_tidak_ada'] ?? 0)
                ];
            }

            $allCovered = true;
            foreach (self::PSB_REQUIRED_BERKAS as $required) {
                if (!isset($byJenis[$required])) {
                    $allCovered = false;
                    break;
                }
                $v = $byJenis[$required];
                if ($v['status_tidak_ada'] !== 1 && (trim($v['path_file'] ?? '') === '' || $v['path_file'] === '-')) {
                    $allCovered = false;
                    break;
                }
            }
            if (!$allCovered) {
                return;
            }

            $listAda = [];
            $listTidakAda = [];
            foreach (self::PSB_REQUIRED_BERKAS as $required) {
                $v = $byJenis[$required] ?? null;
                if (!$v) continue;
                if ($v['status_tidak_ada'] === 1) {
                    $listTidakAda[] = $required;
                } else {
                    $listAda[] = $required;
                }
            }

            $stmtSantri = $this->db->prepare("SELECT nama, nis, no_telpon, no_wa_santri FROM santri WHERE id = ?");
            $stmtSantri->execute([$idSantri]);
            $santri = $stmtSantri->fetch(\PDO::FETCH_ASSOC);
            if (!$santri) return;

            $phones = array_filter([
                trim($santri['no_telpon'] ?? ''),
                trim($santri['no_wa_santri'] ?? '')
            ]);
            if (empty($phones)) return;

            WhatsAppService::sendPsbBerkasLengkap(
                ['id' => $idSantri, 'nis' => $santri['nis'] ?? null, 'nama' => $santri['nama'] ?? ''],
                $listAda,
                $listTidakAda,
                $phones
            );
        } catch (\Throwable $e) {
            error_log('SantriBerkasControllerV2 checkBerkasLengkapAndSendWa: ' . $e->getMessage());
        }
    }
}
