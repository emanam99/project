<?php

declare(strict_types=1);

use Phinx\Seed\AbstractSeed;

/**
 * Menyisipkan baris app___fitur type=action (eBeddien) setelah menu ada.
 * Hanya definisi aksi (kode, label, grup); meta_json akses tidak diisi — penugasan role lewat role___fitur
 * (Pengaturan → Fitur) dan RoleFiturMenuSeed (bootstrap super_admin saja).
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
            . 'VALUES (1, ?, \'action\', ?, ?, NULL, NULL, ?, ?, NULL)'
        );

        $this->seedBeranda($conn, $pidStmt, $ins);
        $this->seedChatAi($conn, $pidStmt, $ins);
        $this->seedPendaftaran($conn, $pidStmt, $ins);
        $this->seedPengeluaran($conn, $pidStmt, $ins);
        $this->seedAbsen($conn, $pidStmt, $ins);
        $this->seedPengurus($conn, $pidStmt, $ins);
        $this->seedLembagaHalamanAksi($conn, $pidStmt, $ins);
        $this->seedLaporanUwaba($conn, $pidStmt, $ins);
        $this->seedUgtMadrasahScope($conn, $pidStmt, $ins);
        $this->seedUgtLaporan($conn, $pidStmt, $ins);
        $this->seedUgtGuruTugasTugasan($conn, $pidStmt, $ins);
        $this->seedUgtKompas($conn, $pidStmt, $ins);
        $this->seedSuperAdminInstallActivity($conn, $pidStmt, $ins);
        $this->seedKalenderPengaturan($conn, $pidStmt, $ins);
        $this->seedWebsite($conn, $pidStmt, $ins);
        $this->seedDomisiliPelanggaran($conn, $pidStmt, $ins);
        $this->seedAlumni($conn, $pidStmt, $ins);
        $this->seedUmum($conn, $pidStmt, $ins);

        $this->reparentPendaftaranItemRoutes($conn);
    }

    /** Grup Umum — offcanvas / callables lintas halaman */
    private function seedUmum(\PDO $conn, \PDOStatement $pidStmt, \PDOStatement $ins): void
    {
        $rows = [
            ['menu.umum', 'action.umum.ui.cari_santri', 'Umum · Cari Santri', 10],
            ['menu.umum', 'action.umum.ui.detail_santri', 'Umum · Detail Santri', 20],
            ['menu.umum', 'action.umum.ui.edit_santri', 'Umum · Edit Santri', 30],
            ['menu.umum', 'action.umum.ui.detail_user', 'Umum · Detail User / Pengurus', 40],
            ['menu.umum', 'action.umum.ui.template_wa', 'Umum · Template WhatsApp', 50],
        ];
        foreach ($rows as $r) {
            $parentId = $this->parentId($conn, $pidStmt, $r[0]);
            if ($parentId === null) {
                continue;
            }
            // Urutan argumen mengikuti seed lain (sort lalu group); group_label dirapikan di UPDATE.
            $ins->execute([$parentId, $r[1], $r[2], $r[3], 'Umum']);
        }
        $conn->exec(
            "UPDATE `app___fitur` SET `group_label` = 'Umum'
             WHERE `id_app` = 1 AND `type` = 'action' AND `code` LIKE 'action.umum.%'"
        );
    }

    /** Data Alumni — edit / hapus / toggle status */
    private function seedAlumni(\PDO $conn, \PDOStatement $pidStmt, \PDOStatement $ins): void
    {
        $rows = [
            ['menu.alumni', 'action.alumni.edit', 'Alumni · Edit biodata', 10],
            ['menu.alumni', 'action.alumni.hapus', 'Alumni · Hapus', 20],
            ['menu.alumni', 'action.alumni.status', 'Alumni · Toggle hidup/wafat', 30],
        ];
        foreach ($rows as $r) {
            $parentId = $this->parentId($conn, $pidStmt, $r[0]);
            if ($parentId === null) {
                continue;
            }
            $ins->execute([$parentId, $r[1], $r[2], $r[3], 'ISBAD']);
        }
        // Rapikan grup aksi Alumni ke ISBAD (seed lama sempat memakai Lembaga / angka sort).
        $conn->exec(
            "UPDATE `app___fitur` SET `group_label` = 'ISBAD'
             WHERE `id_app` = 1 AND `type` = 'action' AND `code` LIKE 'action.alumni.%'"
        );
    }

    /** Modul Website: aksi granular per menu (publish, hapus, kelola, ubah). */
    private function seedWebsite(\PDO $conn, \PDOStatement $pidStmt, \PDOStatement $ins): void
    {
        $rows = [
            ['menu.website.berita',  'action.website.berita.publish',  'Berita · Publikasikan / unpublish', 10],
            ['menu.website.berita',  'action.website.berita.hapus',    'Berita · Hapus',                    20],
            ['menu.website.banner',  'action.website.banner.kelola',   'Banner · Tambah / ubah / hapus',    10],
            ['menu.website.halaman', 'action.website.halaman.publish', 'Halaman · Publikasikan / unpublish', 10],
            ['menu.website.galeri',  'action.website.galeri.kelola',   'Galeri · Tambah / ubah / hapus',    10],
            ['menu.website.seo',     'action.website.seo.ubah',        'SEO · Ubah pengaturan global',      10],
        ];
        foreach ($rows as $r) {
            $parentId = $this->parentId($conn, $pidStmt, $r[0]);
            if ($parentId === null) {
                continue;
            }
            $ins->execute([$parentId, $r[1], $r[2], $r[3], 'Website']);
        }
    }

    private function seedKalenderPengaturan(\PDO $conn, \PDOStatement $pidStmt, \PDOStatement $ins): void
    {
        $parentId = $this->parentId($conn, $pidStmt, 'menu.kalender.pengaturan');
        if ($parentId === null) {
            return;
        }
        $actions = [
            ['action.kalender.pengaturan.tab_bulan', 'Pengaturan kalender · Tab bulan (matriks)', 10],
            ['action.kalender.pengaturan.tab_hari_penting', 'Pengaturan kalender · Tab Jadwal', 20],
            ['action.kalender.pengaturan.tab_lokasi', 'Pengaturan kalender · Tab Lokasi (daftar alamat)', 22],
            ['action.kalender.pengaturan.tab_istiwa', 'Pengaturan kalender · Tab Istiwa’', 25],
            ['action.hari_penting.target.global', 'Hari penting · Target audiens global', 30],
            ['action.hari_penting.target.lembaga', 'Hari penting · Target lembaga (sesuai jabatan)', 40],
            ['action.hari_penting.target.user_selembaga', 'Hari penting · Target pengguna selembaga', 50],
            ['action.hari_penting.target.self', 'Hari penting · Target hanya diri sendiri', 60],
        ];
        foreach ($actions as $a) {
            $ins->execute([$parentId, $a[0], $a[1], $a[2], 'Kalender']);
        }
        $conn->exec(
            "UPDATE `app___fitur` SET `label` = 'Pengaturan kalender · Tab Jadwal' WHERE `id_app` = 1 AND `code` = 'action.kalender.pengaturan.tab_hari_penting'"
        );
    }

    private function parentId(\PDO $conn, \PDOStatement $pidStmt, string $code): ?int
    {
        $pidStmt->execute([$code]);
        $row = $pidStmt->fetch(\PDO::FETCH_ASSOC);

        return ($row !== false && !empty($row['id'])) ? (int) $row['id'] : null;
    }

    private function seedDomisiliPelanggaran(\PDO $conn, \PDOStatement $pidStmt, \PDOStatement $ins): void
    {
        $rows = [
            ['menu.domisili.pelanggaran', 'action.domisili.pelanggaran.halaman', 'Pelanggaran · Akses halaman', 5],
            ['menu.domisili.pelanggaran', 'action.domisili.pelanggaran.buat', 'Pelanggaran · Tambah jenis', 10],
            ['menu.domisili.pelanggaran', 'action.domisili.pelanggaran.ubah', 'Pelanggaran · Ubah jenis', 20],
            ['menu.domisili.pelanggaran', 'action.domisili.pelanggaran.status', 'Pelanggaran · Aktif / nonaktif', 30],
        ];
        foreach ($rows as $r) {
            $parentId = $this->parentId($conn, $pidStmt, $r[0]);
            if ($parentId === null) {
                continue;
            }
            $ins->execute([$parentId, $r[1], $r[2], $r[3], 'Domisili']);
        }
    }

    private function seedBeranda(\PDO $conn, \PDOStatement $pidStmt, \PDOStatement $ins): void
    {
        $parentId = $this->parentId($conn, $pidStmt, 'menu.beranda');
        if ($parentId === null) {
            return;
        }
        $actions = [
            ['action.beranda.widget.total_pendaftaran', 'Widget Total Pendaftaran', 10, 'My Workspace'],
            ['action.beranda.widget.pembayaran_hari_ini', 'Widget Pembayaran Hari Ini', 20, 'My Workspace'],
            ['action.beranda.widget.ringkasan_keuangan', 'Widget Ringkasan Keuangan', 30, 'My Workspace'],
            ['action.beranda.widget.aktivitas_terbaru', 'Widget Aktivitas Terbaru', 40, 'My Workspace'],
            ['action.beranda.widget.kalender_samping', 'Panel Kalender (desktop)', 50, 'My Workspace'],
        ];
        foreach ($actions as $a) {
            $ins->execute([$parentId, $a[0], $a[1], $a[2], $a[3]]);
        }
    }

    private function seedChatAi(\PDO $conn, \PDOStatement $pidStmt, \PDOStatement $ins): void
    {
        $parentId = $this->parentId($conn, $pidStmt, 'menu.chat_ai');
        if ($parentId === null) {
            return;
        }
        $actions = [
            ['action.chat_ai.page.training_bank', 'Chat AI · Tab · Bank Q&A', 10],
            ['action.chat_ai.page.training_chat', 'Chat AI · Tab · Training Chat', 20],
            ['action.chat_ai.page.dashboard', 'Chat AI · Tab · Dashboard', 30],
            ['action.chat_ai.page.riwayat', 'Chat AI · Tab · Riwayat', 40],
            ['action.chat_ai.page.pengaturan', 'Chat AI · Tab · Pengaturan', 45],
            ['action.chat_ai.ui.user_ai_settings', 'Chat AI · Pengaturan User AI', 50],
            ['action.chat_ai.ui.mode_alternatif', 'Chat AI · Mode alternatif (proxy)', 60],
            ['action.chat_ai.agent.use', 'Chat AI · Agen otomasi (usulkan aksi)', 62],
            ['action.chat_ai.agent.confirm_write', 'Chat AI · Konfirmasi tulis agen', 64],
            ['action.chat_ai.ui.select_provider_manual', 'Chat AI · Pilih penyedia AI manual', 66],
        ];
        foreach ($actions as $a) {
            $ins->execute([$parentId, $a[0], $a[1], $a[2], 'My Workspace']);
        }
    }

    private function seedPendaftaran(\PDO $conn, \PDOStatement $pidStmt, \PDOStatement $ins): void
    {
        $groups = [
            [
                'parent_code' => 'menu.pendaftaran.pengajuan_nis',
                'group_label' => 'Pendaftaran',
                'rows' => [
                    ['action.pendaftaran.nis_pengajuan.kelola', 'Pengajuan NIS · Kelola pengajuan', 10],
                    ['action.pendaftaran.nis_pengajuan.edit_data', 'Pengajuan NIS · Edit data pemohon', 20],
                    ['action.pendaftaran.nis_pengajuan.kirim_nis', 'Pengajuan NIS · Kirim NIS ke WA pemohon', 30],
                ],
            ],
            [
                'parent_code' => 'menu.pendaftaran.data_pendaftar',
                'group_label' => 'Pendaftaran',
                'rows' => [
                    ['action.pendaftaran.data_pendaftar.filter_formal_diniyah_semua_lembaga', 'Data Pendaftar · Filter formal/diniyah semua lembaga', 10],
                ],
            ],
            [
                'parent_code' => 'menu.pendaftaran',
                'group_label' => 'Pendaftaran',
                'rows' => [
                    ['action.pendaftaran.biodata.hapus_santri', 'Pendaftaran · Hapus registrasi / santri (biodata)', 95],
                ],
            ],
            [
                'parent_code' => 'menu.pendaftaran.item',
                'group_label' => 'Pendaftaran',
                'rows' => [
                    ['action.pendaftaran.route.item', 'Item · Daftar item', 100],
                    ['action.pendaftaran.route.manage_item_set', 'Item · Item Set', 110],
                    ['action.pendaftaran.route.manage_kondisi', 'Item · Kondisi', 120],
                    ['action.pendaftaran.route.kondisi_registrasi', 'Item · Registrasi', 130],
                    ['action.pendaftaran.route.assign_item', 'Item · Assign item', 140],
                    ['action.pendaftaran.route.simulasi', 'Item · Simulasi', 150],
                ],
            ],
        ];

        foreach ($groups as $g) {
            $parentId = $this->parentId($conn, $pidStmt, $g['parent_code']);
            if ($parentId === null) {
                continue;
            }
            foreach ($g['rows'] as $r) {
                $ins->execute([$parentId, $r[0], $r[1], $r[2], $g['group_label']]);
            }
        }
    }

    private function seedPengeluaran(\PDO $conn, \PDOStatement $pidStmt, \PDOStatement $ins): void
    {
        $parentId = $this->parentId($conn, $pidStmt, 'menu.pengeluaran');
        if ($parentId === null) {
            return;
        }
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
            ['action.pengeluaran.rencana.hapus_komentar', 'Rencana · Hapus komentar (moderasi)', 121],
            ['action.pengeluaran.draft.notif.lembaga_sesuai_role', 'Draft · Notif WA lembaga sesuai role', 122],
            ['action.pengeluaran.notif.semua_lembaga', 'Pengeluaran · Notif WA semua lembaga', 123],
            ['action.pengeluaran.notif.lembaga_sesuai_role', 'Pengeluaran · Notif WA lembaga sesuai role', 124],
            ['action.pengeluaran.rencana.kelola_penerima_notif', 'Rencana · Kelola daftar penerima notifikasi WA', 125],
            ['action.pengeluaran.item.edit', 'Pengeluaran · Edit di offcanvas', 130],
            ['action.pengeluaran.item.kelola_penerima', 'Pengeluaran · Ubah penerima uang (offcanvas)', 132],
            ['action.pengeluaran.item.hapus', 'Pengeluaran · Hapus', 140],
            ['action.pengeluaran.draft.buat', 'Draft · Tombol buat (baru)', 150],
            ['action.pengeluaran.draft.edit', 'Draft · Edit', 160],
            ['action.pengeluaran.draft.hapus', 'Draft · Hapus draft', 170],
        ];
        foreach ($actions as $a) {
            $ins->execute([$parentId, $a[0], $a[1], $a[2], 'Keuangan']);
        }
    }

    /**
     * Halaman Lembaga: Santri, Rombel, Jabatan, Mapel — penugasan peran lewat Pengaturan → Fitur.
     */
    private function seedLembagaHalamanAksi(\PDO $conn, \PDOStatement $pidStmt, \PDOStatement $ins): void
    {
        $rows = [
            ['menu.santri', 'action.santri.halaman', 'Santri · Akses halaman data', 5],
            ['menu.santri', 'action.santri.filter.lembaga_semua', 'Santri · Filter semua lembaga', 8],
            ['menu.santri', 'action.santri.excel', 'Santri · Editor spreadsheet', 20],
            ['menu.santri', 'action.santri.riwayat_rombel.hapus', 'Santri · Hapus riwayat rombel', 25],
            ['menu.rombel', 'action.rombel.halaman', 'Rombel · Akses halaman', 5],
            ['menu.rombel', 'action.rombel.filter.lembaga_semua', 'Rombel · Filter semua lembaga', 8],
            ['menu.rombel', 'action.rombel.filter.semua_rombel_lembaga', 'Rombel · Semua rombel di lembaga', 9],
            ['menu.rombel', 'action.rombel.rombel_bertugas', 'Rombel · Rombel bertugas (wali / guru FAN)', 10],
            ['menu.rombel', 'action.rombel.catatan_santri.hapus', 'Rombel · Hapus catatan santri', 20],
            ['menu.manage_jabatan', 'action.manage_jabatan.halaman', 'Jabatan · Akses halaman', 5],
            ['menu.manage_jabatan', 'action.manage_jabatan.filter.lembaga_semua', 'Jabatan · Filter semua lembaga', 8],
            ['menu.mapel', 'action.mapel.halaman', 'Mapel · Akses halaman', 5],
            ['menu.mapel', 'action.mapel.filter.lembaga_semua', 'Mapel · Filter semua lembaga', 8],
            ['menu.kurikulum', 'action.kurikulum.halaman', 'Kurikulum · Akses halaman', 5],
            ['menu.kurikulum', 'action.kurikulum.tab.kitab', 'Kurikulum · Tab Kitab', 10],
            ['menu.kurikulum', 'action.kurikulum.tab.mapel', 'Kurikulum · Tab Mapel', 20],
            ['menu.kurikulum', 'action.kurikulum.tab.jadwal', 'Kurikulum · Tab Jadwal', 30],
            ['menu.ujian', 'action.ujian.halaman', 'Ujian · Akses halaman', 5],
        ];
        foreach ($rows as $r) {
            $parentId = $this->parentId($conn, $pidStmt, $r[0]);
            if ($parentId === null) {
                continue;
            }
            $ins->execute([$parentId, $r[1], $r[2], $r[3], 'Lembaga']);
        }
    }

    private function seedPengurus(\PDO $conn, \PDOStatement $pidStmt, \PDOStatement $ins): void
    {
        $parentId = $this->parentId($conn, $pidStmt, 'menu.pengurus');
        if ($parentId === null) {
            return;
        }
        $actions = [
            ['action.pengurus.filter.lembaga_semua', 'Pengurus · Filter semua lembaga', 8],
            ['action.pengurus.role.assign_semua', 'Pengurus · Tugaskan semua role', 9],
            ['action.pengurus.tambah', 'Pengurus · Tambah', 10],
            ['action.pengurus.import', 'Pengurus · Import', 11],
            ['action.pengurus.edit', 'Pengurus · Edit', 12],
            ['action.pengurus.excel', 'Pengurus · Editor spreadsheet', 21],
        ];
        foreach ($actions as $a) {
            $ins->execute([$parentId, $a[0], $a[1], $a[2], 'Lembaga']);
        }
    }

    private function seedAbsen(\PDO $conn, \PDOStatement $pidStmt, \PDOStatement $ins): void
    {
        $parentId = $this->parentId($conn, $pidStmt, 'menu.absen');
        if ($parentId === null) {
            return;
        }
        $actions = [
            ['action.absen.tab.riwayat', 'Absen · Tab Riwayat', 10],
            ['action.absen.riwayat.lembaga_semua', 'Absen · Riwayat · Akses semua lembaga', 12],
            ['action.absen.tab.absen', 'Absen · Tab Absen', 20],
            ['action.absen.tab.pengaturan', 'Absen · Tab Pengaturan', 25],
            ['action.absen.tab.ngabsen', 'Absen · Tab Ngabsen', 30],
            ['action.absen.lokasi.list', 'Absen · Lokasi · Daftar titik', 35],
            ['action.absen.lokasi.absen', 'Absen · Lokasi · Absen mandiri (GPS)', 37],
            ['action.absen.lokasi.tambah', 'Absen · Lokasi · Tambah', 40],
            ['action.absen.lokasi.ubah', 'Absen · Lokasi · Ubah', 50],
            ['action.absen.lokasi.hapus', 'Absen · Lokasi · Hapus', 60],
        ];
        foreach ($actions as $a) {
            $ins->execute([$parentId, $a[0], $a[1], $a[2], 'Lembaga']);
        }
    }

    private function seedLaporanUwaba(\PDO $conn, \PDOStatement $pidStmt, \PDOStatement $ins): void
    {
        $parentId = $this->parentId($conn, $pidStmt, 'menu.laporan');
        if ($parentId === null) {
            return;
        }
        $actions = [
            ['action.laporan.tab.tunggakan', 'Laporan · Tab Tunggakan', 10],
            ['action.laporan.tab.khusus', 'Laporan · Tab Khusus', 20],
            ['action.laporan.tab.uwaba', 'Laporan · Tab UWABA', 30],
            ['action.laporan.tab.pendaftaran', 'Laporan · Tab Pendaftaran', 40],
        ];
        foreach ($actions as $a) {
            $ins->execute([$parentId, $a[0], $a[1], $a[2], 'UWABA']);
        }
    }

    private function seedUgtMadrasahScope(\PDO $conn, \PDOStatement $pidStmt, \PDOStatement $ins): void
    {
        $parentId = $this->parentId($conn, $pidStmt, 'menu.ugt.data_madrasah');
        if ($parentId === null) {
            return;
        }
        $ins->execute([
            $parentId,
            'action.ugt.data_madrasah.scope_all',
            'Data Madrasah · Lihat semua madrasah',
            10,
            'UGT',
        ]);
        $ins->execute([
            $parentId,
            'action.ugt.data_madrasah.pengajuan_edit',
            'Data Madrasah · Pengajuan edit PJGT',
            20,
            'UGT',
        ]);
    }

    private function seedUgtLaporan(\PDO $conn, \PDOStatement $pidStmt, \PDOStatement $ins): void
    {
        $parentId = $this->parentId($conn, $pidStmt, 'menu.ugt.laporan');
        if ($parentId === null) {
            return;
        }
        $actions = [
            ['action.ugt.laporan.tab.koordinator', 'Laporan UGT · Tab Koordinator', 10],
            ['action.ugt.laporan.tab.gt', 'Laporan UGT · Tab GT', 20],
            ['action.ugt.laporan.tab.pjgt', 'Laporan UGT · Tab PJGT', 30],
            ['action.ugt.laporan.filter_koordinator_semua', 'Laporan UGT · Filter semua koordinator', 40],
            ['action.ugt.laporan.tambah.koordinator', 'Laporan UGT · Tambah laporan Koordinator', 50],
            ['action.ugt.laporan.tambah.gt', 'Laporan UGT · Tambah laporan GT', 51],
            ['action.ugt.laporan.tambah.pjgt', 'Laporan UGT · Tambah laporan PJGT', 52],
        ];
        foreach ($actions as $a) {
            $ins->execute([$parentId, $a[0], $a[1], $a[2], 'UGT']);
        }
    }

    /** Detail santri — Riwayat Tugas (madrasah): POST/DELETE API + UI. */
    private function seedUgtGuruTugasTugasan(\PDO $conn, \PDOStatement $pidStmt, \PDOStatement $ins): void
    {
        $parentId = $this->parentId($conn, $pidStmt, 'menu.ugt.guru_tugas');
        if ($parentId === null) {
            return;
        }
        $actions = [
            ['action.ugt.guru_tugas.tugasan_tambah', 'Guru Tugas · Tambah penugasan madrasah', 15],
            ['action.ugt.guru_tugas.tugasan_hapus', 'Guru Tugas · Hapus penugasan madrasah', 16],
        ];
        foreach ($actions as $a) {
            $ins->execute([$parentId, $a[0], $a[1], $a[2], 'UGT']);
        }
    }

    /** KOMMPAS — tab + CRUD per tab (lomba / daftar / nilai / aturan). */
    private function seedUgtKompas(\PDO $conn, \PDOStatement $pidStmt, \PDOStatement $ins): void
    {
        $parentId = $this->parentId($conn, $pidStmt, 'menu.ugt.kompas');
        if ($parentId === null) {
            return;
        }
        $actions = [
            ['action.ugt.kompas.tab.dashboard', 'KOMMPAS · Tab Dashboard', 5],
            ['action.ugt.kompas.tab.lomba', 'KOMMPAS · Tab Lomba', 10],
            ['action.ugt.kompas.lomba.tambah', 'KOMMPAS · Lomba · Tambah', 11],
            ['action.ugt.kompas.lomba.ubah', 'KOMMPAS · Lomba · Ubah', 12],
            ['action.ugt.kompas.lomba.hapus', 'KOMMPAS · Lomba · Hapus', 13],
            ['action.ugt.kompas.tab.daftar', 'KOMMPAS · Tab Daftar', 20],
            ['action.ugt.kompas.daftar.tambah', 'KOMMPAS · Daftar · Tambah', 21],
            ['action.ugt.kompas.daftar.ubah', 'KOMMPAS · Daftar · Ubah', 22],
            ['action.ugt.kompas.daftar.hapus', 'KOMMPAS · Daftar · Hapus', 23],
            ['action.ugt.kompas.tab.nilai', 'KOMMPAS · Tab Nilai', 30],
            ['action.ugt.kompas.nilai.tambah', 'KOMMPAS · Nilai · Tambah', 31],
            ['action.ugt.kompas.nilai.ubah', 'KOMMPAS · Nilai · Ubah', 32],
            ['action.ugt.kompas.nilai.hapus', 'KOMMPAS · Nilai · Hapus', 33],
            ['action.ugt.kompas.tab.aturan', 'KOMMPAS · Tab Aturan Umum', 40],
            ['action.ugt.kompas.aturan.tambah', 'KOMMPAS · Aturan · Tambah', 41],
            ['action.ugt.kompas.aturan.ubah', 'KOMMPAS · Aturan · Ubah', 42],
            ['action.ugt.kompas.aturan.hapus', 'KOMMPAS · Aturan · Hapus', 43],
        ];
        foreach ($actions as $a) {
            $ins->execute([$parentId, $a[0], $a[1], $a[2], 'UGT']);
        }
    }

    private function seedSuperAdminInstallActivity(\PDO $conn, \PDOStatement $pidStmt, \PDOStatement $ins): void
    {
        $groups = [
            [
                'parent_code' => 'menu.super_admin.online',
                'group_label' => 'Super Admin',
                'rows' => [
                    ['action.super_admin.online.halaman', 'Online · Akses halaman monitor online', 10],
                    ['action.super_admin.online.live_ebeddien', 'Online · Lihat live monitor eBeddien', 20],
                    ['action.super_admin.online.realtime_lintas_app', 'Online · Lihat realtime lintas aplikasi', 30],
                ],
            ],
            [
                'parent_code' => 'menu.super_admin.dashboard',
                'group_label' => 'Super Admin',
                'rows' => [
                    ['action.super_admin.dashboard.halaman', 'Dashboard · Akses halaman analytics', 10],
                    ['action.super_admin.dashboard.kpi', 'Dashboard · KPI install activity', 20],
                    ['action.super_admin.dashboard.breakdown', 'Dashboard · Breakdown app/mode/browser', 30],
                    ['action.super_admin.dashboard.retention_funnel', 'Dashboard · Retention dan funnel', 40],
                ],
            ],
            [
                'parent_code' => 'menu.super_admin.install_activity',
                'group_label' => 'Super Admin',
                'rows' => [
                    ['action.super_admin.install_activity.halaman', 'Install Activity · Akses halaman list', 10],
                    ['action.super_admin.install_activity.filter', 'Install Activity · Filter data', 20],
                    ['action.super_admin.install_activity.export_csv', 'Install Activity · Export CSV', 30],
                    ['action.super_admin.install_activity.realtime_feed', 'Install Activity · Realtime feed', 40],
                ],
            ],
        ];

        foreach ($groups as $g) {
            $parentId = $this->parentId($conn, $pidStmt, $g['parent_code']);
            if ($parentId === null) {
                continue;
            }
            foreach ($g['rows'] as $r) {
                $ins->execute([$parentId, $r[0], $r[1], $r[2], $g['group_label']]);
            }
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
