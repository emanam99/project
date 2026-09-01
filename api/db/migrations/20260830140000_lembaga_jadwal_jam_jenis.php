<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Jam jadwal kurikulum: WIB atau Istiwa’ (nilai jam_mulai/jam_selesai sesuai jenis yang dipilih).
 */
final class LembagaJadwalJamJenis extends AbstractMigration
{
    public function up(): void
    {
        if (!$this->hasTable('lembaga___jadwal')) {
            return;
        }
        if ($this->table('lembaga___jadwal')->hasColumn('jam_jenis')) {
            return;
        }
        $this->execute("ALTER TABLE `lembaga___jadwal` ADD COLUMN `jam_jenis` ENUM('wib','istiwa') NOT NULL DEFAULT 'wib' AFTER `jam_selesai`");
    }

    public function down(): void
    {
        if (!$this->hasTable('lembaga___jadwal')) {
            return;
        }
        if ($this->table('lembaga___jadwal')->hasColumn('jam_jenis')) {
            $this->execute('ALTER TABLE `lembaga___jadwal` DROP COLUMN `jam_jenis`');
        }
    }
}
