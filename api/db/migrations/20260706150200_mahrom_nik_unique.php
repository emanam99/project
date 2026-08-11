<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * NIK mahrom harus unik (satu orang = satu record mahrom, banyak santri via relasi).
 */
final class MahromNikUnique extends AbstractMigration
{
    public function up(): void
    {
        $this->execute('ALTER TABLE `mahrom` DROP INDEX `idx_mahrom_nik`, ADD UNIQUE KEY `unique_mahrom_nik` (`nik`)');
    }

    public function down(): void
    {
        $this->execute('ALTER TABLE `mahrom` DROP INDEX `unique_mahrom_nik`, ADD KEY `idx_mahrom_nik` (`nik`)');
    }
}
