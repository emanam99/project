<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Database;
use App\Helpers\MadrasahEditPengajuanHelper;
use App\Helpers\RoleHelper;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

/**
 * Pengajuan edit profil madrasah dari myBeddien (role PJGT).
 */
class MybeddianMadrasahEditPengajuanController
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

    private function json(Response $response, array $data, int $status): Response
    {
        $response->getBody()->write(json_encode($data, JSON_UNESCAPED_UNICODE));

        return $response->withStatus($status)->withHeader('Content-Type', 'application/json; charset=utf-8');
    }

    private function resolveUserId(array $pArr): int
    {
        if (isset($pArr['users_id']) && (int) $pArr['users_id'] > 0) {
            return (int) $pArr['users_id'];
        }

        return isset($pArr['user_id']) ? (int) $pArr['user_id'] : 0;
    }

    private function resolveMadrasahId(array $pArr): int
    {
        return isset($pArr['madrasah_id']) ? (int) $pArr['madrasah_id'] : 0;
    }

    private function fetchMadrasahRow(int $mid): ?array
    {
        $stmt = $this->db->prepare('SELECT * FROM madrasah WHERE id = ? LIMIT 1');
        $stmt->execute([$mid]);
        $row = $stmt->fetch(\PDO::FETCH_ASSOC);

        return $row ?: null;
    }

    private function mapPengajuanRow(array $row): array
    {
        return [
            'id' => (int) $row['id'],
            'id_madrasah' => (int) $row['id_madrasah'],
            'id_users_pengaju' => (int) $row['id_users_pengaju'],
            'status' => (string) $row['status'],
            'data_lama' => MadrasahEditPengajuanHelper::decodeJson($row['data_lama'] ?? null),
            'data_baru' => MadrasahEditPengajuanHelper::decodeJson($row['data_baru'] ?? null),
            'foto_path_baru' => $row['foto_path_baru'] ?? null,
            'logo_path_baru' => $row['logo_path_baru'] ?? null,
            'catatan_pengaju' => $row['catatan_pengaju'] ?? null,
            'catatan_reviewer' => $row['catatan_reviewer'] ?? null,
            'id_pengurus_reviewer' => isset($row['id_pengurus_reviewer']) ? (int) $row['id_pengurus_reviewer'] : null,
            'reviewed_at' => $row['reviewed_at'] ?? null,
            'tanggal_dibuat' => $row['tanggal_dibuat'] ?? null,
            'tanggal_update' => $row['tanggal_update'] ?? null,
        ];
    }

    private function stagingDir(): string
    {
        $dir = $this->uploadsBasePath . DIRECTORY_SEPARATOR . 'ugt' . DIRECTORY_SEPARATOR . 'pengajuan_madrasah';
        if (!is_dir($dir)) {
            mkdir($dir, 0755, true);
        }

        return $dir;
    }

    /**
     * GET /v2/madrasah-profil/pengajuan
     */
    public function getPengajuan(Request $request, Response $response): Response
    {
        try {
            $payload = $request->getAttribute('user');
            $pArr = is_array($payload) ? $payload : [];
            if (empty($pArr) || !RoleHelper::tokenHasAnyRoleKey($pArr, ['pjgt'])) {
                return $this->json($response, ['success' => false, 'message' => 'Akses hanya untuk PJGT'], 403);
            }
            $mid = $this->resolveMadrasahId($pArr);
            if ($mid <= 0) {
                return $this->json($response, ['success' => false, 'message' => 'Madrasah tidak terhubung pada akun'], 400);
            }

            $stmtAktif = $this->db->prepare(
                "SELECT * FROM ugt___madrasah_edit_pengajuan WHERE id_madrasah = ? AND status = 'menunggu' ORDER BY id DESC LIMIT 1"
            );
            $stmtAktif->execute([$mid]);
            $aktif = $stmtAktif->fetch(\PDO::FETCH_ASSOC);

            $stmtHist = $this->db->prepare(
                "SELECT id, status, catatan_reviewer, reviewed_at, tanggal_dibuat, tanggal_update
                 FROM ugt___madrasah_edit_pengajuan
                 WHERE id_madrasah = ? AND status IN ('disetujui','ditolak')
                 ORDER BY id DESC LIMIT 10"
            );
            $stmtHist->execute([$mid]);
            $riwayat = $stmtHist->fetchAll(\PDO::FETCH_ASSOC) ?: [];

            return $this->json($response, [
                'success' => true,
                'data' => [
                    'aktif' => $aktif ? $this->mapPengajuanRow($aktif) : null,
                    'riwayat' => array_map(static function ($r) {
                        return [
                            'id' => (int) $r['id'],
                            'status' => (string) $r['status'],
                            'catatan_reviewer' => $r['catatan_reviewer'] ?? null,
                            'reviewed_at' => $r['reviewed_at'] ?? null,
                            'tanggal_dibuat' => $r['tanggal_dibuat'] ?? null,
                            'tanggal_update' => $r['tanggal_update'] ?? null,
                        ];
                    }, $riwayat),
                ],
            ], 200);
        } catch (\Exception $e) {
            error_log('MybeddianMadrasahEditPengajuanController::getPengajuan ' . $e->getMessage());

            return $this->json($response, ['success' => false, 'message' => 'Terjadi kesalahan'], 500);
        }
    }

    /**
     * POST /v2/madrasah-profil/pengajuan
     */
    public function postPengajuan(Request $request, Response $response): Response
    {
        try {
            $payload = $request->getAttribute('user');
            $pArr = is_array($payload) ? $payload : [];
            if (empty($pArr) || !RoleHelper::tokenHasAnyRoleKey($pArr, ['pjgt'])) {
                return $this->json($response, ['success' => false, 'message' => 'Akses hanya untuk PJGT'], 403);
            }
            $mid = $this->resolveMadrasahId($pArr);
            $uid = $this->resolveUserId($pArr);
            if ($mid <= 0 || $uid <= 0) {
                return $this->json($response, ['success' => false, 'message' => 'Akun / madrasah tidak valid'], 400);
            }

            $madrasah = $this->fetchMadrasahRow($mid);
            if ($madrasah === null) {
                return $this->json($response, ['success' => false, 'message' => 'Data madrasah tidak ditemukan'], 404);
            }

            $body = $request->getParsedBody();
            $body = is_array($body) ? $body : [];
            $extracted = MadrasahEditPengajuanHelper::extractPayload($body, true);
            if (!$extracted['ok']) {
                return $this->json($response, ['success' => false, 'message' => $extracted['message'] ?? 'Data tidak valid'], 400);
            }

            $snapshotLama = MadrasahEditPengajuanHelper::snapshotFromMadrasahRow($madrasah);
            $dataBaru = MadrasahEditPengajuanHelper::mergeDataBaru($snapshotLama, $extracted['data']);

            $fotoPath = MadrasahEditPengajuanHelper::normalizeUploadPath(
                isset($body['foto_path_baru']) ? (string) $body['foto_path_baru'] : (isset($body['foto_path']) ? (string) $body['foto_path'] : null)
            );
            $logoPath = MadrasahEditPengajuanHelper::normalizeUploadPath(
                isset($body['logo_path_baru']) ? (string) $body['logo_path_baru'] : (isset($body['logo_path']) ? (string) $body['logo_path'] : null)
            );
            $catatan = isset($body['catatan_pengaju']) ? trim((string) $body['catatan_pengaju']) : '';
            $catatan = $catatan === '' ? null : substr($catatan, 0, 2000);

            $stmtExist = $this->db->prepare(
                "SELECT id, foto_path_baru, logo_path_baru FROM ugt___madrasah_edit_pengajuan
                 WHERE id_madrasah = ? AND status = 'menunggu' ORDER BY id DESC LIMIT 1"
            );
            $stmtExist->execute([$mid]);
            $exist = $stmtExist->fetch(\PDO::FETCH_ASSOC);

            if ($exist) {
                $fotoFinal = $fotoPath !== null ? $fotoPath : ($exist['foto_path_baru'] ?? null);
                $logoFinal = $logoPath !== null ? $logoPath : ($exist['logo_path_baru'] ?? null);
                // kosongkan eksplisit jika klien kirim null string "clear"
                if (array_key_exists('foto_path_baru', $body) && ($body['foto_path_baru'] === null || $body['foto_path_baru'] === '')) {
                    $fotoFinal = null;
                }
                if (array_key_exists('logo_path_baru', $body) && ($body['logo_path_baru'] === null || $body['logo_path_baru'] === '')) {
                    $logoFinal = null;
                }

                $upd = $this->db->prepare(
                    "UPDATE ugt___madrasah_edit_pengajuan SET
                        id_users_pengaju = ?, data_lama = ?, data_baru = ?,
                        foto_path_baru = ?, logo_path_baru = ?, catatan_pengaju = ?,
                        tanggal_update = NOW()
                     WHERE id = ?"
                );
                $upd->execute([
                    $uid,
                    MadrasahEditPengajuanHelper::encodeJson($snapshotLama),
                    MadrasahEditPengajuanHelper::encodeJson($dataBaru),
                    $fotoFinal,
                    $logoFinal,
                    $catatan,
                    (int) $exist['id'],
                ]);
                $id = (int) $exist['id'];
            } else {
                $ins = $this->db->prepare(
                    "INSERT INTO ugt___madrasah_edit_pengajuan
                        (id_madrasah, id_users_pengaju, status, data_lama, data_baru, foto_path_baru, logo_path_baru, catatan_pengaju)
                     VALUES (?, ?, 'menunggu', ?, ?, ?, ?, ?)"
                );
                $ins->execute([
                    $mid,
                    $uid,
                    MadrasahEditPengajuanHelper::encodeJson($snapshotLama),
                    MadrasahEditPengajuanHelper::encodeJson($dataBaru),
                    $fotoPath,
                    $logoPath,
                    $catatan,
                ]);
                $id = (int) $this->db->lastInsertId();
            }

            $stmt = $this->db->prepare('SELECT * FROM ugt___madrasah_edit_pengajuan WHERE id = ? LIMIT 1');
            $stmt->execute([$id]);
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);

            return $this->json($response, [
                'success' => true,
                'message' => 'Pengajuan edit profil berhasil dikirim',
                'data' => $row ? $this->mapPengajuanRow($row) : ['id' => $id],
            ], 200);
        } catch (\Exception $e) {
            error_log('MybeddianMadrasahEditPengajuanController::postPengajuan ' . $e->getMessage());

            return $this->json($response, ['success' => false, 'message' => 'Gagal menyimpan pengajuan'], 500);
        }
    }

    /**
     * POST /v2/madrasah-profil/pengajuan/upload — kind=foto|logo
     */
    public function upload(Request $request, Response $response): Response
    {
        try {
            $payload = $request->getAttribute('user');
            $pArr = is_array($payload) ? $payload : [];
            if (empty($pArr) || !RoleHelper::tokenHasAnyRoleKey($pArr, ['pjgt'])) {
                return $this->json($response, ['success' => false, 'message' => 'Akses hanya untuk PJGT'], 403);
            }
            $mid = $this->resolveMadrasahId($pArr);
            if ($mid <= 0) {
                return $this->json($response, ['success' => false, 'message' => 'Madrasah tidak terhubung'], 400);
            }

            $params = $request->getQueryParams();
            $body = $request->getParsedBody();
            $body = is_array($body) ? $body : [];
            $kind = strtolower(trim((string) ($params['kind'] ?? $body['kind'] ?? 'foto')));
            if (!in_array($kind, ['foto', 'logo'], true)) {
                $kind = 'foto';
            }

            $uploadedFiles = $request->getUploadedFiles();
            $file = $uploadedFiles[$kind] ?? $uploadedFiles['file'] ?? $uploadedFiles['foto'] ?? $uploadedFiles['logo'] ?? null;
            if (!$file || $file->getError() !== UPLOAD_ERR_OK) {
                return $this->json($response, ['success' => false, 'message' => 'Tidak ada file yang diunggah'], 400);
            }

            $mediaType = (string) $file->getClientMediaType();
            $allowedFoto = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
            $allowedLogo = ['image/jpeg', 'image/jpg', 'image/png'];
            $allowed = $kind === 'logo' ? $allowedLogo : $allowedFoto;
            if (!in_array($mediaType, $allowed, true)) {
                return $this->json($response, [
                    'success' => false,
                    'message' => $kind === 'logo' ? 'Logo hanya JPEG/PNG' : 'Hanya file gambar yang diizinkan',
                ], 400);
            }
            if ($file->getSize() > 1024 * 1024) {
                return $this->json($response, ['success' => false, 'message' => 'Ukuran file maksimal 1 MB'], 400);
            }

            $ext = 'jpg';
            if (preg_match('#^image/(jpeg|png|webp|gif)$#', $mediaType, $m)) {
                $ext = $m[1] === 'jpeg' ? 'jpg' : $m[1];
            }
            $fileName = 'pengajuan_' . $mid . '_' . $kind . '_' . uniqid('', true) . '.' . $ext;
            $dir = $this->stagingDir();
            $filePath = $dir . DIRECTORY_SEPARATOR . $fileName;
            $file->moveTo($filePath);

            $imageInfo = @getimagesize($filePath);
            if ($imageInfo === false || !isset($imageInfo[2])) {
                @unlink($filePath);

                return $this->json($response, ['success' => false, 'message' => 'File bukan gambar valid'], 400);
            }
            if ($kind === 'logo' && !in_array((int) $imageInfo[2], [IMAGETYPE_JPEG, IMAGETYPE_PNG], true)) {
                @unlink($filePath);

                return $this->json($response, ['success' => false, 'message' => 'Logo hanya JPEG/PNG'], 400);
            }

            $relative = 'uploads/ugt/pengajuan_madrasah/' . $fileName;
            $key = $kind === 'logo' ? 'logo_path' : 'foto_path';

            return $this->json($response, [
                'success' => true,
                'message' => 'Berhasil diunggah',
                $key => $relative,
                'path' => $relative,
            ], 200);
        } catch (\Exception $e) {
            error_log('MybeddianMadrasahEditPengajuanController::upload ' . $e->getMessage());

            return $this->json($response, ['success' => false, 'message' => 'Gagal mengunggah'], 500);
        }
    }
}
