<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * UGT KOMMPAS: lomba, pendaftaran madrasah, peserta (per tahun ajaran hijriyah).
 */
final class UgtKompasTables extends AbstractMigration
{
    public function up(): void
    {
        $this->execute('SET NAMES utf8mb4');
        $this->execute(<<<'SQL'
CREATE TABLE IF NOT EXISTS `ugt___kompas_lomba` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `tahun_ajaran` varchar(50) NOT NULL COMMENT 'FK tahun_ajaran.tahun_ajaran (hijriyah)',
  `nama` varchar(200) NOT NULL,
  `deskripsi` text DEFAULT NULL,
  `aturan` text DEFAULT NULL,
  `tempat_maps_url` varchar(500) DEFAULT NULL,
  `tempat_catatan` varchar(500) DEFAULT NULL,
  `kategori` varchar(20) NOT NULL COMMENT 'grup|perorangan',
  `anggota_per_kelompok` int(11) DEFAULT NULL COMMENT 'wajib >0 jika kategori=grup',
  `usia_min` tinyint(3) unsigned NOT NULL DEFAULT 0,
  `usia_max` tinyint(3) unsigned NOT NULL DEFAULT 99,
  `created_by` int(11) DEFAULT NULL COMMENT 'users.id',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_kompas_lomba_ta` (`tahun_ajaran`),
  CONSTRAINT `fk_kompas_lomba_ta` FOREIGN KEY (`tahun_ajaran`) REFERENCES `tahun_ajaran` (`tahun_ajaran`) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='UGT KOMMPAS: master lomba'
SQL);

        $this->execute(<<<'SQL'
CREATE TABLE IF NOT EXISTS `ugt___kompas_daftar` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `id_lomba` int(11) NOT NULL,
  `id_madrasah` int(11) NOT NULL,
  `tahun_ajaran` varchar(50) NOT NULL,
  `created_by` int(11) DEFAULT NULL COMMENT 'users.id',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_kompas_daftar_lomba_madrasah` (`id_lomba`,`id_madrasah`),
  KEY `idx_kompas_daftar_ta` (`tahun_ajaran`),
  KEY `idx_kompas_daftar_madrasah` (`id_madrasah`),
  CONSTRAINT `fk_kompas_daftar_lomba` FOREIGN KEY (`id_lomba`) REFERENCES `ugt___kompas_lomba` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_kompas_daftar_madrasah` FOREIGN KEY (`id_madrasah`) REFERENCES `madrasah` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_kompas_daftar_ta` FOREIGN KEY (`tahun_ajaran`) REFERENCES `tahun_ajaran` (`tahun_ajaran`) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='UGT KOMMPAS: pendaftaran madrasah ke lomba'
SQL);

        $this->execute(<<<'SQL'
CREATE TABLE IF NOT EXISTS `ugt___kompas_peserta` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `id_daftar` int(11) NOT NULL,
  `tahun_ajaran` varchar(50) NOT NULL COMMENT 'denormalized untuk UNIQUE nik per TA',
  `urutan` tinyint(3) unsigned NOT NULL DEFAULT 1,
  `nama` varchar(200) NOT NULL,
  `nik` varchar(20) NOT NULL,
  `tempat_lahir` varchar(120) NOT NULL,
  `tanggal_lahir` date NOT NULL,
  `path_kk` varchar(500) NOT NULL,
  `path_foto` varchar(500) NOT NULL,
  `nama_file_kk` varchar(255) DEFAULT NULL,
  `nama_file_foto` varchar(255) DEFAULT NULL,
  `nama_ayah` varchar(200) DEFAULT NULL,
  `nama_ibu` varchar(200) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_kompas_peserta_ta_nik` (`tahun_ajaran`,`nik`),
  KEY `idx_kompas_peserta_daftar` (`id_daftar`),
  CONSTRAINT `fk_kompas_peserta_daftar` FOREIGN KEY (`id_daftar`) REFERENCES `ugt___kompas_daftar` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_kompas_peserta_ta` FOREIGN KEY (`tahun_ajaran`) REFERENCES `tahun_ajaran` (`tahun_ajaran`) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='UGT KOMMPAS: peserta per pendaftaran'
SQL);
    }

    public function down(): void
    {
        $this->execute('DROP TABLE IF EXISTS `ugt___kompas_peserta`');
        $this->execute('DROP TABLE IF EXISTS `ugt___kompas_daftar`');
        $this->execute('DROP TABLE IF EXISTS `ugt___kompas_lomba`');
    }
}
