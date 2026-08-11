<?php

declare(strict_types=1);

namespace App\Services;

use App\Database;
use App\Helpers\MybeddianAuthWaHelper;
use App\Helpers\WaSecurityLinkHelper;

/**
 * User kirim template myBeddien (daftar / lupa password / lupa username) + token
 * → verifikasi sender_wa === no_wa → balas data + link setup/reset/login.
 */
final class MybeddianAuthWaFlow
{
    /** @var array{table: string, id: int}|null Token link yang baru dibuat — diikat ke wa_message_id setelah kirim. */
    private static ?array $pendingLinkBind = null;

    /**
     * Setelah kirim balasan otomatis: simpan messageId bagian yang berisi link.
     */
    public static function bindPendingLinkMessageId(?string $messageId): void
    {
        $pending = self::$pendingLinkBind;
        self::$pendingLinkBind = null;
        $messageId = $messageId !== null ? trim($messageId) : '';
        if ($pending === null || $messageId === '') {
            return;
        }
        $table = (string) ($pending['table'] ?? '');
        $id = (int) ($pending['id'] ?? 0);
        if ($id < 1 || !in_array($table, ['user___setup_tokens', 'user___password_reset_tokens'], true)) {
            return;
        }
        try {
            $db = Database::getInstance()->getConnection();
            if ($table === 'user___setup_tokens') {
                if ($db->query("SHOW COLUMNS FROM user___setup_tokens LIKE 'wa_message_id'")->rowCount() === 0) {
                    return;
                }
                $db->prepare('UPDATE user___setup_tokens SET wa_message_id = ? WHERE id = ?')->execute([$messageId, $id]);
                return;
            }
            if ($db->query("SHOW COLUMNS FROM user___password_reset_tokens LIKE 'wa_message_id'")->rowCount() === 0) {
                return;
            }
            $db->prepare('UPDATE user___password_reset_tokens SET wa_message_id = ? WHERE id = ?')->execute([$messageId, $id]);
        } catch (\Throwable $e) {
            error_log('MybeddianAuthWaFlow::bindPendingLinkMessageId ' . $e->getMessage());
        }
    }

    /**
     * @return string|null Teks balasan (boleh SPLIT_MARKER) atau null
     */
    public static function handle(string $nomor, string $message, ?string $fromJid = null): ?string
    {
        self::$pendingLinkBind = null;
        $fromJid = $fromJid !== null && $fromJid !== '' ? trim($fromJid) : null;
        $sender = self::normalizeIncomingNumber($nomor, $fromJid);
        if (strlen($sender) < 8) {
            return null;
        }

        $messageTrim = trim($message);
        $purpose = self::detectPurpose($messageTrim);
        if ($purpose === null) {
            return null;
        }

        if (!preg_match('/Nomor\s*WA\s*:\s*([0-9+\-\s]{8,20})/iu', $messageTrim, $wm)) {
            return 'Format tidak lengkap. Pastikan baris Nomor WA terisi seperti di aplikasi myBeddien.';
        }
        if (!preg_match('/Token\s*:\s*([a-fA-F0-9]{64})/u', $messageTrim, $tm)) {
            return 'Format tidak lengkap. Pastikan baris Token berisi kode 64 karakter persis seperti di aplikasi.';
        }
        if (!preg_match('/Mode\s*:\s*(santri|pjgt|toko)/iu', $messageTrim, $mm)) {
            return 'Format tidak lengkap. Pastikan baris Mode: santri / pjgt / toko ada di pesan.';
        }

        $claimedWa = WhatsAppService::formatPhoneNumber(preg_replace('/\D/', '', $wm[1]) ?? '');
        $plainToken = strtolower($tm[1]);
        $tokenHash = hash('sha256', $plainToken);
        $modeMsg = strtolower($mm[1]);

        try {
            $db = Database::getInstance()->getConnection();
            if (!MybeddianAuthWaHelper::tableExists($db)) {
                error_log('MybeddianAuthWaFlow: tabel mybeddian_auth_wa_tokens belum ada');
                return 'Sistem token belum siap. Silakan coba lagi nanti atau hubungi admin.';
            }

            $stmt = $db->prepare(
                'SELECT id, purpose, mode, no_wa, payload_json, used_at, expires_at, wa_verified_at
                 FROM mybeddian_auth_wa_tokens
                 WHERE token_hash = ?
                 LIMIT 1'
            );
            $stmt->execute([$tokenHash]);
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$row) {
                return 'Token tidak dikenali atau sudah tidak berlaku. Buka ulang aplikasi myBeddien dan buat tautan WhatsApp baru.';
            }
            if (!empty($row['used_at'])) {
                return 'Token ini sudah dipakai. Buat tautan WhatsApp baru dari aplikasi myBeddien.';
            }
            $expiresAt = strtotime((string) ($row['expires_at'] ?? ''));
            if ($expiresAt === false || $expiresAt < time()) {
                return 'Token sudah kedaluwarsa. Buka aplikasi myBeddien, isi formulir, lalu kirim ulang lewat WhatsApp.';
            }
            if ((string) ($row['purpose'] ?? '') !== $purpose) {
                return 'Jenis permintaan pada pesan tidak cocok dengan token. Salin teks lengkap dari aplikasi.';
            }
            if (strtolower((string) ($row['mode'] ?? '')) !== $modeMsg) {
                return 'Mode pada pesan tidak cocok dengan token. Salin teks lengkap dari aplikasi.';
            }

            $storedWa = WhatsAppService::formatPhoneNumber((string) ($row['no_wa'] ?? ''));
            if ($storedWa === '') {
                return 'Nomor WA token tidak valid. Buat tautan baru dari aplikasi myBeddien.';
            }
            if ($claimedWa === '' || $storedWa !== $claimedWa) {
                return 'Nomor WA pada pesan tidak cocok dengan yang Anda isi di aplikasi. Periksa kembali.';
            }

            $senderMsisdn = WhatsAppService::resolveInboundSenderToExpectedMsisdn($sender, $fromJid, $storedWa);
            if ($senderMsisdn === null) {
                return WhatsAppTemplates::pesanHarusDariNomorSama($storedWa, $sender);
            }

            $payload = json_decode((string) ($row['payload_json'] ?? ''), true);
            if (!is_array($payload)) {
                return 'Data token rusak. Buat tautan baru dari aplikasi myBeddien.';
            }

            $adminNotif = null;
            $db->beginTransaction();
            try {
                $upd = $db->prepare(
                    'UPDATE mybeddian_auth_wa_tokens
                     SET wa_verified_at = NOW(), sender_wa = ?, used_at = NOW()
                     WHERE id = ? AND used_at IS NULL'
                );
                $upd->execute([$senderMsisdn, (int) $row['id']]);
                if ($upd->rowCount() < 1) {
                    $db->rollBack();
                    return 'Token ini sudah dipakai. Buat tautan WhatsApp baru dari aplikasi myBeddien.';
                }

                $replyBody = self::buildVerifiedReply($db, $purpose, $modeMsg, $payload, $claimedWa, $senderMsisdn, $adminNotif);
                $db->commit();
            } catch (\Throwable $e) {
                if ($db->inTransaction()) {
                    $db->rollBack();
                }
                throw $e;
            }

            if (is_array($adminNotif)) {
                NisPengajuanWaHelper::sendAdminNotifFromVerify($adminNotif);
            }

            return WhatsAppTemplates::prependPermintaanSedangDiprosesAck($db, $senderMsisdn, $replyBody);
        } catch (\Throwable $e) {
            error_log('MybeddianAuthWaFlow::handle ' . $e->getMessage());
            return 'Terjadi gangguan saat memverifikasi. Silakan coba lagi sebentar.';
        }
    }

    /**
     * @param array<string, mixed> $payload
     * @param array<string, mixed>|null $adminNotif
     */
    private static function buildVerifiedReply(
        \PDO $db,
        string $purpose,
        string $mode,
        array $payload,
        string $claimedWa,
        string $senderNorm,
        ?array &$adminNotif = null
    ): string {
        $adminNotif = null;
        $config = require __DIR__ . '/../../config.php';
        $base = rtrim((string) ($config['app']['mybeddian_url'] ?? 'https://mybeddien.alutsmani.id'), '/');
        $linkTtl = WaSecurityLinkHelper::LINK_TTL_MINUTES;

        $header = "Nomor WA tercatat: {$claimedWa}\nNomor WA penirim: {$senderNorm}\n";

        if ($purpose === MybeddianAuthWaHelper::PURPOSE_PENGAJUAN_NIS) {
            $done = NisPengajuanWaHelper::finalizeAfterWaVerify($db, $payload);
            $adminNotif = is_array($done['admin_notif'] ?? null) ? $done['admin_notif'] : null;
            return $header . "\n" . (string) ($done['reply_body'] ?? '');
        }

        if ($purpose === MybeddianAuthWaHelper::PURPOSE_DAFTAR) {
            $entityType = (string) ($payload['entity_type'] ?? 'santri');
            $entityId = (int) ($payload['entity_id'] ?? 0);
            $noWa = (string) ($payload['no_wa'] ?? $claimedWa);
            if ($entityId < 1) {
                throw new \RuntimeException('payload daftar tanpa entity_id');
            }
            $plain = bin2hex(random_bytes(32));
            $hash = hash('sha256', $plain);
            $inserted = self::insertSetupToken($db, $hash, $entityType, $entityId, $noWa, $linkTtl);
            if ($inserted['id'] > 0 && $inserted['table'] === 'user___setup_tokens') {
                self::$pendingLinkBind = ['table' => 'user___setup_tokens', 'id' => $inserted['id']];
            }
            $portalQ = '';
            if ($entityType === 'madrasah' || $mode === 'pjgt') {
                $portalQ = 'portal=pjgt';
            } elseif ($entityType === 'toko' || $mode === 'toko') {
                $portalQ = 'portal=toko';
            }
            $link = $base . '/setup-akun' . ($portalQ !== '' ? '?' . $portalQ : '') . '#token=' . rawurlencode($plain);
            return $header . "\nBuka link berikut untuk membuat username & password (aktif {$linkTtl} menit, sekali pakai):\n" . $link;
        }

        if ($purpose === MybeddianAuthWaHelper::PURPOSE_TAMBAH_AKSES) {
            $userId = (int) ($payload['user_id'] ?? 0);
            $entityType = (string) ($payload['entity_type'] ?? 'santri');
            $entityId = (int) ($payload['entity_id'] ?? 0);
            $accessMode = (string) ($payload['access_mode'] ?? $mode);
            if ($userId < 1 || $entityId < 1) {
                throw new \RuntimeException('payload tambah_akses tidak lengkap');
            }
            if (!in_array($accessMode, ['santri', 'pjgt', 'toko'], true)) {
                $accessMode = $mode;
            }
            self::attachEntityToExistingUser($db, $userId, $entityType, $entityId);

            $plain = bin2hex(random_bytes(32));
            $hash = hash('sha256', $plain);
            $masukPayload = [
                'user_id' => $userId,
                'entity_type' => $entityType,
                'entity_id' => $entityId,
                'access_mode' => $accessMode,
                'no_wa' => $claimedWa,
            ];
            $payloadJson = json_encode($masukPayload, JSON_UNESCAPED_UNICODE);
            if ($payloadJson === false) {
                throw new \RuntimeException('Gagal encode payload masuk_akses');
            }
            $ins = $db->prepare(
                'INSERT INTO mybeddian_auth_wa_tokens
                 (token_hash, purpose, mode, no_wa, payload_json, expires_at, wa_verified_at, sender_wa)
                 VALUES (?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? MINUTE), NOW(), ?)'
            );
            $ins->execute([
                $hash,
                MybeddianAuthWaHelper::PURPOSE_MASUK_AKSES,
                $accessMode,
                $claimedWa,
                $payloadJson,
                $linkTtl,
                $senderNorm,
            ]);
            $link = $base . '/profil#tambah-akses=' . rawurlencode($plain);
            $modeLabel = $accessMode === 'pjgt' ? 'PJGT' : ($accessMode === 'toko' ? 'Toko' : 'Santri');
            return $header
                . "\nAkses *{$modeLabel}* berhasil ditambahkan ke akun Anda.\n"
                . "Buka link berikut untuk masuk ke mode tersebut di Profil (aktif {$linkTtl} menit, sekali pakai):\n"
                . $link;
        }

        if ($purpose === MybeddianAuthWaHelper::PURPOSE_LUPA_PASSWORD) {
            $userId = (int) ($payload['user_id'] ?? 0);
            if ($userId < 1) {
                throw new \RuntimeException('payload lupa_password tanpa user_id');
            }
            $plain = bin2hex(random_bytes(32));
            $hash = hash('sha256', $plain);
            $ins = $db->prepare(
                'INSERT INTO user___password_reset_tokens (user_id, token_hash, expires_at, nomor_tujuan)
                 VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? MINUTE), ?)'
            );
            $ins->execute([$userId, $hash, $linkTtl, $claimedWa]);
            $tokenId = (int) $db->lastInsertId();
            if ($tokenId > 0) {
                self::$pendingLinkBind = ['table' => 'user___password_reset_tokens', 'id' => $tokenId];
            }
            $link = $base . '/ubah-password#token=' . rawurlencode($plain);
            return $header . "\nBuka link berikut untuk membuat password baru (aktif {$linkTtl} menit):\n" . $link
                . "\n\nJangan bagikan link ini ke siapapun.";
        }

        // lupa_username
        $userId = (int) ($payload['user_id'] ?? 0);
        if ($userId < 1) {
            throw new \RuntimeException('payload lupa_username tanpa user_id');
        }
        $st = $db->prepare('SELECT username FROM users WHERE id = ? LIMIT 1');
        $st->execute([$userId]);
        $username = trim((string) ($st->fetchColumn() ?: ''));
        if ($username === '') {
            throw new \RuntimeException('username kosong');
        }
        $loginPath = $mode === 'pjgt' ? '/login-pjgt' : '/login';
        $loginLink = $base . $loginPath;
        return $header
            . "\nUsername myBeddien Anda:\n*" . $username . "*\n\n"
            . "Masuk dengan username di atas, lalu password Anda:\n" . $loginLink
            . "\n\nJika lupa password, gunakan menu Lupa password di aplikasi.\nJangan bagikan username + password ke siapapun.";
    }

    /**
     * @return array{table: string, id: int}
     */
    private static function insertSetupToken(
        \PDO $db,
        string $tokenHash,
        string $entityType,
        int $entityId,
        string $noWa,
        int $ttlMinutes
    ): array {
        $ttl = max(1, min(10080, $ttlMinutes));
        $hasEntity = false;
        try {
            $hasEntity = $db->query("SHOW COLUMNS FROM user___setup_tokens LIKE 'entity_type'")->rowCount() > 0;
        } catch (\Throwable $e) {
            $hasEntity = false;
        }
        if ($hasEntity) {
            $ins = $db->prepare(
                'INSERT INTO user___setup_tokens (token_hash, entity_type, entity_id, expires_at, no_wa)
                 VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL ? MINUTE), ?)'
            );
            $ins->execute([$tokenHash, $entityType, $entityId, $ttl, $noWa]);
            return ['table' => 'user___setup_tokens', 'id' => (int) $db->lastInsertId()];
        }
        if ($entityType === 'santri') {
            $legacy = false;
            try {
                $legacy = $db->query("SHOW TABLES LIKE 'user___setup_tokens_santri'")->rowCount() > 0;
            } catch (\Throwable $e) {
                $legacy = false;
            }
            if ($legacy) {
                $ins = $db->prepare(
                    'INSERT INTO user___setup_tokens_santri (token_hash, id_santri, expires_at, no_wa)
                     VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? MINUTE), ?)'
                );
                $ins->execute([$tokenHash, $entityId, $ttl, $noWa]);
                return ['table' => 'user___setup_tokens_santri', 'id' => (int) $db->lastInsertId()];
            }
        }
        throw new \RuntimeException('Skema user___setup_tokens tidak mendukung insert dari WA flow');
    }

    private static function detectPurpose(string $message): ?string
    {
        $lower = mb_strtolower($message);
        if (strpos($lower, 'mybeddien daftar') !== false) {
            return MybeddianAuthWaHelper::PURPOSE_DAFTAR;
        }
        if (strpos($lower, 'mybeddien tambah akses') !== false) {
            return MybeddianAuthWaHelper::PURPOSE_TAMBAH_AKSES;
        }
        if (strpos($lower, 'mybeddien lupa password') !== false) {
            return MybeddianAuthWaHelper::PURPOSE_LUPA_PASSWORD;
        }
        if (strpos($lower, 'mybeddien lupa username') !== false) {
            return MybeddianAuthWaHelper::PURPOSE_LUPA_USERNAME;
        }
        if (strpos($lower, 'mybeddien pengajuan nis') !== false) {
            return MybeddianAuthWaHelper::PURPOSE_PENGAJUAN_NIS;
        }
        return null;
    }

    /**
     * Hubungkan entity (santri/madrasah/toko) ke users.id yang sudah ada.
     */
    private static function attachEntityToExistingUser(\PDO $db, int $userId, string $entityType, int $entityId): void
    {
        if ($entityType === 'santri') {
            $chk = $db->prepare('SELECT id, id_user FROM santri WHERE id = ? LIMIT 1');
            $chk->execute([$entityId]);
            $row = $chk->fetch(\PDO::FETCH_ASSOC);
            if (!$row) {
                throw new \RuntimeException('Data santri tidak ditemukan');
            }
            $existing = isset($row['id_user']) && $row['id_user'] !== null && $row['id_user'] !== ''
                ? (int) $row['id_user']
                : 0;
            if ($existing > 0 && $existing !== $userId) {
                throw new \RuntimeException('Santri sudah terhubung ke akun lain');
            }
            if ($existing === $userId) {
                return;
            }
            $upd = $db->prepare('UPDATE santri SET id_user = ? WHERE id = ? AND id_user IS NULL');
            $upd->execute([$userId, $entityId]);
            if ($upd->rowCount() < 1) {
                throw new \RuntimeException('Gagal menghubungkan santri ke akun');
            }
            return;
        }

        if ($entityType === 'madrasah') {
            $chk = $db->prepare('SELECT id, id_pjgt FROM madrasah WHERE id = ? LIMIT 1');
            $chk->execute([$entityId]);
            $row = $chk->fetch(\PDO::FETCH_ASSOC);
            if (!$row) {
                throw new \RuntimeException('Data madrasah tidak ditemukan');
            }
            $existing = isset($row['id_pjgt']) && $row['id_pjgt'] !== null && $row['id_pjgt'] !== ''
                ? (int) $row['id_pjgt']
                : 0;
            if ($existing > 0 && $existing !== $userId) {
                throw new \RuntimeException('Madrasah sudah memiliki PJGT lain');
            }
            $stmtOm = $db->prepare('SELECT id FROM madrasah WHERE id_pjgt = ? AND id <> ? LIMIT 1');
            $stmtOm->execute([$userId, $entityId]);
            if ($stmtOm->fetch(\PDO::FETCH_ASSOC)) {
                throw new \RuntimeException('Akun sudah menjadi PJGT di madrasah lain');
            }
            $uidRow = $db->prepare('SELECT id_madrasah FROM users WHERE id = ? LIMIT 1');
            $uidRow->execute([$userId]);
            $u = $uidRow->fetch(\PDO::FETCH_ASSOC);
            $uidMadrasah = isset($u['id_madrasah']) && $u['id_madrasah'] !== null && $u['id_madrasah'] !== ''
                ? (int) $u['id_madrasah']
                : null;
            if ($uidMadrasah !== null && $uidMadrasah !== $entityId) {
                throw new \RuntimeException('Akun sudah terhubung ke madrasah lain');
            }
            if ($existing === $userId) {
                $db->prepare('UPDATE users SET id_madrasah = ? WHERE id = ?')->execute([$entityId, $userId]);
                return;
            }
            $upd = $db->prepare('UPDATE madrasah SET id_pjgt = ? WHERE id = ? AND id_pjgt IS NULL');
            $upd->execute([$userId, $entityId]);
            if ($upd->rowCount() < 1) {
                throw new \RuntimeException('Gagal menghubungkan PJGT ke akun');
            }
            $db->prepare('UPDATE users SET id_madrasah = ? WHERE id = ?')->execute([$entityId, $userId]);
            return;
        }

        if ($entityType === 'toko') {
            $chk = $db->prepare('SELECT id, id_users FROM cashless___pedagang WHERE id = ? LIMIT 1');
            $chk->execute([$entityId]);
            $row = $chk->fetch(\PDO::FETCH_ASSOC);
            if (!$row) {
                throw new \RuntimeException('Data toko tidak ditemukan');
            }
            $existing = isset($row['id_users']) && $row['id_users'] !== null && $row['id_users'] !== ''
                ? (int) $row['id_users']
                : 0;
            if ($existing > 0 && $existing !== $userId) {
                throw new \RuntimeException('Toko sudah terhubung ke akun lain');
            }
            $stmtOt = $db->prepare('SELECT id FROM cashless___pedagang WHERE id_users = ? AND id <> ? LIMIT 1');
            $stmtOt->execute([$userId, $entityId]);
            if ($stmtOt->fetch(\PDO::FETCH_ASSOC)) {
                throw new \RuntimeException('Akun sudah terhubung ke toko lain');
            }
            if ($existing === $userId) {
                return;
            }
            $upd = $db->prepare('UPDATE cashless___pedagang SET id_users = ? WHERE id = ? AND id_users IS NULL');
            $upd->execute([$userId, $entityId]);
            if ($upd->rowCount() < 1) {
                throw new \RuntimeException('Gagal menghubungkan toko ke akun');
            }
            return;
        }

        throw new \RuntimeException('entity_type tidak didukung');
    }

    private static function normalizeIncomingNumber(string $nomor, ?string $fromJid): string
    {
        $digits = preg_replace('/\D/', '', trim($nomor)) ?? '';
        $isLid = is_string($fromJid) && preg_match('/@lid$/i', trim($fromJid)) === 1;
        if ($isLid && $digits !== '') {
            return $digits;
        }
        // Heuristik LID mentah (bukan 62/0) — jangan paksa jadi 62…
        if ($digits !== '' && strpos($digits, '62') !== 0 && strpos($digits, '0') !== 0 && strlen($digits) >= 10) {
            return $digits;
        }
        return WhatsAppService::formatPhoneNumber($nomor);
    }
}
