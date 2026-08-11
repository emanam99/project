<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/** Pemegang kartu wali (CW): Ayah, Ibu, atau Wali lain. */
final class CashlessKartuWaliHolder extends AbstractMigration
{
    public function up(): void
    {
        if (!$this->hasTable('cashless___kartu')) {
            return;
        }
        $table = $this->table('cashless___kartu');
        if (!$table->hasColumn('wali_holder')) {
            $table->addColumn('wali_holder', 'enum', [
                'values' => ['AYAH', 'IBU', 'WALI'],
                'null' => true,
                'default' => null,
                'after' => 'user_id',
                'comment' => 'Pemegang kartu CW: nama ayah/ibu/wali di kartu fisik',
            ])->update();
        }
    }

    public function down(): void
    {
        if (!$this->hasTable('cashless___kartu')) {
            return;
        }
        $table = $this->table('cashless___kartu');
        if ($table->hasColumn('wali_holder')) {
            $table->removeColumn('wali_holder')->update();
        }
    }
}
