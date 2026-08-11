<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Pengajuan NIS myBeddien: tabel pengajuan, menu eBeddien, aksi notif WA per role.
 */
final class MybeddianNisPengajuan extends AbstractMigration
{
    public function up(): void
    {
        if (!$this->hasTable('mybeddian___nis_pengajuan')) {
            $this->table('mybeddian___nis_pengajuan', ['id' => false, 'primary_key' => ['id']])
                ->addColumn('id', 'integer', ['identity' => true, 'signed' => false])
                ->addColumn('nama', 'string', ['limit' => 255, 'null' => false])
                ->addColumn('nik', 'string', ['limit' => 16, 'null' => false])
                ->addColumn('tanggal_lahir', 'date', ['null' => false])
                ->addColumn('no_wa', 'string', ['limit' => 20, 'null' => false])
                ->addColumn('id_santri', 'integer', ['signed' => false, 'null' => true])
                ->addColumn('status', 'enum', [
                    'values' => ['menunggu_kk', 'menunggu_review', 'selesai', 'ditolak'],
                    'default' => 'menunggu_kk',
                    'null' => false,
                ])
                ->addColumn('path_file', 'string', ['limit' => 500, 'null' => true])
                ->addColumn('nama_file', 'string', ['limit' => 255, 'null' => true])
                ->addColumn('tipe_file', 'string', ['limit' => 100, 'null' => true])
                ->addColumn('ukuran_file', 'integer', ['signed' => false, 'null' => true])
                ->addColumn('nis_dikirim_at', 'datetime', ['null' => true])
                ->addColumn('id_pengurus_selesai', 'integer', ['signed' => false, 'null' => true])
                ->addColumn('created_at', 'datetime', ['default' => 'CURRENT_TIMESTAMP', 'null' => false])
                ->addColumn('updated_at', 'datetime', [
                    'default' => 'CURRENT_TIMESTAMP',
                    'update' => 'CURRENT_TIMESTAMP',
                    'null' => false,
                ])
                ->addIndex(['nik'])
                ->addIndex(['status'])
                ->addIndex(['created_at'])
                ->addIndex(['no_wa', 'status'])
                ->create();
        }

        if (!$this->hasTable('mybeddian___nis_check_attempt')) {
            $this->table('mybeddian___nis_check_attempt', ['id' => false, 'primary_key' => ['id']])
                ->addColumn('id', 'integer', ['identity' => true, 'signed' => false])
                ->addColumn('no_wa', 'string', ['limit' => 20, 'null' => false])
                ->addColumn('ip_hash', 'string', ['limit' => 64, 'null' => true])
                ->addColumn('attempted_at', 'datetime', ['default' => 'CURRENT_TIMESTAMP', 'null' => false])
                ->addIndex(['no_wa', 'attempted_at'])
                ->create();
        }

        $this->execute(
            "INSERT IGNORE INTO `app___fitur` (`id_app`, `parent_id`, `type`, `code`, `label`, `path`, `icon_key`, `group_label`, `sort_order`, `meta_json`) "
            . "VALUES (1, NULL, 'menu', 'menu.pendaftaran.pengajuan_nis', 'Pengajuan NIS', '/pendaftaran/pengajuan-nis', 'document', 'Pendaftaran', 129, NULL)"
        );

        $this->execute(
            'INSERT IGNORE INTO `role___fitur` (`role_id`, `fitur_id`)
            SELECT rf.`role_id`, g.`id`
            FROM `role___fitur` rf
            INNER JOIN `app___fitur` src ON src.`id` = rf.`fitur_id` AND src.`code` = \'menu.pendaftaran.data_pendaftar\' AND src.`id_app` = 1
            CROSS JOIN `app___fitur` g ON g.`code` = \'menu.pendaftaran.pengajuan_nis\' AND g.`id_app` = 1 AND g.`type` = \'menu\''
        );

        $meta = '{"requiresRole":["admin_uwaba","super_admin","admin_lembaga","petugas_psb","admin_psb"]}';

        $this->execute(<<<SQL
INSERT IGNORE INTO `app___fitur` (`id_app`, `parent_id`, `type`, `code`, `label`, `path`, `icon_key`, `group_label`, `sort_order`, `meta_json`)
SELECT 1, pf.id, 'action', 'action.pendaftaran.nis_pengajuan.notif.semua_lembaga', 'Pengajuan NIS · Notif WA semua lembaga', NULL, NULL, 'Pendaftaran', 180, '{$meta}'
FROM `app___fitur` pf WHERE pf.`id_app` = 1 AND pf.`code` = 'menu.pendaftaran' LIMIT 1
SQL);

        $this->execute(<<<SQL
INSERT IGNORE INTO `app___fitur` (`id_app`, `parent_id`, `type`, `code`, `label`, `path`, `icon_key`, `group_label`, `sort_order`, `meta_json`)
SELECT 1, pf.id, 'action', 'action.pendaftaran.nis_pengajuan.notif.lembaga_sesuai_role', 'Pengajuan NIS · Notif WA lembaga sesuai role', NULL, NULL, 'Pendaftaran', 181, '{$meta}'
FROM `app___fitur` pf WHERE pf.`id_app` = 1 AND pf.`code` = 'menu.pendaftaran' LIMIT 1
SQL);

        $this->execute(<<<SQL
INSERT IGNORE INTO `app___fitur` (`id_app`, `parent_id`, `type`, `code`, `label`, `path`, `icon_key`, `group_label`, `sort_order`, `meta_json`)
SELECT 1, pf.id, 'action', 'action.pendaftaran.nis_pengajuan.kelola', 'Pengajuan NIS · Kelola pengajuan', NULL, NULL, 'Pendaftaran', 182, '{$meta}'
FROM `app___fitur` pf WHERE pf.`id_app` = 1 AND pf.`code` = 'menu.pendaftaran.pengajuan_nis' LIMIT 1
SQL);

        $this->execute(<<<SQL
INSERT IGNORE INTO `app___fitur` (`id_app`, `parent_id`, `type`, `code`, `label`, `path`, `icon_key`, `group_label`, `sort_order`, `meta_json`)
SELECT 1, pf.id, 'action', 'action.pendaftaran.nis_pengajuan.kirim_nis', 'Pengajuan NIS · Kirim NIS ke WA', NULL, NULL, 'Pendaftaran', 183, '{$meta}'
FROM `app___fitur` pf WHERE pf.`id_app` = 1 AND pf.`code` = 'menu.pendaftaran.pengajuan_nis' LIMIT 1
SQL);

        $this->execute(<<<SQL
INSERT IGNORE INTO `app___fitur` (`id_app`, `parent_id`, `type`, `code`, `label`, `path`, `icon_key`, `group_label`, `sort_order`, `meta_json`)
SELECT 1, pf.id, 'action', 'action.pendaftaran.nis_pengajuan.edit_data', 'Pengajuan NIS · Edit data pemohon', NULL, NULL, 'Pendaftaran', 184, '{$meta}'
FROM `app___fitur` pf WHERE pf.`id_app` = 1 AND pf.`code` = 'menu.pendaftaran.pengajuan_nis' LIMIT 1
SQL);

        $this->execute(<<<'SQL'
INSERT IGNORE INTO `role___fitur` (`role_id`, `fitur_id`)
SELECT r.id, f.id FROM `role` r
CROSS JOIN `app___fitur` f
WHERE r.`key` = 'super_admin'
AND f.`id_app` = 1 AND f.`type` = 'action'
AND f.`code` IN (
  'action.pendaftaran.nis_pengajuan.notif.semua_lembaga',
  'action.pendaftaran.nis_pengajuan.notif.lembaga_sesuai_role',
  'action.pendaftaran.nis_pengajuan.kelola',
  'action.pendaftaran.nis_pengajuan.kirim_nis',
  'action.pendaftaran.nis_pengajuan.edit_data'
)
SQL);

        $this->execute(<<<'SQL'
INSERT IGNORE INTO `role___fitur` (`role_id`, `fitur_id`)
SELECT r.id, f.id FROM `role` r
CROSS JOIN `app___fitur` f
WHERE r.`key` = 'admin_uwaba'
AND f.`id_app` = 1 AND f.`type` = 'action'
AND f.`code` = 'action.pendaftaran.nis_pengajuan.notif.semua_lembaga'
SQL);

        $this->execute(<<<'SQL'
INSERT IGNORE INTO `role___fitur` (`role_id`, `fitur_id`)
SELECT r.id, f.id FROM `role` r
CROSS JOIN `app___fitur` f
WHERE r.`key` IN ('admin_lembaga', 'admin_psb', 'petugas_psb')
AND f.`id_app` = 1 AND f.`type` = 'action'
AND f.`code` IN (
  'action.pendaftaran.nis_pengajuan.notif.lembaga_sesuai_role',
  'action.pendaftaran.nis_pengajuan.kelola',
  'action.pendaftaran.nis_pengajuan.kirim_nis',
  'action.pendaftaran.nis_pengajuan.edit_data'
)
SQL);

        $this->execute(<<<'SQL'
INSERT IGNORE INTO `role___fitur` (`role_id`, `fitur_id`)
SELECT r.id, f.id FROM `role` r
CROSS JOIN `app___fitur` f
WHERE r.`key` IN ('admin_psb', 'petugas_psb')
AND f.`id_app` = 1 AND f.`type` = 'action'
AND f.`code` = 'action.pendaftaran.nis_pengajuan.notif.semua_lembaga'
SQL);
    }

    public function down(): void
    {
        $codes = [
            'action.pendaftaran.nis_pengajuan.notif.semua_lembaga',
            'action.pendaftaran.nis_pengajuan.notif.lembaga_sesuai_role',
            'action.pendaftaran.nis_pengajuan.kelola',
            'action.pendaftaran.nis_pengajuan.kirim_nis',
            'action.pendaftaran.nis_pengajuan.edit_data',
        ];
        $in = "'" . implode("','", $codes) . "'";
        $this->execute("DELETE FROM `app___fitur` WHERE `id_app` = 1 AND `type` = 'action' AND `code` IN ({$in})");

        $this->execute(
            'DELETE rf FROM `role___fitur` rf
            INNER JOIN `app___fitur` f ON f.`id` = rf.`fitur_id` AND f.`code` = \'menu.pendaftaran.pengajuan_nis\' AND f.`id_app` = 1'
        );
        $this->execute(
            "DELETE FROM `app___fitur` WHERE `id_app` = 1 AND `type` = 'menu' AND `code` = 'menu.pendaftaran.pengajuan_nis'"
        );

        if ($this->hasTable('mybeddian___nis_check_attempt')) {
            $this->table('mybeddian___nis_check_attempt')->drop()->save();
        }
        if ($this->hasTable('mybeddian___nis_pengajuan')) {
            $this->table('mybeddian___nis_pengajuan')->drop()->save();
        }
    }
}
