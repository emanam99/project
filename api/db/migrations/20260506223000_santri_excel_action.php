<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Tambah aksi fitur untuk halaman editor santri berbasis spreadsheet.
 */
final class SantriExcelAction extends AbstractMigration
{
    public function up(): void
    {
        $meta = '{"requiresRole":["super_admin","tarbiyah","admin_lembaga"]}';
        $metaEsc = str_replace("'", "''", $meta);
        $this->execute(<<<SQL
INSERT IGNORE INTO `app___fitur` (`id_app`, `parent_id`, `type`, `code`, `label`, `path`, `icon_key`, `group_label`, `sort_order`, `meta_json`)
SELECT 1, pf.id, 'action', 'action.santri.excel', 'Santri · Editor spreadsheet', '/santri/excel-editor', NULL, 'Lembaga', 20, '{$metaEsc}'
FROM `app___fitur` pf WHERE pf.`id_app` = 1 AND pf.`code` = 'menu.santri' LIMIT 1
SQL);

        $this->execute(<<<SQL
INSERT IGNORE INTO `role___fitur` (`role_id`, `fitur_id`)
SELECT r.id, f.id FROM `role` r
CROSS JOIN `app___fitur` f
WHERE r.`key` = 'super_admin'
AND f.`id_app` = 1 AND f.`type` = 'action' AND f.`code` = 'action.santri.excel'
SQL);
    }

    public function down(): void
    {
        $this->execute("DELETE FROM `app___fitur` WHERE `id_app` = 1 AND `type` = 'action' AND `code` = 'action.santri.excel'");
    }
}

