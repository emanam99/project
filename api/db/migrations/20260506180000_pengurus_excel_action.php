<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Aksi fitur editor spreadsheet pengurus (selaras action.santri.excel).
 */
final class PengurusExcelAction extends AbstractMigration
{
    public function up(): void
    {
        $meta = '{"requiresRole":["super_admin","tarbiyah","admin_lembaga"]}';
        $metaEsc = str_replace("'", "''", $meta);
        $this->execute(<<<SQL
INSERT IGNORE INTO `app___fitur` (`id_app`, `parent_id`, `type`, `code`, `label`, `path`, `icon_key`, `group_label`, `sort_order`, `meta_json`)
SELECT 1, pf.id, 'action', 'action.pengurus.excel', 'Pengurus · Editor spreadsheet', '/pengurus/excel-editor', NULL, 'Lembaga', 21, '{$metaEsc}'
FROM `app___fitur` pf WHERE pf.`id_app` = 1 AND pf.`code` = 'menu.pengurus' LIMIT 1
SQL);

        $this->execute(<<<SQL
INSERT IGNORE INTO `role___fitur` (`role_id`, `fitur_id`)
SELECT r.id, f.id FROM `role` r
CROSS JOIN `app___fitur` f
WHERE r.`key` = 'super_admin'
AND f.`id_app` = 1 AND f.`type` = 'action' AND f.`code` = 'action.pengurus.excel'
SQL);
    }

    public function down(): void
    {
        $this->execute("DELETE FROM `app___fitur` WHERE `id_app` = 1 AND `type` = 'action' AND `code` = 'action.pengurus.excel'");
    }
}
