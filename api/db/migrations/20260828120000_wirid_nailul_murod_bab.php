<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Metadata bab Nailul Murod — nama & urutan tampilan (terpisah dari kolom bab di entri wirid).
 */
final class WiridNailulMurodBab extends AbstractMigration
{
    public function up(): void
    {
        $this->execute('SET NAMES utf8mb4');
        $this->execute('SET FOREIGN_KEY_CHECKS = 0');
        $this->execute(<<<'SQL'
CREATE TABLE IF NOT EXISTS `wirid___nailul_murod_bab` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `nama` varchar(255) NOT NULL COMMENT 'Nama bab (sinkron dengan wirid___nailul_murod.bab)',
  `urutan` int(11) NOT NULL DEFAULT 0 COMMENT 'Urutan tampilan bab',
  `tanggal_dibuat` timestamp NOT NULL DEFAULT current_timestamp(),
  `tanggal_diedit` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_nailul_bab_nama` (`nama`),
  KEY `idx_nailul_bab_urutan` (`urutan`, `id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
SQL);

        if ($this->hasTable('wirid___nailul_murod')) {
            $this->execute(<<<'SQL'
INSERT IGNORE INTO `wirid___nailul_murod_bab` (`nama`, `urutan`)
SELECT `nama`, (@row := @row + 1)
FROM (
  SELECT MIN(TRIM(`bab`)) AS `nama`
  FROM `wirid___nailul_murod`
  WHERE TRIM(`bab`) <> ''
  GROUP BY LOWER(TRIM(`bab`))
) AS `dedup`
CROSS JOIN (SELECT @row := 0) AS `r`
ORDER BY `nama` ASC
SQL);
        }

        $this->execute('SET FOREIGN_KEY_CHECKS = 1');
    }

    public function down(): void
    {
        $this->execute('SET FOREIGN_KEY_CHECKS = 0');
        $this->execute('DROP TABLE IF EXISTS `wirid___nailul_murod_bab`');
        $this->execute('SET FOREIGN_KEY_CHECKS = 1');
    }
}
