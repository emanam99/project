<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Tambah aksi filter semua lembaga untuk halaman Santri, Rombel, Jabatan, dan Mapel.
 * Dipakai frontend untuk membuka opsi "Semua lembaga"; tanpa aksi ini, scope mengikuti lembaga role.
 */
final class LembagaFilterSemuaActions extends AbstractMigration
{
    public function up(): void
    {
        $meta = '{"requiresRole":["super_admin","tarbiyah","admin_lembaga","admin_ugt","admin_uwaba"]}';
        $metaEsc = str_replace("'", "''", $meta);
        $rows = [
            ['menu.santri', 'action.santri.filter.lembaga_semua', 'Santri · Filter semua lembaga', 8],
            ['menu.rombel', 'action.rombel.filter.lembaga_semua', 'Rombel · Filter semua lembaga', 8],
            ['menu.manage_jabatan', 'action.manage_jabatan.filter.lembaga_semua', 'Jabatan · Filter semua lembaga', 8],
            ['menu.mapel', 'action.mapel.filter.lembaga_semua', 'Mapel · Filter semua lembaga', 8],
        ];

        foreach ($rows as $row) {
            [$menuCode, $actionCode, $label, $sortOrder] = $row;
            $menuCodeEsc = str_replace("'", "''", $menuCode);
            $actionCodeEsc = str_replace("'", "''", $actionCode);
            $labelEsc = str_replace("'", "''", $label);
            $this->execute(<<<SQL
INSERT IGNORE INTO `app___fitur` (`id_app`, `parent_id`, `type`, `code`, `label`, `path`, `icon_key`, `group_label`, `sort_order`, `meta_json`)
SELECT 1, pf.id, 'action', '{$actionCodeEsc}', '{$labelEsc}', NULL, NULL, 'Lembaga', {$sortOrder}, '{$metaEsc}'
FROM `app___fitur` pf WHERE pf.`id_app` = 1 AND pf.`code` = '{$menuCodeEsc}' LIMIT 1
SQL);

            $this->execute(<<<SQL
INSERT IGNORE INTO `role___fitur` (`role_id`, `fitur_id`)
SELECT r.id, f.id FROM `role` r
CROSS JOIN `app___fitur` f
WHERE r.`key` = 'super_admin'
AND f.`id_app` = 1 AND f.`type` = 'action' AND f.`code` = '{$actionCodeEsc}'
SQL);
        }
    }

    public function down(): void
    {
        $this->execute(
            "DELETE FROM `app___fitur` WHERE `id_app` = 1 AND `type` = 'action' AND `code` IN ('action.santri.filter.lembaga_semua','action.rombel.filter.lembaga_semua','action.manage_jabatan.filter.lembaga_semua','action.mapel.filter.lembaga_semua')"
        );
    }
}

