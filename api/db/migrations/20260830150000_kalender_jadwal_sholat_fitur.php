<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Menu Kalender → Jadwal Sholat. Grant ke role yang sudah punya menu.kalender.
 */
final class KalenderJadwalSholatFitur extends AbstractMigration
{
    public function up(): void
    {
        $this->execute(<<<'SQL'
INSERT IGNORE INTO `app___fitur` (`id_app`, `parent_id`, `type`, `code`, `label`, `path`, `icon_key`, `group_label`, `sort_order`, `meta_json`)
SELECT 1, NULL, 'menu', 'menu.kalender.jadwal_sholat', 'Jadwal Sholat', '/kalender/jadwal-sholat', 'clock', 'Kalender',
  COALESCE((SELECT hp.`sort_order` + 5 FROM `app___fitur` hp WHERE hp.`id_app` = 1 AND hp.`code` = 'menu.kalender.hari_penting' LIMIT 1), 2415),
  NULL
FROM DUAL
SQL);

        $this->execute(<<<'SQL'
INSERT IGNORE INTO `role___fitur` (`role_id`, `fitur_id`)
SELECT r.id, f.id FROM `role` r
CROSS JOIN `app___fitur` f
WHERE r.`key` = 'super_admin'
AND f.`id_app` = 1 AND f.`code` = 'menu.kalender.jadwal_sholat'
SQL);

        $this->execute(<<<'SQL'
INSERT IGNORE INTO `role___fitur` (`role_id`, `fitur_id`)
SELECT DISTINCT rf.`role_id`, fnew.`id`
FROM `role___fitur` rf
INNER JOIN `app___fitur` fold ON fold.`id` = rf.`fitur_id` AND fold.`id_app` = 1 AND fold.`code` = 'menu.kalender'
INNER JOIN `app___fitur` fnew ON fnew.`id_app` = 1 AND fnew.`code` = 'menu.kalender.jadwal_sholat'
SQL);

        $codesJson = '["menu.kalender","menu.kalender.hari_penting","menu.kalender.jadwal_sholat","menu.kalender.pengaturan","menu.converter"]';
        $this->execute(
            'INSERT INTO `ebeddien_fitur_selector` (`selector_key`, `codes_json`) VALUES ('
            . $this->getAdapter()->getConnection()->quote('kalenderStaffMenus') . ', '
            . $this->getAdapter()->getConnection()->quote($codesJson)
            . ') ON DUPLICATE KEY UPDATE `codes_json` = VALUES(`codes_json`)'
        );
    }

    public function down(): void
    {
        $this->execute(
            "DELETE FROM `role___fitur` WHERE `fitur_id` IN (SELECT `id` FROM `app___fitur` WHERE `id_app` = 1 AND `code` = 'menu.kalender.jadwal_sholat')"
        );
        $this->execute(
            "DELETE FROM `app___fitur` WHERE `id_app` = 1 AND `type` = 'menu' AND `code` = 'menu.kalender.jadwal_sholat'"
        );
        $codesJson = '["menu.kalender","menu.kalender.hari_penting","menu.kalender.pengaturan","menu.converter"]';
        $this->execute(
            'UPDATE `ebeddien_fitur_selector` SET `codes_json` = '
            . $this->getAdapter()->getConnection()->quote($codesJson)
            . " WHERE `selector_key` = 'kalenderStaffMenus'"
        );
    }
}
