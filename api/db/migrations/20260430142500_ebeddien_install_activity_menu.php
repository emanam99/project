<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

final class EbeddienInstallActivityMenu extends AbstractMigration
{
    public function up(): void
    {
        // Pastikan menu "Install Activity" tersedia di app___fitur (app eBeddien id=1).
        $this->execute("
            INSERT INTO `app___fitur`
                (`id_app`, `parent_id`, `type`, `code`, `label`, `path`, `icon_key`, `group_label`, `sort_order`, `meta_json`)
            SELECT 1, NULL, 'menu', 'menu.super_admin.install_activity', 'Install Activity', '/super-admin/install-activity', 'chartBar', 'Super Admin', 65, NULL
            WHERE NOT EXISTS (
                SELECT 1 FROM `app___fitur`
                WHERE `id_app` = 1 AND `code` = 'menu.super_admin.install_activity'
            )
        ");

        // Beri akses default ke super_admin.
        $this->execute("
            INSERT IGNORE INTO `role___fitur` (`role_id`, `fitur_id`)
            SELECT r.id, f.id
            FROM `role` r
            JOIN `app___fitur` f
              ON f.id_app = 1 AND f.code = 'menu.super_admin.install_activity'
            WHERE r.`key` = 'super_admin'
        ");

        // Sinkron selector middleware dari fallback definitions agar endpoint bisa dibuka role yang diberi fitur ini.
        $this->execute("
            INSERT INTO `ebeddien_fitur_selector` (`selector_key`, `codes_json`)
            VALUES (
                'installActivitySelectors',
                JSON_ARRAY('menu.super_admin.dashboard', 'menu.dashboard_umum', 'menu.manage_users', 'menu.manage_users.import', 'menu.settings.tahun_ajaran', 'menu.settings.role_akses', 'menu.settings.fitur', 'menu.settings.notifikasi', 'menu.settings.watzap', 'menu.settings.evolution_wa', 'menu.settings.wa_interactive_menu', 'menu.manage_uploads', 'menu.whatsapp_koneksi', 'menu.juara.data_juara', 'menu.super_admin.install_activity')
            )
            ON DUPLICATE KEY UPDATE `codes_json` = VALUES(`codes_json`)
        ");
    }

    public function down(): void
    {
        $this->execute("
            DELETE rf FROM `role___fitur` rf
            JOIN `app___fitur` f ON f.id = rf.fitur_id
            WHERE f.id_app = 1 AND f.code = 'menu.super_admin.install_activity'
        ");
        $this->execute("DELETE FROM `app___fitur` WHERE `id_app` = 1 AND `code` = 'menu.super_admin.install_activity'");
        $this->execute("DELETE FROM `ebeddien_fitur_selector` WHERE `selector_key` = 'installActivitySelectors'");
    }
}
