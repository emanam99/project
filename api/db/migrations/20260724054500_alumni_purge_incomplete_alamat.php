<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Sekali pakai: hapus alumni yang desa/kecamatan/kabupaten/provinsi kosong.
 */
final class AlumniPurgeIncompleteAlamat extends AbstractMigration
{
    public function up(): void
    {
        if (!$this->hasTable('alumni')) {
            return;
        }

        $this->execute(<<<'SQL'
DELETE FROM `alumni`
WHERE
  `desa` IS NULL OR TRIM(`desa`) = ''
  OR `kecamatan` IS NULL OR TRIM(`kecamatan`) = ''
  OR `kabupaten` IS NULL OR TRIM(`kabupaten`) = ''
  OR `provinsi` IS NULL OR TRIM(`provinsi`) = ''
SQL);
    }

    public function down(): void
    {
        // Data yang dihapus tidak bisa dikembalikan
    }
}
