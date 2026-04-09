<?php

declare(strict_types=1);

namespace App\Config;

/**
 * Role fallback route eBeddien — sumber utama tabel ebeddien_legacy_route_role (kunci: LegacyRouteRoleKeys).
 */
final class LegacyRouteRoles
{
    /**
     * @return list<string>
     */
    public static function forKey(string $legacyKey): array
    {
        return LegacyRouteRolesRepository::rolesForKey($legacyKey);
    }
}
