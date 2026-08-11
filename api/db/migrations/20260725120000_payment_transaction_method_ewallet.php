<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Izinkan payment_method = ewallet (iPaymu ShopeePay/DANA + Xendit e-wallet).
 */
final class PaymentTransactionMethodEwallet extends AbstractMigration
{
    public function up(): void
    {
        if (!$this->hasTable('payment___transaction')) {
            return;
        }
        $this->execute(
            "ALTER TABLE `payment___transaction`
             MODIFY COLUMN `payment_method` ENUM('va','cstore','qris','cod','ewallet') DEFAULT NULL"
        );
    }

    public function down(): void
    {
        if (!$this->hasTable('payment___transaction')) {
            return;
        }
        $this->execute(
            "UPDATE `payment___transaction` SET `payment_method` = NULL WHERE `payment_method` = 'ewallet'"
        );
        $this->execute(
            "ALTER TABLE `payment___transaction`
             MODIFY COLUMN `payment_method` ENUM('va','cstore','qris','cod') DEFAULT NULL"
        );
    }
}
