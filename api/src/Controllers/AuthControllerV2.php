<?php

namespace App\Controllers;

use App\Database;
use App\Auth\JwtAuth;
use App\Auth\PasswordHelper;
use App\Helpers\AuditLogger;
use App\Helpers\TextSanitizer;
use App\Helpers\LoginSuspiciousHelper;
use App\Helpers\NikHelper;
use App\Helpers\PengurusHelper;
use App\Helpers\RoleHelper;
use App\Helpers\SantriHelper;
use App\Helpers\UserAgentHelper;
use App\Services\EmailService;
use App\Services\WhatsAppService;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

class AuthControllerV2
{
    /** Jumlah password lama yang tidak boleh dipakai ulang */
    private const PASSWORD_HISTORY_COUNT = 10;

    private $db;
    private $jwt;

    /** @var bool|null */
    private $setupTokensHasEntityColumnsCache = null;

    public function __construct()
    {
        $this->db = Database::getInstance()->getConnection();
        $this->jwt = new JwtAuth();
    }

    /**
     * Jalankan callback dengan session timezone WIB untuk token expires_at (NOW(), DATE_ADD, dll.).
     * Pakai offset +07:00 — sama seperti Database.php — agar jalan di MySQL/MariaDB tanpa tabel timezone
     * (nama 'Asia/Jakarta' memicu error 1298 jika mysql_tzinfo_to_sql belum di-load).
     */
    private function withIndonesiaTimezone(callable $fn)
    {
        $prev = null;
        try {
            $res = $this->db->query("SELECT @@session.time_zone");
            $prev = $res ? $res->fetchColumn() : null;
            $this->db->exec("SET SESSION time_zone = '+07:00'");
            return $fn();
        } finally {
            if ($prev !== null && $prev !== false && $prev !== '') {
                $this->db->exec("SET SESSION time_zone = " . $this->db->quote((string) $prev));
            }
        }
    }

    /**
     * Token hex dari query/body: jangan lewat TextSanitizer::cleanText (bisa mengubah byte/NFC).
     * Hapus whitespace/pemisah baris yang sering ikut salinan dari WhatsApp.
     */
    private function normalizeSecurityToken(string $raw): string
    {
        return preg_replace('/\s+/u', '', trim($raw));
    }

    private function getUsersDuplicateFieldMessage(\PDOException $e): ?string
    {
        $info = $e->errorInfo ?? [];
        $sqlState = (string) ($e->getCode() ?? '');
        $driverCode = isset($info[1]) ? (int) $info[1] : 0;
        if ($sqlState !== '23000' && $driverCode !== 1062) {
            return null;
        }

        $errorText = strtolower((string) ($info[2] ?? $e->getMessage() ?? ''));
        if (strpos($errorText, 'no_wa') !== false) {
            return 'Nomor WA sudah dipakai';
        }
        if (strpos($errorText, 'email') !== false) {
            return 'Email sudah dipakai';
        }
        if (strpos($errorText, 'username') !== false) {
            return 'Username sudah dipakai';
        }

        return 'Data akun sudah dipakai';
    }

    private function userSetupTokensHasEntityColumns(): bool
    {
        if ($this->setupTokensHasEntityColumnsCache !== null) {
            return $this->setupTokensHasEntityColumnsCache;
        }
        try {
            $st = $this->db->query("SHOW COLUMNS FROM user___setup_tokens LIKE 'entity_type'");
            $this->setupTokensHasEntityColumnsCache = $st !== false && $st->rowCount() > 0;
        } catch (\Throwable $e) {
            $this->setupTokensHasEntityColumnsCache = false;
        }
        return $this->setupTokensHasEntityColumnsCache;
    }

    private function userSetupTokensMainHasNoWaColumn(): bool
    {
        try {
            $st = $this->db->query("SHOW COLUMNS FROM user___setup_tokens LIKE 'no_wa'");
            return $st !== false && $st->rowCount() > 0;
        } catch (\Throwable $e) {
            return false;
        }
    }

    private function userSetupTokensSantriLegacyTableExists(): bool
    {
        try {
            $st = $this->db->query("SHOW TABLES LIKE 'user___setup_tokens_santri'");
            return $st !== false && $st->rowCount() > 0;
        } catch (\Throwable $e) {
            return false;
        }
    }

    private function userSetupTokensSantriLegacyHasNoWaColumn(): bool
    {
        try {
            $st = $this->db->query("SHOW COLUMNS FROM user___setup_tokens_santri LIKE 'no_wa'");
            return $st !== false && $st->rowCount() > 0;
        } catch (\Throwable $e) {
            return false;
        }
    }

    /**
     * Insert token setup akun — skema baru (entity_type) atau lama (id_pengurus / tabel santri terpisah).
     *
     * @param 'pengurus'|'santri' $entityType
     */
    private function insertUserSetupToken(string $tokenHash, string $entityType, int $entityId, string $noWa, int $ttlMinutes = 5): void
    {
        $ttl = max(1, min(10080, $ttlMinutes));
        if ($this->userSetupTokensHasEntityColumns()) {
            $ins = $this->db->prepare('INSERT INTO user___setup_tokens (token_hash, entity_type, entity_id, expires_at, no_wa) VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL ? MINUTE), ?)');
            $ins->execute([$tokenHash, $entityType, $entityId, $ttl, $noWa]);
            return;
        }
        if ($entityType === 'pengurus') {
            if ($this->userSetupTokensMainHasNoWaColumn()) {
                $ins = $this->db->prepare('INSERT INTO user___setup_tokens (token_hash, id_pengurus, expires_at, no_wa) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? MINUTE), ?)');
                $ins->execute([$tokenHash, $entityId, $ttl, $noWa]);
            } else {
                $ins = $this->db->prepare('INSERT INTO user___setup_tokens (token_hash, id_pengurus, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? MINUTE))');
                $ins->execute([$tokenHash, $entityId, $ttl]);
            }
            return;
        }
        if ($entityType === 'santri' && $this->userSetupTokensSantriLegacyTableExists()) {
            if ($this->userSetupTokensSantriLegacyHasNoWaColumn()) {
                $ins = $this->db->prepare('INSERT INTO user___setup_tokens_santri (token_hash, id_santri, expires_at, no_wa) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? MINUTE), ?)');
                $ins->execute([$tokenHash, $entityId, $ttl, $noWa]);
            } else {
                $ins = $this->db->prepare('INSERT INTO user___setup_tokens_santri (token_hash, id_santri, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? MINUTE))');
                $ins->execute([$tokenHash, $entityId, $ttl]);
            }
            return;
        }
        throw new \RuntimeException('Skema user___setup_tokens perlu migrasi. Jalankan: php vendor/bin/phinx migrate (dari folder api).');
    }

    /** Tampilan nomor untuk pesan WA (prefill): 08… jika prefix 62. */
    private function formatNoWaDisplayForMessage(string $noWa62): string
    {
        if (strpos($noWa62, '62') === 0 && strlen($noWa62) >= 11) {
            return '0' . substr($noWa62, 2);
        }
        return $noWa62;
    }

    private function normalizeNoWaTo62(string $noWa): ?string
    {
        $digits = preg_replace('/\D/', '', trim($noWa));
        if ($digits === '') {
            return null;
        }
        if (strpos($digits, '0') === 0) {
            $digits = '62' . substr($digits, 1);
        } elseif (strpos($digits, '62') !== 0) {
            $digits = '62' . $digits;
        }
        if (strlen($digits) < 10) {
            return null;
        }
        return $digits;
    }

    private function isNoWaUsedByOtherUser(string $noWa62, ?int $excludeUserId = null): bool
    {
        $alt0 = strpos($noWa62, '62') === 0 ? ('0' . substr($noWa62, 2)) : $noWa62;
        if ($excludeUserId !== null && $excludeUserId > 0) {
            $stmt = $this->db->prepare("SELECT id FROM users WHERE no_wa IN (?, ?) AND id <> ? LIMIT 1");
            $stmt->execute([$noWa62, $alt0, $excludeUserId]);
        } else {
            $stmt = $this->db->prepare("SELECT id FROM users WHERE no_wa IN (?, ?) LIMIT 1");
            $stmt->execute([$noWa62, $alt0]);
        }
        return (bool) $stmt->fetch(\PDO::FETCH_ASSOC);
    }

    private function isNoWaReservedInActiveSetupToken(string $noWa62): bool
    {
        $alt0 = strpos($noWa62, '62') === 0 ? ('0' . substr($noWa62, 2)) : $noWa62;
        if ($this->userSetupTokensMainHasNoWaColumn()) {
            $stmt = $this->db->prepare("SELECT id FROM user___setup_tokens WHERE expires_at > NOW() AND no_wa IN (?, ?) LIMIT 1");
            $stmt->execute([$noWa62, $alt0]);
            if ($stmt->fetch(\PDO::FETCH_ASSOC)) {
                return true;
            }
        }
        if ($this->userSetupTokensSantriLegacyTableExists() && $this->userSetupTokensSantriLegacyHasNoWaColumn()) {
            $stmt = $this->db->prepare("SELECT id FROM user___setup_tokens_santri WHERE expires_at > NOW() AND no_wa IN (?, ?) LIMIT 1");
            $stmt->execute([$noWa62, $alt0]);
            if ($stmt->fetch(\PDO::FETCH_ASSOC)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Cek daftar: id_pengurus, nik, no_wa.
     * Validasi: NIK valid + belum dipakai pengurus lain, no_wa valid + belum dipakai akun/proses pendaftaran lain.
     */
    public function daftarCheck(Request $request, Response $response): Response
    {
        try {
            $data = $request->getParsedBody();
            $data = is_array($data) ? TextSanitizer::sanitizeStringValues($data, ['id_pengurus', 'nik', 'no_wa', 'nis', 'username', 'no_wa_baru', 'no_wa_konfirmasi', 'username_baru', 'otp']) : [];
            $idPengurus = trim($data['id_pengurus'] ?? '');
            $nik = trim($data['nik'] ?? '');
            $noWa = trim($data['no_wa'] ?? '');

            if ($idPengurus === '' || $nik === '' || $noWa === '') {
                return $this->json($response, ['success' => false, 'message' => 'ID Pengurus, NIK, dan No. WA harus diisi'], 400);
            }

            $nikValidation = NikHelper::validate($nik);
            if (!$nikValidation['valid']) {
                return $this->json($response, ['success' => false, 'message' => $nikValidation['message']], 400);
            }
            $nik = $nikValidation['normalized'];
            $noWa62 = $this->normalizeNoWaTo62($noWa);
            if ($noWa62 === null) {
                return $this->json($response, ['success' => false, 'message' => 'Nomor WhatsApp tidak valid'], 400);
            }

            if (!ctype_digit((string)$idPengurus)) {
                return $this->json($response, ['success' => false, 'code' => 'nip_invalid', 'message' => 'NIP tidak valid'], 400);
            }

            $idPengurusResolved = PengurusHelper::resolveIdByNip($this->db, trim($idPengurus));
            if ($idPengurusResolved === null) {
                return $this->json($response, ['success' => false, 'code' => 'nip_not_found', 'message' => 'NIP tidak ditemukan. Periksa NIP atau hubungi admin.'], 404);
            }

            $stmt = $this->db->prepare("SELECT id, nama, id_user, nik AS nik_db FROM pengurus WHERE id = ? LIMIT 1");
            $stmt->execute([$idPengurusResolved]);
            $pengurus = $stmt->fetch(\PDO::FETCH_ASSOC);

            if (!$pengurus) {
                return $this->json($response, ['success' => false, 'code' => 'nip_not_found', 'message' => 'Pengurus tidak ditemukan'], 404);
            }

            if (!empty($pengurus['id_user'])) {
                return $this->json($response, [
                    'success' => true,
                    'already_registered' => true,
                    'code' => 'nip_has_account',
                    'message' => 'NIP ini sudah punya akun. Silakan login dengan username dan password.',
                ], 200);
            }

            $stmtNik = $this->db->prepare("SELECT id FROM pengurus WHERE nik = ? AND id != ? LIMIT 1");
            $stmtNik->execute([$nik, $idPengurusResolved]);
            if ($stmtNik->fetch()) {
                return $this->json($response, [
                    'success' => false,
                    'code' => 'nik_conflict',
                    'message' => 'NIK ini sudah dipakai pengurus lain. Periksa NIK atau hubungi admin. Jika ini Anda, gunakan NIP yang sesuai.',
                ], 400);
            }
            if ($this->isNoWaUsedByOtherUser($noWa62)) {
                return $this->json($response, [
                    'success' => false,
                    'code' => 'wa_in_use',
                    'message' => 'Nomor WhatsApp ini sudah dipakai akun lain. Gunakan nomor lain.',
                ], 400);
            }
            if ($this->isNoWaReservedInActiveSetupToken($noWa62)) {
                return $this->json($response, [
                    'success' => false,
                    'code' => 'wa_pending_setup',
                    'message' => 'Nomor ini masih terikat proses aktivasi sebelumnya. Tunggu hingga token kedaluwarsa (10 menit) atau gunakan nomor lain.',
                ], 400);
            }

            $nipTampil = PengurusHelper::getNipById($this->db, $idPengurusResolved) ?? (string) $idPengurusResolved;

            return $this->json($response, [
                'success' => true,
                'already_registered' => false,
                'nama' => $pengurus['nama'] ?: 'Pengurus',
                'nip' => $nipTampil,
                'no_wa' => $noWa62,
            ], 200);
        } catch (\Exception $e) {
            error_log('AuthControllerV2::daftarCheck ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Terjadi kesalahan'], 500);
        }
    }

    /**
     * Konfirmasi daftar: update NIK di pengurus, simpan no_wa di setup token (aktif 10 menit).
     * Pengguna melanjutkan ke WhatsApp (nomor QR) dengan template pesan; link setup dikirim setelah balasan di WA.
     */
    public function daftarKonfirmasi(Request $request, Response $response): Response
    {
        try {
            $data = $request->getParsedBody();
            $data = is_array($data) ? TextSanitizer::sanitizeStringValues($data, ['id_pengurus', 'nik', 'no_wa', 'nis', 'username', 'no_wa_baru', 'no_wa_konfirmasi', 'username_baru', 'otp']) : [];
            $idPengurus = trim($data['id_pengurus'] ?? '');
            $nik = trim($data['nik'] ?? '');
            $noWa = trim($data['no_wa'] ?? '');

            if ($idPengurus === '' || $nik === '' || $noWa === '') {
                return $this->json($response, ['success' => false, 'message' => 'NIP Pengurus, NIK, dan No. WA harus diisi'], 400);
            }

            $idPengurusResolved = PengurusHelper::resolveIdByNip($this->db, $idPengurus);
            if ($idPengurusResolved === null) {
                return $this->json($response, ['success' => false, 'code' => 'nip_not_found', 'message' => 'NIP tidak ditemukan.'], 404);
            }

            $nikValidation = NikHelper::validate($nik);
            if (!$nikValidation['valid']) {
                return $this->json($response, ['success' => false, 'message' => $nikValidation['message']], 400);
            }
            $nik = $nikValidation['normalized'];
            $noWa62 = $this->normalizeNoWaTo62($noWa);
            if ($noWa62 === null) {
                return $this->json($response, ['success' => false, 'message' => 'Nomor WhatsApp tidak valid'], 400);
            }

            $stmt = $this->db->prepare("SELECT id, nama, id_user, nik AS nik_db FROM pengurus WHERE id = ? LIMIT 1");
            $stmt->execute([$idPengurusResolved]);
            $pengurus = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$pengurus || !empty($pengurus['id_user'])) {
                return $this->json($response, ['success' => false, 'code' => 'nip_has_account', 'message' => 'Data tidak valid atau akun sudah terdaftar'], 400);
            }

            $stmtNik = $this->db->prepare("SELECT id FROM pengurus WHERE nik = ? AND id != ? LIMIT 1");
            $stmtNik->execute([$nik, $idPengurusResolved]);
            if ($stmtNik->fetch()) {
                return $this->json($response, [
                    'success' => false,
                    'code' => 'nik_conflict',
                    'message' => 'NIK ini sudah dipakai pengurus lain. Periksa NIK atau hubungi admin.',
                ], 400);
            }
            if ($this->isNoWaUsedByOtherUser($noWa62)) {
                return $this->json($response, [
                    'success' => false,
                    'code' => 'wa_in_use',
                    'message' => 'Nomor WhatsApp ini sudah dipakai akun lain.',
                ], 400);
            }
            if ($this->isNoWaReservedInActiveSetupToken($noWa62)) {
                return $this->json($response, [
                    'success' => false,
                    'code' => 'wa_pending_setup',
                    'message' => 'Nomor ini masih terikat proses aktivasi sebelumnya. Tunggu hingga token kedaluwarsa (10 menit) atau gunakan nomor lain.',
                ], 400);
            }

            $upd = $this->db->prepare("UPDATE pengurus SET nik = ? WHERE id = ?");
            $upd->execute([$nik, $idPengurusResolved]);

            $plainToken = bin2hex(random_bytes(32));
            $tokenHash = hash('sha256', $plainToken);
            $ttlMin = 10;
            $this->withIndonesiaTimezone(function () use ($tokenHash, $idPengurusResolved, $noWa62, $ttlMin) {
                $this->insertUserSetupToken($tokenHash, 'pengurus', $idPengurusResolved, $noWa62, $ttlMin);
            });

            $config = require __DIR__ . '/../../config.php';
            $baseUrl = $this->getFrontendBaseUrl($request, $config);
            $setupUrl = $baseUrl . '/setup-akun?token=' . urlencode($plainToken);

            $namaTampil = trim((string) ($pengurus['nama'] ?? '')) ?: 'Pengurus';
            $nipTampil = PengurusHelper::getNipById($this->db, $idPengurusResolved) ?? (string) $idPengurusResolved;
            $noTampil = $this->formatNoWaDisplayForMessage($noWa62);

            $prefillLines = [
                'Aktifkan akun eBeddien',
                'Nama: ' . $namaTampil,
                'NIK: ' . $nik,
                'Nomor: ' . $noTampil,
                'Token: ' . $plainToken,
            ];
            $prefillMessage = implode("\n", $prefillLines);

            $waQrDigits = preg_replace('/\D/', '', (string) ($config['app']['ebeddien_daftar_wa_qr_number'] ?? '6282232999921'));
            if (strlen($waQrDigits) < 10) {
                $waQrDigits = '6282232999921';
            }

            return $this->json($response, [
                'success' => true,
                'message' => 'Token aktivasi dibuat. Lanjutkan ke WhatsApp untuk mengirim pesan verifikasi. Link setup dikirim di chat setelah Anda mengonfirmasi menyimpan nomor.',
                'expires_in_minutes' => $ttlMin,
                'setup_token' => $plainToken,
                'setup_url' => $setupUrl,
                'wa_me_phone' => $waQrDigits,
                'prefill_message' => $prefillMessage,
                'nama' => $namaTampil,
                'nip' => $nipTampil,
                'nik' => $nik,
                'no_wa_display' => $noTampil,
            ], 200);
        } catch (\PDOException $e) {
            $sqlState = (string) ($e->getCode() ?? '');
            $msg = (string) $e->getMessage();
            if ($sqlState === '23000' && stripos($msg, 'unique_pengurus_nik') !== false) {
                return $this->json($response, [
                    'success' => false,
                    'code' => 'nik_conflict',
                    'message' => 'NIK ini sudah dipakai pengurus lain. Periksa NIK lalu coba lagi.',
                ], 400);
            }
            error_log('AuthControllerV2::daftarKonfirmasi PDO ' . $msg);
            return $this->json($response, ['success' => false, 'message' => 'Terjadi kesalahan saat memproses data. Coba lagi.'], 500);
        } catch (\RuntimeException $e) {
            error_log('AuthControllerV2::daftarKonfirmasi ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Layanan sementara tidak tersedia. Coba lagi dalam beberapa saat.'], 503);
        } catch (\Throwable $e) {
            error_log('AuthControllerV2::daftarKonfirmasi ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
            return $this->json($response, ['success' => false, 'message' => 'Terjadi kesalahan server. Coba lagi atau hubungi admin.'], 500);
        }
    }

    /**
     * POST lupa-password-request (public): id_pengurus, nik, no_wa.
     * NIK harus persis sama dengan yang terdaftar di pengurus. No WA harus sama dengan users.no_wa.
     * Jika cocok: buat token reset password, kirim link ke WA.
     */
    public function lupaPasswordRequest(Request $request, Response $response): Response
    {
        try {
            $data = $request->getParsedBody();
            $data = is_array($data) ? TextSanitizer::sanitizeStringValues($data, ['id_pengurus', 'nik', 'no_wa', 'nis', 'username', 'no_wa_baru', 'no_wa_konfirmasi', 'username_baru', 'otp']) : [];
            $idPengurus = trim($data['id_pengurus'] ?? '');
            $nik = trim($data['nik'] ?? '');
            $noWa = trim($data['no_wa'] ?? '');

            if ($idPengurus === '' || $nik === '' || $noWa === '') {
                return $this->json($response, ['success' => false, 'message' => 'ID Pengurus, NIK, dan No. WA harus diisi'], 400);
            }

            $nikValidation = NikHelper::validate($nik);
            if (!$nikValidation['valid']) {
                return $this->json($response, ['success' => false, 'message' => $nikValidation['message']], 400);
            }
            $nikNormalized = $nikValidation['normalized'];

            if (!ctype_digit((string)$idPengurus)) {
                return $this->json($response, ['success' => false, 'message' => 'NIP Pengurus tidak valid'], 400);
            }

            $idPengurusResolved = PengurusHelper::resolveIdByNip($this->db, trim($idPengurus));
            if ($idPengurusResolved === null) {
                return $this->json($response, ['success' => false, 'message' => 'NIP Pengurus tidak ditemukan'], 404);
            }

            $stmt = $this->db->prepare("SELECT p.id, p.nik, p.id_user, u.no_wa FROM pengurus p LEFT JOIN users u ON u.id = p.id_user WHERE p.id = ? LIMIT 1");
            $stmt->execute([$idPengurusResolved]);
            $pengurus = $stmt->fetch(\PDO::FETCH_ASSOC);

            if (!$pengurus) {
                return $this->json($response, ['success' => false, 'message' => 'Pengurus tidak ditemukan'], 404);
            }
            if (empty($pengurus['id_user'])) {
                return $this->json($response, ['success' => false, 'message' => 'Akun belum terdaftar. Silakan daftar dulu.'], 400);
            }

            $nikDb = $pengurus['nik'] ?? '';
            $nikDbNorm = NikHelper::normalize($nikDb);
            if ($nikDbNorm === null || $nikDbNorm !== $nikNormalized) {
                return $this->json($response, ['success' => false, 'message' => 'NIK tidak sesuai dengan data yang terdaftar. Pastikan NIK persis sama dengan saat daftar.'], 400);
            }

            $noWaDb = preg_replace('/\D/', '', $pengurus['no_wa'] ?? '');
            $noWaInput = preg_replace('/\D/', '', $noWa);
            if (strpos($noWaInput, '0') === 0) {
                $noWaInput = '62' . substr($noWaInput, 1);
            } elseif (strpos($noWaInput, '62') !== 0 && $noWaInput !== '') {
                $noWaInput = '62' . $noWaInput;
            }
            if (strpos($noWaDb, '0') === 0) {
                $noWaDb = '62' . substr($noWaDb, 1);
            } elseif (strpos($noWaDb, '62') !== 0 && $noWaDb !== '') {
                $noWaDb = '62' . $noWaDb;
            }
            if ($noWaDb === '' || $noWaDb !== $noWaInput) {
                return $this->json($response, ['success' => false, 'message' => 'Nomor WA tidak sesuai dengan data yang terdaftar.'], 400);
            }

            $userId = (int)$pengurus['id_user'];
            $noWaDisplay = $pengurus['no_wa'] ?? $noWa;

            $plainToken = bin2hex(random_bytes(32));
            $tokenHash = hash('sha256', $plainToken);
            $ins = $this->db->prepare("INSERT INTO user___password_reset_tokens (user_id, token_hash, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 15 MINUTE))");
            $ins->execute([$userId, $tokenHash]);
            $tokenId = (int) $this->db->lastInsertId();

            $config = require __DIR__ . '/../../config.php';
            $baseUrl = $this->getFrontendBaseUrl($request, $config);
            $link = $baseUrl . '/ubah-password?token=' . urlencode($plainToken);
            $message = "Link buat password baru (aktif 15 menit):\n" . $link . "\n\nJangan bagikan link ini ke siapapun.";
            $logContext = ['id_santri' => null, 'id_pengurus' => (int)$pengurus['id'], 'tujuan' => 'pengurus', 'id_pengurus_pengirim' => null, 'kategori' => 'password_reset', 'sumber' => 'lupa_password'];
            $sendResult = WhatsAppService::sendMessage($noWaDisplay, $message, null, $logContext);
            if (!$sendResult['success']) {
                return $this->json($response, ['success' => false, 'message' => 'Gagal mengirim link ke WhatsApp: ' . ($sendResult['message'] ?? 'Coba lagi nanti.')], 502);
            }
            if (WhatsAppService::deliveryWasNotActuallySent($sendResult)) {
                return $this->json($response, [
                    'success' => false,
                    'message' => 'Gagal mengirim link ke WhatsApp: ' . ($sendResult['message'] ?? 'Pesan tidak terkirim.'),
                ], 502);
            }
            if ($tokenId > 0 && !empty($sendResult['messageId'])) {
                $nomor62 = WhatsAppService::formatPhoneNumber($noWaDisplay);
                $this->db->prepare("UPDATE user___password_reset_tokens SET wa_message_id = ?, nomor_tujuan = ? WHERE id = ?")->execute([trim($sendResult['messageId']), $nomor62, $tokenId]);
            }
            AuditLogger::log((string)$userId, 'request_ubah_password', ['sumber' => 'lupa_password'], $this->getClientIp($request), true);
            return $this->json($response, ['success' => true, 'message' => 'Link buat password baru telah dikirim ke WhatsApp Anda. Cek nomor yang terdaftar. Link aktif 15 menit.'], 200);
        } catch (\Exception $e) {
            error_log('AuthControllerV2::lupaPasswordRequest ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Terjadi kesalahan'], 500);
        }
    }

    /**
     * Validasi token setup; return valid + nama untuk tampilan form.
     */
    public function getSetupToken(Request $request, Response $response): Response
    {
        try {
            $token = $this->normalizeSecurityToken((string) ($request->getQueryParams()['token'] ?? ''));
            if ($token === '') {
                return $this->json($response, ['success' => true, 'valid' => false], 200);
            }

            $tokenHash = hash('sha256', $token);
            $row = $this->withIndonesiaTimezone(function () use ($tokenHash) {
                if ($this->userSetupTokensHasEntityColumns()) {
                    $stmt = $this->db->prepare("
                    SELECT st.id, st.entity_id, p.nama
                    FROM user___setup_tokens st
                    INNER JOIN pengurus p ON st.entity_type = 'pengurus' AND p.id = st.entity_id
                    WHERE st.token_hash = ? AND st.expires_at > NOW()
                ");
                    $stmt->execute([$tokenHash]);
                    return $stmt->fetch(\PDO::FETCH_ASSOC);
                }
                $stmt = $this->db->prepare("
                    SELECT st.id, st.id_pengurus AS entity_id, p.nama
                    FROM user___setup_tokens st
                    INNER JOIN pengurus p ON p.id = st.id_pengurus
                    WHERE st.token_hash = ? AND st.expires_at > NOW()
                ");
                $stmt->execute([$tokenHash]);
                return $stmt->fetch(\PDO::FETCH_ASSOC);
            });

            if (!$row) {
                try {
                    $stmtInv = $this->db->prepare("SELECT id, wa_message_id, no_wa FROM user___setup_tokens WHERE token_hash = ?");
                    $stmtInv->execute([$tokenHash]);
                    $inv = $stmtInv->fetch(\PDO::FETCH_ASSOC);
                    if ($inv && !empty($inv['wa_message_id']) && !empty($inv['no_wa'])) {
                        $isExpired = $this->withIndonesiaTimezone(function () use ($inv) {
                            $r = $this->db->prepare("SELECT 1 FROM user___setup_tokens WHERE id = ? AND expires_at <= NOW()");
                            $r->execute([$inv['id']]);
                            return $r->fetch() !== false;
                        });
                        if ($isExpired) {
                            $this->editWaMessageTokenInvalidated($inv['no_wa'], $inv['wa_message_id'], 'kadaluarsa', '🔒 Verifikasi Daftar UWABA');
                            $this->db->prepare("UPDATE user___setup_tokens SET wa_message_id = NULL WHERE id = ?")->execute([$inv['id']]);
                        }
                    }
                } catch (\Throwable $e) {
                }
                return $this->json($response, ['success' => true, 'valid' => false], 200);
            }

            return $this->json($response, [
                'success' => true,
                'valid' => true,
                'nama' => $row['nama'] ?: 'Pengurus',
            ], 200);
        } catch (\Exception $e) {
            error_log('AuthControllerV2::getSetupToken ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Terjadi kesalahan'], 500);
        }
    }

    /**
     * Buat akun: token, username (min 5, no spasi), password (min 6).
     */
    public function postSetupAkun(Request $request, Response $response): Response
    {
        try {
            $data = $request->getParsedBody();
            $data = is_array($data) ? TextSanitizer::sanitizeStringValues($data, ['id_pengurus', 'nik', 'no_wa', 'nis', 'username', 'no_wa_baru', 'no_wa_konfirmasi', 'username_baru', 'otp']) : [];
            $token = $this->normalizeSecurityToken((string) ($data['token'] ?? ''));
            $username = trim($data['username'] ?? '');
            $password = $data['password'] ?? '';

            if ($token === '') {
                return $this->json($response, ['success' => false, 'message' => 'Token tidak valid atau kadaluarsa'], 400);
            }

            if (strlen($username) < 5) {
                return $this->json($response, ['success' => false, 'message' => 'Username minimal 5 karakter'], 400);
            }
            if (preg_match('/\s/', $username)) {
                return $this->json($response, ['success' => false, 'message' => 'Username tidak boleh mengandung spasi'], 400);
            }
            if (strlen($password) < 6) {
                return $this->json($response, ['success' => false, 'message' => 'Password minimal 6 karakter'], 400);
            }

            $tokenHash = hash('sha256', $token);
            $row = $this->withIndonesiaTimezone(function () use ($tokenHash) {
                if ($this->userSetupTokensHasEntityColumns()) {
                    $stmt = $this->db->prepare("
                    SELECT st.id, st.entity_id, st.no_wa
                    FROM user___setup_tokens st
                    INNER JOIN pengurus p ON st.entity_type = 'pengurus' AND p.id = st.entity_id AND p.id_user IS NULL
                    WHERE st.token_hash = ? AND st.expires_at > NOW()
                ");
                    $stmt->execute([$tokenHash]);
                    return $stmt->fetch(\PDO::FETCH_ASSOC);
                }
                $nw = $this->userSetupTokensMainHasNoWaColumn() ? 'st.no_wa' : 'NULL AS no_wa';
                $stmt = $this->db->prepare("
                    SELECT st.id, st.id_pengurus AS entity_id, {$nw}
                    FROM user___setup_tokens st
                    INNER JOIN pengurus p ON p.id = st.id_pengurus AND p.id_user IS NULL
                    WHERE st.token_hash = ? AND st.expires_at > NOW()
                ");
                $stmt->execute([$tokenHash]);
                return $stmt->fetch(\PDO::FETCH_ASSOC);
            });
            if (!$row) {
                return $this->json($response, ['success' => false, 'message' => 'Token tidak valid atau kadaluarsa'], 400);
            }

            $stmt = $this->db->prepare("SELECT id FROM users WHERE LOWER(TRIM(username)) = LOWER(?)");
            $stmt->execute([$username]);
            if ($stmt->fetch()) {
                return $this->json($response, ['success' => false, 'message' => 'Username sudah dipakai'], 400);
            }

            $idPengurus = (int) $row['entity_id'];
            $noWa = isset($row['no_wa']) && $row['no_wa'] !== null && $row['no_wa'] !== '' ? trim((string) $row['no_wa']) : null;
            $email = null;
            if ($noWa !== null) {
                $noWaNorm = $this->normalizeNoWaTo62($noWa);
                if ($noWaNorm !== null && $this->isNoWaUsedByOtherUser($noWaNorm)) {
                    return $this->json($response, ['success' => false, 'message' => 'Nomor WA sudah dipakai'], 400);
                }
            }

            $passwordHash = PasswordHelper::hashPassword($password);
            $ins = $this->db->prepare("
                INSERT INTO users (username, password, no_wa, email, role, is_active)
                VALUES (?, ?, ?, ?, 'pengurus', 1)
            ");
            try {
                $ins->execute([$username, $passwordHash, $noWa, $email]);
            } catch (\PDOException $pdoEx) {
                $duplicateMessage = $this->getUsersDuplicateFieldMessage($pdoEx);
                if ($duplicateMessage !== null) {
                    return $this->json($response, ['success' => false, 'message' => $duplicateMessage], 400);
                }
                throw $pdoEx;
            }
            $userId = (int) $this->db->lastInsertId();

            $this->db->prepare("INSERT INTO user___password_history (user_id, password_hash) VALUES (?, ?)")->execute([$userId, $passwordHash]);
            $this->db->prepare("UPDATE users SET no_wa_verified_at = NOW() WHERE id = ?")->execute([$userId]);
            $this->db->prepare("UPDATE pengurus SET id_user = ? WHERE id = ?")->execute([$userId, $idPengurus]);
            try {
                $stmtWa = $this->db->prepare("SELECT wa_message_id, no_wa FROM user___setup_tokens WHERE token_hash = ?");
                $stmtWa->execute([$tokenHash]);
                $waRow = $stmtWa->fetch(\PDO::FETCH_ASSOC);
                if ($waRow && !empty($waRow['wa_message_id']) && !empty($waRow['no_wa'])) {
                    $this->editWaMessageTokenInvalidated($waRow['no_wa'], $waRow['wa_message_id'], 'dipakai', '🔒 Verifikasi Daftar UWABA');
                }
            } catch (\Throwable $e) {
            }
            $this->db->prepare("DELETE FROM user___setup_tokens WHERE token_hash = ?")->execute([$tokenHash]);
            AuditLogger::log((string)$userId, 'setup_akun', ['username' => $username], $this->getClientIp($request), true);

            return $this->json($response, [
                'success' => true,
                'message' => 'Akun berhasil dibuat. Silakan login dengan username dan password.',
            ], 200);
        } catch (\Exception $e) {
            error_log('AuthControllerV2::postSetupAkun ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Terjadi kesalahan'], 500);
        }
    }

    /**
     * Daftar santri (Mybeddian): cek NIS, NIK, no_wa. Return already_registered atau nama + no_wa.
     */
    public function daftarCheckSantri(Request $request, Response $response): Response
    {
        try {
            $data = $request->getParsedBody();
            $data = is_array($data) ? TextSanitizer::sanitizeStringValues($data, ['id_pengurus', 'nik', 'no_wa', 'nis', 'username', 'no_wa_baru', 'no_wa_konfirmasi', 'username_baru', 'otp']) : [];
            $nis = trim((string)($data['nis'] ?? ''));
            $nik = trim((string)($data['nik'] ?? ''));
            $noWa = trim((string)($data['no_wa'] ?? ''));

            if ($nis === '' || $nik === '' || $noWa === '') {
                return $this->json($response, ['success' => false, 'message' => 'NIS, NIK, dan No. HP harus diisi'], 400);
            }

            $nikValidation = NikHelper::validate($nik);
            if (!$nikValidation['valid']) {
                return $this->json($response, ['success' => false, 'message' => $nikValidation['message']], 400);
            }
            $nik = $nikValidation['normalized'];

            $santriId = SantriHelper::resolveId($this->db, $nis);
            if ($santriId === null) {
                return $this->json($response, ['success' => false, 'message' => 'NIS tidak ditemukan'], 404);
            }

            $stmt = $this->db->prepare("SELECT id, nama, id_user, nik FROM santri WHERE id = ? LIMIT 1");
            $stmt->execute([$santriId]);
            $santri = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$santri) {
                return $this->json($response, ['success' => false, 'message' => 'Data santri tidak ditemukan'], 404);
            }

            if (!empty($santri['id_user'])) {
                return $this->json($response, [
                    'success' => true,
                    'already_registered' => true,
                    'message' => 'Akun sudah terdaftar. Silakan login dengan username dan password.',
                ], 200);
            }

            // NIK yang dimasukkan harus sama dengan kolom nik di tabel santri
            $nikDb = $santri['nik'] ?? '';
            $nikDbNorm = NikHelper::normalize($nikDb);
            if ($nikDbNorm === null || $nikDbNorm === '') {
                return $this->json($response, ['success' => false, 'message' => 'Data santri belum memiliki NIK. Hubungi admin untuk melengkapi data.'], 400);
            }
            if ($nikDbNorm !== $nik) {
                return $this->json($response, ['success' => false, 'message' => 'NIK tidak sesuai dengan data santri. Masukkan NIK yang tercatat di data santri.'], 400);
            }

            return $this->json($response, [
                'success' => true,
                'already_registered' => false,
                'nama' => $santri['nama'] ?: 'Santri',
                'no_wa' => $noWa,
            ], 200);
        } catch (\Exception $e) {
            error_log('AuthControllerV2::daftarCheckSantri ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Terjadi kesalahan'], 500);
        }
    }

    /**
     * Daftar santri konfirmasi: buat token, kirim link setup akun ke WA (aktif 5 menit).
     */
    public function daftarKonfirmasiSantri(Request $request, Response $response): Response
    {
        try {
            $data = $request->getParsedBody();
            $data = is_array($data) ? TextSanitizer::sanitizeStringValues($data, ['id_pengurus', 'nik', 'no_wa', 'nis', 'username', 'no_wa_baru', 'no_wa_konfirmasi', 'username_baru', 'otp']) : [];
            $nis = trim((string)($data['nis'] ?? ''));
            $nik = trim((string)($data['nik'] ?? ''));
            $noWa = trim((string)($data['no_wa'] ?? ''));

            if ($nis === '' || $nik === '' || $noWa === '') {
                return $this->json($response, ['success' => false, 'message' => 'NIS, NIK, dan No. HP harus diisi'], 400);
            }

            $nikValidation = NikHelper::validate($nik);
            if (!$nikValidation['valid']) {
                return $this->json($response, ['success' => false, 'message' => $nikValidation['message']], 400);
            }
            $nik = $nikValidation['normalized'];

            $santriId = SantriHelper::resolveId($this->db, $nis);
            if ($santriId === null) {
                return $this->json($response, ['success' => false, 'message' => 'NIS tidak ditemukan'], 404);
            }

            $stmt = $this->db->prepare("SELECT id, nama, id_user, nik FROM santri WHERE id = ? LIMIT 1");
            $stmt->execute([$santriId]);
            $santri = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$santri || !empty($santri['id_user'])) {
                return $this->json($response, ['success' => false, 'message' => 'Data tidak valid atau sudah terdaftar'], 400);
            }

            // NIK yang dimasukkan harus sama dengan kolom nik di tabel santri
            $nikDb = $santri['nik'] ?? '';
            $nikDbNorm = NikHelper::normalize($nikDb);
            if ($nikDbNorm === null || $nikDbNorm === '') {
                return $this->json($response, ['success' => false, 'message' => 'Data santri belum memiliki NIK. Hubungi admin untuk melengkapi data.'], 400);
            }
            if ($nikDbNorm !== $nik) {
                return $this->json($response, ['success' => false, 'message' => 'NIK tidak sesuai dengan data santri. Masukkan NIK yang tercatat di data santri.'], 400);
            }

            $plainToken = bin2hex(random_bytes(32));
            $tokenHash = hash('sha256', $plainToken);
            $this->withIndonesiaTimezone(function () use ($tokenHash, $santriId, $noWa) {
                $this->insertUserSetupToken($tokenHash, 'santri', $santriId, $noWa);
            });

            $config = require __DIR__ . '/../../config.php';
            $baseUrl = $this->getMybeddianFrontendBaseUrl($request, $config);
            $link = $baseUrl . '/setup-akun?token=' . urlencode($plainToken);

            $message = "🔒 *Verifikasi Daftar Mybeddian*\n\n";
            $message .= "Link buat username dan password (aktif 5 menit):\n" . $link . "\n\n";
            $message .= "> Jangan teruskan pesan isi ke siapapun demi keamanan.";
            $logContext = ['id_santri' => $santriId, 'id_pengurus' => null, 'tujuan' => 'santri', 'id_pengurus_pengirim' => null, 'kategori' => 'setup_akun_santri', 'sumber' => 'auth'];
            $sendResult = WhatsAppService::sendMessage($noWa, $message, null, $logContext);
            if (!$sendResult['success']) {
                return $this->json($response, [
                    'success' => false,
                    'message' => 'Gagal mengirim link ke WhatsApp: ' . ($sendResult['message'] ?? 'Coba lagi nanti.'),
                ], 502);
            }
            if (WhatsAppService::deliveryWasNotActuallySent($sendResult)) {
                return $this->json($response, [
                    'success' => false,
                    'message' => 'Gagal mengirim link ke WhatsApp: ' . ($sendResult['message'] ?? 'Pesan tidak terkirim.'),
                ], 502);
            }
            if (!empty($sendResult['messageId'])) {
                try {
                    $mid = trim($sendResult['messageId']);
                    if ($this->userSetupTokensHasEntityColumns()) {
                        $this->db->prepare('UPDATE user___setup_tokens SET wa_message_id = ? WHERE token_hash = ?')->execute([$mid, $tokenHash]);
                    } elseif ($this->userSetupTokensSantriLegacyTableExists()) {
                        $wc = $this->db->query("SHOW COLUMNS FROM user___setup_tokens_santri LIKE 'wa_message_id'");
                        if ($wc !== false && $wc->rowCount() > 0) {
                            $this->db->prepare('UPDATE user___setup_tokens_santri SET wa_message_id = ? WHERE token_hash = ?')->execute([$mid, $tokenHash]);
                        }
                    }
                } catch (\Throwable $e) {
                }
            }

            return $this->json($response, [
                'success' => true,
                'message' => 'Link telah dikirim ke WhatsApp. Cek nomor yang Anda masukkan. Link aktif 5 menit.',
            ], 200);
        } catch (\RuntimeException $e) {
            error_log('AuthControllerV2::daftarKonfirmasiSantri ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Layanan sementara tidak tersedia. Coba lagi dalam beberapa saat.'], 503);
        } catch (\Throwable $e) {
            error_log('AuthControllerV2::daftarKonfirmasiSantri ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
            return $this->json($response, ['success' => false, 'message' => 'Terjadi kesalahan server. Coba lagi atau hubungi admin.'], 500);
        }
    }

    /**
     * Validasi token setup santri; return valid + nama untuk tampilan form.
     */
    public function getSetupTokenSantri(Request $request, Response $response): Response
    {
        try {
            $token = $this->normalizeSecurityToken((string) ($request->getQueryParams()['token'] ?? ''));
            if ($token === '') {
                return $this->json($response, ['success' => true, 'valid' => false], 200);
            }

            $tokenHash = hash('sha256', $token);
            $row = $this->withIndonesiaTimezone(function () use ($tokenHash) {
                if ($this->userSetupTokensHasEntityColumns()) {
                    $stmt = $this->db->prepare("
                    SELECT st.id, st.entity_id, s.nama
                    FROM user___setup_tokens st
                    INNER JOIN santri s ON st.entity_type = 'santri' AND s.id = st.entity_id
                    WHERE st.token_hash = ? AND st.expires_at > NOW()
                ");
                    $stmt->execute([$tokenHash]);
                    return $stmt->fetch(\PDO::FETCH_ASSOC);
                }
                if ($this->userSetupTokensSantriLegacyTableExists()) {
                    $stmt = $this->db->prepare("
                        SELECT st.id, st.id_santri AS entity_id, s.nama
                        FROM user___setup_tokens_santri st
                        INNER JOIN santri s ON s.id = st.id_santri
                        WHERE st.token_hash = ? AND st.expires_at > NOW()
                    ");
                    $stmt->execute([$tokenHash]);
                    return $stmt->fetch(\PDO::FETCH_ASSOC);
                }
                return false;
            });

            if (!$row) {
                try {
                    if ($this->userSetupTokensHasEntityColumns()) {
                        $stmtInv = $this->db->prepare('SELECT id, wa_message_id, no_wa FROM user___setup_tokens WHERE token_hash = ?');
                        $stmtInv->execute([$tokenHash]);
                        $inv = $stmtInv->fetch(\PDO::FETCH_ASSOC);
                        if ($inv && !empty($inv['wa_message_id']) && !empty($inv['no_wa'])) {
                            $isExpired = $this->withIndonesiaTimezone(function () use ($inv) {
                                $r = $this->db->prepare('SELECT 1 FROM user___setup_tokens WHERE id = ? AND expires_at <= NOW()');
                                $r->execute([$inv['id']]);
                                return $r->fetch() !== false;
                            });
                            if ($isExpired) {
                                $this->editWaMessageTokenInvalidated($inv['no_wa'], $inv['wa_message_id'], 'kadaluarsa', '🔒 Verifikasi Daftar Mybeddian');
                                $this->db->prepare('UPDATE user___setup_tokens SET wa_message_id = NULL WHERE id = ?')->execute([$inv['id']]);
                            }
                        }
                    } elseif ($this->userSetupTokensSantriLegacyTableExists()) {
                        $stmtInv = $this->db->prepare('SELECT id, wa_message_id, no_wa FROM user___setup_tokens_santri WHERE token_hash = ?');
                        $stmtInv->execute([$tokenHash]);
                        $inv = $stmtInv->fetch(\PDO::FETCH_ASSOC);
                        if ($inv && !empty($inv['wa_message_id']) && !empty($inv['no_wa'])) {
                            $isExpired = $this->withIndonesiaTimezone(function () use ($inv) {
                                $r = $this->db->prepare('SELECT 1 FROM user___setup_tokens_santri WHERE id = ? AND expires_at <= NOW()');
                                $r->execute([$inv['id']]);
                                return $r->fetch() !== false;
                            });
                            if ($isExpired) {
                                $this->editWaMessageTokenInvalidated($inv['no_wa'], $inv['wa_message_id'], 'kadaluarsa', '🔒 Verifikasi Daftar Mybeddian');
                                $wc = $this->db->query("SHOW COLUMNS FROM user___setup_tokens_santri LIKE 'wa_message_id'");
                                if ($wc !== false && $wc->rowCount() > 0) {
                                    $this->db->prepare('UPDATE user___setup_tokens_santri SET wa_message_id = NULL WHERE id = ?')->execute([$inv['id']]);
                                }
                            }
                        }
                    }
                } catch (\Throwable $e) {
                }
                return $this->json($response, ['success' => true, 'valid' => false], 200);
            }

            return $this->json($response, [
                'success' => true,
                'valid' => true,
                'nama' => $row['nama'] ?: 'Santri',
            ], 200);
        } catch (\Exception $e) {
            error_log('AuthControllerV2::getSetupTokenSantri ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Terjadi kesalahan'], 500);
        }
    }

    /**
     * Buat akun santri: token, username (min 5), password (min 6). Link users ke santri.
     */
    public function postSetupAkunSantri(Request $request, Response $response): Response
    {
        try {
            $data = $request->getParsedBody();
            $data = is_array($data) ? TextSanitizer::sanitizeStringValues($data, ['id_pengurus', 'nik', 'no_wa', 'nis', 'username', 'no_wa_baru', 'no_wa_konfirmasi', 'username_baru', 'otp']) : [];
            $token = $this->normalizeSecurityToken((string) ($data['token'] ?? ''));
            $username = trim($data['username'] ?? '');
            $password = $data['password'] ?? '';

            if ($token === '') {
                return $this->json($response, ['success' => false, 'message' => 'Token tidak valid atau kadaluarsa'], 400);
            }
            if (strlen($username) < 5) {
                return $this->json($response, ['success' => false, 'message' => 'Username minimal 5 karakter'], 400);
            }
            if (preg_match('/\s/', $username)) {
                return $this->json($response, ['success' => false, 'message' => 'Username tidak boleh mengandung spasi'], 400);
            }
            if (strlen($password) < 6) {
                return $this->json($response, ['success' => false, 'message' => 'Password minimal 6 karakter'], 400);
            }

            $tokenHash = hash('sha256', $token);
            $row = $this->withIndonesiaTimezone(function () use ($tokenHash) {
                if ($this->userSetupTokensHasEntityColumns()) {
                    $stmt = $this->db->prepare("
                    SELECT st.id, st.entity_id, st.no_wa
                    FROM user___setup_tokens st
                    INNER JOIN santri s ON st.entity_type = 'santri' AND s.id = st.entity_id AND s.id_user IS NULL
                    WHERE st.token_hash = ? AND st.expires_at > NOW()
                ");
                    $stmt->execute([$tokenHash]);
                    return $stmt->fetch(\PDO::FETCH_ASSOC);
                }
                if ($this->userSetupTokensSantriLegacyTableExists()) {
                    $nw = $this->userSetupTokensSantriLegacyHasNoWaColumn() ? 'st.no_wa' : 'NULL AS no_wa';
                    $stmt = $this->db->prepare("
                        SELECT st.id, st.id_santri AS entity_id, {$nw}
                        FROM user___setup_tokens_santri st
                        INNER JOIN santri s ON s.id = st.id_santri AND s.id_user IS NULL
                        WHERE st.token_hash = ? AND st.expires_at > NOW()
                    ");
                    $stmt->execute([$tokenHash]);
                    return $stmt->fetch(\PDO::FETCH_ASSOC);
                }
                return false;
            });
            if (!$row) {
                return $this->json($response, ['success' => false, 'message' => 'Token tidak valid atau kadaluarsa'], 400);
            }

            $stmt = $this->db->prepare("SELECT id FROM users WHERE LOWER(TRIM(username)) = LOWER(?)");
            $stmt->execute([$username]);
            if ($stmt->fetch()) {
                return $this->json($response, ['success' => false, 'message' => 'Username sudah dipakai'], 400);
            }

            $idSantri = (int) $row['entity_id'];
            $noWa = isset($row['no_wa']) && $row['no_wa'] !== null && $row['no_wa'] !== '' ? trim((string) $row['no_wa']) : null;
            $email = null;
            if ($noWa !== null) {
                $noWaNorm = $this->normalizeNoWaTo62($noWa);
                if ($noWaNorm !== null && $this->isNoWaUsedByOtherUser($noWaNorm)) {
                    return $this->json($response, ['success' => false, 'message' => 'Nomor WA sudah dipakai'], 400);
                }
            }

            $passwordHash = PasswordHelper::hashPassword($password);
            $ins = $this->db->prepare("
                INSERT INTO users (username, password, no_wa, email, role, is_active)
                VALUES (?, ?, ?, ?, 'santri', 1)
            ");
            try {
                $ins->execute([$username, $passwordHash, $noWa, $email]);
            } catch (\PDOException $pdoEx) {
                $duplicateMessage = $this->getUsersDuplicateFieldMessage($pdoEx);
                if ($duplicateMessage !== null) {
                    return $this->json($response, ['success' => false, 'message' => $duplicateMessage], 400);
                }
                throw $pdoEx;
            }
            $userId = (int) $this->db->lastInsertId();

            $this->db->prepare("INSERT INTO user___password_history (user_id, password_hash) VALUES (?, ?)")->execute([$userId, $passwordHash]);
            $this->db->prepare("UPDATE users SET no_wa_verified_at = NOW() WHERE id = ?")->execute([$userId]);
            $this->db->prepare("UPDATE santri SET id_user = ? WHERE id = ?")->execute([$userId, $idSantri]);
            try {
                if ($this->userSetupTokensHasEntityColumns()) {
                    $stmtWa = $this->db->prepare('SELECT wa_message_id, no_wa FROM user___setup_tokens WHERE token_hash = ?');
                    $stmtWa->execute([$tokenHash]);
                    $waRow = $stmtWa->fetch(\PDO::FETCH_ASSOC);
                    if ($waRow && !empty($waRow['wa_message_id']) && !empty($waRow['no_wa'])) {
                        $this->editWaMessageTokenInvalidated($waRow['no_wa'], $waRow['wa_message_id'], 'dipakai', '🔒 Verifikasi Daftar Mybeddian');
                    }
                } elseif ($this->userSetupTokensSantriLegacyTableExists()) {
                    $stmtWa = $this->db->prepare('SELECT wa_message_id, no_wa FROM user___setup_tokens_santri WHERE token_hash = ?');
                    $stmtWa->execute([$tokenHash]);
                    $waRow = $stmtWa->fetch(\PDO::FETCH_ASSOC);
                    if ($waRow && !empty($waRow['wa_message_id']) && !empty($waRow['no_wa'])) {
                        $this->editWaMessageTokenInvalidated($waRow['no_wa'], $waRow['wa_message_id'], 'dipakai', '🔒 Verifikasi Daftar Mybeddian');
                    }
                }
            } catch (\Throwable $e) {
            }
            if ($this->userSetupTokensHasEntityColumns()) {
                $this->db->prepare('DELETE FROM user___setup_tokens WHERE token_hash = ?')->execute([$tokenHash]);
            } elseif ($this->userSetupTokensSantriLegacyTableExists()) {
                $this->db->prepare('DELETE FROM user___setup_tokens_santri WHERE token_hash = ?')->execute([$tokenHash]);
            }

            AuditLogger::log((string)$userId, 'setup_akun_santri', ['username' => $username, 'id_santri' => $idSantri], $this->getClientIp($request), true);

            return $this->json($response, [
                'success' => true,
                'message' => 'Akun berhasil dibuat. Silakan login dengan username dan password.',
            ], 200);
        } catch (\Exception $e) {
            error_log('AuthControllerV2::postSetupAkunSantri ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Terjadi kesalahan'], 500);
        }
    }

    /**
     * Login dengan username dan password (tabel users).
     */
    public function login(Request $request, Response $response): Response
    {
        try {
            $data = $request->getParsedBody();
            $data = is_array($data) ? TextSanitizer::sanitizeStringValues($data, ['id_pengurus', 'nik', 'no_wa', 'nis', 'username', 'no_wa_baru', 'no_wa_konfirmasi', 'username_baru', 'otp']) : [];
            $username = trim($data['username'] ?? '');
            $password = $data['password'] ?? '';

            if ($username === '' || $password === '') {
                return $this->json($response, ['success' => false, 'message' => 'Username dan password harus diisi'], 400);
            }

            $ip = $this->getClientIp($request);
            // FIX: Penulisan conditional operator yang salah pada $userAgent
            $userAgent = $request->getHeaderLine('User-Agent');
            $uaShort = $userAgent !== null && $userAgent !== '' ? substr($userAgent, 0, 500) : null;

            $stmt = $this->db->prepare("SELECT id, username, password, role, is_active FROM users WHERE username = ? LIMIT 1");
            $stmt->execute([$username]);
            $user = $stmt->fetch(\PDO::FETCH_ASSOC);

            if (!$user) {
                LoginSuspiciousHelper::notifyIfThirdFailure($this->db, $ip, LoginSuspiciousHelper::ENDPOINT_V2, $username);
                AuditLogger::log('0', 'login_failed', ['username' => $username, 'user_agent' => $uaShort], $ip, false);
                return $this->json($response, ['success' => false, 'message' => 'Username atau password salah'], 401);
            }

            if ((int)($user['is_active'] ?? 1) !== 1) {
                AuditLogger::log((string)$user['id'], 'login_failed', ['reason' => 'akun_tidak_aktif', 'user_agent' => $uaShort], $ip, false);
                return $this->json($response, ['success' => false, 'message' => 'Akun tidak aktif'], 403);
            }

            if (!PasswordHelper::verifyPassword($password, $user['password'])) {
                LoginSuspiciousHelper::notifyIfThirdFailure($this->db, $ip, LoginSuspiciousHelper::ENDPOINT_V2, $username);
                AuditLogger::log((string)$user['id'], 'login_failed', ['reason' => 'password_salah', 'user_agent' => $uaShort], $ip, false);
                return $this->json($response, ['success' => false, 'message' => 'Username atau password salah'], 401);
            }

            $usersId = (int) $user['id'];

            // Hitung login password (untuk pengingat daftar passkey: ke-1, ke-8, ke-15, … jika belum ada passkey)
            $showPasskeyPrompt = false;
            try {
                $this->db->prepare('UPDATE users SET password_login_count = COALESCE(password_login_count, 0) + 1 WHERE id = ?')->execute([$usersId]);
                $st = $this->db->prepare('SELECT password_login_count FROM users WHERE id = ? LIMIT 1');
                $st->execute([$usersId]);
                $urow = $st->fetch(\PDO::FETCH_ASSOC);
                $stPk = $this->db->prepare('SELECT 1 FROM user___webauthn WHERE users_id = ? LIMIT 1');
                $stPk->execute([$usersId]);
                $hasPasskey = (bool) $stPk->fetch(\PDO::FETCH_ASSOC);
                $count = (int) ($urow['password_login_count'] ?? 0);
                $showPasskeyPrompt = !$hasPasskey && $count >= 1 && ($count - 1) % 7 === 0;
            } catch (\Throwable $e) {
                error_log('AuthControllerV2::login password_login_count: ' . $e->getMessage());
            }

            return $this->completeLoginSession(
                $response,
                $usersId,
                $user['username'],
                $request,
                $data,
                $ip,
                $userAgent,
                $uaShort,
                ['show_passkey_prompt' => $showPasskeyPrompt]
            );
        } catch (\Throwable $e) {
            error_log('AuthControllerV2::login ' . $e->getMessage());
            error_log('AuthControllerV2::login trace: ' . $e->getTraceAsString());
            return $this->json($response, ['success' => false, 'message' => 'Terjadi kesalahan'], 500);
        }
    }

    /**
     * Selesaikan login (JWT, session, audit) untuk users.id yang sudah terverifikasi — dipakai password login & WebAuthn.
     *
     * @param array<string, mixed> $data
     */
    /**
     * @param array<string, mixed>|null $loginDataExtras mis. show_passkey_prompt (hanya login password)
     */
    private function completeLoginSession(
        Response $response,
        int $usersId,
        string $username,
        Request $request,
        array $data,
        string $ip,
        string $userAgent,
        ?string $uaShort,
        ?array $loginDataExtras = null
    ): Response {
        // Satu user (users.id) bisa punya identitas pengurus DAN santri: cek keduanya
        $pengurusId = null;
        $santriId = null;
        $pengurus = null;
        $santri = null;

        $stmt = $this->db->prepare("SELECT id, nama, nip FROM pengurus WHERE id_user = ? LIMIT 1");
        $stmt->execute([$usersId]);
        $pengurus = $stmt->fetch(\PDO::FETCH_ASSOC);
        if ($pengurus) {
            $pengurusId = (int) $pengurus['id'];
        }

        $stmt = $this->db->prepare("SELECT id, nama FROM santri WHERE id_user = ? LIMIT 1");
        $stmt->execute([$usersId]);
        $santri = $stmt->fetch(\PDO::FETCH_ASSOC);
        if ($santri) {
            $santriId = (int) $santri['id'];
        }

        $tokoId = null;
        $tokoNama = null;
        $stmt = $this->db->prepare("SELECT id, nama_toko FROM cashless___pedagang WHERE id_users = ? LIMIT 1");
        $stmt->execute([$usersId]);
        $toko = $stmt->fetch(\PDO::FETCH_ASSOC);
        if ($toko) {
            $tokoId = (int) $toko['id'];
            $tokoNama = $toko['nama_toko'] ?? '';
        }

        if ($pengurusId === null && $santriId === null && $tokoId === null) {
            return $this->json($response, ['success' => false, 'message' => 'Data pengurus, santri, atau toko tidak ditemukan untuk akun ini'], 403);
        }

        $allRoleKeys = [];
        $allowedApps = [];
        $permissions = [];
        $lembagaId = null;
        $lembagaScopeAll = false;
        $lembagaIds = [];
        $primaryRoleKey = 'user';
        $primaryRoleLabel = 'User';

        if ($pengurusId !== null) {
            $roleInfoPengurus = RoleHelper::getRoleInfoForToken($pengurusId);
            $allRoleKeys = RoleHelper::getAllRoleKeysNormalizedForPengurus($pengurusId);
            $allowedApps = array_merge($allowedApps, $roleInfoPengurus['allowed_apps'] ?? []);
            $permissions = array_merge($permissions, $roleInfoPengurus['permissions'] ?? []);
            $lembagaId = $roleInfoPengurus['lembaga_id'] ?? null;
            $lembagaScopeAll = (bool)($roleInfoPengurus['lembaga_scope_all'] ?? false);
            $lembagaIds = $roleInfoPengurus['lembaga_ids'] ?? [];
            $primaryRoleKey = $roleInfoPengurus['role_key'] ?? 'pengurus';
            $primaryRoleLabel = $roleInfoPengurus['role_label'] ?? 'Pengurus';
        }

        if ($santriId !== null) {
            if (!in_array('santri', $allRoleKeys, true)) {
                $allRoleKeys[] = 'santri';
            }
            if (!in_array('mybeddian', $allowedApps, true)) {
                $allowedApps[] = 'mybeddian';
            }
            if ($pengurusId === null && $tokoId === null) {
                $primaryRoleKey = 'santri';
                $primaryRoleLabel = 'Santri';
            }
        }

        if ($tokoId !== null) {
            if (!in_array('toko', $allRoleKeys, true)) {
                $allRoleKeys[] = 'toko';
            }
            if (!in_array('mybeddian', $allowedApps, true)) {
                $allowedApps[] = 'mybeddian';
            }
            if ($pengurusId === null && $santriId === null) {
                $primaryRoleKey = 'toko';
                $primaryRoleLabel = 'Toko';
            }
        }

        $allRoleKeys = array_values(array_unique($allRoleKeys));
        sort($allRoleKeys);

        $allowedApps = array_values(array_unique($allowedApps));
        $permissions = array_values(array_unique($permissions));

        $nama = $pengurus['nama'] ?? $santri['nama'] ?? $username;
        $roleInfo = [
            'role_key' => $primaryRoleKey,
            'role_label' => $primaryRoleLabel,
            'allowed_apps' => $allowedApps,
            'permissions' => $permissions,
            'lembaga_id' => $lembagaId,
            'lembaga_scope_all' => $lembagaScopeAll,
            'lembaga_ids' => $lembagaIds,
        ];

        $this->db->prepare("UPDATE users SET last_login_at = NOW() WHERE id = ?")->execute([$usersId]);

        $jti = bin2hex(random_bytes(16));
        $isRealSuperAdmin = $pengurusId !== null && in_array('super_admin', $allRoleKeys, true);
        $tokenPayload = [
            'user_id' => $pengurusId ?? $usersId,
            'users_id' => $usersId,
            'user_name' => $nama,
            'username' => $username,
            'jti' => $jti,
            'user_role' => $roleInfo['role_key'],
            'role_key' => $roleInfo['role_key'],
            'role_label' => $roleInfo['role_label'],
            'all_roles' => $allRoleKeys,
            'allowed_apps' => $roleInfo['allowed_apps'],
            'permissions' => $roleInfo['permissions'],
            'lembaga_id' => $roleInfo['lembaga_id'],
            'lembaga_scope_all' => (bool)($roleInfo['lembaga_scope_all'] ?? false),
            'lembaga_ids' => $roleInfo['lembaga_ids'] ?? [],
            'is_real_super_admin' => $isRealSuperAdmin,
        ];
        if ($pengurusId !== null) {
            $tokenPayload['id_pengurus'] = $pengurusId;
        }
        if ($santriId !== null) {
            $tokenPayload['santri_id'] = $santriId;
        }
        if ($tokoId !== null) {
            $tokenPayload['has_toko'] = true;
            $tokenPayload['toko_id'] = $tokoId;
            $tokenPayload['toko_nama'] = $tokoNama;
        }
        $token = $this->jwt->generateToken($tokenPayload);

        $parsed = UserAgentHelper::parse($userAgent);
        $deviceFingerprint = isset($data['device_fingerprint']) ? trim((string) $data['device_fingerprint']) : null;
        if ($deviceFingerprint !== null && $deviceFingerprint === '') {
            $deviceFingerprint = null;
        }
        $deviceId = $this->resolveDeviceId($data);
        $platform = isset($data['platform']) ? trim(substr((string) $data['platform'], 0, 50)) : null;
        $timezone = isset($data['timezone']) ? trim(substr((string) $data['timezone'], 0, 100)) : null;
        $language = isset($data['language']) ? trim(substr((string) $data['language'], 0, 20)) : null;
        $screen = isset($data['screen']) ? trim(substr((string) $data['screen'], 0, 50)) : null;
        if ($platform === '') { $platform = null; }
        if ($timezone === '') { $timezone = null; }
        if ($language === '') { $language = null; }
        if ($screen === '') { $screen = null; }
        $sessionHash = hash('sha256', $jti);

        try {
            $ins = $this->db->prepare("
                INSERT INTO user___sessions (
                    user_id, session_token_hash, ip_address, user_agent, device_type,
                    browser_name, browser_version, os_name, os_version, device_fingerprint,
                    device_id, platform, timezone, language, screen
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ");
            $ins->execute([
                $usersId,
                $sessionHash,
                $ip,
                $uaShort,
                $parsed['device_type'],
                $parsed['browser_name'],
                $parsed['browser_version'],
                $parsed['os_name'],
                $parsed['os_version'],
                $deviceFingerprint,
                $deviceId,
                $platform,
                $timezone,
                $language,
                $screen,
            ]);
        } catch (\Throwable $e) {
            try {
                $ins = $this->db->prepare("
                    INSERT INTO user___sessions (user_id, session_token_hash, ip_address, user_agent, device_type,
                    browser_name, browser_version, os_name, os_version, device_fingerprint)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ");
                $ins->execute([
                    $usersId,
                    $sessionHash,
                    $ip,
                    $uaShort,
                    $parsed['device_type'],
                    $parsed['browser_name'],
                    $parsed['browser_version'],
                    $parsed['os_name'],
                    $parsed['os_version'],
                    $deviceFingerprint,
                ]);
            } catch (\Throwable $e2) {
                $ins = $this->db->prepare(
                    "INSERT INTO user___sessions (user_id, session_token_hash, ip_address, user_agent) VALUES (?, ?, ?, ?)"
                );
                $ins->execute([$usersId, $sessionHash, $ip, $uaShort]);
            }
        }

        try {
            $this->pruneSessionsToLimit($usersId, 3);
        } catch (\Throwable $e) {
            error_log('AuthControllerV2::completeLoginSession pruneSessions failed: ' . $e->getMessage());
        }

        try {
            AuditLogger::log((string)$usersId, 'login', ['user_agent' => $uaShort, 'device_type' => $parsed['device_type']], $ip, true);
        } catch (\Throwable $e) {
            error_log('AuthControllerV2::completeLoginSession audit log failed: ' . $e->getMessage());
        }

        $allowedApps = $roleInfo['allowed_apps'];
        $loginUser = [
            'id' => $pengurusId ?? $santriId ?? $usersId,
            'users_id' => $usersId,
            'nama' => $nama,
            'username' => $username,
            'role_key' => $roleInfo['role_key'],
            'role_label' => $roleInfo['role_label'],
            'all_roles' => $allRoleKeys,
            'allowed_apps' => $allowedApps,
            'permissions' => $roleInfo['permissions'],
            'lembaga_id' => $roleInfo['lembaga_id'],
            'lembaga_scope_all' => (bool)($roleInfo['lembaga_scope_all'] ?? false),
            'lembaga_ids' => $roleInfo['lembaga_ids'] ?? [],
            'level' => $roleInfo['role_key'],
        ];
        if ($pengurusId !== null) {
            $loginUser['id_pengurus'] = $pengurusId;
        }
        if ($pengurusId !== null && isset($pengurus['nip'])) {
            $loginUser['pengurus'] = ['nip' => $pengurus['nip'] !== null && $pengurus['nip'] !== '' ? (string) $pengurus['nip'] : null];
        }
        if ($santriId !== null) {
            $loginUser['santri_id'] = $santriId;
        }
        if ($tokoId !== null) {
            $loginUser['has_toko'] = true;
            $loginUser['toko_id'] = $tokoId;
            $loginUser['toko_nama'] = $tokoNama;
        }
        $loginUser['is_real_super_admin'] = $isRealSuperAdmin;
        $loginData = [
            'token' => $token,
            'user' => $loginUser,
            'redirect_url' => '/',
        ];
        if (isset($deviceId)) {
            $loginData['device_id'] = $deviceId;
        }
        if (is_array($loginDataExtras)) {
            foreach ($loginDataExtras as $k => $v) {
                $loginData[$k] = $v;
            }
        }

        return $this->json($response, [
            'success' => true,
            'message' => 'Login berhasil',
            'data' => $loginData,
        ], 200);
    }

    /**
     * Login sukses setelah verifikasi non-password (mis. WebAuthn).
     *
     * @param array<string, mixed>|null $overrideBody parsed body opsional (device fingerprint, dll.)
     * @param array<string, mixed>|null $loginDataExtras ditambahkan ke objek `data` respons (mis. credential_db_id setelah WebAuthn)
     */
    public function finalizeLoginForUserId(Request $request, Response $response, int $usersId, ?array $overrideBody = null, ?array $loginDataExtras = null): Response
    {
        $data = $overrideBody ?? $request->getParsedBody();
        $data = is_array($data) ? TextSanitizer::sanitizeStringValues($data, ['id_pengurus', 'nik', 'no_wa', 'nis', 'username', 'no_wa_baru', 'no_wa_konfirmasi', 'username_baru', 'otp']) : [];
        $ip = $this->getClientIp($request);
        $userAgent = $request->getHeaderLine('User-Agent');
        $uaShort = $userAgent !== null && $userAgent !== '' ? substr($userAgent, 0, 500) : null;

        $stmt = $this->db->prepare("SELECT id, username, role, is_active FROM users WHERE id = ? LIMIT 1");
        $stmt->execute([$usersId]);
        $user = $stmt->fetch(\PDO::FETCH_ASSOC);
        if (!$user) {
            return $this->json($response, ['success' => false, 'message' => 'Pengguna tidak ditemukan'], 401);
        }
        if ((int)($user['is_active'] ?? 1) !== 1) {
            return $this->json($response, ['success' => false, 'message' => 'Akun tidak aktif'], 403);
        }

        return $this->completeLoginSession(
            $response,
            $usersId,
            $user['username'],
            $request,
            $data,
            $ip,
            $userAgent,
            $uaShort,
            $loginDataExtras
        );
    }

    /**
     * Ambil users.id dari JWT payload.
     * Prioritas: users_id (dari login V2 multi-role) -> id_user dari pengurus -> user_id sebagai users.id (santri).
     */
    private function getUsersIdFromPayload(array $payload): ?int
    {
        if (isset($payload['users_id']) && (int)$payload['users_id'] > 0) {
            return (int)$payload['users_id'];
        }
        $userIdFromToken = (int)($payload['user_id'] ?? 0);
        if ($userIdFromToken <= 0) {
            return null;
        }
        $stmt = $this->db->prepare("SELECT id_user FROM pengurus WHERE id = ? LIMIT 1");
        $stmt->execute([$userIdFromToken]);
        $row = $stmt->fetch(\PDO::FETCH_ASSOC);
        return $row && !empty($row['id_user']) ? (int)$row['id_user'] : $userIdFromToken;
    }

    /** UUID v4 untuk device_id (id unik per perangkat). */
    private function generateDeviceId(): string
    {
        $b = random_bytes(16);
        $b[6] = chr(ord($b[6]) & 0x0f | 0x40);
        $b[8] = chr(ord($b[8]) & 0x3f | 0x80);
        return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($b), 4));
    }

    /** Dari body: device_id (jika valid UUID) dipakai, else generate baru. */
    private function resolveDeviceId(array $data): string
    {
        $raw = isset($data['device_id']) ? trim((string) $data['device_id']) : '';
        if ($raw !== '' && preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i', $raw)) {
            return $raw;
        }
        return $this->generateDeviceId();
    }

    /**
     * POST logout: hapus session saat ini (revoke token ini).
     */
    public function logout(Request $request, Response $response): Response
    {
        try {
            $payload = $request->getAttribute('user');
            $jti = $payload['jti'] ?? null;
            if ($jti === null) {
                return $this->json($response, ['success' => true, 'message' => 'Logged out'], 200);
            }
            $usersId = $this->getUsersIdFromPayload($payload);
            if ($usersId === null) {
                return $this->json($response, ['success' => true, 'message' => 'Logged out'], 200);
            }
            $sessionHash = hash('sha256', $jti);
            $this->db->prepare("DELETE FROM user___sessions WHERE session_token_hash = ? AND user_id = ?")->execute([$sessionHash, $usersId]);
            AuditLogger::log((string)$usersId, 'logout', [], $this->getClientIp($request), true);
            return $this->json($response, ['success' => true, 'message' => 'Logged out'], 200);
        } catch (\Exception $e) {
            error_log('AuthControllerV2::logout ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Terjadi kesalahan'], 500);
        }
    }

    /**
     * GET sessions: daftar session aktif (untuk aktivitas - sedang aktif di mana saja).
     */
    public function getSessions(Request $request, Response $response): Response
    {
        try {
            $payload = $request->getAttribute('user');
            $usersId = $this->getUsersIdFromPayload($payload);
            if ($usersId === null) {
                return $this->json($response, ['success' => false, 'message' => 'User tidak valid'], 403);
            }
            $jti = $payload['jti'] ?? null;
            $currentHash = $jti !== null ? hash('sha256', $jti) : null;
            $list = [];
            try {
                $stmt = $this->db->prepare("
                    SELECT id, session_token_hash, ip_address, user_agent, device_type, browser_name, browser_version, os_name, os_version, device_fingerprint, device_id, platform, timezone, language, screen, last_activity_at, created_at
                    FROM user___sessions
                    WHERE user_id = ?
                    ORDER BY last_activity_at DESC
                ");
                $stmt->execute([$usersId]);
                $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);
                foreach ($rows as $row) {
                    $hash = $row['session_token_hash'] ?? null;
                    unset($row['session_token_hash']);
                    $list[] = [
                        'id' => (int)$row['id'],
                        'ip_address' => $row['ip_address'],
                        'user_agent' => $row['user_agent'],
                        'device_type' => $row['device_type'],
                        'browser_name' => $row['browser_name'],
                        'browser_version' => $row['browser_version'],
                        'os_name' => $row['os_name'],
                        'os_version' => $row['os_version'],
                        'device_fingerprint' => $row['device_fingerprint'],
                        'device_id' => $row['device_id'] ?? null,
                        'platform' => $row['platform'] ?? null,
                        'timezone' => $row['timezone'] ?? null,
                        'language' => $row['language'] ?? null,
                        'screen' => $row['screen'] ?? null,
                        'last_activity_at' => $row['last_activity_at'],
                        'created_at' => $row['created_at'],
                        'current' => $currentHash !== null && $hash === $currentHash,
                    ];
                }
            } catch (\Throwable $e) {
                if (strpos($e->getMessage(), 'device_id') === false && strpos($e->getMessage(), 'Unknown column') === false) {
                    throw $e;
                }
                $stmt = $this->db->prepare("
                    SELECT id, session_token_hash, ip_address, user_agent, device_type, browser_name, browser_version, os_name, os_version, device_fingerprint, last_activity_at, created_at
                    FROM user___sessions
                    WHERE user_id = ?
                    ORDER BY last_activity_at DESC
                ");
                $stmt->execute([$usersId]);
                $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);
                foreach ($rows as $row) {
                    $hash = $row['session_token_hash'] ?? null;
                    unset($row['session_token_hash']);
                    $list[] = [
                        'id' => (int)$row['id'],
                        'ip_address' => $row['ip_address'],
                        'user_agent' => $row['user_agent'],
                        'device_type' => $row['device_type'],
                        'browser_name' => $row['browser_name'],
                        'browser_version' => $row['browser_version'],
                        'os_name' => $row['os_name'],
                        'os_version' => $row['os_version'],
                        'device_fingerprint' => $row['device_fingerprint'],
                        'device_id' => null,
                        'platform' => null,
                        'timezone' => null,
                        'language' => null,
                        'screen' => null,
                        'last_activity_at' => $row['last_activity_at'],
                        'created_at' => $row['created_at'],
                        'current' => $currentHash !== null && $hash === $currentHash,
                    ];
                }
            }
            return $this->json($response, ['success' => true, 'data' => $list], 200);
        } catch (\Exception $e) {
            error_log('AuthControllerV2::getSessions ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Terjadi kesalahan'], 500);
        }
    }

    /**
     * DELETE sessions/{id}: revoke session tertentu (logout perangkat itu).
     */
    public function revokeSession(Request $request, Response $response, array $args): Response
    {
        try {
            $payload = $request->getAttribute('user');
            $usersId = $this->getUsersIdFromPayload($payload);
            if ($usersId === null) {
                return $this->json($response, ['success' => false, 'message' => 'User tidak valid'], 403);
            }
            $sessionId = (int)($args['id'] ?? 0);
            if ($sessionId <= 0) {
                return $this->json($response, ['success' => false, 'message' => 'ID session tidak valid'], 400);
            }
            $stmt = $this->db->prepare("DELETE FROM user___sessions WHERE id = ? AND user_id = ?");
            $stmt->execute([$sessionId, $usersId]);
            if ($stmt->rowCount() === 0) {
                return $this->json($response, ['success' => false, 'message' => 'Session tidak ditemukan'], 404);
            }
            AuditLogger::log((string)$usersId, 'revoke_session', ['session_id' => $sessionId], $this->getClientIp($request), true);
            return $this->json($response, ['success' => true, 'message' => 'Session telah logout'], 200);
        } catch (\Exception $e) {
            error_log('AuthControllerV2::revokeSession ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Terjadi kesalahan'], 500);
        }
    }

    /**
     * POST logout-all: hapus semua session kecuali yang saat ini.
     */
    public function logoutAll(Request $request, Response $response): Response
    {
        try {
            $payload = $request->getAttribute('user');
            $usersId = $this->getUsersIdFromPayload($payload);
            if ($usersId === null) {
                return $this->json($response, ['success' => false, 'message' => 'User tidak valid'], 403);
            }
            $jti = $payload['jti'] ?? null;
            if ($jti === null) {
                return $this->json($response, ['success' => true, 'message' => 'Tidak ada session untuk revoke'], 200);
            }
            $sessionHash = hash('sha256', $jti);
            $this->db->prepare("DELETE FROM user___sessions WHERE user_id = ? AND session_token_hash != ?")->execute([$usersId, $sessionHash]);
            AuditLogger::log((string)$usersId, 'logout_all', [], $this->getClientIp($request), true);
            return $this->json($response, ['success' => true, 'message' => 'Semua session lain telah logout'], 200);
        } catch (\Exception $e) {
            error_log('AuthControllerV2::logoutAll ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Terjadi kesalahan'], 500);
        }
    }

    /**
     * GET no-wa-mask: tampilkan nomor WA yang dimask (untuk konfirmasi di profil).
     * Response: no_wa_mask (e.g. *******052), 4 digit terakhir.
     * Mendukung pengurus (user_id = pengurus.id) dan santri (user_id = users.id).
     */
    public function getNoWaMask(Request $request, Response $response): Response
    {
        try {
            $payload = $request->getAttribute('user');
            $pArr = is_array($payload) ? $payload : [];
            $userIdFromToken = (int)($payload['user_id'] ?? 0);
            if ($userIdFromToken <= 0) {
                return $this->json($response, ['success' => false, 'message' => 'User tidak valid'], 403);
            }
            $noWa = '';
            if (RoleHelper::tokenIsSantriDaftarContext($pArr)) {
                $stmt = $this->db->prepare("SELECT no_wa FROM users WHERE id = ?");
                $stmt->execute([$userIdFromToken]);
                $row = $stmt->fetch(\PDO::FETCH_ASSOC);
                $noWa = isset($row['no_wa']) ? preg_replace('/\D/', '', trim($row['no_wa'])) : '';
            } else {
                $stmt = $this->db->prepare("SELECT p.id_user, u.no_wa FROM pengurus p LEFT JOIN users u ON u.id = p.id_user WHERE p.id = ?");
                $stmt->execute([$userIdFromToken]);
                $row = $stmt->fetch(\PDO::FETCH_ASSOC);
                if (!$row || empty($row['id_user'])) {
                    return $this->json($response, ['success' => false, 'message' => 'Akun belum terhubung ke users. Silakan daftar akun dulu.'], 400);
                }
                $noWa = isset($row['no_wa']) ? preg_replace('/\D/', '', trim($row['no_wa'])) : '';
            }
            if (strlen($noWa) < 4) {
                return $this->json($response, ['success' => false, 'message' => 'Nomor WA belum diisi'], 400);
            }
            $last4 = substr($noWa, -4);
            $masked = '*******' . $last4;
            return $this->json($response, ['success' => true, 'no_wa_mask' => $masked, 'digit_terakhir' => $last4], 200);
        } catch (\Exception $e) {
            error_log('AuthControllerV2::getNoWaMask ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Terjadi kesalahan'], 500);
        }
    }

    /**
     * POST send-otp-ganti-wa: kirim OTP ke nomor baru untuk verifikasi ganti nomor WA (Edit Profil).
     */
    public function sendOtpGantiWa(Request $request, Response $response): Response
    {
        try {
            $payload = $request->getAttribute('user');
            $usersId = $this->getUsersIdFromPayload($payload);
            if ($usersId <= 0) {
                return $this->json($response, ['success' => false, 'message' => 'User tidak valid'], 403);
            }
            $data = $request->getParsedBody();
            $data = is_array($data) ? TextSanitizer::sanitizeStringValues($data, ['id_pengurus', 'nik', 'no_wa', 'nis', 'username', 'no_wa_baru', 'no_wa_konfirmasi', 'username_baru', 'otp']) : [];
            $noWaBaru = trim($data['no_wa_baru'] ?? '');
            $noWaBaruNorm = $this->normalizeNoWaTo62($noWaBaru);
            if ($noWaBaruNorm === null) {
                return $this->json($response, ['success' => false, 'message' => 'Nomor WA baru tidak valid'], 400);
            }
            if ($this->isNoWaUsedByOtherUser($noWaBaruNorm, $usersId)) {
                return $this->json($response, ['success' => false, 'message' => 'Nomor WA sudah dipakai'], 400);
            }
            $otp = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);
            $otpHash = hash('sha256', $otp);
            $expiresAt = date('Y-m-d H:i:s', time() + 600); // 10 menit
            $ins = $this->db->prepare("INSERT INTO user___wa_change_otp (user_id, no_wa_baru, otp_hash, expires_at) VALUES (?, ?, ?, ?)");
            $ins->execute([$usersId, $noWaBaruNorm, $otpHash, $expiresAt]);
            $stmt = $this->db->prepare("SELECT id FROM pengurus WHERE id_user = ?");
            $stmt->execute([$usersId]);
            $rowP = $stmt->fetch(\PDO::FETCH_ASSOC);
            $idPengurus = $rowP ? (int) $rowP['id'] : null;

            $emailStmt = $this->db->prepare("SELECT email FROM users WHERE id = ? LIMIT 1");
            $emailStmt->execute([$usersId]);
            $emailRow = $emailStmt->fetch(\PDO::FETCH_ASSOC);
            $email = trim((string) ($emailRow['email'] ?? ''));
            if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
                $this->db->prepare("DELETE FROM user___wa_change_otp WHERE user_id = ? AND no_wa_baru = ?")->execute([$usersId, $noWaBaruNorm]);
                return $this->json($response, ['success' => false, 'message' => 'Email akun belum terisi atau tidak valid. Hubungi admin untuk melengkapi email.'], 400);
            }

            $sendResult = EmailService::sendOtpEmail($email, $otp, 'konfirmasi ganti nomor WhatsApp');
            if (!$sendResult['success']) {
                $this->db->prepare("DELETE FROM user___wa_change_otp WHERE user_id = ? AND no_wa_baru = ?")->execute([$usersId, $noWaBaruNorm]);
                return $this->json($response, ['success' => false, 'message' => 'Gagal mengirim OTP: ' . ($sendResult['message'] ?? '')], 502);
            }
            AuditLogger::log((string)$usersId, 'send_otp_ganti_wa', ['no_wa_baru' => $noWaBaruNorm], $this->getClientIp($request), true);
            return $this->json($response, ['success' => true, 'message' => 'Kode OTP telah dikirim ke email akun Anda.'], 200);
        } catch (\Exception $e) {
            error_log('AuthControllerV2::sendOtpGantiWa ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Terjadi kesalahan'], 500);
        }
    }

    /**
     * POST verify-otp-ganti-wa: verifikasi OTP dan update nomor WA (users.no_wa saja).
     */
    public function verifyOtpGantiWa(Request $request, Response $response): Response
    {
        try {
            $payload = $request->getAttribute('user');
            $usersId = $this->getUsersIdFromPayload($payload);
            if ($usersId <= 0) {
                return $this->json($response, ['success' => false, 'message' => 'User tidak valid'], 403);
            }
            $data = $request->getParsedBody();
            $data = is_array($data) ? TextSanitizer::sanitizeStringValues($data, ['id_pengurus', 'nik', 'no_wa', 'nis', 'username', 'no_wa_baru', 'no_wa_konfirmasi', 'username_baru', 'otp']) : [];
            $noWaBaru = trim($data['no_wa_baru'] ?? '');
            $otp = trim($data['otp'] ?? '');
            $noWaBaruNorm = $this->normalizeNoWaTo62($noWaBaru);
            if ($noWaBaruNorm === null) {
                return $this->json($response, ['success' => false, 'message' => 'Nomor WA baru tidak valid'], 400);
            }
            if (strlen($otp) !== 6) {
                return $this->json($response, ['success' => false, 'message' => 'Kode OTP harus 6 digit'], 400);
            }
            if ($this->isNoWaUsedByOtherUser($noWaBaruNorm, $usersId)) {
                return $this->json($response, ['success' => false, 'message' => 'Nomor WA sudah dipakai'], 400);
            }
            $otpHash = hash('sha256', $otp);
            $stmt = $this->db->prepare("SELECT id FROM user___wa_change_otp WHERE user_id = ? AND no_wa_baru = ? AND otp_hash = ? AND expires_at > NOW()");
            $stmt->execute([$usersId, $noWaBaruNorm, $otpHash]);
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$row) {
                return $this->json($response, ['success' => false, 'message' => 'Kode OTP salah atau sudah kadaluarsa'], 400);
            }
            try {
                $this->db->prepare("UPDATE users SET no_wa = ?, no_wa_verified_at = NOW() WHERE id = ?")->execute([$noWaBaruNorm, $usersId]);
            } catch (\PDOException $pdoEx) {
                $duplicateMessage = $this->getUsersDuplicateFieldMessage($pdoEx);
                if ($duplicateMessage !== null) {
                    return $this->json($response, ['success' => false, 'message' => $duplicateMessage], 400);
                }
                throw $pdoEx;
            }
            $this->db->prepare("DELETE FROM user___wa_change_otp WHERE user_id = ? AND no_wa_baru = ?")->execute([$usersId, $noWaBaruNorm]);
            AuditLogger::log((string)$usersId, 'wa_changed', ['no_wa_baru' => $noWaBaruNorm], $this->getClientIp($request), true);
            return $this->json($response, ['success' => true, 'message' => 'Nomor WhatsApp berhasil diubah.'], 200);
        } catch (\Exception $e) {
            error_log('AuthControllerV2::verifyOtpGantiWa ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Terjadi kesalahan'], 500);
        }
    }

    /**
     * POST request-ubah-password: konfirmasi no_wa, buat token, kirim link WA ke halaman ubah password.
     * Mendukung pengurus (user_id = pengurus.id) dan santri (user_id = users.id).
     */
    public function requestUbahPassword(Request $request, Response $response): Response
    {
        try {
            $payload = $request->getAttribute('user');
            $pArr = is_array($payload) ? $payload : [];
            $userIdFromToken = (int)($payload['user_id'] ?? 0);
            if ($userIdFromToken <= 0) {
                return $this->json($response, ['success' => false, 'message' => 'User tidak valid'], 403);
            }
            $data = $request->getParsedBody();
            $data = is_array($data) ? TextSanitizer::sanitizeStringValues($data, ['id_pengurus', 'nik', 'no_wa', 'nis', 'username', 'no_wa_baru', 'no_wa_konfirmasi', 'username_baru', 'otp']) : [];
            $noWaKonfirmasi = preg_replace('/\D/', '', trim($data['no_wa_konfirmasi'] ?? ''));
            if ($noWaKonfirmasi === '') {
                return $this->json($response, ['success' => false, 'message' => 'Masukkan nomor WA untuk konfirmasi'], 400);
            }
            $noWaKonfirmasiNorm = WhatsAppService::formatPhoneNumber($noWaKonfirmasi);
            $userId = null;
            $noWaDisplay = null;
            $idPengurusRecipient = null;
            $idSantriRecipient = isset($payload['santri_id']) ? (int)$payload['santri_id'] : null;

            if (RoleHelper::tokenIsSantriDaftarContext($pArr)) {
                $userId = $userIdFromToken;
                $stmt = $this->db->prepare("SELECT no_wa FROM users WHERE id = ?");
                $stmt->execute([$userId]);
                $row = $stmt->fetch(\PDO::FETCH_ASSOC);
                if (!$row) {
                    return $this->json($response, ['success' => false, 'message' => 'Data user tidak ditemukan.'], 400);
                }
                $noWaDb = preg_replace('/\D/', '', trim($row['no_wa'] ?? ''));
                $noWaDbNorm = WhatsAppService::formatPhoneNumber($noWaDb);
                if ($noWaDbNorm === '' || $noWaDbNorm !== $noWaKonfirmasiNorm) {
                    return $this->json($response, ['success' => false, 'message' => 'Nomor WA tidak sesuai'], 400);
                }
                $noWaDisplay = $row['no_wa'] ?? $noWaKonfirmasi;
            } else {
                $stmt = $this->db->prepare("SELECT p.id_user, u.no_wa FROM pengurus p LEFT JOIN users u ON u.id = p.id_user WHERE p.id = ?");
                $stmt->execute([$userIdFromToken]);
                $row = $stmt->fetch(\PDO::FETCH_ASSOC);
                if (!$row || empty($row['id_user'])) {
                    return $this->json($response, ['success' => false, 'message' => 'Akun belum terhubung ke users.'], 400);
                }
                $userId = (int)$row['id_user'];
                $noWaDb = preg_replace('/\D/', '', $row['no_wa'] ?? '');
                $noWaDbNorm = WhatsAppService::formatPhoneNumber($noWaDb);
                if ($noWaDbNorm === '' || $noWaDbNorm !== $noWaKonfirmasiNorm) {
                    return $this->json($response, ['success' => false, 'message' => 'Nomor WA tidak sesuai'], 400);
                }
                $noWaDisplay = $row['no_wa'] ?? $noWaKonfirmasi;
                $stmtPengurus = $this->db->prepare("SELECT id FROM pengurus WHERE id_user = ?");
                $stmtPengurus->execute([$userId]);
                $rowPengurus = $stmtPengurus->fetch(\PDO::FETCH_ASSOC);
                if ($rowPengurus) {
                    $idPengurusRecipient = (int) $rowPengurus['id'];
                }
            }

            $plainToken = bin2hex(random_bytes(32));
            $tokenHash = hash('sha256', $plainToken);
            $ins = $this->db->prepare("INSERT INTO user___password_reset_tokens (user_id, token_hash, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 15 MINUTE))");
            $ins->execute([$userId, $tokenHash]);
            $tokenId = (int) $this->db->lastInsertId();
            $config = require __DIR__ . '/../../config.php';
            $baseUrl = $this->getFrontendBaseUrl($request, $config);
            $link = $baseUrl . '/ubah-password?token=' . urlencode($plainToken);
            $message = "Link ubah password (aktif 15 menit):\n" . $link;
            $tujuan = RoleHelper::tokenIsSantriDaftarContext($pArr) ? 'santri' : 'pengurus';
            $logContext = ['id_santri' => $idSantriRecipient, 'id_pengurus' => $idPengurusRecipient, 'tujuan' => $tujuan, 'id_pengurus_pengirim' => null, 'kategori' => 'password_reset', 'sumber' => 'auth'];
            $sendResult = WhatsAppService::sendMessage($noWaDisplay, $message, null, $logContext);
            if (!$sendResult['success']) {
                return $this->json($response, ['success' => false, 'message' => 'Gagal mengirim link: ' . ($sendResult['message'] ?? '')], 502);
            }
            if (WhatsAppService::deliveryWasNotActuallySent($sendResult)) {
                return $this->json($response, [
                    'success' => false,
                    'message' => 'Gagal mengirim link: ' . ($sendResult['message'] ?? 'Pesan tidak terkirim.'),
                ], 502);
            }
            if ($tokenId > 0 && !empty($sendResult['messageId'])) {
                $nomor62 = WhatsAppService::formatPhoneNumber($noWaDisplay);
                $this->db->prepare("UPDATE user___password_reset_tokens SET wa_message_id = ?, nomor_tujuan = ? WHERE id = ?")->execute([trim($sendResult['messageId']), $nomor62, $tokenId]);
            }
            AuditLogger::log((string)$userId, 'request_ubah_password', [], $this->getClientIp($request), true);
            return $this->json($response, ['success' => true, 'message' => 'Link ubah password telah dikirim ke WhatsApp Anda.'], 200);
        } catch (\Exception $e) {
            error_log('AuthControllerV2::requestUbahPassword ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Terjadi kesalahan'], 500);
        }
    }

    /**
     * GET ubah-password-token: validasi token untuk halaman ubah password.
     */
    public function getUbahPasswordToken(Request $request, Response $response): Response
    {
        try {
            $token = $this->normalizeSecurityToken((string) ($request->getQueryParams()['token'] ?? ''));
            if ($token === '') {
                return $this->jsonWithNoStoreCache($response, ['success' => true, 'valid' => false], 200);
            }
            $tokenHash = hash('sha256', $token);
            $stmt = $this->db->prepare("
                SELECT t.id, t.user_id, u.username, p.nama
                FROM user___password_reset_tokens t
                INNER JOIN users u ON u.id = t.user_id
                LEFT JOIN pengurus p ON p.id_user = u.id
                WHERE t.token_hash = ? AND t.expires_at > NOW() AND t.used_at IS NULL
            ");
            $stmt->execute([$tokenHash]);
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$row) {
                $stmtInvalid = $this->db->prepare("SELECT id, wa_message_id, nomor_tujuan, used_at FROM user___password_reset_tokens WHERE token_hash = ?");
                $stmtInvalid->execute([$tokenHash]);
                $inv = $stmtInvalid->fetch(\PDO::FETCH_ASSOC);
                if ($inv && !empty($inv['wa_message_id']) && !empty($inv['nomor_tujuan'])) {
                    $reason = !empty($inv['used_at']) ? 'dipakai' : 'kadaluarsa';
                    $this->editWaMessageTokenInvalidated($inv['nomor_tujuan'], $inv['wa_message_id'], $reason, 'Link ubah password');
                    $this->db->prepare("UPDATE user___password_reset_tokens SET wa_message_id = NULL, nomor_tujuan = NULL WHERE id = ?")->execute([$inv['id']]);
                }
                return $this->jsonWithNoStoreCache($response, ['success' => true, 'valid' => false], 200);
            }
            return $this->jsonWithNoStoreCache($response, ['success' => true, 'valid' => true, 'nama' => $row['nama'] ?: $row['username']], 200);
        } catch (\Exception $e) {
            error_log('AuthControllerV2::getUbahPasswordToken ' . $e->getMessage());
            return $this->jsonWithNoStoreCache($response, ['success' => false, 'message' => 'Terjadi kesalahan'], 500);
        }
    }

    /**
     * POST ubah-password: token + password_baru, update users.password, tandai token used.
     */
    public function postUbahPassword(Request $request, Response $response): Response
    {
        try {
            $data = $request->getParsedBody();
            $data = is_array($data) ? TextSanitizer::sanitizeStringValues($data, ['id_pengurus', 'nik', 'no_wa', 'nis', 'username', 'no_wa_baru', 'no_wa_konfirmasi', 'username_baru', 'otp']) : [];
            $token = $this->normalizeSecurityToken((string) ($data['token'] ?? ''));
            $passwordBaru = $data['password_baru'] ?? '';
            if ($token === '') {
                return $this->json($response, ['success' => false, 'message' => 'Token tidak valid'], 400);
            }
            if (strlen($passwordBaru) < 6) {
                return $this->json($response, ['success' => false, 'message' => 'Password minimal 6 karakter'], 400);
            }
            $tokenHash = hash('sha256', $token);
            $stmt = $this->db->prepare("SELECT id, user_id FROM user___password_reset_tokens WHERE token_hash = ? AND expires_at > NOW() AND used_at IS NULL");
            $stmt->execute([$tokenHash]);
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$row) {
                return $this->json($response, ['success' => false, 'message' => 'Token tidak valid atau kadaluarsa'], 400);
            }
            $userId = (int)$row['user_id'];

            $stmt = $this->db->prepare("SELECT password FROM users WHERE id = ?");
            $stmt->execute([$userId]);
            $userRow = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$userRow) {
                return $this->json($response, ['success' => false, 'message' => 'User tidak ditemukan'], 400);
            }
            $currentHash = $userRow['password'];

            if (PasswordHelper::verifyPassword($passwordBaru, $currentHash)) {
                return $this->json($response, ['success' => false, 'message' => 'Password tidak boleh sama dengan password yang sedang dipakai.'], 400);
            }

            $limit = (int) self::PASSWORD_HISTORY_COUNT;
            $stmt = $this->db->prepare("
                SELECT password_hash FROM user___password_history
                WHERE user_id = ? ORDER BY created_at DESC LIMIT {$limit}
            ");
            $stmt->execute([$userId]);
            while ($hist = $stmt->fetch(\PDO::FETCH_ASSOC)) {
                if (PasswordHelper::verifyPassword($passwordBaru, $hist['password_hash'])) {
                    return $this->json($response, ['success' => false, 'message' => 'Password tidak boleh sama dengan password yang pernah dipakai.'], 400);
                }
            }

            $hash = PasswordHelper::hashPassword($passwordBaru);
            if ($currentHash !== null) {
                $this->db->prepare("INSERT INTO user___password_history (user_id, password_hash) VALUES (?, ?)")->execute([$userId, $currentHash]);
            }
            $this->db->prepare("UPDATE users SET password = ?, no_wa_verified_at = NOW() WHERE id = ?")->execute([$hash, $userId]);
            $this->db->prepare("INSERT INTO user___password_history (user_id, password_hash) VALUES (?, ?)")->execute([$userId, $hash]);
            $this->db->prepare("UPDATE user___password_reset_tokens SET used_at = NOW() WHERE id = ?")->execute([$row['id']]);
            $stmtWa = $this->db->prepare("SELECT wa_message_id, nomor_tujuan FROM user___password_reset_tokens WHERE id = ?");
            $stmtWa->execute([$row['id']]);
            $waRow = $stmtWa->fetch(\PDO::FETCH_ASSOC);
            if ($waRow && !empty($waRow['wa_message_id']) && !empty($waRow['nomor_tujuan'])) {
                $this->editWaMessageTokenInvalidated($waRow['nomor_tujuan'], $waRow['wa_message_id'], 'dipakai', 'Link ubah password');
                $this->db->prepare("UPDATE user___password_reset_tokens SET wa_message_id = NULL, nomor_tujuan = NULL WHERE id = ?")->execute([$row['id']]);
            }
            AuditLogger::log((string)$userId, 'password_changed_reset', [], $this->getClientIp($request), true);
            return $this->json($response, ['success' => true, 'message' => 'Password berhasil diubah. Silakan login.'], 200);
        } catch (\Exception $e) {
            error_log('AuthControllerV2::postUbahPassword ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Terjadi kesalahan'], 500);
        }
    }

    /**
     * POST ubah-username-langsung: username_baru + password (verifikasi). Ubah username langsung tanpa WA/token.
     * User harus login; password harus benar (saat ini).
     */
    public function ubahUsernameLangsung(Request $request, Response $response): Response
    {
        try {
            $payload = $request->getAttribute('user');
            $usersId = $this->getUsersIdFromPayload($payload);
            if ($usersId <= 0) {
                return $this->json($response, ['success' => false, 'message' => 'User tidak valid'], 403);
            }
            $data = $request->getParsedBody();
            $data = is_array($data) ? TextSanitizer::sanitizeStringValues($data, ['id_pengurus', 'nik', 'no_wa', 'nis', 'username', 'no_wa_baru', 'no_wa_konfirmasi', 'username_baru', 'otp']) : [];
            $usernameBaru = trim($data['username_baru'] ?? '');
            $password = $data['password'] ?? '';

            if (strlen($usernameBaru) < 5) {
                return $this->json($response, ['success' => false, 'message' => 'Username baru minimal 5 karakter'], 400);
            }
            if (preg_match('/\s/', $usernameBaru)) {
                return $this->json($response, ['success' => false, 'message' => 'Username tidak boleh mengandung spasi'], 400);
            }
            if ($password === '') {
                return $this->json($response, ['success' => false, 'message' => 'Masukkan password saat ini untuk verifikasi'], 400);
            }

            $stmt = $this->db->prepare("SELECT id, username, password FROM users WHERE id = ?");
            $stmt->execute([$usersId]);
            $userRow = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$userRow) {
                return $this->json($response, ['success' => false, 'message' => 'User tidak ditemukan'], 400);
            }
            if (!PasswordHelper::verifyPassword($password, $userRow['password'])) {
                return $this->json($response, ['success' => false, 'message' => 'Password salah'], 400);
            }

            $stmt = $this->db->prepare("SELECT id FROM users WHERE LOWER(TRIM(username)) = LOWER(?) AND id != ?");
            $stmt->execute([$usernameBaru, $usersId]);
            if ($stmt->fetch()) {
                return $this->json($response, ['success' => false, 'message' => 'Username sudah dipakai'], 400);
            }

            try {
                $this->db->prepare("UPDATE users SET username = ? WHERE id = ?")->execute([$usernameBaru, $usersId]);
            } catch (\PDOException $pdoEx) {
                $info = $pdoEx->errorInfo ?? [];
                if ($pdoEx->getCode() === '23000' || (isset($info[1]) && (int) $info[1] === 1062)) {
                    return $this->json($response, ['success' => false, 'message' => 'Username sudah dipakai'], 400);
                }
                throw $pdoEx;
            }
            AuditLogger::log((string)$usersId, 'username_changed', ['username_baru' => $usernameBaru], $this->getClientIp($request), true);
            return $this->json($response, ['success' => true, 'message' => 'Username berhasil diubah.'], 200);
        } catch (\Exception $e) {
            error_log('AuthControllerV2::ubahUsernameLangsung ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Terjadi kesalahan'], 500);
        }
    }

    /**
     * POST request-ubah-username: username_baru + password (verifikasi). Buat token, kirim link ke WA.
     * Bedanya dengan ubah password: user harus masukkan password yang benar (saat ini).
     */
    public function requestUbahUsername(Request $request, Response $response): Response
    {
        try {
            $payload = $request->getAttribute('user');
            $usersId = $this->getUsersIdFromPayload($payload);
            if ($usersId <= 0) {
                return $this->json($response, ['success' => false, 'message' => 'User tidak valid'], 403);
            }
            $data = $request->getParsedBody();
            $data = is_array($data) ? TextSanitizer::sanitizeStringValues($data, ['id_pengurus', 'nik', 'no_wa', 'nis', 'username', 'no_wa_baru', 'no_wa_konfirmasi', 'username_baru', 'otp']) : [];
            $usernameBaru = trim($data['username_baru'] ?? '');
            $password = $data['password'] ?? '';

            if (strlen($usernameBaru) < 5) {
                return $this->json($response, ['success' => false, 'message' => 'Username baru minimal 5 karakter'], 400);
            }
            if (preg_match('/\s/', $usernameBaru)) {
                return $this->json($response, ['success' => false, 'message' => 'Username tidak boleh mengandung spasi'], 400);
            }
            if ($password === '') {
                return $this->json($response, ['success' => false, 'message' => 'Masukkan password saat ini untuk verifikasi'], 400);
            }

            $stmt = $this->db->prepare("SELECT id, username, password FROM users WHERE id = ?");
            $stmt->execute([$usersId]);
            $userRow = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$userRow) {
                return $this->json($response, ['success' => false, 'message' => 'User tidak ditemukan'], 400);
            }
            if (!PasswordHelper::verifyPassword($password, $userRow['password'])) {
                return $this->json($response, ['success' => false, 'message' => 'Password salah'], 400);
            }

            $stmt = $this->db->prepare("SELECT id FROM users WHERE LOWER(TRIM(username)) = LOWER(?) AND id != ?");
            $stmt->execute([$usernameBaru, $usersId]);
            if ($stmt->fetch()) {
                return $this->json($response, ['success' => false, 'message' => 'Username sudah dipakai'], 400);
            }

            $plainToken = bin2hex(random_bytes(32));
            $tokenHash = hash('sha256', $plainToken);
            $ins = $this->db->prepare("INSERT INTO user___username_change_tokens (user_id, token_hash, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 15 MINUTE))");
            $ins->execute([$usersId, $tokenHash]);

            $config = require __DIR__ . '/../../config.php';
            $baseUrl = $this->getFrontendBaseUrl($request, $config);
            $link = $baseUrl . '/ubah-username?token=' . urlencode($plainToken);
            $message = "Link ubah username (aktif 15 menit):\n" . $link;

            $stmt = $this->db->prepare("SELECT id FROM pengurus WHERE id_user = ?");
            $stmt->execute([$usersId]);
            $rowPengurus = $stmt->fetch(\PDO::FETCH_ASSOC);
            $idPengurusRecipient = $rowPengurus ? (int) $rowPengurus['id'] : null;
            $stmt = $this->db->prepare("SELECT no_wa FROM users WHERE id = ?");
            $stmt->execute([$usersId]);
            $rowWa = $stmt->fetch(\PDO::FETCH_ASSOC);
            $noWaDisplay = $rowWa['no_wa'] ?? null;
            if (empty($noWaDisplay)) {
                return $this->json($response, ['success' => false, 'message' => 'Nomor WA tidak tersedia untuk mengirim link'], 400);
            }
            $logContext = ['id_santri' => null, 'id_pengurus' => $idPengurusRecipient, 'tujuan' => 'pengurus', 'id_pengurus_pengirim' => null, 'kategori' => 'username_change', 'sumber' => 'auth'];
            $sendResult = WhatsAppService::sendMessage($noWaDisplay, $message, null, $logContext);
            if (!$sendResult['success']) {
                return $this->json($response, ['success' => false, 'message' => 'Gagal mengirim link: ' . ($sendResult['message'] ?? '')], 502);
            }
            if (WhatsAppService::deliveryWasNotActuallySent($sendResult)) {
                return $this->json($response, [
                    'success' => false,
                    'message' => 'Gagal mengirim link: ' . ($sendResult['message'] ?? 'Pesan tidak terkirim.'),
                ], 502);
            }
            AuditLogger::log((string)$usersId, 'request_ubah_username', ['username_baru' => $usernameBaru], $this->getClientIp($request), true);
            return $this->json($response, ['success' => true, 'message' => 'Link ubah username telah dikirim ke WhatsApp Anda.'], 200);
        } catch (\Exception $e) {
            error_log('AuthControllerV2::requestUbahUsername ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Terjadi kesalahan'], 500);
        }
    }

    /**
     * GET ubah-username-token: validasi token untuk halaman ubah username.
     */
    public function getUbahUsernameToken(Request $request, Response $response): Response
    {
        try {
            $token = $this->normalizeSecurityToken((string) ($request->getQueryParams()['token'] ?? ''));
            if ($token === '') {
                return $this->jsonWithNoStoreCache($response, ['success' => true, 'valid' => false], 200);
            }
            $tokenHash = hash('sha256', $token);
            $stmt = $this->db->prepare("
                SELECT t.id, t.user_id, u.username, p.nama
                FROM user___username_change_tokens t
                INNER JOIN users u ON u.id = t.user_id
                LEFT JOIN pengurus p ON p.id_user = u.id
                WHERE t.token_hash = ? AND t.expires_at > NOW() AND t.used_at IS NULL
            ");
            $stmt->execute([$tokenHash]);
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$row) {
                return $this->jsonWithNoStoreCache($response, ['success' => true, 'valid' => false], 200);
            }
            return $this->jsonWithNoStoreCache($response, ['success' => true, 'valid' => true, 'nama' => $row['nama'] ?: $row['username'], 'username' => $row['username']], 200);
        } catch (\Exception $e) {
            error_log('AuthControllerV2::getUbahUsernameToken ' . $e->getMessage());
            return $this->jsonWithNoStoreCache($response, ['success' => false, 'message' => 'Terjadi kesalahan'], 500);
        }
    }

    /**
     * POST ubah-username: token + username_baru + password (password saat ini, harus benar).
     */
    public function postUbahUsername(Request $request, Response $response): Response
    {
        try {
            $data = $request->getParsedBody();
            $data = is_array($data) ? TextSanitizer::sanitizeStringValues($data, ['id_pengurus', 'nik', 'no_wa', 'nis', 'username', 'no_wa_baru', 'no_wa_konfirmasi', 'username_baru', 'otp']) : [];
            $token = $this->normalizeSecurityToken((string) ($data['token'] ?? ''));
            $usernameBaru = trim($data['username_baru'] ?? '');
            $password = $data['password'] ?? '';

            if ($token === '') {
                return $this->json($response, ['success' => false, 'message' => 'Token tidak valid'], 400);
            }
            if (strlen($usernameBaru) < 5) {
                return $this->json($response, ['success' => false, 'message' => 'Username minimal 5 karakter'], 400);
            }
            if (preg_match('/\s/', $usernameBaru)) {
                return $this->json($response, ['success' => false, 'message' => 'Username tidak boleh mengandung spasi'], 400);
            }
            if ($password === '') {
                return $this->json($response, ['success' => false, 'message' => 'Masukkan password saat ini'], 400);
            }

            $tokenHash = hash('sha256', $token);
            $stmt = $this->db->prepare("SELECT id, user_id FROM user___username_change_tokens WHERE token_hash = ? AND expires_at > NOW() AND used_at IS NULL");
            $stmt->execute([$tokenHash]);
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$row) {
                return $this->json($response, ['success' => false, 'message' => 'Token tidak valid atau kadaluarsa'], 400);
            }
            $userId = (int)$row['user_id'];

            $stmt = $this->db->prepare("SELECT password FROM users WHERE id = ?");
            $stmt->execute([$userId]);
            $userRow = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$userRow || !PasswordHelper::verifyPassword($password, $userRow['password'])) {
                return $this->json($response, ['success' => false, 'message' => 'Password salah'], 400);
            }

            $stmt = $this->db->prepare("SELECT id FROM users WHERE LOWER(TRIM(username)) = LOWER(?) AND id != ?");
            $stmt->execute([$usernameBaru, $userId]);
            if ($stmt->fetch()) {
                return $this->json($response, ['success' => false, 'message' => 'Username sudah dipakai'], 400);
            }

            try {
                $this->db->prepare("UPDATE users SET username = ? WHERE id = ?")->execute([$usernameBaru, $userId]);
            } catch (\PDOException $pdoEx) {
                $info = $pdoEx->errorInfo ?? [];
                if ($pdoEx->getCode() === '23000' || (isset($info[1]) && (int) $info[1] === 1062)) {
                    return $this->json($response, ['success' => false, 'message' => 'Username sudah dipakai'], 400);
                }
                throw $pdoEx;
            }
            $this->db->prepare("UPDATE user___username_change_tokens SET used_at = NOW() WHERE id = ?")->execute([$row['id']]);
            AuditLogger::log((string)$userId, 'username_changed', ['username_baru' => $usernameBaru], $this->getClientIp($request), true);
            return $this->json($response, ['success' => true, 'message' => 'Username berhasil diubah. Silakan login dengan username baru.'], 200);
        } catch (\Exception $e) {
            error_log('AuthControllerV2::postUbahUsername ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Terjadi kesalahan'], 500);
        }
    }

    /** Batasi jumlah session per user (hapus yang paling lama tidak aktif). */
    private function pruneSessionsToLimit(int $userId, int $limit): void
    {
        $stmt = $this->db->prepare("SELECT id FROM user___sessions WHERE user_id = ? ORDER BY last_activity_at DESC");
        $stmt->execute([$userId]);
        $allIds = $stmt->fetchAll(\PDO::FETCH_COLUMN);
        if (count($allIds) <= $limit) {
            return;
        }
        $keepIds = array_slice($allIds, 0, $limit);
        $placeholders = implode(',', array_fill(0, count($keepIds), '?'));
        $this->db->prepare("DELETE FROM user___sessions WHERE user_id = ? AND id NOT IN ($placeholders)")->execute(array_merge([$userId], $keepIds));
    }

    /**
     * Edit pesan WA link keamanan jadi keterangan singkat (token kadaluarsa/dipakai).
     * Dipanggil saat token sudah dipakai atau kadaluarsa agar link di WA tidak lagi aktif.
     * Gagal edit (mis. batas 15 menit terlewati) tidak melempar; hanya log.
     *
     * @param string $nomorTujuan Nomor WA (62xxx)
     * @param string $waMessageId wa_message_id dari tabel token
     * @param string $reason 'kadaluarsa' atau 'dipakai'
     * @param string $judul Judul yang tetap ditampilkan (mis. "🔒 Verifikasi Daftar UWABA"). Kosong = hanya "> Token sudah ..."
     */
    private function editWaMessageTokenInvalidated(string $nomorTujuan, string $waMessageId, string $reason, string $judul = ''): void
    {
        $nomor = WhatsAppService::formatPhoneNumber($nomorTujuan);
        if (strlen($nomor) < 10 || $waMessageId === '') {
            return;
        }
        $keterangan = $reason === 'dipakai' ? '> Token sudah dipakai' : '> Token sudah kadaluarsa';
        $label = $judul !== '' ? trim($judul) . "\n\n" . $keterangan : $keterangan;
        try {
            $result = WhatsAppService::editMessage($nomor, $waMessageId, $label);
            if (!$result['success']) {
                error_log('AuthControllerV2::editWaMessageTokenInvalidated: ' . ($result['message'] ?? 'edit gagal'));
                return;
            }
            try {
                $this->db->prepare("UPDATE whatsapp SET isi_pesan = ? WHERE wa_message_id = ? AND (arah = 'keluar' OR arah IS NULL)")->execute([$label, $waMessageId]);
            } catch (\Throwable $e) {
            }
        } catch (\Throwable $e) {
            error_log('AuthControllerV2::editWaMessageTokenInvalidated: ' . $e->getMessage());
        }
    }

    /**
     * Base URL frontend untuk link WA (setup akun / ubah password) — eBeddien (pengurus).
     * Prioritas: X-Frontend-Base-URL → Origin (bukan localhost) → Referer (host saja, bukan localhost)
     * → EBEDDIEN_APP_URL (jika di-set) → APP_URL.
     */
    private function getFrontendBaseUrl(Request $request, array $config): string
    {
        $header = $request->getHeaderLine('X-Frontend-Base-URL');
        $header = trim($header);
        if ($header !== '' && (strpos($header, 'http://') === 0 || strpos($header, 'https://') === 0)) {
            return rtrim($header, '/');
        }
        $origin = trim($request->getHeaderLine('Origin'));
        if ($origin !== '' && (strpos($origin, 'http://') === 0 || strpos($origin, 'https://') === 0)) {
            $host = parse_url($origin, PHP_URL_HOST);
            if ($host && $host !== 'localhost' && $host !== '127.0.0.1') {
                return rtrim($origin, '/');
            }
        }
        // Beberapa klien/mobile tidak mengirim Origin pada POST; Referer sering tetap ada.
        $referer = trim($request->getHeaderLine('Referer'));
        if ($referer !== '' && (strpos($referer, 'http://') === 0 || strpos($referer, 'https://') === 0)) {
            $parts = parse_url($referer);
            if (!empty($parts['scheme']) && !empty($parts['host'])) {
                $h = $parts['host'];
                if ($h !== 'localhost' && $h !== '127.0.0.1') {
                    $port = isset($parts['port']) ? ':' . (int)$parts['port'] : '';
                    return rtrim($parts['scheme'] . '://' . $h . $port, '/');
                }
            }
        }
        $explicit = trim((string)($config['app']['ebeddien_url'] ?? ''));
        if ($explicit !== '' && (strpos($explicit, 'http://') === 0 || strpos($explicit, 'https://') === 0)) {
            return rtrim($explicit, '/');
        }
        return rtrim($config['app']['url'] ?? 'http://localhost:5173', '/');
    }

    /**
     * Base URL frontend Mybeddian untuk link WA (daftar santri → setup akun).
     * Prioritas: X-Frontend-Base-URL → Origin (termasuk localhost) → config app.mybeddian_url → app.url.
     */
    private function getMybeddianFrontendBaseUrl(Request $request, array $config): string
    {
        $header = $request->getHeaderLine('X-Frontend-Base-URL');
        $header = trim($header);
        if ($header !== '' && (strpos($header, 'http://') === 0 || strpos($header, 'https://') === 0)) {
            return rtrim($header, '/');
        }
        $origin = trim($request->getHeaderLine('Origin'));
        if ($origin !== '' && (strpos($origin, 'http://') === 0 || strpos($origin, 'https://') === 0)) {
            return rtrim($origin, '/');
        }
        return rtrim($config['app']['mybeddian_url'] ?? $config['app']['url'] ?? 'http://localhost:5174', '/');
    }

    /**
     * GET verify untuk aplikasi Mybeddian: validasi JWT saja (tanpa cek session pengurus).
     * Data user dari payload (santri pakai tabel santri, bukan pengurus).
     */
    public function verifyMybeddian(Request $request, Response $response): Response
    {
        try {
            $authHeader = $request->getHeaderLine('Authorization');
            if (empty($authHeader) || !preg_match('/Bearer\s+(.*)$/i', $authHeader, $matches)) {
                return $this->json($response, ['success' => false, 'message' => 'Token tidak ditemukan'], 401);
            }
            $token = trim($matches[1]);
            $payload = $this->jwt->validateToken($token);
            if (!$payload) {
                return $this->json($response, ['success' => false, 'message' => 'Token tidak valid atau sudah kadaluarsa'], 401);
            }
            $userId = (int)($payload['user_id'] ?? 0);
            $usersId = (int)($payload['users_id'] ?? $userId);
            $santriId = isset($payload['santri_id']) ? (int)$payload['santri_id'] : null;
            $tokoId = isset($payload['toko_id']) ? (int)$payload['toko_id'] : null;
            $tokoNama = $payload['toko_nama'] ?? '';
            $nama = $payload['user_name'] ?? $payload['nama'] ?? '';
            $username = $payload['username'] ?? $payload['user_name'] ?? '';
            if ($nama === '' && $userId > 0) {
                if ($santriId !== null) {
                    $stmt = $this->db->prepare("SELECT nama FROM santri WHERE id = ? LIMIT 1");
                    $stmt->execute([$santriId]);
                    $row = $stmt->fetch(\PDO::FETCH_ASSOC);
                    $nama = $row['nama'] ?? $username;
                } elseif ($tokoId !== null && $tokoNama !== '') {
                    $nama = $tokoNama;
                } else {
                    $stmt = $this->db->prepare("SELECT nama FROM users WHERE id = ? LIMIT 1");
                    $stmt->execute([$usersId]);
                    $row = $stmt->fetch(\PDO::FETCH_ASSOC);
                    $nama = $row['nama'] ?? $username;
                }
            }
            $roleKey = $payload['role_key'] ?? $payload['user_role'] ?? 'user';
            $roleLabel = $payload['role_label'] ?? ucfirst($roleKey);
            $data = [
                'id' => $santriId !== null ? $santriId : ($tokoId !== null ? $tokoId : $userId),
                'nama' => $nama,
                'username' => $username,
                'role_key' => $roleKey,
                'role_label' => $roleLabel,
                'allowed_apps' => $payload['allowed_apps'] ?? [],
                'permissions' => $payload['permissions'] ?? [],
            ];
            if ($santriId !== null) {
                $data['santri_id'] = $santriId;
            }
            if ($tokoId !== null || !empty($payload['has_toko'])) {
                $data['has_toko'] = true;
                $data['toko_id'] = $tokoId;
                $data['toko_nama'] = $tokoNama;
            }
            return $this->json($response, ['success' => true, 'data' => $data], 200);
        } catch (\Throwable $e) {
            error_log('AuthControllerV2::verifyMybeddian ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Terjadi kesalahan'], 500);
        }
    }

    private function getClientIp(Request $request): string
    {
        $params = $request->getServerParams();
        if (!empty($params['HTTP_X_FORWARDED_FOR'])) {
            $ips = explode(',', $params['HTTP_X_FORWARDED_FOR']);
            return trim($ips[0]);
        }
        return $params['REMOTE_ADDR'] ?? 'unknown';
    }

    private function json(Response $response, array $data, int $status): Response
    {
        $response->getBody()->write(json_encode($data, JSON_UNESCAPED_UNICODE));
        return $response->withStatus($status)->withHeader('Content-Type', 'application/json; charset=utf-8');
    }

    /** Response JSON + Cache-Control untuk token sekali pakai (jangan di-cache CDN/proxy). */
    private function jsonWithNoStoreCache(Response $response, array $data, int $status): Response
    {
        return $this->json($response, $data, $status)->withHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    }
}
