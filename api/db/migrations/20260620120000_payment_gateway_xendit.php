<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Dukungan multi gateway: kolom gateway_provider, config Xendit, pengaturan myBeddian.
 */
final class PaymentGatewayXendit extends AbstractMigration
{
    public function up(): void
    {
        if (!$this->hasTable('payment___transaction')) {
            return;
        }

        if (!$this->migrationColumnExists('payment___transaction', 'gateway_provider')) {
            $this->execute(
                "ALTER TABLE `payment___transaction` ADD COLUMN `gateway_provider` "
                . "ENUM('ipaymu','xendit') NOT NULL DEFAULT 'ipaymu' AFTER `id_payment`"
            );
            $this->execute(
                'ALTER TABLE `payment___transaction` ADD KEY `idx_gateway_provider` (`gateway_provider`)'
            );
        }

        $this->execute(
            "INSERT IGNORE INTO `payment___config` "
            . "(`name`, `api_key`, `api_secret`, `va`, `production_mode`, `is_active`, `keterangan`) VALUES "
            . "('Xendit', NULL, NULL, NULL, 0, 0, 'Sandbox — Secret API Key + Webhook Token (api_secret)')",
        );
        $this->execute(
            "INSERT IGNORE INTO `payment___config` "
            . "(`name`, `api_key`, `api_secret`, `va`, `production_mode`, `is_active`, `keterangan`) VALUES "
            . "('Xendit', NULL, NULL, NULL, 1, 0, 'Production — Secret API Key + Webhook Token (api_secret)')",
        );

        if ($this->hasTable('app___settings')) {
            $this->execute(
                "INSERT IGNORE INTO `app___settings` (`key`, `value`) VALUES ('mybeddian_payment_provider', 'ipaymu')"
            );
        }
    }

    public function down(): void
    {
        if ($this->hasTable('app___settings')) {
            $this->execute("DELETE FROM `app___settings` WHERE `key` = 'mybeddian_payment_provider'");
        }
        $this->execute("DELETE FROM `payment___config` WHERE `name` = 'Xendit'");
        if ($this->migrationColumnExists('payment___transaction', 'gateway_provider')) {
            $this->execute('ALTER TABLE `payment___transaction` DROP COLUMN `gateway_provider`');
        }
    }

    private function migrationColumnExists(string $table, string $column): bool
    {
        $t = str_replace('`', '``', $table);
        $c = str_replace('`', '``', $column);
        $rows = $this->fetchAll("SHOW COLUMNS FROM `{$t}` LIKE '{$c}'");

        return is_array($rows) && count($rows) > 0;
    }
}
