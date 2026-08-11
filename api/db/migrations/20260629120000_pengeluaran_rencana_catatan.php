<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Catatan opsional saat approve/tolak rencana pengeluaran (level rencana, bukan item).
 */
final class PengeluaranRencanaCatatan extends AbstractMigration
{
    public function up(): void
    {
        if (!$this->hasTable('pengeluaran___rencana')) {
            return;
        }
        $table = $this->table('pengeluaran___rencana');
        if (!$table->hasColumn('catatan')) {
            $this->execute(
                "ALTER TABLE `pengeluaran___rencana` ADD COLUMN `catatan` text DEFAULT NULL "
                . "COMMENT 'Catatan/alasan saat approve atau tolak rencana' AFTER `ket`"
            );
        }
    }

    public function down(): void
    {
        if (!$this->hasTable('pengeluaran___rencana')) {
            return;
        }
        $table = $this->table('pengeluaran___rencana');
        if ($table->hasColumn('catatan')) {
            $this->execute('ALTER TABLE `pengeluaran___rencana` DROP COLUMN `catatan`');
        }
    }
}
