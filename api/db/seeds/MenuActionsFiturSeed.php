<?php

declare(strict_types=1);

use Phinx\Seed\AbstractSeed;

/**
 * Menyisipkan baris app___fitur type=action (eBeddien) setelah menu ada.
 *
 * Masalah: migrasi *fitur_actions mencari parent menu lalu return jika belum ada;
 * urutan deploy umumnya migrate → seed, jadi di staging migrasi "kosong" tetap sukses
 * dan phinxlog tercatat — action tidak pernah terisi.
 *
 * Jalankan setelah AppFiturMenuSeed. Secara alfabet Phinx: AppFiturMenuSeed lalu MenuActionsFiturSeed
 * lalu RoleFiturMenuSeed — urutan benar untuk seed:run tanpa -s.
 *
 * Setelah seed ini: php vendor/bin/phinx seed:run -s RoleFiturMenuSeed
 */
class MenuActionsFiturSeed extends AbstractSeed
{
    public function run(): void
    {
        $conn = $this->getAdapter()->getConnection();

        // --- Bersihkan kode yang dihapus migrasi pendaftaran (idempoten) ---
        $remove = [
            'action.pendaftaran.data_pendaftar.export',
            'action.pendaftaran.data_pendaftar.bulk_edit',
            'action.pendaftaran.route.padukan_data',
            'action.pendaftaran.route.pengaturan',
            'action.pendaftaran.dashboard.stats_cards',
            'action.pendaftaran.dashboard.charts',
            'action.pendaftaran.dashboard.last_pendaftar',
        ];
        $in = "'" . implode("','", $remove) . "'";
        $conn->exec("DELETE FROM `app___fitur` WHERE `id_app` = 1 AND `type` = 'action' AND `code` IN ($in)");

        $pidStmt = $conn->prepare('SELECT `id` FROM `app___fitur` WHERE `id_app` = 1 AND `code` = ? LIMIT 1');
        $ins = $conn->prepare(
            'INSERT IGNORE INTO `app___fitur` (`id_app`, `parent_id`, `type`, `code`, `label`, `path`, `icon_key`, `group_label`, `sort_order`, `meta_json`) '
            . 'VALUES (1, ?, \'action\', ?, ?, NULL, NULL, ?, ?, ?)'
        );

        $this->seedBeranda($conn, $pidStmt, $ins);
        $this->seedChatAi($conn, $pidStmt, $ins);
        $this->seedPendaftaran($conn, $pidStmt, $ins);
        $this->seedPengeluaran($conn, $pidStmt, $ins);
        $this->seedLaporanUwaba($conn, $pidStmt, $ins);
        $this->seedUgtMadrasahScope($conn, $pidStmt, $ins);
        $this->seedUgtLaporan($conn, $pidStmt, $ins);
        $this->seedKalenderPengaturan($conn, $pidStmt, $ins);

        $this->reparentPendaftaranItemRoutes($conn);
    }

    private function seedKalenderPengaturan(\PDO $conn, \PDOStatement $pidStmt, \PDOStatement $ins): void
    {
        $parentId = $this->parentId($conn, $pidStmt, 'menu.kalender.pengaturan');
        if ($parentId === null) {
            return;
        }
        $meta = '{"requiresRole":["admin_kalender","super_admin"]}';
        $actions = [
            ['action.kalender.pengaturan.tab_bulan', 'Pengaturan kalender · Tab bulan (matriks)', 10],
            ['action.kalender.pengaturan.tab_hari_penting', 'Pengaturan kalender · Tab hari penting', 20],
            ['action.hari_penting.target.global', 'Hari penting · Target audiens global', 30],
            ['action.hari_penting.target.lembaga', 'Hari penting · Target lembaga (sesuai jabatan)', 40],
            ['action.hari_penting.target.user_selembaga', 'Hari penting · Target pengguna selembaga', 50],
            ['action.hari_penting.target.self', 'Hari penting · Target hanya diri sendiri', 60],
        ];
        foreach ($actions as $a) {
            // Urutan placeholder: parent_id, code, label, group_label, sort_order, meta_json
            $ins->execute([$parentId, $a[0], $a[1], 'Kalender', $a[2], $meta]);
        }
    }

    private function parentId(\PDO $conn, \PDOStatement $pidStmt, string $code): ?int
    {
        $pidStmt->execute([$code]);
        $row = $pidStmt->fetch(\PDO::FETCH_ASSOC);

        return ($row !== false && !empty($row['id'])) ? (int) $row['id'] : null;
    }

    private function seedBeranda(\PDO $conn, \PDOStatement $pidStmt, \PDOStatement $ins): void
    {
        $parentId = $this->parentId($conn, $pidStmt, 'menu.beranda');
        if ($parentId === null) {
            return;
        }
        $actions = [
            ['action.beranda.widget.total_pendaftaran', 'Widget Total Pendaftaran', 10, 'My Workspace', '{"requiresRole":["admin_psb","petugas_psb","super_admin"]}'],
            ['action.beranda.widget.pembayaran_hari_ini', 'Widget Pembayaran Hari Ini', 20, 'My Workspace', '{"requiresRole":["admin_uwaba","petugas_uwaba","super_admin"]}'],
            ['action.beranda.widget.ringkasan_keuangan', 'Widget Ringkasan Keuangan', 30, 'My Workspace', '{"requiresRole":["admin_uwaba","petugas_keuangan","super_admin"],"requiresPermission":"manage_finance"}'],
            ['action.beranda.widget.aktivitas_terbaru', 'Widget Aktivitas Terbaru', 40, 'My Workspace', null],
            ['action.beranda.widget.kalender_samping', 'Panel Kalender (desktop)', 50, 'My Workspace', null],
        ];
        foreach ($actions as $a) {
            $ins->execute([$parentId, $a[0], $a[1], $a[2], $a[3], $a[4]]);
        }
    }

    private function seedChatAi(\PDO $conn, \PDOStatement $pidStmt, \PDOStatement $ins): void
    {
        $parentId = $this->parentId($conn, $pidStmt, 'menu.chat_ai');
        if ($parentId === null) {
            return;
        }
        $meta = '{"requiresSuperAdmin":true}';
        $actions = [
            ['action.chat_ai.page.training_bank', 'Chat AI · Bank Q&A', 10],
            ['action.chat_ai.page.training_chat', 'Chat AI · Training Chat', 20],
            ['action.chat_ai.page.dashboard', 'Chat AI · Dashboard', 30],
            ['action.chat_ai.page.riwayat', 'Chat AI · Riwayat', 40],
            ['action.chat_ai.ui.user_ai_settings', 'Chat AI · Pengaturan User AI', 50],
            ['action.chat_ai.ui.mode_alternatif', 'Chat AI · Mode alternatif (proxy)', 60],
        ];
        foreach ($actions as $a) {
            $ins->execute([$parentId, $a[0], $a[1], $a[2], 'My Workspace', $meta]);
        }
    }

    private function seedPendaftaran(\PDO $conn, \PDOStatement $pidStmt, \PDOStatement $ins): void
    {
        $metaPsb = '{"requiresRole":["admin_psb","petugas_psb","super_admin"]}';
        $metaSuperOnly = '{"requiresSuperAdmin":true}';

        $groups = [
            [
                'parent_code' => 'menu.pendaftaran.data_pendaftar',
                'group_label' => 'Pendaftaran',
                'rows' => [
                    ['action.pendaftaran.data_pendaftar.filter_formal_diniyah_semua_lembaga', 'Data Pendaftar · Filter formal/diniyah semua lembaga', 10, $metaPsb],
                ],
            ],
            [
                'parent_code' => 'menu.pendaftaran',
                'group_label' => 'Pendaftaran',
                'rows' => [
                    ['action.pendaftaran.biodata.hapus_santri', 'Pendaftaran · Hapus registrasi / santri (biodata)', 95, $metaPsb],
                ],
            ],
            [
                'parent_code' => 'menu.pendaftaran.item',
                'group_label' => 'Pendaftaran',
                'rows' => [
                    ['action.pendaftaran.route.item', 'Item · Daftar item', 100, $metaSuperOnly],
                    ['action.pendaftaran.route.manage_item_set', 'Item · Item Set', 110, $metaSuperOnly],
                    ['action.pendaftaran.route.manage_kondisi', 'Item · Kondisi', 120, $metaSuperOnly],
                    ['action.pendaftaran.route.kondisi_registrasi', 'Item · Registrasi', 130, $metaSuperOnly],
                    ['action.pendaftaran.route.assign_item', 'Item · Assign item', 140, $metaSuperOnly],
                    ['action.pendaftaran.route.simulasi', 'Item · Simulasi', 150, $metaSuperOnly],
                ],
            ],
        ];

        foreach ($groups as $g) {
            $parentId = $this->parentId($conn, $pidStmt, $g['parent_code']);
            if ($parentId === null) {
                continue;
            }
            foreach ($g['rows'] as $r) {
                $ins->execute([$parentId, $r[0], $r[1], $r[2], $g['group_label'], $r[3]]);
            }
        }
    }

    private function seedPengeluaran(\PDO $conn, \PDOStatement $pidStmt, \PDOStatement $ins): void
    {
        $parentId = $this->parentId($conn, $pidStmt, 'menu.pengeluaran');
        if ($parentId === null) {
            return;
        }
        $meta = '{"requiresRole":["admin_uwaba","petugas_keuangan","super_admin"]}';
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
            $ins->execute([$parentId, $a[0], $a[1], $a[2], 'Keuangan', $meta]);
        }
    }

    private function seedLaporanUwaba(\PDO $conn, \PDOStatement $pidStmt, \PDOStatement $ins): void
    {
        $parentId = $this->parentId($conn, $pidStmt, 'menu.laporan');
        if ($parentId === null) {
            return;
        }
        $metaUwaba = '{"requiresRole":["admin_uwaba","petugas_uwaba","super_admin"]}';
        $metaPsb = '{"requiresRole":["admin_psb","petugas_psb","super_admin"]}';
        $actions = [
            ['action.laporan.tab.tunggakan', 'Laporan · Tab Tunggakan', 10, $metaUwaba],
            ['action.laporan.tab.khusus', 'Laporan · Tab Khusus', 20, $metaUwaba],
            ['action.laporan.tab.uwaba', 'Laporan · Tab UWABA', 30, $metaUwaba],
            ['action.laporan.tab.pendaftaran', 'Laporan · Tab Pendaftaran', 40, $metaPsb],
        ];
        foreach ($actions as $a) {
            $ins->execute([$parentId, $a[0], $a[1], $a[2], 'UWABA', $a[3]]);
        }
    }

    private function seedUgtMadrasahScope(\PDO $conn, \PDOStatement $pidStmt, \PDOStatement $ins): void
    {
        $parentId = $this->parentId($conn, $pidStmt, 'menu.ugt.data_madrasah');
        if ($parentId === null) {
            return;
        }
        $meta = '{"requiresRole":["admin_ugt","super_admin"]}';
        $ins->execute([
            $parentId,
            'action.ugt.data_madrasah.scope_all',
            'Data Madrasah · Lihat semua madrasah',
            10,
            'UGT',
            $meta,
        ]);
    }

    private function seedUgtLaporan(\PDO $conn, \PDOStatement $pidStmt, \PDOStatement $ins): void
    {
        $parentId = $this->parentId($conn, $pidStmt, 'menu.ugt.laporan');
        if ($parentId === null) {
            return;
        }
        $metaTabs = '{"requiresRole":["admin_ugt","koordinator_ugt","super_admin"]}';
        $metaFilter = '{"requiresRole":["admin_ugt","super_admin"]}';
        $actions = [
            ['action.ugt.laporan.tab.koordinator', 'Laporan UGT · Tab Koordinator', 10, $metaTabs],
            ['action.ugt.laporan.tab.gt', 'Laporan UGT · Tab GT', 20, $metaTabs],
            ['action.ugt.laporan.tab.pjgt', 'Laporan UGT · Tab PJGT', 30, $metaTabs],
            ['action.ugt.laporan.filter_koordinator_semua', 'Laporan UGT · Filter semua koordinator', 40, $metaFilter],
        ];
        foreach ($actions as $a) {
            $ins->execute([$parentId, $a[0], $a[1], $a[2], 'UGT', $a[3]]);
        }
    }

    private function reparentPendaftaranItemRoutes(\PDO $conn): void
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
        $conn->exec("
            UPDATE `app___fitur` AS c
            INNER JOIN `app___fitur` AS p ON p.`id_app` = 1 AND p.`code` = 'menu.pendaftaran.item' AND p.`type` = 'menu'
            SET c.`parent_id` = p.`id`
            WHERE c.`id_app` = 1 AND c.`type` = 'action' AND c.`code` IN ($inItem)
        ");
    }
}
