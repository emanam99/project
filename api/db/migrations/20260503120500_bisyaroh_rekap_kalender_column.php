<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Rekap Bisyaroh: pisahkan data per jenis kalender (Masehi vs Hijriyah) untuk periode YYYY-MM yang sama.
 */
final class BisyarohRekapKalenderColumn extends AbstractMigration
{
    public function up(): void
    {
        if (!$this->hasTable('bisyaroh___rekap_baris')) {
            return;
        }

        $this->execute(<<<'SQL'
ALTER TABLE `bisyaroh___rekap_baris`
  ADD COLUMN `kalender` ENUM('masehi','hijriyah') NOT NULL DEFAULT 'masehi'
    COMMENT 'Jenis kalender untuk periode_bulan (YYYY-MM)'
    AFTER `periode_bulan`
SQL);

        $this->execute('ALTER TABLE `bisyaroh___rekap_baris` DROP INDEX `uk_bisyaroh_rekap_pengurus_bulan`');

        $this->execute(<<<'SQL'
ALTER TABLE `bisyaroh___rekap_baris`
  ADD UNIQUE KEY `uk_bisyaroh_rekap_pengurus_bulan_kal` (`bisyaroh_id`,`id_pengurus`,`periode_bulan`,`kalender`)
SQL);
    }

    public function down(): void
    {
        if (!$this->hasTable('bisyaroh___rekap_baris')) {
            return;
        }

        $this->execute('ALTER TABLE `bisyaroh___rekap_baris` DROP INDEX `uk_bisyaroh_rekap_pengurus_bulan_kal`');

        $this->execute(<<<'SQL'
ALTER TABLE `bisyaroh___rekap_baris`
  ADD UNIQUE KEY `uk_bisyaroh_rekap_pengurus_bulan` (`bisyaroh_id`,`id_pengurus`,`periode_bulan`)
SQL);

        $this->execute('ALTER TABLE `bisyaroh___rekap_baris` DROP COLUMN `kalender`');
    }
}
