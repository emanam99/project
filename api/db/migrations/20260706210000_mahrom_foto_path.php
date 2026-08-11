<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/** Foto profil mahrom (kartu CM & buku tamu). */
final class MahromFotoPath extends AbstractMigration
{
    public function up(): void
    {
        if (!$this->hasTable('mahrom')) {
            return;
        }
        $table = $this->table('mahrom');
        if (!$table->hasColumn('foto_path')) {
            $table->addColumn('foto_path', 'string', [
                'limit' => 500,
                'null' => true,
                'default' => null,
                'after' => 'kode_pos',
                'comment' => 'Path relatif uploads/mahrom/ untuk foto kartu',
            ])->update();
        }
    }

    public function down(): void
    {
        if (!$this->hasTable('mahrom')) {
            return;
        }
        $table = $this->table('mahrom');
        if ($table->hasColumn('foto_path')) {
            $table->removeColumn('foto_path')->update();
        }
    }
}
