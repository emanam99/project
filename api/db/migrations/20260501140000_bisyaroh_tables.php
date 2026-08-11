<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Modul Bisyaroh: induk `bisyaroh` per lembaga; detail `bisyaroh___*` untuk aturan fleksibel & baris rekap.
 */
final class BisyarohTables extends AbstractMigration
{
    public function up(): void
    {
        if (!$this->hasTable('lembaga') || !$this->hasTable('pengurus')) {
            return;
        }

        $this->execute(<<<'SQL'
CREATE TABLE IF NOT EXISTS `bisyaroh` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `lembaga_id` varchar(50) NOT NULL,
  `nama` varchar(255) DEFAULT NULL COMMENT 'Label set konfigurasi (opsional)',
  `aktif` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_bisyaroh_lembaga` (`lembaga_id`),
  KEY `idx_bisyaroh_aktif` (`aktif`),
  CONSTRAINT `fk_bisyaroh_lembaga` FOREIGN KEY (`lembaga_id`) REFERENCES `lembaga` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci ROW_FORMAT=DYNAMIC
COMMENT='Induk konfigurasi Bisyaroh per lembaga'
SQL);

        $this->execute(<<<'SQL'
CREATE TABLE IF NOT EXISTS `bisyaroh___aturan` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `bisyaroh_id` int(11) NOT NULL,
  `rule_key` varchar(64) NOT NULL COMMENT 'Mis. jam_masuk, absen_harian, persentase, bonus',
  `judul` varchar(255) DEFAULT NULL COMMENT 'Label tampilan untuk admin',
  `id_pengurus` int(7) DEFAULT NULL COMMENT 'NULL = berlaku umum untuk set; terisi = override per pengurus',
  `value_json` json DEFAULT NULL COMMENT 'Nilai fleksibel (jam, angka, teks, objek)',
  `sort_order` int(11) NOT NULL DEFAULT 0,
  `aktif` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_bisyaroh___aturan_bisyaroh` (`bisyaroh_id`),
  KEY `idx_bisyaroh___aturan_pengurus` (`id_pengurus`),
  KEY `idx_bisyaroh___aturan_rule` (`rule_key`),
  CONSTRAINT `fk_bisyaroh___aturan_bisyaroh` FOREIGN KEY (`bisyaroh_id`) REFERENCES `bisyaroh` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_bisyaroh___aturan_pengurus` FOREIGN KEY (`id_pengurus`) REFERENCES `pengurus` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci ROW_FORMAT=DYNAMIC
COMMENT='Aturan Bisyaroh — jam masuk, absen, persentase, bonus, dll.'
SQL);

        $this->execute(<<<'SQL'
CREATE TABLE IF NOT EXISTS `bisyaroh___rekap_baris` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `bisyaroh_id` int(11) NOT NULL,
  `id_pengurus` int(7) NOT NULL,
  `periode_bulan` char(7) NOT NULL COMMENT 'Format YYYY-MM',
  `nilai_json` json DEFAULT NULL COMMENT 'Rekap fleksibel (skor, bonus, catatan numerik)',
  `catatan` varchar(512) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_bisyaroh_rekap_pengurus_bulan` (`bisyaroh_id`,`id_pengurus`,`periode_bulan`),
  KEY `idx_bisyaroh___rekap_bisyaroh` (`bisyaroh_id`),
  KEY `idx_bisyaroh___rekap_pengurus` (`id_pengurus`),
  CONSTRAINT `fk_bisyaroh___rekap_bisyaroh` FOREIGN KEY (`bisyaroh_id`) REFERENCES `bisyaroh` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_bisyaroh___rekap_pengurus` FOREIGN KEY (`id_pengurus`) REFERENCES `pengurus` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci ROW_FORMAT=DYNAMIC
COMMENT='Baris rekap Bisyaroh per pengurus per bulan'
SQL);
    }

    public function down(): void
    {
        $this->execute('DROP TABLE IF EXISTS `bisyaroh___rekap_baris`');
        $this->execute('DROP TABLE IF EXISTS `bisyaroh___aturan`');
        $this->execute('DROP TABLE IF EXISTS `bisyaroh`');
    }
}
