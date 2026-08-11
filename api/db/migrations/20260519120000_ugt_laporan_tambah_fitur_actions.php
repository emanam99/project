<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Aksi fitur: tombol tambah laporan per tab (Koordinator, GT, PJGT).
 * Role yang sudah punya menu.ugt.laporan mendapat ketiga aksi (selaras perilaku lama).
 */
final class UgtLaporanTambahFiturActions extends AbstractMigration
{
    private const ACTION_KOORDINATOR = 'action.ugt.laporan.tambah.koordinator';
    private const ACTION_GT = 'action.ugt.laporan.tambah.gt';
    private const ACTION_PJGT = 'action.ugt.laporan.tambah.pjgt';

    public function up(): void
    {
        $k = str_replace("'", "''", self::ACTION_KOORDINATOR);
        $g = str_replace("'", "''", self::ACTION_GT);
        $p = str_replace("'", "''", self::ACTION_PJGT);

        $this->execute(<<<SQL
INSERT IGNORE INTO `app___fitur` (`id_app`, `parent_id`, `type`, `code`, `label`, `path`, `icon_key`, `group_label`, `sort_order`, `meta_json`)
SELECT 1, pf.`id`, 'action', '{$k}', 'Laporan UGT · Tambah laporan Koordinator', NULL, NULL, 'UGT', 50, NULL
FROM `app___fitur` pf WHERE pf.`id_app` = 1 AND pf.`code` = 'menu.ugt.laporan' LIMIT 1
SQL);
        $this->execute(<<<SQL
INSERT IGNORE INTO `app___fitur` (`id_app`, `parent_id`, `type`, `code`, `label`, `path`, `icon_key`, `group_label`, `sort_order`, `meta_json`)
SELECT 1, pf.`id`, 'action', '{$g}', 'Laporan UGT · Tambah laporan GT', NULL, NULL, 'UGT', 51, NULL
FROM `app___fitur` pf WHERE pf.`id_app` = 1 AND pf.`code` = 'menu.ugt.laporan' LIMIT 1
SQL);
        $this->execute(<<<SQL
INSERT IGNORE INTO `app___fitur` (`id_app`, `parent_id`, `type`, `code`, `label`, `path`, `icon_key`, `group_label`, `sort_order`, `meta_json`)
SELECT 1, pf.`id`, 'action', '{$p}', 'Laporan UGT · Tambah laporan PJGT', NULL, NULL, 'UGT', 52, NULL
FROM `app___fitur` pf WHERE pf.`id_app` = 1 AND pf.`code` = 'menu.ugt.laporan' LIMIT 1
SQL);

        $codes = "'" . self::ACTION_KOORDINATOR . "','" . self::ACTION_GT . "','" . self::ACTION_PJGT . "'";
        $this->execute(<<<SQL
INSERT IGNORE INTO `role___fitur` (`role_id`, `fitur_id`)
SELECT DISTINCT rf.`role_id`, af.`id`
FROM `role___fitur` rf
INNER JOIN `app___fitur` m ON m.`id` = rf.`fitur_id` AND m.`id_app` = 1
  AND m.`code` = 'menu.ugt.laporan'
CROSS JOIN `app___fitur` af
WHERE af.`id_app` = 1 AND af.`type` = 'action' AND af.`code` IN ({$codes})
SQL);
    }

    public function down(): void
    {
        $codes = "'" . self::ACTION_KOORDINATOR . "','" . self::ACTION_GT . "','" . self::ACTION_PJGT . "'";
        $this->execute(
            "DELETE rf FROM `role___fitur` rf INNER JOIN `app___fitur` f ON f.`id` = rf.`fitur_id` "
            . "WHERE f.`id_app` = 1 AND f.`type` = 'action' AND f.`code` IN ({$codes})"
        );
        $this->execute(
            "DELETE FROM `app___fitur` WHERE `id_app` = 1 AND `type` = 'action' AND `code` IN ({$codes})"
        );
    }
}
