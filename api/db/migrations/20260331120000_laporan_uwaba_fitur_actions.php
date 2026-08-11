<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Tab jenis data di halaman Laporan (/laporan) sebagai action di bawah menu Laporan.
 * Setelah migrasi: jalankan ulang RoleFiturMenuSeed agar role___fitur terisi.
 */
final class LaporanUwabaFiturActions extends AbstractMigration
{
    public function up(): void
    {
        $conn = $this->getAdapter()->getConnection();
        $stmt = $conn->prepare('SELECT `id` FROM `app___fitur` WHERE `id_app` = 1 AND `code` = ? LIMIT 1');
        $stmt->execute(['menu.laporan']);
        $row = $stmt->fetch(\PDO::FETCH_ASSOC);
        if ($row === false || empty($row['id'])) {
            return;
        }
        $parentId = (int) $row['id'];

        $metaUwaba = '{"requiresRole":["admin_uwaba","petugas_uwaba","super_admin"]}';
        $metaPsb = '{"requiresRole":["admin_psb","petugas_psb","super_admin"]}';

        $actions = [
            ['action.laporan.tab.tunggakan', 'Laporan · Tab Tunggakan', 10, $metaUwaba],
            ['action.laporan.tab.khusus', 'Laporan · Tab Khusus', 20, $metaUwaba],
            ['action.laporan.tab.uwaba', 'Laporan · Tab UWABA', 30, $metaUwaba],
            ['action.laporan.tab.pendaftaran', 'Laporan · Tab Pendaftaran', 40, $metaPsb],
        ];

        $ins = $conn->prepare(
            'INSERT IGNORE INTO `app___fitur` (`id_app`, `parent_id`, `type`, `code`, `label`, `path`, `icon_key`, `group_label`, `sort_order`, `meta_json`) '
            . 'VALUES (1, ?, \'action\', ?, ?, NULL, NULL, \'UWABA\', ?, ?)'
        );

        foreach ($actions as $a) {
            $ins->execute([$parentId, $a[0], $a[1], $a[2], $a[3]]);
        }
    }

    public function down(): void
    {
        $this->execute(
            "DELETE FROM `app___fitur` WHERE `id_app` = 1 AND `type` = 'action' AND `code` LIKE 'action.laporan.tab.%'"
        );
    }
}
