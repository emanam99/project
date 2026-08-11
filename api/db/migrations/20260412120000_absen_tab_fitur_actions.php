<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Halaman Absen: tab Riwayat / Absen / Ngabsen — kode terpisah per tab (Pengaturan → Fitur).
 * Penugasan: super_admin + semua role yang punya menu.absen.
 */
final class AbsenTabFiturActions extends AbstractMigration
{
    public function up(): void
    {
        $meta = '{"requiresRole":["super_admin","tarbiyah","admin_lembaga"]}';

        $this->execute(<<<SQL
INSERT IGNORE INTO `app___fitur` (`id_app`, `parent_id`, `type`, `code`, `label`, `path`, `icon_key`, `group_label`, `sort_order`, `meta_json`)
SELECT 1, pf.id, 'action', 'action.absen.tab.riwayat', 'Absen · Tab Riwayat', NULL, NULL, 'Lembaga', 10, '{$meta}'
FROM `app___fitur` pf WHERE pf.`id_app` = 1 AND pf.`code` = 'menu.absen' LIMIT 1
SQL);

        $this->execute(<<<SQL
INSERT IGNORE INTO `app___fitur` (`id_app`, `parent_id`, `type`, `code`, `label`, `path`, `icon_key`, `group_label`, `sort_order`, `meta_json`)
SELECT 1, pf.id, 'action', 'action.absen.tab.absen', 'Absen · Tab Absen', NULL, NULL, 'Lembaga', 20, '{$meta}'
FROM `app___fitur` pf WHERE pf.`id_app` = 1 AND pf.`code` = 'menu.absen' LIMIT 1
SQL);

        $this->execute(<<<SQL
INSERT IGNORE INTO `app___fitur` (`id_app`, `parent_id`, `type`, `code`, `label`, `path`, `icon_key`, `group_label`, `sort_order`, `meta_json`)
SELECT 1, pf.id, 'action', 'action.absen.tab.ngabsen', 'Absen · Tab Ngabsen', NULL, NULL, 'Lembaga', 30, '{$meta}'
FROM `app___fitur` pf WHERE pf.`id_app` = 1 AND pf.`code` = 'menu.absen' LIMIT 1
SQL);

        $this->execute(<<<'SQL'
INSERT IGNORE INTO `role___fitur` (`role_id`, `fitur_id`)
SELECT r.id, f.id FROM `role` r
CROSS JOIN `app___fitur` f
WHERE r.`key` = 'super_admin'
AND f.`id_app` = 1 AND f.`type` = 'action'
AND f.`code` IN ('action.absen.tab.riwayat', 'action.absen.tab.absen', 'action.absen.tab.ngabsen')
SQL);

        $this->execute(<<<'SQL'
INSERT IGNORE INTO `role___fitur` (`role_id`, `fitur_id`)
SELECT rf.`role_id`, fnew.`id`
FROM `role___fitur` rf
INNER JOIN `app___fitur` fold ON fold.`id` = rf.`fitur_id`
  AND fold.`code` = 'menu.absen' AND fold.`id_app` = 1
INNER JOIN `app___fitur` fnew ON fnew.`parent_id` = fold.`id`
  AND fnew.`id_app` = 1 AND fnew.`type` = 'action'
  AND fnew.`code` IN ('action.absen.tab.riwayat', 'action.absen.tab.absen', 'action.absen.tab.ngabsen')
SQL);
    }

    public function down(): void
    {
        $this->execute(
            "DELETE FROM `app___fitur` WHERE `id_app` = 1 AND `type` = 'action' AND `code` LIKE 'action.absen.tab.%'"
        );
    }
}
