<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Halaman Pengeluaran: tab, filter lembaga per tab, aksi rencana/draft/pengeluaran.
 * Meta requiresRole: admin_uwaba + super_admin (selaras menu Keuangan).
 * Setelah migrasi: php vendor/bin/phinx seed:run -s RoleFiturMenuSeed
 */
final class PengeluaranFiturActions extends AbstractMigration
{
    public function up(): void
    {
        $conn = $this->getAdapter()->getConnection();
        $stmt = $conn->prepare('SELECT `id` FROM `app___fitur` WHERE `id_app` = 1 AND `code` = ? LIMIT 1');
        $stmt->execute(['menu.pengeluaran']);
        $row = $stmt->fetch(\PDO::FETCH_ASSOC);
        if ($row === false || empty($row['id'])) {
            return;
        }
        $parentId = (int) $row['id'];
        $meta = '{"requiresRole":["admin_uwaba","super_admin"]}';

        $ins = $conn->prepare(
            'INSERT IGNORE INTO `app___fitur` (`id_app`, `parent_id`, `type`, `code`, `label`, `path`, `icon_key`, `group_label`, `sort_order`, `meta_json`) '
            . 'VALUES (1, ?, \'action\', ?, ?, NULL, NULL, \'Keuangan\', ?, ?)'
        );

        $actions = [
            ['action.pengeluaran.tab.rencana', 'Pengeluaran · Tab Rencana', 10],
            ['action.pengeluaran.tab.pengeluaran', 'Pengeluaran · Tab Pengeluaran', 20],
            ['action.pengeluaran.tab.draft', 'Pengeluaran · Tab Draft', 30],
            ['action.pengeluaran.rencana.lembaga_semua', 'Rencana · Filter semua lembaga', 40],
            ['action.pengeluaran.pengeluaran.lembaga_semua', 'Pengeluaran · Filter semua lembaga', 50],
            ['action.pengeluaran.draft.lembaga_semua', 'Draft · Filter semua lembaga', 60],
            ['action.pengeluaran.rencana.buat', 'Rencana · Tombol buat rencana', 70],
            ['action.pengeluaran.rencana.simpan', 'Rencana · Simpan (kirim)', 80],
            ['action.pengeluaran.rencana.simpan_draft', 'Rencana · Simpan sebagai draft', 90],
            ['action.pengeluaran.rencana.edit', 'Rencana · Edit', 100],
            ['action.pengeluaran.rencana.approve', 'Rencana · Approve', 110],
            ['action.pengeluaran.rencana.tolak', 'Rencana · Tolak', 120],
            ['action.pengeluaran.item.edit', 'Pengeluaran · Edit di offcanvas', 130],
            ['action.pengeluaran.item.hapus', 'Pengeluaran · Hapus', 140],
            ['action.pengeluaran.draft.buat', 'Draft · Tombol buat (baru)', 150],
            ['action.pengeluaran.draft.edit', 'Draft · Edit', 160],
            ['action.pengeluaran.draft.hapus', 'Draft · Hapus draft', 170],
        ];
        foreach ($actions as $a) {
            $ins->execute([$parentId, $a[0], $a[1], $a[2], $meta]);
        }
    }

    public function down(): void
    {
        $this->execute(
            "DELETE FROM `app___fitur` WHERE `id_app` = 1 AND `type` = 'action' AND `code` LIKE 'action.pengeluaran.%'"
        );
    }
}
