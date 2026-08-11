<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Buku tamu — kunjungan mahrom via scan QR kartu CM.
 */
final class BukuTamu extends AbstractMigration
{
    public function up(): void
    {
        if (!$this->hasTable('mahrom')) {
            return;
        }

        $this->execute('SET FOREIGN_KEY_CHECKS = 0');

        $this->execute(<<<'SQL'
CREATE TABLE IF NOT EXISTS `buku_tamu` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `id_mahrom` int(11) NOT NULL,
  `id_kartu` int(11) DEFAULT NULL COMMENT 'cashless___kartu CM yang discan',
  `waktu_datang` datetime NOT NULL,
  `id_petugas` int(7) DEFAULT NULL,
  `tanggal_dibuat` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_buku_tamu_mahrom` (`id_mahrom`),
  KEY `idx_buku_tamu_waktu` (`waktu_datang`),
  KEY `idx_buku_tamu_kartu` (`id_kartu`),
  KEY `idx_buku_tamu_petugas` (`id_petugas`),
  CONSTRAINT `fk_buku_tamu_mahrom` FOREIGN KEY (`id_mahrom`) REFERENCES `mahrom` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_buku_tamu_petugas` FOREIGN KEY (`id_petugas`) REFERENCES `pengurus` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Kunjungan mahrom (scan kartu CM)'
SQL);

        if ($this->hasTable('cashless___kartu')) {
            $this->execute(<<<'SQL'
ALTER TABLE `buku_tamu`
  ADD CONSTRAINT `fk_buku_tamu_kartu` FOREIGN KEY (`id_kartu`) REFERENCES `cashless___kartu` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
SQL);
        }

        $this->execute(<<<'SQL'
CREATE TABLE IF NOT EXISTS `buku_tamu___santri` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `buku_tamu_id` int(11) NOT NULL,
  `id_santri` int(11) NOT NULL,
  `hubungan` varchar(50) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_buku_tamu_santri` (`buku_tamu_id`,`id_santri`),
  KEY `idx_buku_tamu___santri_santri` (`id_santri`),
  CONSTRAINT `fk_buku_tamu___santri_buku` FOREIGN KEY (`buku_tamu_id`) REFERENCES `buku_tamu` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_buku_tamu___santri_santri` FOREIGN KEY (`id_santri`) REFERENCES `santri` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Santri yang didatangi per kunjungan buku tamu'
SQL);

        $this->execute('SET FOREIGN_KEY_CHECKS = 1');
    }

    public function down(): void
    {
        $this->execute('SET FOREIGN_KEY_CHECKS = 0');
        $this->execute('DROP TABLE IF EXISTS `buku_tamu___santri`');
        $this->execute('DROP TABLE IF EXISTS `buku_tamu`');
        $this->execute('SET FOREIGN_KEY_CHECKS = 1');
    }
}
