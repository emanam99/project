<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

final class SuperAdminOnlineDashboardSplit extends AbstractMigration
{
    public function up(): void
    {
        // Ubah menu lama /super-admin/dashboard menjadi /super-admin/online.
        $this->execute("
            UPDATE `app___fitur`
            SET
                `code` = 'menu.super_admin.online',
                `label` = 'Online',
                `path` = '/super-admin/online',
                `icon_key` = 'usersGroup',
                `group_label` = 'Super Admin'
            WHERE `id_app` = 1
              AND `code` = 'menu.super_admin.dashboard'
        ");

        // Tambah menu dashboard monitoring baru (analitik).
        $this->execute("
            INSERT INTO `app___fitur`
                (`id_app`, `parent_id`, `type`, `code`, `label`, `path`, `icon_key`, `group_label`, `sort_order`, `meta_json`)
            SELECT 1, NULL, 'menu', 'menu.super_admin.dashboard', 'Dashboard', '/super-admin/dashboard', 'chartBar', 'Super Admin', 66, NULL
            WHERE NOT EXISTS (
                SELECT 1 FROM `app___fitur`
                WHERE `id_app` = 1 AND `code` = 'menu.super_admin.dashboard'
            )
        ");

        // Pastikan super_admin punya akses ke menu dashboard baru.
        $this->execute("
            INSERT IGNORE INTO `role___fitur` (`role_id`, `fitur_id`)
            SELECT r.id, f.id
            FROM `role` r
            JOIN `app___fitur` f
              ON f.id_app = 1 AND f.code IN ('menu.super_admin.dashboard', 'menu.super_admin.online')
            WHERE r.`key` = 'super_admin'
        ");
    }

    public function down(): void
    {
        $this->execute("
            DELETE rf FROM `role___fitur` rf
            JOIN `app___fitur` f ON f.id = rf.fitur_id
            WHERE f.id_app = 1 AND f.code = 'menu.super_admin.dashboard' AND f.path = '/super-admin/dashboard'
        ");
        $this->execute("
            DELETE FROM `app___fitur`
            WHERE `id_app` = 1 AND `code` = 'menu.super_admin.dashboard' AND `path` = '/super-admin/dashboard'
        ");
        $this->execute("
            UPDATE `app___fitur`
            SET
                `code` = 'menu.super_admin.dashboard',
                `label` = 'Online',
                `path` = '/super-admin/dashboard'
            WHERE `id_app` = 1
              AND `code` = 'menu.super_admin.online'
        ");
    }
}
