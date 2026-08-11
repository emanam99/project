<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Master alamat: titik pusat + radius opsional — dipakai bersama banyak titik lokasi (zona lebar).
 */
final class AbsenAlamatGpsZona extends AbstractMigration
{
    public function up(): void
    {
        if (!$this->hasTable('absen___alamat')) {
            return;
        }
        $t = $this->table('absen___alamat');
        if (!$t->hasColumn('latitude')) {
            $this->execute(
                'ALTER TABLE `absen___alamat`
                 ADD COLUMN `latitude` decimal(10,7) DEFAULT NULL COMMENT \'Pusat zona GPS opsional (derajat)\' AFTER `provinsi`,
                 ADD COLUMN `longitude` decimal(10,7) DEFAULT NULL COMMENT \'Pusat zona GPS opsional (derajat)\' AFTER `latitude`,
                 ADD COLUMN `radius_meter` int(10) unsigned DEFAULT NULL COMMENT \'Jangkauan zona (m); dipakai jika lat+lng terisi\' AFTER `longitude`'
            );
        }
    }

    public function down(): void
    {
        if (!$this->hasTable('absen___alamat')) {
            return;
        }
        $t = $this->table('absen___alamat');
        if ($t->hasColumn('radius_meter')) {
            $this->execute('ALTER TABLE `absen___alamat` DROP COLUMN `radius_meter`');
        }
        if ($t->hasColumn('longitude')) {
            $this->execute('ALTER TABLE `absen___alamat` DROP COLUMN `longitude`');
        }
        if ($t->hasColumn('latitude')) {
            $this->execute('ALTER TABLE `absen___alamat` DROP COLUMN `latitude`');
        }
    }
}
