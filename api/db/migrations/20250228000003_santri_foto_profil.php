<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Tambah kolom foto_profil di santri (untuk Mybeddian).
 * File disimpan di uploads/santri/ bersama berkas santri lainnya.
 */
final class SantriFotoProfil extends AbstractMigration
{
    public function up(): void
    {
        $table = $this->table('santri');
        if ($table->hasColumn('foto_profil')) {
            return;
        }
        $this->execute('SET SESSION innodb_strict_mode = 0');
        $this->execute("ALTER TABLE santri ADD COLUMN foto_profil VARCHAR(500) NULL DEFAULT NULL");
        $this->execute('SET SESSION innodb_strict_mode = 1');
    }

    public function down(): void
    {
        $table = $this->table('santri');
        if (!$table->hasColumn('foto_profil')) {
            return;
        }
        $this->execute("ALTER TABLE santri DROP COLUMN foto_profil");
    }
}
