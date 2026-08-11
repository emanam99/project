<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * PIN kartu CS, item penjualan (snapshot harga), perluasan jenis mutasi stok.
 */
final class CashlessPenjualanPinStok extends AbstractMigration
{
    public function up(): void
    {
        $this->execute('SET FOREIGN_KEY_CHECKS = 0');

        if ($this->hasTable('cashless___kartu')) {
            $kartu = $this->table('cashless___kartu');
            if (!$kartu->hasColumn('pin_hash')) {
                $this->execute(
                    "ALTER TABLE `cashless___kartu`
                     ADD COLUMN `pin_hash` varchar(255) DEFAULT NULL COMMENT 'password_hash PIN 6 digit (CS)' AFTER `secret_version`,
                     ADD COLUMN `pin_updated_at` timestamp NULL DEFAULT NULL AFTER `pin_hash`"
                );
            }
        }

        if ($this->hasTable('cashless___barang_stok')) {
            $this->execute(
                "UPDATE `cashless___barang_stok` SET `jenis` = 'terjual' WHERE `jenis` = 'keluar'"
            );
            $this->execute(
                "ALTER TABLE `cashless___barang_stok`
                 MODIFY COLUMN `jenis` enum('awal','masuk','terjual','retur','rusak','penyesuaian') NOT NULL DEFAULT 'masuk'"
            );
            $stok = $this->table('cashless___barang_stok');
            if (!$stok->hasColumn('referensi_tipe')) {
                $this->execute(
                    "ALTER TABLE `cashless___barang_stok`
                     ADD COLUMN `referensi_tipe` varchar(32) DEFAULT NULL COMMENT 'penjualan_item|...' AFTER `keterangan`,
                     ADD COLUMN `referensi_id` int(11) DEFAULT NULL AFTER `referensi_tipe`"
                );
            }
        }

        $this->execute(<<<'SQL'
CREATE TABLE IF NOT EXISTS `cashless___penjualan_item` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `transaksi_detail_id` int(11) NOT NULL,
  `barang_id` int(11) DEFAULT NULL,
  `kode_barang` varchar(100) NOT NULL DEFAULT '',
  `nama_barang` varchar(255) NOT NULL,
  `harga_satuan` decimal(18,2) NOT NULL DEFAULT 0.00,
  `qty` int(11) NOT NULL DEFAULT 1,
  `subtotal` decimal(18,2) NOT NULL DEFAULT 0.00,
  `tanggal_dibuat` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_penjualan_item_transaksi` (`transaksi_detail_id`),
  KEY `idx_penjualan_item_barang` (`barang_id`),
  CONSTRAINT `fk_penjualan_item_transaksi` FOREIGN KEY (`transaksi_detail_id`) REFERENCES `cashless___transaksi_detail` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_penjualan_item_barang` FOREIGN KEY (`barang_id`) REFERENCES `cashless___barang` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
SQL);

        $this->execute('SET FOREIGN_KEY_CHECKS = 1');
    }

    public function down(): void
    {
        $this->execute('SET FOREIGN_KEY_CHECKS = 0');
        $this->execute('DROP TABLE IF EXISTS `cashless___penjualan_item`');

        if ($this->hasTable('cashless___barang_stok')) {
            $stok = $this->table('cashless___barang_stok');
            if ($stok->hasColumn('referensi_tipe')) {
                $this->execute(
                    'ALTER TABLE `cashless___barang_stok` DROP COLUMN `referensi_tipe`, DROP COLUMN `referensi_id`'
                );
            }
            $this->execute(
                "UPDATE `cashless___barang_stok` SET `jenis` = 'keluar' WHERE `jenis` IN ('terjual','rusak')"
            );
            $this->execute(
                "UPDATE `cashless___barang_stok` SET `jenis` = 'masuk' WHERE `jenis` = 'retur'"
            );
            $this->execute(
                "ALTER TABLE `cashless___barang_stok`
                 MODIFY COLUMN `jenis` enum('awal','masuk','keluar','penyesuaian') NOT NULL DEFAULT 'masuk'"
            );
        }

        if ($this->hasTable('cashless___kartu')) {
            $kartu = $this->table('cashless___kartu');
            if ($kartu->hasColumn('pin_hash')) {
                $this->execute(
                    'ALTER TABLE `cashless___kartu` DROP COLUMN `pin_hash`, DROP COLUMN `pin_updated_at`'
                );
            }
        }

        $this->execute('SET FOREIGN_KEY_CHECKS = 1');
    }
}
