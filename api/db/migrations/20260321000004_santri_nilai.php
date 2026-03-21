<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Nilai santri per tahun ajaran, lembaga, dan cabang ilmu (fan).
 * Tabel: santri___nilai
 *
 * - id_tahun_ajaran → tahun_ajaran.tahun_ajaran (VARCHAR, bukan INT)
 * - id_lembaga → lembaga.id (VARCHAR)
 * - id_fan → INT (master fan/cabang ilmu menyusul; sementara tanpa FK)
 */
final class SantriNilai extends AbstractMigration
{
    public function up(): void
    {
        $this->execute('SET NAMES utf8mb4');
        $this->execute('SET FOREIGN_KEY_CHECKS = 0');

        $this->execute(<<<'SQL'
CREATE TABLE IF NOT EXISTS `santri___nilai` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `id_tahun_ajaran` varchar(50) NOT NULL COMMENT 'FK ke tahun_ajaran.tahun_ajaran',
  `id_lembaga` varchar(50) NOT NULL COMMENT 'FK ke lembaga.id',
  `id_fan` int(10) unsigned DEFAULT NULL COMMENT 'Cabang ilmu (FK master fan menyusul)',
  `id_santri` int(11) NOT NULL COMMENT 'FK ke santri.id',
  `nilai` varchar(32) DEFAULT NULL COMMENT 'Nilai (angka/huruf; fleksibel)',
  `keterangan` text DEFAULT NULL,
  `tanggal_dibuat` timestamp NOT NULL DEFAULT current_timestamp(),
  `tanggal_update` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_tahun_ajaran` (`id_tahun_ajaran`),
  KEY `idx_lembaga` (`id_lembaga`),
  KEY `idx_fan` (`id_fan`),
  KEY `idx_santri` (`id_santri`),
  KEY `idx_santri_tahun_lembaga_fan` (`id_santri`,`id_tahun_ajaran`,`id_lembaga`,`id_fan`),
  CONSTRAINT `fk_santri_nilai_tahun_ajaran` FOREIGN KEY (`id_tahun_ajaran`) REFERENCES `tahun_ajaran` (`tahun_ajaran`) ON UPDATE CASCADE,
  CONSTRAINT `fk_santri_nilai_lembaga` FOREIGN KEY (`id_lembaga`) REFERENCES `lembaga` (`id`) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT `fk_santri_nilai_santri` FOREIGN KEY (`id_santri`) REFERENCES `santri` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Nilai santri per tahun ajaran / lembaga / fan'
SQL);

        $this->execute('SET FOREIGN_KEY_CHECKS = 1');
    }

    public function down(): void
    {
        $this->execute('SET FOREIGN_KEY_CHECKS = 0');
        $this->execute('DROP TABLE IF EXISTS `santri___nilai`');
        $this->execute('SET FOREIGN_KEY_CHECKS = 1');
    }
}
