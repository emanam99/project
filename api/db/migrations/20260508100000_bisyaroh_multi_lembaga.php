<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Satu set Bisyaroh dapat dipakai untuk beberapa lembaga (relasi N–N).
 */
final class BisyarohMultiLembaga extends AbstractMigration
{
    public function up(): void
    {
        if (!$this->hasTable('bisyaroh') || !$this->hasTable('lembaga')) {
            return;
        }

        $this->execute(<<<'SQL'
CREATE TABLE IF NOT EXISTS `bisyaroh___lembaga` (
  `bisyaroh_id` int(11) NOT NULL,
  `lembaga_id` varchar(50) NOT NULL,
  PRIMARY KEY (`bisyaroh_id`, `lembaga_id`),
  KEY `idx_bisyaroh___lembaga_lembaga` (`lembaga_id`),
  CONSTRAINT `fk_bisyaroh___lembaga_bisyaroh` FOREIGN KEY (`bisyaroh_id`) REFERENCES `bisyaroh` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_bisyaroh___lembaga_lembaga` FOREIGN KEY (`lembaga_id`) REFERENCES `lembaga` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci ROW_FORMAT=DYNAMIC
COMMENT='Lembaga yang memakai set Bisyaroh yang sama'
SQL);

        // Backfill dari kolom induk `bisyaroh.lembaga_id`
        $this->execute(<<<'SQL'
INSERT IGNORE INTO `bisyaroh___lembaga` (`bisyaroh_id`, `lembaga_id`)
SELECT `id`, `lembaga_id` FROM `bisyaroh`
SQL);
    }

    public function down(): void
    {
        $this->execute('DROP TABLE IF EXISTS `bisyaroh___lembaga`');
    }
}
