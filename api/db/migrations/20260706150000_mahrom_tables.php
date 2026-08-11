<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Master mahrom (NIM) + relasi many-to-many ke santri + berkas (KTP/KK).
 * NIS = santri, NIM = mahrom, NIP = pengurus (tabel pengurus).
 */
final class MahromTables extends AbstractMigration
{
    public function up(): void
    {
        $this->execute('SET FOREIGN_KEY_CHECKS = 0');

        $this->execute(<<<'SQL'
CREATE TABLE IF NOT EXISTS `mahrom` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `nim` varchar(20) NOT NULL COMMENT 'Nomor Induk Mahrom',
  `nama` varchar(255) NOT NULL,
  `nik` varchar(20) DEFAULT NULL,
  `tempat_lahir` varchar(100) DEFAULT NULL,
  `tanggal_lahir` date DEFAULT NULL,
  `gender` enum('Laki-laki','Perempuan') DEFAULT NULL,
  `no_telpon` varchar(20) DEFAULT NULL,
  `no_wa` varchar(20) DEFAULT NULL,
  `email` varchar(255) DEFAULT NULL,
  `pekerjaan` varchar(255) DEFAULT NULL,
  `pendidikan` varchar(255) DEFAULT NULL,
  `dusun` varchar(255) DEFAULT NULL,
  `rt` varchar(10) DEFAULT NULL,
  `rw` varchar(10) DEFAULT NULL,
  `desa` varchar(255) DEFAULT NULL,
  `kecamatan` varchar(255) DEFAULT NULL,
  `kabupaten` varchar(255) DEFAULT NULL,
  `provinsi` varchar(255) DEFAULT NULL,
  `kode_pos` varchar(10) DEFAULT NULL,
  `id_user` int(11) DEFAULT NULL COMMENT 'Login mybeddian (opsional)',
  `aktif` tinyint(1) NOT NULL DEFAULT 1,
  `tanggal_dibuat` timestamp NOT NULL DEFAULT current_timestamp(),
  `tanggal_update` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_mahrom_nim` (`nim`),
  KEY `idx_mahrom_nik` (`nik`),
  KEY `idx_mahrom_nama` (`nama`),
  KEY `idx_mahrom_aktif` (`aktif`),
  KEY `idx_mahrom_id_user` (`id_user`),
  CONSTRAINT `fk_mahrom_id_user` FOREIGN KEY (`id_user`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
SQL);

        $this->execute(<<<'SQL'
CREATE TABLE IF NOT EXISTS `santri___mahrom` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `id_santri` int(11) NOT NULL,
  `id_mahrom` int(11) NOT NULL,
  `hubungan` varchar(50) NOT NULL COMMENT 'Ayah, Ibu, Wali, Paman, Bibi, dll.',
  `is_utama` tinyint(1) NOT NULL DEFAULT 0 COMMENT 'Mahrom utama untuk santri ini',
  `keterangan` text DEFAULT NULL,
  `tanggal_dibuat` timestamp NOT NULL DEFAULT current_timestamp(),
  `tanggal_update` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_santri_mahrom` (`id_santri`,`id_mahrom`),
  KEY `idx_santri_mahrom_santri` (`id_santri`),
  KEY `idx_santri_mahrom_mahrom` (`id_mahrom`),
  KEY `idx_santri_mahrom_hubungan` (`hubungan`),
  CONSTRAINT `fk_santri___mahrom_santri` FOREIGN KEY (`id_santri`) REFERENCES `santri` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_santri___mahrom_mahrom` FOREIGN KEY (`id_mahrom`) REFERENCES `mahrom` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
SQL);

        $this->execute(<<<'SQL'
CREATE TABLE IF NOT EXISTS `mahrom___berkas` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `id_mahrom` int(11) NOT NULL,
  `jenis_berkas` varchar(100) NOT NULL COMMENT 'KTP, KK, dll.',
  `nama_file` varchar(255) NOT NULL,
  `path_file` varchar(500) NOT NULL,
  `ukuran_file` bigint(20) DEFAULT NULL,
  `tipe_file` varchar(100) DEFAULT NULL,
  `keterangan` text DEFAULT NULL,
  `id_admin` int(7) DEFAULT NULL,
  `status_tidak_ada` tinyint(1) NOT NULL DEFAULT 0,
  `tanggal_dibuat` timestamp NOT NULL DEFAULT current_timestamp(),
  `tanggal_update` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_mahrom_berkas_mahrom` (`id_mahrom`),
  KEY `idx_mahrom_berkas_jenis` (`jenis_berkas`),
  KEY `idx_mahrom_berkas_admin` (`id_admin`),
  CONSTRAINT `fk_mahrom___berkas_mahrom` FOREIGN KEY (`id_mahrom`) REFERENCES `mahrom` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_mahrom___berkas_admin` FOREIGN KEY (`id_admin`) REFERENCES `pengurus` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
SQL);

        $this->execute('SET FOREIGN_KEY_CHECKS = 1');
    }

    public function down(): void
    {
        $this->execute('SET FOREIGN_KEY_CHECKS = 0');
        $this->execute('DROP TABLE IF EXISTS `mahrom___berkas`');
        $this->execute('DROP TABLE IF EXISTS `santri___mahrom`');
        $this->execute('DROP TABLE IF EXISTS `mahrom`');
        $this->execute('SET FOREIGN_KEY_CHECKS = 1');
    }
}
