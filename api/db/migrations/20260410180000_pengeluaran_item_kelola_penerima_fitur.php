<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Aksi terpisah untuk ubah penerima uang (id_penerima) di offcanvas pengeluaran — selaras tab Pengeluaran di Pengaturan → Fitur.
 * Tetap boleh jika punya aksi lama rencana.kelola_penerima_notif (kompatibel).
 * Salin penugasan role dari aksi lama ke aksi baru.
 */
final class PengeluaranItemKelolaPenerimaFitur extends AbstractMigration
{
    public function up(): void
    {
        $meta = '{"requiresRole":["admin_uwaba","super_admin","admin_lembaga","petugas_keuangan"]}';

        $this->execute(<<<SQL
INSERT IGNORE INTO `app___fitur` (`id_app`, `parent_id`, `type`, `code`, `label`, `path`, `icon_key`, `group_label`, `sort_order`, `meta_json`)
SELECT 1, pf.id, 'action', 'action.pengeluaran.item.kelola_penerima', 'Pengeluaran · Ubah penerima uang (offcanvas)', NULL, NULL, 'Keuangan', 132, '{$meta}'
FROM `app___fitur` pf WHERE pf.`id_app` = 1 AND pf.`code` = 'menu.pengeluaran' LIMIT 1
SQL);

        $this->execute(<<<'SQL'
INSERT IGNORE INTO `role___fitur` (`role_id`, `fitur_id`)
SELECT rf.`role_id`, fnew.`id`
FROM `role___fitur` rf
INNER JOIN `app___fitur` fold ON fold.`id` = rf.`fitur_id` AND fold.`code` = 'action.pengeluaran.rencana.kelola_penerima_notif' AND fold.`id_app` = 1
INNER JOIN `app___fitur` fnew ON fnew.`code` = 'action.pengeluaran.item.kelola_penerima' AND fnew.`id_app` = 1
SQL);
    }

    public function down(): void
    {
        $this->execute(
            "DELETE rf FROM `role___fitur` rf INNER JOIN `app___fitur` f ON f.`id` = rf.`fitur_id` WHERE f.`id_app` = 1 AND f.`code` = 'action.pengeluaran.item.kelola_penerima'"
        );
        $this->execute(
            "DELETE FROM `app___fitur` WHERE `id_app` = 1 AND `type` = 'action' AND `code` = 'action.pengeluaran.item.kelola_penerima'"
        );
    }
}
