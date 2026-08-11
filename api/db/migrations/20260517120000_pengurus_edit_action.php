<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Aksi Pengurus: edit biodata pengurus dalam cakupan lembaga.
 */
final class PengurusEditAction extends AbstractMigration
{
    public function up(): void
    {
        $meta = '{"requiresRole":["super_admin","tarbiyah","admin_lembaga","admin_ugt","admin_uwaba"]}';
        $metaEsc = str_replace("'", "''", $meta);

        $this->execute(<<<SQL
INSERT IGNORE INTO `app___fitur` (`id_app`, `parent_id`, `type`, `code`, `label`, `path`, `icon_key`, `group_label`, `sort_order`, `meta_json`)
SELECT 1, pf.id, 'action', 'action.pengurus.edit', 'Pengurus · Edit', NULL, NULL, 'Lembaga', 12, '{$metaEsc}'
FROM `app___fitur` pf WHERE pf.`id_app` = 1 AND pf.`code` = 'menu.pengurus' LIMIT 1
SQL);

        $this->execute(<<<SQL
INSERT IGNORE INTO `role___fitur` (`role_id`, `fitur_id`)
SELECT rf.`role_id`, fedit.`id`
FROM `role___fitur` rf
INNER JOIN `app___fitur` ftambah ON ftambah.`id` = rf.`fitur_id` AND ftambah.`code` = 'action.pengurus.tambah'
INNER JOIN `app___fitur` fedit ON fedit.`code` = 'action.pengurus.edit' AND fedit.`id_app` = 1
SQL);
    }

    public function down(): void
    {
        $this->execute(
            "DELETE FROM `app___fitur` WHERE `id_app` = 1 AND `type` = 'action' AND `code` = 'action.pengurus.edit'"
        );
    }
}
