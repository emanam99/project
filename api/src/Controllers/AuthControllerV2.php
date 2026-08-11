<?php

namespace App\Controllers;

use App\Database;
use App\Auth\JwtAuth;
use App\Auth\PasswordHelper;
use App\Helpers\AuditLogger;
use App\Helpers\TextSanitizer;
use App\Helpers\MybeddianProfilFotoHelper;
use App\Helpers\LoginSuspiciousHelper;
use App\Helpers\NikHelper;
use App\Helpers\PengurusHelper;
use App\Helpers\RoleHelper;
use App\Helpers\SantriHelper;
use App\Helpers\SantriStatusHelper;
use App\Helpers\UserAgentHelper;
use App\Helpers\MybeddianAuthWaHelper;
use App\Services\EmailService;
use App\Services\WhatsAppService;
use App\Utils\DeferredHttpTask;
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

    private function passwordMinLength(): int
    {
        static $min = null;
        if ($min === null) {
            $config = require __DIR__ . '/../../config.php';
            // Minimal absolut 8 (setup / ubah password myBeddien). Naikkan lewat PASSWORD_MIN_LENGTH / config.
            $min = max(8, (int) ($config['security']['password_min_length'] ?? 8));
        }

        return $min;
    }

    private function validatePasswordLength(string $password): ?string
    {
        $min = $this->passwordMinLength();
        if (strlen($password) < $min) {
            return "Password minimal {$min} karakter";
        }

        return null;
    }

    /**
     * Siapkan handshake WA myBeddien (wa.me); token setup/reset dibuat setelah verifikasi WA.
     *
     * @param array<string, mixed> $payload
     * @param list<string> $messageLines
     * @return array{success: bool, message: string, wa_me_url: string, wa_message: string, expires_in_minutes: int}
     */
    private function buildMybeddianAuthWaPrepareResponse(
        string $purpose,
        string $mode,
        string $noWa62,
        array $payload,
        array $messageLines,
        string $userFacingMessage
    ): array {
        if (!MybeddianAuthWaHelper::tableExists($this->db)) {
            throw new \RuntimeException('Tabel mybeddian_auth_wa_tokens belum ada. Jalankan phinx migrate.');
        }
        $prep = $this->withIndonesiaTimezone(function () use ($purpose, $mode, $noWa62, $payload, $messageLines) {
            return MybeddianAuthWaHelper::createPrepare(
                $this->db,
                $purpose,
                $mode,
                $noWa62,
                $payload,
                MybeddianAuthWaHelper::purposeTitle($purpose),
                $messageLines
            );
        });

        return [
            'success' => true,
            'message' => $userFacingMessage,
            'wa_me_url' => $prep['wa_me_url'],
            'wa_message' => $prep['wa_message'],
            'expires_in_minutes' => $prep['expires_in_minutes'],
        ];
    }

    /** URL setup/ubah password myBeddian: token di fragment agar tidak masuk log query / Referer. */
    private function mybeddianSecurityUrl(string $baseUrl, string $path, string $plainToken, string $extraQuery = ''): string
    {
        $q = $extraQuery !== '' ? '?' . ltrim($extraQuery, '?&') : '';

        return rtrim($baseUrl, '/') . $path . $q . '#token=' . rawurlencode($plainToken);
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

    /** Perbandingan nama/identitas tampilan: lowercase, rapatkan spasi (UTF-8). */
    private function normalizeJudulForCompare(string $s): string
    {
        $s = trim($s);
        if ($s === '') {
            return '';
        }
        $lower = mb_strtolower($s, 'UTF-8');
        $dashNorm = preg_replace('/[\x{2010}\x{2011}\x{2012}\x{2013}\x{2014}\x{2212}–—−]/u', '-', $lower);
        $oneSpace = preg_replace('/\s+/u', ' ', is_string($dashNorm) ? $dashNorm : $lower);
        return is_string($oneSpace) ? $oneSpace : $lower;
    }

    /**
     * Validasi nomor WA daftar PJGT vs madrasah.no_pjgt.
     * Jika no_pjgt di DB kosong dan belum ada id_pjgt → izinkan (nomor form disimpan saat setup akun).
     *
     * @param array<string, mixed> $m baris madrasah
     * @return array{ok: bool, message?: string, first_registration?: bool}
     */
    private function assertMadrasahPjgtWaForDaftar(array $m, string $noWaNorm): array
    {
        $dbPjgt = trim((string) ($m['no_pjgt'] ?? ''));
        if ($dbPjgt !== '') {
            $dbWaNorm = $this->normalizeNoWaTo62($dbPjgt);
            if ($dbWaNorm === null || $dbWaNorm !== $noWaNorm) {
                return [
                    'ok' => false,
                    'message' => 'Nomor WhatsApp tidak sesuai nomor PJGT yang terdaftar untuk madrasah ini.',
                ];
            }

            return ['ok' => true, 'first_registration' => false];
        }

        if (!empty($m['id_pjgt'])) {
            return [
                'ok' => false,
                'message' => 'Nomor PJGT/WA belum diisi di data madrasah. Hubungi admin.',
            ];
        }

        return ['ok' => true, 'first_registration' => true];
    }

    /** Simpan no_pjgt madrasah bila masih kosong (setelah daftar PJGT pertama). */
    private function persistMadrasahNoPjgtIfEmpty(int $madrasahId, ?string $noWaDisplay): void
    {
        if ($madrasahId <= 0 || $noWaDisplay === null || trim($noWaDisplay) === '') {
            return;
        }
        $this->db->prepare(
            "UPDATE madrasah SET no_pjgt = ? WHERE id = ? AND (no_pjgt IS NULL OR TRIM(no_pjgt) = '')"
        )->execute([trim($noWaDisplay), $madrasahId]);
    }

    /** Judul pesan WA verifikasi daftar sesuai jenis entitas token. */
    private function waJudulVerifikasiDaftarMybeddian(string $entityType): string
    {
        if ($entityType === 'madrasah') {
            return '🔒 Verifikasi Daftar PJGT (Mybeddien)';
        }
        if ($entityType === 'toko') {
            return '🔒 Verifikasi Daftar Toko (Mybeddien)';
        }
        return '🔒 Verifikasi Daftar Mybeddian';
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

    /** Satu baris users.id untuk nomor WA (format 62… atau 0…). */
    private function findUsersIdByNoWa62(string $noWa62): ?int
    {
        $alt0 = strpos($noWa62, '62') === 0 ? ('0' . substr($noWa62, 2)) : $noWa62;
        $stmt = $this->db->prepare('SELECT id FROM users WHERE no_wa IN (?, ?) ORDER BY id ASC LIMIT 1');
        $stmt->execute([$noWa62, $alt0]);
        $row = $stmt->fetch(\PDO::FETCH_ASSOC);

        return ($row && isset($row['id'])) ? (int) $row['id'] : null;
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
            $data = is_array($data) ? TextSanitizer::sanitizeMybeddianAuthBody($data) : [];
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
            $data = is_array($data) ? TextSanitizer::sanitizeMybeddianAuthBody($data) : [];
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
            $data = is_array($data) ? TextSanitizer::sanitizeMybeddianAuthBody($data) : [];
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
            $ins = $this->db->prepare("INSERT INTO user___password_reset_tokens (user_id, token_hash, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 10 MINUTE))");
            $ins->execute([$userId, $tokenHash]);
            $tokenId = (int) $this->db->lastInsertId();

            $config = require __DIR__ . '/../../config.php';
            $baseUrl = $this->getFrontendBaseUrl($request, $config);
            $link = $baseUrl . '/ubah-password?token=' . urlencode($plainToken);
            $message = "Link buat password baru (aktif 10 menit):\n" . $link . "\n\nJangan bagikan link ini ke siapapun.";
            $logContext = ['id_santri' => null, 'id_pengurus' => (int)$pengurus['id'], 'tujuan' => 'pengurus', 'id_pengurus_pengirim' => null, 'kategori' => 'password_reset', 'sumber' => 'lupa_password'];
            $tokenIdWa = $tokenId;
            $noWaD = $noWaDisplay;
            $msgWa = $message;
            $logCtxWa = $logContext;
            DeferredHttpTask::runAfterResponse(static function () use ($tokenIdWa, $noWaD, $msgWa, $logCtxWa): void {
                try {
                    $sendResult = WhatsAppService::sendMessage($noWaD, $msgWa, null, $logCtxWa);
                    if ($tokenIdWa > 0 && !empty($sendResult['messageId'])) {
                        $db = Database::getInstance()->getConnection();
                        $nomor62 = WhatsAppService::formatPhoneNumber($noWaD);
                        $db->prepare('UPDATE user___password_reset_tokens SET wa_message_id = ?, nomor_tujuan = ? WHERE id = ?')->execute([trim((string) $sendResult['messageId']), $nomor62, $tokenIdWa]);
                    }
                } catch (\Throwable $e) {
                    error_log('AuthControllerV2::lupaPasswordRequest deferred WA: ' . $e->getMessage());
                }
            });
            AuditLogger::log((string)$userId, 'request_ubah_password', ['sumber' => 'lupa_password'], $this->getClientIp($request), true);
            return $this->json($response, ['success' => true, 'message' => 'Link buat password baru sedang dikirim ke WhatsApp Anda. Cek nomor yang terdaftar. Link aktif 10 menit.', 'notifications' => ['wa' => 'queued']], 200);
        } catch (\Exception $e) {
            error_log('AuthControllerV2::lupaPasswordRequest ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Terjadi kesalahan'], 500);
        }
    }

    /**
     * POST Mybeddian: lupa password santri (public). nis, nik, no_wa — sama verifikasi identitas dengan daftar,
     * tetapi wajib sudah punya id_user. Kirim link /ubah-password ke WA (sama token reset seperti pengurus).
     */
    public function lupaPasswordRequestSantri(Request $request, Response $response): Response
    {
        try {
            $data = $request->getParsedBody();
            $data = is_array($data) ? TextSanitizer::sanitizeMybeddianAuthBody($data) : [];
            $nis = trim((string)($data['nis'] ?? ''));
            $nik = trim((string)($data['nik'] ?? ''));
            $noWa = trim((string)($data['no_wa'] ?? ''));

            if ($nis === '' || $nik === '' || $noWa === '') {
                return $this->json($response, ['success' => false, 'message' => 'NIS, NIK, dan No. WA harus diisi'], 400);
            }

            $nikValidation = NikHelper::validate($nik);
            if (!$nikValidation['valid']) {
                return $this->json($response, ['success' => false, 'message' => $nikValidation['message']], 400);
            }
            $nikNormalized = $nikValidation['normalized'];

            $santriId = SantriHelper::resolveId($this->db, $nis);
            if ($santriId === null) {
                return $this->json($response, ['success' => false, 'message' => 'Data tidak valid. Periksa NIS, NIK, dan nomor WhatsApp.'], 400);
            }

            $stmt = $this->db->prepare('SELECT s.id, s.nik, s.id_user, u.no_wa FROM santri s INNER JOIN users u ON u.id = s.id_user WHERE s.id = ? LIMIT 1');
            $stmt->execute([$santriId]);
            $santri = $stmt->fetch(\PDO::FETCH_ASSOC);

            if (!$santri) {
                return $this->json($response, ['success' => false, 'message' => 'Data tidak valid. Periksa NIS, NIK, dan nomor WhatsApp.'], 400);
            }
            if (empty($santri['id_user'])) {
                return $this->json($response, ['success' => false, 'message' => 'Data tidak valid. Periksa NIS, NIK, dan nomor WhatsApp.'], 400);
            }

            $nikDb = $santri['nik'] ?? '';
            $nikDbNorm = NikHelper::normalize($nikDb);
            if ($nikDbNorm === null || $nikDbNorm === '' || $nikDbNorm !== $nikNormalized) {
                return $this->json($response, ['success' => false, 'message' => 'Data tidak valid. Periksa NIS, NIK, dan nomor WhatsApp.'], 400);
            }

            $noWaDb = preg_replace('/\D/', '', $santri['no_wa'] ?? '');
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
                return $this->json($response, ['success' => false, 'message' => 'Data tidak valid. Periksa NIS, NIK, dan nomor WhatsApp.'], 400);
            }

            $userId = (int)$santri['id_user'];
            $noWaDisplay = $santri['no_wa'] ?? $noWa;

            $out = $this->buildMybeddianAuthWaPrepareResponse(
                MybeddianAuthWaHelper::PURPOSE_LUPA_PASSWORD,
                'santri',
                $noWaInput,
                [
                    'user_id' => $userId,
                    'id_santri' => (int) $santriId,
                    'no_wa' => $noWaInput,
                ],
                [
                    'Mode: santri',
                    'NIS: ' . $nis,
                    'NIK: ' . $nikNormalized,
                    'Nomor WA: ' . $noWaInput,
                ],
                'Buka WhatsApp, kirim pesan berisi token, lalu buka link balasan untuk membuat password baru.'
            );
            AuditLogger::log((string)$userId, 'request_ubah_password', ['sumber' => 'lupa_password_mybeddian', 'id_santri' => $santriId, 'via' => 'wa_prepare'], $this->getClientIp($request), true);
            return $this->json($response, $out, 200);
        } catch (\Exception $e) {
            error_log('AuthControllerV2::lupaPasswordRequestSantri ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Terjadi kesalahan'], 500);
        }
    }

    /**
     * POST Mybeddian: lupa password PJGT (public).
     * identitas + nama madrasah + no_wa — madrasah harus sudah punya id_pjgt; no_wa cocok users.no_wa (dan no_pjgt bila terisi).
     */
    public function lupaPasswordRequestPjgt(Request $request, Response $response): Response
    {
        $genericFail = 'Data tidak valid. Periksa identitas madrasah, nama madrasah, dan nomor WhatsApp.';
        try {
            $data = $request->getParsedBody();
            $data = is_array($data) ? TextSanitizer::sanitizeMybeddianAuthBody($data) : [];
            $identitas = trim((string) ($data['identitas'] ?? ''));
            $namaVal = TextSanitizer::validatePersonName($data['nama'] ?? '', 2, 255);
            if ($namaVal['error'] !== null) {
                return $this->json($response, ['success' => false, 'message' => $genericFail], 400);
            }
            $namaInput = $namaVal['text'];
            $noWa = trim((string) ($data['no_wa'] ?? ''));

            if ($identitas === '' || $namaInput === '' || $noWa === '') {
                return $this->json($response, ['success' => false, 'message' => 'Identitas madrasah, nama madrasah, dan No. HP harus diisi'], 400);
            }

            $noWaNorm = $this->normalizeNoWaTo62($noWa);
            if ($noWaNorm === null) {
                return $this->json($response, ['success' => false, 'message' => $genericFail], 400);
            }

            $stmt = $this->db->prepare(
                "SELECT id, nama, identitas, no_pjgt, id_pjgt
                 FROM madrasah
                 WHERE identitas IS NOT NULL AND TRIM(identitas) <> '' AND UPPER(TRIM(identitas)) = UPPER(?)
                 LIMIT 2"
            );
            $stmt->execute([$identitas]);
            $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);
            if (count($rows) !== 1) {
                return $this->json($response, ['success' => false, 'message' => $genericFail], 400);
            }
            $m = $rows[0];

            $namaDbNorm = $this->normalizeJudulForCompare((string) ($m['nama'] ?? ''));
            $namaInNorm = $this->normalizeJudulForCompare($namaInput);
            if ($namaDbNorm === '' || $namaInNorm === '' || $namaDbNorm !== $namaInNorm) {
                return $this->json($response, ['success' => false, 'message' => $genericFail], 400);
            }

            $pjgtUserId = isset($m['id_pjgt']) ? (int) $m['id_pjgt'] : 0;
            if ($pjgtUserId <= 0) {
                return $this->json($response, [
                    'success' => false,
                    'message' => 'Akun PJGT belum terdaftar. Silakan daftar dulu.',
                ], 400);
            }

            $dbPjgt = trim((string) ($m['no_pjgt'] ?? ''));
            if ($dbPjgt !== '') {
                $dbPjgtNorm = $this->normalizeNoWaTo62($dbPjgt);
                if ($dbPjgtNorm === null || $dbPjgtNorm !== $noWaNorm) {
                    return $this->json($response, ['success' => false, 'message' => $genericFail], 400);
                }
            }

            $stmtU = $this->db->prepare('SELECT id, no_wa FROM users WHERE id = ? LIMIT 1');
            $stmtU->execute([$pjgtUserId]);
            $user = $stmtU->fetch(\PDO::FETCH_ASSOC);
            if (!$user) {
                return $this->json($response, ['success' => false, 'message' => $genericFail], 400);
            }

            $userWaNorm = $this->normalizeNoWaTo62((string) ($user['no_wa'] ?? ''));
            if ($userWaNorm === null || $userWaNorm !== $noWaNorm) {
                return $this->json($response, ['success' => false, 'message' => $genericFail], 400);
            }

            $userId = (int) $user['id'];

            $out = $this->buildMybeddianAuthWaPrepareResponse(
                MybeddianAuthWaHelper::PURPOSE_LUPA_PASSWORD,
                'pjgt',
                $noWaNorm,
                [
                    'user_id' => $userId,
                    'id_madrasah' => (int) $m['id'],
                    'no_wa' => $noWaNorm,
                ],
                [
                    'Mode: pjgt',
                    'Identitas: ' . strtoupper(trim($identitas)),
                    'Nama: ' . $namaInput,
                    'Nomor WA: ' . $noWaNorm,
                ],
                'Buka WhatsApp, kirim pesan berisi token, lalu buka link balasan untuk membuat password baru.'
            );
            AuditLogger::log(
                (string) $userId,
                'request_ubah_password',
                ['sumber' => 'lupa_password_mybeddian_pjgt', 'id_madrasah' => (int) $m['id'], 'via' => 'wa_prepare'],
                $this->getClientIp($request),
                true
            );
            return $this->json($response, $out, 200);
        } catch (\Exception $e) {
            error_log('AuthControllerV2::lupaPasswordRequestPjgt ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Terjadi kesalahan'], 500);
        }
    }

    /**
     * POST Mybeddian: lupa password toko (public).
     * kode_toko + nama_toko + no_wa — toko harus sudah punya id_users; no_wa cocok users.no_wa.
     */
    public function lupaPasswordRequestToko(Request $request, Response $response): Response
    {
        $genericFail = 'Data tidak valid. Periksa kode toko, nama toko, dan nomor WhatsApp.';
        try {
            $data = $request->getParsedBody();
            $data = is_array($data) ? TextSanitizer::sanitizeMybeddianAuthBody($data) : [];
            $resolved = $this->resolveUserForLupaUsernameToko($data, $genericFail);
            if (isset($resolved['error'])) {
                return $this->json($response, ['success' => false, 'message' => $resolved['error']], (int) ($resolved['status'] ?? 400));
            }

            $userId = (int) $resolved['user_id'];
            $noWaDisplay = (string) ($resolved['no_wa_display'] ?? ($data['no_wa'] ?? ''));
            $pedagangId = (int) (($resolved['audit']['pedagang_id'] ?? 0));
            $noWaNorm = $this->normalizeNoWaTo62($noWaDisplay !== '' ? $noWaDisplay : (string) ($data['no_wa'] ?? ''));
            if ($noWaNorm === null) {
                return $this->json($response, ['success' => false, 'message' => $genericFail], 400);
            }

            $kodeToko = trim((string) ($data['kode_toko'] ?? ''));
            $namaToko = trim((string) ($data['nama_toko'] ?? ($data['nama'] ?? '')));

            $out = $this->buildMybeddianAuthWaPrepareResponse(
                MybeddianAuthWaHelper::PURPOSE_LUPA_PASSWORD,
                'toko',
                $noWaNorm,
                [
                    'user_id' => $userId,
                    'pedagang_id' => $pedagangId > 0 ? $pedagangId : null,
                    'no_wa' => $noWaNorm,
                ],
                [
                    'Mode: toko',
                    'Kode: ' . strtoupper($kodeToko),
                    'Nama: ' . $namaToko,
                    'Nomor WA: ' . $noWaNorm,
                ],
                'Buka WhatsApp, kirim pesan berisi token, lalu buka link balasan untuk membuat password baru.'
            );
            AuditLogger::log(
                (string) $userId,
                'request_ubah_password',
                ['sumber' => 'lupa_password_mybeddian_toko', 'pedagang_id' => $pedagangId > 0 ? $pedagangId : null, 'via' => 'wa_prepare'],
                $this->getClientIp($request),
                true
            );
            return $this->json($response, $out, 200);
        } catch (\Exception $e) {
            error_log('AuthControllerV2::lupaPasswordRequestToko ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Terjadi kesalahan'], 500);
        }
    }

    /**
     * POST Mybeddian: lupa username (public).
     * mode=santri|pjgt|toko + data identitas seperti daftar, lalu kirim username ke WA.
     */
    public function lupaUsernameRequest(Request $request, Response $response): Response
    {
        $fail = 'Data tidak valid. Periksa kembali data yang dimasukkan.';
        try {
            $data = $request->getParsedBody();
            $data = is_array($data) ? TextSanitizer::sanitizeMybeddianAuthBody($data) : [];
            $mode = strtolower(trim((string) ($data['mode'] ?? 'santri')));
            if (!in_array($mode, ['santri', 'pjgt', 'toko'], true)) {
                return $this->json($response, ['success' => false, 'message' => 'Mode tidak valid'], 400);
            }

            $resolved = null;
            if ($mode === 'santri') {
                $resolved = $this->resolveUserForLupaUsernameSantri($data, $fail);
            } elseif ($mode === 'pjgt') {
                $resolved = $this->resolveUserForLupaUsernamePjgt($data, $fail);
            } else {
                $resolved = $this->resolveUserForLupaUsernameToko($data, $fail);
            }

            if (isset($resolved['error'])) {
                return $this->json($response, ['success' => false, 'message' => $resolved['error']], (int) ($resolved['status'] ?? 400));
            }

            $userId = (int) $resolved['user_id'];
            $noWaDisplay = (string) $resolved['no_wa_display'];
            $extraAudit = is_array($resolved['audit'] ?? null) ? $resolved['audit'] : [];

            $stmt = $this->db->prepare('SELECT id, username, no_wa FROM users WHERE id = ? LIMIT 1');
            $stmt->execute([$userId]);
            $user = $stmt->fetch(\PDO::FETCH_ASSOC);
            $username = trim((string) ($user['username'] ?? ''));
            if ($username === '') {
                return $this->json($response, ['success' => false, 'message' => $fail], 400);
            }
            if ($noWaDisplay === '' && !empty($user['no_wa'])) {
                $noWaDisplay = (string) $user['no_wa'];
            }
            $noWaNorm = $this->normalizeNoWaTo62($noWaDisplay);
            if ($noWaNorm === null) {
                return $this->json($response, ['success' => false, 'message' => $fail], 400);
            }

            $lines = ['Mode: ' . $mode, 'Nomor WA: ' . $noWaNorm];
            if ($mode === 'santri') {
                $lines = [
                    'Mode: santri',
                    'NIS: ' . trim((string) ($data['nis'] ?? '')),
                    'NIK: ' . trim((string) ($data['nik'] ?? '')),
                    'Nomor WA: ' . $noWaNorm,
                ];
            } elseif ($mode === 'pjgt') {
                $lines = [
                    'Mode: pjgt',
                    'Identitas: ' . strtoupper(trim((string) ($data['identitas'] ?? ''))),
                    'Nama: ' . trim((string) ($data['nama'] ?? '')),
                    'Nomor WA: ' . $noWaNorm,
                ];
            } else {
                $lines = [
                    'Mode: toko',
                    'Kode: ' . strtoupper(trim((string) ($data['kode_toko'] ?? ''))),
                    'Nama: ' . trim((string) ($data['nama_toko'] ?? ($data['nama'] ?? ''))),
                    'Nomor WA: ' . $noWaNorm,
                ];
            }

            $out = $this->buildMybeddianAuthWaPrepareResponse(
                MybeddianAuthWaHelper::PURPOSE_LUPA_USERNAME,
                $mode,
                $noWaNorm,
                array_merge(['user_id' => $userId, 'no_wa' => $noWaNorm], $extraAudit),
                $lines,
                'Buka WhatsApp, kirim pesan berisi token, lalu baca balasan berisi username Anda.'
            );
            AuditLogger::log(
                (string) $userId,
                'lupa_username_request',
                array_merge(['sumber' => 'lupa_username_mybeddian', 'mode' => $mode, 'via' => 'wa_prepare'], $extraAudit),
                $this->getClientIp($request),
                true
            );

            return $this->json($response, $out, 200);
        } catch (\Exception $e) {
            error_log('AuthControllerV2::lupaUsernameRequest ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Terjadi kesalahan'], 500);
        }
    }

    /**
     * @param array<string, mixed> $data
     * @return array{user_id?: int, no_wa_display?: string, audit?: array, error?: string, status?: int}
     */
    private function resolveUserForLupaUsernameSantri(array $data, string $fail): array
    {
        $nis = trim((string) ($data['nis'] ?? ''));
        $nik = trim((string) ($data['nik'] ?? ''));
        $noWa = trim((string) ($data['no_wa'] ?? ''));
        if ($nis === '' || $nik === '' || $noWa === '') {
            return ['error' => 'NIS, NIK, dan No. HP harus diisi', 'status' => 400];
        }
        $nikValidation = NikHelper::validate($nik);
        if (!$nikValidation['valid']) {
            return ['error' => $nikValidation['message'], 'status' => 400];
        }
        $nikNormalized = $nikValidation['normalized'];
        $noWaNorm = $this->normalizeNoWaTo62($noWa);
        if ($noWaNorm === null) {
            return ['error' => $fail, 'status' => 400];
        }

        $santriId = SantriHelper::resolveId($this->db, $nis);
        if ($santriId === null) {
            return ['error' => $fail, 'status' => 400];
        }
        $stmt = $this->db->prepare(
            'SELECT s.id, s.nik, s.id_user, u.no_wa, u.username
             FROM santri s
             INNER JOIN users u ON u.id = s.id_user
             WHERE s.id = ?
             LIMIT 1'
        );
        $stmt->execute([$santriId]);
        $row = $stmt->fetch(\PDO::FETCH_ASSOC);
        if (!$row || empty($row['id_user'])) {
            return ['error' => $fail, 'status' => 400];
        }
        $nikDbNorm = NikHelper::normalize((string) ($row['nik'] ?? ''));
        if ($nikDbNorm === null || $nikDbNorm === '' || $nikDbNorm !== $nikNormalized) {
            return ['error' => $fail, 'status' => 400];
        }
        $userWaNorm = $this->normalizeNoWaTo62((string) ($row['no_wa'] ?? ''));
        if ($userWaNorm === null || $userWaNorm !== $noWaNorm) {
            return ['error' => $fail, 'status' => 400];
        }

        return [
            'user_id' => (int) $row['id_user'],
            'no_wa_display' => (string) ($row['no_wa'] ?? $noWa),
            'audit' => ['id_santri' => (int) $santriId],
        ];
    }

    /**
     * @param array<string, mixed> $data
     * @return array{user_id?: int, no_wa_display?: string, audit?: array, error?: string, status?: int}
     */
    private function resolveUserForLupaUsernamePjgt(array $data, string $fail): array
    {
        $identitas = trim((string) ($data['identitas'] ?? ''));
        $namaVal = TextSanitizer::validatePersonName($data['nama'] ?? '', 2, 255);
        if ($namaVal['error'] !== null) {
            return ['error' => $fail, 'status' => 400];
        }
        $namaInput = $namaVal['text'];
        $noWa = trim((string) ($data['no_wa'] ?? ''));
        if ($identitas === '' || $namaInput === '' || $noWa === '') {
            return ['error' => 'Identitas madrasah, nama madrasah, dan No. HP harus diisi', 'status' => 400];
        }
        $noWaNorm = $this->normalizeNoWaTo62($noWa);
        if ($noWaNorm === null) {
            return ['error' => $fail, 'status' => 400];
        }

        $stmt = $this->db->prepare(
            "SELECT id, nama, identitas, no_pjgt, id_pjgt
             FROM madrasah
             WHERE identitas IS NOT NULL AND TRIM(identitas) <> '' AND UPPER(TRIM(identitas)) = UPPER(?)
             LIMIT 2"
        );
        $stmt->execute([$identitas]);
        $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);
        if (count($rows) !== 1) {
            return ['error' => $fail, 'status' => 400];
        }
        $m = $rows[0];
        $namaDbNorm = $this->normalizeJudulForCompare((string) ($m['nama'] ?? ''));
        $namaInNorm = $this->normalizeJudulForCompare($namaInput);
        if ($namaDbNorm === '' || $namaInNorm === '' || $namaDbNorm !== $namaInNorm) {
            return ['error' => $fail, 'status' => 400];
        }
        $pjgtUserId = isset($m['id_pjgt']) ? (int) $m['id_pjgt'] : 0;
        if ($pjgtUserId <= 0) {
            return ['error' => 'Akun PJGT belum terdaftar. Silakan daftar dulu.', 'status' => 400];
        }
        $dbPjgt = trim((string) ($m['no_pjgt'] ?? ''));
        if ($dbPjgt !== '') {
            $dbPjgtNorm = $this->normalizeNoWaTo62($dbPjgt);
            if ($dbPjgtNorm === null || $dbPjgtNorm !== $noWaNorm) {
                return ['error' => $fail, 'status' => 400];
            }
        }
        $stmtU = $this->db->prepare('SELECT id, no_wa FROM users WHERE id = ? LIMIT 1');
        $stmtU->execute([$pjgtUserId]);
        $user = $stmtU->fetch(\PDO::FETCH_ASSOC);
        if (!$user) {
            return ['error' => $fail, 'status' => 400];
        }
        $userWaNorm = $this->normalizeNoWaTo62((string) ($user['no_wa'] ?? ''));
        if ($userWaNorm === null || $userWaNorm !== $noWaNorm) {
            return ['error' => $fail, 'status' => 400];
        }

        return [
            'user_id' => (int) $user['id'],
            'no_wa_display' => (string) ($user['no_wa'] ?? $noWa),
            'audit' => ['id_madrasah' => (int) $m['id']],
        ];
    }

    /**
     * @param array<string, mixed> $data
     * @return array{user_id?: int, no_wa_display?: string, audit?: array, error?: string, status?: int}
     */
    private function resolveUserForLupaUsernameToko(array $data, string $fail): array
    {
        $kodeToko = trim((string) ($data['kode_toko'] ?? ''));
        $namaVal = TextSanitizer::validatePersonName($data['nama_toko'] ?? ($data['nama'] ?? ''), 2, 255);
        if ($namaVal['error'] !== null) {
            return ['error' => $fail, 'status' => 400];
        }
        $namaInput = $namaVal['text'];
        $noWa = trim((string) ($data['no_wa'] ?? ''));
        if ($kodeToko === '' || $namaInput === '' || $noWa === '') {
            return ['error' => 'Kode toko, nama toko, dan No. HP harus diisi', 'status' => 400];
        }
        $noWaNorm = $this->normalizeNoWaTo62($noWa);
        if ($noWaNorm === null) {
            return ['error' => $fail, 'status' => 400];
        }

        $stmt = $this->db->prepare(
            "SELECT id, nama_toko, kode_toko, id_users
             FROM cashless___pedagang
             WHERE kode_toko IS NOT NULL AND TRIM(kode_toko) <> '' AND UPPER(TRIM(kode_toko)) = UPPER(?)
             LIMIT 2"
        );
        $stmt->execute([$kodeToko]);
        $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);
        if (count($rows) !== 1) {
            return ['error' => $fail, 'status' => 400];
        }
        $toko = $rows[0];
        $namaDbNorm = $this->normalizeJudulForCompare((string) ($toko['nama_toko'] ?? ''));
        $namaInNorm = $this->normalizeJudulForCompare($namaInput);
        if ($namaDbNorm === '' || $namaInNorm === '' || $namaDbNorm !== $namaInNorm) {
            return ['error' => $fail, 'status' => 400];
        }
        $userId = isset($toko['id_users']) ? (int) $toko['id_users'] : 0;
        if ($userId <= 0) {
            return ['error' => 'Akun toko belum terdaftar. Silakan daftar dulu.', 'status' => 400];
        }
        $stmtU = $this->db->prepare('SELECT id, no_wa FROM users WHERE id = ? LIMIT 1');
        $stmtU->execute([$userId]);
        $user = $stmtU->fetch(\PDO::FETCH_ASSOC);
        if (!$user) {
            return ['error' => $fail, 'status' => 400];
        }
        $userWaNorm = $this->normalizeNoWaTo62((string) ($user['no_wa'] ?? ''));
        if ($userWaNorm === null || $userWaNorm !== $noWaNorm) {
            return ['error' => $fail, 'status' => 400];
        }

        return [
            'user_id' => (int) $user['id'],
            'no_wa_display' => (string) ($user['no_wa'] ?? $noWa),
            'audit' => ['pedagang_id' => (int) $toko['id']],
        ];
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
            $data = is_array($data) ? TextSanitizer::sanitizeMybeddianAuthBody($data) : [];
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
            $pwdErr = $this->validatePasswordLength($password);
            if ($pwdErr !== null) {
                return $this->json($response, ['success' => false, 'message' => $pwdErr], 400);
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
            $data = is_array($data) ? TextSanitizer::sanitizeMybeddianAuthBody($data) : [];
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
                return $this->json($response, ['success' => false, 'message' => 'Data tidak valid. Periksa NIS, NIK, dan nomor WhatsApp.'], 400);
            }

            $stmt = $this->db->prepare("SELECT id, nama, id_user, nik FROM santri WHERE id = ? LIMIT 1");
            $stmt->execute([$santriId]);
            $santri = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$santri) {
                return $this->json($response, ['success' => false, 'message' => 'Data tidak valid. Periksa NIS, NIK, dan nomor WhatsApp.'], 400);
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

            $noWaNorm = $this->normalizeNoWaTo62($noWa);
            if ($noWaNorm === null) {
                return $this->json($response, ['success' => false, 'message' => 'Nomor WhatsApp tidak valid'], 400);
            }

            // Nomor sudah ada di akun users — seperti PJGT: hubungkan santri ini ke akun yang sama setelah verifikasi username/password/nama.
            if ($this->isNoWaUsedByOtherUser($noWaNorm)) {
                return $this->json($response, [
                    'success' => true,
                    'already_registered' => false,
                    'need_verify_existing_user' => true,
                    'nama' => $santri['nama'] ?: 'Santri',
                    'no_wa' => $noWa,
                ], 200);
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
     * Daftar santri konfirmasi: buat token setup (aktif 5 menit). Frontend mengarahkan ke /setup-akun (tanpa kirim link lewat WA).
     */
    public function daftarKonfirmasiSantri(Request $request, Response $response): Response
    {
        try {
            $data = $request->getParsedBody();
            $data = is_array($data) ? TextSanitizer::sanitizeMybeddianAuthBody($data) : [];
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

            $noWaNorm = $this->normalizeNoWaTo62($noWa);
            if ($noWaNorm === null) {
                return $this->json($response, ['success' => false, 'message' => 'Nomor WhatsApp tidak valid'], 400);
            }

            $out = $this->buildMybeddianAuthWaPrepareResponse(
                MybeddianAuthWaHelper::PURPOSE_DAFTAR,
                'santri',
                $noWaNorm,
                [
                    'entity_type' => 'santri',
                    'entity_id' => (int) $santriId,
                    'no_wa' => $noWaNorm,
                ],
                [
                    'Mode: santri',
                    'NIS: ' . $nis,
                    'NIK: ' . $nik,
                    'Nomor WA: ' . $noWaNorm,
                ],
                'Buka WhatsApp, kirim pesan berisi token, lalu buka link balasan untuk membuat username & password.'
            );

            return $this->json($response, $out, 200);
        } catch (\RuntimeException $e) {
            error_log('AuthControllerV2::daftarKonfirmasiSantri ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Layanan sementara tidak tersedia. Coba lagi dalam beberapa saat.'], 503);
        } catch (\Throwable $e) {
            error_log('AuthControllerV2::daftarKonfirmasiSantri ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
            return $this->json($response, ['success' => false, 'message' => 'Terjadi kesalahan server. Coba lagi atau hubungi admin.'], 500);
        }
    }

    /**
     * Santri: nomor WA sudah terdaftar di users — verifikasi username, password, nama santri (sesuai data pusat),
     * lalu set santri.id_user tanpa membuat akun baru (setara daftar-pjgt-hubung-akun).
     */
    public function daftarSantriHubungAkun(Request $request, Response $response): Response
    {
        try {
            $parsed = $request->getParsedBody();
            $parsed = is_array($parsed) ? $parsed : [];
            $password = array_key_exists('password', $parsed) ? (string) $parsed['password'] : '';

            $data = TextSanitizer::sanitizeMybeddianAuthBody($parsed);
            $nis = trim((string) ($data['nis'] ?? ''));
            $nik = trim((string) ($data['nik'] ?? ''));
            $noWa = trim((string) ($data['no_wa'] ?? ''));
            $username = trim((string) ($data['username'] ?? ''));
            $namaProfilVal = TextSanitizer::validatePersonName($data['nama_profil'] ?? '');
            if ($namaProfilVal['error'] !== null) {
                return $this->json($response, ['success' => false, 'message' => $namaProfilVal['error']], 400);
            }
            $namaProfil = $namaProfilVal['text'];

            if ($nis === '' || $nik === '' || $noWa === '' || $username === '' || $namaProfil === '' || $password === '') {
                return $this->json($response, ['success' => false, 'message' => 'Lengkapi NIS, NIK, nomor WA, username, password, dan nama sesuai data santri.'], 400);
            }

            $nikValidation = NikHelper::validate($nik);
            if (!$nikValidation['valid']) {
                return $this->json($response, ['success' => false, 'message' => $nikValidation['message']], 400);
            }
            $nik = $nikValidation['normalized'];

            $noWaNorm = $this->normalizeNoWaTo62($noWa);
            if ($noWaNorm === null) {
                return $this->json($response, ['success' => false, 'message' => 'Nomor WhatsApp tidak valid'], 400);
            }

            if (!$this->isNoWaUsedByOtherUser($noWaNorm)) {
                return $this->json($response, ['success' => false, 'message' => 'Nomor ini belum terpasang di akun. Gunakan alur daftar biasa (buat akun baru).'], 400);
            }

            $santriId = SantriHelper::resolveId($this->db, $nis);
            if ($santriId === null) {
                return $this->json($response, ['success' => false, 'message' => 'NIS tidak ditemukan'], 404);
            }

            $stmt = $this->db->prepare('SELECT id, nama, id_user, nik FROM santri WHERE id = ? LIMIT 1');
            $stmt->execute([$santriId]);
            $santri = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$santri) {
                return $this->json($response, ['success' => false, 'message' => 'Data santri tidak ditemukan'], 404);
            }
            if (!empty($santri['id_user'])) {
                return $this->json($response, ['success' => false, 'message' => 'Data santri ini sudah terhubung ke akun. Silakan login.'], 400);
            }

            $nikDb = $santri['nik'] ?? '';
            $nikDbNorm = NikHelper::normalize($nikDb);
            if ($nikDbNorm === null || $nikDbNorm === '' || $nikDbNorm !== $nik) {
                return $this->json($response, ['success' => false, 'message' => 'NIK tidak sesuai dengan data santri.'], 400);
            }

            $userId = $this->findUsersIdByNoWa62($noWaNorm);
            if ($userId === null) {
                return $this->json($response, ['success' => false, 'message' => 'Akun tidak ditemukan.'], 400);
            }

            $stmtU = $this->db->prepare('SELECT id, username, password FROM users WHERE id = ? LIMIT 1');
            $stmtU->execute([$userId]);
            $userRow = $stmtU->fetch(\PDO::FETCH_ASSOC);
            if (!$userRow) {
                return $this->json($response, ['success' => false, 'message' => 'Akun tidak ditemukan.'], 400);
            }
            if (mb_strtolower(trim((string) $userRow['username']), 'UTF-8') !== mb_strtolower($username, 'UTF-8')) {
                return $this->json($response, ['success' => false, 'message' => 'Data verifikasi tidak sesuai.'], 400);
            }
            if (!PasswordHelper::verifyPassword($password, (string) ($userRow['password'] ?? ''))) {
                return $this->json($response, ['success' => false, 'message' => 'Data verifikasi tidak sesuai.'], 400);
            }

            if ($this->normalizeJudulForCompare((string) ($santri['nama'] ?? '')) !== $this->normalizeJudulForCompare($namaProfil)) {
                return $this->json($response, ['success' => false, 'message' => 'Data verifikasi tidak sesuai.'], 400);
            }

            $upd = $this->db->prepare('UPDATE santri SET id_user = ? WHERE id = ? AND id_user IS NULL');
            $upd->execute([$userId, $santriId]);
            if ($upd->rowCount() === 0) {
                return $this->json($response, ['success' => false, 'message' => 'Data santri sudah berubah. Muat ulang halaman dan coba lagi.'], 409);
            }

            try {
                AuditLogger::log((string) $userId, 'santri_hubung_akun_existing', ['id_santri' => $santriId], $this->getClientIp($request), true);
            } catch (\Throwable $e) {
            }

            return $this->json($response, [
                'success' => true,
                'message' => 'Akun berhasil dihubungkan ke data santri ini. Silakan login dengan username dan password yang sudah Anda punya.',
            ], 200);
        } catch (\Throwable $e) {
            error_log('AuthControllerV2::daftarSantriHubungAkun ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());

            return $this->json($response, ['success' => false, 'message' => 'Terjadi kesalahan server. Coba lagi atau hubungi admin.'], 500);
        }
    }

    /**
     * Daftar PJGT (Mybeddian): cek identitas madrasah, nama, no WA = no_pjgt di data.
     */
    public function daftarCheckMadrasahPjgt(Request $request, Response $response): Response
    {
        try {
            $data = $request->getParsedBody();
            $data = is_array($data) ? TextSanitizer::sanitizeMybeddianAuthBody($data) : [];
            $identitas = trim((string)($data['identitas'] ?? ''));
            $namaVal = TextSanitizer::validatePersonName($data['nama'] ?? '', 2, 255);
            if ($namaVal['error'] !== null) {
                return $this->json($response, ['success' => false, 'message' => $namaVal['error']], 400);
            }
            $namaInput = $namaVal['text'];
            $noWa = trim((string)($data['no_wa'] ?? ''));

            if ($identitas === '' || $namaInput === '' || $noWa === '') {
                return $this->json($response, ['success' => false, 'message' => 'Identitas madrasah, nama madrasah, dan No. HP harus diisi'], 400);
            }

            $noWaNorm = $this->normalizeNoWaTo62($noWa);
            if ($noWaNorm === null) {
                return $this->json($response, ['success' => false, 'message' => 'Nomor WhatsApp tidak valid'], 400);
            }

            $stmt = $this->db->prepare("SELECT id, nama, identitas, no_pjgt, id_pjgt, nama_pjgt FROM madrasah WHERE identitas IS NOT NULL AND TRIM(identitas) <> '' AND UPPER(TRIM(identitas)) = UPPER(?)");
            $stmt->execute([$identitas]);
            $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);
            if (count($rows) === 0) {
                return $this->json($response, ['success' => false, 'message' => 'Data tidak valid. Periksa identitas madrasah.'], 400);
            }
            if (count($rows) > 1) {
                return $this->json($response, ['success' => false, 'message' => 'Identitas ganda di data. Hubungi admin.'], 400);
            }
            $m = $rows[0];

            $namaDbNorm = $this->normalizeJudulForCompare((string)($m['nama'] ?? ''));
            $namaInNorm = $this->normalizeJudulForCompare($namaInput);
            if ($namaDbNorm === '' || $namaInNorm === '' || $namaDbNorm !== $namaInNorm) {
                return $this->json($response, ['success' => false, 'message' => 'Nama madrasah tidak sesuai data. Samakan penulisan dengan data resmi.'], 400);
            }

            $waCheck = $this->assertMadrasahPjgtWaForDaftar($m, $noWaNorm);
            if (!$waCheck['ok']) {
                return $this->json($response, ['success' => false, 'message' => $waCheck['message'] ?? 'Nomor WhatsApp tidak valid'], 400);
            }

            if (!empty($m['id_pjgt'])) {
                return $this->json($response, [
                    'success' => true,
                    'already_registered' => true,
                    'message' => 'Akun PJGT sudah terdaftar. Silakan login dengan username dan password.',
                ], 200);
            }

            if ($this->isNoWaUsedByOtherUser($noWaNorm)) {
                $existingUserId = $this->findUsersIdByNoWa62($noWaNorm);
                if ($existingUserId === null) {
                    return $this->json($response, ['success' => false, 'message' => 'Terjadi kesalahan pengecekan akun.'], 500);
                }
                $stmtOm = $this->db->prepare('SELECT id FROM madrasah WHERE id_pjgt = ? AND id <> ? LIMIT 1');
                $stmtOm->execute([$existingUserId, (int) $m['id']]);
                if ($stmtOm->fetch(\PDO::FETCH_ASSOC)) {
                    return $this->json($response, [
                        'success' => false,
                        'message' => 'Nomor ini dipakai akun yang sudah menjadi PJGT di madrasah lain. Hubungi admin.',
                    ], 400);
                }
                $npj = trim((string) ($m['nama_pjgt'] ?? ''));
                return $this->json($response, [
                    'success' => true,
                    'already_registered' => false,
                    'need_verify_existing_user' => true,
                    'require_nama_pjgt' => ($npj !== ''),
                    'nama' => $m['nama'] ? (string) $m['nama'] : 'Madrasah',
                    'no_wa' => $noWa,
                ], 200);
            }

            return $this->json($response, [
                'success' => true,
                'already_registered' => false,
                'nama' => $m['nama'] ? (string) $m['nama'] : 'Madrasah',
                'no_wa' => $noWa,
                'pjgt_wa_from_form' => !empty($waCheck['first_registration']),
            ], 200);
        } catch (\Exception $e) {
            error_log('AuthControllerV2::daftarCheckMadrasahPjgt ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Terjadi kesalahan'], 500);
        }
    }

    /**
     * Lookup madrasah by identitas untuk daftar PJGT (scan QR — isi otomatis identitas & nama).
     */
    public function daftarLookupMadrasahPjgt(Request $request, Response $response): Response
    {
        try {
            $params = $request->getQueryParams();
            $identitas = trim((string) ($params['identitas'] ?? ''));
            if ($identitas === '') {
                return $this->json($response, ['success' => false, 'message' => 'Identitas madrasah wajib diisi'], 400);
            }

            $stmt = $this->db->prepare(
                "SELECT id, nama, identitas, id_pjgt FROM madrasah WHERE identitas IS NOT NULL AND TRIM(identitas) <> '' AND UPPER(TRIM(identitas)) = UPPER(?)"
            );
            $stmt->execute([$identitas]);
            $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);
            if (count($rows) === 0) {
                return $this->json($response, ['success' => false, 'message' => 'Data tidak valid. Periksa identitas madrasah.'], 400);
            }
            if (count($rows) > 1) {
                return $this->json($response, ['success' => false, 'message' => 'Identitas ganda di data. Hubungi admin.'], 400);
            }
            $m = $rows[0];

            return $this->json($response, [
                'success' => true,
                'identitas' => trim((string) ($m['identitas'] ?? $identitas)),
                'nama' => trim((string) ($m['nama'] ?? '')),
                'already_registered' => !empty($m['id_pjgt']),
            ], 200);
        } catch (\Exception $e) {
            error_log('AuthControllerV2::daftarLookupMadrasahPjgt ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Terjadi kesalahan'], 500);
        }
    }

    /**
     * Konfirmasi daftar PJGT: token setup (5 menit). Frontend mengarahkan ke /setup-akun?portal=pjgt (tanpa kirim link lewat WA).
     */
    public function daftarKonfirmasiMadrasahPjgt(Request $request, Response $response): Response
    {
        try {
            if (!$this->userSetupTokensHasEntityColumns()) {
                return $this->json($response, ['success' => false, 'message' => 'Layanan sementara tidak tersedia. Coba lagi dalam beberapa saat.'], 503);
            }

            $data = $request->getParsedBody();
            $data = is_array($data) ? TextSanitizer::sanitizeMybeddianAuthBody($data) : [];
            $identitas = trim((string)($data['identitas'] ?? ''));
            $namaVal = TextSanitizer::validatePersonName($data['nama'] ?? '', 2, 255);
            if ($namaVal['error'] !== null) {
                return $this->json($response, ['success' => false, 'message' => $namaVal['error']], 400);
            }
            $namaInput = $namaVal['text'];
            $noWa = trim((string)($data['no_wa'] ?? ''));

            if ($identitas === '' || $namaInput === '' || $noWa === '') {
                return $this->json($response, ['success' => false, 'message' => 'Identitas madrasah, nama madrasah, dan No. HP harus diisi'], 400);
            }

            $noWaNorm = $this->normalizeNoWaTo62($noWa);
            if ($noWaNorm === null) {
                return $this->json($response, ['success' => false, 'message' => 'Nomor WhatsApp tidak valid'], 400);
            }

            $stmt = $this->db->prepare("SELECT id, nama, identitas, no_pjgt, id_pjgt FROM madrasah WHERE identitas IS NOT NULL AND TRIM(identitas) <> '' AND UPPER(TRIM(identitas)) = UPPER(?)");
            $stmt->execute([$identitas]);
            $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);
            if (count($rows) !== 1) {
                return $this->json($response, ['success' => false, 'message' => 'Data tidak valid'], 400);
            }
            $m = $rows[0];

            $namaDbNorm = $this->normalizeJudulForCompare((string)($m['nama'] ?? ''));
            $namaInNorm = $this->normalizeJudulForCompare($namaInput);
            if ($namaDbNorm === '' || $namaInNorm === '' || $namaDbNorm !== $namaInNorm) {
                return $this->json($response, ['success' => false, 'message' => 'Nama madrasah tidak sesuai data'], 400);
            }

            $waCheck = $this->assertMadrasahPjgtWaForDaftar($m, $noWaNorm);
            if (!$waCheck['ok']) {
                return $this->json($response, ['success' => false, 'message' => $waCheck['message'] ?? 'Nomor WhatsApp tidak valid'], 400);
            }

            if (!empty($m['id_pjgt'])) {
                return $this->json($response, ['success' => false, 'message' => 'Data tidak valid atau sudah terdaftar'], 400);
            }

            $madrasahId = (int) $m['id'];
            if (!empty($waCheck['first_registration'])) {
                $this->persistMadrasahNoPjgtIfEmpty($madrasahId, $noWa);
            }

            $out = $this->buildMybeddianAuthWaPrepareResponse(
                MybeddianAuthWaHelper::PURPOSE_DAFTAR,
                'pjgt',
                $noWaNorm,
                [
                    'entity_type' => 'madrasah',
                    'entity_id' => $madrasahId,
                    'no_wa' => $noWaNorm,
                ],
                [
                    'Mode: pjgt',
                    'Identitas: ' . strtoupper(trim($identitas)),
                    'Nama: ' . $namaInput,
                    'Nomor WA: ' . $noWaNorm,
                ],
                'Buka WhatsApp, kirim pesan berisi token, lalu buka link balasan untuk membuat username & password PJGT.'
            );

            return $this->json($response, $out, 200);
        } catch (\RuntimeException $e) {
            error_log('AuthControllerV2::daftarKonfirmasiMadrasahPjgt ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Layanan sementara tidak tersedia. Coba lagi dalam beberapa saat.'], 503);
        } catch (\Throwable $e) {
            error_log('AuthControllerV2::daftarKonfirmasiMadrasahPjgt ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
            return $this->json($response, ['success' => false, 'message' => 'Terjadi kesalahan server. Coba lagi atau hubungi admin.'], 500);
        }
    }

    /**
     * PJGT: nomor WA sudah terdaftar di users — verifikasi username, password, nama (santri/pengurus), nama kontak PJGT (jika terisi di data),
     * lalu set madrasah.id_pjgt dan users.id_madrasah tanpa membuat akun baru.
     */
    public function daftarPjgtHubungAkun(Request $request, Response $response): Response
    {
        try {
            $parsed = $request->getParsedBody();
            $parsed = is_array($parsed) ? $parsed : [];
            // Password jangan lewat cleanText (bisa mengubah karakter); ambil mentah dari body.
            $password = array_key_exists('password', $parsed) ? (string) $parsed['password'] : '';

            $data = TextSanitizer::sanitizeMybeddianAuthBody($parsed);
            $identitas = trim((string) ($data['identitas'] ?? ''));
            $namaVal = TextSanitizer::validatePersonName($data['nama'] ?? '', 2, 255);
            if ($namaVal['error'] !== null) {
                return $this->json($response, ['success' => false, 'message' => $namaVal['error']], 400);
            }
            $namaInput = $namaVal['text'];
            $noWa = trim((string) ($data['no_wa'] ?? ''));
            $username = trim((string) ($data['username'] ?? ''));
            $namaProfilVal = TextSanitizer::validatePersonName($data['nama_profil'] ?? '');
            if ($namaProfilVal['error'] !== null) {
                return $this->json($response, ['success' => false, 'message' => $namaProfilVal['error']], 400);
            }
            $namaProfil = $namaProfilVal['text'];
            $namaPjgtInput = '';
            if (array_key_exists('nama_pjgt', $data) && trim((string) ($data['nama_pjgt'] ?? '')) !== '') {
                $namaPjgtVal = TextSanitizer::validatePersonName($data['nama_pjgt'] ?? '', 2, 255);
                if ($namaPjgtVal['error'] !== null) {
                    return $this->json($response, ['success' => false, 'message' => $namaPjgtVal['error']], 400);
                }
                $namaPjgtInput = $namaPjgtVal['text'];
            }

            if ($identitas === '' || $namaInput === '' || $noWa === '' || $username === '' || $namaProfil === '' || $password === '') {
                return $this->json($response, ['success' => false, 'message' => 'Lengkapi identitas madrasah, nomor WA, username, password, dan nama sesuai data santri/pengurus.'], 400);
            }

            $noWaNorm = $this->normalizeNoWaTo62($noWa);
            if ($noWaNorm === null) {
                return $this->json($response, ['success' => false, 'message' => 'Nomor WhatsApp tidak valid'], 400);
            }

            if (!$this->isNoWaUsedByOtherUser($noWaNorm)) {
                return $this->json($response, ['success' => false, 'message' => 'Nomor ini belum terpasang di akun. Gunakan alur daftar biasa.'], 400);
            }

            $stmt = $this->db->prepare("SELECT id, nama, identitas, no_pjgt, id_pjgt, nama_pjgt FROM madrasah WHERE identitas IS NOT NULL AND TRIM(identitas) <> '' AND UPPER(TRIM(identitas)) = UPPER(?)");
            $stmt->execute([$identitas]);
            $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);
            if (count($rows) !== 1) {
                return $this->json($response, ['success' => false, 'message' => 'Data madrasah tidak valid'], 400);
            }
            $m = $rows[0];

            $namaDbNorm = $this->normalizeJudulForCompare((string) ($m['nama'] ?? ''));
            $namaInNorm = $this->normalizeJudulForCompare($namaInput);
            if ($namaDbNorm === '' || $namaInNorm === '' || $namaDbNorm !== $namaInNorm) {
                return $this->json($response, ['success' => false, 'message' => 'Nama madrasah tidak sesuai data'], 400);
            }

            $waCheck = $this->assertMadrasahPjgtWaForDaftar($m, $noWaNorm);
            if (!$waCheck['ok']) {
                return $this->json($response, ['success' => false, 'message' => $waCheck['message'] ?? 'Nomor WhatsApp tidak valid'], 400);
            }

            if (!empty($m['id_pjgt'])) {
                return $this->json($response, ['success' => false, 'message' => 'Madrasah ini sudah memiliki akun PJGT. Silakan login.'], 400);
            }

            $madrasahId = (int) $m['id'];
            if (!empty($waCheck['first_registration'])) {
                $this->persistMadrasahNoPjgtIfEmpty($madrasahId, $noWa);
            }
            $npjDb = trim((string) ($m['nama_pjgt'] ?? ''));
            if ($npjDb !== '') {
                if ($namaPjgtInput === '') {
                    return $this->json($response, ['success' => false, 'message' => 'Isi nama kontak PJGT sesuai data madrasah.'], 400);
                }
                if ($this->normalizeJudulForCompare($npjDb) !== $this->normalizeJudulForCompare($namaPjgtInput)) {
                    return $this->json($response, ['success' => false, 'message' => 'Data verifikasi tidak sesuai.'], 400);
                }
            }

            $userId = $this->findUsersIdByNoWa62($noWaNorm);
            if ($userId === null) {
                return $this->json($response, ['success' => false, 'message' => 'Akun tidak ditemukan.'], 400);
            }

            $stmtU = $this->db->prepare('SELECT id, username, id_madrasah, password FROM users WHERE id = ? LIMIT 1');
            $stmtU->execute([$userId]);
            $userRow = $stmtU->fetch(\PDO::FETCH_ASSOC);
            if (!$userRow) {
                return $this->json($response, ['success' => false, 'message' => 'Akun tidak ditemukan.'], 400);
            }
            if (mb_strtolower(trim((string) $userRow['username']), 'UTF-8') !== mb_strtolower($username, 'UTF-8')) {
                return $this->json($response, ['success' => false, 'message' => 'Data verifikasi tidak sesuai.'], 400);
            }
            if (!PasswordHelper::verifyPassword($password, (string) ($userRow['password'] ?? ''))) {
                return $this->json($response, ['success' => false, 'message' => 'Data verifikasi tidak sesuai.'], 400);
            }

            $uidMadrasah = isset($userRow['id_madrasah']) && $userRow['id_madrasah'] !== null && $userRow['id_madrasah'] !== '' ? (int) $userRow['id_madrasah'] : null;
            if ($uidMadrasah !== null && $uidMadrasah !== $madrasahId) {
                return $this->json($response, ['success' => false, 'message' => 'Akun sudah terhubung ke madrasah lain sebagai PJGT. Hubungi admin.'], 400);
            }

            $stmtOm = $this->db->prepare('SELECT id FROM madrasah WHERE id_pjgt = ? AND id <> ? LIMIT 1');
            $stmtOm->execute([$userId, $madrasahId]);
            if ($stmtOm->fetch(\PDO::FETCH_ASSOC)) {
                return $this->json($response, ['success' => false, 'message' => 'Akun ini sudah menjadi PJGT di madrasah lain.'], 400);
            }

            $stmtS = $this->db->prepare('SELECT nama FROM santri WHERE id_user = ? LIMIT 1');
            $stmtS->execute([$userId]);
            $sRow = $stmtS->fetch(\PDO::FETCH_ASSOC);
            $stmtP = $this->db->prepare('SELECT nama FROM pengurus WHERE id_user = ? LIMIT 1');
            $stmtP->execute([$userId]);
            $pRow = $stmtP->fetch(\PDO::FETCH_ASSOC);
            if (!$sRow && !$pRow) {
                return $this->json($response, ['success' => false, 'message' => 'Akun tidak memiliki data santri atau pengurus untuk diverifikasi. Hubungi admin.'], 400);
            }

            $profilOk = false;
            if ($sRow && $this->normalizeJudulForCompare((string) $sRow['nama']) === $this->normalizeJudulForCompare($namaProfil)) {
                $profilOk = true;
            }
            if ($pRow && $this->normalizeJudulForCompare((string) $pRow['nama']) === $this->normalizeJudulForCompare($namaProfil)) {
                $profilOk = true;
            }
            if (!$profilOk) {
                return $this->json($response, ['success' => false, 'message' => 'Data verifikasi tidak sesuai.'], 400);
            }

            $this->db->beginTransaction();
            try {
                $updM = $this->db->prepare('UPDATE madrasah SET id_pjgt = ? WHERE id = ? AND id_pjgt IS NULL');
                $updM->execute([$userId, $madrasahId]);
                if ($updM->rowCount() === 0) {
                    if ($this->db->inTransaction()) {
                        $this->db->rollBack();
                    }
                    return $this->json($response, ['success' => false, 'message' => 'Madrasah sudah memiliki PJGT atau data berubah. Muat ulang halaman.'], 409);
                }
                $this->db->prepare('UPDATE users SET id_madrasah = ? WHERE id = ?')->execute([$madrasahId, $userId]);
                $this->db->commit();
            } catch (\PDOException $pdoEx) {
                if ($this->db->inTransaction()) {
                    try {
                        $this->db->rollBack();
                    } catch (\Throwable $ignored) {
                    }
                }
                $lower = strtolower($pdoEx->getMessage());
                if (strpos($lower, 'id_madrasah') !== false || strpos($lower, 'fk_users_id_madrasah') !== false) {
                    return $this->json($response, ['success' => false, 'message' => 'Basis data belum diperbarui. Hubungi admin (migrasi id_madrasah).'], 503);
                }
                error_log('AuthControllerV2::daftarPjgtHubungAkun (tx) PDO ' . $pdoEx->getMessage());
                return $this->json($response, ['success' => false, 'message' => 'Terjadi kesalahan saat menyimpan.'], 500);
            } catch (\Throwable $e) {
                if ($this->db->inTransaction()) {
                    try {
                        $this->db->rollBack();
                    } catch (\Throwable $ignored) {
                    }
                }
                error_log('AuthControllerV2::daftarPjgtHubungAkun (tx) ' . $e->getMessage());
                return $this->json($response, ['success' => false, 'message' => 'Terjadi kesalahan saat menyimpan.'], 500);
            }

            AuditLogger::log((string) $userId, 'pjgt_hubung_akun_existing', ['id_madrasah' => $madrasahId], $this->getClientIp($request), true);

            return $this->json($response, [
                'success' => true,
                'message' => 'Akun berhasil dihubungkan ke PJGT madrasah ini. Silakan login dengan username dan password yang sudah Anda punya.',
            ], 200);
        } catch (\PDOException $e) {
            // PDOException extends RuntimeException — jangan tangkap sebagai "layanan tidak tersedia".
            try {
                if ($this->db->inTransaction()) {
                    $this->db->rollBack();
                }
            } catch (\Throwable $ignored) {
            }
            error_log('AuthControllerV2::daftarPjgtHubungAkun PDO ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
            $lower = strtolower($e->getMessage());
            if (strpos($lower, 'unknown column') !== false) {
                return $this->json($response, [
                    'success' => false,
                    'message' => 'Struktur basis data belum lengkap (kolom tabel tidak ditemukan). Jalankan migrasi API terbaru atau hubungi admin.',
                ], 500);
            }
            if (strpos($lower, 'id_madrasah') !== false || strpos($lower, 'fk_users_id_madrasah') !== false) {
                return $this->json($response, ['success' => false, 'message' => 'Basis data belum diperbarui. Hubungi admin (migrasi id_madrasah).'], 503);
            }
            return $this->json($response, ['success' => false, 'message' => 'Terjadi kesalahan database. Coba lagi nanti.'], 500);
        } catch (\Throwable $e) {
            error_log('AuthControllerV2::daftarPjgtHubungAkun ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
            return $this->json($response, ['success' => false, 'message' => 'Terjadi kesalahan server. Coba lagi atau hubungi admin.'], 500);
        }
    }

    /**
     * Daftar toko cashless: cek kode_toko + nama_toko + no_wa.
     * Prasyarat: baris cashless___pedagang sudah ada (dibuat admin), id_users masih NULL.
     */
    public function daftarCheckToko(Request $request, Response $response): Response
    {
        try {
            $data = $request->getParsedBody();
            $data = is_array($data) ? TextSanitizer::sanitizeMybeddianAuthBody($data) : [];
            $kodeToko = trim((string) ($data['kode_toko'] ?? ''));
            $namaVal = TextSanitizer::validatePersonName($data['nama_toko'] ?? ($data['nama'] ?? ''), 2, 255);
            if ($namaVal['error'] !== null) {
                return $this->json($response, ['success' => false, 'message' => $namaVal['error']], 400);
            }
            $namaInput = $namaVal['text'];
            $noWa = trim((string) ($data['no_wa'] ?? ''));

            if ($kodeToko === '' || $namaInput === '' || $noWa === '') {
                return $this->json($response, ['success' => false, 'message' => 'Kode toko, nama toko, dan No. HP harus diisi'], 400);
            }

            $noWaNorm = $this->normalizeNoWaTo62($noWa);
            if ($noWaNorm === null) {
                return $this->json($response, ['success' => false, 'message' => 'Nomor WhatsApp tidak valid'], 400);
            }

            $stmt = $this->db->prepare(
                'SELECT id, nama_toko, kode_toko, id_users, penanggung_jawab_nama
                 FROM cashless___pedagang
                 WHERE kode_toko IS NOT NULL AND TRIM(kode_toko) <> \'\' AND UPPER(TRIM(kode_toko)) = UPPER(?)'
            );
            $stmt->execute([$kodeToko]);
            $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);
            if (count($rows) === 0) {
                return $this->json($response, ['success' => false, 'message' => 'Data tidak valid. Periksa kode toko.'], 400);
            }
            if (count($rows) > 1) {
                return $this->json($response, ['success' => false, 'message' => 'Kode toko ganda di data. Hubungi admin.'], 400);
            }
            $toko = $rows[0];

            $namaDbNorm = $this->normalizeJudulForCompare((string) ($toko['nama_toko'] ?? ''));
            $namaInNorm = $this->normalizeJudulForCompare($namaInput);
            if ($namaDbNorm === '' || $namaInNorm === '' || $namaDbNorm !== $namaInNorm) {
                return $this->json($response, ['success' => false, 'message' => 'Nama toko tidak sesuai data. Samakan penulisan dengan data resmi.'], 400);
            }

            if (!empty($toko['id_users'])) {
                return $this->json($response, [
                    'success' => true,
                    'already_registered' => true,
                    'message' => 'Akun toko sudah terdaftar. Silakan login dengan username dan password.',
                ], 200);
            }

            if ($this->isNoWaUsedByOtherUser($noWaNorm)) {
                $existingUserId = $this->findUsersIdByNoWa62($noWaNorm);
                if ($existingUserId === null) {
                    return $this->json($response, ['success' => false, 'message' => 'Terjadi kesalahan pengecekan akun.'], 500);
                }
                $stmtOt = $this->db->prepare('SELECT id FROM cashless___pedagang WHERE id_users = ? AND id <> ? LIMIT 1');
                $stmtOt->execute([$existingUserId, (int) $toko['id']]);
                if ($stmtOt->fetch(\PDO::FETCH_ASSOC)) {
                    return $this->json($response, [
                        'success' => false,
                        'message' => 'Nomor ini dipakai akun yang sudah terhubung ke toko lain. Hubungi admin.',
                    ], 400);
                }
                $pjNama = trim((string) ($toko['penanggung_jawab_nama'] ?? ''));
                return $this->json($response, [
                    'success' => true,
                    'already_registered' => false,
                    'need_verify_existing_user' => true,
                    'require_penanggung_jawab' => ($pjNama !== ''),
                    'nama' => $toko['nama_toko'] ? (string) $toko['nama_toko'] : 'Toko',
                    'no_wa' => $noWa,
                ], 200);
            }

            return $this->json($response, [
                'success' => true,
                'already_registered' => false,
                'nama' => $toko['nama_toko'] ? (string) $toko['nama_toko'] : 'Toko',
                'no_wa' => $noWa,
            ], 200);
        } catch (\Exception $e) {
            error_log('AuthControllerV2::daftarCheckToko ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Terjadi kesalahan'], 500);
        }
    }

    /**
     * Konfirmasi daftar toko: token setup (5 menit). Frontend → /setup-akun?portal=toko.
     */
    public function daftarKonfirmasiToko(Request $request, Response $response): Response
    {
        try {
            if (!$this->userSetupTokensHasEntityColumns()) {
                return $this->json($response, ['success' => false, 'message' => 'Layanan sementara tidak tersedia. Coba lagi dalam beberapa saat.'], 503);
            }

            $data = $request->getParsedBody();
            $data = is_array($data) ? TextSanitizer::sanitizeMybeddianAuthBody($data) : [];
            $kodeToko = trim((string) ($data['kode_toko'] ?? ''));
            $namaVal = TextSanitizer::validatePersonName($data['nama_toko'] ?? ($data['nama'] ?? ''), 2, 255);
            if ($namaVal['error'] !== null) {
                return $this->json($response, ['success' => false, 'message' => $namaVal['error']], 400);
            }
            $namaInput = $namaVal['text'];
            $noWa = trim((string) ($data['no_wa'] ?? ''));

            if ($kodeToko === '' || $namaInput === '' || $noWa === '') {
                return $this->json($response, ['success' => false, 'message' => 'Kode toko, nama toko, dan No. HP harus diisi'], 400);
            }

            $noWaNorm = $this->normalizeNoWaTo62($noWa);
            if ($noWaNorm === null) {
                return $this->json($response, ['success' => false, 'message' => 'Nomor WhatsApp tidak valid'], 400);
            }

            if ($this->isNoWaUsedByOtherUser($noWaNorm)) {
                return $this->json($response, [
                    'success' => false,
                    'message' => 'Nomor WhatsApp sudah dipakai akun. Gunakan alur hubungkan akun.',
                ], 400);
            }

            $stmt = $this->db->prepare(
                'SELECT id, nama_toko, kode_toko, id_users
                 FROM cashless___pedagang
                 WHERE kode_toko IS NOT NULL AND TRIM(kode_toko) <> \'\' AND UPPER(TRIM(kode_toko)) = UPPER(?)'
            );
            $stmt->execute([$kodeToko]);
            $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);
            if (count($rows) !== 1) {
                return $this->json($response, ['success' => false, 'message' => 'Data tidak valid'], 400);
            }
            $toko = $rows[0];

            $namaDbNorm = $this->normalizeJudulForCompare((string) ($toko['nama_toko'] ?? ''));
            $namaInNorm = $this->normalizeJudulForCompare($namaInput);
            if ($namaDbNorm === '' || $namaInNorm === '' || $namaDbNorm !== $namaInNorm) {
                return $this->json($response, ['success' => false, 'message' => 'Nama toko tidak sesuai data'], 400);
            }

            if (!empty($toko['id_users'])) {
                return $this->json($response, ['success' => false, 'message' => 'Data tidak valid atau sudah terdaftar'], 400);
            }

            $tokoId = (int) $toko['id'];

            $out = $this->buildMybeddianAuthWaPrepareResponse(
                MybeddianAuthWaHelper::PURPOSE_DAFTAR,
                'toko',
                $noWaNorm,
                [
                    'entity_type' => 'toko',
                    'entity_id' => $tokoId,
                    'no_wa' => $noWaNorm,
                ],
                [
                    'Mode: toko',
                    'Kode: ' . strtoupper(trim($kodeToko)),
                    'Nama: ' . $namaInput,
                    'Nomor WA: ' . $noWaNorm,
                ],
                'Buka WhatsApp, kirim pesan berisi token, lalu buka link balasan untuk membuat username & password toko.'
            );

            return $this->json($response, $out, 200);
        } catch (\RuntimeException $e) {
            error_log('AuthControllerV2::daftarKonfirmasiToko Runtime ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => $e->getMessage()], 503);
        } catch (\Throwable $e) {
            error_log('AuthControllerV2::daftarKonfirmasiToko ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
            return $this->json($response, ['success' => false, 'message' => 'Terjadi kesalahan server. Coba lagi atau hubungi admin.'], 500);
        }
    }

    /**
     * Toko: nomor WA sudah di users — verifikasi username + password (+ nama penanggung jawab jika terisi di data),
     * lalu set cashless___pedagang.id_users tanpa membuat akun baru.
     */
    public function daftarTokoHubungAkun(Request $request, Response $response): Response
    {
        try {
            $parsed = $request->getParsedBody();
            $parsed = is_array($parsed) ? $parsed : [];
            $password = array_key_exists('password', $parsed) ? (string) $parsed['password'] : '';

            $data = TextSanitizer::sanitizeMybeddianAuthBody($parsed);
            $kodeToko = trim((string) ($data['kode_toko'] ?? ''));
            $namaVal = TextSanitizer::validatePersonName($data['nama_toko'] ?? ($data['nama'] ?? ''), 2, 255);
            if ($namaVal['error'] !== null) {
                return $this->json($response, ['success' => false, 'message' => $namaVal['error']], 400);
            }
            $namaInput = $namaVal['text'];
            $noWa = trim((string) ($data['no_wa'] ?? ''));
            $username = trim((string) ($data['username'] ?? ''));
            $pjInput = '';
            if (array_key_exists('penanggung_jawab_nama', $data) && trim((string) ($data['penanggung_jawab_nama'] ?? '')) !== '') {
                $pjVal = TextSanitizer::validatePersonName($data['penanggung_jawab_nama'] ?? '', 2, 255);
                if ($pjVal['error'] !== null) {
                    return $this->json($response, ['success' => false, 'message' => $pjVal['error']], 400);
                }
                $pjInput = $pjVal['text'];
            }

            if ($kodeToko === '' || $namaInput === '' || $noWa === '' || $username === '' || $password === '') {
                return $this->json($response, ['success' => false, 'message' => 'Lengkapi kode toko, nama toko, nomor WA, username, dan password.'], 400);
            }

            $noWaNorm = $this->normalizeNoWaTo62($noWa);
            if ($noWaNorm === null) {
                return $this->json($response, ['success' => false, 'message' => 'Nomor WhatsApp tidak valid'], 400);
            }

            if (!$this->isNoWaUsedByOtherUser($noWaNorm)) {
                return $this->json($response, ['success' => false, 'message' => 'Nomor ini belum terpasang di akun. Gunakan alur daftar biasa.'], 400);
            }

            $stmt = $this->db->prepare(
                'SELECT id, nama_toko, kode_toko, id_users, penanggung_jawab_nama
                 FROM cashless___pedagang
                 WHERE kode_toko IS NOT NULL AND TRIM(kode_toko) <> \'\' AND UPPER(TRIM(kode_toko)) = UPPER(?)'
            );
            $stmt->execute([$kodeToko]);
            $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);
            if (count($rows) !== 1) {
                return $this->json($response, ['success' => false, 'message' => 'Data toko tidak valid'], 400);
            }
            $toko = $rows[0];

            $namaDbNorm = $this->normalizeJudulForCompare((string) ($toko['nama_toko'] ?? ''));
            $namaInNorm = $this->normalizeJudulForCompare($namaInput);
            if ($namaDbNorm === '' || $namaInNorm === '' || $namaDbNorm !== $namaInNorm) {
                return $this->json($response, ['success' => false, 'message' => 'Nama toko tidak sesuai data'], 400);
            }

            if (!empty($toko['id_users'])) {
                return $this->json($response, ['success' => false, 'message' => 'Toko ini sudah memiliki akun. Silakan login.'], 400);
            }

            $tokoId = (int) $toko['id'];
            $pjDb = trim((string) ($toko['penanggung_jawab_nama'] ?? ''));
            if ($pjDb !== '') {
                if ($pjInput === '') {
                    return $this->json($response, ['success' => false, 'message' => 'Isi nama penanggung jawab sesuai data toko.'], 400);
                }
                if ($this->normalizeJudulForCompare($pjDb) !== $this->normalizeJudulForCompare($pjInput)) {
                    return $this->json($response, ['success' => false, 'message' => 'Data verifikasi tidak sesuai.'], 400);
                }
            }

            $userId = $this->findUsersIdByNoWa62($noWaNorm);
            if ($userId === null) {
                return $this->json($response, ['success' => false, 'message' => 'Akun tidak ditemukan.'], 400);
            }

            $stmtU = $this->db->prepare('SELECT id, username, password FROM users WHERE id = ? LIMIT 1');
            $stmtU->execute([$userId]);
            $userRow = $stmtU->fetch(\PDO::FETCH_ASSOC);
            if (!$userRow) {
                return $this->json($response, ['success' => false, 'message' => 'Akun tidak ditemukan.'], 400);
            }
            if (mb_strtolower(trim((string) $userRow['username']), 'UTF-8') !== mb_strtolower($username, 'UTF-8')) {
                return $this->json($response, ['success' => false, 'message' => 'Data verifikasi tidak sesuai.'], 400);
            }
            if (!PasswordHelper::verifyPassword($password, (string) ($userRow['password'] ?? ''))) {
                return $this->json($response, ['success' => false, 'message' => 'Data verifikasi tidak sesuai.'], 400);
            }

            $stmtOt = $this->db->prepare('SELECT id FROM cashless___pedagang WHERE id_users = ? AND id <> ? LIMIT 1');
            $stmtOt->execute([$userId, $tokoId]);
            if ($stmtOt->fetch(\PDO::FETCH_ASSOC)) {
                return $this->json($response, ['success' => false, 'message' => 'Akun sudah terhubung ke toko lain. Hubungi admin.'], 400);
            }

            $this->db->beginTransaction();
            try {
                $upd = $this->db->prepare('UPDATE cashless___pedagang SET id_users = ? WHERE id = ? AND id_users IS NULL');
                $upd->execute([$userId, $tokoId]);
                if ($upd->rowCount() === 0) {
                    $this->db->rollBack();
                    return $this->json($response, ['success' => false, 'message' => 'Toko sudah terdaftar atau data berubah. Silakan login atau coba lagi.'], 400);
                }
                $this->db->commit();
            } catch (\Throwable $e) {
                if ($this->db->inTransaction()) {
                    try {
                        $this->db->rollBack();
                    } catch (\Throwable $ignored) {
                    }
                }
                error_log('AuthControllerV2::daftarTokoHubungAkun (tx) ' . $e->getMessage());
                return $this->json($response, ['success' => false, 'message' => 'Terjadi kesalahan saat menyimpan.'], 500);
            }

            AuditLogger::log((string) $userId, 'toko_hubung_akun_existing', ['id_toko' => $tokoId], $this->getClientIp($request), true);

            return $this->json($response, [
                'success' => true,
                'message' => 'Akun berhasil dihubungkan ke toko ini. Silakan login dengan username dan password yang sudah Anda punya.',
            ], 200);
        } catch (\Throwable $e) {
            error_log('AuthControllerV2::daftarTokoHubungAkun ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
            return $this->json($response, ['success' => false, 'message' => 'Terjadi kesalahan server. Coba lagi atau hubungi admin.'], 500);
        }
    }

    /**
     * Profil: cek cepat status NIS sebelum submit tambah akses santri.
     * POST /api/mybeddian/v2/auth/tambah-akses-check-nis  Body: { nis }
     */
    public function tambahAksesCheckNis(Request $request, Response $response): Response
    {
        try {
            $payload = $request->getAttribute('user');
            $payloadArr = is_array($payload) ? $payload : [];
            $usersId = $this->getUsersIdFromPayload($payloadArr);
            if ($usersId === null || $usersId < 1) {
                return $this->json($response, ['success' => false, 'message' => 'Sesi tidak valid. Login ulang.'], 401);
            }

            $data = $request->getParsedBody();
            $data = is_array($data) ? TextSanitizer::sanitizeMybeddianAuthBody($data) : [];
            $nis = trim((string) ($data['nis'] ?? ''));
            if ($nis === '') {
                return $this->json($response, ['success' => false, 'message' => 'NIS harus diisi'], 400);
            }

            $santriId = SantriHelper::resolveId($this->db, $nis);
            if ($santriId === null) {
                return $this->json($response, [
                    'success' => false,
                    'code' => 'not_found',
                    'message' => 'NIS tidak ditemukan',
                ], 404);
            }

            $stmt = $this->db->prepare('SELECT id, nama, id_user, nis FROM santri WHERE id = ? LIMIT 1');
            $stmt->execute([$santriId]);
            $santri = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$santri) {
                return $this->json($response, [
                    'success' => false,
                    'code' => 'not_found',
                    'message' => 'NIS tidak ditemukan',
                ], 404);
            }

            $bound = isset($santri['id_user']) && $santri['id_user'] !== null && $santri['id_user'] !== ''
                ? (int) $santri['id_user']
                : 0;
            $dataOut = [
                'nis' => (string) ($santri['nis'] ?? $nis),
                'nama' => (string) ($santri['nama'] ?? ''),
                'id_santri' => (int) $santriId,
            ];

            if ($bound === $usersId) {
                return $this->json($response, [
                    'success' => false,
                    'code' => 'already_on_this_account',
                    'message' => 'NIS ini sudah ada di akun Anda.',
                    'data' => $dataOut,
                ], 400);
            }
            if ($bound > 0) {
                return $this->json($response, [
                    'success' => false,
                    'code' => 'linked_other_account',
                    'message' => 'NIS ini sudah tertaut ke akun lain.',
                    'data' => $dataOut,
                ], 400);
            }

            return $this->json($response, [
                'success' => true,
                'code' => 'available',
                'message' => 'NIS tersedia untuk ditambahkan ke akun ini.',
                'data' => $dataOut,
            ], 200);
        } catch (\Throwable $e) {
            error_log('AuthControllerV2::tambahAksesCheckNis ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());

            return $this->json($response, ['success' => false, 'message' => 'Terjadi kesalahan server. Coba lagi atau hubungi admin.'], 500);
        }
    }

    /**
     * Profil (sudah login): siapkan WA tambah akses mode santri/pjgt/toko.
     * Body: mode + field sama daftar. Nomor WA wajib sama dengan users.no_wa akun.
     * POST /api/mybeddian/v2/auth/tambah-akses-prepare
     */
    public function tambahAksesPrepare(Request $request, Response $response): Response
    {
        try {
            $payload = $request->getAttribute('user');
            $payloadArr = is_array($payload) ? $payload : [];
            $usersId = $this->getUsersIdFromPayload($payloadArr);
            if ($usersId === null || $usersId < 1) {
                return $this->json($response, ['success' => false, 'message' => 'Sesi tidak valid. Login ulang.'], 401);
            }

            $data = $request->getParsedBody();
            $data = is_array($data) ? TextSanitizer::sanitizeMybeddianAuthBody($data) : [];
            $mode = strtolower(trim((string) ($data['mode'] ?? 'santri')));
            if (!in_array($mode, ['santri', 'pjgt', 'toko'], true)) {
                return $this->json($response, ['success' => false, 'message' => 'Mode tidak valid'], 400);
            }

            $noWa = trim((string) ($data['no_wa'] ?? ''));
            $noWaNorm = $this->normalizeNoWaTo62($noWa);
            if ($noWaNorm === null) {
                return $this->json($response, ['success' => false, 'message' => 'Nomor WhatsApp tidak valid'], 400);
            }

            $stmtU = $this->db->prepare('SELECT id, no_wa, id_madrasah FROM users WHERE id = ? LIMIT 1');
            $stmtU->execute([$usersId]);
            $userRow = $stmtU->fetch(\PDO::FETCH_ASSOC);
            if (!$userRow) {
                return $this->json($response, ['success' => false, 'message' => 'Akun tidak ditemukan'], 401);
            }
            $userWa = $this->normalizeNoWaTo62((string) ($userRow['no_wa'] ?? ''));
            if ($userWa === null || $userWa !== $noWaNorm) {
                return $this->json($response, [
                    'success' => false,
                    'message' => 'Nomor WhatsApp harus sama dengan nomor yang terdaftar di akun Anda.',
                ], 400);
            }

            $entityType = 'santri';
            $entityId = 0;
            $messageLines = ['Mode: ' . $mode];

            if ($mode === 'santri') {
                $nis = trim((string) ($data['nis'] ?? ''));
                $nik = trim((string) ($data['nik'] ?? ''));
                if ($nis === '' || $nik === '') {
                    return $this->json($response, ['success' => false, 'message' => 'NIS dan NIK harus diisi'], 400);
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
                $stmt = $this->db->prepare('SELECT id, nama, id_user, nik FROM santri WHERE id = ? LIMIT 1');
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
                        'data' => [
                            'nis' => $nis,
                            'nama' => (string) ($santri['nama'] ?? ''),
                            'id_santri' => (int) $santriId,
                        ],
                    ], 400);
                }
                if ($bound > 0) {
                    return $this->json($response, [
                        'success' => false,
                        'code' => 'linked_other_account',
                        'message' => 'NIS ini sudah tertaut ke akun lain.',
                        'data' => [
                            'nis' => $nis,
                            'nama' => (string) ($santri['nama'] ?? ''),
                            'id_santri' => (int) $santriId,
                        ],
                    ], 400);
                }
                $nikDbNorm = NikHelper::normalize((string) ($santri['nik'] ?? ''));
                if ($nikDbNorm === null || $nikDbNorm === '' || $nikDbNorm !== $nik) {
                    return $this->json($response, ['success' => false, 'message' => 'NIK tidak sesuai dengan data santri.'], 400);
                }
                $entityType = 'santri';
                $entityId = (int) $santriId;
                $messageLines[] = 'NIS: ' . $nis;
                $messageLines[] = 'NIK: ' . $nik;
            } elseif ($mode === 'pjgt') {
                $identitas = trim((string) ($data['identitas'] ?? ''));
                $namaVal = TextSanitizer::validatePersonName($data['nama'] ?? '', 2, 255);
                if ($namaVal['error'] !== null) {
                    return $this->json($response, ['success' => false, 'message' => $namaVal['error']], 400);
                }
                $namaInput = $namaVal['text'];
                if ($identitas === '' || $namaInput === '') {
                    return $this->json($response, ['success' => false, 'message' => 'Identitas dan nama madrasah harus diisi'], 400);
                }
                $stmt = $this->db->prepare(
                    "SELECT id, nama, identitas, no_pjgt, id_pjgt FROM madrasah
                     WHERE identitas IS NOT NULL AND TRIM(identitas) <> '' AND UPPER(TRIM(identitas)) = UPPER(?)"
                );
                $stmt->execute([$identitas]);
                $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);
                if (count($rows) !== 1) {
                    return $this->json($response, ['success' => false, 'message' => 'Data madrasah tidak valid'], 400);
                }
                $m = $rows[0];
                if ($this->normalizeJudulForCompare((string) ($m['nama'] ?? '')) !== $this->normalizeJudulForCompare($namaInput)) {
                    return $this->json($response, ['success' => false, 'message' => 'Nama madrasah tidak sesuai data'], 400);
                }
                $waCheck = $this->assertMadrasahPjgtWaForDaftar($m, $noWaNorm);
                if (!$waCheck['ok']) {
                    return $this->json($response, ['success' => false, 'message' => $waCheck['message'] ?? 'Nomor WhatsApp tidak valid'], 400);
                }
                $bound = !empty($m['id_pjgt']) ? (int) $m['id_pjgt'] : 0;
                if ($bound > 0 && $bound !== $usersId) {
                    return $this->json($response, ['success' => false, 'message' => 'Madrasah ini sudah memiliki akun PJGT.'], 400);
                }
                $uidMadrasah = isset($userRow['id_madrasah']) && $userRow['id_madrasah'] !== null && $userRow['id_madrasah'] !== ''
                    ? (int) $userRow['id_madrasah']
                    : null;
                $madrasahId = (int) $m['id'];
                if ($uidMadrasah !== null && $uidMadrasah !== $madrasahId) {
                    return $this->json($response, ['success' => false, 'message' => 'Akun sudah terhubung ke madrasah lain sebagai PJGT.'], 400);
                }
                $stmtOm = $this->db->prepare('SELECT id FROM madrasah WHERE id_pjgt = ? AND id <> ? LIMIT 1');
                $stmtOm->execute([$usersId, $madrasahId]);
                if ($stmtOm->fetch(\PDO::FETCH_ASSOC)) {
                    return $this->json($response, ['success' => false, 'message' => 'Akun ini sudah menjadi PJGT di madrasah lain.'], 400);
                }
                if (!empty($waCheck['first_registration'])) {
                    $this->persistMadrasahNoPjgtIfEmpty($madrasahId, $noWa);
                }
                $entityType = 'madrasah';
                $entityId = $madrasahId;
                $messageLines[] = 'Identitas: ' . $identitas;
                $messageLines[] = 'Nama: ' . $namaInput;
            } else {
                $kodeToko = trim((string) ($data['kode_toko'] ?? ''));
                $namaVal = TextSanitizer::validatePersonName($data['nama_toko'] ?? $data['nama'] ?? '', 2, 255);
                if ($namaVal['error'] !== null) {
                    return $this->json($response, ['success' => false, 'message' => $namaVal['error']], 400);
                }
                $namaToko = $namaVal['text'];
                if ($kodeToko === '' || $namaToko === '') {
                    return $this->json($response, ['success' => false, 'message' => 'Kode toko dan nama toko harus diisi'], 400);
                }
                $stmt = $this->db->prepare(
                    'SELECT id, nama_toko, kode_toko, id_users FROM cashless___pedagang
                     WHERE UPPER(TRIM(kode_toko)) = UPPER(?) LIMIT 1'
                );
                $stmt->execute([$kodeToko]);
                $toko = $stmt->fetch(\PDO::FETCH_ASSOC);
                if (!$toko) {
                    return $this->json($response, ['success' => false, 'message' => 'Kode toko tidak ditemukan'], 404);
                }
                if ($this->normalizeJudulForCompare((string) ($toko['nama_toko'] ?? '')) !== $this->normalizeJudulForCompare($namaToko)) {
                    return $this->json($response, ['success' => false, 'message' => 'Nama toko tidak sesuai data'], 400);
                }
                $bound = !empty($toko['id_users']) ? (int) $toko['id_users'] : 0;
                if ($bound > 0 && $bound !== $usersId) {
                    return $this->json($response, ['success' => false, 'message' => 'Toko ini sudah terhubung ke akun lain.'], 400);
                }
                $tokoId = (int) $toko['id'];
                $stmtOt = $this->db->prepare('SELECT id FROM cashless___pedagang WHERE id_users = ? AND id <> ? LIMIT 1');
                $stmtOt->execute([$usersId, $tokoId]);
                if ($stmtOt->fetch(\PDO::FETCH_ASSOC)) {
                    return $this->json($response, ['success' => false, 'message' => 'Akun sudah terhubung ke toko lain.'], 400);
                }
                $entityType = 'toko';
                $entityId = $tokoId;
                $messageLines[] = 'Kode toko: ' . $kodeToko;
                $messageLines[] = 'Nama toko: ' . $namaToko;
            }

            $messageLines[] = 'Nomor WA: ' . $noWaNorm;

            $out = $this->buildMybeddianAuthWaPrepareResponse(
                MybeddianAuthWaHelper::PURPOSE_TAMBAH_AKSES,
                $mode,
                $noWaNorm,
                [
                    'user_id' => $usersId,
                    'entity_type' => $entityType,
                    'entity_id' => $entityId,
                    'access_mode' => $mode,
                    'no_wa' => $noWaNorm,
                ],
                $messageLines,
                'Buka WhatsApp, kirim pesan berisi token, lalu buka link balasan untuk masuk ke mode akses di Profil.'
            );

            return $this->json($response, $out, 200);
        } catch (\RuntimeException $e) {
            error_log('AuthControllerV2::tambahAksesPrepare ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Layanan sementara tidak tersedia. Coba lagi dalam beberapa saat.'], 503);
        } catch (\Throwable $e) {
            error_log('AuthControllerV2::tambahAksesPrepare ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
            return $this->json($response, ['success' => false, 'message' => 'Terjadi kesalahan server. Coba lagi atau hubungi admin.'], 500);
        }
    }

    /**
     * Tukar token sekali pakai (dari link WA tambah akses) menjadi sesi login + preferensi mode.
     * POST /api/mybeddian/v2/auth/tambah-akses-consume  Body: { token }
     */
    public function tambahAksesConsume(Request $request, Response $response): Response
    {
        try {
            $data = $request->getParsedBody();
            $data = is_array($data) ? $data : [];
            $token = $this->normalizeSecurityToken((string) ($data['token'] ?? ''));
            if ($token === '' || strlen($token) !== 64) {
                return $this->json($response, ['success' => false, 'message' => 'Token tidak valid'], 400);
            }
            $tokenHash = hash('sha256', $token);

            $row = $this->withIndonesiaTimezone(function () use ($tokenHash) {
                $stmt = $this->db->prepare(
                    'SELECT id, purpose, mode, payload_json, used_at, expires_at
                     FROM mybeddian_auth_wa_tokens
                     WHERE token_hash = ? LIMIT 1'
                );
                $stmt->execute([$tokenHash]);
                return $stmt->fetch(\PDO::FETCH_ASSOC);
            });
            if (!$row) {
                return $this->json($response, ['success' => false, 'message' => 'Token tidak dikenali atau sudah tidak berlaku'], 400);
            }
            if ((string) ($row['purpose'] ?? '') !== MybeddianAuthWaHelper::PURPOSE_MASUK_AKSES) {
                return $this->json($response, ['success' => false, 'message' => 'Token tidak valid untuk masuk akses'], 400);
            }
            if (!empty($row['used_at'])) {
                return $this->json($response, ['success' => false, 'message' => 'Token sudah dipakai. Buka Profil dan muat ulang akses Anda.'], 400);
            }
            $expiresAt = strtotime((string) ($row['expires_at'] ?? ''));
            if ($expiresAt === false || $expiresAt < time()) {
                return $this->json($response, ['success' => false, 'message' => 'Token sudah kedaluwarsa. Tambah akses ulang dari Profil.'], 400);
            }

            $payload = json_decode((string) ($row['payload_json'] ?? ''), true);
            if (!is_array($payload)) {
                return $this->json($response, ['success' => false, 'message' => 'Data token rusak'], 400);
            }
            $usersId = (int) ($payload['user_id'] ?? 0);
            $accessMode = strtolower((string) ($payload['access_mode'] ?? $row['mode'] ?? 'santri'));
            $entityType = (string) ($payload['entity_type'] ?? 'santri');
            $entityId = (int) ($payload['entity_id'] ?? 0);
            if ($usersId < 1 || !in_array($accessMode, ['santri', 'pjgt', 'toko'], true)) {
                return $this->json($response, ['success' => false, 'message' => 'Token tidak lengkap'], 400);
            }

            $upd = $this->db->prepare(
                'UPDATE mybeddian_auth_wa_tokens SET used_at = NOW() WHERE id = ? AND used_at IS NULL'
            );
            $upd->execute([(int) $row['id']]);
            if ($upd->rowCount() < 1) {
                return $this->json($response, ['success' => false, 'message' => 'Token sudah dipakai'], 400);
            }

            $loginExtras = [
                'preferred_access' => $accessMode,
                'preferred_santri_id' => ($entityType === 'santri' && $entityId > 0) ? $entityId : null,
                'redirect_url' => '/profil',
            ];

            // Preferensi santri aktif di body agar completeLoginSession memakai santri yang baru ditautkan
            $overrideBody = [];
            if ($entityType === 'santri' && $entityId > 0) {
                $overrideBody['santri_id'] = $entityId;
            }

            return $this->finalizeLoginForUserId(
                $request,
                $response,
                $usersId,
                $overrideBody,
                $loginExtras,
                true,
                []
            );
        } catch (\Throwable $e) {
            error_log('AuthControllerV2::tambahAksesConsume ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
            return $this->json($response, ['success' => false, 'message' => 'Terjadi kesalahan saat masuk akses'], 500);
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
                    SELECT st.id, st.entity_type, st.entity_id, COALESCE(s.nama, m.nama, p.nama_toko) AS nama
                    FROM user___setup_tokens st
                    LEFT JOIN santri s ON st.entity_type = 'santri' AND s.id = st.entity_id
                    LEFT JOIN madrasah m ON st.entity_type = 'madrasah' AND m.id = st.entity_id
                    LEFT JOIN cashless___pedagang p ON st.entity_type = 'toko' AND p.id = st.entity_id
                    WHERE st.token_hash = ? AND st.expires_at > NOW()
                      AND (
                        (st.entity_type = 'santri' AND s.id IS NOT NULL)
                        OR (st.entity_type = 'madrasah' AND m.id IS NOT NULL)
                        OR (st.entity_type = 'toko' AND p.id IS NOT NULL)
                      )
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
                        $stmtInv = $this->db->prepare('SELECT id, wa_message_id, no_wa, entity_type FROM user___setup_tokens WHERE token_hash = ?');
                        $stmtInv->execute([$tokenHash]);
                        $inv = $stmtInv->fetch(\PDO::FETCH_ASSOC);
                        if ($inv && !empty($inv['wa_message_id']) && !empty($inv['no_wa'])) {
                            $isExpired = $this->withIndonesiaTimezone(function () use ($inv) {
                                $r = $this->db->prepare('SELECT 1 FROM user___setup_tokens WHERE id = ? AND expires_at <= NOW()');
                                $r->execute([$inv['id']]);
                                return $r->fetch() !== false;
                            });
                            if ($isExpired) {
                                $judul = $this->waJudulVerifikasiDaftarMybeddian((string)($inv['entity_type'] ?? 'santri'));
                                $this->editWaMessageTokenInvalidated($inv['no_wa'], $inv['wa_message_id'], 'kadaluarsa', $judul);
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

            $et = (string)($row['entity_type'] ?? 'santri');
            $defaultNama = $et === 'madrasah' ? 'Madrasah' : ($et === 'toko' ? 'Toko' : 'Santri');
            return $this->json($response, [
                'success' => true,
                'valid' => true,
                'entity_type' => $et,
                'nama' => $row['nama'] ?: $defaultNama,
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
            $data = is_array($data) ? TextSanitizer::sanitizeMybeddianAuthBody($data) : [];
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
            $pwdErr = $this->validatePasswordLength($password);
            if ($pwdErr !== null) {
                return $this->json($response, ['success' => false, 'message' => $pwdErr], 400);
            }

            $tokenHash = hash('sha256', $token);
            $row = $this->withIndonesiaTimezone(function () use ($tokenHash) {
                if ($this->userSetupTokensHasEntityColumns()) {
                    $stmt = $this->db->prepare("
                    SELECT st.id, st.entity_type, st.entity_id, st.no_wa
                    FROM user___setup_tokens st
                    LEFT JOIN santri s ON st.entity_type = 'santri' AND s.id = st.entity_id AND s.id_user IS NULL
                    LEFT JOIN madrasah m ON st.entity_type = 'madrasah' AND m.id = st.entity_id AND m.id_pjgt IS NULL
                    LEFT JOIN cashless___pedagang p ON st.entity_type = 'toko' AND p.id = st.entity_id AND p.id_users IS NULL
                    WHERE st.token_hash = ? AND st.expires_at > NOW()
                      AND (
                        (st.entity_type = 'santri' AND s.id IS NOT NULL)
                        OR (st.entity_type = 'madrasah' AND m.id IS NOT NULL)
                        OR (st.entity_type = 'toko' AND p.id IS NOT NULL)
                      )
                ");
                    $stmt->execute([$tokenHash]);
                    return $stmt->fetch(\PDO::FETCH_ASSOC);
                }
                if ($this->userSetupTokensSantriLegacyTableExists()) {
                    $nw = $this->userSetupTokensSantriLegacyHasNoWaColumn() ? 'st.no_wa' : 'NULL AS no_wa';
                    $stmt = $this->db->prepare("
                        SELECT st.id, 'santri' AS entity_type, st.id_santri AS entity_id, {$nw}
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

            $entityType = (string)($row['entity_type'] ?? 'santri');
            if ($entityType === 'madrasah') {
                $madrasahId = (int) $row['entity_id'];
                $noWaM = isset($row['no_wa']) && $row['no_wa'] !== null && $row['no_wa'] !== '' ? trim((string) $row['no_wa']) : null;
                if ($noWaM !== null) {
                    $noWaNormM = $this->normalizeNoWaTo62($noWaM);
                    if ($noWaNormM !== null && $this->isNoWaUsedByOtherUser($noWaNormM)) {
                        return $this->json($response, ['success' => false, 'message' => 'Nomor WA sudah dipakai'], 400);
                    }
                }

                $passwordHashM = PasswordHelper::hashPassword($password);
                $this->db->beginTransaction();
                try {
                    $insM = $this->db->prepare("
                        INSERT INTO users (username, password, no_wa, email, role, id_madrasah, is_active, access_ebeddien)
                        VALUES (?, ?, ?, NULL, 'pjgt', ?, 1, 0)
                    ");
                    $insM->execute([$username, $passwordHashM, $noWaM, $madrasahId]);
                    $userIdM = (int) $this->db->lastInsertId();

                    $this->db->prepare("INSERT INTO user___password_history (user_id, password_hash) VALUES (?, ?)")->execute([$userIdM, $passwordHashM]);
                    $this->db->prepare("UPDATE users SET no_wa_verified_at = NOW() WHERE id = ?")->execute([$userIdM]);

                    $updM = $this->db->prepare("UPDATE madrasah SET id_pjgt = ? WHERE id = ? AND id_pjgt IS NULL");
                    $updM->execute([$userIdM, $madrasahId]);
                    if ($updM->rowCount() === 0) {
                        $this->db->rollBack();
                        return $this->json($response, ['success' => false, 'message' => 'Token tidak valid atau data sudah berubah. Minta link baru dari halaman Daftar.'], 400);
                    }
                    $this->persistMadrasahNoPjgtIfEmpty($madrasahId, $noWaM);

                    try {
                        $stmtWaM = $this->db->prepare('SELECT wa_message_id, no_wa FROM user___setup_tokens WHERE token_hash = ?');
                        $stmtWaM->execute([$tokenHash]);
                        $waRowM = $stmtWaM->fetch(\PDO::FETCH_ASSOC);
                        if ($waRowM && !empty($waRowM['wa_message_id']) && !empty($waRowM['no_wa'])) {
                            $this->editWaMessageTokenInvalidated($waRowM['no_wa'], $waRowM['wa_message_id'], 'dipakai', $this->waJudulVerifikasiDaftarMybeddian('madrasah'));
                        }
                    } catch (\Throwable $e) {
                    }
                    $this->db->prepare('DELETE FROM user___setup_tokens WHERE token_hash = ?')->execute([$tokenHash]);
                    $this->db->commit();
                } catch (\PDOException $pdoEx) {
                    $this->db->rollBack();
                    $duplicateMessage = $this->getUsersDuplicateFieldMessage($pdoEx);
                    if ($duplicateMessage !== null) {
                        return $this->json($response, ['success' => false, 'message' => $duplicateMessage], 400);
                    }
                    if (strpos(strtolower($pdoEx->getMessage()), 'id_madrasah') !== false || strpos(strtolower($pdoEx->getMessage()), 'fk_users_id_madrasah') !== false) {
                        return $this->json($response, ['success' => false, 'message' => 'Basis data belum diperbarui. Hubungi admin (migrasi id_madrasah).'], 503);
                    }
                    error_log('AuthControllerV2::postSetupAkunSantri madrasah ' . $pdoEx->getMessage());
                    return $this->json($response, ['success' => false, 'message' => 'Terjadi kesalahan'], 500);
                } catch (\Throwable $e) {
                    $this->db->rollBack();
                    error_log('AuthControllerV2::postSetupAkunSantri madrasah ' . $e->getMessage());
                    return $this->json($response, ['success' => false, 'message' => 'Terjadi kesalahan'], 500);
                }

                AuditLogger::log((string)$userIdM, 'setup_akun_madrasah_pjgt', ['username' => $username, 'id_madrasah' => $madrasahId], $this->getClientIp($request), true);
                return $this->json($response, [
                    'success' => true,
                    'message' => 'Akun berhasil dibuat. Silakan login dengan username dan password.',
                ], 200);
            }

            if ($entityType === 'toko') {
                $tokoId = (int) $row['entity_id'];
                $noWaT = isset($row['no_wa']) && $row['no_wa'] !== null && $row['no_wa'] !== '' ? trim((string) $row['no_wa']) : null;
                if ($noWaT !== null) {
                    $noWaNormT = $this->normalizeNoWaTo62($noWaT);
                    if ($noWaNormT !== null && $this->isNoWaUsedByOtherUser($noWaNormT)) {
                        return $this->json($response, ['success' => false, 'message' => 'Nomor WA sudah dipakai'], 400);
                    }
                }

                $passwordHashT = PasswordHelper::hashPassword($password);
                $this->db->beginTransaction();
                try {
                    $insT = $this->db->prepare("
                        INSERT INTO users (username, password, no_wa, email, role, is_active, access_ebeddien)
                        VALUES (?, ?, ?, NULL, 'toko', 1, 0)
                    ");
                    $insT->execute([$username, $passwordHashT, $noWaT]);
                    $userIdT = (int) $this->db->lastInsertId();

                    $this->db->prepare("INSERT INTO user___password_history (user_id, password_hash) VALUES (?, ?)")->execute([$userIdT, $passwordHashT]);
                    $this->db->prepare("UPDATE users SET no_wa_verified_at = NOW() WHERE id = ?")->execute([$userIdT]);

                    $updT = $this->db->prepare('UPDATE cashless___pedagang SET id_users = ? WHERE id = ? AND id_users IS NULL');
                    $updT->execute([$userIdT, $tokoId]);
                    if ($updT->rowCount() === 0) {
                        $this->db->rollBack();
                        return $this->json($response, ['success' => false, 'message' => 'Token tidak valid atau data sudah berubah. Minta link baru dari halaman Daftar.'], 400);
                    }

                    try {
                        $stmtWaT = $this->db->prepare('SELECT wa_message_id, no_wa FROM user___setup_tokens WHERE token_hash = ?');
                        $stmtWaT->execute([$tokenHash]);
                        $waRowT = $stmtWaT->fetch(\PDO::FETCH_ASSOC);
                        if ($waRowT && !empty($waRowT['wa_message_id']) && !empty($waRowT['no_wa'])) {
                            $this->editWaMessageTokenInvalidated($waRowT['no_wa'], $waRowT['wa_message_id'], 'dipakai', $this->waJudulVerifikasiDaftarMybeddian('toko'));
                        }
                    } catch (\Throwable $e) {
                    }
                    $this->db->prepare('DELETE FROM user___setup_tokens WHERE token_hash = ?')->execute([$tokenHash]);
                    $this->db->commit();
                } catch (\PDOException $pdoEx) {
                    $this->db->rollBack();
                    $duplicateMessage = $this->getUsersDuplicateFieldMessage($pdoEx);
                    if ($duplicateMessage !== null) {
                        return $this->json($response, ['success' => false, 'message' => $duplicateMessage], 400);
                    }
                    error_log('AuthControllerV2::postSetupAkunSantri toko ' . $pdoEx->getMessage());
                    return $this->json($response, ['success' => false, 'message' => 'Terjadi kesalahan'], 500);
                } catch (\Throwable $e) {
                    $this->db->rollBack();
                    error_log('AuthControllerV2::postSetupAkunSantri toko ' . $e->getMessage());
                    return $this->json($response, ['success' => false, 'message' => 'Terjadi kesalahan'], 500);
                }

                AuditLogger::log((string) $userIdT, 'setup_akun_toko', ['username' => $username, 'id_toko' => $tokoId], $this->getClientIp($request), true);
                return $this->json($response, [
                    'success' => true,
                    'message' => 'Akun berhasil dibuat. Silakan login dengan username dan password.',
                ], 200);
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
                INSERT INTO users (username, password, no_wa, email, role, is_active, access_ebeddien)
                VALUES (?, ?, ?, ?, 'santri', 1, 0)
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
            $data = is_array($data) ? TextSanitizer::sanitizeMybeddianAuthBody($data) : [];
            $username = trim($data['username'] ?? '');
            $password = $data['password'] ?? '';

            if ($username === '' || $password === '') {
                return $this->json($response, ['success' => false, 'message' => 'Username dan password harus diisi'], 400);
            }

            $ip = $this->getClientIp($request);
            // FIX: Penulisan conditional operator yang salah pada $userAgent
            $userAgent = $request->getHeaderLine('User-Agent');
            $uaShort = $userAgent !== null && $userAgent !== '' ? substr($userAgent, 0, 500) : null;

            $loginPath = $request->getUri()->getPath();
            $forMybeddianLogin = $this->isMybeddianAuthRequest($request, $loginPath);

            $stmt = $this->db->prepare("SELECT id, username, password, role, is_active,
                COALESCE(access_ebeddien, 1) AS access_ebeddien,
                COALESCE(access_mybeddian_santri, 1) AS access_mybeddian_santri,
                COALESCE(access_mybeddian_toko, 1) AS access_mybeddian_toko,
                COALESCE(access_mybeddian_pjgt, 1) AS access_mybeddian_pjgt
                FROM users WHERE username = ? LIMIT 1");
            $stmt->execute([$username]);
            $user = $stmt->fetch(\PDO::FETCH_ASSOC);

            if (!$user) {
                LoginSuspiciousHelper::notifyIfThirdFailure($this->db, $ip, LoginSuspiciousHelper::ENDPOINT_V2, $username);
                AuditLogger::log('0', 'login_failed', ['username' => $username, 'user_agent' => $uaShort], $ip, false);
                $message = $forMybeddianLogin
                    ? 'Username tidak ditemukan.'
                    : 'Username atau password salah';
                return $this->json($response, ['success' => false, 'message' => $message], 401);
            }

            if ((int)($user['is_active'] ?? 1) !== 1) {
                AuditLogger::log((string)$user['id'], 'login_failed', ['reason' => 'akun_tidak_aktif', 'user_agent' => $uaShort], $ip, false);
                return $this->json($response, ['success' => false, 'message' => 'Akun tidak aktif'], 403);
            }

            if (!PasswordHelper::verifyPassword($password, $user['password'])) {
                LoginSuspiciousHelper::notifyIfThirdFailure($this->db, $ip, LoginSuspiciousHelper::ENDPOINT_V2, $username);
                AuditLogger::log((string)$user['id'], 'login_failed', ['reason' => 'password_salah', 'user_agent' => $uaShort], $ip, false);
                $message = $forMybeddianLogin
                    ? 'Password salah.'
                    : 'Username atau password salah';
                return $this->json($response, ['success' => false, 'message' => $message], 401);
            }
            if (!$forMybeddianLogin && (int)($user['access_ebeddien'] ?? 1) !== 1) {
                AuditLogger::log((string)$user['id'], 'login_failed', ['reason' => 'akses_ebeddien_nonaktif', 'user_agent' => $uaShort], $ip, false);
                return $this->json($response, ['success' => false, 'message' => 'Akses ke aplikasi eBeddien dinonaktifkan untuk akun ini. Hubungi admin.'], 403);
            }

            $portalMybeddianFlags = $this->portalMybeddianFlagsFromUserRow($user);

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
                ['show_passkey_prompt' => $showPasskeyPrompt],
                $forMybeddianLogin,
                $portalMybeddianFlags
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
        ?array $loginDataExtras = null,
        bool $forMybeddianApp = false,
        array $portalMybeddianFlags = []
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

        $stmt = $this->db->prepare('SELECT id, nama, nis FROM santri WHERE id_user = ? ORDER BY id ASC');
        $stmt->execute([$usersId]);
        $santriRows = $stmt->fetchAll(\PDO::FETCH_ASSOC);
        $santri = null;
        $santriId = null;
        $excludedBoyongCount = 0;

        $portalSantriAllowed = (int) ($portalMybeddianFlags['access_mybeddian_santri'] ?? 1) === 1;
        if ($forMybeddianApp && !$portalSantriAllowed) {
            $santriRows = [];
        }

        // myBeddien: santri berstatus Boyong tidak boleh dipakai sebagai akses portal santri
        if ($forMybeddianApp && !empty($santriRows)) {
            $kept = [];
            foreach ($santriRows as $r) {
                $sid = (int) ($r['id'] ?? 0);
                if ($sid > 0 && SantriStatusHelper::isBoyong($this->db, $sid)) {
                    $excludedBoyongCount++;
                    continue;
                }
                $kept[] = $r;
            }
            $santriRows = $kept;
        }

        if (!empty($santriRows)) {
            if ($forMybeddianApp && count($santriRows) > 1) {
                $chosen = isset($data['santri_id']) ? (int) $data['santri_id'] : 0;
                $ids = [];
                foreach ($santriRows as $r) {
                    $ids[] = (int) $r['id'];
                }
                if ($chosen > 0 && !in_array($chosen, $ids, true) && SantriStatusHelper::isBoyong($this->db, $chosen)) {
                    return $this->json($response, [
                        'success' => false,
                        'message' => 'Akses santri ditolak karena status Boyong. Hubungi pengurus pondok.',
                        'code' => 'SANTRI_STATUS_BOYONG',
                    ], 403);
                }
                if ($chosen <= 0 || !in_array($chosen, $ids, true)) {
                    $options = [];
                    foreach ($santriRows as $r) {
                        $options[] = [
                            'id' => (int) $r['id'],
                            'nama' => (string) ($r['nama'] ?? ''),
                            'nis' => $r['nis'] ?? null,
                        ];
                    }
                    return $this->json($response, [
                        'success' => false,
                        'message' => 'Akun ini terhubung ke lebih dari satu data santri. Pilih santri yang akan dipakai di Mybeddian.',
                        'code' => 'SANTRI_CHOICE_REQUIRED',
                        'data' => ['santri_options' => $options],
                    ], 200);
                }
                foreach ($santriRows as $r) {
                    if ((int) $r['id'] === $chosen) {
                        $santri = $r;
                        $santriId = $chosen;
                        break;
                    }
                }
            } else {
                $forced = isset($data['santri_id']) ? (int) $data['santri_id'] : 0;
                $pick = null;
                if ($forced > 0) {
                    foreach ($santriRows as $r) {
                        if ((int) $r['id'] === $forced) {
                            $pick = $r;
                            break;
                        }
                    }
                    if ($pick === null && SantriStatusHelper::isBoyong($this->db, $forced)) {
                        return $this->json($response, [
                            'success' => false,
                            'message' => 'Akses santri ditolak karena status Boyong. Hubungi pengurus pondok.',
                            'code' => 'SANTRI_STATUS_BOYONG',
                        ], 403);
                    }
                }
                if ($pick === null && !empty($santriRows)) {
                    $pick = $santriRows[0];
                }
                if ($pick !== null) {
                    $santri = $pick;
                    $santriId = (int) $pick['id'];
                }
            }
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

        $madrasahId = null;
        $madrasahRow = null;
        try {
            $stmtMu = $this->db->prepare('SELECT id_madrasah FROM users WHERE id = ? LIMIT 1');
            $stmtMu->execute([$usersId]);
            $userMadrasahCol = $stmtMu->fetch(\PDO::FETCH_ASSOC);
            if ($userMadrasahCol && !empty($userMadrasahCol['id_madrasah'])) {
                $madrasahId = (int) $userMadrasahCol['id_madrasah'];
            }
        } catch (\Throwable $e) {
        }
        if ($madrasahId !== null) {
            $stmtM = $this->db->prepare('SELECT id, nama FROM madrasah WHERE id = ? LIMIT 1');
            $stmtM->execute([$madrasahId]);
            $madrasahRow = $stmtM->fetch(\PDO::FETCH_ASSOC);
            if (!$madrasahRow) {
                $madrasahId = null;
            }
        }
        if ($madrasahId === null || !$madrasahRow) {
            $stmtMp = $this->db->prepare('SELECT id, nama FROM madrasah WHERE id_pjgt = ? LIMIT 1');
            $stmtMp->execute([$usersId]);
            $madrasahRow = $stmtMp->fetch(\PDO::FETCH_ASSOC);
            if ($madrasahRow) {
                $madrasahId = (int) $madrasahRow['id'];
                try {
                    $this->db->prepare('UPDATE users SET id_madrasah = ? WHERE id = ?')->execute([$madrasahId, $usersId]);
                } catch (\Throwable $e) {
                }
            }
        }

        if ($forMybeddianApp) {
            if ($santriId !== null && (int)($portalMybeddianFlags['access_mybeddian_santri'] ?? 1) !== 1) {
                $santriId = null;
                $santri = null;
            }
            if ($tokoId !== null && (int)($portalMybeddianFlags['access_mybeddian_toko'] ?? 1) !== 1) {
                $tokoId = null;
                $toko = null;
                $tokoNama = null;
            }
            if ($madrasahId !== null && (int)($portalMybeddianFlags['access_mybeddian_pjgt'] ?? 1) !== 1) {
                $madrasahId = null;
                $madrasahRow = null;
            }
        }

        if ($forMybeddianApp && $santriId !== null && SantriStatusHelper::isBoyong($this->db, $santriId)) {
            return $this->json($response, [
                'success' => false,
                'message' => 'Akses santri ditolak karena status Boyong. Hubungi pengurus pondok.',
                'code' => 'SANTRI_STATUS_BOYONG',
            ], 403);
        }

        // myBeddien: butuh santri (non-Boyong) / toko / PJGT. Identitas pengurus eBeddien saja tidak cukup
        // (mencegah akun pengurus+santri Boyong tetap lolos login portal).
        if ($forMybeddianApp) {
            $hasMybeddianPortal = $santriId !== null
                || $tokoId !== null
                || ($madrasahId !== null && $madrasahRow);
            if (!$hasMybeddianPortal) {
                if ($excludedBoyongCount > 0) {
                    return $this->json($response, [
                        'success' => false,
                        'message' => 'Akses ditolak: status santri Boyong. Login myBeddien untuk santri tidak tersedia.',
                        'code' => 'SANTRI_STATUS_BOYONG',
                    ], 403);
                }
                return $this->json($response, [
                    'success' => false,
                    'message' => 'Akun tidak memiliki akses portal myBeddien (santri, toko, atau PJGT).',
                ], 403);
            }
        } elseif ($pengurusId === null && $santriId === null && $tokoId === null && ($madrasahId === null || !$madrasahRow)) {
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

        if ($madrasahId !== null && $madrasahRow) {
            if (!in_array('pjgt', $allRoleKeys, true)) {
                $allRoleKeys[] = 'pjgt';
            }
            if (!in_array('mybeddian', $allowedApps, true)) {
                $allowedApps[] = 'mybeddian';
            }
            if ($pengurusId === null && $santriId === null && $tokoId === null) {
                $primaryRoleKey = 'pjgt';
                $primaryRoleLabel = 'PJGT';
            }
        }

        $allRoleKeys = array_values(array_unique($allRoleKeys));
        sort($allRoleKeys);

        $allowedApps = array_values(array_unique($allowedApps));
        $permissions = array_values(array_unique($permissions));

        $madrasahNama = null;
        if (is_array($madrasahRow) && isset($madrasahRow['nama']) && trim((string) $madrasahRow['nama']) !== '') {
            $madrasahNama = (string) $madrasahRow['nama'];
        }
        $nama = $pengurus['nama'] ?? $santri['nama'] ?? $madrasahNama ?? $username;
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
        if ($madrasahId !== null) {
            $tokenPayload['madrasah_id'] = $madrasahId;
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
        $loginPrimaryId = $pengurusId ?? $santriId ?? $usersId;
        if ($madrasahId !== null && $pengurusId === null && $santriId === null && $tokoId === null) {
            $loginPrimaryId = $madrasahId;
        }

        $loginEmail = '';
        $loginEmailVerifiedAt = null;
        $loginEmailReminderSnoozedUntil = null;
        if (!$forMybeddianApp && $pengurusId !== null) {
            try {
                $stMail = $this->db->prepare(
                    'SELECT email, email_verified_at, email_reminder_snoozed_until FROM users WHERE id = ? LIMIT 1'
                );
                $stMail->execute([$usersId]);
                $mailRow = $stMail->fetch(\PDO::FETCH_ASSOC);
                if ($mailRow) {
                    $loginEmail = trim((string) ($mailRow['email'] ?? ''));
                    $loginEmailVerifiedAt = $mailRow['email_verified_at'] ?? null;
                    $loginEmailReminderSnoozedUntil = $mailRow['email_reminder_snoozed_until'] ?? null;
                }
            } catch (\Throwable $e) {
                error_log('AuthControllerV2::completeLoginSession email fields: ' . $e->getMessage());
            }
        }

        $loginUser = [
            'id' => $loginPrimaryId,
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
        if (!$forMybeddianApp && $pengurusId !== null) {
            $loginUser['email'] = $loginEmail;
            $loginUser['email_verified_at'] = $loginEmailVerifiedAt;
            $loginUser['email_reminder_snoozed_until'] = $loginEmailReminderSnoozedUntil;
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
        if ($madrasahId !== null) {
            $loginUser['madrasah_id'] = $madrasahId;
        }
        if ($forMybeddianApp) {
            $santriOptionsOut = [];
            foreach ($santriRows as $r) {
                $santriOptionsOut[] = [
                    'id' => (int) $r['id'],
                    'nama' => (string) ($r['nama'] ?? ''),
                    'nis' => $r['nis'] ?? null,
                ];
            }
            $loginUser['santri_options'] = $santriOptionsOut;
            if ($madrasahId !== null && $madrasahRow) {
                $loginUser['madrasah_nama'] = (string) ($madrasahRow['nama'] ?? '');
            }
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
     * @param array<string, int> $portalMybeddianFlags kosong = ambil dari DB bila $forMybeddianApp true
     */
    public function finalizeLoginForUserId(
        Request $request,
        Response $response,
        int $usersId,
        ?array $overrideBody = null,
        ?array $loginDataExtras = null,
        bool $forMybeddianApp = false,
        array $portalMybeddianFlags = []
    ): Response {
        $data = $overrideBody ?? $request->getParsedBody();
        $data = is_array($data)
            ? TextSanitizer::sanitizeMybeddianAuthBody($data)
            : [];
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

        if ($forMybeddianApp && $portalMybeddianFlags === []) {
            $portalMybeddianFlags = $this->portalMybeddianFlagsForUsersId($usersId);
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
            $loginDataExtras,
            $forMybeddianApp,
            $portalMybeddianFlags
        );
    }

    /**
     * Deteksi request auth dari aplikasi myBeddien (path route atau header klien).
     */
    private function isMybeddianAuthRequest(Request $request, ?string $loginPath = null): bool
    {
        $path = $loginPath ?? $request->getUri()->getPath();
        if (stripos($path, 'mybeddian') !== false) {
            return true;
        }
        $client = strtolower(trim($request->getHeaderLine('X-Client-App')));
        if ($client === 'mybeddien' || $client === 'mybeddian') {
            return true;
        }

        return false;
    }

    /**
     * @param array<string, mixed> $user Baris users dari query login (berisi kolom access_mybeddian_*).
     *
     * @return array{access_mybeddian_santri: int, access_mybeddian_toko: int, access_mybeddian_pjgt: int}
     */
    private function portalMybeddianFlagsFromUserRow(array $user): array
    {
        return [
            'access_mybeddian_santri' => (int)($user['access_mybeddian_santri'] ?? 1),
            'access_mybeddian_toko' => (int)($user['access_mybeddian_toko'] ?? 1),
            'access_mybeddian_pjgt' => (int)($user['access_mybeddian_pjgt'] ?? 1),
        ];
    }

    /**
     * @return array{access_mybeddian_santri: int, access_mybeddian_toko: int, access_mybeddian_pjgt: int}
     */
    private function portalMybeddianFlagsForUsersId(int $usersId): array
    {
        try {
            $stmt = $this->db->prepare(
                'SELECT COALESCE(access_mybeddian_santri, 1) AS access_mybeddian_santri, '
                . 'COALESCE(access_mybeddian_toko, 1) AS access_mybeddian_toko, '
                . 'COALESCE(access_mybeddian_pjgt, 1) AS access_mybeddian_pjgt '
                . 'FROM users WHERE id = ? LIMIT 1'
            );
            $stmt->execute([$usersId]);
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$row) {
                return ['access_mybeddian_santri' => 1, 'access_mybeddian_toko' => 1, 'access_mybeddian_pjgt' => 1];
            }

            return [
                'access_mybeddian_santri' => (int)($row['access_mybeddian_santri'] ?? 1),
                'access_mybeddian_toko' => (int)($row['access_mybeddian_toko'] ?? 1),
                'access_mybeddian_pjgt' => (int)($row['access_mybeddian_pjgt'] ?? 1),
            ];
        } catch (\Throwable $e) {
            return ['access_mybeddian_santri' => 1, 'access_mybeddian_toko' => 1, 'access_mybeddian_pjgt' => 1];
        }
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
     * POST send-otp-ganti-wa: kirim OTP ke nomor WA baru (via WhatsApp) untuk verifikasi ganti nomor (Edit Profil).
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
            $data = is_array($data) ? TextSanitizer::sanitizeMybeddianAuthBody($data) : [];
            $noWaBaru = trim($data['no_wa_baru'] ?? '');
            $noWaBaruNorm = $this->normalizeNoWaTo62($noWaBaru);
            if ($noWaBaruNorm === null) {
                return $this->json($response, ['success' => false, 'message' => 'Nomor WA baru tidak valid'], 400);
            }
            if ($this->isNoWaUsedByOtherUser($noWaBaruNorm, $usersId)) {
                return $this->json($response, ['success' => false, 'message' => 'Nomor WA sudah dipakai'], 400);
            }

            // Max 3 percobaan kirim OTP / 10 menit per akun (sukses maupun gagal gateway).
            try {
                $rl = $this->db->prepare(
                    "SELECT COUNT(*) FROM user___audit_logs
                     WHERE user_id = ?
                       AND action IN ('send_otp_ganti_wa', 'send_otp_ganti_wa_attempt')
                       AND created_at >= DATE_SUB(NOW(), INTERVAL 10 MINUTE)"
                );
                $rl->execute([(string) $usersId]);
                if ((int) $rl->fetchColumn() >= 3) {
                    return $this->json($response, [
                        'success' => false,
                        'message' => 'Terlalu banyak permintaan OTP. Coba lagi dalam 10 menit.',
                    ], 429);
                }
            } catch (\Throwable $e) {
                error_log('AuthControllerV2::sendOtpGantiWa rate check: ' . $e->getMessage());
            }

            AuditLogger::log((string) $usersId, 'send_otp_ganti_wa_attempt', ['no_wa_baru' => $noWaBaruNorm], $this->getClientIp($request), true);

            $otp = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);
            $otpHash = hash('sha256', $otp);
            $expiresAt = date('Y-m-d H:i:s', time() + 600); // 10 menit
            $ins = $this->db->prepare("INSERT INTO user___wa_change_otp (user_id, no_wa_baru, otp_hash, expires_at) VALUES (?, ?, ?, ?)");
            $ins->execute([$usersId, $noWaBaruNorm, $otpHash, $expiresAt]);
            $stmt = $this->db->prepare("SELECT id FROM pengurus WHERE id_user = ?");
            $stmt->execute([$usersId]);
            $rowP = $stmt->fetch(\PDO::FETCH_ASSOC);
            $idPengurus = $rowP ? (int) $rowP['id'] : null;

            $logContext = [
                'id_santri' => null,
                'id_pengurus' => $idPengurus,
                'tujuan' => 'pengurus',
                'id_pengurus_pengirim' => null,
                'kategori' => 'wa_change_otp',
                'sumber' => 'auth',
            ];
            $message = "Kode verifikasi ganti nomor WA: " . $otp . "\n\nBerlaku 10 menit. Jangan bagikan kode ini.";
            $sendResult = WhatsAppService::sendMessage($noWaBaruNorm, $message, null, $logContext);
            if (!$sendResult['success']) {
                $this->db->prepare("DELETE FROM user___wa_change_otp WHERE user_id = ? AND no_wa_baru = ?")->execute([$usersId, $noWaBaruNorm]);
                error_log('AuthControllerV2::sendOtpGantiWa WA fail: ' . ($sendResult['message'] ?? ''));
                return $this->json($response, [
                    'success' => false,
                    'message' => 'Gagal mengirim OTP. Coba lagi beberapa saat.',
                ], 502);
            }
            AuditLogger::log((string)$usersId, 'send_otp_ganti_wa', ['no_wa_baru' => $noWaBaruNorm], $this->getClientIp($request), true);
            return $this->json($response, ['success' => true, 'message' => 'Kode OTP telah dikirim ke nomor baru.'], 200);
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
            $data = is_array($data) ? TextSanitizer::sanitizeMybeddianAuthBody($data) : [];
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
            $data = is_array($data) ? TextSanitizer::sanitizeMybeddianAuthBody($data) : [];
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
            $ins = $this->db->prepare("INSERT INTO user___password_reset_tokens (user_id, token_hash, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 10 MINUTE))");
            $ins->execute([$userId, $tokenHash]);
            $tokenId = (int) $this->db->lastInsertId();
            $config = require __DIR__ . '/../../config.php';
            $baseUrl = $this->getFrontendBaseUrl($request, $config);
            $link = $baseUrl . '/ubah-password?token=' . urlencode($plainToken);
            $message = "Link ubah password (aktif 10 menit):\n" . $link;
            $tujuan = RoleHelper::tokenIsSantriDaftarContext($pArr) ? 'santri' : 'pengurus';
            $logContext = ['id_santri' => $idSantriRecipient, 'id_pengurus' => $idPengurusRecipient, 'tujuan' => $tujuan, 'id_pengurus_pengirim' => null, 'kategori' => 'password_reset', 'sumber' => 'auth'];
            $tokenIdWa = $tokenId;
            $noWaD = $noWaDisplay;
            $msgWa = $message;
            $logCtxWa = $logContext;
            DeferredHttpTask::runAfterResponse(static function () use ($tokenIdWa, $noWaD, $msgWa, $logCtxWa): void {
                try {
                    $sendResult = WhatsAppService::sendMessage($noWaD, $msgWa, null, $logCtxWa);
                    if ($tokenIdWa > 0 && !empty($sendResult['messageId'])) {
                        $db = Database::getInstance()->getConnection();
                        $nomor62 = WhatsAppService::formatPhoneNumber($noWaD);
                        $db->prepare('UPDATE user___password_reset_tokens SET wa_message_id = ?, nomor_tujuan = ? WHERE id = ?')->execute([trim((string) $sendResult['messageId']), $nomor62, $tokenIdWa]);
                    }
                } catch (\Throwable $e) {
                    error_log('AuthControllerV2::requestUbahPassword deferred WA: ' . $e->getMessage());
                }
            });
            AuditLogger::log((string)$userId, 'request_ubah_password', [], $this->getClientIp($request), true);
            return $this->json($response, ['success' => true, 'message' => 'Link ubah password sedang dikirim ke WhatsApp Anda.', 'notifications' => ['wa' => 'queued']], 200);
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
            $data = is_array($data) ? TextSanitizer::sanitizeMybeddianAuthBody($data) : [];
            $token = $this->normalizeSecurityToken((string) ($data['token'] ?? ''));
            $passwordBaru = $data['password_baru'] ?? '';
            if ($token === '') {
                return $this->json($response, ['success' => false, 'message' => 'Token tidak valid'], 400);
            }
            $pwdErr = $this->validatePasswordLength($passwordBaru);
            if ($pwdErr !== null) {
                return $this->json($response, ['success' => false, 'message' => $pwdErr], 400);
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
            $data = is_array($data) ? TextSanitizer::sanitizeMybeddianAuthBody($data) : [];
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
            $data = is_array($data) ? TextSanitizer::sanitizeMybeddianAuthBody($data) : [];
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
            $noWaD = $noWaDisplay;
            $msgWa = $message;
            $logCtxWa = $logContext;
            DeferredHttpTask::runAfterResponse(static function () use ($noWaD, $msgWa, $logCtxWa): void {
                try {
                    WhatsAppService::sendMessage($noWaD, $msgWa, null, $logCtxWa);
                } catch (\Throwable $e) {
                    error_log('AuthControllerV2::requestUbahUsername deferred WA: ' . $e->getMessage());
                }
            });
            AuditLogger::log((string)$usersId, 'request_ubah_username', ['username_baru' => $usernameBaru], $this->getClientIp($request), true);
            return $this->json($response, ['success' => true, 'message' => 'Link ubah username sedang dikirim ke WhatsApp Anda.', 'notifications' => ['wa' => 'queued']], 200);
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
            $data = is_array($data) ? TextSanitizer::sanitizeMybeddianAuthBody($data) : [];
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
     * Edit pesan WA: ganti URL link jadi label (token kadaluarsa/dipakai); teks lain tetap.
     *
     * @param string $reason 'kadaluarsa' atau 'dipakai'
     */
    private function editWaMessageTokenInvalidated(string $nomorTujuan, string $waMessageId, string $reason, string $judul = ''): void
    {
        \App\Helpers\WaSecurityLinkHelper::editMessageInvalidated($nomorTujuan, $waMessageId, $reason, $judul);
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
        return rtrim($config['app']['mybeddian_url'] ?? 'http://localhost:5174', '/');
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
            $madrasahId = isset($payload['madrasah_id']) ? (int)$payload['madrasah_id'] : null;
            if ($santriId !== null && $santriId > 0 && SantriStatusHelper::isBoyong($this->db, $santriId)) {
                // Token lama masih memuat santri Boyong — paksa login ulang
                if ($tokoId === null && ($madrasahId === null || $madrasahId <= 0)) {
                    return $this->json($response, [
                        'success' => false,
                        'message' => 'Akses santri ditolak karena status Boyong. Hubungi pengurus pondok.',
                        'code' => 'SANTRI_STATUS_BOYONG',
                    ], 403);
                }
                $santriId = null;
            }
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
                } elseif ($madrasahId !== null && $madrasahId > 0) {
                    $stmt = $this->db->prepare("SELECT nama FROM madrasah WHERE id = ? LIMIT 1");
                    $stmt->execute([$madrasahId]);
                    $row = $stmt->fetch(\PDO::FETCH_ASSOC);
                    $nama = $row['nama'] ?? $username;
                } else {
                    $stmt = $this->db->prepare("SELECT nama FROM users WHERE id = ? LIMIT 1");
                    $stmt->execute([$usersId]);
                    $row = $stmt->fetch(\PDO::FETCH_ASSOC);
                    $nama = ($row['nama'] ?? '') !== '' ? (string) $row['nama'] : $username;
                }
            }
            $roleKey = $payload['role_key'] ?? $payload['user_role'] ?? 'user';
            $roleLabel = $payload['role_label'] ?? ucfirst($roleKey);
            $verifyPrimaryId = $santriId !== null ? $santriId : ($tokoId !== null ? $tokoId : $userId);
            if ($madrasahId !== null && $madrasahId > 0 && $santriId === null && $tokoId === null) {
                $verifyPrimaryId = $madrasahId;
            }
            $data = [
                'id' => $verifyPrimaryId,
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
            if ($madrasahId !== null && $madrasahId > 0) {
                $data['madrasah_id'] = $madrasahId;
            }
            $santriOptions = [];
            try {
                $stmtSo = $this->db->prepare('SELECT id, nama, nis FROM santri WHERE id_user = ? ORDER BY id ASC');
                $stmtSo->execute([$usersId]);
                while ($row = $stmtSo->fetch(\PDO::FETCH_ASSOC)) {
                    $sidOpt = (int) ($row['id'] ?? 0);
                    if ($sidOpt > 0 && SantriStatusHelper::isBoyong($this->db, $sidOpt)) {
                        continue;
                    }
                    $santriOptions[] = [
                        'id' => $sidOpt,
                        'nama' => (string) ($row['nama'] ?? ''),
                        'nis' => $row['nis'] ?? null,
                    ];
                }
            } catch (\Throwable $e) {
            }
            $data['santri_options'] = $santriOptions;

            $madrasahNamaOut = '';
            if ($madrasahId !== null && $madrasahId > 0) {
                $stmtMn = $this->db->prepare('SELECT nama FROM madrasah WHERE id = ? LIMIT 1');
                $stmtMn->execute([$madrasahId]);
                $mr = $stmtMn->fetch(\PDO::FETCH_ASSOC);
                if ($mr) {
                    $madrasahNamaOut = (string) ($mr['nama'] ?? '');
                }
            }
            $data['madrasah_nama'] = $madrasahNamaOut;

            if ($tokoId !== null && $tokoId > 0) {
                try {
                    $stmtTn = $this->db->prepare('SELECT nama_toko FROM cashless___pedagang WHERE id = ? LIMIT 1');
                    $stmtTn->execute([$tokoId]);
                    $tr = $stmtTn->fetch(\PDO::FETCH_ASSOC);
                    if ($tr && isset($tr['nama_toko'])) {
                        $data['toko_nama'] = (string) $tr['nama_toko'];
                    }
                } catch (\Throwable $e) {
                }
            }
            $pArr = is_array($payload) ? $payload : [];
            $pArr['users_id'] = $usersId;
            $data['foto_profil'] = MybeddianProfilFotoHelper::resolveDisplayPathIfFileExists($this->db, $pArr);
            return $this->json($response, ['success' => true, 'data' => $data], 200);
        } catch (\Throwable $e) {
            error_log('AuthControllerV2::verifyMybeddian ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Terjadi kesalahan'], 500);
        }
    }

    /**
     * POST /api/mybeddian/v2/auth/switch-santri — ganti identitas santri aktif di JWT (akun dengan beberapa santri).
     * Body JSON: { "santri_id": number }
     */
    public function switchMybeddianSantri(Request $request, Response $response): Response
    {
        try {
            $payload = $request->getAttribute('user');
            if (!is_array($payload)) {
                return $this->json($response, ['success' => false, 'message' => 'Unauthorized'], 401);
            }
            $usersId = (int) ($payload['users_id'] ?? 0);
            if ($usersId <= 0) {
                return $this->json($response, ['success' => false, 'message' => 'Token tidak valid'], 401);
            }
            $body = $request->getParsedBody();
            $body = is_array($body) ? $body : [];
            $chosen = isset($body['santri_id']) ? (int) $body['santri_id'] : 0;
            if ($chosen <= 0) {
                return $this->json($response, ['success' => false, 'message' => 'santri_id wajib diisi'], 400);
            }
            $stmt = $this->db->prepare('SELECT id FROM santri WHERE id = ? AND id_user = ? LIMIT 1');
            $stmt->execute([$chosen, $usersId]);
            if (!$stmt->fetchColumn()) {
                return $this->json($response, ['success' => false, 'message' => 'Data santri tidak valid untuk akun ini'], 403);
            }
            if (SantriStatusHelper::isBoyong($this->db, $chosen)) {
                return $this->json($response, [
                    'success' => false,
                    'message' => 'Akses santri ditolak karena status Boyong. Hubungi pengurus pondok.',
                    'code' => 'SANTRI_STATUS_BOYONG',
                ], 403);
            }
            $stmtU = $this->db->prepare('SELECT username FROM users WHERE id = ? LIMIT 1');
            $stmtU->execute([$usersId]);
            $urow = $stmtU->fetch(\PDO::FETCH_ASSOC);
            if (!$urow) {
                return $this->json($response, ['success' => false, 'message' => 'User tidak ditemukan'], 404);
            }
            $username = (string) ($urow['username'] ?? '');
            $ip = $this->getClientIp($request);
            $userAgent = $request->getHeaderLine('User-Agent');
            $uaShort = $userAgent !== null && $userAgent !== '' ? substr($userAgent, 0, 500) : null;

            return $this->completeLoginSession(
                $response,
                $usersId,
                $username,
                $request,
                ['santri_id' => $chosen],
                $ip,
                $userAgent,
                $uaShort,
                null,
                true,
                []
            );
        } catch (\Throwable $e) {
            error_log('AuthControllerV2::switchMybeddianSantri ' . $e->getMessage());

            return $this->json($response, ['success' => false, 'message' => 'Terjadi kesalahan'], 500);
        }
    }

    /**
     * POST /api/v2/auth/send-verify-email — JWT; kirim link verifikasi ke alamat email di profil.
     */
    public function postSendVerifyEmail(Request $request, Response $response): Response
    {
        try {
            $payload = $request->getAttribute('user');
            $pArr = is_array($payload) ? $payload : [];
            $usersId = $this->getUsersIdFromPayload($pArr);
            if ($usersId === null || $usersId <= 0) {
                return $this->json($response, ['success' => false, 'message' => 'User tidak valid'], 403);
            }

            $stmt = $this->db->prepare(
                'SELECT u.id, u.email, u.email_verified_at,'
                . ' (SELECT p.nama FROM pengurus p WHERE p.id_user = u.id ORDER BY p.id ASC LIMIT 1) AS nama_pengurus'
                . ' FROM users u WHERE u.id = ? LIMIT 1'
            );
            $stmt->execute([$usersId]);
            $urow = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$urow) {
                return $this->json($response, ['success' => false, 'message' => 'Akun tidak ditemukan'], 404);
            }
            $email = trim((string) ($urow['email'] ?? ''));
            if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
                return $this->json($response, ['success' => false, 'message' => 'Isi alamat email yang valid di profil terlebih dulu, lalu simpan.'], 400);
            }
            if (!empty($urow['email_verified_at'])) {
                return $this->json($response, ['success' => false, 'message' => 'Email Anda sudah terverifikasi.'], 400);
            }

            try {
                $stmtRecent = $this->db->prepare(
                    'SELECT id FROM user___email_verify_tokens WHERE user_id = ? AND created_at > DATE_SUB(NOW(), INTERVAL 90 SECOND) LIMIT 1'
                );
                $stmtRecent->execute([$usersId]);
                if ($stmtRecent->fetch(\PDO::FETCH_ASSOC)) {
                    return $this->json($response, ['success' => false, 'message' => 'Tunggu sekitar 90 detik sebelum meminta link baru.'], 429);
                }
            } catch (\Throwable $e) {
                error_log('AuthControllerV2::postSendVerifyEmail cek rate: ' . $e->getMessage());

                return $this->json($response, ['success' => false, 'message' => 'Fitur verifikasi email belum siap (migrasi basis data). Hubungi admin.'], 503);
            }

            $plainToken = bin2hex(random_bytes(32));
            $tokenHash = hash('sha256', $plainToken);
            $emailSnap = strtolower($email);
            $ttlHours = 48;

            $this->db->prepare('DELETE FROM user___email_verify_tokens WHERE user_id = ?')->execute([$usersId]);
            $ins = $this->db->prepare(
                'INSERT INTO user___email_verify_tokens (user_id, token_hash, email, expires_at) VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL ? HOUR))'
            );
            $ins->execute([$usersId, $tokenHash, $emailSnap, $ttlHours]);

            $config = require __DIR__ . '/../../config.php';
            $base = $this->getFrontendBaseUrl($request, $config);
            $verifyUrl = $base . '/verifikasi-email?token=' . rawurlencode($plainToken);
            $nama = trim((string) ($urow['nama_pengurus'] ?? ''));
            $greeting = $nama !== '' ? htmlspecialchars($nama, ENT_QUOTES, 'UTF-8') : 'Bapak/Ibu';

            $subject = 'Verifikasi email eBeddien';
            $safeUrl = htmlspecialchars($verifyUrl, ENT_QUOTES, 'UTF-8');
            $html = '<div style="font-family:Arial,sans-serif;font-size:15px;color:#111827;line-height:1.5;">'
                . '<p>Halo ' . $greeting . ',</p>'
                . '<p>Untuk menandai alamat email di profil eBeddien Anda sebagai terverifikasi, klik tombol berikut (atau salin tautan ke browser). Tautan berlaku ' . (string) $ttlHours . ' jam.</p>'
                . '<p style="margin:24px 0;"><a href="' . $safeUrl . '" style="display:inline-block;padding:12px 20px;background:#0d9488;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;">Verifikasi email</a></p>'
                . '<p style="font-size:12px;color:#6b7280;">Jika tombol tidak berfungsi, tempel tautan ini:<br><span style="word-break:break-all;">' . $safeUrl . '</span></p>'
                . '<p style="font-size:12px;color:#6b7280;">Jika Anda tidak meminta email ini, abaikan saja.</p>'
                . '</div>';
            $plain = "Verifikasi email eBeddien\n\nBuka tautan (berlaku {$ttlHours} jam):\n{$verifyUrl}\n\nJika Anda tidak meminta ini, abaikan email ini.";

            $sendResult = EmailService::send($email, $subject, $html, $plain, false);
            if (empty($sendResult['success'])) {
                $msg = trim((string) ($sendResult['message'] ?? 'Gagal mengirim email'));
                $detail = trim((string) ($sendResult['error'] ?? ''));
                if ($detail !== '') {
                    $msg .= ': ' . $detail;
                }

                return $this->json($response, ['success' => false, 'message' => $msg], 502);
            }

            AuditLogger::log((string) $usersId, 'email_verify_link_sent', ['email' => $emailSnap], $this->getClientIp($request), true);

            return $this->json($response, [
                'success' => true,
                'message' => 'Link verifikasi telah dikirim ke ' . $email . '. Periksa kotak masuk (dan folder spam).',
            ], 200);
        } catch (\Throwable $e) {
            error_log('AuthControllerV2::postSendVerifyEmail ' . $e->getMessage());

            return $this->json($response, ['success' => false, 'message' => 'Terjadi kesalahan saat mengirim email'], 500);
        }
    }

    /**
     * POST /api/v2/auth/email-reminder-snooze — JWT; tunda pengingat email profil 1 tahun.
     */
    public function postEmailReminderSnooze(Request $request, Response $response): Response
    {
        try {
            $payload = $request->getAttribute('user');
            $pArr = is_array($payload) ? $payload : [];
            $usersId = $this->getUsersIdFromPayload($pArr);
            if ($usersId === null || $usersId <= 0) {
                return $this->json($response, ['success' => false, 'message' => 'User tidak valid'], 403);
            }

            try {
                $this->db->prepare(
                    'UPDATE users SET email_reminder_snoozed_until = DATE_ADD(NOW(), INTERVAL 1 YEAR) WHERE id = ?'
                )->execute([$usersId]);
            } catch (\Throwable $e) {
                error_log('AuthControllerV2::postEmailReminderSnooze ' . $e->getMessage());

                return $this->json($response, ['success' => false, 'message' => 'Kolom pengingat belum tersedia. Jalankan migrasi basis data.'], 503);
            }

            $stmt = $this->db->prepare('SELECT email_reminder_snoozed_until FROM users WHERE id = ? LIMIT 1');
            $stmt->execute([$usersId]);
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);
            $until = $row['email_reminder_snoozed_until'] ?? null;

            AuditLogger::log((string) $usersId, 'email_reminder_snoozed_1y', [], $this->getClientIp($request), true);

            return $this->json($response, [
                'success' => true,
                'message' => 'Pengingat email disembunyikan selama satu tahun.',
                'data' => ['email_reminder_snoozed_until' => $until],
            ], 200);
        } catch (\Throwable $e) {
            error_log('AuthControllerV2::postEmailReminderSnooze outer ' . $e->getMessage());

            return $this->json($response, ['success' => false, 'message' => 'Terjadi kesalahan'], 500);
        }
    }

    /**
     * GET /api/v2/auth/verify-email-token — cek token (belum memverifikasi).
     */
    public function getVerifyEmailToken(Request $request, Response $response): Response
    {
        try {
            $token = $this->normalizeSecurityToken((string) ($request->getQueryParams()['token'] ?? ''));
            if ($token === '') {
                return $this->jsonWithNoStoreCache($response, ['success' => true, 'valid' => false, 'reason' => 'missing'], 200);
            }
            $tokenHash = hash('sha256', $token);
            $stmt = $this->db->prepare(
                'SELECT t.user_id, t.email, t.expires_at, t.used_at, u.email AS current_email, u.email_verified_at'
                . ' FROM user___email_verify_tokens t'
                . ' INNER JOIN users u ON u.id = t.user_id'
                . ' WHERE t.token_hash = ? LIMIT 1'
            );
            $stmt->execute([$tokenHash]);
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$row) {
                return $this->jsonWithNoStoreCache($response, ['success' => true, 'valid' => false, 'reason' => 'not_found'], 200);
            }
            if (!empty($row['used_at'])) {
                return $this->jsonWithNoStoreCache($response, ['success' => true, 'valid' => false, 'reason' => 'used'], 200);
            }
            $exp = strtotime((string) $row['expires_at']);
            if ($exp !== false && $exp < time()) {
                return $this->jsonWithNoStoreCache($response, ['success' => true, 'valid' => false, 'reason' => 'expired'], 200);
            }
            $cur = strtolower(trim((string) ($row['current_email'] ?? '')));
            $snap = strtolower(trim((string) ($row['email'] ?? '')));
            if ($cur === '' || $cur !== $snap) {
                return $this->jsonWithNoStoreCache($response, ['success' => true, 'valid' => false, 'reason' => 'email_changed'], 200);
            }
            if (!empty($row['email_verified_at'])) {
                return $this->jsonWithNoStoreCache($response, ['success' => true, 'valid' => true, 'already_verified' => true], 200);
            }

            return $this->jsonWithNoStoreCache($response, ['success' => true, 'valid' => true, 'already_verified' => false], 200);
        } catch (\Throwable $e) {
            error_log('AuthControllerV2::getVerifyEmailToken ' . $e->getMessage());

            return $this->jsonWithNoStoreCache($response, ['success' => false, 'message' => 'Terjadi kesalahan'], 500);
        }
    }

    /**
     * POST /api/v2/auth/verify-email — selesaikan verifikasi (token dari email).
     */
    public function postVerifyEmail(Request $request, Response $response): Response
    {
        try {
            $data = $request->getParsedBody();
            $data = is_array($data) ? $data : [];
            $token = $this->normalizeSecurityToken((string) ($data['token'] ?? ''));
            if ($token === '') {
                return $this->json($response, ['success' => false, 'message' => 'Token tidak ada'], 400);
            }
            $tokenHash = hash('sha256', $token);
            $stmt = $this->db->prepare(
                'SELECT t.id, t.user_id, t.email, t.expires_at, t.used_at, u.email AS current_email, u.email_verified_at'
                . ' FROM user___email_verify_tokens t'
                . ' INNER JOIN users u ON u.id = t.user_id'
                . ' WHERE t.token_hash = ? LIMIT 1'
            );
            $stmt->execute([$tokenHash]);
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$row) {
                return $this->json($response, ['success' => false, 'message' => 'Link tidak valid atau sudah kadaluarsa.'], 400);
            }
            if (!empty($row['used_at'])) {
                return $this->json($response, ['success' => false, 'message' => 'Link ini sudah pernah dipakai.'], 400);
            }
            $exp = strtotime((string) $row['expires_at']);
            if ($exp !== false && $exp < time()) {
                $this->db->prepare('DELETE FROM user___email_verify_tokens WHERE id = ?')->execute([(int) $row['id']]);

                return $this->json($response, ['success' => false, 'message' => 'Link sudah kadaluarsa. Minta link baru dari menu Profil.'], 400);
            }
            $userId = (int) $row['user_id'];
            $cur = strtolower(trim((string) ($row['current_email'] ?? '')));
            $snap = strtolower(trim((string) ($row['email'] ?? '')));
            if ($cur === '' || $cur !== $snap) {
                return $this->json($response, ['success' => false, 'message' => 'Alamat email di akun sudah diubah. Minta link verifikasi baru dari Profil.'], 400);
            }

            if (!empty($row['email_verified_at'])) {
                $this->db->prepare('DELETE FROM user___email_verify_tokens WHERE id = ?')->execute([(int) $row['id']]);

                return $this->json($response, ['success' => true, 'message' => 'Email sudah terverifikasi sebelumnya.'], 200);
            }

            $this->db->prepare('UPDATE users SET email_verified_at = NOW() WHERE id = ?')->execute([$userId]);
            $this->db->prepare('DELETE FROM user___email_verify_tokens WHERE id = ?')->execute([(int) $row['id']]);
            AuditLogger::log((string) $userId, 'email_verified', ['email' => $snap], $this->getClientIp($request), true);

            return $this->json($response, ['success' => true, 'message' => 'Email berhasil diverifikasi.'], 200);
        } catch (\Throwable $e) {
            error_log('AuthControllerV2::postVerifyEmail ' . $e->getMessage());

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
