<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Tabel barang yang dijual per toko (cashless___pedagang).
 * Penamaan selaras: cashless___barang.
 */
final class CashlessBarang extends AbstractMigration
{
    public function up(): void
    {
        $this->execute('SET FOREIGN_KEY_CHECKS = 0');
        $this->execute(<<<'SQL'
CREATE TABLE IF NOT EXISTS `cashless___barang` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `pedagang_id` int(11) NOT NULL,
  `nama_barang` varchar(255) NOT NULL,
  `harga` decimal(18,2) NOT NULL DEFAULT 0.00,
  `keterangan` varchar(500) DEFAULT NULL,
  `urutan` int(11) NOT NULL DEFAULT 0,
  `aktif` tinyint(1) NOT NULL DEFAULT 1,
  `tanggal_dibuat` timestamp NOT NULL DEFAULT current_timestamp(),
  `tanggal_update` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_pedagang_id` (`pedagang_id`),
  KEY `idx_aktif` (`aktif`),
  CONSTRAINT `fk_cashless___barang_pedagang` FOREIGN KEY (`pedagang_id`) REFERENCES `cashless___pedagang` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
SQL);
        $this->execute('SET FOREIGN_KEY_CHECKS = 1');
    }

    public function down(): void
    {
        $this->execute('SET FOREIGN_KEY_CHECKS = 0');
        $this->execute('DROP TABLE IF EXISTS `cashless___barang`');
        $this->execute('SET FOREIGN_KEY_CHECKS = 1');
    }
}
