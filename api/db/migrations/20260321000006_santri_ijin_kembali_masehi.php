<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * santri___ijin: tanggal kembali (Masehi), konversi dari/sampai/perpanjang Hijriyah ke Masehi.
 */
final class SantriIjinKembaliMasehi extends AbstractMigration
{
    public function up(): void
    {
        if (!$this->hasTable('santri___ijin')) {
            return;
        }
        $table = $this->table('santri___ijin');
        if (!$table->hasColumn('tanggal_kembali')) {
            $table->addColumn('tanggal_kembali', 'date', ['null' => true])->update();
        }
        $table = $this->table('santri___ijin');
        if (!$table->hasColumn('dari_masehi')) {
            $table->addColumn('dari_masehi', 'string', ['limit' => 15, 'null' => true])->update();
        }
        $table = $this->table('santri___ijin');
        if (!$table->hasColumn('sampai_masehi')) {
            $table->addColumn('sampai_masehi', 'string', ['limit' => 15, 'null' => true])->update();
        }
        $table = $this->table('santri___ijin');
        if (!$table->hasColumn('perpanjang_masehi')) {
            $table->addColumn('perpanjang_masehi', 'string', ['limit' => 15, 'null' => true])->update();
        }
    }

    public function down(): void
    {
        if (!$this->hasTable('santri___ijin')) {
            return;
        }
        $table = $this->table('santri___ijin');
        if ($table->hasColumn('perpanjang_masehi')) {
            $this->execute('ALTER TABLE santri___ijin DROP COLUMN perpanjang_masehi');
        }
        $table = $this->table('santri___ijin');
        if ($table->hasColumn('sampai_masehi')) {
            $this->execute('ALTER TABLE santri___ijin DROP COLUMN sampai_masehi');
        }
        $table = $this->table('santri___ijin');
        if ($table->hasColumn('dari_masehi')) {
            $this->execute('ALTER TABLE santri___ijin DROP COLUMN dari_masehi');
        }
        $table = $this->table('santri___ijin');
        if ($table->hasColumn('tanggal_kembali')) {
            $this->execute('ALTER TABLE santri___ijin DROP COLUMN tanggal_kembali');
        }
    }
}
