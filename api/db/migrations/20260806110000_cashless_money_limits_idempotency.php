<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Batas uang cashless + tabel idempotency anti double-submit.
 */
final class CashlessMoneyLimitsIdempotency extends AbstractMigration
{
    public function up(): void
    {
        $this->execute(
            "INSERT IGNORE INTO `cashless___config` (`kunci`, `nilai`) VALUES
             ('topup_max_per_tx', '10000000'),
             ('withdraw_max_per_tx', '10000000'),
             ('transfer_max_per_tx', '5000000'),
             ('wallet_saldo_max', '50000000'),
             ('transfer_daily_max', '10000000'),
             ('duplicate_window_sec', '30')"
        );

        $this->execute(<<<'SQL'
CREATE TABLE IF NOT EXISTS `cashless___idempotency` (
  `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT,
  `idempotency_key` varchar(64) NOT NULL,
  `operation` varchar(32) NOT NULL,
  `actor_user_id` int(11) DEFAULT NULL,
  `journal_id` int(11) DEFAULT NULL,
  `response_json` mediumtext DEFAULT NULL,
  `http_status` smallint(6) NOT NULL DEFAULT 200,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_cashless_idempotency_key` (`idempotency_key`),
  KEY `idx_cashless_idempotency_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
SQL);
    }

    public function down(): void
    {
        $this->execute('DROP TABLE IF EXISTS `cashless___idempotency`');
        $this->execute(
            "DELETE FROM `cashless___config` WHERE `kunci` IN (
               'topup_max_per_tx','withdraw_max_per_tx','transfer_max_per_tx',
               'wallet_saldo_max','transfer_daily_max','duplicate_window_sec'
             )"
        );
    }
}
