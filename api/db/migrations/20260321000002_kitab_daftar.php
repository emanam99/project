<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Daftar kitab / buku pelajaran (perpustakaan / referensi nilai tes nanti).
 * Tabel: kitab
 */
final class KitabDaftar extends AbstractMigration
{
    public function up(): void
    {
        $this->execute('SET NAMES utf8mb4');
        $this->execute('SET FOREIGN_KEY_CHECKS = 0');
        $this->execute(<<<'SQL'
CREATE TABLE IF NOT EXISTS `kitab` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `fan` varchar(100) DEFAULT NULL COMMENT 'Cabang/kategori ilmu: fiqh, nahwu, shorof, dll.',
  `nama_indo` varchar(500) NOT NULL COMMENT 'Judul atau nama kitab (Indonesia)',
  `nama_arab` varchar(500) DEFAULT NULL COMMENT 'Judul atau nama kitab (Arab)',
  `penulis` varchar(255) DEFAULT NULL,
  `penerbit` varchar(255) DEFAULT NULL,
  `tahun` smallint unsigned DEFAULT NULL COMMENT 'Tahun terbit (Masehi)',
  `isbn` varchar(32) DEFAULT NULL,
  `keterangan` text DEFAULT NULL,
  `tanggal_dibuat` timestamp NOT NULL DEFAULT current_timestamp(),
  `tanggal_update` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_fan` (`fan`),
  KEY `idx_nama_indo` (`nama_indo`(191)),
  KEY `idx_tahun` (`tahun`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Daftar kitab / buku pelajaran'
SQL);
        $this->execute('SET FOREIGN_KEY_CHECKS = 1');
    }

    public function down(): void
    {
        $this->execute('SET FOREIGN_KEY_CHECKS = 0');
        $this->execute('DROP TABLE IF EXISTS `kitab`');
        $this->execute('SET FOREIGN_KEY_CHECKS = 1');
    }
}
