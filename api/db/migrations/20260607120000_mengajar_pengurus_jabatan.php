<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Pindahkan flag mengajar dari pengurus ke pengurus___jabatan (per penugasan/lembaga).
 */
final class MengajarPengurusJabatan extends AbstractMigration
{
    public function up(): void
    {
        if (!$this->hasTable('pengurus___jabatan')) {
            return;
        }

        $pj = $this->table('pengurus___jabatan');
        if (!$pj->hasColumn('mengajar')) {
            $this->execute(
                "ALTER TABLE `pengurus___jabatan`
                 ADD `mengajar` TINYINT(1) NOT NULL DEFAULT 0
                 COMMENT '1=mengajar di lembaga/jabatan ini'
                 AFTER `status`"
            );
        }

        if ($this->hasTable('pengurus') && $this->table('pengurus')->hasColumn('mengajar')) {
            $this->execute(
                'UPDATE `pengurus___jabatan` pj
                 INNER JOIN `pengurus` p ON p.`id` = pj.`pengurus_id`
                 SET pj.`mengajar` = COALESCE(p.`mengajar`, 0)'
            );
            $this->execute('ALTER TABLE `pengurus` DROP COLUMN `mengajar`');
        }
    }

    public function down(): void
    {
        if ($this->hasTable('pengurus') && !$this->table('pengurus')->hasColumn('mengajar')) {
            $this->execute(
                "ALTER TABLE `pengurus`
                 ADD `mengajar` TINYINT(1) NOT NULL DEFAULT 0
                 COMMENT '1=mengajar, 0=tidak'
                 AFTER `sejak`"
            );
        }

        if ($this->hasTable('pengurus') && $this->hasTable('pengurus___jabatan')) {
            $this->execute(
                'UPDATE `pengurus` p
                 SET p.`mengajar` = CASE
                     WHEN EXISTS (
                         SELECT 1 FROM `pengurus___jabatan` pj
                         WHERE pj.`pengurus_id` = p.`id` AND pj.`mengajar` = 1
                     ) THEN 1
                     ELSE 0
                 END'
            );
        }

        if ($this->hasTable('pengurus___jabatan') && $this->table('pengurus___jabatan')->hasColumn('mengajar')) {
            $this->execute('ALTER TABLE `pengurus___jabatan` DROP COLUMN `mengajar`');
        }
    }
}
