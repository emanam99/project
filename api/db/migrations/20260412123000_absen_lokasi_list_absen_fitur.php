<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Absen lokasi: daftar titik (list) + absen mandiri GPS — diatur per role.
 * Penugasan awal: super_admin; list → role yang punya tambah/ubah/hapus lokasi;
 * absen mandiri → role yang punya tab Absen atau tab Ngabsen (perilaku existing).
 */
final class AbsenLokasiListAbsenFitur extends AbstractMigration
{
    public function up(): void
    {
        $meta = '{"requiresRole":["super_admin","tarbiyah","admin_lembaga"]}';

        $this->execute(<<<SQL
INSERT IGNORE INTO `app___fitur` (`id_app`, `parent_id`, `type`, `code`, `label`, `path`, `icon_key`, `group_label`, `sort_order`, `meta_json`)
SELECT 1, pf.id, 'action', 'action.absen.lokasi.list', 'Absen · Lokasi · Daftar titik', NULL, NULL, 'Lembaga', 35, '{$meta}'
FROM `app___fitur` pf WHERE pf.`id_app` = 1 AND pf.`code` = 'menu.absen' LIMIT 1
SQL);

        $this->execute(<<<SQL
INSERT IGNORE INTO `app___fitur` (`id_app`, `parent_id`, `type`, `code`, `label`, `path`, `icon_key`, `group_label`, `sort_order`, `meta_json`)
SELECT 1, pf.id, 'action', 'action.absen.lokasi.absen', 'Absen · Lokasi · Absen mandiri (GPS)', NULL, NULL, 'Lembaga', 37, '{$meta}'
FROM `app___fitur` pf WHERE pf.`id_app` = 1 AND pf.`code` = 'menu.absen' LIMIT 1
SQL);

        $this->execute(<<<'SQL'
INSERT IGNORE INTO `role___fitur` (`role_id`, `fitur_id`)
SELECT r.id, f.id FROM `role` r
CROSS JOIN `app___fitur` f
WHERE r.`key` = 'super_admin'
AND f.`id_app` = 1 AND f.`type` = 'action'
AND f.`code` IN ('action.absen.lokasi.list', 'action.absen.lokasi.absen')
SQL);

        $this->execute(<<<'SQL'
INSERT IGNORE INTO `role___fitur` (`role_id`, `fitur_id`)
SELECT DISTINCT rf.`role_id`, flist.`id`
FROM `role___fitur` rf
INNER JOIN `app___fitur` fold ON fold.`id` = rf.`fitur_id`
  AND fold.`code` IN ('action.absen.lokasi.tambah', 'action.absen.lokasi.ubah', 'action.absen.lokasi.hapus')
  AND fold.`id_app` = 1
INNER JOIN `app___fitur` flist ON flist.`code` = 'action.absen.lokasi.list' AND flist.`id_app` = 1
SQL);

        $this->execute(<<<'SQL'
INSERT IGNORE INTO `role___fitur` (`role_id`, `fitur_id`)
SELECT DISTINCT rf.`role_id`, fabsen.`id`
FROM `role___fitur` rf
INNER JOIN `app___fitur` ftab ON ftab.`id` = rf.`fitur_id`
  AND ftab.`code` IN ('action.absen.tab.absen', 'action.absen.tab.ngabsen')
  AND ftab.`id_app` = 1
INNER JOIN `app___fitur` fabsen ON fabsen.`code` = 'action.absen.lokasi.absen' AND fabsen.`id_app` = 1
SQL);
    }

    public function down(): void
    {
        $this->execute(<<<'SQL'
DELETE rf FROM `role___fitur` rf
INNER JOIN `app___fitur` f ON f.`id` = rf.`fitur_id`
WHERE f.`id_app` = 1 AND f.`code` IN ('action.absen.lokasi.list', 'action.absen.lokasi.absen')
SQL);
        $this->execute(
            "DELETE FROM `app___fitur` WHERE `id_app` = 1 AND `type` = 'action' AND `code` IN ('action.absen.lokasi.list', 'action.absen.lokasi.absen')"
        );
    }
}
