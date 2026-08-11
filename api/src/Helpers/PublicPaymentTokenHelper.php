<?php

namespace App\Helpers;

/**
 * Helper untuk membuat dan memverifikasi signed token akses pembayaran publik.
 * Token berbasis HMAC-SHA256, format: base64url(payload).base64url(signature).
 *
 * Payload (JSON) berisi minimal:
 * - id_santri: int — santri.id terikat token (bukan NIS, sudah resolved)
 * - mode: string — scope token (uwaba | khusus | tunggakan | all)
 * - exp: int — unix timestamp kapan token kedaluwarsa
 * - iat: int — unix timestamp issued at
 * - jti: string — random nonce supaya token unik
 *
 * Token TIDAK bisa dipakai untuk santri lain karena id_santri bagian dari signature.
 */
class PublicPaymentTokenHelper
{
    public const SCOPE_ALL = 'all';
    public const ALLOWED_SCOPES = ['uwaba', 'khusus', 'tunggakan', 'all'];

    private const DEFAULT_TTL_SECONDS = 900; // 15 menit

    /**
     * Buat token untuk santri tertentu dengan scope mode.
     *
     * @param int $santriId santri.id (sudah resolved)
     * @param string $mode "uwaba" | "khusus" | "tunggakan" | "all"
     * @param int|null $ttlSeconds default 15 menit
     * @return string|null token signed; null bila secret tidak ada
     */
    public static function issue(int $santriId, string $mode, ?int $ttlSeconds = null): ?string
    {
        if ($santriId <= 0) {
            return null;
        }
        if (!in_array($mode, self::ALLOWED_SCOPES, true)) {
            return null;
        }
        $secret = self::getSecret();
        if ($secret === null) {
            return null;
        }
        $ttl = ($ttlSeconds !== null && $ttlSeconds > 0) ? $ttlSeconds : self::DEFAULT_TTL_SECONDS;
        $now = time();
        $payload = [
            'id_santri' => $santriId,
            'mode' => $mode,
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
        $signatureEncoded = self::base64UrlEncode($signature);
        return $payloadEncoded . '.' . $signatureEncoded;
    }

    /**
     * Verifikasi token. Bila valid, kembalikan array payload (id_santri, mode, exp, ...).
     * Bila tidak valid (signature salah, expired, format salah), kembalikan null.
     */
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
        $mode = isset($payload['mode']) ? (string) $payload['mode'] : '';
        $exp = isset($payload['exp']) ? (int) $payload['exp'] : 0;
        if ($santriId <= 0 || !in_array($mode, self::ALLOWED_SCOPES, true) || $exp <= 0) {
            return null;
        }
        if ($exp < time()) {
            return null;
        }
        return [
            'id_santri' => $santriId,
            'mode' => $mode,
            'exp' => $exp,
            'iat' => isset($payload['iat']) ? (int) $payload['iat'] : 0,
            'jti' => isset($payload['jti']) ? (string) $payload['jti'] : '',
        ];
    }

    /**
     * Cek apakah scope token sah untuk mode endpoint yang sedang diakses.
     */
    public static function scopeAllowsMode(string $tokenScope, string $endpointMode): bool
    {
        if ($tokenScope === self::SCOPE_ALL) {
            return in_array($endpointMode, ['uwaba', 'khusus', 'tunggakan'], true);
        }
        return $tokenScope === $endpointMode;
    }

    private static function getSecret(): ?string
    {
        $config = require __DIR__ . '/../../config.php';
        $jwtSecret = $config['jwt']['secret'] ?? null;
        if (!is_string($jwtSecret) || $jwtSecret === '') {
            return null;
        }
        // Derivasi sub-key untuk public payment supaya kalau JWT bocor lewat jalur lain,
        // attacker tetap tidak bisa langsung sign token public payment dengan secret yang sama.
        return hash_hmac('sha256', 'public-payment-token-v1', $jwtSecret, true);
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
