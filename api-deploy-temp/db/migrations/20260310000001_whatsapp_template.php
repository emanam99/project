<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Tabel template WA. Nama akhir: whatsapp___template (setelah migration rename).
 * Untuk fitur chat (pendaftaran, uwaba, dll) — bisa dipakai di mana saja.
 */
final class WhatsappTemplate extends AbstractMigration
{
    public function up(): void
    {
        $this->execute('SET NAMES utf8mb4');
        $this->execute(<<<'SQL'
CREATE TABLE IF NOT EXISTS `whatsapp_template` (
  `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `kategori` varchar(100) NOT NULL DEFAULT 'umum' COMMENT 'Kategori template (pendaftaran, uwaba, umum, dll)',
  `nama` varchar(255) NOT NULL COMMENT 'Nama/label template',
  `isi_pesan` text NOT NULL COMMENT 'Isi pesan template',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_kategori` (`kategori`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Template pesan WhatsApp per kategori';
SQL
        );
    }

    public function down(): void
    {
        $this->execute('DROP TABLE IF EXISTS `whatsapp_template`');
    }
}
