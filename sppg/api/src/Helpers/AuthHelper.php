<?php

namespace App\Helpers;

use App\Config\Database;
use PDO;
use Psr\Http\Message\ServerRequestInterface as Request;

class AuthHelper
{
    public const SESSION_COOKIE = 'sppg_session';
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

        // Production: bangun dari host request (bukan localhost)
        $auto = self::detectPublicApiCallbackUri();
        if ($auto !== null) {
            return $auto;
        }

        // Dev lokal / IP privat — Google menolak redirect IP privat
        return 'http://localhost/sppg/api/public/auth/google/callback';
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
        return 'http://localhost:5177';
    }

    /** Origin frontend yang diizinkan (CORS / OAuth return). */
    public static function getAllowedFrontendOrigins(): array
    {
        $list = array_values(array_filter(array_map('trim', explode(',', (string) ($_ENV['CORS_ORIGINS'] ?? '')))));
        if (!$list) {
            $list = ['http://localhost:5177', 'http://localhost'];
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

    /** Izinkan daftar CORS + FRONTEND_URL + same-site production + IP LAN privat (dev HP). */
    public static function isAllowedFrontendOrigin(?string $origin): bool
    {
        $origin = rtrim(trim((string) $origin), '/');
        if ($origin === '') {
            return false;
        }
        if (in_array($origin, self::getAllowedFrontendOrigins(), true)) {
            return true;
        }
        // Same host dengan API (production: sppg.alutsmani.id → frontend & API satu domain)
        if (self::isSameRequestHost($origin)) {
            return true;
        }
        if (TenantHostHelper::isCloudyOrigin($origin)) {
            return true;
        }
        // http://192.168.x.x:5177 | 10.x | 172.16-31.x
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
        // Buang port
        if (str_contains($host, ':')) {
            $host = explode(':', $host, 2)[0];
        }
        return $host;
    }

    private static function isPrivateHostname(string $hostname): bool
    {
        $h = strtolower($hostname);
        if ($h === '' || $h === 'localhost' || $h === '127.0.0.1') {
            return true; // treat loopback as non-public for auto-detect purposes below
        }
        return (bool) preg_match(
            '/^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[0-1])\.)/',
            $h
        );
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
        // /api/public/index.php → /api/public
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

    public static function buildGoogleAuthUrl(string $returnTo, ?string $frontend = null, array $extraState = []): string
    {
        $clientId = trim((string) ($_ENV['GOOGLE_CLIENT_ID'] ?? ''));
        if ($clientId === '') {
            throw new \RuntimeException('GOOGLE_CLIENT_ID belum dikonfigurasi');
        }

        $payload = array_merge(['returnTo' => $returnTo], $extraState);
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

    public static function upsertGoogleUser(array $profile, int $sppgId): array
    {
        $pdo = self::pdo();
        $email = strtolower(trim($profile['email']));
        $superAdmin = strtolower(trim((string) ($_ENV['SUPER_ADMIN_EMAIL'] ?? '')));

        $stmt = $pdo->prepare('SELECT * FROM users WHERE sppg_id = ? AND email = ? LIMIT 1');
        $stmt->execute([$sppgId, $email]);
        $existing = $stmt->fetch();

        if ($existing) {
            $role = ($superAdmin !== '' && $email === $superAdmin)
                ? 'super_admin'
                : $existing['role'];
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
            'INSERT INTO users (sppg_id, email, name, picture, google_id, role) VALUES (?, ?, ?, ?, ?, ?)'
        );
        $ins->execute([
            $sppgId,
            $email,
            $profile['name'],
            $profile['picture'],
            $profile['googleId'],
            $role,
        ]);

        return self::getUserById((int) $pdo->lastInsertId());
    }

    /** User baru saat pendaftaran tenant — langsung super_admin. */
    public static function createRegisterSuperAdmin(array $profile, int $sppgId): array
    {
        $pdo = self::pdo();
        $email = strtolower(trim($profile['email']));

        $check = $pdo->prepare('SELECT id FROM users WHERE sppg_id = ? AND email = ? LIMIT 1');
        $check->execute([$sppgId, $email]);
        if ($check->fetch()) {
            throw new \RuntimeException('Email sudah terdaftar di SPPG ini');
        }

        $ins = $pdo->prepare(
            'INSERT INTO users (sppg_id, email, name, picture, google_id, role) VALUES (?, ?, ?, ?, ?, \'super_admin\')'
        );
        $ins->execute([
            $sppgId,
            $email,
            $profile['name'],
            $profile['picture'],
            $profile['googleId'],
        ]);

        return self::getUserById((int) $pdo->lastInsertId());
    }

    /** @return list<array> */
    public static function findMembershipsByEmail(string $email): array
    {
        $stmt = self::pdo()->prepare(
            'SELECT u.id, u.sppg_id, u.email, u.name, u.picture, u.role,
                    s.public_id, s.slug, s.subdomain, s.nama_unit, s.nama_yayasan, s.status AS sppg_status
             FROM users u
             INNER JOIN sppg s ON s.id = u.sppg_id
             WHERE u.email = ?
             ORDER BY s.nama_unit ASC'
        );
        $stmt->execute([strtolower(trim($email))]);
        return $stmt->fetchAll() ?: [];
    }

    public static function createPickToken(array $profile, array $memberships): string
    {
        $token = bin2hex(random_bytes(32));
        $expires = (new \DateTimeImmutable('+15 minutes'))->format('Y-m-d H:i:s');
        $payload = array_map(static function ($m) {
            return [
                'user_id' => (int) $m['id'],
                'sppg_id' => (int) $m['sppg_id'],
                'slug' => $m['slug'],
                'subdomain' => $m['subdomain'] ?? null,
                'tenant_url' => TenantHostHelper::tenantUrl($m['subdomain'] ?? null),
                'nama_unit' => $m['nama_unit'],
                'nama_yayasan' => $m['nama_yayasan'],
                'role' => $m['role'],
            ];
        }, $memberships);

        $stmt = self::pdo()->prepare(
            'INSERT INTO auth_pick_tokens (token, email, google_id, name, picture, memberships, expires_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)'
        );
        $stmt->execute([
            $token,
            strtolower(trim($profile['email'])),
            $profile['googleId'],
            $profile['name'],
            $profile['picture'],
            json_encode($payload, JSON_UNESCAPED_UNICODE),
            $expires,
        ]);

        return $token;
    }

    public static function consumePickToken(string $token, int $sppgId): ?array
    {
        $stmt = self::pdo()->prepare(
            'SELECT * FROM auth_pick_tokens WHERE token = ? AND expires_at > NOW() LIMIT 1'
        );
        $stmt->execute([$token]);
        $row = $stmt->fetch();
        if (!$row) {
            return null;
        }

        $memberships = json_decode((string) $row['memberships'], true);
        if (!is_array($memberships)) {
            return null;
        }

        $matchUserId = null;
        foreach ($memberships as $m) {
            if ((int) ($m['sppg_id'] ?? 0) === $sppgId) {
                $matchUserId = (int) ($m['user_id'] ?? 0);
                break;
            }
        }
        if (!$matchUserId) {
            return null;
        }

        self::pdo()->prepare('DELETE FROM auth_pick_tokens WHERE token = ?')->execute([$token]);
        return self::getUserById($matchUserId);
    }

    public static function createSession(int $userId, int $sppgId): string
    {
        $sessionId = bin2hex(random_bytes(32));
        $expiresAt = (new \DateTimeImmutable('+' . self::SESSION_DAYS . ' days'))->format('Y-m-d H:i:s');
        $stmt = self::pdo()->prepare('INSERT INTO sessions (id, user_id, sppg_id, expires_at) VALUES (?, ?, ?, ?)');
        $stmt->execute([$sessionId, $userId, $sppgId, $expiresAt]);
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
            'SELECT id, sppg_id, email, name, picture, google_id, role, created_at, updated_at FROM users WHERE id = ? LIMIT 1'
        );
        $stmt->execute([$id]);
        $row = $stmt->fetch();
        return $row ?: null;
    }

    public static function getUserFromSession(string $sessionId): ?array
    {
        $stmt = self::pdo()->prepare(
            'SELECT s.user_id, s.platform_admin_id, s.sppg_id,
                    u.id AS u_id, u.sppg_id AS u_sppg_id, u.email AS u_email, u.name AS u_name,
                    u.picture AS u_picture, u.google_id AS u_google_id, u.role AS u_role,
                    pa.id AS pa_id, pa.email AS pa_email, pa.name AS pa_name, pa.picture AS pa_picture,
                    pa.status AS pa_status
             FROM sessions s
             LEFT JOIN users u ON u.id = s.user_id
             LEFT JOIN platform_admins pa ON pa.id = s.platform_admin_id
             WHERE s.id = ? AND s.expires_at > NOW()
             LIMIT 1'
        );
        $stmt->execute([$sessionId]);
        $row = $stmt->fetch();
        if (!$row) {
            return null;
        }

        if (!empty($row['platform_admin_id'])) {
            if (($row['pa_status'] ?? '') !== 'active') {
                return null;
            }
            return PlatformAdminHelper::userFromPlatformAdmin([
                'id' => $row['pa_id'],
                'email' => $row['pa_email'],
                'name' => $row['pa_name'],
                'picture' => $row['pa_picture'],
            ]);
        }

        if (empty($row['user_id'])) {
            return null;
        }

        return [
            'id' => (int) $row['u_id'],
            'sppg_id' => (int) ($row['u_sppg_id'] ?? 0),
            'email' => $row['u_email'],
            'name' => $row['u_name'],
            'picture' => $row['u_picture'],
            'google_id' => $row['u_google_id'],
            'role' => $row['u_role'],
        ];
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
        return in_array($role, ['admin', 'admin_maker', 'admin_approve', 'super_admin'], true);
    }

    public static function isSuperAdminRole(?string $role): bool
    {
        return $role === 'super_admin';
    }

    /** Boleh mutasi data belanja/rekening (semua jenis admin). */
    public static function canManageData(?string $role): bool
    {
        return self::isAdminRole($role);
    }

    /** Boleh mengubah status BNI (bukan admin biasa). */
    public static function canChangeBniStatus(?string $role): bool
    {
        return in_array($role, ['admin_maker', 'admin_approve', 'super_admin'], true);
    }

    /** Hanya super_admin boleh ubah status Jatim/Cair. */
    public static function canChangeCairStatus(?string $role): bool
    {
        return self::isSuperAdminRole($role);
    }

    public static function bniStatusRank(string $status): int
    {
        return match ($status) {
            'belum' => 0,
            'maker' => 1,
            'approved' => 2,
            default => -1,
        };
    }

    public static function isBniLocked(?string $status): bool
    {
        return in_array($status, ['maker', 'approved'], true);
    }

    /**
     * Validasi transisi status BNI.
     * @return string|null pesan error, atau null jika OK
     */
    public static function bniStatusTransitionError(?string $role, string $from, string $to): ?string
    {
        if (!self::canChangeBniStatus($role)) {
            return 'Role admin biasa tidak dapat mengubah status BNI';
        }
        $fromRank = self::bniStatusRank($from);
        $toRank = self::bniStatusRank($to);
        if ($fromRank < 0 || $toRank < 0) {
            return 'Status tidak valid';
        }
        if ($toRank < $fromRank) {
            return 'Tidak dapat menurunkan status (maker/approved tidak bisa dikembalikan)';
        }
        if ($toRank === $fromRank) {
            return 'Status sudah sama';
        }
        if ($role === 'admin_maker') {
            if (!($from === 'belum' && $to === 'maker')) {
                return 'Admin maker hanya dapat mengubah Belum → Maker';
            }
        }
        if ($role === 'admin_approve') {
            if (!($from === 'maker' && $to === 'approved')) {
                return 'Admin approve hanya dapat mengubah Maker → Approved';
            }
        }
        return null;
    }

    public static function isPendingRole(?string $role): bool
    {
        return $role === 'pending';
    }

    /** Role yang boleh memakai fitur aplikasi (bukan menunggu grant). */
    public static function hasAppAccess(?string $role): bool
    {
        return in_array($role, ['super_admin', 'admin_approve', 'admin_maker', 'admin', 'user'], true);
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
        if (PlatformAdminHelper::isPlatformAdminRole($user['role'] ?? null)) {
            return PlatformAdminHelper::publicUser($user);
        }
        return [
            'id' => (int) $user['id'],
            'sppg_id' => (int) ($user['sppg_id'] ?? 0),
            'email' => $user['email'],
            'name' => $user['name'],
            'picture' => $user['picture'],
            'role' => $user['role'],
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
