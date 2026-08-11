<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Staging pengajuan edit profil madrasah (PJGT → review UGT).
 * Fitur action.ugt.data_madrasah.pengajuan_edit + grant ke role pemilik menu.data_madrasah.
 */
final class UgtMadrasahEditPengajuan extends AbstractMigration
{
    private const ACTION_CODE = 'action.ugt.data_madrasah.pengajuan_edit';

    public function up(): void
    {
        if (!$this->hasTable('ugt___madrasah_edit_pengajuan')) {
            $this->table('ugt___madrasah_edit_pengajuan', ['id' => false, 'primary_key' => ['id']])
                ->addColumn('id', 'integer', ['identity' => true, 'signed' => false])
                ->addColumn('id_madrasah', 'integer', ['signed' => false, 'null' => false])
                ->addColumn('id_users_pengaju', 'integer', ['signed' => false, 'null' => false])
                ->addColumn('status', 'enum', [
                    'values' => ['menunggu', 'disetujui', 'ditolak'],
                    'default' => 'menunggu',
                    'null' => false,
                ])
                ->addColumn('data_lama', 'json', ['null' => false])
                ->addColumn('data_baru', 'json', ['null' => false])
                ->addColumn('foto_path_baru', 'string', ['limit' => 500, 'null' => true])
                ->addColumn('logo_path_baru', 'string', ['limit' => 500, 'null' => true])
                ->addColumn('catatan_pengaju', 'text', ['null' => true])
                ->addColumn('catatan_reviewer', 'text', ['null' => true])
                ->addColumn('id_pengurus_reviewer', 'integer', ['signed' => false, 'null' => true])
                ->addColumn('reviewed_at', 'datetime', ['null' => true])
                ->addColumn('tanggal_dibuat', 'datetime', ['default' => 'CURRENT_TIMESTAMP', 'null' => false])
                ->addColumn('tanggal_update', 'datetime', [
                    'default' => 'CURRENT_TIMESTAMP',
                    'update' => 'CURRENT_TIMESTAMP',
                    'null' => false,
                ])
                ->addIndex(['id_madrasah', 'status'])
                ->addIndex(['status'])
                ->create();
        }

        $c = str_replace("'", "''", self::ACTION_CODE);
        $this->execute(<<<SQL
INSERT IGNORE INTO `app___fitur` (`id_app`, `parent_id`, `type`, `code`, `label`, `path`, `icon_key`, `group_label`, `sort_order`, `meta_json`)
SELECT 1, pf.`id`, 'action', '{$c}', 'Data Madrasah · Pengajuan edit PJGT', NULL, NULL, 'UGT', 20, NULL
FROM `app___fitur` pf WHERE pf.`id_app` = 1 AND pf.`code` = 'menu.ugt.data_madrasah' LIMIT 1
SQL);

        $this->execute(<<<SQL
INSERT IGNORE INTO `role___fitur` (`role_id`, `fitur_id`)
SELECT DISTINCT rf.`role_id`, af.`id`
FROM `role___fitur` rf
INNER JOIN `app___fitur` m ON m.`id` = rf.`fitur_id` AND m.`id_app` = 1 AND m.`code` = 'menu.ugt.data_madrasah'
CROSS JOIN `app___fitur` af
WHERE af.`id_app` = 1 AND af.`type` = 'action' AND af.`code` = '{$c}'
SQL);
    }

    public function down(): void
    {
        $c = str_replace("'", "''", self::ACTION_CODE);
        $this->execute(
            "DELETE rf FROM `role___fitur` rf INNER JOIN `app___fitur` f ON f.`id` = rf.`fitur_id` "
            . "WHERE f.`id_app` = 1 AND f.`type` = 'action' AND f.`code` = '{$c}'"
        );
        $this->execute(
            "DELETE FROM `app___fitur` WHERE `id_app` = 1 AND `type` = 'action' AND `code` = '{$c}'"
        );
        if ($this->hasTable('ugt___madrasah_edit_pengajuan')) {
            $this->table('ugt___madrasah_edit_pengajuan')->drop()->save();
        }
    }
}
