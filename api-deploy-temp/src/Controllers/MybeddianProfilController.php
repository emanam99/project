<?php

namespace App\Controllers;

use App\Database;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

/**
 * Controller profil santri atau toko untuk aplikasi Mybeddian.
 * Santri: santri_id dari JWT, data/foto dari tabel santri (uploads/santri/).
 * Toko: toko_id dari JWT, data/foto dari cashless___pedagang (uploads/cashless/).
 */
class MybeddianProfilController
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

    /** Ambil santri_id dari JWT. */
    private function getSantriIdFromRequest(Request $request): ?int
    {
        $payload = $request->getAttribute('user');
        $santriId = isset($payload['santri_id']) ? (int) $payload['santri_id'] : 0;
        return $santriId > 0 ? $santriId : null;
    }

    /** Ambil toko_id dari JWT (cashless___pedagang.id). */
    private function getTokoIdFromRequest(Request $request): ?int
    {
        $payload = $request->getAttribute('user');
        $tokoId = isset($payload['toko_id']) ? (int) $payload['toko_id'] : 0;
        return $tokoId > 0 ? $tokoId : null;
    }

    private function getSantriUploadDir(): string
    {
        $dir = $this->uploadsBasePath . DIRECTORY_SEPARATOR . 'santri';
        if (!is_dir($dir)) {
            mkdir($dir, 0755, true);
        }
        return $dir;
    }

    private function getCashlessUploadDir(): string
    {
        $dir = $this->uploadsBasePath . DIRECTORY_SEPARATOR . 'cashless';
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

    private function json(Response $response, array $data, int $status): Response
    {
        $response->getBody()->write(json_encode($data, JSON_UNESCAPED_UNICODE));
        return $response->withStatus($status)->withHeader('Content-Type', 'application/json; charset=utf-8');
    }

    /**
     * GET /api/mybeddian/v2/profil - Data profil dari tabel user (username, email, no_wa, no_wa_verified_at)
     * plus nama dan foto_profil dari santri untuk tampilan header.
     */
    public function getProfil(Request $request, Response $response): Response
    {
        try {
            $payload = $request->getAttribute('user');
            if (empty($payload)) {
                return $this->json($response, ['success' => false, 'message' => 'Akses hanya untuk santri atau toko'], 403);
            }
            $roleKey = strtolower(trim($payload['role_key'] ?? $payload['user_role'] ?? ''));
            $santriId = isset($payload['santri_id']) ? (int) $payload['santri_id'] : null;
            $tokoId = isset($payload['toko_id']) ? (int) $payload['toko_id'] : null;
            $isToko = ($roleKey === 'toko' && $tokoId > 0) || $tokoId > 0;
            $isSantri = ($roleKey === 'santri' && $santriId > 0) || $santriId > 0;
            if (!$isSantri && !$isToko) {
                return $this->json($response, ['success' => false, 'message' => 'Akses hanya untuk santri atau toko'], 403);
            }
            $userId = isset($payload['users_id']) && (int)$payload['users_id'] > 0
                ? (int) $payload['users_id']
                : (int) ($payload['user_id'] ?? 0);
            if ($userId <= 0) {
                return $this->json($response, ['success' => false, 'message' => 'User tidak valid'], 403);
            }

            $stmt = $this->db->prepare("
                SELECT username, email, COALESCE(no_wa, '') AS no_wa, no_wa_verified_at
                FROM users
                WHERE id = ?
            ");
            $stmt->execute([$userId]);
            $userRow = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$userRow) {
                return $this->json($response, ['success' => false, 'message' => 'Data user tidak ditemukan'], 404);
            }

            $nama = null;
            $foto_profil = null;
            if ($isToko && $tokoId > 0) {
                $stmtToko = $this->db->prepare("SELECT nama_toko, foto_path FROM cashless___pedagang WHERE id = ? AND id_users = ? LIMIT 1");
                $stmtToko->execute([$tokoId, $userId]);
                $tokoRow = $stmtToko->fetch(\PDO::FETCH_ASSOC);
                if ($tokoRow) {
                    $nama = $tokoRow['nama_toko'];
                    $foto_profil = $tokoRow['foto_path'];
                }
            } elseif ($santriId > 0) {
                $stmtSantri = $this->db->prepare("SELECT nama, foto_profil FROM santri WHERE id = ?");
                $stmtSantri->execute([$santriId]);
                $santriRow = $stmtSantri->fetch(\PDO::FETCH_ASSOC);
                if ($santriRow) {
                    $nama = $santriRow['nama'];
                    $foto_profil = $santriRow['foto_profil'];
                }
            }

            $userRow['no_wa_verified_at'] = $userRow['no_wa_verified_at'] ?? null;
            $out = [
                'success' => true,
                'user' => $userRow,
                'nama' => $nama,
                'foto_profil' => $foto_profil,
            ];
            return $this->json($response, $out, 200);
        } catch (\Exception $e) {
            error_log('MybeddianProfilController::getProfil ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Terjadi kesalahan'], 500);
        }
    }

    /**
     * GET /api/mybeddian/v2/biodata - Biodata santri lengkap (sama struktur dengan public santri di Uwaba).
     * Hanya untuk santri yang login; santri_id dari JWT.
     */
    public function getBiodata(Request $request, Response $response): Response
    {
        try {
            $santriId = $this->getSantriIdFromRequest($request);
            if ($santriId === null) {
                return $this->json($response, ['success' => false, 'message' => 'Akses hanya untuk santri'], 403);
            }

            $checkColumn = $this->db->query("SHOW COLUMNS FROM santri LIKE 'no_telpon_wali'");
            $hasNoTelponWali = $checkColumn->rowCount() > 0;

            $sql = "SELECT 
                s.id, s.nis, s.nama, s.nik, s.tempat_lahir, s.tanggal_lahir, s.gender, 
                s.ayah, s.status_ayah, s.nik_ayah, s.tempat_lahir_ayah, s.tanggal_lahir_ayah,
                s.pekerjaan_ayah, s.pendidikan_ayah, s.penghasilan_ayah,
                s.ibu, s.status_ibu, s.nik_ibu, s.tempat_lahir_ibu, s.tanggal_lahir_ibu,
                s.pekerjaan_ibu, s.pendidikan_ibu, s.penghasilan_ibu,
                s.hubungan_wali, s.wali, s.nik_wali, s.tempat_lahir_wali, s.tanggal_lahir_wali,
                s.pekerjaan_wali, s.pendidikan_wali, s.penghasilan_wali,
                s.no_telpon, s.email, s.no_wa_santri" .
                ($hasNoTelponWali ? ", s.no_telpon_wali" : "") . ",
                s.dusun, s.rt, s.rw, s.desa, s.kecamatan, s.kode_pos, s.kabupaten, s.provinsi,
                rd.lembaga_id AS diniyah, rd.kelas AS kelas_diniyah, rd.kel AS kel_diniyah,
                rf.lembaga_id AS formal, rf.kelas AS kelas_formal, rf.kel AS kel_formal,
                s.lttq, s.kelas_lttq, s.kel_lttq,
                d.daerah, dk.kamar, s.id_kamar, s.status_santri, s.kategori, s.saudara_di_pesantren
                FROM santri s
                LEFT JOIN lembaga___rombel rd ON rd.id = s.id_diniyah
                LEFT JOIN lembaga___rombel rf ON rf.id = s.id_formal
                LEFT JOIN daerah___kamar dk ON dk.id = s.id_kamar
                LEFT JOIN daerah d ON d.id = dk.id_daerah
                WHERE s.id = ? LIMIT 1";
            $stmt = $this->db->prepare($sql);
            $stmt->execute([$santriId]);
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);

            if (!$row) {
                return $this->json($response, ['success' => false, 'message' => 'Data santri tidak ditemukan'], 404);
            }
            return $this->json($response, ['success' => true, 'data' => $row], 200);
        } catch (\Exception $e) {
            error_log('MybeddianProfilController::getBiodata ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Terjadi kesalahan'], 500);
        }
    }

    /**
     * GET /api/mybeddian/v2/profil/foto - Stream foto profil santri atau toko.
     */
    public function serveFoto(Request $request, Response $response): Response
    {
        try {
            $payload = $request->getAttribute('user');
            $tokoId = $this->getTokoIdFromRequest($request);
            $santriId = $this->getSantriIdFromRequest($request);
            $userId = isset($payload['users_id']) ? (int) $payload['users_id'] : (int) ($payload['user_id'] ?? 0);

            if ($tokoId !== null && $userId > 0) {
                $stmt = $this->db->prepare("SELECT foto_path FROM cashless___pedagang WHERE id = ? AND id_users = ? LIMIT 1");
                $stmt->execute([$tokoId, $userId]);
                $row = $stmt->fetch(\PDO::FETCH_ASSOC);
                $path = $row['foto_path'] ?? null;
            } elseif ($santriId !== null) {
                $stmt = $this->db->prepare("SELECT foto_profil FROM santri WHERE id = ?");
                $stmt->execute([$santriId]);
                $row = $stmt->fetch(\PDO::FETCH_ASSOC);
                $path = $row['foto_profil'] ?? null;
            } else {
                return $response->withStatus(403);
            }

            if (!$path) {
                return $response->withStatus(404);
            }

            $fullPath = $this->resolveFilePath($path);
            if (!is_file($fullPath)) {
                return $response->withStatus(404);
            }

            $mime = @mime_content_type($fullPath) ?: 'image/jpeg';
            if (!preg_match('#^image/#', $mime)) {
                $mime = 'image/jpeg';
            }
            $response->getBody()->write(file_get_contents($fullPath));
            return $response->withHeader('Content-Type', $mime);
        } catch (\Exception $e) {
            error_log('MybeddianProfilController::serveFoto ' . $e->getMessage());
            return $response->withStatus(500);
        }
    }

    /**
     * POST /api/mybeddian/v2/profil/foto - Upload foto profil santri (uploads/santri/) atau toko (uploads/cashless/).
     */
    public function uploadFoto(Request $request, Response $response): Response
    {
        try {
            $payload = $request->getAttribute('user');
            $userId = isset($payload['users_id']) ? (int) $payload['users_id'] : (int) ($payload['user_id'] ?? 0);
            $tokoId = $this->getTokoIdFromRequest($request);
            $santriId = $this->getSantriIdFromRequest($request);

            if ($tokoId !== null && $userId > 0) {
                $stmt = $this->db->prepare("SELECT id FROM cashless___pedagang WHERE id = ? AND id_users = ? LIMIT 1");
                $stmt->execute([$tokoId, $userId]);
                if (!$stmt->fetch()) {
                    return $this->json($response, ['success' => false, 'message' => 'Akses hanya untuk toko Anda'], 403);
                }
            } elseif ($santriId === null) {
                return $this->json($response, ['success' => false, 'message' => 'Akses hanya untuk santri atau toko'], 403);
            }

            $uploadedFiles = $request->getUploadedFiles();
            $file = $uploadedFiles['foto'] ?? $uploadedFiles['file'] ?? null;
            $phpFile = null;
            if (!$file && !empty($_FILES['foto']) && ($_FILES['foto']['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_OK) {
                $phpFile = $_FILES['foto'];
            }
            if (!$file && !empty($_FILES['file']) && ($_FILES['file']['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_OK) {
                $phpFile = $_FILES['file'];
            }
            if (!$file && !empty($uploadedFiles)) {
                $file = reset($uploadedFiles);
            }
            if (!$file && !$phpFile) {
                $err = $_FILES['foto']['error'] ?? $_FILES['file']['error'] ?? UPLOAD_ERR_NO_FILE;
                $msg = $err !== UPLOAD_ERR_NO_FILE ? $this->uploadErrorMessage((int) $err) : 'Tidak ada file foto. Kirim form dengan field "foto" (file gambar).';
                return $this->json($response, ['success' => false, 'message' => $msg], 400);
            }
            if ($file && method_exists($file, 'getError') && $file->getError() !== UPLOAD_ERR_OK) {
                return $this->json($response, ['success' => false, 'message' => $this->uploadErrorMessage($file->getError())], 400);
            }

            if ($phpFile) {
                $mediaType = $phpFile['type'] ?? 'image/jpeg';
            } else {
                $mediaType = $file->getClientMediaType();
            }
            $allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
            if (!in_array($mediaType, $allowed, true)) {
                return $this->json($response, ['success' => false, 'message' => 'Hanya file gambar (JPEG, PNG, WebP, GIF) yang diizinkan'], 400);
            }

            $ext = preg_match('#^image/(jpeg|png|webp|gif)$#', $mediaType, $m) ? ($m[1] === 'jpeg' ? 'jpg' : $m[1]) : 'jpg';

            if ($tokoId !== null) {
                $fileName = 'toko_' . uniqid('', true) . '.' . $ext;
                $uploadDir = $this->getCashlessUploadDir();
                $relativePath = 'cashless/' . $fileName;
                $savePath = 'uploads/' . $relativePath;
                $filePath = $this->uploadsBasePath . DIRECTORY_SEPARATOR . $relativePath;

                $stmt = $this->db->prepare("SELECT foto_path FROM cashless___pedagang WHERE id = ? AND id_users = ? LIMIT 1");
                $stmt->execute([$tokoId, $userId]);
                $row = $stmt->fetch(\PDO::FETCH_ASSOC);
                $oldPath = $row['foto_path'] ?? null;
            } else {
                $fileName = $santriId . '_fotoprofil_' . uniqid('', true) . '.' . $ext;
                $uploadDir = $this->getSantriUploadDir();
                $relativePath = 'santri/' . $fileName;
                $savePath = 'uploads/' . $relativePath;
                $filePath = $uploadDir . DIRECTORY_SEPARATOR . $fileName;

                $stmt = $this->db->prepare("SELECT foto_profil FROM santri WHERE id = ?");
                $stmt->execute([$santriId]);
                $row = $stmt->fetch(\PDO::FETCH_ASSOC);
                $oldPath = $row['foto_profil'] ?? null;
            }

            if ($phpFile) {
                $tmpPath = $phpFile['tmp_name'] ?? '';
                if (!is_uploaded_file($tmpPath) || !move_uploaded_file($tmpPath, $filePath)) {
                    return $this->json($response, ['success' => false, 'message' => 'Gagal menyimpan file'], 400);
                }
            } else {
                $file->moveTo($filePath);
            }

            if ($oldPath) {
                $oldFull = $this->resolveFilePath($oldPath);
                if (file_exists($oldFull)) {
                    @unlink($oldFull);
                }
            }

            if ($tokoId !== null) {
                $this->db->prepare("UPDATE cashless___pedagang SET foto_path = ? WHERE id = ? AND id_users = ?")->execute([$savePath, $tokoId, $userId]);
            } else {
                $this->db->prepare("UPDATE santri SET foto_profil = ? WHERE id = ?")->execute([$savePath, $santriId]);
            }

            return $this->json($response, [
                'success' => true,
                'message' => 'Foto profil berhasil diperbarui',
                'foto_profil' => $savePath,
            ], 200);
        } catch (\Exception $e) {
            error_log('MybeddianProfilController::uploadFoto ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Gagal mengunggah foto'], 500);
        }
    }

    /**
     * DELETE /api/mybeddian/v2/profil/foto - Hapus foto profil santri atau toko.
     */
    public function deleteFoto(Request $request, Response $response): Response
    {
        try {
            $payload = $request->getAttribute('user');
            $userId = isset($payload['users_id']) ? (int) $payload['users_id'] : (int) ($payload['user_id'] ?? 0);
            $tokoId = $this->getTokoIdFromRequest($request);
            $santriId = $this->getSantriIdFromRequest($request);

            if ($tokoId !== null && $userId > 0) {
                $stmt = $this->db->prepare("SELECT foto_path FROM cashless___pedagang WHERE id = ? AND id_users = ? LIMIT 1");
                $stmt->execute([$tokoId, $userId]);
                $row = $stmt->fetch(\PDO::FETCH_ASSOC);
                $path = $row['foto_path'] ?? null;
                if ($path) {
                    $fullPath = $this->resolveFilePath($path);
                    if (file_exists($fullPath)) {
                        @unlink($fullPath);
                    }
                    $this->db->prepare("UPDATE cashless___pedagang SET foto_path = NULL WHERE id = ? AND id_users = ?")->execute([$tokoId, $userId]);
                }
            } elseif ($santriId !== null) {
                $stmt = $this->db->prepare("SELECT foto_profil FROM santri WHERE id = ?");
                $stmt->execute([$santriId]);
                $row = $stmt->fetch(\PDO::FETCH_ASSOC);
                $path = $row['foto_profil'] ?? null;
                if ($path) {
                    $fullPath = $this->resolveFilePath($path);
                    if (file_exists($fullPath)) {
                        @unlink($fullPath);
                    }
                    $this->db->prepare("UPDATE santri SET foto_profil = NULL WHERE id = ?")->execute([$santriId]);
                }
            } else {
                return $this->json($response, ['success' => false, 'message' => 'Akses hanya untuk santri atau toko'], 403);
            }

            return $this->json($response, ['success' => true, 'message' => 'Foto profil telah dihapus'], 200);
        } catch (\Exception $e) {
            error_log('MybeddianProfilController::deleteFoto ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Gagal menghapus foto'], 500);
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
