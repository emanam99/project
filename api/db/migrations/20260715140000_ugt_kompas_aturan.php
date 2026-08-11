<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * UGT KOMMPAS: aturan umum per tahun ajaran (batas akhir pendaftaran).
 */
final class UgtKompasAturan extends AbstractMigration
{
    public function up(): void
    {
        $this->execute('SET NAMES utf8mb4');
        $this->execute(<<<'SQL'
CREATE TABLE IF NOT EXISTS `ugt___kompas_aturan` (
  `tahun_ajaran` varchar(50) NOT NULL COMMENT 'FK tahun_ajaran.tahun_ajaran',
  `batas_pendaftaran` date DEFAULT NULL COMMENT 'Tanggal terakhir boleh daftar/edit; NULL = belum diset',
  `catatan` text DEFAULT NULL,
  `updated_by` int(11) DEFAULT NULL COMMENT 'users.id',
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`tahun_ajaran`),
  CONSTRAINT `fk_kompas_aturan_ta` FOREIGN KEY (`tahun_ajaran`) REFERENCES `tahun_ajaran` (`tahun_ajaran`) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='UGT KOMMPAS: aturan umum per TA'
SQL);
    }

    public function down(): void
    {
        $this->execute('DROP TABLE IF EXISTS `ugt___kompas_aturan`');
    }
}
