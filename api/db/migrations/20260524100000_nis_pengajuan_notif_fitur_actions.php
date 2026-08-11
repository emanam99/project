<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Aksi fitur: penerima notifikasi WA pengajuan NIS baru (myBeddien upload KK).
 * Penugasan role hanya lewat Pengaturan → Fitur (tidak diisi otomatis di migrasi ini).
 */
final class NisPengajuanNotifFiturActions extends AbstractMigration
{
    private const CODE_NOTIF_SEMUA = 'action.pendaftaran.nis_pengajuan.notif.semua_lembaga';
    private const CODE_NOTIF_LEMBAGA = 'action.pendaftaran.nis_pengajuan.notif.lembaga_sesuai_role';

    public function up(): void
    {
        $semua = str_replace("'", "''", self::CODE_NOTIF_SEMUA);
        $lembaga = str_replace("'", "''", self::CODE_NOTIF_LEMBAGA);

        $this->execute(<<<SQL
INSERT IGNORE INTO `app___fitur` (`id_app`, `parent_id`, `type`, `code`, `label`, `path`, `icon_key`, `group_label`, `sort_order`, `meta_json`)
SELECT 1, pf.`id`, 'action', '{$semua}', 'Pengajuan NIS · Terima notif WA (semua lembaga)', NULL, NULL, 'Pendaftaran', 5, NULL
FROM `app___fitur` pf WHERE pf.`id_app` = 1 AND pf.`code` = 'menu.pendaftaran.pengajuan_nis' LIMIT 1
SQL);

        $this->execute(<<<SQL
INSERT IGNORE INTO `app___fitur` (`id_app`, `parent_id`, `type`, `code`, `label`, `path`, `icon_key`, `group_label`, `sort_order`, `meta_json`)
SELECT 1, pf.`id`, 'action', '{$lembaga}', 'Pengajuan NIS · Terima notif WA (lembaga sesuai role)', NULL, NULL, 'Pendaftaran', 8, NULL
FROM `app___fitur` pf WHERE pf.`id_app` = 1 AND pf.`code` = 'menu.pendaftaran.pengajuan_nis' LIMIT 1
SQL);

        $inNotif = "'" . self::CODE_NOTIF_SEMUA . "','" . self::CODE_NOTIF_LEMBAGA . "'";
        $this->execute(<<<SQL
UPDATE `app___fitur` AS c
INNER JOIN `app___fitur` AS p ON p.`id_app` = 1 AND p.`code` = 'menu.pendaftaran.pengajuan_nis' AND p.`type` = 'menu'
SET c.`parent_id` = p.`id`
WHERE c.`id_app` = 1 AND c.`type` = 'action' AND c.`code` IN ({$inNotif})
SQL);
    }

    public function down(): void
    {
        $codes = "'" . self::CODE_NOTIF_SEMUA . "','" . self::CODE_NOTIF_LEMBAGA . "'";
        $this->execute(
            "DELETE rf FROM `role___fitur` rf INNER JOIN `app___fitur` f ON f.`id` = rf.`fitur_id` "
            . "WHERE f.`id_app` = 1 AND f.`type` = 'action' AND f.`code` IN ({$codes})"
        );
        $this->execute(
            "DELETE FROM `app___fitur` WHERE `id_app` = 1 AND `type` = 'action' AND `code` IN ({$codes})"
        );
    }
}
