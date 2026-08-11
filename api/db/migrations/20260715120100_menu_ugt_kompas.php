<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Menu UGT: KOMMPAS — lomba bagi madrasah penerima Guru Tugas.
 * Role: sama dengan yang punya menu.ugt.data_madrasah.
 */
final class MenuUgtKompas extends AbstractMigration
{
    public function up(): void
    {
        $this->execute(
            "INSERT IGNORE INTO `app___fitur` (`id_app`, `parent_id`, `type`, `code`, `label`, `path`, `icon_key`, `group_label`, `sort_order`, `meta_json`) "
            . "VALUES (1, NULL, 'menu', 'menu.ugt.kompas', 'KOMMPAS', '/ugt/kompas', 'trophy', 'UGT', 785, NULL)"
        );
        $this->execute(
            'INSERT IGNORE INTO `role___fitur` (`role_id`, `fitur_id`)
            SELECT rf.`role_id`, g.`id`
            FROM `role___fitur` rf
            INNER JOIN `app___fitur` src ON src.`id` = rf.`fitur_id` AND src.`code` = \'menu.ugt.data_madrasah\' AND src.`id_app` = 1
            CROSS JOIN `app___fitur` g ON g.`code` = \'menu.ugt.kompas\' AND g.`id_app` = 1 AND g.`type` = \'menu\''
        );

        // Sinkron selector ugtMenus: tambah menu.ugt.kompas bila belum ada
        $row = $this->fetchRow("SELECT `codes_json` FROM `ebeddien_fitur_selector` WHERE `selector_key` = 'ugtMenus' LIMIT 1");
        if ($row && !empty($row['codes_json'])) {
            $codes = json_decode((string) $row['codes_json'], true);
            if (is_array($codes) && !in_array('menu.ugt.kompas', $codes, true)) {
                $codes[] = 'menu.ugt.kompas';
                $json = json_encode(array_values($codes), JSON_UNESCAPED_UNICODE);
                $this->execute(
                    'UPDATE `ebeddien_fitur_selector` SET `codes_json` = ' . $this->getAdapter()->getConnection()->quote($json)
                    . " WHERE `selector_key` = 'ugtMenus'"
                );
            }
        } else {
            $this->execute(
                "INSERT INTO `ebeddien_fitur_selector` (`selector_key`, `codes_json`)
                VALUES ('ugtMenus', JSON_ARRAY(
                    'menu.ugt.data_madrasah','menu.ugt.guru_tugas','menu.ugt.laporan','menu.ugt.kompas','menu.koordinator','PREFIX:action.ugt.'
                ))
                ON DUPLICATE KEY UPDATE `codes_json` = VALUES(`codes_json`)"
            );
        }
    }

    public function down(): void
    {
        $this->execute(
            'DELETE rf FROM `role___fitur` rf
            INNER JOIN `app___fitur` f ON f.`id` = rf.`fitur_id` AND f.`code` = \'menu.ugt.kompas\' AND f.`id_app` = 1'
        );
        $this->execute(
            "DELETE FROM `app___fitur` WHERE `id_app` = 1 AND `type` = 'menu' AND `code` = 'menu.ugt.kompas'"
        );

        $row = $this->fetchRow("SELECT `codes_json` FROM `ebeddien_fitur_selector` WHERE `selector_key` = 'ugtMenus' LIMIT 1");
        if ($row && !empty($row['codes_json'])) {
            $codes = json_decode((string) $row['codes_json'], true);
            if (is_array($codes)) {
                $codes = array_values(array_filter($codes, static fn ($c) => $c !== 'menu.ugt.kompas'));
                $json = json_encode($codes, JSON_UNESCAPED_UNICODE);
                $this->execute(
                    'UPDATE `ebeddien_fitur_selector` SET `codes_json` = ' . $this->getAdapter()->getConnection()->quote($json)
                    . " WHERE `selector_key` = 'ugtMenus'"
                );
            }
        }
    }
}
