<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Kolom tipe jabatan (string) — dipakai master & rumus @jabatan[tipe].
 */
final class JabatanTipeColumn extends AbstractMigration
{
    public function up(): void
    {
        if (!$this->hasTable('jabatan')) {
            return;
        }

        $table = $this->table('jabatan');
        if (!$table->hasColumn('tipe')) {
            $table->addColumn('tipe', 'string', [
                'limit' => 64,
                'null' => true,
                'default' => null,
                'comment' => 'Tipe/klasifikasi jabatan (teks bebas)',
                'after' => 'nama',
            ])->update();
        }
    }

    public function down(): void
    {
        if (!$this->hasTable('jabatan')) {
            return;
        }

        $table = $this->table('jabatan');
        if ($table->hasColumn('tipe')) {
            $table->removeColumn('tipe')->update();
        }
    }
}
