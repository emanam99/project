<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Sub-fitur halaman Beranda (type=action, parent = menu Beranda) untuk RBAC per widget.
 * Setelah migrasi: jalankan ulang seed RoleFiturMenuSeed agar role___fitur terisi untuk baris baru.
 */
final class BerandaFiturActions extends AbstractMigration
{
    public function up(): void
    {
        $conn = $this->getAdapter()->getConnection();
        $stmt = $conn->prepare('SELECT `id` FROM `app___fitur` WHERE `id_app` = 1 AND `code` = ? LIMIT 1');
        $stmt->execute(['menu.beranda']);
        $row = $stmt->fetch(\PDO::FETCH_ASSOC);
        if ($row === false || empty($row['id'])) {
            return;
        }
        $parentId = (int) $row['id'];

        $actions = [
            ['action.beranda.widget.total_pendaftaran', 'Widget Total Pendaftaran', 10, '{"requiresRole":["admin_psb","petugas_psb","super_admin"]}'],
            ['action.beranda.widget.pembayaran_hari_ini', 'Widget Pembayaran Hari Ini', 20, '{"requiresRole":["admin_uwaba","petugas_uwaba","super_admin"]}'],
            ['action.beranda.widget.ringkasan_keuangan', 'Widget Ringkasan Keuangan', 30, '{"requiresRole":["admin_uwaba","super_admin"]}'],
            ['action.beranda.widget.aktivitas_terbaru', 'Widget Aktivitas Terbaru', 40, null],
            ['action.beranda.widget.kalender_samping', 'Panel Kalender (desktop)', 50, null],
        ];

        $ins = $conn->prepare(
            'INSERT IGNORE INTO `app___fitur` (`id_app`, `parent_id`, `type`, `code`, `label`, `path`, `icon_key`, `group_label`, `sort_order`, `meta_json`) '
            . 'VALUES (1, ?, \'action\', ?, ?, NULL, NULL, \'My Workspace\', ?, ?)'
        );

        foreach ($actions as $a) {
            $meta = $a[3];
            $ins->execute([$parentId, $a[0], $a[1], $a[2], $meta]);
        }
    }

    public function down(): void
    {
        $this->execute(
            "DELETE FROM `app___fitur` WHERE `id_app` = 1 AND `type` = 'action' AND `code` LIKE 'action.beranda.widget.%'"
        );
    }
}
