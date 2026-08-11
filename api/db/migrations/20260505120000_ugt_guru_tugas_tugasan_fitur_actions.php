<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Aksi fitur: tambah / hapus penugasan Guru Tugas ke madrasah (offcanvas detail santri).
 * Penugasan role: role yang sudah punya salah satu menu UGT terkait mendapat kedua aksi (selaras perilaku lama).
 */
final class UgtGuruTugasTugasanFiturActions extends AbstractMigration
{
    private const ACTION_TAMBAH = 'action.ugt.guru_tugas.tugasan_tambah';
    private const ACTION_HAPUS = 'action.ugt.guru_tugas.tugasan_hapus';

    public function up(): void
    {
        $tambah = str_replace("'", "''", self::ACTION_TAMBAH);
        $hapus = str_replace("'", "''", self::ACTION_HAPUS);

        $this->execute(<<<SQL
INSERT IGNORE INTO `app___fitur` (`id_app`, `parent_id`, `type`, `code`, `label`, `path`, `icon_key`, `group_label`, `sort_order`, `meta_json`)
SELECT 1, pf.`id`, 'action', '{$tambah}', 'Guru Tugas · Tambah penugasan madrasah', NULL, NULL, 'UGT', 15, NULL
FROM `app___fitur` pf WHERE pf.`id_app` = 1 AND pf.`code` = 'menu.ugt.guru_tugas' LIMIT 1
SQL);
        $this->execute(<<<SQL
INSERT IGNORE INTO `app___fitur` (`id_app`, `parent_id`, `type`, `code`, `label`, `path`, `icon_key`, `group_label`, `sort_order`, `meta_json`)
SELECT 1, pf.`id`, 'action', '{$hapus}', 'Guru Tugas · Hapus penugasan madrasah', NULL, NULL, 'UGT', 16, NULL
FROM `app___fitur` pf WHERE pf.`id_app` = 1 AND pf.`code` = 'menu.ugt.guru_tugas' LIMIT 1
SQL);

        $codes = "'" . self::ACTION_TAMBAH . "','" . self::ACTION_HAPUS . "'";
        $this->execute(<<<SQL
INSERT IGNORE INTO `role___fitur` (`role_id`, `fitur_id`)
SELECT DISTINCT rf.`role_id`, af.`id`
FROM `role___fitur` rf
INNER JOIN `app___fitur` m ON m.`id` = rf.`fitur_id` AND m.`id_app` = 1
  AND m.`code` IN ('menu.ugt.guru_tugas','menu.ugt.data_madrasah','menu.ugt.laporan','menu.koordinator')
CROSS JOIN `app___fitur` af
WHERE af.`id_app` = 1 AND af.`type` = 'action' AND af.`code` IN ({$codes})
SQL);
    }

    public function down(): void
    {
        $codes = "'" . self::ACTION_TAMBAH . "','" . self::ACTION_HAPUS . "'";
        $this->execute(
            "DELETE rf FROM `role___fitur` rf INNER JOIN `app___fitur` f ON f.`id` = rf.`fitur_id` "
            . "WHERE f.`id_app` = 1 AND f.`type` = 'action' AND f.`code` IN ({$codes})"
        );
        $this->execute(
            "DELETE FROM `app___fitur` WHERE `id_app` = 1 AND `type` = 'action' AND `code` IN ({$codes})"
        );
    }
}
