<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Tab Laporan UGT (/ugt/laporan/...) + aksi filter koordinator (semua vs hanya diri).
 * Tab: requiresRole admin_ugt, koordinator_ugt, super_admin (seed default sama seperti menu).
 * Filter semua koordinator: hanya admin_ugt & super_admin di meta agar koordinator tidak otomatis dapat;
 * super_admin bisa menambahkan koordinator_ugt lewat Pengaturan → Fitur.
 *
 * Setelah migrasi: php vendor/bin/phinx seed:run -s RoleFiturMenuSeed
 */
final class UgtLaporanFiturActions extends AbstractMigration
{
    public function up(): void
    {
        $conn = $this->getAdapter()->getConnection();
        $stmt = $conn->prepare('SELECT `id` FROM `app___fitur` WHERE `id_app` = 1 AND `code` = ? LIMIT 1');
        $stmt->execute(['menu.ugt.laporan']);
        $row = $stmt->fetch(\PDO::FETCH_ASSOC);
        if ($row === false || empty($row['id'])) {
            return;
        }
        $parentId = (int) $row['id'];
        $metaTabs = '{"requiresRole":["admin_ugt","koordinator_ugt","super_admin"]}';
        $metaFilter = '{"requiresRole":["admin_ugt","super_admin"]}';

        $ins = $conn->prepare(
            'INSERT IGNORE INTO `app___fitur` (`id_app`, `parent_id`, `type`, `code`, `label`, `path`, `icon_key`, `group_label`, `sort_order`, `meta_json`) '
            . 'VALUES (1, ?, \'action\', ?, ?, NULL, NULL, \'UGT\', ?, ?)'
        );

        $actions = [
            ['action.ugt.laporan.tab.koordinator', 'Laporan UGT · Tab Koordinator', 10, $metaTabs],
            ['action.ugt.laporan.tab.gt', 'Laporan UGT · Tab GT', 20, $metaTabs],
            ['action.ugt.laporan.tab.pjgt', 'Laporan UGT · Tab PJGT', 30, $metaTabs],
            ['action.ugt.laporan.filter_koordinator_semua', 'Laporan UGT · Filter semua koordinator', 40, $metaFilter],
        ];
        foreach ($actions as $a) {
            $ins->execute([$parentId, $a[0], $a[1], $a[2], $a[3]]);
        }
    }

    public function down(): void
    {
        $this->execute(
            "DELETE FROM `app___fitur` WHERE `id_app` = 1 AND `type` = 'action' AND (`code` LIKE 'action.ugt.laporan.tab.%' OR `code` = 'action.ugt.laporan.filter_koordinator_semua')"
        );
    }
}
