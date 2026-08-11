<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Grup Super Admin: urutan menu Dashboard sebelum Online (sidebar & nav pakai sort_order).
 */
final class SuperAdminMenuDashboardBeforeOnline extends AbstractMigration
{
    public function up(): void
    {
        $this->execute("
            UPDATE `app___fitur` SET `sort_order` = 70
            WHERE `id_app` = 1 AND `type` = 'menu' AND `path` = '/super-admin/dashboard'
        ");
        $this->execute("
            UPDATE `app___fitur` SET `sort_order` = 80
            WHERE `id_app` = 1 AND `type` = 'menu' AND `path` = '/super-admin/online'
        ");
        $this->execute("
            UPDATE `app___fitur` SET `sort_order` = 90
            WHERE `id_app` = 1 AND `type` = 'menu' AND `path` = '/super-admin/install-activity'
        ");
    }

    public function down(): void
    {
        $this->execute("
            UPDATE `app___fitur` SET `sort_order` = 80
            WHERE `id_app` = 1 AND `type` = 'menu' AND `path` = '/super-admin/dashboard'
        ");
        $this->execute("
            UPDATE `app___fitur` SET `sort_order` = 70
            WHERE `id_app` = 1 AND `type` = 'menu' AND `path` = '/super-admin/online'
        ");
        $this->execute("
            UPDATE `app___fitur` SET `sort_order` = 65
            WHERE `id_app` = 1 AND `type` = 'menu' AND `path` = '/super-admin/install-activity'
        ");
    }
}
