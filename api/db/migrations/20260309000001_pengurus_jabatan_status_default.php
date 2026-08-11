<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Perbaikan data: set status = 'aktif' untuk baris pengurus___jabatan
 * yang status-nya NULL atau kosong (sesuai default di schema).
 */
final class PengurusJabatanStatusDefault extends AbstractMigration
{
    public function up(): void
    {
        $this->execute("UPDATE pengurus___jabatan SET status = 'aktif' WHERE status IS NULL OR TRIM(COALESCE(status, '')) = ''");
    }

    public function down(): void
    {
        // Tidak di-revert; data sudah diperbaiki
    }
}
