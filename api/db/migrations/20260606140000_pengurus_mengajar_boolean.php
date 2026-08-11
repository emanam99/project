<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Kolom pengurus.mengajar: varchar → TINYINT(1) (0/1).
 */
final class PengurusMengajarBoolean extends AbstractMigration
{
    public function up(): void
    {
        if (!$this->hasTable('pengurus') || !$this->table('pengurus')->hasColumn('mengajar')) {
            return;
        }

        $this->execute(
            "UPDATE `pengurus` SET `mengajar` = CASE
                WHEN `mengajar` IS NULL OR TRIM(`mengajar`) = '' THEN '0'
                WHEN LOWER(TRIM(`mengajar`)) IN ('1','true','ya','yes','on','y','iya') THEN '1'
                WHEN LOWER(TRIM(`mengajar`)) IN ('0','false','tidak','no','off','n') THEN '0'
                WHEN TRIM(`mengajar`) REGEXP '^[0-9]+$' AND CAST(TRIM(`mengajar`) AS UNSIGNED) > 0 THEN '1'
                ELSE '0'
            END"
        );

        $this->execute(
            "ALTER TABLE `pengurus`
             MODIFY `mengajar` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1=mengajar, 0=tidak'"
        );
    }

    public function down(): void
    {
        if (!$this->hasTable('pengurus') || !$this->table('pengurus')->hasColumn('mengajar')) {
            return;
        }

        $this->execute(
            "ALTER TABLE `pengurus`
             MODIFY `mengajar` VARCHAR(63) DEFAULT NULL"
        );
    }
}
