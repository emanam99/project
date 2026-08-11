<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Hapus aksi fitur penerima notif WA pengajuan NIS (notif sekarang ke nomor tetap di config).
 */
final class NisPengajuanHapusAksiTerimaNotif extends AbstractMigration
{
    private const CODES = [
        'action.pendaftaran.nis_pengajuan.terima_notif',
        'action.pendaftaran.nis_pengajuan.notif.semua_lembaga',
        'action.pendaftaran.nis_pengajuan.notif.lembaga_sesuai_role',
    ];

    public function up(): void
    {
        $in = "'" . implode("','", self::CODES) . "'";
        $this->execute(
            "DELETE rf FROM `role___fitur` rf INNER JOIN `app___fitur` f ON f.`id` = rf.`fitur_id` "
            . "WHERE f.`id_app` = 1 AND f.`type` = 'action' AND f.`code` IN ({$in})"
        );
        $this->execute(
            "DELETE FROM `app___fitur` WHERE `id_app` = 1 AND `type` = 'action' AND `code` IN ({$in})"
        );
    }

    public function down(): void
    {
        // Tidak dipulihkan: notif pengajuan NIS memakai nomor tetap (security.nis_pengajuan_alert_wa).
    }
}
