<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * psa___kalender, psa___hari_penting.
 */
final class PemasukanKalender extends AbstractMigration
{
    public function up(): void
    {
        $this->execute('SET NAMES utf8mb4');
        $this->execute('SET FOREIGN_KEY_CHECKS = 0');

        $statements = [
            <<<'SQL'
CREATE TABLE IF NOT EXISTS `psa___kalender` (
  `id` varchar(20) NOT NULL,
  `tahun` int(4) NOT NULL,
  `id_bulan` varchar(100) NOT NULL,
  `mulai` date NOT NULL,
  `akhir` date NOT NULL,
  PRIMARY KEY (`id`),
  KEY `tahun` (`tahun`),
  KEY `idx_tahun_id_bulan` (`tahun`,`id_bulan`),
  KEY `idx_mulai_akhir` (`mulai`,`akhir`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
SQL,
            <<<'SQL'
CREATE TABLE IF NOT EXISTS `psa___hari_penting` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `nama_event` varchar(255) NOT NULL,
  `kategori` enum('hijriyah','masehi') NOT NULL DEFAULT 'hijriyah',
  `tipe` enum('per_hari','per_pekan','per_bulan','per_tahun','sekali') NOT NULL,
  `hari_pekan` tinyint(4) DEFAULT NULL,
  `tanggal` tinyint(4) DEFAULT NULL,
  `bulan` tinyint(4) DEFAULT NULL,
  `tahun` int(11) DEFAULT NULL,
  `warna_label` varchar(7) DEFAULT NULL,
  `keterangan` text DEFAULT NULL,
  `aktif` tinyint(1) DEFAULT 1,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=58 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
SQL,
        ];

        foreach ($statements as $sql) {
            $this->execute($sql);
        }

        $this->execute('SET FOREIGN_KEY_CHECKS = 1');
    }

    public function down(): void
    {
        $this->execute('DROP TABLE IF EXISTS psa___hari_penting');
        $this->execute('DROP TABLE IF EXISTS psa___kalender');
    }
}
