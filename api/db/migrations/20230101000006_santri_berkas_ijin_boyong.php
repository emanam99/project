<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * santri___berkas, santri___ijin, santri___boyong. Semua definisi inline di PHP.
 */
final class SantriBerkasIjinBoyong extends AbstractMigration
{
    public function up(): void
    {
        $this->execute('SET FOREIGN_KEY_CHECKS = 0');

        $this->execute(<<<'SQL'
CREATE TABLE IF NOT EXISTS `santri___berkas` (
  `tanggal_dibuat` timestamp NULL DEFAULT current_timestamp(),
  `tanggal_update` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `id_santri` int(7) NOT NULL,
  `jenis_berkas` varchar(100) NOT NULL,
  `nama_file` varchar(255) NOT NULL,
  `path_file` varchar(500) NOT NULL,
  `ukuran_file` bigint(20) DEFAULT NULL,
  `tipe_file` varchar(100) DEFAULT NULL,
  `keterangan` text DEFAULT NULL,
  `id_admin` int(7) DEFAULT NULL,
  `status_tidak_ada` tinyint(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `idx_id_santri` (`id_santri`),
  KEY `idx_jenis_berkas` (`jenis_berkas`),
  KEY `idx_id_admin` (`id_admin`),
  CONSTRAINT `fk_santri_berkas_id_admin` FOREIGN KEY (`id_admin`) REFERENCES `pengurus` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_santri_berkas_id_santri` FOREIGN KEY (`id_santri`) REFERENCES `santri` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
SQL);
        $this->execute(<<<'SQL'
CREATE TABLE IF NOT EXISTS `santri___ijin` (
  `tanggal_dibuat` timestamp NOT NULL DEFAULT current_timestamp(),
  `tanggal_update` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `id` varchar(50) NOT NULL,
  `id_santri` int(7) NOT NULL,
  `urutan` int(11) DEFAULT NULL,
  `tahun_ajaran` varchar(15) NOT NULL,
  `alasan` varchar(255) DEFAULT NULL,
  `dari` varchar(255) DEFAULT NULL,
  `sampai` varchar(255) DEFAULT NULL,
  `perpanjang` varchar(255) DEFAULT NULL,
  `lama` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `fk_santri_ijin_id_santri` (`id_santri`),
  CONSTRAINT `fk_santri_ijin_id_santri` FOREIGN KEY (`id_santri`) REFERENCES `santri` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
SQL);
        $this->execute(<<<'SQL'
CREATE TABLE IF NOT EXISTS `santri___boyong` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `tanggal_dibuat` timestamp NOT NULL DEFAULT current_timestamp(),
  `tanggal_update` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `id_santri` int(7) NOT NULL,
  `diniyah` varchar(255) DEFAULT NULL,
  `formal` varchar(255) DEFAULT NULL,
  `tanggal_hijriyah` varchar(50) DEFAULT NULL,
  `tahun_hijriyah` varchar(15) DEFAULT NULL,
  `tahun_masehi` varchar(15) DEFAULT NULL,
  `id_pengurus` int(7) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_id_santri` (`id_santri`),
  KEY `idx_id_pengurus` (`id_pengurus`),
  CONSTRAINT `fk_santri_boyong_id_pengurus` FOREIGN KEY (`id_pengurus`) REFERENCES `pengurus` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_santri_boyong_id_santri` FOREIGN KEY (`id_santri`) REFERENCES `santri` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
SQL);

        $this->execute('SET FOREIGN_KEY_CHECKS = 1');
    }

    public function down(): void
    {
        $this->execute('SET FOREIGN_KEY_CHECKS = 0');
        $this->execute('DROP TABLE IF EXISTS santri___boyong');
        $this->execute('DROP TABLE IF EXISTS santri___ijin');
        $this->execute('DROP TABLE IF EXISTS santri___berkas');
        $this->execute('SET FOREIGN_KEY_CHECKS = 1');
    }
}
