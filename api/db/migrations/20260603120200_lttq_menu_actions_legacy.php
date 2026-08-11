<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Modul LTTQ: menu grup LTTQ + aksi + bootstrap role___fitur.
 */
final class LttqMenuActionsLegacy extends AbstractMigration
{
    private const ID_APP = 1;
    private const GROUP_LABEL = 'LTTQ';

    /** @return list<array{code:string,label:string,path:string,icon:string,sort:int}> */
    private function menus(): array
    {
        return [
            ['code' => 'menu.lttq.santri', 'label' => 'Santri LTTQ', 'path' => '/lttq/santri', 'icon' => 'users', 'sort' => 3010],
            ['code' => 'menu.lttq.tingkatan', 'label' => 'Tingkatan LTTQ', 'path' => '/lttq/tingkatan', 'icon' => 'academicCap', 'sort' => 3020],
        ];
    }

    /** @return list<array{parent:string,code:string,label:string,sort:int}> */
    private function actions(): array
    {
        return [
            ['parent' => 'menu.lttq.santri', 'code' => 'action.lttq.santri.halaman', 'label' => 'Santri LTTQ · Halaman', 'sort' => 10],
            ['parent' => 'menu.lttq.santri', 'code' => 'action.lttq.santri.pindah', 'label' => 'Santri LTTQ · Pindah tingkatan', 'sort' => 20],
            ['parent' => 'menu.lttq.tingkatan', 'code' => 'action.lttq.tingkatan.halaman', 'label' => 'Tingkatan · Halaman', 'sort' => 10],
            ['parent' => 'menu.lttq.tingkatan', 'code' => 'action.lttq.tingkatan.tambah', 'label' => 'Tingkatan · Tambah', 'sort' => 20],
            ['parent' => 'menu.lttq.tingkatan', 'code' => 'action.lttq.tingkatan.ubah', 'label' => 'Tingkatan · Ubah', 'sort' => 30],
            ['parent' => 'menu.lttq.tingkatan', 'code' => 'action.lttq.tingkatan.status', 'label' => 'Tingkatan · Ubah status', 'sort' => 40],
            ['parent' => 'menu.lttq.tingkatan', 'code' => 'action.lttq.tingkatan.mualim', 'label' => 'Tingkatan · Kelola mualim', 'sort' => 50],
            ['parent' => 'menu.lttq.tingkatan', 'code' => 'action.lttq.tingkatan.tingkatan_bertugas', 'label' => 'Tingkatan · Hanya tingkatan bertugas', 'sort' => 60],
        ];
    }

    public function up(): void
    {
        $conn = $this->getAdapter()->getConnection();

        $insMenu = $conn->prepare(
            'INSERT IGNORE INTO `app___fitur` (`id_app`, `parent_id`, `type`, `code`, `label`, `path`, `icon_key`, `group_label`, `sort_order`, `meta_json`) '
            . "VALUES (?, NULL, 'menu', ?, ?, ?, ?, ?, ?, NULL)"
        );
        foreach ($this->menus() as $m) {
            $insMenu->execute([self::ID_APP, $m['code'], $m['label'], $m['path'], $m['icon'], self::GROUP_LABEL, $m['sort']]);
        }

        $pidStmt = $conn->prepare('SELECT `id` FROM `app___fitur` WHERE `id_app` = ? AND `code` = ? LIMIT 1');
        $insAction = $conn->prepare(
            'INSERT IGNORE INTO `app___fitur` (`id_app`, `parent_id`, `type`, `code`, `label`, `path`, `icon_key`, `group_label`, `sort_order`, `meta_json`) '
            . "VALUES (?, ?, 'action', ?, ?, NULL, NULL, ?, ?, NULL)"
        );
        foreach ($this->actions() as $a) {
            $pidStmt->execute([self::ID_APP, $a['parent']]);
            $row = $pidStmt->fetch(\PDO::FETCH_ASSOC);
            if ($row === false || empty($row['id'])) {
                continue;
            }
            $insAction->execute([self::ID_APP, (int) $row['id'], $a['code'], $a['label'], self::GROUP_LABEL, $a['sort']]);
        }

        $this->execute(
            "INSERT IGNORE INTO `role___fitur` (`role_id`, `fitur_id`)
             SELECT r.`id`, f.`id`
             FROM `role` r
             CROSS JOIN `app___fitur` f
             WHERE r.`key` IN ('super_admin','admin_lttq')
               AND f.`id_app` = " . self::ID_APP . "
               AND (f.`code` LIKE 'menu.lttq.%' OR f.`code` LIKE 'action.lttq.%')"
        );

        $this->execute(
            "INSERT IGNORE INTO `role___fitur` (`role_id`, `fitur_id`)
             SELECT r.`id`, f.`id`
             FROM `role` r
             CROSS JOIN `app___fitur` f
             WHERE r.`key` = 'petugas_lttq'
               AND f.`id_app` = " . self::ID_APP . "
               AND (
                    f.`code` IN ('menu.lttq.santri','menu.lttq.tingkatan')
                 OR f.`code` IN (
                    'action.lttq.santri.halaman',
                    'action.lttq.santri.pindah',
                    'action.lttq.tingkatan.halaman',
                    'action.lttq.tingkatan.mualim',
                    'action.lttq.tingkatan.tingkatan_bertugas'
                 )
               )"
        );

        $legacyKey = 'lttqStaffSelectors';
        $roles = ['super_admin', 'admin_lttq', 'petugas_lttq'];
        $i = 0;
        foreach ($roles as $rk) {
            $lk = $conn->quote($legacyKey);
            $rkv = $conn->quote($rk);
            $this->execute(sprintf(
                'INSERT IGNORE INTO `ebeddien_legacy_route_role` (`legacy_key`, `role_key`, `sort_order`) VALUES (%s, %s, %d)',
                $lk,
                $rkv,
                $i
            ));
            $i++;
        }
    }

    public function down(): void
    {
        $this->execute("DELETE FROM `ebeddien_legacy_route_role` WHERE `legacy_key` = 'lttqStaffSelectors'");
        $this->execute(
            "DELETE rf FROM `role___fitur` rf
             INNER JOIN `app___fitur` f ON f.id = rf.fitur_id
             WHERE f.`id_app` = " . self::ID_APP . "
               AND (f.`code` LIKE 'menu.lttq.%' OR f.`code` LIKE 'action.lttq.%')"
        );
        $this->execute(
            "DELETE FROM `app___fitur`
             WHERE `id_app` = " . self::ID_APP . "
               AND (`code` LIKE 'menu.lttq.%' OR `code` LIKE 'action.lttq.%')"
        );
    }
}
