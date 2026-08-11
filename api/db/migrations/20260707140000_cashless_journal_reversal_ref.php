<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Referensi reversal ke jurnal asli (audit).
 */
final class CashlessJournalReversalRef extends AbstractMigration
{
    public function up(): void
    {
        if (!$this->hasTable('cashless___journal')) {
            return;
        }

        $table = $this->table('cashless___journal');
        if (!$table->hasColumn('reversal_of_journal_id')) {
            $this->execute(
                "ALTER TABLE `cashless___journal`
                 ADD COLUMN `reversal_of_journal_id` int(11) DEFAULT NULL COMMENT 'Jurnal yang dibatalkan (type REVERSAL)' AFTER `channel`,
                 ADD KEY `idx_reversal_of_journal_id` (`reversal_of_journal_id`)"
            );
        }
    }

    public function down(): void
    {
        if (!$this->hasTable('cashless___journal')) {
            return;
        }
        $table = $this->table('cashless___journal');
        if ($table->hasColumn('reversal_of_journal_id')) {
            $this->execute('ALTER TABLE `cashless___journal` DROP COLUMN `reversal_of_journal_id`');
        }
    }
}
