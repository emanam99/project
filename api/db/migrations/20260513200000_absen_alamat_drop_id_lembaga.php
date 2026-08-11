<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Master alamat absen bersifat umum — pemilahan lembaga cukup di absen___lokasi.id_lembaga.
 */
final class AbsenAlamatDropIdLembaga extends AbstractMigration
{
    public function up(): void
    {
        if (!$this->hasTable('absen___alamat')) {
            return;
        }
        $t = $this->table('absen___alamat');
        if (!$t->hasColumn('id_lembaga')) {
            return;
        }
        $this->execute('ALTER TABLE `absen___alamat` DROP FOREIGN KEY `fk_absen_alamat_lembaga`');
        $this->execute('ALTER TABLE `absen___alamat` DROP INDEX `idx_absen_alamat_lembaga`');
        $this->execute('ALTER TABLE `absen___alamat` DROP COLUMN `id_lembaga`');
    }

    public function down(): void
    {
        if (!$this->hasTable('absen___alamat')) {
            return;
        }
        $t = $this->table('absen___alamat');
        if ($t->hasColumn('id_lembaga')) {
            return;
        }
        $this->execute(<<<'SQL'
ALTER TABLE `absen___alamat`
  ADD COLUMN `id_lembaga` varchar(50) DEFAULT NULL COMMENT 'Selaras absen___lokasi.id_lembaga / lembaga.id' AFTER `id`,
  ADD KEY `idx_absen_alamat_lembaga` (`id_lembaga`),
  ADD CONSTRAINT `fk_absen_alamat_lembaga` FOREIGN KEY (`id_lembaga`) REFERENCES `lembaga` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
SQL);
    }
}
