<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * payment, payment___transaction, payment___callback, payment___config.
 * Semua definisi inline di PHP. FK ke umroh___jamaah (migrasi 14) — FOREIGN_KEY_CHECKS=0.
 */
final class Payment extends AbstractMigration
{
    public function up(): void
    {
        $this->execute('SET FOREIGN_KEY_CHECKS = 0');

        $sqls = [
            "CREATE TABLE IF NOT EXISTS `payment` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `jenis_pembayaran` enum('Pendaftaran','Uwaba','Tunggakan','Khusus','Tabungan','Umroh') NOT NULL,
  `id_referensi` int(11) DEFAULT NULL,
  `tabel_referensi` varchar(50) DEFAULT NULL,
  `id_santri` int(7) DEFAULT NULL,
  `id_jamaah` int(11) DEFAULT NULL,
  `nominal` decimal(15,2) NOT NULL DEFAULT 0.00,
  `metode_pembayaran` varchar(50) DEFAULT 'Cash',
  `via` varchar(50) DEFAULT NULL,
  `bank` varchar(100) DEFAULT NULL,
  `no_rekening` varchar(50) DEFAULT NULL,
  `bukti_pembayaran` varchar(255) DEFAULT NULL,
  `keterangan` text DEFAULT NULL,
  `hijriyah` varchar(50) DEFAULT NULL,
  `masehi` date DEFAULT NULL,
  `id_admin` int(11) DEFAULT NULL,
  `admin` varchar(255) DEFAULT NULL,
  `status` enum('Pending','Success','Failed','Cancelled') NOT NULL DEFAULT 'Success',
  `id_payment_gateway` varchar(100) DEFAULT NULL,
  `id_payment_transaction` int(11) DEFAULT NULL,
  `tanggal_dibuat` timestamp NOT NULL DEFAULT current_timestamp(),
  `tanggal_update` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_jenis_pembayaran` (`jenis_pembayaran`),
  KEY `idx_id_referensi` (`id_referensi`,`tabel_referensi`),
  KEY `idx_id_santri` (`id_santri`),
  KEY `idx_id_jamaah` (`id_jamaah`),
  KEY `idx_id_admin` (`id_admin`),
  KEY `idx_status` (`status`),
  KEY `idx_tanggal_dibuat` (`tanggal_dibuat`),
  KEY `fk_payment_id_payment_transaction` (`id_payment_transaction`),
  CONSTRAINT `fk_payment_id_admin` FOREIGN KEY (`id_admin`) REFERENCES `pengurus` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_payment_id_jamaah` FOREIGN KEY (`id_jamaah`) REFERENCES `umroh___jamaah` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_payment_id_payment_transaction` FOREIGN KEY (`id_payment_transaction`) REFERENCES `payment___transaction` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_payment_id_santri` FOREIGN KEY (`id_santri`) REFERENCES `santri` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
            "CREATE TABLE IF NOT EXISTS `payment___transaction` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `id_payment` int(11) DEFAULT NULL,
  `session_id` varchar(255) DEFAULT NULL,
  `reference_id` varchar(255) DEFAULT NULL,
  `trx_id` varchar(255) DEFAULT NULL,
  `payment_method` enum('va','cstore','qris','cod') DEFAULT NULL,
  `payment_channel` varchar(50) DEFAULT NULL,
  `amount` decimal(15,2) NOT NULL DEFAULT 0.00,
  `fee` decimal(15,2) DEFAULT NULL,
  `sub_total` decimal(15,2) DEFAULT NULL,
  `total` decimal(15,2) DEFAULT NULL,
  `status` enum('pending','paid','expired','failed','cancelled','refunded') NOT NULL DEFAULT 'pending',
  `settlement_status` enum('settled','unsettled') DEFAULT NULL,
  `status_code` varchar(50) DEFAULT NULL,
  `status_message` text DEFAULT NULL,
  `payment_url` text DEFAULT NULL,
  `qr_code` text DEFAULT NULL,
  `va_number` varchar(50) DEFAULT NULL,
  `expired_at` datetime DEFAULT NULL,
  `paid_at` datetime DEFAULT NULL,
  `notify_data` text DEFAULT NULL,
  `request_data` text DEFAULT NULL,
  `response_data` text DEFAULT NULL,
  `keterangan` text DEFAULT NULL,
  `tanggal_dibuat` timestamp NOT NULL DEFAULT current_timestamp(),
  `tanggal_update` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_reference_id` (`reference_id`),
  UNIQUE KEY `unique_session_id` (`session_id`),
  UNIQUE KEY `unique_trx_id` (`trx_id`),
  KEY `idx_id_payment` (`id_payment`),
  KEY `idx_status` (`status`),
  KEY `idx_payment_method` (`payment_method`),
  KEY `idx_tanggal_dibuat` (`tanggal_dibuat`),
  KEY `idx_expired_at` (`expired_at`),
  KEY `idx_settlement_status` (`settlement_status`),
  CONSTRAINT `fk_payment_transaction_id_payment` FOREIGN KEY (`id_payment`) REFERENCES `payment` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
            "CREATE TABLE IF NOT EXISTS `payment___callback` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `id_payment_transaction` int(11) DEFAULT NULL,
  `session_id` varchar(255) DEFAULT NULL,
  `trx_id` varchar(255) DEFAULT NULL,
  `reference_id` varchar(255) DEFAULT NULL,
  `status` varchar(50) DEFAULT NULL,
  `status_code` varchar(50) DEFAULT NULL,
  `status_message` text DEFAULT NULL,
  `amount` decimal(15,2) DEFAULT NULL,
  `fee` decimal(15,2) DEFAULT NULL,
  `sub_total` decimal(15,2) DEFAULT NULL,
  `total` decimal(15,2) DEFAULT NULL,
  `payment_method` varchar(50) DEFAULT NULL,
  `payment_channel` varchar(50) DEFAULT NULL,
  `paid_at` datetime DEFAULT NULL,
  `raw_data` text DEFAULT NULL,
  `ip_address` varchar(50) DEFAULT NULL,
  `user_agent` varchar(255) DEFAULT NULL,
  `is_processed` tinyint(1) NOT NULL DEFAULT 0,
  `processed_at` datetime DEFAULT NULL,
  `keterangan` text DEFAULT NULL,
  `tanggal_dibuat` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_id_payment_transaction` (`id_payment_transaction`),
  KEY `idx_session_id` (`session_id`),
  KEY `idx_trx_id` (`trx_id`),
  KEY `idx_reference_id` (`reference_id`),
  KEY `idx_status` (`status`),
  KEY `idx_is_processed` (`is_processed`),
  KEY `idx_tanggal_dibuat` (`tanggal_dibuat`),
  CONSTRAINT `fk_payment_callback_id_transaction` FOREIGN KEY (`id_payment_transaction`) REFERENCES `payment___transaction` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
            "CREATE TABLE IF NOT EXISTS `payment___config` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL DEFAULT 'iPaymu',
  `api_key` varchar(255) DEFAULT NULL,
  `api_secret` varchar(255) DEFAULT NULL,
  `va` varchar(50) DEFAULT NULL,
  `production_mode` tinyint(1) NOT NULL DEFAULT 0,
  `notify_url` varchar(500) DEFAULT NULL,
  `return_url` varchar(500) DEFAULT NULL,
  `cancel_url` varchar(500) DEFAULT NULL,
  `expired` int(11) DEFAULT 24,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `keterangan` text DEFAULT NULL,
  `tanggal_dibuat` timestamp NOT NULL DEFAULT current_timestamp(),
  `tanggal_update` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_is_active` (`is_active`),
  KEY `idx_production_mode` (`production_mode`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
        ];
        foreach ($sqls as $sql) {
            $this->execute($sql);
        }

        $this->execute('SET FOREIGN_KEY_CHECKS = 1');
    }

    public function down(): void
    {
        $this->execute('SET FOREIGN_KEY_CHECKS = 0');
        $this->execute('DROP TABLE IF EXISTS payment___config');
        $this->execute('DROP TABLE IF EXISTS payment___callback');
        $this->execute('DROP TABLE IF EXISTS payment___transaction');
        $this->execute('DROP TABLE IF EXISTS payment');
        $this->execute('SET FOREIGN_KEY_CHECKS = 1');
    }
}
