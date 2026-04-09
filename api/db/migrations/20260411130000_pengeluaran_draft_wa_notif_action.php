<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Notifikasi WA untuk rencana draft: satu aksi (lembaga sesuai role), tanpa varian semua lembaga.
 * Penugasan default: super_admin + salin dari role yang sudah punya action.pengeluaran.notif.lembaga_sesuai_role.
 */
final class PengeluaranDraftWaNotifAction extends AbstractMigration
{
    public function up(): void
    {
        $meta = '{"requiresRole":["admin_uwaba","super_admin","admin_lembaga","petugas_keuangan"]}';

        $this->execute(<<<SQL
INSERT IGNORE INTO `app___fitur` (`id_app`, `parent_id`, `type`, `code`, `label`, `path`, `icon_key`, `group_label`, `sort_order`, `meta_json`)
SELECT 1, pf.id, 'action', 'action.pengeluaran.draft.notif.lembaga_sesuai_role', 'Draft · Notif WA lembaga sesuai role', NULL, NULL, 'Keuangan', 178, '{$meta}'
FROM `app___fitur` pf WHERE pf.`id_app` = 1 AND pf.`code` = 'menu.pengeluaran' LIMIT 1
SQL);

        $this->execute(<<<'SQL'
INSERT IGNORE INTO `role___fitur` (`role_id`, `fitur_id`)
SELECT r.id, f.id FROM `role` r
CROSS JOIN `app___fitur` f
WHERE r.`key` = 'super_admin'
AND f.`id_app` = 1 AND f.`type` = 'action'
AND f.`code` = 'action.pengeluaran.draft.notif.lembaga_sesuai_role'
SQL);

        $this->execute(<<<'SQL'
INSERT IGNORE INTO `role___fitur` (`role_id`, `fitur_id`)
SELECT DISTINCT rf.role_id, fdraft.id
FROM `role___fitur` rf
INNER JOIN `app___fitur` fsrc ON fsrc.id = rf.fitur_id
    AND fsrc.`id_app` = 1 AND fsrc.`type` = 'action'
    AND fsrc.`code` = 'action.pengeluaran.notif.lembaga_sesuai_role'
INNER JOIN `app___fitur` fdraft ON fdraft.`id_app` = 1 AND fdraft.`type` = 'action'
    AND fdraft.`code` = 'action.pengeluaran.draft.notif.lembaga_sesuai_role'
SQL);
    }

    public function down(): void
    {
        $this->execute(
            "DELETE FROM `app___fitur` WHERE `id_app` = 1 AND `type` = 'action' AND `code` = 'action.pengeluaran.draft.notif.lembaga_sesuai_role'"
        );
    }
}
