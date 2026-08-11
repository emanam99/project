<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Penugasan santri (status Guru Tugas) ke madrasah per tahun ajaran.
 * Satu santri tidak boleh duplikat untuk kombinasi madrasah + TA yang sama;
 * satu madrasah pada TA yang sama boleh beberapa santri (multi GT).
 */
final class UgtGuruTugasTugasan extends AbstractMigration
{
    public function up(): void
    {
        $this->execute('SET NAMES utf8mb4');
        $this->execute(<<<'SQL'
CREATE TABLE IF NOT EXISTS `ugt___guru_tugas_tugasan` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `id_santri` int(11) NOT NULL COMMENT 'FK santri',
  `id_madrasah` int(11) NOT NULL COMMENT 'FK madrasah',
  `id_tahun_ajaran` varchar(50) NOT NULL COMMENT 'FK tahun_ajaran.tahun_ajaran',
  `id_pengurus_pembuat` int(11) DEFAULT NULL COMMENT 'FK pengurus pembuat baris',
  `keterangan` text DEFAULT NULL,
  `tanggal_dibuat` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_gt_tugasan_santri_madrasah_ta` (`id_santri`,`id_madrasah`,`id_tahun_ajaran`),
  KEY `idx_santri` (`id_santri`),
  KEY `idx_madrasah_ta` (`id_madrasah`,`id_tahun_ajaran`),
  KEY `idx_tahun_ajaran` (`id_tahun_ajaran`),
  CONSTRAINT `fk_gt_tugasan_santri` FOREIGN KEY (`id_santri`) REFERENCES `santri` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_gt_tugasan_madrasah` FOREIGN KEY (`id_madrasah`) REFERENCES `madrasah` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_gt_tugasan_ta` FOREIGN KEY (`id_tahun_ajaran`) REFERENCES `tahun_ajaran` (`tahun_ajaran`) ON UPDATE CASCADE,
  CONSTRAINT `fk_gt_tugasan_pembuat` FOREIGN KEY (`id_pengurus_pembuat`) REFERENCES `pengurus` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='UGT: tugas guru tugas per madrasah & tahun ajaran'
SQL);
    }

    public function down(): void
    {
        $this->execute('DROP TABLE IF EXISTS `ugt___guru_tugas_tugasan`');
    }
}
