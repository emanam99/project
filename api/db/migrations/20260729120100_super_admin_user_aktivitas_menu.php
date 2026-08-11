<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Menu Super Admin → Aktivitas User
 */
final class SuperAdminUserAktivitasMenu extends AbstractMigration
{
    public function up(): void
    {
        $this->execute(
            "INSERT INTO `app___fitur`
                (`id_app`, `parent_id`, `type`, `code`, `label`, `path`, `icon_key`, `group_label`, `sort_order`, `meta_json`)
             SELECT 1, NULL, 'menu', 'menu.super_admin.user_aktivitas', 'Aktivitas User', '/super-admin/user-aktivitas', 'activity', 'Super Admin', 45, NULL
             WHERE NOT EXISTS (
                SELECT 1 FROM `app___fitur`
                WHERE `id_app` = 1 AND `code` = 'menu.super_admin.user_aktivitas'
             )"
        );

        $this->execute(
            "INSERT IGNORE INTO `role___fitur` (`role_id`, `fitur_id`)
             SELECT r.id, f.id
             FROM `role` r
             JOIN `app___fitur` f ON f.id_app = 1 AND f.code = 'menu.super_admin.user_aktivitas'
             WHERE r.`key` = 'super_admin'"
        );

        // Pastikan selector superAdminMenus / installActivity memuat kode baru lewat seed definitions;
        // tambahkan ke codes_json install + super jika ada.
        $row = $this->fetchRow("SELECT `codes_json` FROM `ebeddien_fitur_selector` WHERE `selector_key` = 'superAdminMenus' LIMIT 1");
        if ($row && !empty($row['codes_json'])) {
            $codes = json_decode((string) $row['codes_json'], true);
            if (is_array($codes) && !in_array('menu.super_admin.user_aktivitas', $codes, true)) {
                $codes[] = 'menu.super_admin.user_aktivitas';
                $json = json_encode(array_values($codes), JSON_UNESCAPED_UNICODE);
                $this->execute(
                    'UPDATE `ebeddien_fitur_selector` SET `codes_json` = '
                    . $this->getAdapter()->getConnection()->quote($json)
                    . " WHERE `selector_key` = 'superAdminMenus'"
                );
            }
        }
    }

    public function down(): void
    {
        $this->execute(
            "DELETE rf FROM `role___fitur` rf
             INNER JOIN `app___fitur` f ON f.id = rf.fitur_id
             WHERE f.`code` = 'menu.super_admin.user_aktivitas' AND f.`id_app` = 1"
        );
        $this->execute(
            "DELETE FROM `app___fitur` WHERE `id_app` = 1 AND `code` = 'menu.super_admin.user_aktivitas'"
        );
    }
}
