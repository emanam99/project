<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Tabel pengajuan NIS dibuat via Phinx tanpa CHARSET eksplisit — bisa latin1 dan merusak Arab/Latin extended.
 */
final class MybeddianNisPengajuanUtf8mb4 extends AbstractMigration
{
    public function up(): void
    {
        $this->execute('SET NAMES utf8mb4');

        if ($this->hasTable('mybeddian___nis_pengajuan')) {
            $this->execute(
                'ALTER TABLE `mybeddian___nis_pengajuan` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci'
            );
        }

        if ($this->hasTable('mybeddian___nis_check_attempt')) {
            $this->execute(
                'ALTER TABLE `mybeddian___nis_check_attempt` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci'
            );
        }
    }

    public function down(): void
    {
        // Tidak dikembalikan ke latin1 — risiko kehilangan data Unicode.
    }
}
