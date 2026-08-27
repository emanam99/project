<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Hari penting tipe per bulan: tanggal bisa beberapa (CSV, mis. "1,15,31").
 */
final class HariPentingTanggalMulti extends AbstractMigration
{
    public function up(): void
    {
        $this->execute('ALTER TABLE `psa___hari_penting` MODIFY COLUMN `tanggal` VARCHAR(96) DEFAULT NULL');
    }

    public function down(): void
    {
        $this->execute('ALTER TABLE `psa___hari_penting` MODIFY COLUMN `tanggal` TINYINT(4) DEFAULT NULL');
    }
}
