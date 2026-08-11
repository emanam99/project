<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Hari penting: tipe rentang tanggal (dari–sampai), Masehi atau Hijriyah (Y-m-d di kolom VARCHAR).
 */
final class HariPentingDariSampai extends AbstractMigration
{
    public function up(): void
    {
        $this->execute("ALTER TABLE `psa___hari_penting` MODIFY COLUMN `tipe` ENUM('per_hari','per_pekan','per_bulan','per_tahun','sekali','dari_sampai') NOT NULL");
        if (!$this->table('psa___hari_penting')->hasColumn('tanggal_dari')) {
            $this->execute('ALTER TABLE `psa___hari_penting` ADD COLUMN `tanggal_dari` VARCHAR(10) DEFAULT NULL AFTER `tahun`');
        }
        if (!$this->table('psa___hari_penting')->hasColumn('tanggal_sampai')) {
            $this->execute('ALTER TABLE `psa___hari_penting` ADD COLUMN `tanggal_sampai` VARCHAR(10) DEFAULT NULL AFTER `tanggal_dari`');
        }
    }

    public function down(): void
    {
        $this->execute("UPDATE `psa___hari_penting` SET `tipe` = 'sekali' WHERE `tipe` = 'dari_sampai'");
        if ($this->table('psa___hari_penting')->hasColumn('tanggal_sampai')) {
            $this->execute('ALTER TABLE `psa___hari_penting` DROP COLUMN `tanggal_sampai`');
        }
        if ($this->table('psa___hari_penting')->hasColumn('tanggal_dari')) {
            $this->execute('ALTER TABLE `psa___hari_penting` DROP COLUMN `tanggal_dari`');
        }
        $this->execute("ALTER TABLE `psa___hari_penting` MODIFY COLUMN `tipe` ENUM('per_hari','per_pekan','per_bulan','per_tahun','sekali') NOT NULL");
    }
}
