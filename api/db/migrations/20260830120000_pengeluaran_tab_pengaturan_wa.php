<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Tab Pengaturan di halaman Pengeluaran: pilih provider WA khusus notifikasi pengeluaran.
 * Penugasan default: super_admin + salin dari role yang sudah punya action.pengeluaran.tab.rencana.
 */
final class PengeluaranTabPengaturanWa extends AbstractMigration
{
    public function up(): void
    {
        $meta = '{"requiresRole":["admin_uwaba","super_admin"]}';

        $this->execute(<<<SQL
INSERT IGNORE INTO `app___fitur` (`id_app`, `parent_id`, `type`, `code`, `label`, `path`, `icon_key`, `group_label`, `sort_order`, `meta_json`)
SELECT 1, pf.id, 'action', 'action.pengeluaran.tab.pengaturan', 'Pengeluaran · Tab Pengaturan', NULL, NULL, 'Keuangan', 35, '{$meta}'
FROM `app___fitur` pf WHERE pf.`id_app` = 1 AND pf.`code` = 'menu.pengeluaran' LIMIT 1
SQL);

        $this->execute(<<<'SQL'
INSERT IGNORE INTO `role___fitur` (`role_id`, `fitur_id`)
SELECT r.id, f.id FROM `role` r
CROSS JOIN `app___fitur` f
WHERE r.`key` = 'super_admin'
AND f.`id_app` = 1 AND f.`type` = 'action'
AND f.`code` = 'action.pengeluaran.tab.pengaturan'
SQL);

        $this->execute(<<<'SQL'
INSERT IGNORE INTO `role___fitur` (`role_id`, `fitur_id`)
SELECT DISTINCT rf.role_id, fnew.id
FROM `role___fitur` rf
INNER JOIN `app___fitur` fsrc ON fsrc.id = rf.fitur_id
    AND fsrc.`id_app` = 1 AND fsrc.`type` = 'action'
    AND fsrc.`code` = 'action.pengeluaran.tab.rencana'
INNER JOIN `app___fitur` fnew ON fnew.`id_app` = 1 AND fnew.`type` = 'action'
    AND fnew.`code` = 'action.pengeluaran.tab.pengaturan'
SQL);
    }

    public function down(): void
    {
        $this->execute(
            "DELETE FROM `app___fitur` WHERE `id_app` = 1 AND `type` = 'action' AND `code` = 'action.pengeluaran.tab.pengaturan'"
        );
    }
}
