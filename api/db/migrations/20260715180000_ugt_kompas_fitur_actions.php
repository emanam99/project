<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * KOMMPAS: aksi per tab (lomba/daftar/nilai/aturan) + tambah/ubah/hapus per tab.
 * Role yang sudah punya menu.ugt.kompas mendapat semua aksi (perilaku penuh seperti sebelumnya).
 */
final class UgtKompasFiturActions extends AbstractMigration
{
    /** @var list<array{0:string,1:string,2:int}> */
    private const ACTIONS = [
        ['action.ugt.kompas.tab.lomba', 'KOMMPAS · Tab Lomba', 10],
        ['action.ugt.kompas.lomba.tambah', 'KOMMPAS · Lomba · Tambah', 11],
        ['action.ugt.kompas.lomba.ubah', 'KOMMPAS · Lomba · Ubah', 12],
        ['action.ugt.kompas.lomba.hapus', 'KOMMPAS · Lomba · Hapus', 13],

        ['action.ugt.kompas.tab.daftar', 'KOMMPAS · Tab Daftar', 20],
        ['action.ugt.kompas.daftar.tambah', 'KOMMPAS · Daftar · Tambah', 21],
        ['action.ugt.kompas.daftar.ubah', 'KOMMPAS · Daftar · Ubah', 22],
        ['action.ugt.kompas.daftar.hapus', 'KOMMPAS · Daftar · Hapus', 23],

        ['action.ugt.kompas.tab.nilai', 'KOMMPAS · Tab Nilai', 30],
        ['action.ugt.kompas.nilai.tambah', 'KOMMPAS · Nilai · Tambah', 31],
        ['action.ugt.kompas.nilai.ubah', 'KOMMPAS · Nilai · Ubah', 32],
        ['action.ugt.kompas.nilai.hapus', 'KOMMPAS · Nilai · Hapus', 33],

        ['action.ugt.kompas.tab.aturan', 'KOMMPAS · Tab Aturan Umum', 40],
        ['action.ugt.kompas.aturan.tambah', 'KOMMPAS · Aturan · Tambah', 41],
        ['action.ugt.kompas.aturan.ubah', 'KOMMPAS · Aturan · Ubah', 42],
        ['action.ugt.kompas.aturan.hapus', 'KOMMPAS · Aturan · Hapus', 43],
    ];

    public function up(): void
    {
        foreach (self::ACTIONS as [$code, $label, $sort]) {
            $c = str_replace("'", "''", $code);
            $l = str_replace("'", "''", $label);
            $this->execute(<<<SQL
INSERT IGNORE INTO `app___fitur` (`id_app`, `parent_id`, `type`, `code`, `label`, `path`, `icon_key`, `group_label`, `sort_order`, `meta_json`)
SELECT 1, pf.`id`, 'action', '{$c}', '{$l}', NULL, NULL, 'UGT', {$sort}, NULL
FROM `app___fitur` pf WHERE pf.`id_app` = 1 AND pf.`code` = 'menu.ugt.kompas' LIMIT 1
SQL);
        }

        $in = "'" . implode("','", array_column(self::ACTIONS, 0)) . "'";
        $this->execute(<<<SQL
INSERT IGNORE INTO `role___fitur` (`role_id`, `fitur_id`)
SELECT DISTINCT rf.`role_id`, af.`id`
FROM `role___fitur` rf
INNER JOIN `app___fitur` m ON m.`id` = rf.`fitur_id` AND m.`id_app` = 1 AND m.`code` = 'menu.ugt.kompas'
CROSS JOIN `app___fitur` af
WHERE af.`id_app` = 1 AND af.`type` = 'action' AND af.`code` IN ({$in})
SQL);
    }

    public function down(): void
    {
        $in = "'" . implode("','", array_column(self::ACTIONS, 0)) . "'";
        $this->execute(
            "DELETE rf FROM `role___fitur` rf INNER JOIN `app___fitur` f ON f.`id` = rf.`fitur_id` "
            . "WHERE f.`id_app` = 1 AND f.`type` = 'action' AND f.`code` IN ({$in})"
        );
        $this->execute(
            "DELETE FROM `app___fitur` WHERE `id_app` = 1 AND `type` = 'action' AND `code` IN ({$in})"
        );
    }
}
