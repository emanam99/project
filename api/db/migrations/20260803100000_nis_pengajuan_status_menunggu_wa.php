<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Status menunggu_wa: KK sudah diunggah, menunggu user kirim token lewat WhatsApp
 * (baru setelah verifikasi WA → menunggu_review + notif admin).
 */
final class NisPengajuanStatusMenungguWa extends AbstractMigration
{
    public function up(): void
    {
        if (!$this->hasTable('mybeddian___nis_pengajuan')) {
            return;
        }
        $this->execute(
            "ALTER TABLE `mybeddian___nis_pengajuan`
             MODIFY COLUMN `status` ENUM(
               'menunggu_kk',
               'menunggu_wa',
               'menunggu_review',
               'selesai',
               'ditolak'
             ) NOT NULL DEFAULT 'menunggu_kk'"
        );
    }

    public function down(): void
    {
        if (!$this->hasTable('mybeddian___nis_pengajuan')) {
            return;
        }
        $this->execute(
            "UPDATE `mybeddian___nis_pengajuan`
             SET `status` = 'menunggu_review'
             WHERE `status` = 'menunggu_wa'"
        );
        $this->execute(
            "ALTER TABLE `mybeddian___nis_pengajuan`
             MODIFY COLUMN `status` ENUM(
               'menunggu_kk',
               'menunggu_review',
               'selesai',
               'ditolak'
             ) NOT NULL DEFAULT 'menunggu_kk'"
        );
    }
}
