<?php

namespace App\Controllers;

use App\Database;
use App\Helpers\FileUploadValidator;
use App\Helpers\SantriHelper;
use App\Helpers\TextSanitizer;
use App\Helpers\UserAktivitasLogger;
use App\Helpers\PengurusAdminIdHelper;
use App\Helpers\RoleHelper;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

class SantriBerkasController
{
    private $db;

    /** Path folder upload (base + UPLOADS_FOLDER dari .env: uploads atau uploads2) */
    private string $uploadsPath;

    public function __construct()
    {
        $this->db = Database::getInstance()->getConnection();
        $config = require __DIR__ . '/../../config.php';
        $base = rtrim($config['uploads_base_path'] ?? __DIR__ . '/../..', '/\\');
        $folder = $config['uploads_folder'] ?? 'uploads';
        $this->uploadsPath = $base . '/' . trim($folder, '/\\');
    }

    /** Path absolut ke file dari path_file di DB (relatif: uploads/santri/...) */
    private function resolvePath(string $pathFile): string
    {
        $pathFile = str_replace(['\\'], '/', $pathFile);
        $pathFile = preg_replace('#^uploads2?/#', '', $pathFile);
        return $this->uploadsPath . '/' . ltrim($pathFile, '/');
    }

    private function jsonResponse(Response $response, array $data, int $statusCode): Response
    {
        $response->getBody()->write(json_encode($data, JSON_UNESCAPED_UNICODE));
        return $response
            ->withStatus($statusCode)
            ->withHeader('Content-Type', 'application/json; charset=utf-8');
    }

    /**
     * Kompres gambar agar ukurannya di bawah target size (dalam bytes)
     */
    private function compressImage(string $filePath, string $mimeType, int $targetSize): ?string
    {
        if (!function_exists('imagecreatefromjpeg') && !function_exists('imagecreatefrompng')) {
            error_log("GD library tidak tersedia untuk kompresi gambar");
            return null;
        }

        try {
            // Baca gambar berdasarkan tipe
            $image = null;
            switch ($mimeType) {
                case 'image/jpeg':
                case 'image/jpg':
                    if (!function_exists('imagecreatefromjpeg')) return null;
                    $image = @imagecreatefromjpeg($filePath);
                    break;
                case 'image/png':
                    if (!function_exists('imagecreatefrompng')) return null;
                    $image = @imagecreatefrompng($filePath);
                    break;
                case 'image/gif':
                    if (!function_exists('imagecreatefromgif')) return null;
                    $image = @imagecreatefromgif($filePath);
                    break;
                case 'image/webp':
                    if (!function_exists('imagecreatefromwebp')) return null;
                    $image = @imagecreatefromwebp($filePath);
                    break;
                default:
                    return null;
            }

            if (!$image) {
                error_log("Gagal membaca gambar: " . $filePath);
                return null;
            }

            // Dapatkan dimensi asli
            $width = imagesx($image);
            $height = imagesy($image);
            
            // Jika ukuran file sudah di bawah target, tidak perlu kompres
            $currentSize = filesize($filePath);
            if ($currentSize <= $targetSize) {
                imagedestroy($image);
                return $filePath;
            }

            // Hitung rasio kompresi yang diperlukan
            $ratio = sqrt($targetSize / $currentSize);
            
            // Resize jika perlu (maksimal resize 50% untuk menjaga kualitas)
            $newWidth = $width;
            $newHeight = $height;
            if ($ratio < 0.9) {
                $newWidth = (int)($width * max($ratio, 0.5));
                $newHeight = (int)($height * max($ratio, 0.5));
            }

            // Buat gambar baru dengan ukuran yang disesuaikan
            $compressed = imagecreatetruecolor($newWidth, $newHeight);
            
            // Preserve transparency untuk PNG dan GIF
            if ($mimeType === 'image/png' || $mimeType === 'image/gif') {
                imagealphablending($compressed, false);
                imagesavealpha($compressed, true);
                $transparent = imagecolorallocatealpha($compressed, 255, 255, 255, 127);
                imagefilledrectangle($compressed, 0, 0, $newWidth, $newHeight, $transparent);
            }

            // Simpan referensi gambar asli sebelum resize
            $originalImage = $image;
            
            // Resize gambar
            imagecopyresampled($compressed, $image, 0, 0, 0, 0, $newWidth, $newHeight, $width, $height);

            // Simpan dengan kualitas yang disesuaikan
            $quality = 85; // Mulai dengan kualitas 85
            $tempPath = $filePath . '.tmp';
            $maxIterations = 10; // Batasi iterasi untuk menghindari infinite loop
            $iteration = 0;
            
            do {
                switch ($mimeType) {
                    case 'image/jpeg':
                    case 'image/jpg':
                        imagejpeg($compressed, $tempPath, $quality);
                        break;
                    case 'image/png':
                        // PNG menggunakan compression level (0-9, 9 = highest compression)
                        $pngQuality = 9 - (int)(($quality / 100) * 9);
                        imagepng($compressed, $tempPath, $pngQuality);
                        break;
                    case 'image/gif':
                        imagegif($compressed, $tempPath);
                        break;
                    case 'image/webp':
                        imagewebp($compressed, $tempPath, $quality);
                        break;
                }

                $newSize = filesize($tempPath);
                $iteration++;
                
                // Jika masih terlalu besar, kurangi kualitas atau resize lagi
                if ($newSize > $targetSize && $quality > 30 && $iteration < $maxIterations) {
                    $quality -= 10;
                    
                    // Jika kualitas sudah rendah tapi masih besar, resize lagi
                    if ($quality <= 30 && ($newWidth > 800 || $newHeight > 800)) {
                        $newWidth = (int)($newWidth * 0.8);
                        $newHeight = (int)($newHeight * 0.8);
                        imagedestroy($compressed);
                        $compressed = imagecreatetruecolor($newWidth, $newHeight);
                        if ($mimeType === 'image/png' || $mimeType === 'image/gif') {
                            imagealphablending($compressed, false);
                            imagesavealpha($compressed, true);
                            $transparent = imagecolorallocatealpha($compressed, 255, 255, 255, 127);
                            imagefilledrectangle($compressed, 0, 0, $newWidth, $newHeight, $transparent);
                        }
                        // Gunakan gambar asli yang sudah disimpan
                        imagecopyresampled($compressed, $originalImage, 0, 0, 0, 0, $newWidth, $newHeight, $width, $height);
                        $quality = 75; // Reset quality
                    }
                } else {
                    break;
                }
            } while ($newSize > $targetSize && $quality > 20 && $iteration < $maxIterations);
            
            // Cleanup
            imagedestroy($compressed);
            imagedestroy($originalImage);

            imagedestroy($compressed);

            // Ganti file lama dengan yang sudah dikompres
            if (file_exists($tempPath)) {
                if (file_exists($filePath)) {
                    unlink($filePath);
                }
                rename($tempPath, $filePath);
                
                $finalSize = filesize($filePath);
                if ($finalSize <= $targetSize) {
                    return $filePath;
                }
            }

            return null;
        } catch (\Exception $e) {
            error_log("Error compressing image: " . $e->getMessage());
            return null;
        }
    }

    /**
     * Helper function untuk mendapatkan pesan error upload
     */
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

    /** Konteks app daftar: hanya id_santri dari token. Staff PSB/super_admin / non-santri-app: tanpa batasan di sini. */
    private function ensureSantriDaftarOwnsSantriId(array $userArr, int $idSantriPk): bool
    {
        if (RoleHelper::tokenCanQueryAnyPendaftaranSantri($userArr)) {
            return true;
        }
        if (!RoleHelper::tokenIsSantriDaftarContext($userArr)) {
            return true;
        }
        $tid = $userArr['user_id'] ?? $userArr['id'] ?? $userArr['santri_id'] ?? null;
        if ($tid === null || $tid === '') {
            return false;
        }
        $resolvedToken = SantriHelper::resolveId($this->db, $tid);

        return $resolvedToken !== null && (int) $resolvedToken === (int) $idSantriPk;
    }

    /** @param array<string,mixed> $berkasRow */
    private function ensureSantriDaftarOwnsBerkasRow(array $userArr, array $berkasRow): bool
    {
        if (!isset($berkasRow['id_santri'])) {
            return false;
        }

        return $this->ensureSantriDaftarOwnsSantriId($userArr, (int) $berkasRow['id_santri']);
    }

    /**
     * POST /api/santri-berkas/upload - Upload berkas santri
     */
    public function uploadBerkas(Request $request, Response $response): Response
    {
        try {
            // Get user dari session/token
            $user = $request->getAttribute('user');
            $userArr = is_array($user) ? $user : [];

            // Get form data
            $parsedBody = $request->getParsedBody();
            $parsedBody = is_array($parsedBody) ? TextSanitizer::sanitizeStringValues($parsedBody, []) : [];
            // Konteks app daftar (santri): id_admin null — kolom merujuk ke pengurus
            $idAdmin = RoleHelper::tokenIsSantriDaftarContext($userArr)
                ? null
                : PengurusAdminIdHelper::resolveEffectivePengurusId($userArr, $parsedBody['id_admin'] ?? 0);
            $idSantri = $parsedBody['id_santri'] ?? null;
            $jenisBerkas = $parsedBody['jenis_berkas'] ?? null;
            $keterangan = $parsedBody['keterangan'] ?? null;

            // Validasi input
            if (!$idSantri) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'ID santri wajib diisi'
                ], 400);
            }

            if (!$jenisBerkas) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Jenis berkas wajib diisi'
                ], 400);
            }

            // Resolve id_santri (bisa PK atau NIS 7 digit) ke santri.id
            $idSantriResolved = SantriHelper::resolveId($this->db, $idSantri);
            if ($idSantriResolved === null) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Santri tidak ditemukan (id/NIS tidak valid)'
                ], 404);
            }
            $idSantri = $idSantriResolved;

            if (!$this->ensureSantriDaftarOwnsSantriId($userArr, (int) $idSantri)) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Akses ditolak'
                ], 403);
            }

            // Cek apakah ada file yang di-upload
            $uploadedFiles = $request->getUploadedFiles();
            if (empty($uploadedFiles) || !isset($uploadedFiles['file'])) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'File tidak ditemukan'
                ], 400);
            }

            $file = $uploadedFiles['file'];
            $allowedExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf'];
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

            // Cek apakah sudah ada berkas dengan jenis_berkas yang sama untuk santri ini
            // Khusus untuk foto_juara, kita tidak replace tapi selalu insert baru (bisa multiple)
            // Untuk jenis berkas lain, tetap replace jika sudah ada
            $checkSql = "SELECT id, path_file FROM santri___berkas WHERE id_santri = ? AND jenis_berkas = ?";
            $checkStmt = $this->db->prepare($checkSql);
            $checkStmt->execute([$idSantri, $jenisBerkas]);
            $existingBerkas = $checkStmt->fetch(\PDO::FETCH_ASSOC);
            
            // Untuk foto_juara, selalu insert baru (tidak replace)
            $isFotoJuara = ($jenisBerkas === 'foto_juara');
            if ($isFotoJuara) {
                $existingBerkas = null; // Force insert baru untuk foto_juara
            }

            $sanitizedJenis = preg_replace('/[^a-zA-Z0-9_\-]/', '_', $jenisBerkas);
            $fileName = uniqid('santri_' . $idSantri . '_' . $sanitizedJenis . '_', true) . '.' . $extension;

            $uploadDir = $this->uploadsPath . '/santri';
            if (!is_dir($uploadDir)) {
                mkdir($uploadDir, 0755, true);
            }

            $filePath = $uploadDir . '/' . $fileName;
            $relativePath = 'uploads/santri/' . $fileName;

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
            $finalFileSize = filesize($filePath);
            
            if ($existingBerkas) {
                // Hapus file lama jika ada
                $oldFilePath = $this->resolvePath($existingBerkas['path_file']);
                if (file_exists($oldFilePath)) {
                    unlink($oldFilePath);
                }
                
                // Update berkas yang sudah ada
                $sql = "UPDATE santri___berkas 
                        SET nama_file = ?, path_file = ?, ukuran_file = ?, tipe_file = ?, 
                            keterangan = ?, id_admin = ?, tanggal_update = CURRENT_TIMESTAMP
                        WHERE id = ?";
                $stmt = $this->db->prepare($sql);
                $stmt->execute([
                    $originalName,
                    $relativePath,
                    $finalFileSize,
                    $fileType,
                    $keterangan !== null ? $keterangan : null,
                    $idAdmin,
                    $existingBerkas['id']
                ]);
                
                $berkasId = $existingBerkas['id'];
            } else {
                // Simpan ke database (insert baru)
                $sql = "INSERT INTO santri___berkas 
                        (id_santri, jenis_berkas, nama_file, path_file, ukuran_file, tipe_file, keterangan, id_admin) 
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)";
                $stmt = $this->db->prepare($sql);
                $stmt->execute([
                    $idSantri,
                    $jenisBerkas,
                    $originalName,
                    $relativePath,
                    $finalFileSize,
                    $fileType,
                    $keterangan,
                    $idAdmin
                ]);

                    $berkasId = $this->db->lastInsertId();
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
            error_log("Upload berkas santri error: " . $e->getMessage());
            error_log("Stack trace: " . $e->getTraceAsString());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal meng-upload berkas'
            ], 500);
        }
    }

    /**
     * GET /api/public/juara-foto - Get foto juara (public, untuk display)
     */
    public function getPublicFotoJuara(Request $request, Response $response): Response
    {
        try {
            $queryParams = $request->getQueryParams();
            $idSantri = $queryParams['id_santri'] ?? null;
            $all = isset($queryParams['all']) && $queryParams['all'] === 'true';

            if (!$idSantri) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'ID Santri wajib diisi'
                ], 400);
            }

            if ($all) {
                // Ambil semua foto juara
                $sql = "SELECT id, path_file, nama_file, tipe_file, tanggal_dibuat
                        FROM santri___berkas 
                        WHERE id_santri = ? AND jenis_berkas = 'foto_juara' 
                        ORDER BY tanggal_dibuat DESC";
                $stmt = $this->db->prepare($sql);
                $stmt->execute([$idSantri]);
                $berkasList = $stmt->fetchAll(\PDO::FETCH_ASSOC);

                // Set cache headers untuk API response (cache 5 menit untuk list)
                $response = $response->withHeader('Cache-Control', 'public, max-age=300'); // Cache 5 menit
                
                return $this->jsonResponse($response, [
                    'success' => true,
                    'data' => $berkasList
                ], 200);
            } else {
                // Ambil foto juara pertama saja (backward compatibility)
                $sql = "SELECT path_file, nama_file, tipe_file 
                        FROM santri___berkas 
                        WHERE id_santri = ? AND jenis_berkas = 'foto_juara' 
                        ORDER BY tanggal_dibuat DESC 
                        LIMIT 1";
                $stmt = $this->db->prepare($sql);
                $stmt->execute([$idSantri]);
                $berkas = $stmt->fetch(\PDO::FETCH_ASSOC);

                // Jika tidak ada foto, kembalikan success: false dengan data null (bukan 404)
                // Ini untuk menghindari error 404 yang tidak perlu di frontend
                if (!$berkas) {
                    return $this->jsonResponse($response, [
                        'success' => false,
                        'message' => 'Foto juara tidak ditemukan',
                        'data' => null
                    ], 200);
                }

                return $this->jsonResponse($response, [
                    'success' => true,
                    'data' => $berkas
                ], 200);
            }

        } catch (\Exception $e) {
            error_log("Get public foto juara error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil foto juara.'
            ], 500);
        }
    }

    /**
     * GET /api/public/juara-foto/list - Get list foto juara untuk santri tertentu (public, tanpa auth)
     */
    public function getPublicFotoJuaraList(Request $request, Response $response): Response
    {
        try {
            $queryParams = $request->getQueryParams();
            $idSantri = $queryParams['id_santri'] ?? null;

            if (!$idSantri) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'ID Santri wajib diisi'
                ], 400);
            }

            // Ambil semua foto juara untuk santri ini
            $sql = "SELECT id, path_file, nama_file, tipe_file, ukuran_file, keterangan, tanggal_dibuat
                    FROM santri___berkas 
                    WHERE id_santri = ? AND jenis_berkas = 'foto_juara' 
                    ORDER BY tanggal_dibuat DESC";
            $stmt = $this->db->prepare($sql);
            $stmt->execute([$idSantri]);
            $berkasList = $stmt->fetchAll(\PDO::FETCH_ASSOC);

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => $berkasList
            ], 200);

        } catch (\Exception $e) {
            error_log("Get public foto juara list error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil daftar foto juara.'
            ], 500);
        }
    }

    /**
     * GET /api/public/juara-foto-image - Serve gambar foto juara dengan CORS headers
     * Endpoint ini digunakan untuk serve gambar dengan CORS headers yang benar
     */
    public function serveFotoJuaraImage(Request $request, Response $response): Response
    {
        try {
            $queryParams = $request->getQueryParams();
            $pathFile = $queryParams['path'] ?? null;

            if (!$pathFile) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Parameter path wajib diisi'
                ], 400);
            }

            // Validasi path untuk keamanan (hanya izinkan path yang valid)
            if (strpos($pathFile, '..') !== false || strpos($pathFile, '/') === 0) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Path tidak valid'
                ], 400);
            }

            // Path file relatif dari root project (dari config UPLOADS_BASE_PATH)
            $filePath = $this->resolvePath($pathFile);

            if (!file_exists($filePath)) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'File tidak ditemukan'
                ], 404);
            }

            // Deteksi MIME type
            $mimeType = mime_content_type($filePath);
            if (!$mimeType) {
                $mimeType = 'image/jpeg'; // Default
            }

            // Set headers untuk display image dengan CORS dan cache yang optimal
            $origin = $request->getHeaderLine('Origin');
            
            // Generate ETag dari file mtime dan size untuk cache validation
            $fileMtime = filemtime($filePath);
            $fileSize = filesize($filePath);
            $etag = md5($filePath . $fileMtime . $fileSize);
            
            // Check if client has cached version (If-None-Match header)
            $ifNoneMatch = $request->getHeaderLine('If-None-Match');
            if ($ifNoneMatch === $etag) {
                // File tidak berubah, return 304 Not Modified
                return $response
                    ->withStatus(304)
                    ->withHeader('ETag', $etag)
                    ->withHeader('Cache-Control', 'public, max-age=31536000, immutable')
                    ->withHeader('Last-Modified', gmdate('D, d M Y H:i:s', $fileMtime) . ' GMT');
            }
            
            $response = $response
                ->withHeader('Content-Type', $mimeType)
                ->withHeader('Content-Length', (string)$fileSize)
                ->withHeader('Cache-Control', 'public, max-age=31536000, immutable') // Cache 1 tahun, immutable karena file tidak berubah
                ->withHeader('ETag', $etag)
                ->withHeader('Last-Modified', gmdate('D, d M Y H:i:s', $fileMtime) . ' GMT');

            // Set CORS headers - izinkan dari semua domain/subdomain alutsmani.id
            if ($origin && cors_origin_is_alutsmani_id($origin)) {
                $response = $response
                    ->withHeader('Access-Control-Allow-Origin', $origin)
                    ->withHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
                    ->withHeader('Access-Control-Allow-Credentials', 'true');
            } elseif ($origin && (strpos($origin, 'localhost') !== false || strpos($origin, '127.0.0.1') !== false)) {
                $response = $response
                    ->withHeader('Access-Control-Allow-Origin', $origin)
                    ->withHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
                    ->withHeader('Access-Control-Allow-Credentials', 'true');
            } else {
                $response = $response
                    ->withHeader('Access-Control-Allow-Origin', '*')
                    ->withHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
            }

            // Read file dan kirim
            $fileContent = file_get_contents($filePath);
            $response->getBody()->write($fileContent);

            return $response;

        } catch (\Exception $e) {
            error_log("Serve foto juara image error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil gambar.'
            ], 500);
        }
    }

    /**
     * GET /api/santri-berkas/list - Ambil daftar berkas santri
     */
    public function getBerkasList(Request $request, Response $response): Response
    {
        try {
            $user = $request->getAttribute('user');
            $userArr = is_array($user) ? $user : [];
            $queryParams = $request->getQueryParams();
            $idSantri = $queryParams['id_santri'] ?? null;
            $jenisBerkas = $queryParams['jenis_berkas'] ?? null;

            if (!RoleHelper::tokenCanQueryAnyPendaftaranSantri($userArr) && RoleHelper::tokenIsSantriDaftarContext($userArr)) {
                $idFromToken = $userArr['user_id'] ?? $userArr['id'] ?? $userArr['santri_id'] ?? null;
                if ($idFromToken !== null && $idFromToken !== '') {
                    $idSantri = $idFromToken;
                }
            }

            if (!$idSantri) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Parameter id_santri wajib diisi'
                ], 400);
            }

            $resolvedId = SantriHelper::resolveId($this->db, $idSantri);
            if ($resolvedId === null) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Santri tidak ditemukan'
                ], 404);
            }

            // Build query
            $sql = "SELECT b.*, p.nama AS admin_nama
                    FROM santri___berkas b
                    LEFT JOIN pengurus p ON b.id_admin = p.id
                    WHERE b.id_santri = ?";
            $params = [$resolvedId];

            if ($jenisBerkas && $jenisBerkas !== '') {
                $sql .= " AND b.jenis_berkas = ?";
                $params[] = $jenisBerkas;
            }

            $sql .= " ORDER BY b.tanggal_dibuat DESC";

            $stmt = $this->db->prepare($sql);
            $stmt->execute($params);
            $data = $stmt->fetchAll(\PDO::FETCH_ASSOC);

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => $data
            ], 200);

        } catch (\Exception $e) {
            error_log("Get berkas list error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil daftar berkas'
            ], 500);
        }
    }

    /**
     * DELETE /api/santri-berkas/delete - Hapus berkas santri
     */
    public function deleteBerkas(Request $request, Response $response): Response
    {
        try {
            $parsedBody = $request->getParsedBody();
            $parsedBody = is_array($parsedBody) ? TextSanitizer::sanitizeStringValues($parsedBody, []) : [];
            $idBerkas = $parsedBody['id'] ?? null;

            if (!$idBerkas) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'ID berkas wajib diisi'
                ], 400);
            }

            $sql = "SELECT * FROM santri___berkas WHERE id = ?";
            $stmt = $this->db->prepare($sql);
            $stmt->execute([$idBerkas]);
            $berkas = $stmt->fetch(\PDO::FETCH_ASSOC);

            if (!$berkas) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Berkas tidak ditemukan'
                ], 404);
            }

            $userArr = is_array($request->getAttribute('user')) ? $request->getAttribute('user') : [];
            if (!$this->ensureSantriDaftarOwnsBerkasRow($userArr, $berkas)) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Akses ditolak'
                ], 403);
            }

            // Cek apakah path_file masih digunakan oleh berkas lain
            $checkPathSql = "SELECT COUNT(*) as count FROM santri___berkas WHERE path_file = ? AND id != ?";
            $checkPathStmt = $this->db->prepare($checkPathSql);
            $checkPathStmt->execute([$berkas['path_file'], $idBerkas]);
            $pathUsage = $checkPathStmt->fetch(\PDO::FETCH_ASSOC);

            // Hapus file dari server hanya jika tidak ada berkas lain yang menggunakan path_file yang sama
            if ($pathUsage['count'] == 0) {
                $filePath = $this->resolvePath($berkas['path_file']);
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

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Berkas berhasil dihapus'
            ], 200);

        } catch (\Exception $e) {
            error_log("Delete berkas error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal menghapus berkas'
            ], 500);
        }
    }

    /**
     * POST /api/santri-berkas/update - Update/ganti berkas santri
     */
    public function updateBerkas(Request $request, Response $response): Response
    {
        try {
            // Get user dari session/token
            $user = $request->getAttribute('user');
            $userArr = is_array($user) ? $user : [];

            // Get form data
            $parsedBody = $request->getParsedBody();
            $parsedBody = is_array($parsedBody) ? TextSanitizer::sanitizeStringValues($parsedBody, []) : [];
            $idBerkas = $parsedBody['id'] ?? null;
            $keterangan = $parsedBody['keterangan'] ?? null;

            // Validasi input
            if (!$idBerkas) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'ID berkas wajib diisi'
                ], 400);
            }

            // Ambil informasi berkas lama
            $sql = "SELECT * FROM santri___berkas WHERE id = ?";
            $stmt = $this->db->prepare($sql);
            $stmt->execute([$idBerkas]);
            $berkasLama = $stmt->fetch(\PDO::FETCH_ASSOC);

            if (!$berkasLama) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Berkas tidak ditemukan'
                ], 404);
            }

            if (!$this->ensureSantriDaftarOwnsBerkasRow($userArr, $berkasLama)) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Akses ditolak'
                ], 403);
            }

            $idAdmin = null;
            if (!RoleHelper::tokenIsSantriDaftarContext($userArr)) {
                $idResolved = PengurusAdminIdHelper::resolveEffectivePengurusId($userArr, $parsedBody['id_admin'] ?? 0);
                if ($idResolved !== null) {
                    $idAdmin = $idResolved;
                } else {
                    $prev = $berkasLama['id_admin'] ?? null;
                    $idAdmin = ($prev !== null && $prev !== '') ? (int) $prev : null;
                    if ($idAdmin === 0) {
                        $idAdmin = null;
                    }
                }
            }

            // Get uploaded file
            $uploadedFiles = $request->getUploadedFiles();
            if (empty($uploadedFiles['file'])) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'File wajib diupload'
                ], 400);
            }

            $file = $uploadedFiles['file'];
            $allowedExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf'];
            $maxSize = 10 * 1024 * 1024;

            $validation = FileUploadValidator::validate($file, $allowedExtensions, $maxSize);
            if (!$validation['success']) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => $validation['message'],
                ], 400);
            }
            $originalName = $file->getClientFilename();
            $fileType = $validation['mime'];
            $extension = $validation['extension'];

            // Hapus file lama
            $oldFilePath = $this->resolvePath($berkasLama['path_file']);
            if (file_exists($oldFilePath)) {
                unlink($oldFilePath);
            }

            // Generate nama file baru (dengan jenis berkas yang sama)
            // Sanitize jenis_berkas for filename
            $sanitizedJenis = preg_replace('/[^a-zA-Z0-9_\-]/', '_', $berkasLama['jenis_berkas']);
            $fileName = uniqid('santri_' . $berkasLama['id_santri'] . '_' . $sanitizedJenis . '_', true) . '.' . $extension;
            $uploadDir = $this->uploadsPath . '/santri';
            if (!is_dir($uploadDir)) {
                mkdir($uploadDir, 0755, true);
            }

            $filePath = $uploadDir . '/' . $fileName;
            $relativePath = 'uploads/santri/' . $fileName;

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
            $finalFileSize = filesize($filePath);

            $updateSql = "UPDATE santri___berkas 
                         SET nama_file = ?, path_file = ?, ukuran_file = ?, tipe_file = ?, 
                             keterangan = ?, id_admin = ?, tanggal_update = CURRENT_TIMESTAMP
                         WHERE id = ?";
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

            $sql = "SELECT b.*, p.nama AS admin_nama FROM santri___berkas b LEFT JOIN pengurus p ON b.id_admin = p.id WHERE b.id = ?";
            $stmt = $this->db->prepare($sql);
            $stmt->execute([$idBerkas]);
            $berkasBaru = $stmt->fetch(\PDO::FETCH_ASSOC);
            if ($berkasBaru && $idAdmin !== null) {
                UserAktivitasLogger::log(null, (int) $idAdmin, UserAktivitasLogger::ACTION_UPDATE, 'santri___berkas', $idBerkas, $berkasLama, $berkasBaru, $request);
            }

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Berkas berhasil diganti',
                'data' => $berkasBaru
            ], 200);

        } catch (\Exception $e) {
            error_log("Update berkas error: " . $e->getMessage());
            error_log("Stack trace: " . $e->getTraceAsString());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengganti berkas'
            ], 500);
        }
    }

    /**
     * GET /api/santri-berkas/download - Download berkas santri
     */
    public function downloadBerkas(Request $request, Response $response): Response
    {
        try {
            $userArr = is_array($request->getAttribute('user')) ? $request->getAttribute('user') : [];
            $queryParams = $request->getQueryParams();
            $idBerkas = $queryParams['id'] ?? null;

            if (!$idBerkas) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'ID berkas wajib diisi'
                ], 400);
            }

            // Ambil informasi berkas
            $sql = "SELECT * FROM santri___berkas WHERE id = ?";
            $stmt = $this->db->prepare($sql);
            $stmt->execute([$idBerkas]);
            $berkas = $stmt->fetch(\PDO::FETCH_ASSOC);

            if (!$berkas) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Berkas tidak ditemukan'
                ], 404);
            }

            if (!$this->ensureSantriDaftarOwnsBerkasRow($userArr, $berkas)) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Akses ditolak'
                ], 403);
            }

            // Path file (dari config UPLOADS_BASE_PATH)
            $filePath = $this->resolvePath($berkas['path_file']);

            if (!file_exists($filePath)) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'File tidak ditemukan di server'
                ], 404);
            }

            // Set headers untuk download
            $response = $response->withHeader('Content-Type', $berkas['tipe_file'] ?? 'application/octet-stream');
            $response = $response->withHeader('Content-Disposition', 'attachment; filename="' . $berkas['nama_file'] . '"');
            $response = $response->withHeader('Content-Length', filesize($filePath));

            // Read file dan kirim
            $fileContent = file_get_contents($filePath);
            $response->getBody()->write($fileContent);

            return $response;

        } catch (\Exception $e) {
            error_log("Download berkas error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengunduh berkas'
            ], 500);
        }
    }

    /**
     * POST /api/santri-berkas/link - Link berkas ke jenis berkas lain (menggunakan file yang sama)
     * Digunakan untuk kasus seperti "KK Ayah sama dengan KK Santri"
     */
    public function linkBerkas(Request $request, Response $response): Response
    {
        try {
            $user = $request->getAttribute('user');
            $userArr = is_array($user) ? $user : [];

            // Get form data
            $parsedBody = $request->getParsedBody();
            $parsedBody = is_array($parsedBody) ? TextSanitizer::sanitizeStringValues($parsedBody, []) : [];
            $idAdmin = RoleHelper::tokenIsSantriDaftarContext($userArr)
                ? null
                : PengurusAdminIdHelper::resolveEffectivePengurusId($userArr, $parsedBody['id_admin'] ?? 0);
            $idSantri = $parsedBody['id_santri'] ?? null;
            $jenisBerkas = $parsedBody['jenis_berkas'] ?? null;
            $idBerkasSource = $parsedBody['id_berkas_source'] ?? null; // ID berkas yang akan di-link

            if (!$idSantri || !$jenisBerkas || !$idBerkasSource) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Parameter id_santri, jenis_berkas, dan id_berkas_source wajib diisi'
                ], 400);
            }

            $idSantriResolved = SantriHelper::resolveId($this->db, $idSantri);
            if ($idSantriResolved === null) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Santri tidak ditemukan (id/NIS tidak valid)'
                ], 404);
            }
            $idSantri = $idSantriResolved;

            if (!$this->ensureSantriDaftarOwnsSantriId($userArr, (int) $idSantri)) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Akses ditolak'
                ], 403);
            }

            // Cek apakah sudah ada berkas dengan jenis_berkas yang sama untuk santri ini
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

            // Ambil data berkas source
            $sourceSql = "SELECT nama_file, path_file, ukuran_file, tipe_file FROM santri___berkas WHERE id = ? AND id_santri = ?";
            $sourceStmt = $this->db->prepare($sourceSql);
            $sourceStmt->execute([$idBerkasSource, $idSantri]);
            $sourceBerkas = $sourceStmt->fetch(\PDO::FETCH_ASSOC);

            if (!$sourceBerkas) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Berkas source tidak ditemukan'
                ], 404);
            }

            // Insert record baru dengan path_file yang sama
            $keterangan = $parsedBody['keterangan'] ?? "Sama dengan " . ($parsedBody['jenis_berkas_source'] ?? 'berkas lain');
            
            $sql = "INSERT INTO santri___berkas 
                    (id_santri, jenis_berkas, nama_file, path_file, ukuran_file, tipe_file, keterangan, id_admin) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)";
            $stmt = $this->db->prepare($sql);
            $stmt->execute([
                $idSantri,
                $jenisBerkas,
                $sourceBerkas['nama_file'],
                $sourceBerkas['path_file'], // Gunakan path_file yang sama
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
            error_log("Link berkas santri error: " . $e->getMessage());
            error_log("Stack trace: " . $e->getTraceAsString());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal link berkas'
            ], 500);
        }
    }
}

