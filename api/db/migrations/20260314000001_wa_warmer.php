<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Tabel warmer: pasangan nomor yang saling chat otomatis + pool pesan (template/import).
 */
final class WaWarmer extends AbstractMigration
{
    public function up(): void
    {
        $this->execute('SET NAMES utf8mb4');

        $this->execute(<<<'SQL'
CREATE TABLE IF NOT EXISTS `whatsapp___warmer_pair` (
  `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `session_id_1` varchar(50) NOT NULL COMMENT 'Session WA pertama (default, wa2, ...)',
  `session_id_2` varchar(50) NOT NULL COMMENT 'Session WA kedua',
  `wait_min_sec` smallint unsigned NOT NULL DEFAULT 5 COMMENT 'Jeda minimal antar pesan (detik)',
  `wait_max_sec` smallint unsigned NOT NULL DEFAULT 90 COMMENT 'Jeda maksimal antar pesan (detik)',
  `stop_after_conversations` int unsigned NOT NULL DEFAULT 200 COMMENT 'Berhenti setelah N percakapan',
  `rest_minutes` smallint unsigned NOT NULL DEFAULT 15 COMMENT 'Istirahat (menit) setelah stop',
  `language` varchar(10) NOT NULL DEFAULT 'id' COMMENT 'en | id',
  `category` varchar(50) NOT NULL DEFAULT 'education' COMMENT 'education | finance',
  `use_typing` tinyint(1) NOT NULL DEFAULT 1 COMMENT '1 = simulasi mengetik sebelum kirim',
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_active` (`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Pasangan nomor WA untuk warmer (saling chat otomatis)';
SQL
        );

        $this->execute(<<<'SQL'
CREATE TABLE IF NOT EXISTS `whatsapp___warmer` (
  `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `source` varchar(20) NOT NULL DEFAULT 'imported' COMMENT 'system | imported',
  `category` varchar(50) DEFAULT NULL COMMENT 'education | finance (untuk system/filter)',
  `language` varchar(10) DEFAULT NULL COMMENT 'en | id',
  `content` text NOT NULL COMMENT 'Isi pesan',
  `source_file` varchar(255) DEFAULT NULL COMMENT 'Nama file asal (import)',
  `format` varchar(20) DEFAULT NULL COMMENT 'txt | json | excel',
  `sort_order` int NOT NULL DEFAULT 0,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_source_category_lang` (`source`,`category`,`language`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Pool pesan warmer: template sistem + hasil import';
SQL
        );
    }

    public function down(): void
    {
        $this->execute('DROP TABLE IF EXISTS `whatsapp___warmer`');
        $this->execute('DROP TABLE IF EXISTS `whatsapp___warmer_pair`');
    }
}
