<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Kategori jabatan tidak lagi disimpan di jabatan; gunakan lembaga.kategori.
 */
final class JabatanDropKategoriColumn extends AbstractMigration
{
    public function up(): void
    {
        if (!$this->hasTable('jabatan')) {
            return;
        }

        $table = $this->table('jabatan');
        if ($table->hasColumn('kategori')) {
            $table->removeColumn('kategori')->update();
        }
    }

    public function down(): void
    {
        if (!$this->hasTable('jabatan')) {
            return;
        }

        $table = $this->table('jabatan');
        if (!$table->hasColumn('kategori')) {
            $table->addColumn('kategori', 'string', [
                'limit' => 32,
                'null' => false,
                'default' => 'struktural',
                'after' => 'nama',
            ])->update();
        }
    }
}
