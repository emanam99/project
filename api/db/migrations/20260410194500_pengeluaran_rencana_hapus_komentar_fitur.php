<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Aksi hapus komentar rencana (moderasi: hapus komentar orang lain). Pemilik komentar tetap boleh hapus milik sendiri tanpa aksi ini.
 * Penugasan default: super_admin + salin dari role yang punya action.pengeluaran.rencana.edit.
 */
final class PengeluaranRencanaHapusKomentarFitur extends AbstractMigration
{
    public function up(): void
    {
        $meta = '{"requiresRole":["admin_uwaba","super_admin","admin_lembaga","petugas_keuangan"]}';

        $this->execute(<<<SQL
INSERT IGNORE INTO `app___fitur` (`id_app`, `parent_id`, `type`, `code`, `label`, `path`, `icon_key`, `group_label`, `sort_order`, `meta_json`)
SELECT 1, pf.id, 'action', 'action.pengeluaran.rencana.hapus_komentar', 'Rencana · Hapus komentar (moderasi)', NULL, NULL, 'Keuangan', 179, '{$meta}'
FROM `app___fitur` pf WHERE pf.`id_app` = 1 AND pf.`code` = 'menu.pengeluaran' LIMIT 1
SQL);

        $this->execute(<<<'SQL'
INSERT IGNORE INTO `role___fitur` (`role_id`, `fitur_id`)
SELECT r.id, f.id FROM `role` r
CROSS JOIN `app___fitur` f
WHERE r.`key` = 'super_admin'
AND f.`id_app` = 1 AND f.`type` = 'action'
AND f.`code` = 'action.pengeluaran.rencana.hapus_komentar'
SQL);

        $this->execute(<<<'SQL'
INSERT IGNORE INTO `role___fitur` (`role_id`, `fitur_id`)
SELECT rf.`role_id`, fnew.`id`
FROM `role___fitur` rf
INNER JOIN `app___fitur` fold ON fold.`id` = rf.`fitur_id`
    AND fold.`code` = 'action.pengeluaran.rencana.edit' AND fold.`id_app` = 1
INNER JOIN `app___fitur` fnew ON fnew.`code` = 'action.pengeluaran.rencana.hapus_komentar' AND fnew.`id_app` = 1
SQL);
    }

    public function down(): void
    {
        $this->execute(
            "DELETE FROM `app___fitur` WHERE `id_app` = 1 AND `type` = 'action' AND `code` = 'action.pengeluaran.rencana.hapus_komentar'"
        );
    }
}
