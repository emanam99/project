<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Ketentuan gaji Bisyaroh per master jabatan: bonus tetap & tarif per JP (Rupiah).
 */
final class JabatanBonusPerJp extends AbstractMigration
{
    public function up(): void
    {
        if (!$this->hasTable('jabatan')) {
            return;
        }

        $table = $this->table('jabatan');
        if (!$table->hasColumn('bonus')) {
            $table->addColumn('bonus', 'decimal', [
                'precision' => 15,
                'scale' => 2,
                'null' => true,
                'default' => null,
                'comment' => 'Bonus tetap (Rp), ketentuan Bisyaroh',
                'after' => 'urutan',
            ]);
        }
        if (!$table->hasColumn('per_jp')) {
            $table->addColumn('per_jp', 'decimal', [
                'precision' => 15,
                'scale' => 2,
                'null' => true,
                'default' => null,
                'comment' => 'Tarif per JP (Rp), ketentuan Bisyaroh',
                'after' => 'bonus',
            ]);
        }
        $table->update();
    }

    public function down(): void
    {
        if (!$this->hasTable('jabatan')) {
            return;
        }

        $table = $this->table('jabatan');
        if ($table->hasColumn('per_jp')) {
            $table->removeColumn('per_jp');
        }
        if ($table->hasColumn('bonus')) {
            $table->removeColumn('bonus');
        }
        $table->update();
    }
}
