<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Menghubungkan item PSB (psb___item) dengan baris pengeluaran___rencana_detail lewat setoran uang (rencana).
 */
final class ItemSetor extends AbstractMigration
{
    public function up(): void
    {
        $this->execute('SET NAMES utf8mb4');
        $this->execute('SET FOREIGN_KEY_CHECKS = 0');
        $this->execute(<<<'SQL'
CREATE TABLE IF NOT EXISTS `item___setor` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `id_psb_item` int(11) NOT NULL COMMENT 'FK ke psb___item',
  `id_rencana_detail` int(11) NOT NULL COMMENT 'FK ke pengeluaran___rencana_detail',
  `jumlah` int(11) NOT NULL DEFAULT 1,
  `harga` decimal(15,2) NOT NULL DEFAULT 0.00,
  `nominal` decimal(15,2) NOT NULL DEFAULT 0.00,
  `id_admin` int(11) DEFAULT NULL,
  `tanggal_dibuat` timestamp NOT NULL DEFAULT current_timestamp(),
  `tanggal_update` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_item_setor_psb_item` (`id_psb_item`),
  KEY `idx_item_setor_rencana_detail` (`id_rencana_detail`),
  KEY `idx_item_setor_admin` (`id_admin`),
  CONSTRAINT `fk_item_setor_psb_item` FOREIGN KEY (`id_psb_item`) REFERENCES `psb___item` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_item_setor_rencana_detail` FOREIGN KEY (`id_rencana_detail`) REFERENCES `pengeluaran___rencana_detail` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_item_setor_admin` FOREIGN KEY (`id_admin`) REFERENCES `pengurus` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
SQL);
        $this->execute('SET FOREIGN_KEY_CHECKS = 1');
    }

    public function down(): void
    {
        $this->execute('SET FOREIGN_KEY_CHECKS = 0');
        $this->execute('DROP TABLE IF EXISTS `item___setor`');
        $this->execute('SET FOREIGN_KEY_CHECKS = 1');
    }
}
