<?php

declare(strict_types=1);

namespace App\Helpers;

/**
 * Signed token untuk akses data santri publik (biodata penuh, ijin, shohifah).
 * Format sama PublicPaymentTokenHelper: base64url(payload).base64url(hmac).
 */
final class PublicSantriViewTokenHelper
{
    public const SCOPE_BIODATA = 'biodata';
    public const SCOPE_IJIN = 'ijin';
    public const SCOPE_SHOHIFAH_READ = 'shohifah_read';
    public const SCOPE_SHOHIFAH_WRITE = 'shohifah_write';
    public const SCOPE_REGISTRASI = 'registrasi';
    public const SCOPE_ALL = 'all';

    public const ALLOWED_SCOPES = [
        self::SCOPE_BIODATA,
        self::SCOPE_IJIN,
        self::SCOPE_SHOHIFAH_READ,
        self::SCOPE_SHOHIFAH_WRITE,
        self::SCOPE_REGISTRASI,
        self::SCOPE_ALL,
    ];

    private const DEFAULT_TTL_SECONDS = 86400; // 24 jam — QR cetak

    public static function issue(int $santriId, string $scope, ?int $ttlSeconds = null): ?string
    {
        if ($santriId <= 0 || !in_array($scope, self::ALLOWED_SCOPES, true)) {
            return null;
        }
        $secret = self::getSecret();
        if ($secret === null) {
            return null;
        }
        $ttl = ($ttlSeconds !== null && $ttlSeconds > 0) ? $ttlSeconds : self::DEFAULT_TTL_SECONDS;
        if ($ttl > 604800) {
            $ttl = 604800; // max 7 hari
        }
        $now = time();
        $payload = [
            'id_santri' => $santriId,
            'scope' => $scope,
            'iat' => $now,
            'exp' => $now + $ttl,
            'jti' => bin2hex(random_bytes(8)),
        ];
        $payloadJson = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        if ($payloadJson === false) {
            return null;
        }
        $payloadEncoded = self::base64UrlEncode($payloadJson);
        $signature = hash_hmac('sha256', $payloadEncoded, $secret, true);

        return $payloadEncoded . '.' . self::base64UrlEncode($signature);
    }

    public static function verify(string $token): ?array
    {
        $token = trim($token);
        if ($token === '' || substr_count($token, '.') !== 1) {
            return null;
        }
        $secret = self::getSecret();
        if ($secret === null) {
            return null;
        }
        [$payloadEncoded, $signatureEncoded] = explode('.', $token, 2);
        if ($payloadEncoded === '' || $signatureEncoded === '') {
            return null;
        }
        $expectedSignature = hash_hmac('sha256', $payloadEncoded, $secret, true);
        $signature = self::base64UrlDecode($signatureEncoded);
        if ($signature === null || !hash_equals($expectedSignature, $signature)) {
            return null;
        }
        $payloadJson = self::base64UrlDecode($payloadEncoded);
        if ($payloadJson === null) {
            return null;
        }
        $payload = json_decode($payloadJson, true);
        if (!is_array($payload)) {
            return null;
        }
        $santriId = isset($payload['id_santri']) ? (int) $payload['id_santri'] : 0;
        $scope = isset($payload['scope']) ? (string) $payload['scope'] : '';
        $exp = isset($payload['exp']) ? (int) $payload['exp'] : 0;
        if ($santriId <= 0 || !in_array($scope, self::ALLOWED_SCOPES, true) || $exp <= 0) {
            return null;
        }
        if ($exp < time()) {
            return null;
        }

        return [
            'id_santri' => $santriId,
            'scope' => $scope,
            'exp' => $exp,
            'iat' => isset($payload['iat']) ? (int) $payload['iat'] : 0,
            'jti' => isset($payload['jti']) ? (string) $payload['jti'] : '',
        ];
    }

    public static function scopeAllows(string $tokenScope, string $requiredScope): bool
    {
        if ($tokenScope === self::SCOPE_ALL) {
            return true;
        }

        return $tokenScope === $requiredScope;
    }

    private static function getSecret(): ?string
    {
        $config = require __DIR__ . '/../../config.php';
        $jwtSecret = $config['jwt']['secret'] ?? null;
        if (!is_string($jwtSecret) || $jwtSecret === '') {
            return null;
        }

        return hash_hmac('sha256', 'public-santri-view-token-v1', $jwtSecret, true);
    }

    private static function base64UrlEncode(string $data): string
    {
        return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
    }

    private static function base64UrlDecode(string $data): ?string
    {
        $padded = strtr($data, '-_', '+/');
        $remainder = strlen($padded) % 4;
        if ($remainder !== 0) {
            $padded .= str_repeat('=', 4 - $remainder);
        }
        $decoded = base64_decode($padded, true);

        return $decoded === false ? null : $decoded;
    }
}
