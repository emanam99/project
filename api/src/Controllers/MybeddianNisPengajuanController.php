<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Database;
use App\Helpers\FileUploadValidator;
use App\Helpers\MybeddianAuthWaHelper;
use App\Helpers\NikHelper;
use App\Helpers\NisPengajuanHelper;
use App\Helpers\RoleHelper;
use App\Helpers\SantriHelper;
use App\Helpers\TextSanitizer;
use App\Services\NisPengajuanWaHelper;
use App\Services\WhatsAppInboundService;
use App\Services\WhatsAppService;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

/**
 * Pengajuan NIS myBeddien (publik) + kelola staff eBeddien.
 */
class MybeddianNisPengajuanController
{
    private const JENIS_KK_SANTRI = 'KK Santri';

    private \PDO $db;

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

    private function json(Response $response, array $data, int $status = 200): Response
    {
        $response->getBody()->write(json_encode($data, JSON_UNESCAPED_UNICODE));

        return $response->withStatus($status)->withHeader('Content-Type', 'application/json; charset=utf-8');
    }

    private function clientIp(Request $request): ?string
    {
        $ip = $request->getServerParams()['REMOTE_ADDR'] ?? null;

        return is_string($ip) && $ip !== '' ? $ip : null;
    }

    private function getSantriUploadDir(): string
    {
        $dir = $this->uploadsBasePath . DIRECTORY_SEPARATOR . 'santri';
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

    /**
     * POST /api/mybeddian/v2/auth/nis-pengajuan/check
     */
    public function check(Request $request, Response $response): Response
    {
        try {
            $body = $request->getParsedBody();
            $body = is_array($body) ? TextSanitizer::sanitizeMybeddianAuthBody($body) : [];
            $parsed = $this->parseIdentityInput($body);
            if ($parsed['error'] !== null) {
                return $this->json($response, ['success' => false, 'message' => $parsed['error']], 400);
            }

            $noWa62 = $parsed['no_wa62'];
            if (NisPengajuanHelper::isCheckRateLimited($this->db, $noWa62)) {
                return $this->json($response, [
                    'success' => false,
                    'message' => 'Terlalu banyak percobaan. Coba lagi nanti.',
                ], 429);
            }
            NisPengajuanHelper::recordCheckAttempt($this->db, $noWa62, $this->clientIp($request));

            $found = NisPengajuanHelper::findSantriByIdentity(
                $this->db,
                $parsed['nik'],
                $parsed['tanggal_lahir'],
                $parsed['nama']
            );

            if (!$found['matched'] || empty($found['santri'])) {
                $pending = NisPengajuanHelper::findPendingPengajuan(
                    $this->db,
                    $parsed['nik'],
                    $parsed['no_wa62']
                );
                if ($pending !== null) {
                    $pendingStatus = (string) ($pending['status'] ?? '');
                    $pendingId = (int) ($pending['id'] ?? 0);
                    if ($pendingStatus === NisPengajuanHelper::STATUS_MENUNGGU_REVIEW) {
                        return $this->json($response, [
                            'success' => true,
                            'matched' => false,
                            'pending_review' => true,
                            'message' => 'Pengajuan KK Anda sedang ditinjau admin. '
                                . 'Setelah disetujui, NIS akan dikirim ke nomor WhatsApp yang Anda isi.',
                        ]);
                    }
                    if ($pendingStatus === NisPengajuanHelper::STATUS_MENUNGGU_WA && $pendingId > 0) {
                        return $this->json($response, [
                            'success' => true,
                            'matched' => false,
                            'pending_wa_verify' => true,
                            'message' => 'KK sudah diunggah. Lanjutkan konfirmasi lewat WhatsApp (kirim pesan berisi token).',
                            'data' => [
                                'id' => $pendingId,
                                'nama' => (string) ($pending['nama'] ?? ''),
                                'nik' => (string) ($pending['nik'] ?? ''),
                                'tanggal_lahir' => (string) ($pending['tanggal_lahir'] ?? ''),
                                'no_wa' => (string) ($pending['no_wa'] ?? ''),
                            ],
                        ]);
                    }
                    if ($pendingStatus === NisPengajuanHelper::STATUS_MENUNGGU_KK && $pendingId > 0) {
                        return $this->json($response, [
                            'success' => true,
                            'matched' => false,
                            'pending_kk_upload' => true,
                            'message' => 'Anda sudah memiliki pengajuan. Lanjutkan unggah Kartu Keluarga (KK).',
                            'data' => [
                                'id' => $pendingId,
                                'nama' => (string) ($pending['nama'] ?? ''),
                                'nik' => (string) ($pending['nik'] ?? ''),
                                'tanggal_lahir' => (string) ($pending['tanggal_lahir'] ?? ''),
                                'no_wa' => (string) ($pending['no_wa'] ?? ''),
                            ],
                        ]);
                    }
                }

                return $this->json($response, [
                    'success' => true,
                    'matched' => false,
                    'message' => 'Data belum cocok dengan data pusat. Unggah foto/scan Kartu Keluarga (KK) '
                        . 'untuk verifikasi. Setelah disetujui admin, NIS akan dikirim ke nomor WhatsApp Anda.',
                ]);
            }

            $santri = $found['santri'];
            $santriId = (int) ($santri['id'] ?? 0);
            $nis = $this->resolveNisForLupaNisResponse($santri, $santriId);
            $nama = (string) ($santri['nama'] ?? '');
            $alreadyRegistered = !empty($santri['id_user']);
            $message = $alreadyRegistered
                ? 'NIS ditemukan. Akun sudah terdaftar — silakan login.'
                : 'NIS ditemukan. Anda dapat melanjutkan pendaftaran.';

            $payload = [
                'id_santri' => $santriId > 0 ? $santriId : null,
                'nis' => $nis,
                'nis_display' => $nis,
                'nama' => $nama,
                'already_registered' => $alreadyRegistered,
            ];

            return $this->json($response, [
                'success' => true,
                'matched' => true,
                'message' => $message,
                'data' => $payload,
                // Duplikat di root agar kompatibel dengan klien lama / proxy
                'id_santri' => $payload['id_santri'],
                'nis' => $nis,
                'nis_display' => $nis,
                'nama' => $nama,
                'already_registered' => $alreadyRegistered,
            ]);
        } catch (\Throwable $e) {
            error_log('MybeddianNisPengajuanController::check ' . $e->getMessage());

            return $this->json($response, ['success' => false, 'message' => 'Terjadi kesalahan'], 500);
        }
    }

    /**
     * POST /api/mybeddian/v2/auth/nis-pengajuan
     */
    public function create(Request $request, Response $response): Response
    {
        try {
            $body = $request->getParsedBody();
            $body = is_array($body) ? TextSanitizer::sanitizeMybeddianAuthBody($body) : [];
            $parsed = $this->parseIdentityInput($body);
            if ($parsed['error'] !== null) {
                return $this->json($response, ['success' => false, 'message' => $parsed['error']], 400);
            }

            $pending = NisPengajuanHelper::findPendingPengajuan($this->db, $parsed['nik'], $parsed['no_wa62']);
            if ($pending !== null) {
                $pendingId = (int) ($pending['id'] ?? 0);
                $pendingStatus = (string) ($pending['status'] ?? '');
                if ($pendingStatus === NisPengajuanHelper::STATUS_MENUNGGU_KK && $pendingId > 0) {
                    return $this->json($response, [
                        'success' => true,
                        'data' => ['id' => $pendingId],
                        'message' => 'Lanjutkan unggah Kartu Keluarga (KK) untuk pengajuan yang sudah ada.',
                    ]);
                }
                if ($pendingStatus === NisPengajuanHelper::STATUS_MENUNGGU_WA && $pendingId > 0) {
                    return $this->json($response, [
                        'success' => false,
                        'pending_wa_verify' => true,
                        'message' => 'KK sudah diunggah. Lanjutkan konfirmasi lewat WhatsApp.',
                        'data' => ['id' => $pendingId],
                    ], 400);
                }

                return $this->json($response, [
                    'success' => false,
                    'message' => 'Pengajuan Anda sedang ditinjau admin. NIS akan dikirim ke nomor WhatsApp yang Anda daftarkan.',
                ], 400);
            }

            $found = NisPengajuanHelper::findSantriByIdentity(
                $this->db,
                $parsed['nik'],
                $parsed['tanggal_lahir'],
                $parsed['nama']
            );
            if ($found['matched']) {
                return $this->json($response, [
                    'success' => false,
                    'message' => 'Data cocok dengan data pusat. Gunakan tombol cek NIS tanpa upload KK.',
                ], 400);
            }

            $stmt = $this->db->prepare(
                'INSERT INTO mybeddian___nis_pengajuan (nama, nik, tanggal_lahir, no_wa, status)
                 VALUES (?, ?, ?, ?, ?)'
            );
            $stmt->execute([
                $parsed['nama'],
                $parsed['nik'],
                $parsed['tanggal_lahir'],
                $parsed['no_wa62'],
                NisPengajuanHelper::STATUS_MENUNGGU_KK,
            ]);
            $id = (int) $this->db->lastInsertId();

            return $this->json($response, [
                'success' => true,
                'data' => ['id' => $id],
                'message' => 'Pengajuan dibuat. Unggah foto/scan Kartu Keluarga (KK). Setelah disetujui, NIS dikirim ke WhatsApp Anda.',
            ]);
        } catch (\Throwable $e) {
            error_log('MybeddianNisPengajuanController::create ' . $e->getMessage());

            return $this->json($response, ['success' => false, 'message' => 'Terjadi kesalahan'], 500);
        }
    }

    /**
     * POST /api/mybeddian/v2/auth/nis-pengajuan/{id}/upload-kk
     */
    public function uploadKk(Request $request, Response $response, array $args): Response
    {
        try {
            $id = (int) ($args['id'] ?? 0);
            if ($id < 1) {
                return $this->json($response, ['success' => false, 'message' => 'ID tidak valid'], 400);
            }

            $stmt = $this->db->prepare('SELECT * FROM mybeddian___nis_pengajuan WHERE id = ? LIMIT 1');
            $stmt->execute([$id]);
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$row) {
                return $this->json($response, ['success' => false, 'message' => 'Pengajuan tidak ditemukan'], 404);
            }
            if ((string) ($row['status'] ?? '') !== NisPengajuanHelper::STATUS_MENUNGGU_KK) {
                return $this->json($response, ['success' => false, 'message' => 'Pengajuan sudah diproses'], 400);
            }

            $uploadedFiles = $request->getUploadedFiles();
            if (empty($uploadedFiles['file'])) {
                return $this->json($response, ['success' => false, 'message' => 'File tidak ditemukan'], 400);
            }

            $file = $uploadedFiles['file'];
            $allowedExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf'];
            $clientName = (string) ($file->getClientFilename() ?? '');
            $clientExt = strtolower(pathinfo($clientName, PATHINFO_EXTENSION));
            $clientMime = strtolower((string) ($file->getClientMediaType() ?? ''));
            $isPdf = $clientExt === 'pdf' || $clientMime === 'application/pdf';
            $maxSize = $isPdf ? (5 * 1024 * 1024) : (1024 * 1024);
            $validation = FileUploadValidator::validate($file, $allowedExtensions, $maxSize);
            if (!$validation['success']) {
                $msg = $validation['message'] ?? 'File tidak valid';
                if (stripos((string) $msg, 'ukuran') !== false || stripos((string) $msg, 'size') !== false) {
                    $msg = $isPdf
                        ? 'Ukuran PDF maksimal 5 MB.'
                        : 'Ukuran gambar maksimal 1 MB.';
                }

                return $this->json($response, ['success' => false, 'message' => $msg], 400);
            }

            $extension = $validation['extension'];
            if ($extension === 'pdf' && ($validation['size'] ?? 0) > 5 * 1024 * 1024) {
                return $this->json($response, ['success' => false, 'message' => 'Ukuran PDF maksimal 5 MB.'], 400);
            }
            if ($extension !== 'pdf' && ($validation['size'] ?? 0) > 1024 * 1024) {
                return $this->json($response, ['success' => false, 'message' => 'Ukuran gambar maksimal 1 MB.'], 400);
            }
            $fileName = uniqid('pengajuan_' . $id . '_KK_Santri_', true) . '.' . $extension;
            $uploadDir = $this->getSantriUploadDir();
            $filePath = $uploadDir . DIRECTORY_SEPARATOR . $fileName;
            $relativePath = 'uploads/santri/' . $fileName;

            $file->moveTo($filePath);
            $postCheck = FileUploadValidator::validateMovedFile($filePath, $extension);
            if (!$postCheck['success']) {
                @unlink($filePath);

                return $this->json($response, ['success' => false, 'message' => $postCheck['message']], 400);
            }

            $originalName = $file->getClientFilename() ?: $fileName;
            $fileType = $postCheck['mime'] ?? $validation['mime'];
            $finalSize = filesize($filePath) ?: 0;

            $namaPemohon = (string) ($row['nama'] ?? '');
            $nik = (string) ($row['nik'] ?? '');
            $noWaPemohon = (string) ($row['no_wa'] ?? '');
            $noWa62 = NisPengajuanHelper::normalizeNoWaTo62($noWaPemohon);
            if ($noWa62 === null) {
                @unlink($filePath);

                return $this->json($response, [
                    'success' => false,
                    'message' => 'Nomor WhatsApp pengajuan tidak valid. Hubungi admin.',
                ], 400);
            }

            $upd = $this->db->prepare(
                "UPDATE mybeddian___nis_pengajuan SET
                    path_file = ?, nama_file = ?, tipe_file = ?, ukuran_file = ?,
                    status = ?, updated_at = NOW()
                 WHERE id = ?"
            );
            $upd->execute([
                $relativePath,
                $originalName,
                $fileType,
                $finalSize,
                NisPengajuanHelper::STATUS_MENUNGGU_WA,
                $id,
            ]);

            $prep = $this->createPengajuanNisWaPrepare($id, $noWa62, $namaPemohon, $nik);

            return $this->json($response, [
                'success' => true,
                'message' => 'KK berhasil diunggah. Buka WhatsApp, kirim pesan berisi token, '
                    . 'lalu tunggu balasan bot. Setelah itu pengajuan masuk antrean admin.',
                'wa_me_url' => $prep['wa_me_url'],
                'wa_message' => $prep['wa_message'],
                'expires_in_minutes' => $prep['expires_in_minutes'],
                'data' => [
                    'id' => $id,
                    'status' => NisPengajuanHelper::STATUS_MENUNGGU_WA,
                ],
            ]);
        } catch (\Throwable $e) {
            error_log('MybeddianNisPengajuanController::uploadKk ' . $e->getMessage());

            return $this->json($response, ['success' => false, 'message' => 'Terjadi kesalahan'], 500);
        }
    }

    /**
     * POST /api/mybeddian/v2/auth/tambah-akses-saudara-pengajuan (auth)
     * NIS sudah tertaut akun lain: ajukan akses saudara dengan NIK + unggah KK (antrean admin).
     * Multipart: nis, nik, file
     */
    public function createTambahAksesSaudara(Request $request, Response $response): Response
    {
        try {
            $payload = $request->getAttribute('user');
            $payloadArr = is_array($payload) ? $payload : [];
            $usersId = isset($payloadArr['users_id']) && (int) $payloadArr['users_id'] > 0
                ? (int) $payloadArr['users_id']
                : (isset($payloadArr['user_id']) ? (int) $payloadArr['user_id'] : 0);
            if ($usersId < 1) {
                return $this->json($response, ['success' => false, 'message' => 'Sesi tidak valid. Login ulang.'], 401);
            }

            $body = $request->getParsedBody();
            $body = is_array($body) ? TextSanitizer::sanitizeMybeddianAuthBody($body) : [];
            $nis = trim((string) ($body['nis'] ?? ''));
            $nikRaw = trim((string) ($body['nik'] ?? ''));
            if ($nis === '' || $nikRaw === '') {
                return $this->json($response, ['success' => false, 'message' => 'NIS dan NIK harus diisi'], 400);
            }

            $nikValidation = NikHelper::validate($nikRaw);
            if (!$nikValidation['valid']) {
                return $this->json($response, ['success' => false, 'message' => $nikValidation['message']], 400);
            }
            $nik = $nikValidation['normalized'];

            $stmtU = $this->db->prepare('SELECT id, no_wa FROM users WHERE id = ? LIMIT 1');
            $stmtU->execute([$usersId]);
            $userRow = $stmtU->fetch(\PDO::FETCH_ASSOC);
            if (!$userRow) {
                return $this->json($response, ['success' => false, 'message' => 'Akun tidak ditemukan'], 401);
            }
            $noWa62 = NisPengajuanHelper::normalizeNoWaTo62((string) ($userRow['no_wa'] ?? ''));
            if ($noWa62 === null) {
                return $this->json($response, [
                    'success' => false,
                    'message' => 'Nomor WhatsApp akun tidak valid. Perbarui nomor di profil terlebih dahulu.',
                ], 400);
            }

            $santriId = SantriHelper::resolveId($this->db, $nis);
            if ($santriId === null) {
                return $this->json($response, ['success' => false, 'message' => 'NIS tidak ditemukan'], 404);
            }

            $stmt = $this->db->prepare(
                'SELECT id, nama, nik, tanggal_lahir, id_user, nis FROM santri WHERE id = ? LIMIT 1'
            );
            $stmt->execute([$santriId]);
            $santri = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$santri) {
                return $this->json($response, ['success' => false, 'message' => 'Data santri tidak ditemukan'], 404);
            }

            $bound = isset($santri['id_user']) && $santri['id_user'] !== null && $santri['id_user'] !== ''
                ? (int) $santri['id_user']
                : 0;
            if ($bound === $usersId) {
                return $this->json($response, [
                    'success' => false,
                    'code' => 'already_on_this_account',
                    'message' => 'NIS ini sudah ada di akun Anda.',
                ], 400);
            }
            if ($bound < 1) {
                return $this->json($response, [
                    'success' => false,
                    'message' => 'NIS ini belum tertaut akun. Gunakan form Tambah akses biasa (verifikasi WhatsApp).',
                ], 400);
            }

            $nikDbNorm = NikHelper::normalize((string) ($santri['nik'] ?? ''));
            if ($nikDbNorm === null || $nikDbNorm === '' || $nikDbNorm !== $nik) {
                return $this->json($response, [
                    'success' => false,
                    'message' => 'NIK tidak sesuai dengan data santri. Pastikan NIK saudara yang benar.',
                ], 400);
            }

            $pending = NisPengajuanHelper::findPendingPengajuan($this->db, $nik, $noWa62);
            if ($pending !== null) {
                $pendingStatus = (string) ($pending['status'] ?? '');
                if (in_array($pendingStatus, [
                    NisPengajuanHelper::STATUS_MENUNGGU_KK,
                    NisPengajuanHelper::STATUS_MENUNGGU_WA,
                    NisPengajuanHelper::STATUS_MENUNGGU_REVIEW,
                ], true)) {
                    return $this->json($response, [
                        'success' => false,
                        'message' => 'Pengajuan untuk NIK/WhatsApp ini sedang diproses. Tunggu hasil review admin.',
                        'data' => ['id' => (int) ($pending['id'] ?? 0)],
                    ], 400);
                }
            }

            $uploadedFiles = $request->getUploadedFiles();
            if (empty($uploadedFiles['file'])) {
                return $this->json($response, ['success' => false, 'message' => 'File Kartu Keluarga (KK) wajib diunggah'], 400);
            }
            $file = $uploadedFiles['file'];
            $allowedExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf'];
            $clientName = (string) ($file->getClientFilename() ?? '');
            $clientExt = strtolower(pathinfo($clientName, PATHINFO_EXTENSION));
            $clientMime = strtolower((string) ($file->getClientMediaType() ?? ''));
            $isPdf = $clientExt === 'pdf' || $clientMime === 'application/pdf';
            $maxSize = $isPdf ? (5 * 1024 * 1024) : (1024 * 1024);
            $validation = FileUploadValidator::validate($file, $allowedExtensions, $maxSize);
            if (!$validation['success']) {
                $msg = $validation['message'] ?? 'File tidak valid';
                if (stripos((string) $msg, 'ukuran') !== false || stripos((string) $msg, 'size') !== false) {
                    $msg = $isPdf
                        ? 'Ukuran PDF maksimal 5 MB.'
                        : 'Ukuran gambar maksimal 1 MB.';
                }

                return $this->json($response, ['success' => false, 'message' => $msg], 400);
            }

            $extension = $validation['extension'];
            $ttlRaw = (string) ($santri['tanggal_lahir'] ?? '');
            $ttl = preg_match('/^\d{4}-\d{2}-\d{2}/', $ttlRaw) ? substr($ttlRaw, 0, 10) : '2000-01-01';
            $namaSantri = trim((string) ($santri['nama'] ?? ''));
            if ($namaSantri === '') {
                $namaSantri = 'Santri';
            }
            $namaPengajuan = '[Tambah akses] ' . $namaSantri;

            $this->db->beginTransaction();
            try {
                $ins = $this->db->prepare(
                    'INSERT INTO mybeddian___nis_pengajuan
                        (nama, nik, tanggal_lahir, no_wa, id_santri, status)
                     VALUES (?, ?, ?, ?, ?, ?)'
                );
                $ins->execute([
                    $namaPengajuan,
                    $nik,
                    $ttl,
                    $noWa62,
                    $santriId,
                    NisPengajuanHelper::STATUS_MENUNGGU_KK,
                ]);
                $id = (int) $this->db->lastInsertId();

                $fileName = uniqid('pengajuan_' . $id . '_KK_Santri_', true) . '.' . $extension;
                $uploadDir = $this->getSantriUploadDir();
                $filePath = $uploadDir . DIRECTORY_SEPARATOR . $fileName;
                $relativePath = 'uploads/santri/' . $fileName;
                $file->moveTo($filePath);
                $postCheck = FileUploadValidator::validateMovedFile($filePath, $extension);
                if (!$postCheck['success']) {
                    @unlink($filePath);
                    throw new \RuntimeException($postCheck['message'] ?? 'File tidak valid setelah diunggah');
                }

                $originalName = $file->getClientFilename() ?: $fileName;
                $fileType = $postCheck['mime'] ?? $validation['mime'];
                $finalSize = filesize($filePath) ?: 0;

                $upd = $this->db->prepare(
                    "UPDATE mybeddian___nis_pengajuan SET
                        path_file = ?, nama_file = ?, tipe_file = ?, ukuran_file = ?,
                        status = ?, updated_at = NOW()
                     WHERE id = ?"
                );
                $upd->execute([
                    $relativePath,
                    $originalName,
                    $fileType,
                    $finalSize,
                    NisPengajuanHelper::STATUS_MENUNGGU_REVIEW,
                    $id,
                ]);

                $this->db->commit();
            } catch (\Throwable $e) {
                if ($this->db->inTransaction()) {
                    $this->db->rollBack();
                }
                throw $e;
            }

            $nikMasked = NisPengajuanWaHelper::maskNik($nik);
            $lembagaId = NisPengajuanHelper::resolveLembagaIdForSantri($this->db, $santriId);
            $this->sendAdminNotifWa($id, $namaPengajuan, $nikMasked, $lembagaId);
            $this->sendPemohonReviewNotifWa($id, $namaPengajuan, $noWa62);

            return $this->json($response, [
                'success' => true,
                'message' => 'Pengajuan akses saudara terkirim. Admin akan meninjau Kartu Keluarga Anda.',
                'data' => [
                    'id' => $id,
                    'status' => NisPengajuanHelper::STATUS_MENUNGGU_REVIEW,
                    'nis' => (string) ($santri['nis'] ?? $nis),
                    'nama' => $namaSantri,
                ],
            ]);
        } catch (\Throwable $e) {
            error_log('MybeddianNisPengajuanController::createTambahAksesSaudara ' . $e->getMessage());

            return $this->json($response, ['success' => false, 'message' => 'Terjadi kesalahan'], 500);
        }
    }

    /**
     * POST /api/mybeddian/v2/auth/nis-pengajuan/{id}/prepare-wa
     * Regenerasi tautan WA jika token kedaluwarsa (status menunggu_wa).
     */
    public function prepareWa(Request $request, Response $response, array $args): Response
    {
        try {
            $id = (int) ($args['id'] ?? 0);
            if ($id < 1) {
                return $this->json($response, ['success' => false, 'message' => 'ID tidak valid'], 400);
            }

            $stmt = $this->db->prepare('SELECT * FROM mybeddian___nis_pengajuan WHERE id = ? LIMIT 1');
            $stmt->execute([$id]);
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$row) {
                return $this->json($response, ['success' => false, 'message' => 'Pengajuan tidak ditemukan'], 404);
            }
            if ((string) ($row['status'] ?? '') !== NisPengajuanHelper::STATUS_MENUNGGU_WA) {
                return $this->json($response, [
                    'success' => false,
                    'message' => 'Pengajuan tidak menunggu konfirmasi WhatsApp.',
                ], 400);
            }
            if (empty($row['path_file'])) {
                return $this->json($response, [
                    'success' => false,
                    'message' => 'Berkas KK belum ada. Unggah KK terlebih dahulu.',
                ], 400);
            }

            $namaPemohon = (string) ($row['nama'] ?? '');
            $nik = (string) ($row['nik'] ?? '');
            $noWa62 = NisPengajuanHelper::normalizeNoWaTo62((string) ($row['no_wa'] ?? ''));
            if ($noWa62 === null) {
                return $this->json($response, ['success' => false, 'message' => 'Nomor WhatsApp tidak valid'], 400);
            }

            $prep = $this->createPengajuanNisWaPrepare($id, $noWa62, $namaPemohon, $nik);

            return $this->json($response, [
                'success' => true,
                'message' => 'Buka WhatsApp, kirim pesan berisi token, lalu tunggu balasan bot.',
                'wa_me_url' => $prep['wa_me_url'],
                'wa_message' => $prep['wa_message'],
                'expires_in_minutes' => $prep['expires_in_minutes'],
                'data' => [
                    'id' => $id,
                    'nama' => $namaPemohon,
                    'no_wa' => (string) ($row['no_wa'] ?? ''),
                    'status' => NisPengajuanHelper::STATUS_MENUNGGU_WA,
                ],
            ]);
        } catch (\Throwable $e) {
            error_log('MybeddianNisPengajuanController::prepareWa ' . $e->getMessage());

            return $this->json($response, ['success' => false, 'message' => 'Terjadi kesalahan'], 500);
        }
    }

    /**
     * @return array{wa_me_url: string, wa_message: string, expires_in_minutes: int}
     */
    private function createPengajuanNisWaPrepare(int $pengajuanId, string $noWa62, string $nama, string $nik): array
    {
        if (!MybeddianAuthWaHelper::tableExists($this->db)) {
            throw new \RuntimeException('Tabel mybeddian_auth_wa_tokens belum ada. Jalankan phinx migrate.');
        }

        return MybeddianAuthWaHelper::createPrepare(
            $this->db,
            MybeddianAuthWaHelper::PURPOSE_PENGAJUAN_NIS,
            'santri',
            $noWa62,
            [
                'pengajuan_id' => $pengajuanId,
                'nama' => $nama,
                'nik' => $nik,
                'no_wa' => $noWa62,
            ],
            MybeddianAuthWaHelper::purposeTitle(MybeddianAuthWaHelper::PURPOSE_PENGAJUAN_NIS),
            [
                'Mode: santri',
                'Nama: ' . $nama,
                'NIK: ' . $nik,
                'Nomor WA: ' . $noWa62,
            ]
        );
    }

    /**
     * GET /api/pendaftaran/nis-pengajuan
     */
    public function listStaff(Request $request, Response $response): Response
    {
        try {
            $params = $request->getQueryParams();
            $status = isset($params['status']) ? trim((string) $params['status']) : '';
            $sql = 'SELECT p.*, s.nis AS santri_nis, s.nama AS santri_nama_db
                FROM mybeddian___nis_pengajuan p
                LEFT JOIN santri s ON s.id = p.id_santri';
            $bind = [];
            if ($status !== '' && in_array($status, [
                NisPengajuanHelper::STATUS_MENUNGGU_KK,
                NisPengajuanHelper::STATUS_MENUNGGU_WA,
                NisPengajuanHelper::STATUS_MENUNGGU_REVIEW,
                NisPengajuanHelper::STATUS_SELESAI,
                NisPengajuanHelper::STATUS_DITOLAK,
            ], true)) {
                $sql .= ' WHERE p.status = ?';
                $bind[] = $status;
            } else {
                $sql .= " WHERE p.status IN ('menunggu_review', 'menunggu_wa', 'menunggu_kk')";
            }
            $sql .= ' ORDER BY p.created_at DESC LIMIT 500';
            $stmt = $this->db->prepare($sql);
            $stmt->execute($bind);
            $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);

            $base = rtrim((string) ($request->getUri()->getScheme() . '://' . $request->getUri()->getHost()), '/');
            $items = [];
            foreach ($rows as $r) {
                $items[] = $this->mapPengajuanRow($r, $base);
            }

            return $this->json($response, ['success' => true, 'data' => ['items' => $items]]);
        } catch (\Throwable $e) {
            error_log('MybeddianNisPengajuanController::listStaff ' . $e->getMessage());

            return $this->json($response, ['success' => false, 'message' => 'Terjadi kesalahan'], 500);
        }
    }

    /**
     * GET /api/pendaftaran/nis-pengajuan/{id}
     */
    public function getStaff(Request $request, Response $response, array $args): Response
    {
        try {
            $id = (int) ($args['id'] ?? 0);
            $row = $this->fetchPengajuanRow($id);
            if ($row === null) {
                return $this->json($response, ['success' => false, 'message' => 'Tidak ditemukan'], 404);
            }
            $base = rtrim((string) ($request->getUri()->getScheme() . '://' . $request->getUri()->getHost()), '/');

            return $this->json($response, [
                'success' => true,
                'data' => $this->mapPengajuanRow($row, $base),
            ]);
        } catch (\Throwable $e) {
            error_log('MybeddianNisPengajuanController::getStaff ' . $e->getMessage());

            return $this->json($response, ['success' => false, 'message' => 'Terjadi kesalahan'], 500);
        }
    }

    /**
     * PATCH /api/pendaftaran/nis-pengajuan/{id}
     */
    public function patchStaff(Request $request, Response $response, array $args): Response
    {
        try {
            if (!$this->userCanEdit($request)) {
                return $this->json($response, ['success' => false, 'message' => 'Tidak berwenang'], 403);
            }

            $id = (int) ($args['id'] ?? 0);
            $row = $this->fetchPengajuanRow($id);
            if ($row === null) {
                return $this->json($response, ['success' => false, 'message' => 'Tidak ditemukan'], 404);
            }

            $body = $request->getParsedBody();
            $body = is_array($body) ? TextSanitizer::sanitizeMybeddianAuthBody($body) : [];

            $sets = [];
            $bind = [];

            if (isset($body['nama'])) {
                $namaVal = TextSanitizer::validatePersonName($body['nama'] ?? '');
                if ($namaVal['error'] !== null) {
                    return $this->json($response, ['success' => false, 'message' => $namaVal['error']], 400);
                }
                if ($namaVal['text'] !== '') {
                    $sets[] = 'nama = ?';
                    $bind[] = $namaVal['text'];
                }
            }
            if (isset($body['nik'])) {
                $nikVal = NikHelper::validate(trim((string) $body['nik']));
                if (!$nikVal['valid']) {
                    return $this->json($response, ['success' => false, 'message' => $nikVal['message']], 400);
                }
                $sets[] = 'nik = ?';
                $bind[] = $nikVal['normalized'];
            }
            if (isset($body['tanggal_lahir'])) {
                $tgl = trim((string) $body['tanggal_lahir']);
                $ts = strtotime($tgl);
                if ($ts === false) {
                    return $this->json($response, ['success' => false, 'message' => 'Tanggal lahir tidak valid'], 400);
                }
                $sets[] = 'tanggal_lahir = ?';
                $bind[] = date('Y-m-d', $ts);
            }
            if (array_key_exists('id_santri', $body)) {
                $idSantri = $body['id_santri'];
                if ($idSantri === null || $idSantri === '') {
                    $sets[] = 'id_santri = NULL';
                } else {
                    $resolved = SantriHelper::resolveId($this->db, $idSantri);
                    if ($resolved === null) {
                        return $this->json($response, ['success' => false, 'message' => 'Santri tidak ditemukan'], 404);
                    }
                    $sets[] = 'id_santri = ?';
                    $bind[] = $resolved;
                }
            }
            if (isset($body['status'])) {
                $st = trim((string) $body['status']);
                if (!in_array($st, [
                    NisPengajuanHelper::STATUS_MENUNGGU_KK,
                    NisPengajuanHelper::STATUS_MENUNGGU_WA,
                    NisPengajuanHelper::STATUS_MENUNGGU_REVIEW,
                    NisPengajuanHelper::STATUS_SELESAI,
                    NisPengajuanHelper::STATUS_DITOLAK,
                ], true)) {
                    return $this->json($response, ['success' => false, 'message' => 'Status tidak valid'], 400);
                }
                $sets[] = 'status = ?';
                $bind[] = $st;
            }

            if ($sets === []) {
                return $this->json($response, ['success' => false, 'message' => 'Tidak ada perubahan'], 400);
            }

            $bind[] = $id;
            $sql = 'UPDATE mybeddian___nis_pengajuan SET ' . implode(', ', $sets) . ', updated_at = NOW() WHERE id = ?';
            $stmt = $this->db->prepare($sql);
            $stmt->execute($bind);

            $updated = $this->fetchPengajuanRow($id);
            $base = rtrim((string) ($request->getUri()->getScheme() . '://' . $request->getUri()->getHost()), '/');

            return $this->json($response, [
                'success' => true,
                'data' => $this->mapPengajuanRow($updated, $base),
            ]);
        } catch (\Throwable $e) {
            error_log('MybeddianNisPengajuanController::patchStaff ' . $e->getMessage());

            return $this->json($response, ['success' => false, 'message' => 'Terjadi kesalahan'], 500);
        }
    }

    /**
     * GET /api/pendaftaran/nis-pengajuan/{id}/kk
     */
    public function serveKk(Request $request, Response $response, array $args): Response
    {
        try {
            $id = (int) ($args['id'] ?? 0);
            $row = $this->fetchPengajuanRow($id);
            if ($row === null || empty($row['path_file'])) {
                return $response->withStatus(404);
            }

            $abs = $this->resolveFilePath((string) $row['path_file']);
            if (!is_file($abs)) {
                return $response->withStatus(404);
            }

            $mime = (string) ($row['tipe_file'] ?? 'application/octet-stream');
            if ($mime === '' || $mime === 'application/octet-stream') {
                $detected = mime_content_type($abs);
                if (is_string($detected) && $detected !== '') {
                    $mime = $detected;
                }
            }
            $response->getBody()->write((string) file_get_contents($abs));

            return $response
                ->withHeader('Content-Type', $mime)
                ->withHeader('Content-Disposition', 'inline; filename="' . basename($abs) . '"');
        } catch (\Throwable $e) {
            error_log('MybeddianNisPengajuanController::serveKk ' . $e->getMessage());

            return $response->withStatus(500);
        }
    }

    /**
     * POST /api/pendaftaran/nis-pengajuan/{id}/tolak
     * Body: { "kirim_wa": true|false } — opsional kirim pesan WA ke pemohon.
     */
    public function tolakPengajuan(Request $request, Response $response, array $args): Response
    {
        try {
            if (!$this->userCanEdit($request)) {
                return $this->json($response, ['success' => false, 'message' => 'Tidak berwenang'], 403);
            }

            $id = (int) ($args['id'] ?? 0);
            $row = $this->fetchPengajuanRow($id);
            if ($row === null) {
                return $this->json($response, ['success' => false, 'message' => 'Tidak ditemukan'], 404);
            }

            $status = (string) ($row['status'] ?? '');
            if ($status === NisPengajuanHelper::STATUS_SELESAI) {
                return $this->json($response, [
                    'success' => false,
                    'message' => 'Pengajuan sudah selesai (NIS terkirim).',
                ], 400);
            }
            if ($status === NisPengajuanHelper::STATUS_DITOLAK) {
                return $this->json($response, [
                    'success' => false,
                    'message' => 'Pengajuan sudah berstatus ditolak.',
                ], 400);
            }

            $body = $request->getParsedBody();
            $body = is_array($body) ? $body : [];
            $kirimWa = !array_key_exists('kirim_wa', $body) || filter_var($body['kirim_wa'], FILTER_VALIDATE_BOOLEAN);

            $noWa = trim((string) ($row['no_wa'] ?? ''));
            if ($kirimWa && $noWa === '') {
                return $this->json($response, [
                    'success' => false,
                    'message' => 'Nomor WA pemohon kosong. Nonaktifkan «Kirim pesan» atau isi nomor WA pemohon.',
                ], 400);
            }

            $nama = (string) ($row['nama'] ?? 'Santri');
            $user = $request->getAttribute('user');
            $userArr = is_array($user) ? $user : [];
            $idPengurus = RoleHelper::getPengurusIdFromPayload($userArr) ?? 0;

            if ($kirimWa) {
                $message = NisPengajuanWaHelper::buildPemohonDitolakMessage($nama);
                $message = TextSanitizer::cleanMultilineMessage($message);

                WhatsAppService::wakeWaServerThrottled(60);
                $sendResult = WhatsAppService::sendMessage($noWa, $message, null, [
                    'kategori' => 'nis_pengajuan_tolak',
                    'tujuan' => 'pemohon_nis_tolak',
                    'id_pengajuan' => $id,
                    'id_santri' => isset($row['id_santri']) ? (int) $row['id_santri'] : null,
                    'id_pengurus_pengirim' => $idPengurus > 0 ? $idPengurus : null,
                    'sumber' => 'ebeddien',
                ]);

                if (empty($sendResult['success']) || WhatsAppService::deliveryWasNotActuallySent($sendResult)) {
                    $failMsg = trim((string) ($sendResult['message'] ?? ''));
                    if ($failMsg === '') {
                        $failMsg = 'Gagal mengirim WhatsApp ke pemohon.';
                    }

                    return $this->json($response, [
                        'success' => false,
                        'message' => $failMsg,
                        'code' => 'wa_not_delivered',
                    ], 500);
                }
            }

            $upd = $this->db->prepare(
                "UPDATE mybeddian___nis_pengajuan SET
                    status = ?, id_pengurus_selesai = ?, updated_at = NOW()
                 WHERE id = ?"
            );
            $upd->execute([
                NisPengajuanHelper::STATUS_DITOLAK,
                $idPengurus > 0 ? $idPengurus : null,
                $id,
            ]);

            $updated = $this->fetchPengajuanRow($id);
            $base = rtrim((string) ($request->getUri()->getScheme() . '://' . $request->getUri()->getHost()), '/');

            return $this->json($response, [
                'success' => true,
                'message' => $kirimWa
                    ? 'Pengajuan ditolak dan pesan WhatsApp terkirim ke pemohon.'
                    : 'Pengajuan ditolak tanpa mengirim WhatsApp.',
                'data' => $this->mapPengajuanRow($updated, $base),
            ]);
        } catch (\Throwable $e) {
            error_log('MybeddianNisPengajuanController::tolakPengajuan ' . $e->getMessage());

            return $this->json($response, ['success' => false, 'message' => 'Terjadi kesalahan'], 500);
        }
    }

    /**
     * POST /api/pendaftaran/nis-pengajuan/{id}/kirim-nis
     */
    public function kirimNis(Request $request, Response $response, array $args): Response
    {
        try {
            if (!$this->userCanKirimNis($request)) {
                return $this->json($response, ['success' => false, 'message' => 'Tidak berwenang'], 403);
            }

            $id = (int) ($args['id'] ?? 0);
            $row = $this->fetchPengajuanRow($id);
            if ($row === null) {
                return $this->json($response, ['success' => false, 'message' => 'Tidak ditemukan'], 404);
            }

            $noWa = (string) ($row['no_wa'] ?? '');
            if ($noWa === '') {
                return $this->json($response, ['success' => false, 'message' => 'Nomor WA pemohon kosong'], 400);
            }

            $nis = '';
            $alreadyRegistered = false;
            $idSantri = isset($row['id_santri']) ? (int) $row['id_santri'] : 0;

            if ($idSantri > 0) {
                $stmt = $this->db->prepare('SELECT id, nama, nis, id_user FROM santri WHERE id = ? LIMIT 1');
                $stmt->execute([$idSantri]);
                $santri = $stmt->fetch(\PDO::FETCH_ASSOC);
                if ($santri) {
                    $nis = NisPengajuanHelper::formatNisForDisplay($santri);
                    $alreadyRegistered = !empty($santri['id_user']);
                }
            }

            if ($nis === '') {
                $found = NisPengajuanHelper::findSantriByIdentity(
                    $this->db,
                    (string) $row['nik'],
                    (string) $row['tanggal_lahir'],
                    (string) $row['nama']
                );
                if ($found['matched'] && !empty($found['santri'])) {
                    $nis = NisPengajuanHelper::formatNisForDisplay($found['santri']);
                    $alreadyRegistered = !empty($found['santri']['id_user']);
                    if ($idSantri < 1) {
                        $idSantri = (int) $found['santri']['id'];
                        $upd = $this->db->prepare('UPDATE mybeddian___nis_pengajuan SET id_santri = ? WHERE id = ?');
                        $upd->execute([$idSantri, $id]);
                    }
                }
            }

            if ($nis === '') {
                return $this->json($response, [
                    'success' => false,
                    'message' => 'NIS belum dapat ditentukan. Tautkan santri atau perbaiki data pemohon.',
                ], 400);
            }

            $nama = (string) ($row['nama'] ?? 'Santri');
            $message = NisPengajuanWaHelper::buildNisToPemohonMessage($nama, $nis, $alreadyRegistered);
            $message = TextSanitizer::cleanMultilineMessage($message);

            $user = $request->getAttribute('user');
            $userArr = is_array($user) ? $user : [];
            $idPengurus = RoleHelper::getPengurusIdFromPayload($userArr) ?? 0;

            WhatsAppService::wakeWaServerThrottled(60);
            $sendResult = WhatsAppService::sendMessage($noWa, $message, null, [
                'kategori' => 'nis_pengajuan_kirim',
                'tujuan' => 'pemohon_nis',
                'id_pengajuan' => $id,
                'id_santri' => $idSantri > 0 ? $idSantri : null,
                'id_pengurus_pengirim' => $idPengurus > 0 ? $idPengurus : null,
                'sumber' => 'ebeddien',
            ]);

            if (empty($sendResult['success']) || WhatsAppService::deliveryWasNotActuallySent($sendResult)) {
                $failMsg = trim((string) ($sendResult['message'] ?? ''));
                if ($failMsg === '') {
                    $failMsg = 'Gagal mengirim WhatsApp ke pemohon.';
                }

                return $this->json($response, [
                    'success' => false,
                    'message' => $failMsg,
                    'code' => 'wa_not_delivered',
                ], 500);
            }

            $upd = $this->db->prepare(
                "UPDATE mybeddian___nis_pengajuan SET
                    status = ?, nis_dikirim_at = NOW(), id_pengurus_selesai = ?, updated_at = NOW()
                 WHERE id = ?"
            );
            $upd->execute([
                NisPengajuanHelper::STATUS_SELESAI,
                $idPengurus > 0 ? $idPengurus : null,
                $id,
            ]);

            $rowAfter = $this->fetchPengajuanRow($id);
            $idSantriAfter = $rowAfter !== null && isset($rowAfter['id_santri']) ? (int) $rowAfter['id_santri'] : 0;
            $canSyncKk = $rowAfter !== null
                && !empty($rowAfter['path_file'])
                && $idSantriAfter > 0;

            return $this->json($response, [
                'success' => true,
                'message' => 'NIS telah dikirim ke WhatsApp pemohon.',
                'data' => [
                    'nis' => $nis,
                    'id_santri' => $idSantriAfter > 0 ? $idSantriAfter : null,
                    'can_sync_kk' => $canSyncKk,
                ],
            ]);
        } catch (\Throwable $e) {
            error_log('MybeddianNisPengajuanController::kirimNis ' . $e->getMessage());

            return $this->json($response, ['success' => false, 'message' => 'Terjadi kesalahan'], 500);
        }
    }

    public function sendAdminNotifWa(int $pengajuanId, string $namaPemohon, string $nikMasked, ?string $lembagaId): void
    {
        try {
            $config = require __DIR__ . '/../../config.php';
            $wa = trim((string) (($config['security'] ?? [])['nis_pengajuan_alert_wa'] ?? ''));
            if ($wa === '') {
                return;
            }
            WhatsAppService::wakeWaServer();
            $message = NisPengajuanWaHelper::buildAdminNotifMessage($namaPemohon, $nikMasked, $pengajuanId);
            $message = TextSanitizer::cleanMultilineMessage($message);
            WhatsAppService::sendMessage($wa, $message, null, [
                'kategori' => 'nis_pengajuan_admin_notif',
                'tujuan' => 'admin',
                'id_pengajuan' => $pengajuanId,
                'sumber' => 'mybeddian',
            ]);
        } catch (\Throwable $e) {
            error_log('MybeddianNisPengajuanController::sendAdminNotifWa ' . $e->getMessage());
        }
    }

    public function sendPemohonReviewNotifWa(int $pengajuanId, string $namaPemohon, string $noWaPemohon): void
    {
        try {
            $noWa = trim($noWaPemohon);
            if ($noWa === '') {
                return;
            }
            $config = require __DIR__ . '/../../config.php';
            $adminContact = trim((string) (($config['security'] ?? [])['nis_pengajuan_pemohon_contact_wa'] ?? '08223299991'));
            WhatsAppService::wakeWaServer();
            $payload = NisPengajuanWaHelper::buildPemohonDiterimaReviewPayload(
                $namaPemohon,
                $adminContact,
                null,
                $this->db,
                $noWa
            );
            $payload = TextSanitizer::cleanMultilineMessage($payload);
            WhatsAppInboundService::sendAutomatedReplyText(
                $noWa,
                $payload,
                [
                    'kategori' => 'nis_pengajuan_pemohon_diterima',
                    'tujuan' => 'pemohon_review',
                    'id_pengajuan' => $pengajuanId,
                    'sumber' => 'mybeddian',
                ],
                null,
                'nis_pengajuan_pemohon_diterima'
            );
        } catch (\Throwable $e) {
            error_log('MybeddianNisPengajuanController::sendPemohonReviewNotifWa ' . $e->getMessage());
        }
    }

    /**
     * GET /api/pendaftaran/nis-pengajuan/{id}/kk-berkas-info
     */
    public function getKkBerkasInfo(Request $request, Response $response, array $args): Response
    {
        try {
            if (!$this->userCanEdit($request)) {
                return $this->json($response, ['success' => false, 'message' => 'Tidak berwenang'], 403);
            }

            $id = (int) ($args['id'] ?? 0);
            $row = $this->fetchPengajuanRow($id);
            if ($row === null) {
                return $this->json($response, ['success' => false, 'message' => 'Tidak ditemukan'], 404);
            }

            $idSantri = isset($row['id_santri']) ? (int) $row['id_santri'] : 0;
            $canSync = $idSantri > 0 && !empty($row['path_file']);
            $existingRow = $idSantri > 0 ? $this->fetchKkBerkasRow($idSantri) : null;
            $hasExistingFile = $this->berkasRowHasFile($existingRow);
            $pathPengajuan = trim((string) ($row['path_file'] ?? ''));
            $pathExisting = $existingRow !== null ? trim((string) ($existingRow['path_file'] ?? '')) : '';

            return $this->json($response, [
                'success' => true,
                'data' => [
                    'can_sync' => $canSync,
                    'can_sync_biodata' => $idSantri > 0,
                    'id_santri' => $idSantri > 0 ? $idSantri : null,
                    'jenis_berkas' => self::JENIS_KK_SANTRI,
                    'has_existing_file' => $hasExistingFile,
                    'same_path' => $hasExistingFile && $pathPengajuan !== '' && $pathPengajuan === $pathExisting,
                    'pengajuan' => [
                        'nama_file' => (string) ($row['nama_file'] ?? ''),
                        'tipe_file' => (string) ($row['tipe_file'] ?? ''),
                        'ukuran_file' => isset($row['ukuran_file']) ? (int) $row['ukuran_file'] : null,
                    ],
                    'existing' => $this->mapKkBerkasForApi($existingRow),
                    'biodata' => $this->buildBiodataSyncInfo($row, $idSantri),
                ],
            ]);
        } catch (\Throwable $e) {
            error_log('MybeddianNisPengajuanController::getKkBerkasInfo ' . $e->getMessage());

            return $this->json($response, ['success' => false, 'message' => 'Terjadi kesalahan'], 500);
        }
    }

    /**
     * POST /api/pendaftaran/nis-pengajuan/{id}/sync-kk-berkas
     * Body: { "action": "save"|"overwrite"|"skip"|"biodata_only", "sync_biodata": bool }
     */
    public function syncKkBerkas(Request $request, Response $response, array $args): Response
    {
        try {
            if (!$this->userCanEdit($request)) {
                return $this->json($response, ['success' => false, 'message' => 'Tidak berwenang'], 403);
            }

            $id = (int) ($args['id'] ?? 0);
            $row = $this->fetchPengajuanRow($id);
            if ($row === null) {
                return $this->json($response, ['success' => false, 'message' => 'Tidak ditemukan'], 404);
            }

            $body = $request->getParsedBody();
            $body = is_array($body) ? $body : [];
            $action = strtolower(trim((string) ($body['action'] ?? '')));
            if (!in_array($action, ['save', 'overwrite', 'skip', 'biodata_only'], true)) {
                return $this->json($response, ['success' => false, 'message' => 'Aksi tidak valid'], 400);
            }

            $idSantri = isset($row['id_santri']) ? (int) $row['id_santri'] : 0;
            if ($idSantri < 1) {
                return $this->json($response, [
                    'success' => false,
                    'message' => 'Tautkan santri terlebih dahulu.',
                ], 400);
            }

            $syncBiodata = array_key_exists('sync_biodata', $body)
                ? filter_var($body['sync_biodata'], FILTER_VALIDATE_BOOLEAN)
                : in_array($action, ['save', 'overwrite', 'biodata_only'], true);

            if ($action === 'skip') {
                $data = ['skipped' => true, 'biodata_synced' => false];
                $msg = 'Tidak ada perubahan ke santri.';
                if ($syncBiodata) {
                    $biodataErr = $this->applyPengajuanBiodataToSantri($row, $idSantri);
                    if ($biodataErr !== null) {
                        return $this->json($response, ['success' => false, 'message' => $biodataErr], 400);
                    }
                    $data['biodata_synced'] = true;
                    $msg = 'Data nama, NIK, dan tanggal lahir disalin ke biodata santri.';
                }

                return $this->json($response, [
                    'success' => true,
                    'message' => $msg,
                    'data' => $data,
                ]);
            }

            if ($action === 'biodata_only') {
                if (!$syncBiodata) {
                    return $this->json($response, ['success' => false, 'message' => 'Sinkron biodata tidak diaktifkan'], 400);
                }
                $biodataErr = $this->applyPengajuanBiodataToSantri($row, $idSantri);
                if ($biodataErr !== null) {
                    return $this->json($response, ['success' => false, 'message' => $biodataErr], 400);
                }

                return $this->json($response, [
                    'success' => true,
                    'message' => 'Data nama, NIK, dan tanggal lahir menimpa biodata santri.',
                    'data' => ['biodata_synced' => true],
                ]);
            }

            if (empty($row['path_file'])) {
                return $this->json($response, [
                    'success' => false,
                    'message' => 'File KK pengajuan tidak tersedia.',
                ], 400);
            }

            $existingRow = $this->fetchKkBerkasRow($idSantri);
            $hasExistingFile = $this->berkasRowHasFile($existingRow);
            if ($action === 'save' && $hasExistingFile) {
                return $this->json($response, [
                    'success' => false,
                    'message' => 'Berkas KK santri sudah ada. Pilih Timpa atau Lewati.',
                    'code' => 'kk_berkas_exists',
                ], 409);
            }

            $biodataSynced = false;
            if ($syncBiodata) {
                $biodataErr = $this->applyPengajuanBiodataToSantri($row, $idSantri);
                if ($biodataErr !== null) {
                    return $this->json($response, [
                        'success' => false,
                        'message' => $biodataErr,
                        'code' => 'biodata_nik_conflict',
                    ], 409);
                }
                $biodataSynced = true;
            }

            $user = $request->getAttribute('user');
            $userArr = is_array($user) ? $user : [];
            $idPengurus = RoleHelper::getPengurusIdFromPayload($userArr) ?? 0;

            $berkasId = $this->applyKkToSantriBerkas($id, $idPengurus > 0 ? $idPengurus : null);
            if ($berkasId === null) {
                return $this->json($response, ['success' => false, 'message' => 'Gagal menyimpan KK ke berkas santri'], 500);
            }

            $msg = $action === 'overwrite' ? 'KK pengajuan menimpa berkas KK santri.' : 'KK pengajuan disimpan ke berkas santri.';
            if ($biodataSynced) {
                $msg .= ' Data nama, NIK, dan tanggal lahir juga disalin ke biodata santri.';
            }

            return $this->json($response, [
                'success' => true,
                'message' => $msg,
                'data' => ['berkas_id' => $berkasId, 'biodata_synced' => $biodataSynced],
            ]);
        } catch (\PDOException $e) {
            error_log('MybeddianNisPengajuanController::syncKkBerkas PDO ' . $e->getMessage());
            if ($e->getCode() === '23000' || str_contains($e->getMessage(), '1062')) {
                return $this->json($response, [
                    'success' => false,
                    'message' => 'Data bentrok (mis. NIK sudah dipakai santri lain).',
                    'code' => 'db_integrity',
                ], 409);
            }

            return $this->json($response, ['success' => false, 'message' => 'Terjadi kesalahan database'], 500);
        } catch (\Throwable $e) {
            error_log('MybeddianNisPengajuanController::syncKkBerkas ' . $e->getMessage());

            return $this->json($response, ['success' => false, 'message' => 'Terjadi kesalahan'], 500);
        }
    }

    /**
     * @param array<string, mixed>|null $row
     */
    private function berkasRowHasFile(?array $row): bool
    {
        if ($row === null) {
            return false;
        }
        if (!empty($row['status_tidak_ada'])) {
            return false;
        }
        $path = trim((string) ($row['path_file'] ?? ''));

        return $path !== '' && $path !== '-';
    }

    /**
     * @return ?array<string, mixed>
     */
    private function fetchKkBerkasRow(int $idSantri): ?array
    {
        if ($idSantri < 1) {
            return null;
        }
        $stmt = $this->db->prepare(
            'SELECT * FROM santri___berkas WHERE id_santri = ? AND jenis_berkas = ? LIMIT 1'
        );
        $stmt->execute([$idSantri, self::JENIS_KK_SANTRI]);
        $row = $stmt->fetch(\PDO::FETCH_ASSOC);

        return $row ?: null;
    }

    /**
     * @param array<string, mixed>|null $row
     *
     * @return ?array<string, mixed>
     */
    private function mapKkBerkasForApi(?array $row): ?array
    {
        if ($row === null) {
            return null;
        }

        return [
            'id' => (int) ($row['id'] ?? 0),
            'nama_file' => (string) ($row['nama_file'] ?? ''),
            'tipe_file' => (string) ($row['tipe_file'] ?? ''),
            'path_file' => (string) ($row['path_file'] ?? ''),
            'ukuran_file' => isset($row['ukuran_file']) ? (int) $row['ukuran_file'] : null,
            'has_file' => $this->berkasRowHasFile($row),
            'tanggal_update' => $row['tanggal_update'] ?? $row['tanggal_dibuat'] ?? null,
        ];
    }

    /**
     * @param array<string, mixed> $pengajuanRow
     *
     * @return array<string, mixed>
     */
    private function buildBiodataSyncInfo(array $pengajuanRow, int $idSantri): array
    {
        $fromPengajuan = $this->mapBiodataFromPengajuanRow($pengajuanRow);
        $santriRow = $idSantri > 0 ? $this->fetchSantriBiodataRow($idSantri) : null;
        $fromSantri = $this->mapBiodataFromSantriRow($santriRow);
        $hasDifference = $fromSantri !== null && $this->biodataDiffers($fromPengajuan, $fromSantri);

        return [
            'pengajuan' => $fromPengajuan,
            'santri' => $fromSantri,
            'has_difference' => $hasDifference,
            'same' => $fromSantri !== null && !$hasDifference,
        ];
    }

    /**
     * @param array<string, mixed> $pengajuanRow
     *
     * @return array{nama: string, nik: string, tanggal_lahir: string}
     */
    private function mapBiodataFromPengajuanRow(array $pengajuanRow): array
    {
        $tgl = $pengajuanRow['tanggal_lahir'] ?? '';
        $tglNorm = '';
        if ($tgl !== null && $tgl !== '') {
            $ts = strtotime((string) $tgl);
            if ($ts !== false) {
                $tglNorm = date('Y-m-d', $ts);
            }
        }
        $nik = trim((string) ($pengajuanRow['nik'] ?? ''));
        $nikVal = NikHelper::validate($nik);

        return [
            'nama' => trim((string) ($pengajuanRow['nama'] ?? '')),
            'nik' => $nikVal['valid'] ? (string) $nikVal['normalized'] : $nik,
            'tanggal_lahir' => $tglNorm,
        ];
    }

    /**
     * @param array<string, mixed>|null $santriRow
     *
     * @return ?array{nama: string, nik: string, tanggal_lahir: string, nis: ?string}
     */
    private function mapBiodataFromSantriRow(?array $santriRow): ?array
    {
        if ($santriRow === null) {
            return null;
        }
        $tgl = $santriRow['tanggal_lahir'] ?? '';
        $tglNorm = '';
        if ($tgl !== null && $tgl !== '') {
            $ts = strtotime((string) $tgl);
            if ($ts !== false) {
                $tglNorm = date('Y-m-d', $ts);
            }
        }
        $nis = trim((string) ($santriRow['nis'] ?? ''));
        if ($nis === '' && isset($santriRow['id'])) {
            $nis = NisPengajuanHelper::formatNisForDisplay(['id' => (int) $santriRow['id'], 'nis' => '']);
        }

        return [
            'nama' => trim((string) ($santriRow['nama'] ?? '')),
            'nik' => trim((string) ($santriRow['nik'] ?? '')),
            'tanggal_lahir' => $tglNorm,
            'nis' => $nis !== '' ? $nis : null,
        ];
    }

    /**
     * @param array{nama: string, nik: string, tanggal_lahir: string} $a
     * @param array{nama: string, nik: string, tanggal_lahir: string} $b
     */
    private function biodataDiffers(array $a, array $b): bool
    {
        if (mb_strtolower(trim($a['nama'])) !== mb_strtolower(trim($b['nama']))) {
            return true;
        }
        $nikA = preg_replace('/\D/', '', $a['nik']);
        $nikB = preg_replace('/\D/', '', $b['nik']);
        if ($nikA !== $nikB) {
            return true;
        }

        return $a['tanggal_lahir'] !== $b['tanggal_lahir'];
    }

    /**
     * @return ?array<string, mixed>
     */
    private function fetchSantriBiodataRow(int $idSantri): ?array
    {
        if ($idSantri < 1) {
            return null;
        }
        $stmt = $this->db->prepare('SELECT id, nis, nama, nik, tanggal_lahir FROM santri WHERE id = ? LIMIT 1');
        $stmt->execute([$idSantri]);
        $row = $stmt->fetch(\PDO::FETCH_ASSOC);

        return $row ?: null;
    }

    /**
     * Salin nama, NIK, tanggal lahir dari pengajuan ke tabel santri.
     *
     * @param array<string, mixed> $pengajuanRow
     */
    private function applyPengajuanBiodataToSantri(array $pengajuanRow, int $idSantri): ?string
    {
        if ($idSantri < 1) {
            return 'Santri tidak valid';
        }
        $nama = trim((string) ($pengajuanRow['nama'] ?? ''));
        if ($nama === '') {
            return 'Nama pengajuan kosong';
        }
        $nikVal = NikHelper::validate(trim((string) ($pengajuanRow['nik'] ?? '')));
        if (!$nikVal['valid']) {
            return $nikVal['message'];
        }
        $tglRaw = trim((string) ($pengajuanRow['tanggal_lahir'] ?? ''));
        $ts = strtotime($tglRaw);
        if ($ts === false) {
            return 'Tanggal lahir pengajuan tidak valid';
        }
        $tgl = date('Y-m-d', $ts);

        $dupStmt = $this->db->prepare('SELECT id, nama FROM santri WHERE nik = ? AND id != ? LIMIT 1');
        $dupStmt->execute([$nikVal['normalized'], $idSantri]);
        $other = $dupStmt->fetch(\PDO::FETCH_ASSOC);
        if ($other) {
            $otherNama = trim((string) ($other['nama'] ?? ''));
            $otherId = (int) ($other['id'] ?? 0);
            $detail = $otherNama !== '' ? $otherNama : 'santri lain';
            if ($otherId > 0) {
                $detail .= ' (ID ' . $otherId . ')';
            }

            return 'NIK pengajuan sudah dipakai ' . $detail
                . '. Perbaiki tautan santri atau data pengajuan sebelum menimpa biodata.';
        }

        try {
            $stmt = $this->db->prepare('UPDATE santri SET nama = ?, nik = ?, tanggal_lahir = ? WHERE id = ?');
            $stmt->execute([$nama, $nikVal['normalized'], $tgl, $idSantri]);
        } catch (\PDOException $e) {
            if ($e->getCode() === '23000' || str_contains($e->getMessage(), '1062')) {
                return 'NIK pengajuan bentrok dengan santri lain di database.';
            }
            throw $e;
        }

        return null;
    }

    private function applyKkToSantriBerkas(int $pengajuanId, ?int $idPengurus): ?int
    {
        $row = $this->fetchPengajuanRow($pengajuanId);
        if ($row === null || empty($row['path_file'])) {
            return null;
        }
        $idSantri = isset($row['id_santri']) ? (int) $row['id_santri'] : 0;
        if ($idSantri < 1) {
            return null;
        }

        $pathFile = (string) $row['path_file'];
        $namaFile = (string) ($row['nama_file'] ?? 'KK.pdf');
        $ukuran = (int) ($row['ukuran_file'] ?? 0);
        $tipe = (string) ($row['tipe_file'] ?? 'application/pdf');
        $keterangan = 'Dari pengajuan NIS myBeddien #' . $pengajuanId;

        $existing = $this->fetchKkBerkasRow($idSantri);

        if ($existing) {
            $berkasId = (int) $existing['id'];
            $sql = 'UPDATE santri___berkas SET
                nama_file = ?, path_file = ?, ukuran_file = ?, tipe_file = ?, keterangan = ?,
                status_tidak_ada = 0, id_admin = ?, tanggal_update = NOW()
                WHERE id = ?';
            $this->db->prepare($sql)->execute([
                $namaFile,
                $pathFile,
                $ukuran,
                $tipe,
                $keterangan,
                $idPengurus,
                $berkasId,
            ]);

            return $berkasId;
        }

        $sql = 'INSERT INTO santri___berkas (id_santri, jenis_berkas, nama_file, path_file, ukuran_file, tipe_file, keterangan, id_admin)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)';
        $stmt = $this->db->prepare($sql);
        $stmt->execute([
            $idSantri,
            self::JENIS_KK_SANTRI,
            $namaFile,
            $pathFile,
            $ukuran,
            $tipe,
            $keterangan,
            $idPengurus,
        ]);

        return (int) $this->db->lastInsertId();
    }

    /**
     * NIS 7 digit untuk tampilan di myBeddien (kolom nis, fallback id santri).
     *
     * @param array<string, mixed> $santri
     */
    private function resolveNisForLupaNisResponse(array $santri, int $santriId): string
    {
        $nis = NisPengajuanHelper::formatNisForDisplay($santri);
        if ($nis !== '') {
            return $nis;
        }
        if ($santriId > 0) {
            $rawNis = SantriHelper::getNisById($this->db, $santriId);
            if ($rawNis !== null && $rawNis !== '') {
                $nis = NisPengajuanHelper::formatNisForDisplay(['id' => $santriId, 'nis' => $rawNis]);
                if ($nis !== '') {
                    return $nis;
                }
            }
            return str_pad((string) $santriId, 7, '0', STR_PAD_LEFT);
        }

        return '';
    }

    /**
     * @param array<string, mixed> $body
     *
     * @return array{nama: string, nik: string, tanggal_lahir: string, no_wa62: string, error: ?string}
     */
    private function parseIdentityInput(array $body): array
    {
        $namaVal = TextSanitizer::validatePersonName($body['nama'] ?? '');
        if ($namaVal['error'] !== null) {
            return ['nama' => '', 'nik' => '', 'tanggal_lahir' => '', 'no_wa62' => '', 'error' => $namaVal['error']];
        }
        $nama = $namaVal['text'];
        $nikRaw = trim((string) ($body['nik'] ?? ''));
        $tgl = trim((string) ($body['tanggal_lahir'] ?? ''));
        $noWa = trim((string) ($body['no_wa'] ?? ''));

        if ($nikRaw === '' || $tgl === '' || $noWa === '') {
            return ['nama' => '', 'nik' => '', 'tanggal_lahir' => '', 'no_wa62' => '', 'error' => 'Nama, NIK, tanggal lahir, dan nomor WA wajib diisi.'];
        }

        $nikVal = NikHelper::validate($nikRaw);
        if (!$nikVal['valid']) {
            return ['nama' => '', 'nik' => '', 'tanggal_lahir' => '', 'no_wa62' => '', 'error' => $nikVal['message']];
        }

        $ts = strtotime($tgl);
        if ($ts === false) {
            return ['nama' => '', 'nik' => '', 'tanggal_lahir' => '', 'no_wa62' => '', 'error' => 'Tanggal lahir tidak valid.'];
        }

        $noWa62 = NisPengajuanHelper::normalizeNoWaTo62($noWa);
        if ($noWa62 === null) {
            return ['nama' => '', 'nik' => '', 'tanggal_lahir' => '', 'no_wa62' => '', 'error' => 'Nomor WhatsApp tidak valid.'];
        }

        return [
            'nama' => $nama,
            'nik' => $nikVal['normalized'],
            'tanggal_lahir' => date('Y-m-d', $ts),
            'no_wa62' => $noWa62,
            'error' => null,
        ];
    }

    /**
     * @return ?array<string, mixed>
     */
    private function fetchPengajuanRow(int $id): ?array
    {
        if ($id < 1) {
            return null;
        }
        $stmt = $this->db->prepare(
            'SELECT p.*, s.nis AS santri_nis, s.nama AS santri_nama_db
             FROM mybeddian___nis_pengajuan p
             LEFT JOIN santri s ON s.id = p.id_santri
             WHERE p.id = ? LIMIT 1'
        );
        $stmt->execute([$id]);
        $row = $stmt->fetch(\PDO::FETCH_ASSOC);

        return $row ?: null;
    }

    /**
     * @param array<string, mixed> $r
     *
     * @return array<string, mixed>
     */
    private function mapPengajuanRow(array $r, string $requestBase): array
    {
        $id = (int) ($r['id'] ?? 0);
        $hasKk = !empty($r['path_file']);
        $kkUrl = $hasKk ? '/api/pendaftaran/nis-pengajuan/' . $id . '/kk' : null;

        $nisDisplay = '';
        if (!empty($r['id_santri'])) {
            $nisDisplay = NisPengajuanHelper::formatNisForDisplay([
                'id' => $r['id_santri'],
                'nis' => $r['santri_nis'] ?? '',
            ]);
        }

        return [
            'id' => $id,
            'nama' => (string) ($r['nama'] ?? ''),
            'nik' => (string) ($r['nik'] ?? ''),
            'tanggal_lahir' => (string) ($r['tanggal_lahir'] ?? ''),
            'no_wa' => (string) ($r['no_wa'] ?? ''),
            'id_santri' => isset($r['id_santri']) ? (int) $r['id_santri'] : null,
            'status' => (string) ($r['status'] ?? ''),
            'path_file' => (string) ($r['path_file'] ?? ''),
            'nama_file' => (string) ($r['nama_file'] ?? ''),
            'tipe_file' => (string) ($r['tipe_file'] ?? ''),
            'ukuran_file' => isset($r['ukuran_file']) ? (int) $r['ukuran_file'] : null,
            'kk_url' => $kkUrl,
            'kk_thumb_url' => $kkUrl,
            'nis_display' => $nisDisplay,
            'santri_nama_db' => (string) ($r['santri_nama_db'] ?? ''),
            'nis_dikirim_at' => $r['nis_dikirim_at'] ?? null,
            'created_at' => $r['created_at'] ?? null,
            'updated_at' => $r['updated_at'] ?? null,
        ];
    }

    private function userCanEdit(Request $request): bool
    {
        $user = $request->getAttribute('user');
        if (!is_array($user)) {
            return false;
        }

        return RoleHelper::tokenHasEbeddienFiturCode($this->db, $user, 'action.pendaftaran.nis_pengajuan.edit_data')
            || RoleHelper::tokenHasEbeddienFiturCode($this->db, $user, 'action.pendaftaran.nis_pengajuan.kelola')
            || RoleHelper::tokenHasEbeddienFiturCode($this->db, $user, 'menu.pendaftaran.pengajuan_nis');
    }

    private function userCanKirimNis(Request $request): bool
    {
        $user = $request->getAttribute('user');
        if (!is_array($user)) {
            return false;
        }

        return RoleHelper::tokenHasEbeddienFiturCode($this->db, $user, 'action.pendaftaran.nis_pengajuan.kirim_nis')
            || RoleHelper::tokenHasEbeddienFiturCode($this->db, $user, 'action.pendaftaran.nis_pengajuan.kelola');
    }
}
