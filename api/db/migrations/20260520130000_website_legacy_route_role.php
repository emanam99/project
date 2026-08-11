<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Fallback middleware website admin — selaras LegacyRouteRoleDefinitions::WEBSITE_ADMIN_SELECTORS.
 */
final class WebsiteLegacyRouteRole extends AbstractMigration
{
    public function up(): void
    {
        $legacyKey = 'websiteAdminSelectors';
        $roles = ['super_admin', 'admin_web', 'petugas_web', 'conten_web'];
        $conn = $this->getAdapter()->getConnection();
        $i = 0;
        foreach ($roles as $rk) {
            $lk = $conn->quote($legacyKey);
            $rkv = $conn->quote($rk);
            $this->execute(sprintf(
                'INSERT IGNORE INTO `ebeddien_legacy_route_role` (`legacy_key`, `role_key`, `sort_order`) VALUES (%s, %s, %d)',
                $lk,
                $rkv,
                $i
            ));
            $i++;
        }
    }

    public function down(): void
    {
        $this->execute("DELETE FROM `ebeddien_legacy_route_role` WHERE `legacy_key` = 'websiteAdminSelectors'");
    }
}
