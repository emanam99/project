<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Tambah kolom foto_path ke cashless___pedagang (foto toko).
 */
final class CashlessPedagangFoto extends AbstractMigration
{
    public function up(): void
    {
        $table = $this->table('cashless___pedagang');
        if (!$table->hasColumn('foto_path')) {
            $table->addColumn('foto_path', 'string', ['limit' => 500, 'null' => true, 'after' => 'kode_toko'])
                ->update();
        }
    }

    public function down(): void
    {
        $table = $this->table('cashless___pedagang');
        if ($table->hasColumn('foto_path')) {
            $table->removeColumn('foto_path')->update();
        }
    }
}
