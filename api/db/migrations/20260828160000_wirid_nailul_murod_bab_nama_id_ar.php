<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Nama bab ganda: Indonesia (nama_id) dan Arab (nama_ar).
 * Kolom nama legacy = kunci kanonik (COALESCE nama_id, nama_ar).
 */
final class WiridNailulMurodBabNamaIdAr extends AbstractMigration
{
    public function up(): void
    {
        if (!$this->hasTable('wirid___nailul_murod_bab')) {
            return;
        }

        $table = $this->table('wirid___nailul_murod_bab');

        if (!$table->hasColumn('nama_id')) {
            $this->execute(<<<'SQL'
ALTER TABLE `wirid___nailul_murod_bab`
  ADD COLUMN `nama_id` varchar(255) NOT NULL DEFAULT '' COMMENT 'Nama bab Indonesia' AFTER `nama`,
  ADD COLUMN `nama_ar` varchar(255) NOT NULL DEFAULT '' COMMENT 'Nama bab Arab' AFTER `nama_id`
SQL);
        }

        $this->execute(<<<'SQL'
UPDATE `wirid___nailul_murod_bab`
SET `nama_id` = TRIM(`nama`), `nama_ar` = TRIM(`nama`)
WHERE TRIM(`nama`) <> '' AND (`nama_id` = '' OR `nama_ar` = '')
SQL);
    }

    public function down(): void
    {
        if (!$this->hasTable('wirid___nailul_murod_bab')) {
            return;
        }

        $table = $this->table('wirid___nailul_murod_bab');
        if ($table->hasColumn('nama_ar')) {
            $this->execute('ALTER TABLE `wirid___nailul_murod_bab` DROP COLUMN `nama_ar`');
        }
        if ($table->hasColumn('nama_id')) {
            $this->execute('ALTER TABLE `wirid___nailul_murod_bab` DROP COLUMN `nama_id`');
        }
    }
}
