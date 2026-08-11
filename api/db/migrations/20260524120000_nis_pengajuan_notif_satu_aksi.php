<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Satu aksi fitur penerima notif pengajuan NIS (ganti dua aksi lembaga).
 * Role yang punya salah satu aksi lama otomatis dapat aksi baru.
 */
final class NisPengajuanNotifSatuAksi extends AbstractMigration
{
    private const CODE_BARU = 'action.pendaftaran.nis_pengajuan.terima_notif';

    private const CODES_LAMA = [
        'action.pendaftaran.nis_pengajuan.notif.semua_lembaga',
        'action.pendaftaran.nis_pengajuan.notif.lembaga_sesuai_role',
    ];

    public function up(): void
    {
        $baru = str_replace("'", "''", self::CODE_BARU);

        $this->execute(<<<SQL
INSERT IGNORE INTO `app___fitur` (`id_app`, `parent_id`, `type`, `code`, `label`, `path`, `icon_key`, `group_label`, `sort_order`, `meta_json`)
SELECT 1, pf.`id`, 'action', '{$baru}', 'Pengajuan NIS · Terima notif tiap pengajuan', NULL, NULL, 'Pendaftaran', 5, NULL
FROM `app___fitur` pf WHERE pf.`id_app` = 1 AND pf.`code` = 'menu.pendaftaran.pengajuan_nis' LIMIT 1
SQL);

        $inLama = "'" . implode("','", self::CODES_LAMA) . "'";
        $baruEsc = self::CODE_BARU;

        $this->execute(<<<SQL
INSERT IGNORE INTO `role___fitur` (`role_id`, `fitur_id`)
SELECT DISTINCT rf_lama.`role_id`, af_baru.`id`
FROM `role___fitur` rf_lama
INNER JOIN `app___fitur` af_lama ON af_lama.`id` = rf_lama.`fitur_id`
  AND af_lama.`id_app` = 1 AND af_lama.`type` = 'action' AND af_lama.`code` IN ({$inLama})
CROSS JOIN `app___fitur` af_baru
WHERE af_baru.`id_app` = 1 AND af_baru.`type` = 'action' AND af_baru.`code` = '{$baruEsc}'
SQL);

        $this->execute(
            "DELETE rf FROM `role___fitur` rf INNER JOIN `app___fitur` f ON f.`id` = rf.`fitur_id` "
            . "WHERE f.`id_app` = 1 AND f.`type` = 'action' AND f.`code` IN ({$inLama})"
        );
        $this->execute(
            "DELETE FROM `app___fitur` WHERE `id_app` = 1 AND `type` = 'action' AND `code` IN ({$inLama})"
        );
    }

    public function down(): void
    {
        $baru = self::CODE_BARU;
        $this->execute(
            "DELETE rf FROM `role___fitur` rf INNER JOIN `app___fitur` f ON f.`id` = rf.`fitur_id` "
            . "WHERE f.`id_app` = 1 AND f.`type` = 'action' AND f.`code` = '{$baru}'"
        );
        $this->execute(
            "DELETE FROM `app___fitur` WHERE `id_app` = 1 AND `type` = 'action' AND `code` = '{$baru}'"
        );
    }
}
