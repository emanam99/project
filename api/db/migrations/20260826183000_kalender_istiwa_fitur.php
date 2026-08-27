<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Tab Istiwa’ di Pengaturan Kalender: aksi fitur, selector, koordinat default Bondowoso.
 */
final class KalenderIstiwaFitur extends AbstractMigration
{
    public function up(): void
    {
        $this->execute(<<<'SQL'
INSERT IGNORE INTO `app___fitur` (`id_app`, `parent_id`, `type`, `code`, `label`, `path`, `icon_key`, `group_label`, `sort_order`, `meta_json`)
SELECT 1, pf.id, 'action', 'action.kalender.pengaturan.tab_istiwa', 'Pengaturan kalender · Tab Istiwa’', NULL, NULL, 'Kalender', 25, '{"requiresRole":["admin_kalender","super_admin"]}'
FROM `app___fitur` pf WHERE pf.`id_app` = 1 AND pf.`code` = 'menu.kalender.pengaturan' LIMIT 1
SQL);

        $this->execute(<<<'SQL'
INSERT IGNORE INTO `role___fitur` (`role_id`, `fitur_id`)
SELECT DISTINCT rf.`role_id`, fnew.`id`
FROM `role___fitur` rf
INNER JOIN `app___fitur` fold ON fold.`id` = rf.`fitur_id` AND fold.`id_app` = 1
  AND fold.`code` = 'menu.kalender.pengaturan'
INNER JOIN `app___fitur` fnew ON fnew.`id_app` = 1 AND fnew.`code` = 'action.kalender.pengaturan.tab_istiwa'
SQL);

        $this->execute(<<<'SQL'
INSERT IGNORE INTO `ebeddien_fitur_selector` (`selector_key`, `codes_json`)
VALUES ('kalenderPengaturanIstiwaSelectors', '["action.kalender.pengaturan.tab_istiwa","menu.kalender.pengaturan"]')
SQL);

        $legacyRoles = ['admin_kalender', 'super_admin', 'tarbiyah', 'admin_daerah', 'admin_domisili', 'kapdar', 'wakapdar'];
        $i = 0;
        foreach ($legacyRoles as $rk) {
            $this->execute(sprintf(
                "INSERT IGNORE INTO `ebeddien_legacy_route_role` (`legacy_key`, `role_key`, `sort_order`) VALUES (%s, %s, %d)",
                $this->getAdapter()->getConnection()->quote('kalenderPengaturanIstiwaSelectors'),
                $this->getAdapter()->getConnection()->quote($rk),
                $i
            ));
            ++$i;
        }

        if ($this->hasTable('app___settings')) {
            $this->execute(
                "INSERT IGNORE INTO `app___settings` (`key`, `value`) VALUES ('kalender_istiwa_latitude', '-7.9138')"
            );
            $this->execute(
                "INSERT IGNORE INTO `app___settings` (`key`, `value`) VALUES ('kalender_istiwa_longitude', '113.8214')"
            );
        }
    }

    public function down(): void
    {
        $this->execute(
            "DELETE FROM `app___fitur` WHERE `id_app` = 1 AND `type` = 'action' AND `code` = 'action.kalender.pengaturan.tab_istiwa'"
        );
        $this->execute(
            "DELETE FROM `ebeddien_fitur_selector` WHERE `selector_key` = 'kalenderPengaturanIstiwaSelectors'"
        );
        $this->execute(
            "DELETE FROM `ebeddien_legacy_route_role` WHERE `legacy_key` = 'kalenderPengaturanIstiwaSelectors'"
        );
        if ($this->hasTable('app___settings')) {
            $this->execute(
                "DELETE FROM `app___settings` WHERE `key` IN ('kalender_istiwa_latitude', 'kalender_istiwa_longitude')"
            );
        }
    }
}
