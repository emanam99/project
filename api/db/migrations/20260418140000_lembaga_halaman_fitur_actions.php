<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Aksi halaman modul Lembaga (Santri, Rombel, Jabatan, Mapel) untuk penugasan peran di Pengaturan → Fitur.
 */
final class LembagaHalamanFiturActions extends AbstractMigration
{
    public function up(): void
    {
        $meta = '{"requiresRole":["super_admin","tarbiyah","admin_lembaga"]}';

        $actions = [
            ['menu.santri', 'action.santri.halaman', 'Santri · Akses halaman data', 5],
            ['menu.rombel', 'action.rombel.halaman', 'Rombel · Akses halaman', 5],
            ['menu.manage_jabatan', 'action.manage_jabatan.halaman', 'Jabatan · Akses halaman', 5],
            ['menu.mapel', 'action.mapel.halaman', 'Mapel · Akses halaman', 5],
        ];

        foreach ($actions as $a) {
            $parent = $a[0];
            $code = $a[1];
            $label = $a[2];
            $sort = (int) $a[3];
            $labelEsc = str_replace("'", "''", $label);
            $metaEsc = str_replace("'", "''", $meta);
            $this->execute(<<<SQL
INSERT IGNORE INTO `app___fitur` (`id_app`, `parent_id`, `type`, `code`, `label`, `path`, `icon_key`, `group_label`, `sort_order`, `meta_json`)
SELECT 1, pf.id, 'action', '{$code}', '{$labelEsc}', NULL, NULL, 'Lembaga', {$sort}, '{$metaEsc}'
FROM `app___fitur` pf WHERE pf.`id_app` = 1 AND pf.`code` = '{$parent}' LIMIT 1
SQL);
        }

        $codesList = "'" . implode("','", array_column($actions, 1)) . "'";

        $this->execute(<<<SQL
INSERT IGNORE INTO `role___fitur` (`role_id`, `fitur_id`)
SELECT r.id, f.id FROM `role` r
CROSS JOIN `app___fitur` f
WHERE r.`key` = 'super_admin'
AND f.`id_app` = 1 AND f.`type` = 'action' AND f.`code` IN ($codesList)
SQL);

        foreach ($actions as $a) {
            $parentCode = str_replace("'", "''", $a[0]);
            $actionCode = str_replace("'", "''", $a[1]);
            $this->execute(<<<SQL
INSERT IGNORE INTO `role___fitur` (`role_id`, `fitur_id`)
SELECT rf.`role_id`, fnew.`id`
FROM `role___fitur` rf
INNER JOIN `app___fitur` fold ON fold.`id` = rf.`fitur_id`
  AND fold.`code` = '$parentCode' AND fold.`id_app` = 1 AND fold.`type` = 'menu'
INNER JOIN `app___fitur` fnew ON fnew.`parent_id` = fold.`id`
  AND fnew.`id_app` = 1 AND fnew.`type` = 'action'
  AND fnew.`code` = '$actionCode'
SQL);
        }
    }

    public function down(): void
    {
        $this->execute(
            "DELETE FROM `app___fitur` WHERE `id_app` = 1 AND `type` = 'action' AND `code` IN ('action.santri.halaman','action.rombel.halaman','action.manage_jabatan.halaman','action.mapel.halaman')"
        );
    }
}
