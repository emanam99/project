<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Tab Lokasi di Pengaturan Kalender: daftar alamat GPS umum (bukan titik absen).
 */
final class KalenderLokasiAlamatFitur extends AbstractMigration
{
    public function up(): void
    {
        $this->execute(<<<'SQL'
INSERT IGNORE INTO `app___fitur` (`id_app`, `parent_id`, `type`, `code`, `label`, `path`, `icon_key`, `group_label`, `sort_order`, `meta_json`)
SELECT 1, pf.id, 'action', 'action.kalender.pengaturan.tab_lokasi', 'Pengaturan kalender · Tab Lokasi (daftar alamat)', NULL, NULL, 'Kalender', 22, '{"requiresRole":["admin_kalender","super_admin"]}'
FROM `app___fitur` pf WHERE pf.`id_app` = 1 AND pf.`code` = 'menu.kalender.pengaturan' LIMIT 1
SQL);

        $this->execute(<<<'SQL'
INSERT IGNORE INTO `role___fitur` (`role_id`, `fitur_id`)
SELECT DISTINCT rf.`role_id`, fnew.`id`
FROM `role___fitur` rf
INNER JOIN `app___fitur` fold ON fold.`id` = rf.`fitur_id` AND fold.`id_app` = 1
  AND fold.`code` IN (
    'menu.kalender.pengaturan',
    'action.absen.tab.pengaturan',
    'action.absen.lokasi.tambah',
    'action.absen.lokasi.ubah'
  )
INNER JOIN `app___fitur` fnew ON fnew.`id_app` = 1 AND fnew.`code` = 'action.kalender.pengaturan.tab_lokasi'
SQL);

        $this->execute(<<<'SQL'
INSERT IGNORE INTO `ebeddien_fitur_selector` (`selector_key`, `codes_json`)
VALUES
('kalenderPengaturanLokasiSelectors', '["action.kalender.pengaturan.tab_lokasi","menu.kalender.pengaturan"]'),
('absenAlamatCrudApiSelectors', '["menu.absen","action.absen.lokasi.list","action.absen.lokasi.absen","action.absen.lokasi.tambah","action.absen.lokasi.ubah","action.absen.lokasi.hapus","action.absen.tab.pengaturan","action.kalender.pengaturan.tab_lokasi","menu.kalender.pengaturan"]')
SQL);

        $legacyRoles = ['admin_kalender', 'super_admin', 'tarbiyah', 'admin_daerah', 'admin_domisili', 'kapdar', 'wakapdar'];
        $i = 0;
        foreach ($legacyRoles as $rk) {
            $this->execute(sprintf(
                "INSERT IGNORE INTO `ebeddien_legacy_route_role` (`legacy_key`, `role_key`, `sort_order`) VALUES (%s, %s, %d)",
                $this->getAdapter()->getConnection()->quote('kalenderPengaturanLokasiSelectors'),
                $this->getAdapter()->getConnection()->quote($rk),
                $i
            ));
            $this->execute(sprintf(
                "INSERT IGNORE INTO `ebeddien_legacy_route_role` (`legacy_key`, `role_key`, `sort_order`) VALUES (%s, %s, %d)",
                $this->getAdapter()->getConnection()->quote('absenAlamatCrudApiSelectors'),
                $this->getAdapter()->getConnection()->quote($rk),
                $i
            ));
            ++$i;
        }
    }

    public function down(): void
    {
        $this->execute(
            "DELETE FROM `app___fitur` WHERE `id_app` = 1 AND `type` = 'action' AND `code` = 'action.kalender.pengaturan.tab_lokasi'"
        );
        $this->execute(
            "DELETE FROM `ebeddien_fitur_selector` WHERE `selector_key` IN ('kalenderPengaturanLokasiSelectors', 'absenAlamatCrudApiSelectors')"
        );
        $this->execute(
            "DELETE FROM `ebeddien_legacy_route_role` WHERE `legacy_key` IN ('kalenderPengaturanLokasiSelectors', 'absenAlamatCrudApiSelectors')"
        );
    }
}
