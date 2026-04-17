<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

final class SantriCatatanKeterangan extends AbstractMigration
{
    public function up(): void
    {
        if (!$this->hasTable('santri___catatan')) {
            return;
        }
        if ($this->table('santri___catatan')->hasColumn('keterangan')) {
            return;
        }
        $this->execute(
            "ALTER TABLE `santri___catatan` ADD COLUMN `keterangan` VARCHAR(512) DEFAULT NULL COMMENT 'Konteks sumber (Domisili daerah·kamar / Rombel lembaga·kelas)' AFTER `catatan`"
        );
    }

    public function down(): void
    {
        if (!$this->hasTable('santri___catatan')) {
            return;
        }
        if (!$this->table('santri___catatan')->hasColumn('keterangan')) {
            return;
        }
        try {
            $this->execute('ALTER TABLE `santri___catatan` DROP COLUMN `keterangan`');
        } catch (\Throwable $e) {
            if (stripos($e->getMessage(), 'check that column/key exists') === false
                && stripos($e->getMessage(), 'Unknown column') === false) {
                throw $e;
            }
        }
    }
}
