<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Grup Umum: kemampuan UI global (offcanvas & callables lintas halaman).
 * Parent menu.umum tidak tampil di sidebar (hideFromNav); diatur di Pengaturan → Fitur.
 *
 * Deploy: phinx migrate (tidak wajib seed ulang).
 */
final class UmumFiturMenuActions extends AbstractMigration
{
    private const MENU_CODE = 'menu.umum';

    /** @var list<array{0:string,1:string,2:int}> */
    private const ACTIONS = [
        ['action.umum.ui.cari_santri', 'Umum · Cari Santri', 10],
        ['action.umum.ui.detail_santri', 'Umum · Detail Santri', 20],
        ['action.umum.ui.edit_santri', 'Umum · Edit Santri', 30],
        ['action.umum.ui.detail_user', 'Umum · Detail User / Pengurus', 40],
        ['action.umum.ui.template_wa', 'Umum · Template WhatsApp', 50],
    ];

    public function up(): void
    {
        $metaHide = '{"hideFromNav":true}';

        $this->execute(sprintf(
            "INSERT IGNORE INTO `app___fitur` (`id_app`, `parent_id`, `type`, `code`, `label`, `path`, `icon_key`, `group_label`, `sort_order`, `meta_json`) "
            . "VALUES (1, NULL, 'menu', %s, 'Umum', '', 'cube', 'Umum', 5, %s)",
            $this->quote(self::MENU_CODE),
            $this->quote($metaHide)
        ));

        $this->execute(sprintf(
            "UPDATE `app___fitur`
             SET `group_label` = 'Umum', `label` = 'Umum', `path` = '', `icon_key` = 'cube',
                 `meta_json` = %s, `sort_order` = 5
             WHERE `id_app` = 1 AND `code` = %s AND `type` = 'menu'",
            $this->quote($metaHide),
            $this->quote(self::MENU_CODE)
        ));

        $menuRow = $this->fetchRow(
            "SELECT `id` FROM `app___fitur` WHERE `id_app` = 1 AND `code` = " . $this->quote(self::MENU_CODE) . " AND `type` = 'menu' LIMIT 1"
        );
        $parentId = $menuRow ? (int) $menuRow['id'] : 0;
        if ($parentId <= 0) {
            return;
        }

        foreach (self::ACTIONS as $a) {
            $this->execute(sprintf(
                "INSERT IGNORE INTO `app___fitur` (`id_app`, `parent_id`, `type`, `code`, `label`, `path`, `icon_key`, `group_label`, `sort_order`, `meta_json`) "
                . "VALUES (1, %d, 'action', %s, %s, NULL, NULL, 'Umum', %d, NULL)",
                $parentId,
                $this->quote($a[0]),
                $this->quote($a[1]),
                $a[2]
            ));
            $this->execute(sprintf(
                "UPDATE `app___fitur` SET `parent_id` = %d, `group_label` = 'Umum', `label` = %s, `sort_order` = %d
                 WHERE `id_app` = 1 AND `type` = 'action' AND `code` = %s",
                $parentId,
                $this->quote($a[1]),
                $a[2],
                $this->quote($a[0])
            ));
        }

        $allCodes = array_merge([self::MENU_CODE], array_column(self::ACTIONS, 0));
        $inList = implode(',', array_map([$this, 'quote'], $allCodes));

        // super_admin → semua
        $this->execute(
            "INSERT IGNORE INTO `role___fitur` (`role_id`, `fitur_id`)
             SELECT r.`id`, f.`id`
             FROM `role` r
             CROSS JOIN `app___fitur` f
             WHERE r.`key` = 'super_admin'
               AND f.`id_app` = 1
               AND f.`code` IN ($inList)"
        );

        // Mirror ke role yang sudah punya minimal satu menu navigasi (kecuali template_wa — tetap super_admin saja)
        $mirrorCodes = [
            self::MENU_CODE,
            'action.umum.ui.cari_santri',
            'action.umum.ui.detail_santri',
            'action.umum.ui.edit_santri',
            'action.umum.ui.detail_user',
        ];
        $mirrorIn = implode(',', array_map([$this, 'quote'], $mirrorCodes));
        $this->execute(
            "INSERT IGNORE INTO `role___fitur` (`role_id`, `fitur_id`)
             SELECT DISTINCT rf.`role_id`, fnew.`id`
             FROM `role___fitur` rf
             INNER JOIN `app___fitur` fold ON fold.`id` = rf.`fitur_id`
               AND fold.`id_app` = 1 AND fold.`type` = 'menu'
             INNER JOIN `app___fitur` fnew ON fnew.`id_app` = 1
               AND fnew.`code` IN ($mirrorIn)"
        );
    }

    public function down(): void
    {
        $codes = array_merge([self::MENU_CODE], array_column(self::ACTIONS, 0));
        $inList = implode(',', array_map([$this, 'quote'], $codes));
        $this->execute(
            "DELETE rf FROM `role___fitur` rf
             INNER JOIN `app___fitur` f ON f.`id` = rf.`fitur_id`
             WHERE f.`id_app` = 1 AND f.`code` IN ($inList)"
        );
        $this->execute(
            "DELETE FROM `app___fitur` WHERE `id_app` = 1 AND `code` IN ($inList)"
        );
    }

    private function quote(string $value): string
    {
        return $this->getAdapter()->getConnection()->quote($value);
    }
}
