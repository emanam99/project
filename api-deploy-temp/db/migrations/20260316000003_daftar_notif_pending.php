<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * State percakapan "Daftar Notifikasi" per nomor: step 1 = tunggu jawaban sudah simpan?, step 2 = tunggu jawaban aktifkan?
 */
final class DaftarNotifPending extends AbstractMigration
{
    public function up(): void
    {
        $this->execute(<<<'SQL'
CREATE TABLE IF NOT EXISTS `daftar_notif_pending` (
  `nomor` varchar(20) NOT NULL COMMENT 'Nomor WA 62xxx',
  `step` tinyint(1) NOT NULL DEFAULT 1 COMMENT '1=tunggu jawaban simpan, 2=tunggu jawaban aktifkan',
  `nama` varchar(255) DEFAULT NULL,
  `nik` varchar(50) DEFAULT NULL,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`nomor`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
SQL);
    }

    public function down(): void
    {
        $this->execute('DROP TABLE IF EXISTS `daftar_notif_pending`');
    }
}
