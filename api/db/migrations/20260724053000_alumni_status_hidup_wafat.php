<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Kolom status alumni: hidup | wafat (default hidup).
 */
final class AlumniStatusHidupWafat extends AbstractMigration
{
    public function up(): void
    {
        if (!$this->hasTable('alumni')) {
            return;
        }
        $table = $this->table('alumni');
        if (!$table->hasColumn('status')) {
            $table
                ->addColumn('status', 'enum', [
                    'values' => ['hidup', 'wafat'],
                    'default' => 'hidup',
                    'null' => false,
                    'after' => 'gender',
                ])
                ->update();
        }
    }

    public function down(): void
    {
        if (!$this->hasTable('alumni')) {
            return;
        }
        $table = $this->table('alumni');
        if ($table->hasColumn('status')) {
            $table->removeColumn('status')->update();
        }
    }
}
