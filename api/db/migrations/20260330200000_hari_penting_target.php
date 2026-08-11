<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Target audiens per hari penting: banyak lembaga (id = varchar seperti master lembaga) dan/atau banyak users (users.id int).
 * Tanpa baris di tabel ini = semua pengguna melihat event (global).
 */
final class HariPentingTarget extends AbstractMigration
{
    public function up(): void
    {
        if ($this->hasTable('psa___hari_penting_target')) {
            return;
        }
        $this->execute(<<<'SQL'
CREATE TABLE `psa___hari_penting_target` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `id_hari_penting` int(11) NOT NULL,
  `id_lembaga` varchar(50) DEFAULT NULL,
  `id_user` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_hpt_hari_penting` (`id_hari_penting`),
  KEY `idx_hpt_lembaga` (`id_lembaga`),
  KEY `idx_hpt_user` (`id_user`),
  CONSTRAINT `fk_hpt_hari_penting` FOREIGN KEY (`id_hari_penting`) REFERENCES `psa___hari_penting` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_hpt_lembaga` FOREIGN KEY (`id_lembaga`) REFERENCES `lembaga` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_hpt_user` FOREIGN KEY (`id_user`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
SQL);
    }

    public function down(): void
    {
        if ($this->hasTable('psa___hari_penting_target')) {
            $this->table('psa___hari_penting_target')->drop()->save();
        }
    }
}
