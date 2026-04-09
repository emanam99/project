<?php

declare(strict_types=1);

namespace App\Config;

use App\Database;
use PDO;

/**
 * Memuat daftar role fallback untuk EbeddienFiturMiddleware dari tabel ebeddien_legacy_route_role.
 * Cache per proses PHP; fallback ke LegacyRouteRoleDefinitions jika tabel kosong / kunci tidak ada.
 */
final class LegacyRouteRolesRepository
{
    /** @var array<string, list<string>>|null */
    private static ?array $fromDb = null;

    public static function clearCache(): void
    {
        self::$fromDb = null;
    }

    /**
     * @return list<string>
     */
    public static function rolesForKey(string $legacyKey): array
    {
        $map = self::loadMap();
        if ($legacyKey !== '' && isset($map[$legacyKey]) && $map[$legacyKey] !== []) {
            return $map[$legacyKey];
        }

        return LegacyRouteRoleDefinitions::rolesForKey($legacyKey);
    }

    /**
     * @return array<string, list<string>>
     */
    private static function loadMap(): array
    {
        if (self::$fromDb !== null) {
            return self::$fromDb;
        }
        self::$fromDb = [];
        try {
            $pdo = Database::getInstance()->getConnection();
            $stmt = $pdo->query(
                'SELECT `legacy_key`, `role_key` FROM `ebeddien_legacy_route_role` ORDER BY `legacy_key`, `sort_order`, `role_key`'
            );
            if ($stmt === false) {
                return self::$fromDb;
            }
            while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
                $lk = (string) ($row['legacy_key'] ?? '');
                $rk = (string) ($row['role_key'] ?? '');
                if ($lk === '' || $rk === '') {
                    continue;
                }
                if (!isset(self::$fromDb[$lk])) {
                    self::$fromDb[$lk] = [];
                }
                self::$fromDb[$lk][] = $rk;
            }
        } catch (\Throwable $e) {
            error_log('LegacyRouteRolesRepository::loadMap: ' . $e->getMessage());
        }

        return self::$fromDb;
    }
}
