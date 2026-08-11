<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Catatan santri: jenis Putih (baik) / Hitam (perlu perhatian) untuk filter & laporan.
 */
final class SantriCatatanJenisPutihHitam extends AbstractMigration
{
    public function up(): void
    {
        if (!$this->hasTable('santri___catatan')) {
            return;
        }
        if ($this->table('santri___catatan')->hasColumn('jenis_catatan')) {
            return;
        }
        $this->execute(
            "ALTER TABLE `santri___catatan` ADD COLUMN `jenis_catatan` ENUM('putih','hitam') NOT NULL DEFAULT 'putih' COMMENT 'putih=catatan baik/positif, hitam=catatan buruk/perlu perhatian' AFTER `keterangan`"
        );
        try {
            $this->execute('CREATE INDEX `idx_santri_catatan_santri_jenis` ON `santri___catatan` (`id_santri`, `jenis_catatan`)');
        } catch (\Throwable $e) {
            if (stripos($e->getMessage(), 'Duplicate key name') === false) {
                throw $e;
            }
        }
    }

    public function down(): void
    {
        if (!$this->hasTable('santri___catatan')) {
            return;
        }
        if (!$this->table('santri___catatan')->hasColumn('jenis_catatan')) {
            return;
        }
        try {
            $this->execute('DROP INDEX `idx_santri_catatan_santri_jenis` ON `santri___catatan`');
        } catch (\Throwable $e) {
            if (stripos($e->getMessage(), 'check that column/key exists') === false
                && stripos($e->getMessage(), "Can't DROP") === false) {
                throw $e;
            }
        }
        $this->execute('ALTER TABLE `santri___catatan` DROP COLUMN `jenis_catatan`');
    }
}
