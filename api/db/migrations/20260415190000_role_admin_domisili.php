<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Role Admin Domisili — penugasan menu/fitur lewat Role & Akses (role___fitur).
 * Fallback legacy sama admin_daerah/kapdar/wakapdar untuk grup tarbiyah/domisili.
 */
final class RoleAdminDomisili extends AbstractMigration
{
    public function up(): void
    {
        $conn = $this->getAdapter()->getConnection();

        $this->execute(sprintf(
            'INSERT IGNORE INTO `role` (`id`, `key`, `label`) VALUES (32, %s, %s)',
            $conn->quote('admin_domisili'),
            $conn->quote('Admin Domisili')
        ));

        $legacyKeys = [
            'tarbiyahSuperSelectors',
            'lembagaGetSelectors',
            'alamatListSelectors',
            'pengurusListSelectors',
        ];
        $sortBase = 40;
        $i = 0;
        foreach ($legacyKeys as $lk) {
            $this->execute(sprintf(
                'INSERT IGNORE INTO `ebeddien_legacy_route_role` (`legacy_key`, `role_key`, `sort_order`) VALUES (%s, %s, %d)',
                $conn->quote($lk),
                $conn->quote('admin_domisili'),
                $sortBase + $i
            ));
            ++$i;
        }
    }

    public function down(): void
    {
        $conn = $this->getAdapter()->getConnection();
        $this->execute(sprintf(
            'DELETE FROM `ebeddien_legacy_route_role` WHERE `role_key` = %s',
            $conn->quote('admin_domisili')
        ));
        $this->execute(
            "DELETE FROM `role` WHERE `id` = 32 AND `key` = 'admin_domisili'"
        );
    }
}
