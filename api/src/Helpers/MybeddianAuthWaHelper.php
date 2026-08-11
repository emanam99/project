<?php

declare(strict_types=1);

namespace App\Helpers;

/**
 * Handshake WA myBeddien: siapkan token + URL wa.me (user kirim sendiri ke nomor resmi).
 */
final class MybeddianAuthWaHelper
{
    public const TTL_MINUTES = 30;

    public const PURPOSE_DAFTAR = 'daftar';
    public const PURPOSE_LUPA_PASSWORD = 'lupa_password';
    public const PURPOSE_LUPA_USERNAME = 'lupa_username';
    public const PURPOSE_PENGAJUAN_NIS = 'pengajuan_nis';
    /** Tambah mode akses dari Profil (akun sudah login). */
    public const PURPOSE_TAMBAH_AKSES = 'tambah_akses';
    /** One-time masuk setelah WA verify tambah_akses → /profil. */
    public const PURPOSE_MASUK_AKSES = 'masuk_akses';

    /**
     * @param array<string, mixed> $payload
     * @param list<string> $messageLines baris setelah judul (tanpa Token)
     * @return array{plain: string, wa_me_url: string, wa_message: string, expires_in_minutes: int}
     */
    public static function createPrepare(
        \PDO $db,
        string $purpose,
        string $mode,
        string $noWa62,
        array $payload,
        string $messageTitle,
        array $messageLines
    ): array {
        $purpose = strtolower(trim($purpose));
        $mode = strtolower(trim($mode));
        if (!in_array($purpose, [
            self::PURPOSE_DAFTAR,
            self::PURPOSE_LUPA_PASSWORD,
            self::PURPOSE_LUPA_USERNAME,
            self::PURPOSE_PENGAJUAN_NIS,
            self::PURPOSE_TAMBAH_AKSES,
            self::PURPOSE_MASUK_AKSES,
        ], true)) {
            throw new \InvalidArgumentException('purpose tidak valid');
        }
        if (!in_array($mode, ['santri', 'pjgt', 'toko'], true)) {
            throw new \InvalidArgumentException('mode tidak valid');
        }
        $noWa62 = preg_replace('/\D/', '', $noWa62) ?? '';
        if ($noWa62 === '' || strpos($noWa62, '62') !== 0) {
            throw new \InvalidArgumentException('no_wa tidak valid');
        }

        self::invalidateOpenTokens($db, $purpose, $noWa62, $payload);

        $plain = bin2hex(random_bytes(32));
        $hash = hash('sha256', $plain);
        $payload['no_wa'] = $noWa62;
        $payloadJson = json_encode($payload, JSON_UNESCAPED_UNICODE);
        if ($payloadJson === false) {
            throw new \RuntimeException('Gagal encode payload WA');
        }

        $ttl = self::TTL_MINUTES;
        $ins = $db->prepare(
            'INSERT INTO mybeddian_auth_wa_tokens
             (token_hash, purpose, mode, no_wa, payload_json, expires_at)
             VALUES (?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? MINUTE))'
        );
        $ins->execute([$hash, $purpose, $mode, $noWa62, $payloadJson, $ttl]);

        $lines = array_merge([$messageTitle], $messageLines, ['Token: ' . $plain]);
        $waMessage = implode("\n", $lines);
        $qr = self::qrNumber();
        $waMeUrl = 'https://wa.me/' . $qr . '?text=' . rawurlencode($waMessage);

        return [
            'plain' => $plain,
            'wa_me_url' => $waMeUrl,
            'wa_message' => $waMessage,
            'expires_in_minutes' => $ttl,
        ];
    }

    /**
     * @param array<string, mixed> $payload
     */
    private static function invalidateOpenTokens(\PDO $db, string $purpose, string $noWa62, array $payload): void
    {
        // Nonaktifkan token terbuka untuk nomor + purpose yang sama.
        $upd = $db->prepare(
            'UPDATE mybeddian_auth_wa_tokens
             SET used_at = NOW()
             WHERE purpose = ? AND no_wa = ? AND used_at IS NULL AND wa_verified_at IS NULL'
        );
        $upd->execute([$purpose, $noWa62]);

        // Juga nonaktifkan token terbuka untuk entity/user yang sama (ganti HP di form).
        $entityType = isset($payload['entity_type']) ? (string) $payload['entity_type'] : '';
        $entityId = isset($payload['entity_id']) ? (int) $payload['entity_id'] : 0;
        $userId = isset($payload['user_id']) ? (int) $payload['user_id'] : 0;
        if ($entityType !== '' && $entityId > 0) {
            $sel = $db->prepare(
                'SELECT id, payload_json FROM mybeddian_auth_wa_tokens
                 WHERE purpose = ? AND used_at IS NULL AND expires_at > NOW()
                 ORDER BY id DESC LIMIT 40'
            );
            $sel->execute([$purpose]);
            while ($row = $sel->fetch(\PDO::FETCH_ASSOC)) {
                $p = json_decode((string) ($row['payload_json'] ?? ''), true);
                if (!is_array($p)) {
                    continue;
                }
                if ((string) ($p['entity_type'] ?? '') === $entityType && (int) ($p['entity_id'] ?? 0) === $entityId) {
                    $db->prepare('UPDATE mybeddian_auth_wa_tokens SET used_at = NOW() WHERE id = ?')
                        ->execute([(int) $row['id']]);
                }
            }
        }
        if ($userId > 0) {
            $sel = $db->prepare(
                'SELECT id, payload_json FROM mybeddian_auth_wa_tokens
                 WHERE purpose = ? AND used_at IS NULL AND expires_at > NOW()
                 ORDER BY id DESC LIMIT 40'
            );
            $sel->execute([$purpose]);
            while ($row = $sel->fetch(\PDO::FETCH_ASSOC)) {
                $p = json_decode((string) ($row['payload_json'] ?? ''), true);
                if (!is_array($p)) {
                    continue;
                }
                if ((int) ($p['user_id'] ?? 0) === $userId) {
                    $db->prepare('UPDATE mybeddian_auth_wa_tokens SET used_at = NOW() WHERE id = ?')
                        ->execute([(int) $row['id']]);
                }
            }
        }

        $pengajuanId = isset($payload['pengajuan_id']) ? (int) $payload['pengajuan_id'] : 0;
        if ($pengajuanId > 0) {
            $sel = $db->prepare(
                'SELECT id, payload_json FROM mybeddian_auth_wa_tokens
                 WHERE purpose = ? AND used_at IS NULL AND expires_at > NOW()
                 ORDER BY id DESC LIMIT 40'
            );
            $sel->execute([$purpose]);
            while ($row = $sel->fetch(\PDO::FETCH_ASSOC)) {
                $p = json_decode((string) ($row['payload_json'] ?? ''), true);
                if (!is_array($p)) {
                    continue;
                }
                if ((int) ($p['pengajuan_id'] ?? 0) === $pengajuanId) {
                    $db->prepare('UPDATE mybeddian_auth_wa_tokens SET used_at = NOW() WHERE id = ?')
                        ->execute([(int) $row['id']]);
                }
            }
        }
    }

    public static function tableExists(\PDO $db): bool
    {
        try {
            return $db->query("SHOW TABLES LIKE 'mybeddian_auth_wa_tokens'")->rowCount() > 0;
        } catch (\Throwable $e) {
            return false;
        }
    }

    public static function qrNumber(): string
    {
        $config = require __DIR__ . '/../../config.php';
        $qr = preg_replace(
            '/\D/',
            '',
            (string) ($config['app']['mybeddian_auth_wa_qr_number']
                ?? $config['app']['daftar_santri_wa_qr_number']
                ?? '6285123123399')
        ) ?? '';
        return $qr !== '' ? $qr : '6285123123399';
    }

    public static function purposeTitle(string $purpose): string
    {
        if ($purpose === self::PURPOSE_DAFTAR) {
            return 'myBeddien Daftar';
        }
        if ($purpose === self::PURPOSE_TAMBAH_AKSES) {
            return 'myBeddien Tambah Akses';
        }
        if ($purpose === self::PURPOSE_LUPA_PASSWORD) {
            return 'myBeddien Lupa Password';
        }
        if ($purpose === self::PURPOSE_PENGAJUAN_NIS) {
            return 'myBeddien Pengajuan NIS';
        }
        return 'myBeddien Lupa Username';
    }
}
