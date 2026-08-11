<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Aksi export Excel tab Review (Preview) — siapa boleh mengunduh rekap ke .xlsx.
 */
final class BisyarohRekapExportExcelAction extends AbstractMigration
{
    public function up(): void
    {
        if (!$this->hasTable('app___fitur')) {
            return;
        }

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
            . "VALUES (1, {$parentId}, 'action', 'action.bisyaroh.rekap.export_excel', 'Bisyaroh · Export Excel (tab Review)', NULL, NULL, 'Lembaga', 17, '{$metaEsc}')"
        );

        $conn->exec(<<<'SQL'
INSERT IGNORE INTO `role___fitur` (`role_id`, `fitur_id`)
SELECT r.id, f.id FROM `role` r
CROSS JOIN `app___fitur` f
WHERE r.`key` = 'super_admin'
AND f.`id_app` = 1 AND f.`type` = 'action' AND f.`code` = 'action.bisyaroh.rekap.export_excel'
SQL);
    }

    public function down(): void
    {
        $this->execute(
            "DELETE FROM `app___fitur` WHERE `id_app` = 1 AND `type` = 'action' AND `code` = 'action.bisyaroh.rekap.export_excel'"
        );
    }
}
