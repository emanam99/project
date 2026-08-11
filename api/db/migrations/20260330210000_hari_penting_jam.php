<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Jam mulai / selesai opsional untuk hari penting (acara seharian vs slot waktu).
 */
final class HariPentingJam extends AbstractMigration
{
    public function up(): void
    {
        if (!$this->hasTable('psa___hari_penting')) {
            return;
        }
        if (!$this->table('psa___hari_penting')->hasColumn('jam_mulai')) {
            $this->execute('ALTER TABLE `psa___hari_penting` ADD COLUMN `jam_mulai` TIME NULL DEFAULT NULL AFTER `tanggal_sampai`');
        }
        if (!$this->table('psa___hari_penting')->hasColumn('jam_selesai')) {
            $this->execute('ALTER TABLE `psa___hari_penting` ADD COLUMN `jam_selesai` TIME NULL DEFAULT NULL AFTER `jam_mulai`');
        }
    }

    public function down(): void
    {
        if (!$this->hasTable('psa___hari_penting')) {
            return;
        }
        if ($this->table('psa___hari_penting')->hasColumn('jam_selesai')) {
            $this->execute('ALTER TABLE `psa___hari_penting` DROP COLUMN `jam_selesai`');
        }
        if ($this->table('psa___hari_penting')->hasColumn('jam_mulai')) {
            $this->execute('ALTER TABLE `psa___hari_penting` DROP COLUMN `jam_mulai`');
        }
    }
}
