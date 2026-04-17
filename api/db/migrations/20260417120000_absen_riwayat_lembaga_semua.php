<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Riwayat absen: aksi opsional agar peran dapat melihat semua lembaga (filter & API tidak dibatasi jabatan).
 * Tanpa aksi ini, ruang lingkup mengikuti gabungan lembaga dari role pengurus (selaras pengeluaran).
 */
final class AbsenRiwayatLembagaSemua extends AbstractMigration
{
    public function up(): void
    {
        $meta = '{"requiresRole":["super_admin","tarbiyah","admin_lembaga"]}';

        $this->execute(<<<SQL
INSERT IGNORE INTO `app___fitur` (`id_app`, `parent_id`, `type`, `code`, `label`, `path`, `icon_key`, `group_label`, `sort_order`, `meta_json`)
SELECT 1, pf.id, 'action', 'action.absen.riwayat.lembaga_semua', 'Absen · Riwayat · Akses semua lembaga', NULL, NULL, 'Lembaga', 12, '{$meta}'
FROM `app___fitur` pf WHERE pf.`id_app` = 1 AND pf.`code` = 'menu.absen' LIMIT 1
SQL);

        $this->execute(<<<'SQL'
INSERT IGNORE INTO `role___fitur` (`role_id`, `fitur_id`)
SELECT r.id, f.id FROM `role` r
CROSS JOIN `app___fitur` f
WHERE r.`key` = 'super_admin'
AND f.`id_app` = 1 AND f.`type` = 'action' AND f.`code` = 'action.absen.riwayat.lembaga_semua'
SQL);
    }

    public function down(): void
    {
        $this->execute(
            "DELETE FROM `app___fitur` WHERE `id_app` = 1 AND `type` = 'action' AND `code` = 'action.absen.riwayat.lembaga_semua'"
        );
    }
}
