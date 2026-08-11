<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Pemetaan kitab (mapel) per rombel/kelas: batas pelajaran (dari–sampai), status, keterangan.
 * Tabel: lembaga___kitab
 */
final class LembagaKitab extends AbstractMigration
{
    public function up(): void
    {
        $this->execute('SET NAMES utf8mb4');
        $this->execute('SET FOREIGN_KEY_CHECKS = 0');

        $this->execute(<<<'SQL'
CREATE TABLE IF NOT EXISTS `lembaga___kitab` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `id_rombel` int(11) NOT NULL COMMENT 'FK ke lembaga___rombel.id (kelas)',
  `id_kitab` int(11) NOT NULL COMMENT 'FK ke kitab.id',
  `dari` varchar(255) DEFAULT NULL COMMENT 'Batas pelajaran awal (hal/bab/nomor, fleksibel)',
  `sampai` varchar(255) DEFAULT NULL COMMENT 'Batas pelajaran akhir',
  `keterangan` text DEFAULT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'aktif' COMMENT 'mis. aktif, nonaktif',
  `tanggal_dibuat` timestamp NOT NULL DEFAULT current_timestamp(),
  `tanggal_update` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_rombel` (`id_rombel`),
  KEY `idx_kitab` (`id_kitab`),
  KEY `idx_status` (`status`),
  KEY `idx_rombel_kitab` (`id_rombel`,`id_kitab`),
  CONSTRAINT `fk_lembaga_kitab_rombel` FOREIGN KEY (`id_rombel`) REFERENCES `lembaga___rombel` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_lembaga_kitab_kitab` FOREIGN KEY (`id_kitab`) REFERENCES `kitab` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Mapel/kitab per rombel (kelas)'
SQL);

        $this->execute('SET FOREIGN_KEY_CHECKS = 1');
    }

    public function down(): void
    {
        $this->execute('SET FOREIGN_KEY_CHECKS = 0');
        $this->execute('DROP TABLE IF EXISTS `lembaga___kitab`');
        $this->execute('SET FOREIGN_KEY_CHECKS = 1');
    }
}
