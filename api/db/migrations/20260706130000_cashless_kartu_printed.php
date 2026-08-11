<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/** Status cetak kartu fisik — terlihat semua admin. */
final class CashlessKartuPrinted extends AbstractMigration
{
    public function up(): void
    {
        if (!$this->hasTable('cashless___kartu')) {
            return;
        }
        $table = $this->table('cashless___kartu');
        if (!$table->hasColumn('printed_at')) {
            $table->addColumn('printed_at', 'timestamp', [
                'null' => true,
                'default' => null,
                'after' => 'created_by',
            ])->update();
        }
        if (!$table->hasColumn('printed_by')) {
            $table->addColumn('printed_by', 'integer', [
                'null' => true,
                'default' => null,
                'signed' => false,
                'after' => 'printed_at',
            ])->update();
        }
    }

    public function down(): void
    {
        if (!$this->hasTable('cashless___kartu')) {
            return;
        }
        $table = $this->table('cashless___kartu');
        if ($table->hasColumn('printed_by')) {
            $table->removeColumn('printed_by')->update();
        }
        if ($table->hasColumn('printed_at')) {
            $table->removeColumn('printed_at')->update();
        }
    }
}
