<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Aksi akses ruang lingkup Histori Bisyaroh: lembaga per peran vs semua lembaga.
 * Default (tanpa aksi ini): hanya baris rekap pengurus yang login.
 */
final class BisyarohHistoriAksesActions extends AbstractMigration
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
            'INSERT IGNORE INTO `app___fitur` (`id_app`, `parent_id`, `type`, `code`, `label`, `path`, `icon_key`, `group_label`, `sort_order`, `meta_json`) VALUES '
            . "(1, {$parentId}, 'action', 'action.bisyaroh.histori.lembaga_peran', 'Bisyaroh · Histori cakupan lembaga (peran)', NULL, NULL, 'Lembaga', 16, '{$metaEsc}'),"
            . "(1, {$parentId}, 'action', 'action.bisyaroh.histori.semua_lembaga', 'Bisyaroh · Histori semua lembaga', NULL, NULL, 'Lembaga', 17, '{$metaEsc}')"
        );

        $conn->exec(<<<'SQL'
INSERT IGNORE INTO `role___fitur` (`role_id`, `fitur_id`)
SELECT r.id, f.id FROM `role` r
CROSS JOIN `app___fitur` f
WHERE r.`key` = 'super_admin'
AND f.`id_app` = 1 AND f.`type` = 'action'
AND f.`code` IN ('action.bisyaroh.histori.lembaga_peran','action.bisyaroh.histori.semua_lembaga')
SQL);
    }

    public function down(): void
    {
        $this->execute(
            "DELETE FROM `app___fitur` WHERE `id_app` = 1 AND `type` = 'action' AND `code` IN ('action.bisyaroh.histori.lembaga_peran','action.bisyaroh.histori.semua_lembaga')"
        );
    }
}
