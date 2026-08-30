<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Judul wirid ganda: Indonesia (judul_id) dan Arab (judul_ar).
 * Kolom judul legacy diisi COALESCE(judul_id, judul_ar) untuk kompatibilitas URL/cache lama.
 */
final class WiridNailulMurodJudulIdAr extends AbstractMigration
{
    public function up(): void
    {
        if (!$this->hasTable('wirid___nailul_murod')) {
            return;
        }

        $table = $this->table('wirid___nailul_murod');

        if (!$table->hasColumn('judul_id')) {
            $this->execute(<<<'SQL'
ALTER TABLE `wirid___nailul_murod`
  ADD COLUMN `judul_id` varchar(500) NOT NULL DEFAULT '' COMMENT 'Judul bahasa Indonesia' AFTER `judul`,
  ADD COLUMN `judul_ar` varchar(500) NOT NULL DEFAULT '' COMMENT 'Judul bahasa Arab' AFTER `judul_id`
SQL);
        }

        $this->execute(<<<'SQL'
UPDATE `wirid___nailul_murod`
SET `judul_id` = TRIM(`judul`), `judul_ar` = TRIM(`judul`)
WHERE TRIM(`judul`) <> '' AND (`judul_id` = '' OR `judul_ar` = '')
SQL);
    }

    public function down(): void
    {
        if (!$this->hasTable('wirid___nailul_murod')) {
            return;
        }

        $table = $this->table('wirid___nailul_murod');
        if ($table->hasColumn('judul_ar')) {
            $this->execute('ALTER TABLE `wirid___nailul_murod` DROP COLUMN `judul_ar`');
        }
        if ($table->hasColumn('judul_id')) {
            $this->execute('ALTER TABLE `wirid___nailul_murod` DROP COLUMN `judul_id`');
        }
    }
}
