<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Aksi rute Item (item, set, kondisi, registrasi, assign, simulasi) → parent menu.pendaftaran.item.
 */
final class ReparentPendaftaranRouteFiturParents extends AbstractMigration
{
    public function up(): void
    {
        $itemCodes = [
            'action.pendaftaran.route.item',
            'action.pendaftaran.route.manage_item_set',
            'action.pendaftaran.route.manage_kondisi',
            'action.pendaftaran.route.kondisi_registrasi',
            'action.pendaftaran.route.assign_item',
            'action.pendaftaran.route.simulasi',
        ];
        $inItem = "'" . implode("','", $itemCodes) . "'";

        $this->execute("
            UPDATE `app___fitur` AS c
            INNER JOIN `app___fitur` AS p ON p.`id_app` = 1 AND p.`code` = 'menu.pendaftaran.item' AND p.`type` = 'menu'
            SET c.`parent_id` = p.`id`
            WHERE c.`id_app` = 1 AND c.`type` = 'action' AND c.`code` IN ($inItem)
        ");

        $this->execute("
            UPDATE `app___fitur` SET `label` = 'Item · Daftar item'
            WHERE `id_app` = 1 AND `type` = 'action' AND `code` = 'action.pendaftaran.route.item'
        ");
        $this->execute("
            UPDATE `app___fitur` SET `label` = 'Item · Item Set'
            WHERE `id_app` = 1 AND `type` = 'action' AND `code` = 'action.pendaftaran.route.manage_item_set'
        ");
        $this->execute("
            UPDATE `app___fitur` SET `label` = 'Item · Kondisi'
            WHERE `id_app` = 1 AND `type` = 'action' AND `code` = 'action.pendaftaran.route.manage_kondisi'
        ");
        $this->execute("
            UPDATE `app___fitur` SET `label` = 'Item · Registrasi'
            WHERE `id_app` = 1 AND `type` = 'action' AND `code` = 'action.pendaftaran.route.kondisi_registrasi'
        ");
        $this->execute("
            UPDATE `app___fitur` SET `label` = 'Item · Assign item'
            WHERE `id_app` = 1 AND `type` = 'action' AND `code` = 'action.pendaftaran.route.assign_item'
        ");
        $this->execute("
            UPDATE `app___fitur` SET `label` = 'Item · Simulasi'
            WHERE `id_app` = 1 AND `type` = 'action' AND `code` = 'action.pendaftaran.route.simulasi'
        ");
    }

    public function down(): void
    {
        $codes = [
            'action.pendaftaran.route.item',
            'action.pendaftaran.route.manage_item_set',
            'action.pendaftaran.route.manage_kondisi',
            'action.pendaftaran.route.kondisi_registrasi',
            'action.pendaftaran.route.assign_item',
            'action.pendaftaran.route.simulasi',
        ];
        $in = "'" . implode("','", $codes) . "'";

        $this->execute("
            UPDATE `app___fitur` AS c
            INNER JOIN `app___fitur` AS p ON p.`id_app` = 1 AND p.`code` = 'menu.pendaftaran' AND p.`type` = 'menu'
            SET c.`parent_id` = p.`id`
            WHERE c.`id_app` = 1 AND c.`type` = 'action' AND c.`code` IN ($in)
        ");
    }
}
