<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Notifikasi WA pengeluaran: hapus alur per-pengurus (pending WA + kolom terima_notif_pengeluaran).
 * Tambah aksi fitur cakupan lembaga; penugasan default ke super_admin, admin_uwaba, admin_lembaga.
 */
final class PengeluaranWaNotifFiturDropPending extends AbstractMigration
{
    public function up(): void
    {
        $this->execute('DROP TABLE IF EXISTS `pengeluaran_notif_pending`');

        $p = $this->table('pengurus');
        if ($p->hasColumn('terima_notif_pengeluaran')) {
            $p->removeColumn('terima_notif_pengeluaran')->update();
        }

        $meta = '{"requiresRole":["admin_uwaba","super_admin","admin_lembaga","petugas_keuangan"]}';

        $this->execute(<<<SQL
INSERT IGNORE INTO `app___fitur` (`id_app`, `parent_id`, `type`, `code`, `label`, `path`, `icon_key`, `group_label`, `sort_order`, `meta_json`)
SELECT 1, pf.id, 'action', 'action.pengeluaran.notif.semua_lembaga', 'Pengeluaran · Notif WA semua lembaga', NULL, NULL, 'Keuangan', 176, '{$meta}'
FROM `app___fitur` pf WHERE pf.`id_app` = 1 AND pf.`code` = 'menu.pengeluaran' LIMIT 1
SQL);

        $this->execute(<<<SQL
INSERT IGNORE INTO `app___fitur` (`id_app`, `parent_id`, `type`, `code`, `label`, `path`, `icon_key`, `group_label`, `sort_order`, `meta_json`)
SELECT 1, pf.id, 'action', 'action.pengeluaran.notif.lembaga_sesuai_role', 'Pengeluaran · Notif WA lembaga sesuai role', NULL, NULL, 'Keuangan', 177, '{$meta}'
FROM `app___fitur` pf WHERE pf.`id_app` = 1 AND pf.`code` = 'menu.pengeluaran' LIMIT 1
SQL);

        // Default: super_admin — kedua aksi
        $this->execute(<<<'SQL'
INSERT IGNORE INTO `role___fitur` (`role_id`, `fitur_id`)
SELECT r.id, f.id FROM `role` r
CROSS JOIN `app___fitur` f
WHERE r.`key` = 'super_admin'
AND f.`id_app` = 1 AND f.`type` = 'action'
AND f.`code` IN ('action.pengeluaran.notif.semua_lembaga', 'action.pengeluaran.notif.lembaga_sesuai_role')
SQL);

        // admin_uwaba — semua lembaga (setara perilaku daftar penerima luas sebelumnya)
        $this->execute(<<<'SQL'
INSERT IGNORE INTO `role___fitur` (`role_id`, `fitur_id`)
SELECT r.id, f.id FROM `role` r
CROSS JOIN `app___fitur` f
WHERE r.`key` = 'admin_uwaba'
AND f.`id_app` = 1 AND f.`type` = 'action'
AND f.`code` = 'action.pengeluaran.notif.semua_lembaga'
SQL);

        // admin_lembaga — hanya lembaga terikat (biasanya pengurus___role.lembaga_id terisi)
        $this->execute(<<<'SQL'
INSERT IGNORE INTO `role___fitur` (`role_id`, `fitur_id`)
SELECT r.id, f.id FROM `role` r
CROSS JOIN `app___fitur` f
WHERE r.`key` = 'admin_lembaga'
AND f.`id_app` = 1 AND f.`type` = 'action'
AND f.`code` = 'action.pengeluaran.notif.lembaga_sesuai_role'
SQL);
    }

    public function down(): void
    {
        $this->execute(
            "DELETE FROM `app___fitur` WHERE `id_app` = 1 AND `type` = 'action' AND `code` IN ('action.pengeluaran.notif.semua_lembaga', 'action.pengeluaran.notif.lembaga_sesuai_role')"
        );

        $p = $this->table('pengurus');
        if (!$p->hasColumn('terima_notif_pengeluaran')) {
            $p->addColumn('terima_notif_pengeluaran', 'boolean', [
                'default' => false,
                'null' => false,
                'comment' => '1 = terima notifikasi WA hasil approve/tolak rencana pengeluaran (aktif via WA)',
            ])->update();
        }

        $this->execute(<<<'SQL'
CREATE TABLE IF NOT EXISTS `pengeluaran_notif_pending` (
  `nomor` varchar(20) NOT NULL COMMENT 'Nomor WA pengirim (62xxx)',
  `from_jid` varchar(120) DEFAULT NULL COMMENT 'JID asli WA untuk lookup balasan',
  `step` tinyint(1) NOT NULL DEFAULT 1 COMMENT '1=tunggu jawaban simpan nomor, 2=tunggu aktifkan',
  `nama` varchar(255) DEFAULT NULL,
  `nip` varchar(50) DEFAULT NULL,
  `id_pengurus` int unsigned DEFAULT NULL,
  `nomor_kanonik` varchar(20) DEFAULT NULL COMMENT 'No WA dari baris pesan (format 62xxx)',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`nomor`),
  KEY `idx_pengeluaran_notif_pending_from_jid` (`from_jid`(100)),
  KEY `idx_pengeluaran_notif_pending_id_pengurus` (`id_pengurus`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
SQL);
    }
}
