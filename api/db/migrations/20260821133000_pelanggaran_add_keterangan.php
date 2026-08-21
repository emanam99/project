<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Kolom keterangan pada master pelanggaran (teks panjang; nama tetap singkat).
 */
final class PelanggaranAddKeterangan extends AbstractMigration
{
    public function up(): void
    {
        if (!$this->hasTable('pelanggaran')) {
            return;
        }
        $table = $this->table('pelanggaran');
        if (!$table->hasColumn('keterangan')) {
            $table
                ->addColumn('keterangan', 'text', [
                    'null' => true,
                    'after' => 'nama',
                    'comment' => 'Uraian lengkap pelanggaran',
                ])
                ->update();
        }
    }

    public function down(): void
    {
        if (!$this->hasTable('pelanggaran')) {
            return;
        }
        $table = $this->table('pelanggaran');
        if ($table->hasColumn('keterangan')) {
            $table->removeColumn('keterangan')->update();
        }
    }
}
