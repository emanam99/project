<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

final class PemasukanBackfillUwabaLembaga extends AbstractMigration
{
    public function up(): void
    {
        if (!$this->hasTable('pemasukan')) {
            return;
        }

        $this->execute("
            UPDATE pemasukan
            SET lembaga = 'UWABA'
            WHERE (lembaga IS NULL OR TRIM(lembaga) = '')
              AND kategori IN ('UWABA', 'Tunggakan', 'Khusus', 'PSB')
        ");
    }

    public function down(): void
    {
        if (!$this->hasTable('pemasukan')) {
            return;
        }

        $this->execute("
            UPDATE pemasukan
            SET lembaga = NULL
            WHERE lembaga = 'UWABA'
              AND kategori IN ('UWABA', 'Tunggakan', 'Khusus', 'PSB')
        ");
    }
}
