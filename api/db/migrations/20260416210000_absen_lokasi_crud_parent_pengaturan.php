<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Pohon fitur: kelola titik (list/tambah/ubah/hapus) di bawah Tab Pengaturan;
 * hanya absen mandiri GPS (lokasi.absen) di bawah Tab Absen.
 */
final class AbsenLokasiCrudParentPengaturan extends AbstractMigration
{
    public function up(): void
    {
        $this->execute(<<<'SQL'
UPDATE `app___fitur` fl
INNER JOIN `app___fitur` p_peng
  ON p_peng.`id_app` = fl.`id_app` AND p_peng.`code` = 'action.absen.tab.pengaturan'
SET fl.`parent_id` = p_peng.`id`
WHERE fl.`id_app` = 1
  AND fl.`type` = 'action'
  AND fl.`code` IN (
    'action.absen.lokasi.list',
    'action.absen.lokasi.tambah',
    'action.absen.lokasi.ubah',
    'action.absen.lokasi.hapus'
  )
SQL);

        $this->execute(<<<'SQL'
UPDATE `app___fitur` fl
INNER JOIN `app___fitur` p_absen
  ON p_absen.`id_app` = fl.`id_app` AND p_absen.`code` = 'action.absen.tab.absen'
SET fl.`parent_id` = p_absen.`id`
WHERE fl.`id_app` = 1
  AND fl.`type` = 'action'
  AND fl.`code` = 'action.absen.lokasi.absen'
SQL);
    }

    public function down(): void
    {
        $this->execute(<<<'SQL'
UPDATE `app___fitur` fl
INNER JOIN `app___fitur` p_absen
  ON p_absen.`id_app` = fl.`id_app` AND p_absen.`code` = 'action.absen.tab.absen'
SET fl.`parent_id` = p_absen.`id`
WHERE fl.`id_app` = 1
  AND fl.`type` = 'action'
  AND fl.`code` LIKE 'action.absen.lokasi.%'
SQL);
    }
}
