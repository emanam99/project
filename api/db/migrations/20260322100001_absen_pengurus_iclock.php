<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Absensi pengurus dari mesin sidik jari (protokol iClock HTTP).
 * PIN mesin = NIP pengurus (kolom pengurus.nip); FK id_pengurus → pengurus.id.
 */
final class AbsenPengurusIclock extends AbstractMigration
{
    public function up(): void
    {
        $this->execute('SET NAMES utf8mb4');
        if (!$this->hasTable('pengurus')) {
            return;
        }
        if ($this->hasTable('absen___pengurus')) {
            return;
        }

        $this->execute(<<<'SQL'
CREATE TABLE `absen___pengurus` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `timestamp` varchar(32) NOT NULL COMMENT 'Waktu dari mesin (string, format device)',
  `id_pengurus` int(7) NOT NULL COMMENT 'FK pengurus.id (bukan NIP)',
  `status` varchar(50) NOT NULL COMMENT 'Masuk/Keluar atau kode operasi',
  `verified` smallint(6) NOT NULL DEFAULT 0,
  `work_code` varchar(32) NOT NULL DEFAULT '0',
  `raw_data` text DEFAULT NULL COMMENT 'Baris mentah dari mesin',
  `tanggal_dibuat` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_absen_pengurus_waktu` (`timestamp`),
  KEY `idx_absen_pengurus_id_pengurus` (`id_pengurus`),
  KEY `idx_absen_pengurus_tanggal_dibuat` (`tanggal_dibuat`),
  CONSTRAINT `fk_absen_pengurus_pengurus` FOREIGN KEY (`id_pengurus`) REFERENCES `pengurus` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci ROW_FORMAT=DYNAMIC
COMMENT='Log absensi pengurus (sidik jari); PIN device = NIP → resolve ke id_pengurus'
SQL);
    }

    public function down(): void
    {
        if (!$this->hasTable('absen___pengurus')) {
            return;
        }
        $this->execute('DROP TABLE IF EXISTS `absen___pengurus`');
    }
}
