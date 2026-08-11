<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Kartu fisik cashless: CS (santri/transaksi), CM (mahrom), CW (wali).
 * Token QR disimpan sebagai SHA-256 hash; plain token hanya dikembalikan saat issue.
 */
final class CashlessKartu extends AbstractMigration
{
    public function up(): void
    {
        $this->execute('SET FOREIGN_KEY_CHECKS = 0');

        $this->execute(<<<'SQL'
CREATE TABLE IF NOT EXISTS `cashless___kartu` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `card_type` enum('SANTRI','MAHROM','WALI') NOT NULL COMMENT 'CS=SANTRI transaksi, CM=MAHROM, CW=WALI',
  `santri_id` int(11) NOT NULL,
  `account_id` int(11) DEFAULT NULL COMMENT 'Wallet CS; wajib untuk card_type SANTRI',
  `user_id` int(11) DEFAULT NULL COMMENT 'User wali (opsional, untuk CW)',
  `token_hash` char(64) NOT NULL COMMENT 'SHA-256 hex token QR penuh',
  `token_prefix` varchar(8) NOT NULL COMMENT 'CS1, CM1, CW1',
  `secret_version` int(11) NOT NULL DEFAULT 1,
  `status` enum('active','revoked') NOT NULL DEFAULT 'active',
  `issued_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `revoked_at` timestamp NULL DEFAULT NULL,
  `created_by` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_token_hash` (`token_hash`),
  KEY `idx_santri_type_status` (`santri_id`,`card_type`,`status`),
  KEY `idx_token_prefix` (`token_prefix`),
  KEY `idx_account_id` (`account_id`),
  KEY `idx_secret_version` (`secret_version`),
  CONSTRAINT `fk_cashless___kartu_santri` FOREIGN KEY (`santri_id`) REFERENCES `santri` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_cashless___kartu_account` FOREIGN KEY (`account_id`) REFERENCES `cashless___accounts` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_cashless___kartu_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
SQL);

        $this->execute("INSERT IGNORE INTO cashless___config (kunci, nilai) VALUES ('card_secret_version', '1')");

        $this->execute('SET FOREIGN_KEY_CHECKS = 1');
    }

    public function down(): void
    {
        $this->execute('SET FOREIGN_KEY_CHECKS = 0');
        $this->execute('DROP TABLE IF EXISTS `cashless___kartu`');
        $this->execute("DELETE FROM cashless___config WHERE kunci = 'card_secret_version'");
        $this->execute('SET FOREIGN_KEY_CHECKS = 1');
    }
}
