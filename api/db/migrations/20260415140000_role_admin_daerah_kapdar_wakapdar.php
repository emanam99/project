<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Role domisili/asrama: admin_daerah, kapdar, wakapdar.
 * Selaras RoleConfig + LegacyRouteRoleDefinitions; fallback route diisi ke ebeddien_legacy_route_role.
 */
final class RoleAdminDaerahKapdarWakapdar extends AbstractMigration
{
    public function up(): void
    {
        $conn = $this->getAdapter()->getConnection();

        $roles = [
            [29, 'admin_daerah', 'Admin Daerah'],
            [30, 'kapdar', 'Kapdar'],
            [31, 'wakapdar', 'Wakapdar'],
        ];
        foreach ($roles as $r) {
            $this->execute(sprintf(
                'INSERT IGNORE INTO `role` (`id`, `key`, `label`) VALUES (%d, %s, %s)',
                $r[0],
                $conn->quote($r[1]),
                $conn->quote($r[2])
            ));
        }

        $legacyKeys = [
            'tarbiyahSuperSelectors',
            'lembagaGetSelectors',
            'alamatListSelectors',
            'pengurusListSelectors',
        ];
        $roleKeys = ['admin_daerah', 'kapdar', 'wakapdar'];
        $sortBase = 10;
        foreach ($legacyKeys as $lk) {
            $i = 0;
            foreach ($roleKeys as $rk) {
                $this->execute(sprintf(
                    'INSERT IGNORE INTO `ebeddien_legacy_route_role` (`legacy_key`, `role_key`, `sort_order`) VALUES (%s, %s, %d)',
                    $conn->quote($lk),
                    $conn->quote($rk),
                    $sortBase + $i
                ));
                ++$i;
            }
        }
    }

    public function down(): void
    {
        $conn = $this->getAdapter()->getConnection();
        $roleKeys = ['admin_daerah', 'kapdar', 'wakapdar'];
        foreach ($roleKeys as $rk) {
            $this->execute(sprintf(
                'DELETE FROM `ebeddien_legacy_route_role` WHERE `role_key` = %s',
                $conn->quote($rk)
            ));
        }
        $this->execute(
            "DELETE FROM `role` WHERE `id` IN (29, 30, 31) AND `key` IN ('admin_daerah', 'kapdar', 'wakapdar')"
        );
    }
}
