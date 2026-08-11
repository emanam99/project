<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Tabel modul cashless (penamaan cashless___).
 * cashless___pedagang.id_users = FK ke users (login toko di Mybeddian).
 */
final class CashlessTables extends AbstractMigration
{
    public function up(): void
    {
        $this->execute('SET FOREIGN_KEY_CHECKS = 0');

        // 1. Toko – terhubung ke users via id_users
        $this->execute(<<<'SQL'
CREATE TABLE IF NOT EXISTS `cashless___pedagang` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `nama_toko` varchar(255) NOT NULL,
  `kode_toko` varchar(50) NOT NULL,
  `id_users` int(11) DEFAULT NULL,
  `tanggal_dibuat` timestamp NOT NULL DEFAULT current_timestamp(),
  `tanggal_update` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_kode_toko` (`kode_toko`),
  KEY `idx_id_users` (`id_users`),
  CONSTRAINT `fk_cashless___pedagang_id_users` FOREIGN KEY (`id_users`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
SQL);

        // 2. Chart of accounts (Kas + wallet santri/pedagang)
        $this->execute(<<<'SQL'
CREATE TABLE IF NOT EXISTS `cashless___accounts` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `code` varchar(20) NOT NULL,
  `name` varchar(255) NOT NULL,
  `type` enum('ASSET','LIABILITY') NOT NULL,
  `entity_type` enum('SYSTEM','SANTRI','PEDAGANG') NOT NULL,
  `entity_id` int(11) DEFAULT NULL,
  `balance_cached` decimal(18,2) NOT NULL DEFAULT 0.00,
  `tanggal_update` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_code` (`code`),
  KEY `idx_entity` (`entity_type`,`entity_id`),
  KEY `idx_balance` (`balance_cached`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
SQL);

        // 3. Header transaksi
        $this->execute(<<<'SQL'
CREATE TABLE IF NOT EXISTS `cashless___journal` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `type` enum('TOPUP','PURCHASE','WITHDRAWAL','ADJUSTMENT','REVERSAL') NOT NULL,
  `reference` varchar(255) DEFAULT NULL,
  `description` varchar(500) DEFAULT NULL,
  `meta` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `created_by` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_type` (`type`),
  KEY `idx_created_at` (`created_at`),
  KEY `idx_reference` (`reference`(100))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
SQL);

        // 4. Baris debit/kredit (double-entry)
        $this->execute(<<<'SQL'
CREATE TABLE IF NOT EXISTS `cashless___ledger_entries` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `journal_id` int(11) NOT NULL,
  `account_id` int(11) NOT NULL,
  `debit` decimal(18,2) NOT NULL DEFAULT 0.00,
  `credit` decimal(18,2) NOT NULL DEFAULT 0.00,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_journal_id` (`journal_id`),
  KEY `idx_account_id` (`account_id`),
  CONSTRAINT `fk_cashless___ledger_journal` FOREIGN KEY (`journal_id`) REFERENCES `cashless___journal` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_cashless___ledger_account` FOREIGN KEY (`account_id`) REFERENCES `cashless___accounts` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
SQL);

        // 5. Batas harian santri (wali)
        $this->execute(<<<'SQL'
CREATE TABLE IF NOT EXISTS `cashless___batas_harian_santri` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `santri_id` int(11) NOT NULL,
  `batas_per_hari` decimal(18,2) NOT NULL DEFAULT 0.00,
  `aktif` tinyint(1) NOT NULL DEFAULT 1,
  `tanggal_update` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `updated_by` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_santri` (`santri_id`),
  CONSTRAINT `fk_cashless___batas_santri` FOREIGN KEY (`santri_id`) REFERENCES `santri` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
SQL);

        // 6. Detail pembelian (untuk riwayat & cek batas harian)
        $this->execute(<<<'SQL'
CREATE TABLE IF NOT EXISTS `cashless___transaksi_detail` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `journal_id` int(11) NOT NULL,
  `santri_id` int(11) NOT NULL,
  `pedagang_id` int(11) NOT NULL,
  `nominal` decimal(18,2) NOT NULL,
  `keterangan` varchar(255) DEFAULT NULL,
  `transaksi_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_journal_id` (`journal_id`),
  KEY `idx_santri_id` (`santri_id`),
  KEY `idx_pedagang_id` (`pedagang_id`),
  KEY `idx_transaksi_at` (`transaksi_at`),
  CONSTRAINT `fk_cashless___transaksi_detail_journal` FOREIGN KEY (`journal_id`) REFERENCES `cashless___journal` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_cashless___transaksi_detail_santri` FOREIGN KEY (`santri_id`) REFERENCES `santri` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_cashless___transaksi_detail_pedagang` FOREIGN KEY (`pedagang_id`) REFERENCES `cashless___pedagang` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
SQL);

        // 7. Penarikan pedagang
        $this->execute(<<<'SQL'
CREATE TABLE IF NOT EXISTS `cashless___penarikan` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `pedagang_id` int(11) NOT NULL,
  `journal_id` int(11) DEFAULT NULL,
  `nominal` decimal(18,2) NOT NULL,
  `metode` varchar(50) DEFAULT NULL,
  `rekening` varchar(255) DEFAULT NULL,
  `status` enum('pending','selesai','ditolak') NOT NULL DEFAULT 'pending',
  `requested_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `processed_at` timestamp NULL DEFAULT NULL,
  `catatan` text DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_pedagang_id` (`pedagang_id`),
  KEY `idx_journal_id` (`journal_id`),
  KEY `idx_status` (`status`),
  CONSTRAINT `fk_cashless___penarikan_pedagang` FOREIGN KEY (`pedagang_id`) REFERENCES `cashless___pedagang` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_cashless___penarikan_journal` FOREIGN KEY (`journal_id`) REFERENCES `cashless___journal` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
SQL);

        $this->execute('SET FOREIGN_KEY_CHECKS = 1');
    }

    public function down(): void
    {
        $this->execute('SET FOREIGN_KEY_CHECKS = 0');
        $this->execute('DROP TABLE IF EXISTS `cashless___penarikan`');
        $this->execute('DROP TABLE IF EXISTS `cashless___transaksi_detail`');
        $this->execute('DROP TABLE IF EXISTS `cashless___batas_harian_santri`');
        $this->execute('DROP TABLE IF EXISTS `cashless___ledger_entries`');
        $this->execute('DROP TABLE IF EXISTS `cashless___journal`');
        $this->execute('DROP TABLE IF EXISTS `cashless___accounts`');
        $this->execute('DROP TABLE IF EXISTS `cashless___pedagang`');
        $this->execute('SET FOREIGN_KEY_CHECKS = 1');
    }
}
