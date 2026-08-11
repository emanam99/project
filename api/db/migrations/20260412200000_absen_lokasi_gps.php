<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Lokasi absen GPS + penanda sumber di absen___pengurus (sidik_jari vs lokasi_gps).
 * Aksi fitur: action.absen.lokasi.tambah|ubah|hapus (di bawah menu.absen).
 */
final class AbsenLokasiGps extends AbstractMigration
{
    public function up(): void
    {
        if (!$this->hasTable('lembaga')) {
            return;
        }

        $this->execute(<<<'SQL'
CREATE TABLE IF NOT EXISTS `absen___lokasi` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `nama` varchar(191) NOT NULL,
  `latitude` decimal(10,7) NOT NULL,
  `longitude` decimal(10,7) NOT NULL,
  `radius_meter` int(10) unsigned NOT NULL DEFAULT 100,
  `id_lembaga` varchar(50) DEFAULT NULL COMMENT 'NULL = semua lembaga; FK ke lembaga.id (string)',
  `aktif` tinyint(1) unsigned NOT NULL DEFAULT 1,
  `sort_order` int(11) NOT NULL DEFAULT 0,
  `tanggal_dibuat` timestamp NOT NULL DEFAULT current_timestamp(),
  `tanggal_ubah` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_absen_lokasi_lembaga` (`id_lembaga`),
  KEY `idx_absen_lokasi_aktif` (`aktif`),
  CONSTRAINT `fk_absen_lokasi_lembaga` FOREIGN KEY (`id_lembaga`) REFERENCES `lembaga` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci ROW_FORMAT=DYNAMIC
COMMENT='Titik lokasi sah untuk absen GPS pengurus'
SQL);

        if ($this->hasTable('absen___pengurus')) {
            if (!$this->table('absen___pengurus')->hasColumn('sumber_absen')) {
                $this->execute(<<<'SQL'
ALTER TABLE `absen___pengurus`
  ADD COLUMN `sumber_absen` varchar(24) NOT NULL DEFAULT 'sidik_jari' COMMENT 'sidik_jari|lokasi_gps' AFTER `id_pengurus`,
  ADD COLUMN `id_absen_lokasi` bigint(20) unsigned DEFAULT NULL AFTER `sumber_absen`,
  ADD KEY `idx_absen_pengurus_sumber` (`sumber_absen`),
  ADD KEY `idx_absen_pengurus_lokasi` (`id_absen_lokasi`)
SQL);
                $this->execute(<<<'SQL'
ALTER TABLE `absen___pengurus`
  ADD CONSTRAINT `fk_absen_pengurus_lokasi` FOREIGN KEY (`id_absen_lokasi`) REFERENCES `absen___lokasi` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
SQL);
            }
        }

        $meta = '{"requiresRole":["super_admin","tarbiyah","admin_lembaga"]}';

        $this->execute(<<<SQL
INSERT IGNORE INTO `app___fitur` (`id_app`, `parent_id`, `type`, `code`, `label`, `path`, `icon_key`, `group_label`, `sort_order`, `meta_json`)
SELECT 1, pf.id, 'action', 'action.absen.lokasi.tambah', 'Absen · Lokasi · Tambah', NULL, NULL, 'Lembaga', 40, '{$meta}'
FROM `app___fitur` pf WHERE pf.`id_app` = 1 AND pf.`code` = 'menu.absen' LIMIT 1
SQL);
        $this->execute(<<<SQL
INSERT IGNORE INTO `app___fitur` (`id_app`, `parent_id`, `type`, `code`, `label`, `path`, `icon_key`, `group_label`, `sort_order`, `meta_json`)
SELECT 1, pf.id, 'action', 'action.absen.lokasi.ubah', 'Absen · Lokasi · Ubah', NULL, NULL, 'Lembaga', 50, '{$meta}'
FROM `app___fitur` pf WHERE pf.`id_app` = 1 AND pf.`code` = 'menu.absen' LIMIT 1
SQL);
        $this->execute(<<<SQL
INSERT IGNORE INTO `app___fitur` (`id_app`, `parent_id`, `type`, `code`, `label`, `path`, `icon_key`, `group_label`, `sort_order`, `meta_json`)
SELECT 1, pf.id, 'action', 'action.absen.lokasi.hapus', 'Absen · Lokasi · Hapus', NULL, NULL, 'Lembaga', 60, '{$meta}'
FROM `app___fitur` pf WHERE pf.`id_app` = 1 AND pf.`code` = 'menu.absen' LIMIT 1
SQL);

        $this->execute(<<<'SQL'
INSERT IGNORE INTO `role___fitur` (`role_id`, `fitur_id`)
SELECT r.id, f.id FROM `role` r
CROSS JOIN `app___fitur` f
WHERE r.`key` = 'super_admin'
AND f.`id_app` = 1 AND f.`type` = 'action'
AND f.`code` IN ('action.absen.lokasi.tambah', 'action.absen.lokasi.ubah', 'action.absen.lokasi.hapus')
SQL);

        $this->execute(<<<'SQL'
INSERT IGNORE INTO `role___fitur` (`role_id`, `fitur_id`)
SELECT rf.`role_id`, fnew.`id`
FROM `role___fitur` rf
INNER JOIN `app___fitur` fold ON fold.`id` = rf.`fitur_id`
  AND fold.`code` = 'menu.absen' AND fold.`id_app` = 1
INNER JOIN `app___fitur` fnew ON fnew.`parent_id` = fold.`id`
  AND fnew.`id_app` = 1 AND fnew.`type` = 'action'
  AND fnew.`code` IN ('action.absen.lokasi.tambah', 'action.absen.lokasi.ubah', 'action.absen.lokasi.hapus')
SQL);
    }

    public function down(): void
    {
        if ($this->hasTable('absen___pengurus') && $this->table('absen___pengurus')->hasColumn('sumber_absen')) {
            $this->execute('ALTER TABLE `absen___pengurus` DROP FOREIGN KEY `fk_absen_pengurus_lokasi`');
            $this->execute('ALTER TABLE `absen___pengurus` DROP COLUMN `id_absen_lokasi`, DROP COLUMN `sumber_absen`');
        }
        $this->execute(
            "DELETE FROM `app___fitur` WHERE `id_app` = 1 AND `type` = 'action' AND `code` LIKE 'action.absen.lokasi.%'"
        );
        $this->execute('DROP TABLE IF EXISTS `absen___lokasi`');
    }
}
