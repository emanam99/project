<?php

declare(strict_types=1);

namespace App\Config;

use App\Database;
use PDO;

/**
 * Permission & allowed_apps efektif per role: kolom JSON di tabel `role` bila di-set, selain itu RoleConfig PHP.
 *
 * Cache static per proses PHP (mis. satu worker php-fpm). Setelah mengubah JSON lewat SQL langsung,
 * panggil clearCache() atau POST /api/settings/role-policy/clear-cache (super_admin); atau restart PHP.
 */
final class RolePolicyResolver
{
    /** @var array<string, array{permissions: ?array, apps: ?array}>|null */
    private static ?array $overrides = null;

    public static function clearCache(): void
    {
        self::$overrides = null;
    }

    private static function normalizeRoleKey(string $roleKey): string
    {
        return str_replace(' ', '_', strtolower(trim($roleKey)));
    }

    /**
     * @return array<string, array{permissions: ?array, apps: ?array}>
     */
    private static function loadOverrides(): array
    {
        if (self::$overrides !== null) {
            return self::$overrides;
        }
        self::$overrides = [];
        try {
            $pdo = Database::getInstance()->getConnection();
            $stmt = $pdo->query('SELECT `key`, `permissions_json`, `allowed_apps_json` FROM `role`');
            if ($stmt === false) {
                return self::$overrides;
            }
            while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
                $k = self::normalizeRoleKey((string) ($row['key'] ?? ''));
                if ($k === '') {
                    continue;
                }
                self::$overrides[$k] = [
                    'permissions' => self::decodeJsonArrayColumn($row['permissions_json'] ?? null),
                    'apps' => self::decodeJsonArrayColumn($row['allowed_apps_json'] ?? null),
                ];
            }
        } catch (\Throwable $e) {
            if (str_contains($e->getMessage(), 'permissions_json') || str_contains($e->getMessage(), 'allowed_apps_json')) {
                self::$overrides = [];

                return self::$overrides;
            }
            error_log('RolePolicyResolver::loadOverrides: ' . $e->getMessage());
        }

        return self::$overrides;
    }

    /**
     * null = kolom SQL NULL → pakai RoleConfig.
     *
     * @return ?list<string>
     */
    private static function decodeJsonArrayColumn(mixed $raw): ?array
    {
        if ($raw === null || $raw === '') {
            return null;
        }
        if (is_array($raw)) {
            $decoded = $raw;
        } else {
            $decoded = json_decode((string) $raw, true);
        }
        if (!is_array($decoded)) {
            return [];
        }
        $out = [];
        foreach ($decoded as $v) {
            if (is_string($v) && $v !== '') {
                $out[] = strtolower(trim($v));
            }
        }

        return array_values(array_unique($out));
    }

    /** @return ?array{permissions: ?array, apps: ?array} */
    private static function rowFor(string $roleKey): ?array
    {
        $k = self::normalizeRoleKey($roleKey);
        $map = self::loadOverrides();

        return $map[$k] ?? null;
    }

    public static function permissionsStoredInDb(string $roleKey): bool
    {
        $row = self::rowFor($roleKey);

        return $row !== null && $row['permissions'] !== null;
    }

    public static function allowedAppsStoredInDb(string $roleKey): bool
    {
        $row = self::rowFor($roleKey);

        return $row !== null && $row['apps'] !== null;
    }

    /** @return list<string> */
    public static function getPermissions(string $roleKey): array
    {
        $row = self::rowFor($roleKey);
        if ($row !== null && $row['permissions'] !== null) {
            return $row['permissions'];
        }

        return RoleConfig::getPermissions($roleKey);
    }

    /** @return list<string> */
    public static function getAllowedApps(string $roleKey): array
    {
        $row = self::rowFor($roleKey);
        if ($row !== null && $row['apps'] !== null) {
            return $row['apps'];
        }

        return RoleConfig::getAllowedApps($roleKey);
    }

    public static function hasPermission(string $roleKey, string $permission): bool
    {
        $permission = strtolower(trim($permission));
        if ($permission === '') {
            return false;
        }

        return in_array($permission, self::getPermissions($roleKey), true);
    }

    public static function canAccessApp(string $roleKey, string $appKey): bool
    {
        $appKey = strtolower(trim($appKey));
        if ($appKey === '') {
            return false;
        }

        return in_array($appKey, self::getAllowedApps($roleKey), true);
    }
}
