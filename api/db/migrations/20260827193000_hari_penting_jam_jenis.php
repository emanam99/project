<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Jam hari penting: WIB atau Istiwa’ (nilai jam_mulai/jam_selesai sesuai jenis yang dipilih).
 */
final class HariPentingJamJenis extends AbstractMigration
{
    public function up(): void
    {
        if (!$this->hasTable('psa___hari_penting')) {
            return;
        }
        if ($this->table('psa___hari_penting')->hasColumn('jam_jenis')) {
            return;
        }
        $this->execute("ALTER TABLE `psa___hari_penting` ADD COLUMN `jam_jenis` ENUM('wib','istiwa') DEFAULT NULL AFTER `jam_selesai`");
        $this->execute("UPDATE `psa___hari_penting` SET `jam_jenis` = 'wib' WHERE `jam_mulai` IS NOT NULL OR `jam_selesai` IS NOT NULL");
    }

    public function down(): void
    {
        if (!$this->hasTable('psa___hari_penting')) {
            return;
        }
        if ($this->table('psa___hari_penting')->hasColumn('jam_jenis')) {
            $this->execute('ALTER TABLE `psa___hari_penting` DROP COLUMN `jam_jenis`');
        }
    }
}
