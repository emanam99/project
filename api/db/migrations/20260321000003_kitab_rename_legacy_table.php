<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Basis yang sudah jalan migrasi lama punya tabel kitab___daftar — rename ke kitab.
 * Basis baru membuat langsung `kitab` dari 20260321000002.
 */
final class KitabRenameLegacyTable extends AbstractMigration
{
    public function up(): void
    {
        if ($this->hasTable('kitab___daftar') && !$this->hasTable('kitab')) {
            $this->execute('RENAME TABLE `kitab___daftar` TO `kitab`');
        }
    }

    public function down(): void
    {
        if ($this->hasTable('kitab') && !$this->hasTable('kitab___daftar')) {
            $this->execute('RENAME TABLE `kitab` TO `kitab___daftar`');
        }
    }
}
