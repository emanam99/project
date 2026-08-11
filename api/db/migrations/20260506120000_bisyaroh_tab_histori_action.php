<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Tab Histori Bisyaroh — riwayat simpan/ubah baris rekap (RBAC).
 */
final class BisyarohTabHistoriAction extends AbstractMigration
{
    public function up(): void
    {
        $conn = $this->getAdapter()->getConnection();
        $meta = '{"requiresRole":["super_admin","tarbiyah","admin_lembaga"]}';
        $metaEsc = str_replace("'", "''", $meta);

        $stmt = $conn->prepare('SELECT `id` FROM `app___fitur` WHERE `id_app` = 1 AND `code` = ? AND `type` = \'menu\' LIMIT 1');
        $stmt->execute(['menu.bisyaroh']);
        $row = $stmt->fetch(\PDO::FETCH_ASSOC);
        if ($row === false || empty($row['id'])) {
            return;
        }
        $parentId = (int) $row['id'];

        $conn->exec(
            'INSERT IGNORE INTO `app___fitur` (`id_app`, `parent_id`, `type`, `code`, `label`, `path`, `icon_key`, `group_label`, `sort_order`, `meta_json`) '
            . "VALUES (1, {$parentId}, 'action', 'action.bisyaroh.tab.histori', 'Bisyaroh · Tab Histori', NULL, NULL, 'Lembaga', 12, '{$metaEsc}')"
        );

        $conn->exec(<<<'SQL'
INSERT IGNORE INTO `role___fitur` (`role_id`, `fitur_id`)
SELECT r.id, f.id FROM `role` r
CROSS JOIN `app___fitur` f
WHERE r.`key` = 'super_admin'
AND f.`id_app` = 1 AND f.`type` = 'action' AND f.`code` = 'action.bisyaroh.tab.histori'
SQL);

        $conn->exec(<<<'SQL'
INSERT IGNORE INTO `role___fitur` (`role_id`, `fitur_id`)
SELECT rf.`role_id`, fnew.`id`
FROM `role___fitur` rf
INNER JOIN `app___fitur` fold ON fold.`id` = rf.`fitur_id`
  AND fold.`code` = 'menu.bisyaroh' AND fold.`id_app` = 1 AND fold.`type` = 'menu'
INNER JOIN `app___fitur` fnew ON fnew.`parent_id` = fold.`id`
  AND fnew.`id_app` = 1 AND fnew.`type` = 'action'
  AND fnew.`code` = 'action.bisyaroh.tab.histori'
SQL);
    }

    public function down(): void
    {
        $this->execute(
            "DELETE FROM `app___fitur` WHERE `id_app` = 1 AND `type` = 'action' AND `code` = 'action.bisyaroh.tab.histori'"
        );
    }
}
