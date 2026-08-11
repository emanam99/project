<?php

declare(strict_types=1);

namespace App\Helpers;

/**
 * Token kartu cashless: prefix + Nano-ID + timestamp base36 + HMAC.
 * Format: {PREFIX}.{nonce21}.{tsBase36}.{sig8}
 * Contoh: CS1.Vk9mP2nQ7vR4wL8jH3fG6.lq1a2b3c.xK9mP2nQ
 */
class CashlessCardTokenHelper
{
    public const TYPE_SANTRI = 'SANTRI';
    public const TYPE_MAHROM = 'MAHROM';

    /** @var array<string, string> */
    public const TYPE_TO_PREFIX = [
        self::TYPE_SANTRI => 'CS1',
        self::TYPE_MAHROM => 'CM1',
    ];

    /** @var array<string, string> */
    private const PREFIX_TO_TYPE = [
        'CS1' => self::TYPE_SANTRI,
        'CM1' => self::TYPE_MAHROM,
    ];

    private const NANO_ALPHABET = '_-0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
    private const NONCE_LEN = 21;
    private const SIG_LEN = 8;

    /**
     * @return array{token: string, token_hash: string, token_prefix: string, secret_version: int, card_type: string}|null
     */
    public static function issue(string $cardType): ?array
    {
        $prefix = self::TYPE_TO_PREFIX[$cardType] ?? null;
        if ($prefix === null) {
            return null;
        }
        $secretVersion = self::getSecretVersion();
        $secret = self::getSecret($secretVersion);
        if ($secret === null) {
            return null;
        }

        $nonce = self::nanoId(self::NONCE_LEN);
        $ts = time();
        $tsCompact = self::toBase36($ts);
        $sig = self::sign($prefix, $nonce, $tsCompact, $secretVersion, $secret);
        $token = $prefix . '.' . $nonce . '.' . $tsCompact . '.' . $sig;

        return [
            'token' => $token,
            'token_hash' => hash('sha256', $token),
            'token_prefix' => $prefix,
            'secret_version' => $secretVersion,
            'card_type' => $cardType,
        ];
    }

    /**
     * Verifikasi format + HMAC. Tidak cek DB/revoke — gunakan resolveFromDatabase setelah ini.
     *
     * @return array{card_type: string, token_prefix: string, token_hash: string, secret_version: int}|null
     */
    public static function verifyFormat(string $token): ?array
    {
        $token = trim($token);
        if ($token === '' || substr_count($token, '.') !== 3) {
            return null;
        }
        $parts = explode('.', $token, 4);
        [$prefix, $nonce, $tsCompact, $sig] = $parts;
        if ($prefix === '' || $nonce === '' || $tsCompact === '' || $sig === '') {
            return null;
        }
        $cardType = self::PREFIX_TO_TYPE[$prefix] ?? null;
        if ($cardType === null) {
            return null;
        }
        if (strlen($nonce) !== self::NONCE_LEN || strlen($sig) !== self::SIG_LEN) {
            return null;
        }
        if (!preg_match('/^[_\\-0-9a-zA-Z]+$/', $nonce)) {
            return null;
        }

        $secretVersion = self::getSecretVersion();
        $secret = self::getSecret($secretVersion);
        if ($secret === null) {
            return null;
        }
        $expectedSig = self::sign($prefix, $nonce, $tsCompact, $secretVersion, $secret);
        if (!hash_equals($expectedSig, $sig)) {
            return null;
        }

        return [
            'card_type' => $cardType,
            'token_prefix' => $prefix,
            'token_hash' => hash('sha256', $token),
            'secret_version' => $secretVersion,
        ];
    }

    public static function hashToken(string $token): string
    {
        return hash('sha256', trim($token));
    }

    public static function getSecretVersion(): int
    {
        try {
            $db = \App\Database::getInstance()->getConnection();
            $stmt = $db->query("SELECT nilai FROM cashless___config WHERE kunci = 'card_secret_version' LIMIT 1");
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);
            if ($row && is_numeric($row['nilai'])) {
                return max(1, (int) $row['nilai']);
            }
        } catch (\Throwable $e) {
            // tabel belum ada
        }
        return 1;
    }

    /** Naikkan versi secret → semua kartu lama otomatis invalid (secret_version tidak cocok). */
    public static function bumpSecretVersion(\PDO $db): int
    {
        $current = self::getSecretVersion();
        $next = $current + 1;
        $db->prepare("INSERT INTO cashless___config (kunci, nilai) VALUES ('card_secret_version', ?) ON DUPLICATE KEY UPDATE nilai = VALUES(nilai)")
            ->execute([(string) $next]);
        $db->exec('DELETE FROM cashless___kartu');
        return $next;
    }

    public static function prefixForType(string $cardType): ?string
    {
        return self::TYPE_TO_PREFIX[$cardType] ?? null;
    }

    public static function typeForPrefix(string $prefix): ?string
    {
        return self::PREFIX_TO_TYPE[$prefix] ?? null;
    }

    private static function sign(string $prefix, string $nonce, string $tsCompact, int $secretVersion, string $secret): string
    {
        $payload = $prefix . '|' . $nonce . '|' . $tsCompact . '|v' . $secretVersion;
        $raw = hash_hmac('sha256', $payload, $secret, true);
        return substr(self::base64UrlEncode($raw), 0, self::SIG_LEN);
    }

    private static function getSecret(int $version): ?string
    {
        $config = require dirname(__DIR__, 2) . '/config.php';
        $jwtSecret = $config['jwt']['secret'] ?? null;
        if (!is_string($jwtSecret) || $jwtSecret === '') {
            return null;
        }
        return hash_hmac('sha256', 'cashless-card-token-v' . $version, $jwtSecret, true);
    }

    private static function nanoId(int $size): string
    {
        $alphabet = self::NANO_ALPHABET;
        $len = strlen($alphabet);
        $bytes = random_bytes($size);
        $out = '';
        for ($i = 0; $i < $size; $i++) {
            $out .= $alphabet[ord($bytes[$i]) % $len];
        }
        return $out;
    }

    private static function toBase36(int $n): string
    {
        return strtolower(base_convert((string) max(0, $n), 10, 36));
    }

    private static function base64UrlEncode(string $data): string
    {
        return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
    }
}
