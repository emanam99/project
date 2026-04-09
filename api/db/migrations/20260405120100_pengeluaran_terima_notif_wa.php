<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Preferensi pengurus: terima notifikasi WA terkait rencana pengeluaran (setelah daftar via WA).
 * Tabel pending: alur percakapan mirip daftar_notif_pending.
 */
final class PengeluaranTerimaNotifWa extends AbstractMigration
{
    public function up(): void
    {
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

    public function down(): void
    {
        $this->execute('DROP TABLE IF EXISTS `pengeluaran_notif_pending`');
        $p = $this->table('pengurus');
        if ($p->hasColumn('terima_notif_pengeluaran')) {
            $p->removeColumn('terima_notif_pengeluaran')->update();
        }
    }
}
