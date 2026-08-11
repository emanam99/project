<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Menu Bisyaroh (grup Lembaga) + aksi halaman & tab Rekap/Aturan untuk RBAC.
 */
final class BisyarohFiturMenuActions extends AbstractMigration
{
    public function up(): void
    {
        $conn = $this->getAdapter()->getConnection();
        $meta = '{"requiresRole":["super_admin","tarbiyah","admin_lembaga"]}';
        $metaEsc = str_replace("'", "''", $meta);

        // Menu utama
        $conn->exec(<<<SQL
INSERT IGNORE INTO `app___fitur` (`id_app`, `parent_id`, `type`, `code`, `label`, `path`, `icon_key`, `group_label`, `sort_order`, `meta_json`)
VALUES (1, NULL, 'menu', 'menu.bisyaroh', 'Bisyaroh', '/bisyaroh', 'documentText', 'Lembaga', 113, NULL)
SQL);

        $stmt = $conn->prepare('SELECT `id` FROM `app___fitur` WHERE `id_app` = 1 AND `code` = ? LIMIT 1');
        $stmt->execute(['menu.bisyaroh']);
        $row = $stmt->fetch(\PDO::FETCH_ASSOC);
        if ($row === false || empty($row['id'])) {
            return;
        }
        $parentId = (int) $row['id'];

        $actions = [
            ['action.bisyaroh.halaman', 'Bisyaroh · Akses halaman', 5],
            ['action.bisyaroh.tab.rekap', 'Bisyaroh · Tab Rekap', 10],
            ['action.bisyaroh.tab.aturan', 'Bisyaroh · Tab Aturan', 20],
        ];

        $ins = $conn->prepare(
            'INSERT IGNORE INTO `app___fitur` (`id_app`, `parent_id`, `type`, `code`, `label`, `path`, `icon_key`, `group_label`, `sort_order`, `meta_json`) '
            . 'VALUES (1, ?, \'action\', ?, ?, NULL, NULL, \'Lembaga\', ?, \'' . $metaEsc . '\')'
        );

        foreach ($actions as $a) {
            $ins->execute([$parentId, $a[0], $a[1], $a[2]]);
        }

        // Super admin dapat semua aksi baru
        $conn->exec(<<<SQL
INSERT IGNORE INTO `role___fitur` (`role_id`, `fitur_id`)
SELECT r.id, f.id FROM `role` r
CROSS JOIN `app___fitur` f
WHERE r.`key` = 'super_admin'
AND f.`id_app` = 1 AND f.`type` = 'action' AND f.`code` IN ('action.bisyaroh.halaman','action.bisyaroh.tab.rekap','action.bisyaroh.tab.aturan')
SQL);

        // Mirror: role yang punya menu induk dapat aksi anak (pol seperti lembaga_halaman)
        foreach (['action.bisyaroh.halaman', 'action.bisyaroh.tab.rekap', 'action.bisyaroh.tab.aturan'] as $actionCode) {
            $ac = str_replace("'", "''", $actionCode);
            $conn->exec(<<<SQL
INSERT IGNORE INTO `role___fitur` (`role_id`, `fitur_id`)
SELECT rf.`role_id`, fnew.`id`
FROM `role___fitur` rf
INNER JOIN `app___fitur` fold ON fold.`id` = rf.`fitur_id`
  AND fold.`code` = 'menu.bisyaroh' AND fold.`id_app` = 1 AND fold.`type` = 'menu'
INNER JOIN `app___fitur` fnew ON fnew.`parent_id` = fold.`id`
  AND fnew.`id_app` = 1 AND fnew.`type` = 'action'
  AND fnew.`code` = '$ac'
SQL);
        }

        // Role yang punya menu lembaga tetangga (tarbiyah) — assign menu Bisyaroh ke role yang sudah punya menu.absen (contoh)
        $conn->exec(<<<SQL
INSERT IGNORE INTO `role___fitur` (`role_id`, `fitur_id`)
SELECT DISTINCT rf.`role_id`, fb.`id`
FROM `role___fitur` rf
INNER JOIN `app___fitur` fa ON fa.`id` = rf.`fitur_id` AND fa.`code` = 'menu.absen' AND fa.`id_app` = 1
CROSS JOIN `app___fitur` fb ON fb.`code` = 'menu.bisyaroh' AND fb.`id_app` = 1 AND fb.`type` = 'menu'
SQL);
    }

    public function down(): void
    {
        $this->execute(
            "DELETE FROM `app___fitur` WHERE `id_app` = 1 AND `type` = 'action' AND `code` LIKE 'action.bisyaroh.%'"
        );
        $this->execute(
            "DELETE FROM `app___fitur` WHERE `id_app` = 1 AND `type` = 'menu' AND `code` = 'menu.bisyaroh'"
        );
    }
}
