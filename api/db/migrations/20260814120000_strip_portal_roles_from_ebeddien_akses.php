<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Role santri / wali_santri hanya untuk portal MyBeddien.
 * Bersihkan jejak eBeddien (fitur, legacy route, allowed_apps uwaba) agar tidak muncul di Role & Akses.
 */
final class StripPortalRolesFromEbeddienAkses extends AbstractMigration
{
    public function up(): void
    {
        if (!$this->hasTable('role')) {
            return;
        }

        if ($this->hasTable('role___fitur')) {
            $this->execute(
                "DELETE rf FROM `role___fitur` rf
                 INNER JOIN `role` r ON r.`id` = rf.`role_id`
                 WHERE r.`key` IN ('santri', 'wali_santri')"
            );
        }

        if ($this->hasTable('ebeddien_legacy_route_role')) {
            $this->execute(
                "DELETE FROM `ebeddien_legacy_route_role` WHERE `role_key` IN ('santri', 'wali_santri')"
            );
        }

        if ($this->table('role')->hasColumn('allowed_apps_json')) {
            $this->execute(
                "UPDATE `role`
                 SET `allowed_apps_json` = '[\"mybeddian\"]'
                 WHERE `key` IN ('santri', 'wali_santri')"
            );
        }
    }

    public function down(): void
    {
        // Tidak mengembalikan fitur/legacy; role portal tetap di tabel role.
    }
}
