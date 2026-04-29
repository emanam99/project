<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Aksi Pengurus: tambah manual dan import excel.
 */
final class PengurusTambahImportActions extends AbstractMigration
{
    public function up(): void
    {
        $meta = '{"requiresRole":["super_admin","tarbiyah","admin_lembaga","admin_ugt","admin_uwaba"]}';
        $metaEsc = str_replace("'", "''", $meta);

        $this->execute(<<<SQL
INSERT IGNORE INTO `app___fitur` (`id_app`, `parent_id`, `type`, `code`, `label`, `path`, `icon_key`, `group_label`, `sort_order`, `meta_json`)
SELECT 1, pf.id, 'action', 'action.pengurus.tambah', 'Pengurus · Tambah', NULL, NULL, 'Lembaga', 10, '{$metaEsc}'
FROM `app___fitur` pf WHERE pf.`id_app` = 1 AND pf.`code` = 'menu.pengurus' LIMIT 1
SQL);

        $this->execute(<<<SQL
INSERT IGNORE INTO `app___fitur` (`id_app`, `parent_id`, `type`, `code`, `label`, `path`, `icon_key`, `group_label`, `sort_order`, `meta_json`)
SELECT 1, pf.id, 'action', 'action.pengurus.import', 'Pengurus · Import', NULL, NULL, 'Lembaga', 11, '{$metaEsc}'
FROM `app___fitur` pf WHERE pf.`id_app` = 1 AND pf.`code` = 'menu.pengurus' LIMIT 1
SQL);
    }

    public function down(): void
    {
        $this->execute(
            "DELETE FROM `app___fitur` WHERE `id_app` = 1 AND `type` = 'action' AND `code` IN ('action.pengurus.tambah','action.pengurus.import')"
        );
    }
}
