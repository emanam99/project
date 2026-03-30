<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Pengaturan Kalender: tab Bulan / Hari penting + aksi target hari penting (global, lembaga, user selembaga, self).
 * Tanpa migrasi ini baris hanya terisi jika MenuActionsFiturSeed dijalankan ulang — halaman Fitur tidak menampilkan aksi.
 *
 * Setelah migrasi: php vendor/bin/phinx seed:run -s RoleFiturMenuSeed
 */
final class KalenderPengaturanFiturActions extends AbstractMigration
{
    public function up(): void
    {
        $conn = $this->getAdapter()->getConnection();
        $stmt = $conn->prepare('SELECT `id` FROM `app___fitur` WHERE `id_app` = 1 AND `code` = ? LIMIT 1');
        $stmt->execute(['menu.kalender.pengaturan']);
        $row = $stmt->fetch(\PDO::FETCH_ASSOC);
        if ($row === false || empty($row['id'])) {
            return;
        }
        $parentId = (int) $row['id'];
        $meta = '{"requiresRole":["admin_kalender","super_admin"]}';

        $ins = $conn->prepare(
            'INSERT IGNORE INTO `app___fitur` (`id_app`, `parent_id`, `type`, `code`, `label`, `path`, `icon_key`, `group_label`, `sort_order`, `meta_json`) '
            . 'VALUES (1, ?, \'action\', ?, ?, NULL, NULL, \'Kalender\', ?, ?)'
        );

        $actions = [
            ['action.kalender.pengaturan.tab_bulan', 'Pengaturan kalender · Tab bulan (matriks)', 10],
            ['action.kalender.pengaturan.tab_hari_penting', 'Pengaturan kalender · Tab hari penting', 20],
            ['action.hari_penting.target.global', 'Hari penting · Target audiens global', 30],
            ['action.hari_penting.target.lembaga', 'Hari penting · Target lembaga (sesuai jabatan)', 40],
            ['action.hari_penting.target.user_selembaga', 'Hari penting · Target pengguna selembaga', 50],
            ['action.hari_penting.target.self', 'Hari penting · Target hanya diri sendiri', 60],
        ];
        foreach ($actions as $a) {
            $ins->execute([$parentId, $a[0], $a[1], $a[2], $meta]);
        }
    }

    public function down(): void
    {
        $codes = [
            'action.kalender.pengaturan.tab_bulan',
            'action.kalender.pengaturan.tab_hari_penting',
            'action.hari_penting.target.global',
            'action.hari_penting.target.lembaga',
            'action.hari_penting.target.user_selembaga',
            'action.hari_penting.target.self',
        ];
        $in = "'" . implode("','", $codes) . "'";
        $this->execute(
            "DELETE FROM `app___fitur` WHERE `id_app` = 1 AND `type` = 'action' AND `code` IN ($in)"
        );
    }
}
