<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Tab halaman Absen: Pengaturan (titik lokasi, jadwal default) — terpisah dari tab Absen (GPS mandiri).
 */
final class AbsenTabPengaturan extends AbstractMigration
{
    public function up(): void
    {
        $meta = '{"requiresRole":["super_admin","tarbiyah","admin_lembaga"]}';

        $this->execute(<<<SQL
INSERT IGNORE INTO `app___fitur` (`id_app`, `parent_id`, `type`, `code`, `label`, `path`, `icon_key`, `group_label`, `sort_order`, `meta_json`)
SELECT 1, pf.id, 'action', 'action.absen.tab.pengaturan', 'Absen · Tab Pengaturan', NULL, NULL, 'Lembaga', 25, '{$meta}'
FROM `app___fitur` pf WHERE pf.`id_app` = 1 AND pf.`code` = 'menu.absen' LIMIT 1
SQL);

        $this->execute(<<<'SQL'
INSERT IGNORE INTO `role___fitur` (`role_id`, `fitur_id`)
SELECT r.id, f.id FROM `role` r
CROSS JOIN `app___fitur` f
WHERE r.`key` = 'super_admin'
AND f.`id_app` = 1 AND f.`type` = 'action' AND f.`code` = 'action.absen.tab.pengaturan'
SQL);

        $this->execute(<<<'SQL'
INSERT IGNORE INTO `role___fitur` (`role_id`, `fitur_id`)
SELECT rf.`role_id`, fnew.`id`
FROM `role___fitur` rf
INNER JOIN `app___fitur` fold ON fold.`id` = rf.`fitur_id`
  AND fold.`code` = 'action.absen.tab.absen' AND fold.`id_app` = 1
INNER JOIN `app___fitur` fnew ON fnew.`code` = 'action.absen.tab.pengaturan' AND fnew.`id_app` = 1
SQL);

        $this->execute(<<<'SQL'
INSERT IGNORE INTO `role___fitur` (`role_id`, `fitur_id`)
SELECT DISTINCT rf.`role_id`, fnew.`id`
FROM `role___fitur` rf
INNER JOIN `app___fitur` fold ON fold.`id` = rf.`fitur_id`
  AND fold.`id_app` = 1 AND fold.`type` = 'action' AND fold.`code` LIKE 'action.absen.lokasi.%'
INNER JOIN `app___fitur` fnew ON fnew.`code` = 'action.absen.tab.pengaturan' AND fnew.`id_app` = 1
SQL);
    }

    public function down(): void
    {
        $this->execute(
            "DELETE FROM `app___fitur` WHERE `id_app` = 1 AND `type` = 'action' AND `code` = 'action.absen.tab.pengaturan'"
        );
    }
}
