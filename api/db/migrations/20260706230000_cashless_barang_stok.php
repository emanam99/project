<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Stok barang toko: kolom stok di cashless___barang + riwayat mutasi cashless___barang_stok.
 */
final class CashlessBarangStok extends AbstractMigration
{
    public function up(): void
    {
        $this->execute('SET FOREIGN_KEY_CHECKS = 0');

        if ($this->hasTable('cashless___barang') && !$this->table('cashless___barang')->hasColumn('stok')) {
            $this->execute(
                'ALTER TABLE `cashless___barang` ADD COLUMN `stok` int(11) NOT NULL DEFAULT 0 COMMENT \'Stok tersedia\' AFTER `harga`'
            );
        }

        $this->execute(<<<'SQL'
CREATE TABLE IF NOT EXISTS `cashless___barang_stok` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `barang_id` int(11) NOT NULL,
  `pedagang_id` int(11) NOT NULL,
  `jumlah` int(11) NOT NULL COMMENT 'positif=masuk, negatif=keluar',
  `stok_setelah` int(11) NOT NULL DEFAULT 0,
  `jenis` enum('awal','masuk','keluar','penyesuaian') NOT NULL DEFAULT 'masuk',
  `keterangan` varchar(500) DEFAULT NULL,
  `users_id` int(11) DEFAULT NULL,
  `tanggal_dibuat` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_barang_stok_barang` (`barang_id`),
  KEY `idx_barang_stok_pedagang` (`pedagang_id`),
  KEY `idx_barang_stok_tanggal` (`tanggal_dibuat`),
  CONSTRAINT `fk_cashless___barang_stok_barang` FOREIGN KEY (`barang_id`) REFERENCES `cashless___barang` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_cashless___barang_stok_pedagang` FOREIGN KEY (`pedagang_id`) REFERENCES `cashless___pedagang` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
SQL);

        $this->execute('SET FOREIGN_KEY_CHECKS = 1');
    }

    public function down(): void
    {
        $this->execute('SET FOREIGN_KEY_CHECKS = 0');
        $this->execute('DROP TABLE IF EXISTS `cashless___barang_stok`');
        if ($this->hasTable('cashless___barang') && $this->table('cashless___barang')->hasColumn('stok')) {
            $this->execute('ALTER TABLE `cashless___barang` DROP COLUMN `stok`');
        }
        $this->execute('SET FOREIGN_KEY_CHECKS = 1');
    }
}
