<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * santri___ijin: mode ijin sehari + jam mulai/selesai.
 */
final class SantriIjinSehariJam extends AbstractMigration
{
    public function up(): void
    {
        if (!$this->hasTable('santri___ijin')) {
            return;
        }
        $table = $this->table('santri___ijin');
        if (!$table->hasColumn('ijin_sehari')) {
            $table->addColumn('ijin_sehari', 'boolean', [
                'default' => false,
                'null' => false,
                'after' => 'lama',
            ])->update();
        }
        $table = $this->table('santri___ijin');
        if (!$table->hasColumn('jam_dari')) {
            $table->addColumn('jam_dari', 'time', [
                'null' => true,
                'after' => 'ijin_sehari',
            ])->update();
        }
        $table = $this->table('santri___ijin');
        if (!$table->hasColumn('jam_sampai')) {
            $table->addColumn('jam_sampai', 'time', [
                'null' => true,
                'after' => 'jam_dari',
            ])->update();
        }
    }

    public function down(): void
    {
        if (!$this->hasTable('santri___ijin')) {
            return;
        }
        $table = $this->table('santri___ijin');
        if ($table->hasColumn('jam_sampai')) {
            $this->execute('ALTER TABLE santri___ijin DROP COLUMN jam_sampai');
        }
        $table = $this->table('santri___ijin');
        if ($table->hasColumn('jam_dari')) {
            $this->execute('ALTER TABLE santri___ijin DROP COLUMN jam_dari');
        }
        $table = $this->table('santri___ijin');
        if ($table->hasColumn('ijin_sehari')) {
            $this->execute('ALTER TABLE santri___ijin DROP COLUMN ijin_sehari');
        }
    }
}
