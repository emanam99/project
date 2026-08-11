<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Pastikan menu Alumni (grup ISBAD) ada di app___fitur.
 * Hak akses: hanya super_admin di seed ini; role lain lewat Pengaturan → Fitur.
 *
 * Deploy cukup `phinx migrate` (tidak bergantung seed ulang RoleFiturMenuSeed).
 */
final class AlumniIsbadMenuNav extends AbstractMigration
{
    public function up(): void
    {
        $this->execute(
            "INSERT IGNORE INTO `app___fitur` (`id_app`, `parent_id`, `type`, `code`, `label`, `path`, `icon_key`, `group_label`, `sort_order`, `meta_json`) "
            . "VALUES (1, NULL, 'menu', 'menu.alumni', 'Alumni', '/alumni', 'usersGroup', 'ISBAD', 10, NULL)"
        );

        $this->execute(
            "UPDATE `app___fitur`
             SET `group_label` = 'ISBAD', `path` = '/alumni', `label` = 'Alumni', `icon_key` = 'usersGroup'
             WHERE `id_app` = 1 AND `code` = 'menu.alumni' AND `type` = 'menu'"
        );

        $menuId = $this->fetchRow(
            "SELECT `id` FROM `app___fitur` WHERE `id_app` = 1 AND `code` = 'menu.alumni' AND `type` = 'menu' LIMIT 1"
        );
        $parentId = $menuId ? (int) $menuId['id'] : 0;
        if ($parentId <= 0) {
            return;
        }

        $actions = [
            ['action.alumni.edit', 'Alumni · Edit biodata', 10],
            ['action.alumni.hapus', 'Alumni · Hapus', 20],
            ['action.alumni.status', 'Alumni · Toggle hidup/wafat', 30],
        ];
        foreach ($actions as $a) {
            $this->execute(sprintf(
                "INSERT IGNORE INTO `app___fitur` (`id_app`, `parent_id`, `type`, `code`, `label`, `path`, `icon_key`, `group_label`, `sort_order`, `meta_json`) "
                . "VALUES (1, %d, 'action', %s, %s, '', NULL, 'ISBAD', %d, NULL)",
                $parentId,
                $this->quote($a[0]),
                $this->quote($a[1]),
                $a[2]
            ));
        }

        $this->execute(
            "UPDATE `app___fitur` SET `group_label` = 'ISBAD', `parent_id` = {$parentId}
             WHERE `id_app` = 1 AND `type` = 'action' AND `code` IN (
               'action.alumni.edit', 'action.alumni.hapus', 'action.alumni.status'
             )"
        );

        // super_admin → semua fitur alumni
        $this->execute(
            'INSERT IGNORE INTO `role___fitur` (`role_id`, `fitur_id`)
             SELECT r.`id`, f.`id`
             FROM `role` r
             CROSS JOIN `app___fitur` f
             WHERE r.`key` = \'super_admin\'
               AND f.`id_app` = 1
               AND f.`code` IN (\'menu.alumni\', \'action.alumni.edit\', \'action.alumni.hapus\', \'action.alumni.status\')'
        );
    }

    public function down(): void
    {
        // Tidak menghapus menu/role — aman untuk rollback kosong (data navigasi tetap).
    }

    private function quote(string $value): string
    {
        return $this->getAdapter()->getConnection()->quote($value);
    }
}
