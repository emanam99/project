<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Jarak (km) dari yayasan ke rumah pengurus — dasar ongkos pulang-pergi ngajar.
 */
final class PengurusJarak extends AbstractMigration
{
    public function up(): void
    {
        if ($this->table('pengurus')->hasColumn('jarak')) {
            return;
        }
        $this->table('pengurus')
            ->addColumn('jarak', 'decimal', [
                'precision' => 10,
                'scale' => 2,
                'null' => true,
                'default' => null,
                'comment' => 'Jarak (km) dari yayasan ke rumah, untuk ongkos PPG ngajar',
                'after' => 'kode_pos',
            ])
            ->update();
    }

    public function down(): void
    {
        if ($this->table('pengurus')->hasColumn('jarak')) {
            $this->table('pengurus')->removeColumn('jarak')->update();
        }
    }
}
