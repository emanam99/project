<?php

declare(strict_types=1);

use App\Config\EbeddienFiturAccessDefinitions;
use App\Config\LegacyRouteRoleDefinitions;
use App\Config\LegacyRouteRoleKeys;
use Phinx\Migration\AbstractMigration;

/**
 * GET /api/santri: petugas/admin ijin boleh baca indeks santri (SearchOffcanvas Data Ijin).
 * POST /api/santri tetap memakai santriCrudApiSelectors (tanpa menu ijin).
 */
final class SantriListApiIjinSelectors extends AbstractMigration
{
    public function up(): void
    {
        require_once dirname(__DIR__, 2) . '/vendor/autoload.php';

        $codes = EbeddienFiturAccessDefinitions::santriListApiSelectors();
        $json = json_encode(array_values($codes), JSON_UNESCAPED_UNICODE);
        $conn = $this->getAdapter()->getConnection();
        $quoted = $conn->quote($json);

        $this->execute(
            "INSERT INTO `ebeddien_fitur_selector` (`selector_key`, `codes_json`)
             VALUES ('santriListApiSelectors', {$quoted})
             ON DUPLICATE KEY UPDATE `codes_json` = VALUES(`codes_json`)"
        );

        $legacyKey = LegacyRouteRoleKeys::SANTRI_LIST_API_SELECTORS;
        $roles = LegacyRouteRoleDefinitions::rolesForKey($legacyKey);
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
        $this->execute("DELETE FROM `ebeddien_fitur_selector` WHERE `selector_key` = 'santriListApiSelectors'");
        $this->execute("DELETE FROM `ebeddien_legacy_route_role` WHERE `legacy_key` = 'santriListApiSelectors'");
    }
}
