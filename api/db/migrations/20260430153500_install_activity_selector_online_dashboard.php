<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

final class InstallActivitySelectorOnlineDashboard extends AbstractMigration
{
    public function up(): void
    {
        $this->execute("
            INSERT INTO `ebeddien_fitur_selector` (`selector_key`, `codes_json`)
            VALUES (
                'installActivitySelectors',
                JSON_ARRAY('menu.super_admin.online', 'menu.super_admin.dashboard', 'menu.dashboard_umum', 'menu.manage_users', 'menu.manage_users.import', 'menu.settings.tahun_ajaran', 'menu.settings.role_akses', 'menu.settings.fitur', 'menu.settings.notifikasi', 'menu.settings.watzap', 'menu.settings.evolution_wa', 'menu.settings.wa_interactive_menu', 'menu.manage_uploads', 'menu.whatsapp_koneksi', 'menu.juara.data_juara', 'menu.super_admin.install_activity')
            )
            ON DUPLICATE KEY UPDATE `codes_json` = VALUES(`codes_json`)
        ");
    }

    public function down(): void
    {
        $this->execute("
            INSERT INTO `ebeddien_fitur_selector` (`selector_key`, `codes_json`)
            VALUES (
                'installActivitySelectors',
                JSON_ARRAY('menu.super_admin.dashboard', 'menu.dashboard_umum', 'menu.manage_users', 'menu.manage_users.import', 'menu.settings.tahun_ajaran', 'menu.settings.role_akses', 'menu.settings.fitur', 'menu.settings.notifikasi', 'menu.settings.watzap', 'menu.settings.evolution_wa', 'menu.settings.wa_interactive_menu', 'menu.manage_uploads', 'menu.whatsapp_koneksi', 'menu.juara.data_juara', 'menu.super_admin.install_activity')
            )
            ON DUPLICATE KEY UPDATE `codes_json` = VALUES(`codes_json`)
        ");
    }
}
