<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Status aktif penugasan Guru Tugas (nonaktif = tetap di riwayat, tidak dipakai laporan/PJGT).
 */
final class UgtGuruTugasTugasanIsAktif extends AbstractMigration
{
    public function up(): void
    {
        if (!$this->hasTable('ugt___guru_tugas_tugasan')) {
            return;
        }
        $table = $this->table('ugt___guru_tugas_tugasan');
        if (!$table->hasColumn('is_aktif')) {
            $table->addColumn('is_aktif', 'boolean', [
                'default' => 1,
                'null' => false,
                'comment' => '1=aktif (tampil laporan/PJGT), 0=nonaktif',
                'after' => 'keterangan',
            ])->update();
        }
        $this->execute('UPDATE `ugt___guru_tugas_tugasan` SET `is_aktif` = 1 WHERE `is_aktif` IS NULL');
    }

    public function down(): void
    {
        if (!$this->hasTable('ugt___guru_tugas_tugasan')) {
            return;
        }
        $table = $this->table('ugt___guru_tugas_tugasan');
        if ($table->hasColumn('is_aktif')) {
            $table->removeColumn('is_aktif')->update();
        }
    }
}
