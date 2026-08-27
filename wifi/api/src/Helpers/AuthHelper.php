<?php

namespace App\Helpers;

use App\Config\Database;
use PDO;
use Psr\Http\Message\ServerRequestInterface as Request;

class AuthHelper
{
    public const SESSION_COOKIE = 'wifi_session';
    public const SESSION_DAYS = 30;

    public static function pdo(): PDO
    {
        return Database::getInstance();
    }

    public static function getGoogleRedirectUri(): string
    {
        $fromEnv = trim((string) ($_ENV['GOOGLE_REDIRECT_URI'] ?? ''));
        if ($fromEnv !== '') {
            return $fromEnv;
        }

        $auto = self::detectPublicApiCallbackUri();
        if ($auto !== null) {
            return $auto;
        }

        return 'http://localhost/wifi/api/public/auth/google/callback';
    }

    public static function getFrontendUrl(): string
    {
        $fromEnv = rtrim(trim((string) ($_ENV['FRONTEND_URL'] ?? '')), '/');
        if ($fromEnv !== '') {
            return $fromEnv;
        }
        $auto = self::detectPublicOrigin();
        if ($auto !== null) {
            return $auto;
        }
        return 'http://localhost:5178';
    }

    public static function getAllowedFrontendOrigins(): array
    {
        $list = array_values(array_filter(array_map('trim', explode(',', (string) ($_ENV['CORS_ORIGINS'] ?? '')))));
        if (!$list) {
            $list = ['http://localhost:5178', 'http://localhost'];
        }
        $frontend = self::getFrontendUrl();
        if ($frontend !== '' && !in_array($frontend, $list, true)) {
            $list[] = $frontend;
        }
        $public = self::detectPublicOrigin();
        if ($public !== null && !in_array($public, $list, true)) {
            $list[] = $public;
        }
        return $list;
    }

    public static function isAllowedFrontendOrigin(?string $origin): bool
    {
        $origin = rtrim(trim((string) $origin), '/');
        if ($origin === '') {
            return false;
        }
        if (in_array($origin, self::getAllowedFrontendOrigins(), true)) {
            return true;
        }
        if (self::isSameRequestHost($origin)) {
            return true;
        }
        return (bool) preg_match(
            '#^https?://(192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3})(:\d+)?$#',
            $origin
        );
    }

    public static function resolveFrontendUrl(?string $candidate = null): string
    {
        $candidate = rtrim(trim((string) $candidate), '/');
        if ($candidate !== '' && self::isAllowedFrontendOrigin($candidate)) {
            return $candidate;
        }
        return self::getFrontendUrl();
    }

    private static function requestIsHttps(): bool
    {
        if (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') {
            return true;
        }
        $fwd = strtolower((string) ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? ''));
        return $fwd === 'https';
    }

    private static function requestHostname(): string
    {
        $host = (string) ($_SERVER['HTTP_HOST'] ?? $_SERVER['SERVER_NAME'] ?? '');
        $host = strtolower(trim($host));
        if (str_contains($host, ':')) {
            $host = explode(':', $host, 2)[0];
        }
        return $host;
    }

    private static function isPublicHostname(string $hostname): bool
    {
        $h = strtolower($hostname);
        if ($h === '' || $h === 'localhost' || $h === '127.0.0.1') {
            return false;
        }
        return !preg_match('/^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[0-1])\.)/', $h);
    }

    private static function detectPublicOrigin(): ?string
    {
        $host = self::requestHostname();
        if (!self::isPublicHostname($host)) {
            return null;
        }
        $scheme = self::requestIsHttps() ? 'https' : 'http';
        return $scheme . '://' . $host;
    }

    private static function detectPublicApiCallbackUri(): ?string
    {
        $origin = self::detectPublicOrigin();
        if ($origin === null) {
            return null;
        }
        $script = str_replace('\\', '/', (string) ($_SERVER['SCRIPT_NAME'] ?? ''));
        $base = preg_replace('#/index\.php$#', '', $script) ?? '';
        $base = rtrim($base, '/');
        if ($base === '') {
            $base = '/api/public';
        }
        return $origin . $base . '/auth/google/callback';
    }

    private static function isSameRequestHost(string $origin): bool
    {
        $reqHost = self::requestHostname();
        if ($reqHost === '' || !self::isPublicHostname($reqHost)) {
            return false;
        }
        $parts = parse_url($origin);
        $candHost = strtolower((string) ($parts['host'] ?? ''));
        return $candHost !== '' && strcasecmp($candHost, $reqHost) === 0;
    }

    public static function encodeOAuthState(array $payload): string
    {
        $json = json_encode($payload, JSON_UNESCAPED_SLASHES);
        return rtrim(strtr(base64_encode($json ?: '{}'), '+/', '-_'), '=');
    }

    public static function decodeOAuthState(?string $state): array
    {
        if (!$state) {
            return ['returnTo' => '/'];
        }
        $padded = strtr($state, '-_', '+/');
        $padLen = (4 - strlen($padded) % 4) % 4;
        $padded .= str_repeat('=', $padLen);
        $json = base64_decode($padded, true);
        if ($json === false) {
            return ['returnTo' => '/'];
        }
        $data = json_decode($json, true);
        if (!is_array($data)) {
            return ['returnTo' => '/'];
        }
        return $data;
    }

    public static function buildGoogleAuthUrl(string $returnTo, ?string $frontend = null): string
    {
        $clientId = trim((string) ($_ENV['GOOGLE_CLIENT_ID'] ?? ''));
        if ($clientId === '') {
            throw new \RuntimeException('GOOGLE_CLIENT_ID belum dikonfigurasi');
        }

        $payload = ['returnTo' => $returnTo];
        $frontend = self::resolveFrontendUrl($frontend);
        $payload['frontend'] = $frontend;

        $params = http_build_query([
            'client_id' => $clientId,
            'redirect_uri' => self::getGoogleRedirectUri(),
            'response_type' => 'code',
            'scope' => 'openid email profile',
            'access_type' => 'online',
            'prompt' => 'select_account',
            'state' => self::encodeOAuthState($payload),
        ]);

        return 'https://accounts.google.com/o/oauth2/v2/auth?' . $params;
    }

    /**
     * @return array{email:string,name:string,picture:string,googleId:string}
     */
    public static function exchangeGoogleCode(string $code): array
    {
        $clientId = trim((string) ($_ENV['GOOGLE_CLIENT_ID'] ?? ''));
        $clientSecret = trim((string) ($_ENV['GOOGLE_CLIENT_SECRET'] ?? ''));
        if ($clientId === '' || $clientSecret === '') {
            throw new \RuntimeException('Kredensial Google OAuth belum dikonfigurasi');
        }

        $tokenRes = self::httpPostForm('https://oauth2.googleapis.com/token', [
            'code' => $code,
            'client_id' => $clientId,
            'client_secret' => $clientSecret,
            'redirect_uri' => self::getGoogleRedirectUri(),
            'grant_type' => 'authorization_code',
        ]);

        if (empty($tokenRes['access_token'])) {
            throw new \RuntimeException('Gagal menukar kode Google: ' . ($tokenRes['error_description'] ?? $tokenRes['error'] ?? 'unknown'));
        }

        $profile = self::httpGetJson(
            'https://www.googleapis.com/oauth2/v3/userinfo',
            ['Authorization: Bearer ' . $tokenRes['access_token']]
        );

        if (empty($profile['email']) || empty($profile['sub'])) {
            throw new \RuntimeException('Profil Google tidak lengkap');
        }

        return [
            'googleId' => (string) $profile['sub'],
            'email' => (string) $profile['email'],
            'name' => (string) ($profile['name'] ?? $profile['email']),
            'picture' => (string) ($profile['picture'] ?? ''),
        ];
    }

    /**
     * Login email + password (fallback tanpa Google).
     *
     * @return array{user: array, sessionId: string}
     */
    public static function loginWithPassword(string $email, string $password): array
    {
        $email = strtolower(trim($email));
        if ($email === '' || $password === '') {
            throw new \RuntimeException('Email dan password wajib diisi');
        }

        $pdo = self::pdo();
        $stmt = $pdo->prepare('SELECT * FROM users WHERE email = ? LIMIT 1');
        $stmt->execute([$email]);
        $row = $stmt->fetch();
        if (!$row || empty($row['password_hash'])) {
            throw new \RuntimeException('Email atau password salah');
        }
        if (!password_verify($password, (string) $row['password_hash'])) {
            throw new \RuntimeException('Email atau password salah');
        }

        $superAdmin = strtolower(trim((string) ($_ENV['SUPER_ADMIN_EMAIL'] ?? '')));
        if ($superAdmin !== '' && $email === $superAdmin && ($row['role'] ?? '') !== 'super_admin') {
            $upd = $pdo->prepare('UPDATE users SET role = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
            $upd->execute(['super_admin', $row['id']]);
        }

        $user = self::getUserById((int) $row['id']);
        if (!$user) {
            throw new \RuntimeException('Pengguna tidak ditemukan');
        }

        return [
            'user' => $user,
            'sessionId' => self::createSession((int) $user['id']),
        ];
    }

    /**
     * Pastikan akun fallback dari env ada (dipakai migrate / bootstrap production).
     */
    public static function ensureFallbackAdminFromEnv(): ?array
    {
        $email = strtolower(trim((string) ($_ENV['FALLBACK_ADMIN_EMAIL'] ?? '')));
        $password = (string) ($_ENV['FALLBACK_ADMIN_PASSWORD'] ?? '');
        if ($email === '' || $password === '') {
            return null;
        }

        $pdo = self::pdo();
        $hash = password_hash($password, PASSWORD_DEFAULT);
        $superAdmin = strtolower(trim((string) ($_ENV['SUPER_ADMIN_EMAIL'] ?? '')));
        $role = ($superAdmin !== '' && $email === $superAdmin) ? 'super_admin' : 'super_admin';

        $stmt = $pdo->prepare('SELECT id FROM users WHERE email = ? LIMIT 1');
        $stmt->execute([$email]);
        $existing = $stmt->fetch();

        if ($existing) {
            $upd = $pdo->prepare(
                'UPDATE users SET password_hash = ?, role = ?, name = COALESCE(NULLIF(name, \'\'), ?), updated_at = CURRENT_TIMESTAMP WHERE id = ?'
            );
            $upd->execute([$hash, $role, 'Admin Wifi', $existing['id']]);
            return self::getUserById((int) $existing['id']);
        }

        $ins = $pdo->prepare(
            'INSERT INTO users (email, name, picture, google_id, password_hash, role) VALUES (?, ?, NULL, NULL, ?, ?)'
        );
        $ins->execute([$email, 'Admin Wifi', $hash, $role]);
        return self::getUserById((int) $pdo->lastInsertId());
    }

    public static function upsertGoogleUser(array $profile): array
    {
        $pdo = self::pdo();
        $email = strtolower(trim($profile['email']));
        $superAdmin = strtolower(trim((string) ($_ENV['SUPER_ADMIN_EMAIL'] ?? '')));

        $stmt = $pdo->prepare('SELECT * FROM users WHERE email = ? LIMIT 1');
        $stmt->execute([$email]);
        $existing = $stmt->fetch();

        if ($existing) {
            $role = ($superAdmin !== '' && $email === $superAdmin) ? 'super_admin' : $existing['role'];
            $upd = $pdo->prepare(
                'UPDATE users SET name = ?, picture = ?, google_id = ?, role = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
            );
            $upd->execute([
                $profile['name'],
                $profile['picture'],
                $profile['googleId'],
                $role,
                $existing['id'],
            ]);
            return self::getUserById((int) $existing['id']);
        }

        $role = ($superAdmin !== '' && $email === $superAdmin) ? 'super_admin' : 'pending';
        $ins = $pdo->prepare(
            'INSERT INTO users (email, name, picture, google_id, role) VALUES (?, ?, ?, ?, ?)'
        );
        $ins->execute([
            $email,
            $profile['name'],
            $profile['picture'],
            $profile['googleId'],
            $role,
        ]);

        return self::getUserById((int) $pdo->lastInsertId());
    }

    public static function createSession(int $userId): string
    {
        $sessionId = bin2hex(random_bytes(32));
        $expiresAt = (new \DateTimeImmutable('+' . self::SESSION_DAYS . ' days'))->format('Y-m-d H:i:s');
        $stmt = self::pdo()->prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)');
        $stmt->execute([$sessionId, $userId, $expiresAt]);
        return $sessionId;
    }

    public static function destroySession(string $sessionId): void
    {
        $stmt = self::pdo()->prepare('DELETE FROM sessions WHERE id = ?');
        $stmt->execute([$sessionId]);
    }

    public static function getUserById(int $id): ?array
    {
        $stmt = self::pdo()->prepare(
            'SELECT u.id, u.email, u.name, u.picture, u.google_id, u.role, u.pelanggan_id,
                    p.nama AS pelanggan_nama,
                    u.created_at, u.updated_at
             FROM users u
             LEFT JOIN pelanggan p ON p.id = u.pelanggan_id
             WHERE u.id = ?
             LIMIT 1'
        );
        $stmt->execute([$id]);
        $row = $stmt->fetch();
        return $row ?: null;
    }

    public static function getUserFromSession(string $sessionId): ?array
    {
        $stmt = self::pdo()->prepare(
            'SELECT u.id, u.email, u.name, u.picture, u.google_id, u.role, u.pelanggan_id,
                    p.nama AS pelanggan_nama,
                    u.created_at, u.updated_at
             FROM sessions s
             INNER JOIN users u ON u.id = s.user_id
             LEFT JOIN pelanggan p ON p.id = u.pelanggan_id
             WHERE s.id = ? AND s.expires_at > NOW()
             LIMIT 1'
        );
        $stmt->execute([$sessionId]);
        $row = $stmt->fetch();
        return $row ?: null;
    }

    public static function extractSessionId(Request $request): ?string
    {
        $auth = $request->getHeaderLine('Authorization');
        if (preg_match('/^Bearer\s+(\S+)$/i', $auth, $m)) {
            return $m[1];
        }

        $cookies = $request->getCookieParams();
        $fromCookie = $cookies[self::SESSION_COOKIE] ?? '';
        return $fromCookie !== '' ? (string) $fromCookie : null;
    }

    public static function getUserFromRequest(Request $request): ?array
    {
        $sessionId = self::extractSessionId($request);
        if (!$sessionId) {
            return null;
        }
        return self::getUserFromSession($sessionId);
    }

    public static function isAdminRole(?string $role): bool
    {
        return in_array($role, ['admin', 'super_admin'], true);
    }

    public static function isSuperAdminRole(?string $role): bool
    {
        return $role === 'super_admin';
    }

    public static function canManageData(?string $role): bool
    {
        return self::isAdminRole($role);
    }

    /** Role user: hanya lihat tagihan sendiri (read-only). */
    public static function isPortalUser(?string $role): bool
    {
        return $role === 'user';
    }

    public static function isPendingRole(?string $role): bool
    {
        return $role === 'pending';
    }

    public static function hasAppAccess(?string $role): bool
    {
        return in_array($role, ['super_admin', 'admin', 'user'], true);
    }

    public static function hiddenSuperAdminEmail(): string
    {
        return strtolower(trim((string) ($_ENV['SUPER_ADMIN_EMAIL'] ?? '')));
    }

    public static function isHiddenSuperAdminEmail(?string $email): bool
    {
        $hidden = self::hiddenSuperAdminEmail();
        if ($hidden === '' || $email === null || $email === '') {
            return false;
        }
        return strtolower(trim($email)) === $hidden;
    }

    public static function sessionCookieHeader(string $sessionId, int $maxAgeSec = null): string
    {
        $maxAge = $maxAgeSec ?? (self::SESSION_DAYS * 86400);
        $secure = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? '; Secure' : '';
        return self::SESSION_COOKIE . '=' . $sessionId
            . '; Path=/; HttpOnly; SameSite=Lax; Max-Age=' . $maxAge . $secure;
    }

    public static function clearSessionCookieHeader(): string
    {
        return self::SESSION_COOKIE . '=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0';
    }

    public static function publicUser(array $user): array
    {
        return [
            'id' => (int) $user['id'],
            'email' => $user['email'],
            'name' => $user['name'],
            'picture' => $user['picture'],
            'role' => $user['role'],
            'pelanggan_id' => isset($user['pelanggan_id']) && $user['pelanggan_id'] !== null
                ? (int) $user['pelanggan_id']
                : null,
            'pelanggan_nama' => $user['pelanggan_nama'] ?? null,
        ];
    }

    private static function httpPostForm(string $url, array $fields): array
    {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => http_build_query($fields),
            CURLOPT_HTTPHEADER => ['Content-Type: application/x-www-form-urlencoded'],
            CURLOPT_TIMEOUT => 20,
        ]);
        $body = curl_exec($ch);
        $err = curl_error($ch);
        curl_close($ch);
        if ($body === false) {
            throw new \RuntimeException('HTTP error: ' . $err);
        }
        $data = json_decode($body, true);
        return is_array($data) ? $data : [];
    }

    private static function httpGetJson(string $url, array $headers = []): array
    {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_TIMEOUT => 20,
        ]);
        $body = curl_exec($ch);
        $err = curl_error($ch);
        curl_close($ch);
        if ($body === false) {
            throw new \RuntimeException('HTTP error: ' . $err);
        }
        $data = json_decode($body, true);
        return is_array($data) ? $data : [];
    }
}
