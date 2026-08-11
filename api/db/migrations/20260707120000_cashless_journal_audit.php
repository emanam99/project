<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Audit journal cashless: pelaku (users.id), akun sumber/tujuan, channel, tipe TRANSFER.
 */
final class CashlessJournalAudit extends AbstractMigration
{
    public function up(): void
    {
        if (!$this->hasTable('cashless___journal')) {
            return;
        }

        $this->execute('SET FOREIGN_KEY_CHECKS = 0');

        $this->execute(
            "ALTER TABLE `cashless___journal`
             MODIFY COLUMN `type` enum('TOPUP','TRANSFER','PURCHASE','WITHDRAWAL','ADJUSTMENT','REVERSAL') NOT NULL"
        );

        $table = $this->table('cashless___journal');

        if (!$table->hasColumn('actor_user_id')) {
            $this->execute(
                "ALTER TABLE `cashless___journal`
                 ADD COLUMN `actor_user_id` int(11) DEFAULT NULL COMMENT 'users.id — pelaku/initiator' AFTER `created_by`,
                 ADD KEY `idx_actor_user_id` (`actor_user_id`)"
            );
        }

        if (!$table->hasColumn('source_account_id')) {
            $this->execute(
                "ALTER TABLE `cashless___journal`
                 ADD COLUMN `source_account_id` int(11) DEFAULT NULL COMMENT 'Akun sumber (wallet); NULL = uang masuk eksternal' AFTER `actor_user_id`,
                 ADD KEY `idx_source_account_id` (`source_account_id`)"
            );
        }

        if (!$table->hasColumn('dest_account_id')) {
            $this->execute(
                "ALTER TABLE `cashless___journal`
                 ADD COLUMN `dest_account_id` int(11) DEFAULT NULL COMMENT 'Akun tujuan (wallet penerima)' AFTER `source_account_id`,
                 ADD KEY `idx_dest_account_id` (`dest_account_id`)"
            );
        }

        if (!$table->hasColumn('channel')) {
            $this->execute(
                "ALTER TABLE `cashless___journal`
                 ADD COLUMN `channel` varchar(32) DEFAULT NULL COMMENT 'counter|gateway|wallet' AFTER `dest_account_id`,
                 ADD KEY `idx_channel` (`channel`)"
            );
        }

        $this->execute(
            'UPDATE `cashless___journal` SET `actor_user_id` = `created_by` WHERE `actor_user_id` IS NULL AND `created_by` IS NOT NULL'
        );

        $this->execute('SET FOREIGN_KEY_CHECKS = 1');
    }

    public function down(): void
    {
        if (!$this->hasTable('cashless___journal')) {
            return;
        }

        $this->execute('SET FOREIGN_KEY_CHECKS = 0');

        $table = $this->table('cashless___journal');

        if ($table->hasColumn('channel')) {
            $this->execute('ALTER TABLE `cashless___journal` DROP COLUMN `channel`');
        }
        if ($table->hasColumn('dest_account_id')) {
            $this->execute('ALTER TABLE `cashless___journal` DROP COLUMN `dest_account_id`');
        }
        if ($table->hasColumn('source_account_id')) {
            $this->execute('ALTER TABLE `cashless___journal` DROP COLUMN `source_account_id`');
        }
        if ($table->hasColumn('actor_user_id')) {
            $this->execute('ALTER TABLE `cashless___journal` DROP COLUMN `actor_user_id`');
        }

        $this->execute(
            "ALTER TABLE `cashless___journal`
             MODIFY COLUMN `type` enum('TOPUP','PURCHASE','WITHDRAWAL','ADJUSTMENT','REVERSAL') NOT NULL"
        );

        $this->execute('SET FOREIGN_KEY_CHECKS = 1');
    }
}
