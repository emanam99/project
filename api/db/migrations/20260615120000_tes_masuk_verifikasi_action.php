<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Aksi verifikasi pendaftar dari halaman Tes Masuk.
 */
final class TesMasukVerifikasiAction extends AbstractMigration
{
    public function up(): void
    {
        $this->execute(sprintf(
            "INSERT IGNORE INTO `app___fitur` (`id_app`, `parent_id`, `type`, `code`, `label`, `path`, `icon_key`, `group_label`, `sort_order`, `meta_json`) "
            . "SELECT 1, m.`id`, 'action', %s, %s, NULL, NULL, 'Pendaftaran', 25, NULL "
            . "FROM `app___fitur` m WHERE m.`code` = 'menu.pendaftaran.tes_masuk' AND m.`id_app` = 1 LIMIT 1",
            $this->getAdapter()->getConnection()->quote('action.pendaftaran.tes_masuk.verifikasi'),
            $this->getAdapter()->getConnection()->quote('Tes Masuk · Verifikasi pendaftar')
        ));

        $this->execute(
            'INSERT IGNORE INTO `role___fitur` (`role_id`, `fitur_id`)
            SELECT 44, f.`id`
            FROM `app___fitur` f
            WHERE f.`id_app` = 1
            AND f.`code` = \'action.pendaftaran.tes_masuk.verifikasi\''
        );
    }

    public function down(): void
    {
        $this->execute(
            'DELETE rf FROM `role___fitur` rf
            INNER JOIN `app___fitur` f ON f.`id` = rf.`fitur_id`
            WHERE f.`id_app` = 1 AND f.`code` = \'action.pendaftaran.tes_masuk.verifikasi\''
        );
        $this->execute(
            "DELETE FROM `app___fitur` WHERE `id_app` = 1 AND `code` = 'action.pendaftaran.tes_masuk.verifikasi'"
        );
    }
}
