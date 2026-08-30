<?php

namespace App\Helpers;

use App\Config\Database;
use PDO;

class PlatformAdminHelper
{
    public static function pdo(): PDO
    {
        return Database::getInstance();
    }

    public static function platformAdminHost(): ?string
    {
        $h = strtolower(trim((string) ($_ENV['PLATFORM_ADMIN_HOST'] ?? '')));
        return $h !== '' ? $h : null;
    }

    public static function isPlatformAdminHost(?string $host = null): bool
    {
        $expected = self::platformAdminHost();
        if ($expected === null) {
            return false;
        }
        $host = strtolower(trim((string) ($host ?? TenantHostHelper::currentHost())));
        return $host === $expected;
    }

    public static function isPlatformAdminRole(?string $role): bool
    {
        return $role === 'platform_admin';
    }

    public static function findByEmail(string $email): ?array
    {
        $stmt = self::pdo()->prepare('SELECT * FROM platform_admins WHERE email = ? LIMIT 1');
        $stmt->execute([strtolower(trim($email))]);
        $row = $stmt->fetch();
        return $row ?: null;
    }

    public static function findById(int $id): ?array
    {
        $stmt = self::pdo()->prepare('SELECT * FROM platform_admins WHERE id = ? LIMIT 1');
        $stmt->execute([$id]);
        $row = $stmt->fetch();
        return $row ?: null;
    }

    public static function upsertFromGoogle(array $profile): array
    {
        $email = strtolower(trim($profile['email']));
        $existing = self::findByEmail($email);
        if (!$existing) {
            throw new \RuntimeException('Email tidak terdaftar sebagai admin platform');
        }
        if (($existing['status'] ?? '') !== 'active') {
            throw new \RuntimeException('Akun admin platform dinonaktifkan');
        }

        $upd = self::pdo()->prepare(
            'UPDATE platform_admins SET name = ?, picture = ?, google_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
        );
        $upd->execute([
            $profile['name'],
            $profile['picture'],
            $profile['googleId'],
            (int) $existing['id'],
        ]);

        return self::findById((int) $existing['id']) ?? $existing;
    }

    public static function createPlatformSession(int $platformAdminId): string
    {
        $sessionId = bin2hex(random_bytes(32));
        $expiresAt = (new \DateTimeImmutable('+' . AuthHelper::SESSION_DAYS . ' days'))->format('Y-m-d H:i:s');
        $stmt = self::pdo()->prepare(
            'INSERT INTO sessions (id, user_id, platform_admin_id, sppg_id, expires_at) VALUES (?, NULL, ?, NULL, ?)'
        );
        $stmt->execute([$sessionId, $platformAdminId, $expiresAt]);
        return $sessionId;
    }

    public static function userFromPlatformAdmin(array $admin): array
    {
        return [
            'id' => (int) $admin['id'],
            'sppg_id' => null,
            'email' => $admin['email'],
            'name' => $admin['name'],
            'picture' => $admin['picture'],
            'role' => 'platform_admin',
        ];
    }

    public static function publicUser(array $user): array
    {
        return [
            'id' => (int) $user['id'],
            'email' => $user['email'],
            'name' => $user['name'],
            'picture' => $user['picture'],
            'role' => 'platform_admin',
        ];
    }
}
