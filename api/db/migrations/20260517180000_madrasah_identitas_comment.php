<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Kolom madrasah.identitas — komentar tanpa rujukan NSM/NPSN (identitas madrasah murni).
 */
final class MadrasahIdentitasComment extends AbstractMigration
{
    public function up(): void
    {
        if ($this->hasTable('madrasah')) {
            $this->execute(
                "ALTER TABLE madrasah MODIFY COLUMN identitas VARCHAR(100) DEFAULT NULL COMMENT 'Identitas madrasah (kode unik lembaga)'"
            );
        }
    }

    public function down(): void
    {
        if ($this->hasTable('madrasah')) {
            $this->execute(
                "ALTER TABLE madrasah MODIFY COLUMN identitas VARCHAR(100) DEFAULT NULL COMMENT 'Nomor identitas (NSPN/NSM/dll)'"
            );
        }
    }
}
