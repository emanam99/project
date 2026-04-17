<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Induk aksi lokasi GPS di pohon fitur: pindah ke Tab Absen (selaras accordion Fitur ebeddien).
 */
final class AbsenLokasiParentTabAbsen extends AbstractMigration
{
    public function up(): void
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

    public function down(): void
    {
        $this->execute(<<<'SQL'
UPDATE `app___fitur` fl
INNER JOIN `app___fitur` p_peng
  ON p_peng.`id_app` = fl.`id_app` AND p_peng.`code` = 'action.absen.tab.pengaturan'
SET fl.`parent_id` = p_peng.`id`
WHERE fl.`id_app` = 1
  AND fl.`type` = 'action'
  AND fl.`code` LIKE 'action.absen.lokasi.%'
SQL);
    }
}
