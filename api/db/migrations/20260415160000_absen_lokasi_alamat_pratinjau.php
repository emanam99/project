<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Alamat administratif opsional per titik absen — dipakai untuk pratinjau wilayah
 * (mengoreksi reverse geocode) bila koordinat berada dalam radius titik tersebut.
 * Tetap dipakai pratinjau meskipun titik tidak aktif (aktif = 0).
 */
final class AbsenLokasiAlamatPratinjau extends AbstractMigration
{
    public function up(): void
    {
        if (!$this->hasTable('absen___lokasi')) {
            return;
        }
        $t = $this->table('absen___lokasi');
        if (!$t->hasColumn('dusun')) {
            $this->execute(<<<'SQL'
ALTER TABLE `absen___lokasi`
  ADD COLUMN `dusun` varchar(191) DEFAULT NULL COMMENT 'Alamat pratinjau (opsional)' AFTER `sort_order`,
  ADD COLUMN `rt` varchar(32) DEFAULT NULL AFTER `dusun`,
  ADD COLUMN `rw` varchar(32) DEFAULT NULL AFTER `rt`,
  ADD COLUMN `desa` varchar(191) DEFAULT NULL AFTER `rw`,
  ADD COLUMN `kecamatan` varchar(191) DEFAULT NULL AFTER `desa`,
  ADD COLUMN `kabupaten` varchar(191) DEFAULT NULL AFTER `kecamatan`,
  ADD COLUMN `provinsi` varchar(191) DEFAULT NULL AFTER `kabupaten`
SQL);
        }
    }

    public function down(): void
    {
        if (!$this->hasTable('absen___lokasi')) {
            return;
        }
        $t = $this->table('absen___lokasi');
        if (!$t->hasColumn('dusun')) {
            return;
        }
        $this->execute(<<<'SQL'
ALTER TABLE `absen___lokasi`
  DROP COLUMN `provinsi`,
  DROP COLUMN `kabupaten`,
  DROP COLUMN `kecamatan`,
  DROP COLUMN `desa`,
  DROP COLUMN `rw`,
  DROP COLUMN `rt`,
  DROP COLUMN `dusun`
SQL);
    }
}
