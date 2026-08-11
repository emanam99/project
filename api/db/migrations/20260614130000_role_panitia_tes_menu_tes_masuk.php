<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Role panitia_tes + menu Tes Masuk + aksi terkait.
 */
final class RolePanitiaTesMenuTesMasuk extends AbstractMigration
{
    public function up(): void
    {
        $this->execute(
            "INSERT IGNORE INTO `role` (`id`, `key`, `label`) VALUES (44, 'panitia_tes', 'Panitia Tes')"
        );

        $this->execute(
            "INSERT IGNORE INTO `app___fitur` (`id_app`, `parent_id`, `type`, `code`, `label`, `path`, `icon_key`, `group_label`, `sort_order`, `meta_json`) "
            . "VALUES (1, NULL, 'menu', 'menu.pendaftaran.tes_masuk', 'Tes Masuk', '/pendaftaran/tes-masuk', 'clipboardDocumentCheck', 'Pendaftaran', 127, NULL)"
        );

        $actions = [
            ['action.pendaftaran.tes_masuk.simpan', 'Tes Masuk · Simpan nilai', 10],
            ['action.pendaftaran.tes_masuk.cetak', 'Tes Masuk · Cetak rapor', 20],
            ['action.pendaftaran.tes_masuk.aktif_diniyah', 'Tes Masuk · Aktif Diniyah', 30],
        ];
        foreach ($actions as [$code, $label, $sort]) {
            $this->execute(sprintf(
                "INSERT IGNORE INTO `app___fitur` (`id_app`, `parent_id`, `type`, `code`, `label`, `path`, `icon_key`, `group_label`, `sort_order`, `meta_json`) "
                . "SELECT 1, m.`id`, 'action', %s, %s, NULL, NULL, 'Pendaftaran', %d, NULL "
                . "FROM `app___fitur` m WHERE m.`code` = 'menu.pendaftaran.tes_masuk' AND m.`id_app` = 1 LIMIT 1",
                $this->getAdapter()->getConnection()->quote($code),
                $this->getAdapter()->getConnection()->quote($label),
                (int) $sort
            ));
        }

        // Panitia tes: menu + semua aksi tes masuk
        $this->execute(
            'INSERT IGNORE INTO `role___fitur` (`role_id`, `fitur_id`)
            SELECT 44, f.`id`
            FROM `app___fitur` f
            WHERE f.`id_app` = 1
            AND (
                f.`code` = \'menu.pendaftaran.tes_masuk\'
                OR f.`code` LIKE \'action.pendaftaran.tes_masuk.%\'
            )'
        );

        // Role yang punya Data Pendaftar juga dapat menu Tes Masuk
        $this->execute(
            'INSERT IGNORE INTO `role___fitur` (`role_id`, `fitur_id`)
            SELECT rf.`role_id`, g.`id`
            FROM `role___fitur` rf
            INNER JOIN `app___fitur` src ON src.`id` = rf.`fitur_id` AND src.`code` = \'menu.pendaftaran.data_pendaftar\' AND src.`id_app` = 1
            CROSS JOIN `app___fitur` g ON g.`code` = \'menu.pendaftaran.tes_masuk\' AND g.`id_app` = 1 AND g.`type` = \'menu\''
        );
    }

    public function down(): void
    {
        $this->execute(
            'DELETE rf FROM `role___fitur` rf
            INNER JOIN `app___fitur` f ON f.`id` = rf.`fitur_id`
            WHERE f.`id_app` = 1
            AND (f.`code` = \'menu.pendaftaran.tes_masuk\' OR f.`code` LIKE \'action.pendaftaran.tes_masuk.%\')'
        );
        $this->execute(
            "DELETE FROM `app___fitur` WHERE `id_app` = 1 AND (`code` = 'menu.pendaftaran.tes_masuk' OR `code` LIKE 'action.pendaftaran.tes_masuk.%')"
        );
        $this->execute("DELETE FROM `role` WHERE `key` = 'panitia_tes'");
    }
}
