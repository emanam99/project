<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

final class SantriCatatanBoyongSudahMengurusi extends AbstractMigration
{
    public function up(): void
    {
        if ($this->hasTable('santri___boyong')) {
            try {
                $this->execute(
                    "ALTER TABLE `santri___boyong` ADD COLUMN `sudah_mengurusi` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1=sudah mengurusi, 0=belum' AFTER `id_pengurus`"
                );
            } catch (\Throwable $e) {
                if (stripos($e->getMessage(), 'Duplicate column') === false) {
                    throw $e;
                }
            }
        }

        if (!$this->hasTable('santri___catatan')) {
            $this->execute(<<<'SQL'
CREATE TABLE `santri___catatan` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `tanggal_dibuat` timestamp NOT NULL DEFAULT current_timestamp(),
  `tanggal_update` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `id_santri` int(7) NOT NULL,
  `id_pengurus` int(7) DEFAULT NULL,
  `catatan` text NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_santri_catatan_id_santri` (`id_santri`),
  KEY `idx_santri_catatan_id_pengurus` (`id_pengurus`),
  CONSTRAINT `fk_santri_catatan_santri` FOREIGN KEY (`id_santri`) REFERENCES `santri` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_santri_catatan_pengurus` FOREIGN KEY (`id_pengurus`) REFERENCES `pengurus` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
SQL);
        }
    }

    public function down(): void
    {
        if ($this->hasTable('santri___catatan')) {
            $this->execute('DROP TABLE IF EXISTS `santri___catatan`');
        }
        if ($this->hasTable('santri___boyong')) {
            try {
                $this->execute('ALTER TABLE `santri___boyong` DROP COLUMN `sudah_mengurusi`');
            } catch (\Throwable $e) {
                if (stripos($e->getMessage(), 'check that column/key exists') === false
                    && stripos($e->getMessage(), "Unknown column") === false) {
                    throw $e;
                }
            }
        }
    }
}
