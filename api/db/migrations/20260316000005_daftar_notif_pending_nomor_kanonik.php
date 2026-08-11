<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Tambah nomor_kanonik: nomor dari form (No WA: 62xxx di pesan) agar siap_terima_notif ter-update untuk nomor yang dipakai di aplikasi.
 */
final class DaftarNotifPendingNomorKanonik extends AbstractMigration
{
    public function up(): void
    {
        $this->execute("ALTER TABLE `daftar_notif_pending` ADD COLUMN `nomor_kanonik` varchar(20) DEFAULT NULL COMMENT 'Nomor dari form (No WA di pesan) untuk update whatsapp___kontak' AFTER `nik`");
    }

    public function down(): void
    {
        $this->execute('ALTER TABLE `daftar_notif_pending` DROP COLUMN `nomor_kanonik`');
    }
}
