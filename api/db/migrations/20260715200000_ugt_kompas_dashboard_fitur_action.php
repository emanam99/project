<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * KOMMPAS: aksi tab Dashboard.
 * Grant ke role yang sudah punya menu.ugt.kompas.
 */
final class UgtKompasDashboardFiturAction extends AbstractMigration
{
    private const CODE = 'action.ugt.kompas.tab.dashboard';

    public function up(): void
    {
        $c = str_replace("'", "''", self::CODE);
        $this->execute(<<<SQL
INSERT IGNORE INTO `app___fitur` (`id_app`, `parent_id`, `type`, `code`, `label`, `path`, `icon_key`, `group_label`, `sort_order`, `meta_json`)
SELECT 1, pf.`id`, 'action', '{$c}', 'KOMMPAS · Tab Dashboard', NULL, NULL, 'UGT', 5, NULL
FROM `app___fitur` pf WHERE pf.`id_app` = 1 AND pf.`code` = 'menu.ugt.kompas' LIMIT 1
SQL);

        $this->execute(<<<SQL
INSERT IGNORE INTO `role___fitur` (`role_id`, `fitur_id`)
SELECT DISTINCT rf.`role_id`, af.`id`
FROM `role___fitur` rf
INNER JOIN `app___fitur` m ON m.`id` = rf.`fitur_id` AND m.`id_app` = 1 AND m.`code` = 'menu.ugt.kompas'
CROSS JOIN `app___fitur` af
WHERE af.`id_app` = 1 AND af.`type` = 'action' AND af.`code` = '{$c}'
SQL);
    }

    public function down(): void
    {
        $c = str_replace("'", "''", self::CODE);
        $this->execute(
            "DELETE rf FROM `role___fitur` rf INNER JOIN `app___fitur` f ON f.`id` = rf.`fitur_id` "
            . "WHERE f.`id_app` = 1 AND f.`type` = 'action' AND f.`code` = '{$c}'"
        );
        $this->execute(
            "DELETE FROM `app___fitur` WHERE `id_app` = 1 AND `type` = 'action' AND `code` = '{$c}'"
        );
    }
}
