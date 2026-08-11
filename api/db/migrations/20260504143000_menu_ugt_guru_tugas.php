<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Menu UGT: Guru Tugas — halaman daftar santri (filter default status Guru Tugas).
 * Penugasan role: sama dengan role yang punya menu.ugt.data_madrasah.
 */
final class MenuUgtGuruTugas extends AbstractMigration
{
    public function up(): void
    {
        $this->execute(
            "INSERT IGNORE INTO `app___fitur` (`id_app`, `parent_id`, `type`, `code`, `label`, `path`, `icon_key`, `group_label`, `sort_order`, `meta_json`) "
            . "VALUES (1, NULL, 'menu', 'menu.ugt.guru_tugas', 'Guru Tugas', '/ugt/guru-tugas', 'usersGroup', 'UGT', 782, NULL)"
        );
        $this->execute(
            'INSERT IGNORE INTO `role___fitur` (`role_id`, `fitur_id`)
            SELECT rf.`role_id`, g.`id`
            FROM `role___fitur` rf
            INNER JOIN `app___fitur` src ON src.`id` = rf.`fitur_id` AND src.`code` = \'menu.ugt.data_madrasah\' AND src.`id_app` = 1
            CROSS JOIN `app___fitur` g ON g.`code` = \'menu.ugt.guru_tugas\' AND g.`id_app` = 1 AND g.`type` = \'menu\''
        );
    }

    public function down(): void
    {
        $this->execute(
            'DELETE rf FROM `role___fitur` rf
            INNER JOIN `app___fitur` f ON f.`id` = rf.`fitur_id` AND f.`code` = \'menu.ugt.guru_tugas\' AND f.`id_app` = 1'
        );
        $this->execute(
            "DELETE FROM `app___fitur` WHERE `id_app` = 1 AND `type` = 'menu' AND `code` = 'menu.ugt.guru_tugas'"
        );
    }
}
