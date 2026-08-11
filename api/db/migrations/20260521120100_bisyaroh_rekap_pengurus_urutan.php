<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Urutan baris pengurus di tab Rekap Bisyaroh, per lembaga (disimpan di server).
 */
final class BisyarohRekapPengurusUrutan extends AbstractMigration
{
    public function up(): void
    {
        $this->execute(<<<'SQL'
CREATE TABLE IF NOT EXISTS `bisyaroh___rekap_pengurus_urutan` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `lembaga_id` varchar(32) NOT NULL,
  `id_pengurus` int(11) NOT NULL,
  `sort_order` int(11) NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_bisyaroh_rekap_pengurus_lembaga` (`lembaga_id`,`id_pengurus`),
  KEY `idx_bisyaroh_rekap_pengurus_lembaga_sort` (`lembaga_id`,`sort_order`),
  CONSTRAINT `fk_bisyaroh_rekap_pengurus_pengurus` FOREIGN KEY (`id_pengurus`) REFERENCES `pengurus` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci ROW_FORMAT=DYNAMIC
COMMENT='Urutan tampilan pengurus di rekap Bisyaroh per lembaga'
SQL);
    }

    public function down(): void
    {
        $this->execute('DROP TABLE IF EXISTS `bisyaroh___rekap_pengurus_urutan`');
    }
}
