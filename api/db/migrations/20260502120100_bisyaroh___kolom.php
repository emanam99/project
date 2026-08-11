<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Kolom Bisyaroh: input pengguna vs rumus Excel-like; toggle masuk penjumlahan nominal.
 */
final class BisyarohKolom extends AbstractMigration
{
    public function up(): void
    {
        if (!$this->hasTable('bisyaroh')) {
            return;
        }

        $this->execute(<<<'SQL'
CREATE TABLE IF NOT EXISTS `bisyaroh___kolom` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `bisyaroh_id` int(11) NOT NULL,
  `col_key` varchar(64) NOT NULL COMMENT 'Slug untuk @[col_key], unik per set',
  `kind` enum('input','formula') NOT NULL DEFAULT 'input',
  `label` varchar(255) NOT NULL DEFAULT '',
  `keterangan` text DEFAULT NULL COMMENT 'Penjelasan untuk penerima gaji / admin',
  `rumus` text DEFAULT NULL COMMENT 'Hanya kind=formula; mis. @[hari]*15000',
  `input_tipe` enum('angka','rupiah','teks') NOT NULL DEFAULT 'angka',
  `default_nilai` varchar(64) DEFAULT NULL COMMENT 'Nilai awal input (angka/rupiah)',
  `masuk_total` tinyint(1) NOT NULL DEFAULT 1 COMMENT '1 = nilai kolom ikut jumlah total Rp',
  `sort_order` int(11) NOT NULL DEFAULT 0,
  `aktif` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_bisyaroh_kolom_key` (`bisyaroh_id`,`col_key`),
  KEY `idx_bisyaroh___kolom_bisyaroh` (`bisyaroh_id`),
  CONSTRAINT `fk_bisyaroh___kolom_bisyaroh` FOREIGN KEY (`bisyaroh_id`) REFERENCES `bisyaroh` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci ROW_FORMAT=DYNAMIC
COMMENT='Definisi kolom spreadsheet Bisyaroh (input / rumus)'
SQL);
    }

    public function down(): void
    {
        $this->execute('DROP TABLE IF EXISTS `bisyaroh___kolom`');
    }
}
