<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Hapus menu Setting → Import Users (sudah tidak dipakai).
 */
final class RemoveImportUsersMenu extends AbstractMigration
{
    public function up(): void
    {
        $this->execute(
            "DELETE rf FROM `role___fitur` rf
             INNER JOIN `app___fitur` f ON f.`id` = rf.`fitur_id`
             WHERE f.`id_app` = 1 AND f.`code` = 'menu.manage_users.import'"
        );
        $this->execute(
            "DELETE FROM `app___fitur`
             WHERE `id_app` = 1 AND `code` = 'menu.manage_users.import'"
        );
    }

    public function down(): void
    {
        $this->execute(
            "INSERT INTO `app___fitur`
                (`id_app`, `parent_id`, `type`, `code`, `label`, `path`, `icon_key`, `group_label`, `sort_order`, `meta_json`)
             SELECT 1, NULL, 'menu', 'menu.manage_users.import', 'Import Users', '/manage-users/import', 'upload', 'Setting', 55, NULL
             WHERE NOT EXISTS (
                SELECT 1 FROM `app___fitur`
                WHERE `id_app` = 1 AND `code` = 'menu.manage_users.import'
             )"
        );
        $this->execute(
            "INSERT IGNORE INTO `role___fitur` (`role_id`, `fitur_id`)
             SELECT r.id, f.id
             FROM `role` r
             JOIN `app___fitur` f ON f.`id_app` = 1 AND f.`code` = 'menu.manage_users.import'
             WHERE r.`key` = 'super_admin'"
        );
    }
}
