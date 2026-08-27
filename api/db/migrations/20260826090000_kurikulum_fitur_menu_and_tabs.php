<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Menu Kurikulum (/kurikulum) menggantikan Kitab & Mapel di sidebar.
 * menu.kitab / menu.mapel disembunyikan dari nav (kode tetap untuk API).
 * Role yang punya kitab/mapel mendapat menu.kurikulum + tab yang sesuai.
 */
final class KurikulumFiturMenuAndTabs extends AbstractMigration
{
    public function up(): void
    {
        $this->execute(<<<'SQL'
INSERT IGNORE INTO `app___fitur` (`id_app`, `parent_id`, `type`, `code`, `label`, `path`, `icon_key`, `group_label`, `sort_order`, `meta_json`)
SELECT 1, NULL, 'menu', 'menu.kurikulum', 'Kurikulum', '/kurikulum', 'mapel', 'Lembaga',
  COALESCE((SELECT k.`sort_order` FROM `app___fitur` k WHERE k.`id_app` = 1 AND k.`code` = 'menu.kitab' LIMIT 1), 2400),
  NULL
FROM DUAL
SQL);

        $this->execute(<<<'SQL'
UPDATE `app___fitur`
SET `label` = 'Kurikulum', `path` = '/kurikulum', `icon_key` = 'mapel', `group_label` = 'Lembaga'
WHERE `id_app` = 1 AND `type` = 'menu' AND `code` = 'menu.kurikulum'
SQL);

        $this->execute(<<<'SQL'
UPDATE `app___fitur`
SET `meta_json` = '{"hideFromNav":true}'
WHERE `id_app` = 1 AND `type` = 'menu' AND `code` IN ('menu.kitab', 'menu.mapel')
SQL);

        $actions = [
            ['action.kurikulum.halaman', 'Kurikulum · Akses halaman', 5],
            ['action.kurikulum.tab.kitab', 'Kurikulum · Tab Kitab', 10],
            ['action.kurikulum.tab.mapel', 'Kurikulum · Tab Mapel', 20],
            ['action.kurikulum.tab.jadwal', 'Kurikulum · Tab Jadwal', 30],
        ];

        foreach ($actions as $a) {
            $code = $a[0];
            $labelEsc = str_replace("'", "''", $a[1]);
            $sort = (int) $a[2];
            $this->execute(<<<SQL
INSERT IGNORE INTO `app___fitur` (`id_app`, `parent_id`, `type`, `code`, `label`, `path`, `icon_key`, `group_label`, `sort_order`, `meta_json`)
SELECT 1, pf.id, 'action', '{$code}', '{$labelEsc}', NULL, NULL, 'Lembaga', {$sort}, NULL
FROM `app___fitur` pf WHERE pf.`id_app` = 1 AND pf.`code` = 'menu.kurikulum' LIMIT 1
SQL);
        }

        $this->execute(<<<'SQL'
INSERT IGNORE INTO `role___fitur` (`role_id`, `fitur_id`)
SELECT r.id, f.id FROM `role` r
CROSS JOIN `app___fitur` f
WHERE r.`key` = 'super_admin'
AND f.`id_app` = 1
AND f.`code` IN (
  'menu.kurikulum',
  'action.kurikulum.halaman',
  'action.kurikulum.tab.kitab',
  'action.kurikulum.tab.mapel',
  'action.kurikulum.tab.jadwal'
)
SQL);

        $this->execute(<<<'SQL'
INSERT IGNORE INTO `role___fitur` (`role_id`, `fitur_id`)
SELECT DISTINCT rf.`role_id`, fk.`id`
FROM `role___fitur` rf
INNER JOIN `app___fitur` fold ON fold.`id` = rf.`fitur_id` AND fold.`id_app` = 1
  AND fold.`code` IN ('menu.kitab', 'menu.mapel', 'action.mapel.halaman')
INNER JOIN `app___fitur` fk ON fk.`id_app` = 1 AND fk.`code` = 'menu.kurikulum'
SQL);

        $this->execute(<<<'SQL'
INSERT IGNORE INTO `role___fitur` (`role_id`, `fitur_id`)
SELECT DISTINCT rf.`role_id`, fh.`id`
FROM `role___fitur` rf
INNER JOIN `app___fitur` fold ON fold.`id` = rf.`fitur_id` AND fold.`id_app` = 1
  AND fold.`code` IN ('menu.kitab', 'menu.mapel', 'action.mapel.halaman')
INNER JOIN `app___fitur` fh ON fh.`id_app` = 1 AND fh.`code` = 'action.kurikulum.halaman'
SQL);

        $this->execute(<<<'SQL'
INSERT IGNORE INTO `role___fitur` (`role_id`, `fitur_id`)
SELECT DISTINCT rf.`role_id`, ft.`id`
FROM `role___fitur` rf
INNER JOIN `app___fitur` fold ON fold.`id` = rf.`fitur_id` AND fold.`id_app` = 1
  AND fold.`code` = 'menu.kitab'
INNER JOIN `app___fitur` ft ON ft.`id_app` = 1 AND ft.`code` = 'action.kurikulum.tab.kitab'
SQL);

        $this->execute(<<<'SQL'
INSERT IGNORE INTO `role___fitur` (`role_id`, `fitur_id`)
SELECT DISTINCT rf.`role_id`, ft.`id`
FROM `role___fitur` rf
INNER JOIN `app___fitur` fold ON fold.`id` = rf.`fitur_id` AND fold.`id_app` = 1
  AND fold.`code` IN ('menu.mapel', 'action.mapel.halaman')
INNER JOIN `app___fitur` ft ON ft.`id_app` = 1 AND ft.`code` = 'action.kurikulum.tab.mapel'
SQL);
    }

    public function down(): void
    {
        $this->execute(
            "DELETE FROM `app___fitur` WHERE `id_app` = 1 AND `code` IN (
              'action.kurikulum.halaman',
              'action.kurikulum.tab.kitab',
              'action.kurikulum.tab.mapel',
              'action.kurikulum.tab.jadwal',
              'menu.kurikulum'
            )"
        );
        $this->execute(
            "UPDATE `app___fitur` SET `meta_json` = NULL
             WHERE `id_app` = 1 AND `type` = 'menu' AND `code` IN ('menu.kitab', 'menu.mapel')"
        );
    }
}
