<?php

declare(strict_types=1);

namespace App\Config;

/**
 * Definisi selector middleware — fallback jika tabel ebeddien_fitur_selector kosong / key belum di-seed.
 * Setelah seed berjalan, EbeddienFiturSelectorRepository membaca dari DB (satu sumber operasional).
 */
final class EbeddienFiturAccessDefinitions
{
    /** @param list<list<string>> $lists */
    public static function merge(array ...$lists): array
    {
        $out = [];
        foreach ($lists as $list) {
            foreach ($list as $c) {
                if ($c !== '') {
                    $out[$c] = true;
                }
            }
        }

        return array_keys($out);
    }

    public static function superAdminMenus(): array
    {
        return [
            'menu.super_admin.online',
            'menu.super_admin.dashboard',
            'menu.super_admin.user_aktivitas',
            'menu.dashboard_umum',
            'menu.manage_users',
            'menu.settings.tahun_ajaran',
            'menu.settings.role_akses',
            'menu.settings.fitur',
            'menu.settings.notifikasi',
            'menu.settings.email_otp',
            'menu.settings.payment_gateway',
            'menu.settings.whatsapp',
            'menu.settings.watzap',
            'menu.settings.evolution_wa',
            'menu.settings.wa_interactive_menu',
            'menu.manage_uploads',
            'menu.whatsapp_koneksi',
            'menu.juara.data_juara',
        ];
    }

    public static function uwabaStaffMenus(): array
    {
        return [
            'menu.uwaba',
            'menu.tunggakan',
            'menu.khusus',
            'menu.dashboard_pembayaran',
            'menu.pembayaran.manage_data',
            'menu.laporan',
            'PREFIX:menu.pembayaran.',
        ];
    }

    public static function financeMenus(): array
    {
        return [
            'menu.pengeluaran',
            'menu.dashboard_keuangan',
            'menu.pemasukan',
            'menu.aktivitas',
            'menu.aktivitas_tahun_ajaran',
            'PREFIX:action.pengeluaran.',
        ];
    }

    public static function psbMenus(): array
    {
        return [
            'menu.dashboard_pendaftaran',
            'menu.pendaftaran',
            'menu.pendaftaran.data_pendaftar',
            'menu.pendaftaran.tes_masuk',
            'menu.pendaftaran.analisis',
            'menu.pendaftaran.pengajuan_nis',
            'menu.pendaftaran.padukan_data',
            'menu.pendaftaran.pengaturan',
            'menu.pendaftaran.item',
            'PREFIX:action.pendaftaran.',
        ];
    }

    /** Menu & aksi halaman Tes Masuk (panitia tes). */
    public static function psbTesMasukMenus(): array
    {
        return [
            'menu.pendaftaran.tes_masuk',
            'PREFIX:action.pendaftaran.tes_masuk.',
        ];
    }

    /** API panitia tes: daftar pendaftar, tes madin, aktif diniyah, opsi rombel. */
    public static function psbPanitiaTesApiSelectors(): array
    {
        return self::merge(
            self::psbTesMasukMenus(),
            ['action.pendaftaran.data_pendaftar.aktif_diniyah'],
        );
    }

    public static function tarbiyahLembagaMenus(): array
    {
        return [
            'menu.pengurus',
            'menu.lembaga',
            'menu.absen',
            'menu.santri',
            'menu.lulusan',
            'menu.rombel',
            'menu.manage_jabatan',
            'menu.kitab',
            'menu.mapel',
            'menu.kurikulum',
            'menu.ujian',
            'menu.bisyaroh',
            'menu.domisili.daerah',
            'menu.domisili.kamar',
            'menu.domisili.status',
            'menu.domisili.pelanggaran',
        ];
    }

    /** GET/POST/PUT/PATCH /api/tarbiyah/pelanggaran-admin — master jenis pelanggaran. */
    public static function domisiliPelanggaranAdminApiSelectors(): array
    {
        return self::merge(
            self::tarbiyahSuperSelectors(),
            ['menu.domisili.pelanggaran'],
            ['PREFIX:action.domisili.pelanggaran.']
        );
    }

    /** GET/POST /api/bisyaroh — modul Bisyaroh (menu + semua aksi tab). */
    public static function bisyarohApiSelectors(): array
    {
        return self::merge(
            self::superAdminMenus(),
            ['menu.bisyaroh'],
            ['PREFIX:action.bisyaroh.']
        );
    }

    /** GET/POST/PUT/DELETE /api/website — modul admin Website (menu + aksi). */
    public static function websiteAdminApiSelectors(): array
    {
        return self::merge(
            self::superAdminMenus(),
            ['PREFIX:menu.website.'],
            ['PREFIX:action.website.']
        );
    }

    public static function lttqMenus(): array
    {
        return [
            'menu.lttq.santri',
            'menu.lttq.tingkatan',
        ];
    }

    /** /api/lttq-tingkatan, /api/lttq-mualim, santri by LTTQ */
    public static function lttqStaffApiSelectors(): array
    {
        return self::merge(
            self::superAdminMenus(),
            self::lttqMenus(),
            ['PREFIX:action.lttq.']
        );
    }

    public static function ugtMenus(): array
    {
        return [
            'menu.ugt.data_madrasah',
            'menu.ugt.guru_tugas',
            'menu.ugt.laporan',
            'menu.ugt.kompas',
            'menu.koordinator',
            'PREFIX:action.ugt.',
        ];
    }

    /** GET/POST/DELETE /api/ugt/guru-tugas-tugasan — penugasan GT ke madrasah (UGT + super admin). */
    public static function ugtGuruTugasTugasanApiSelectors(): array
    {
        return self::merge(self::ugtMenus(), self::superAdminMenus());
    }

    public static function ijinMenus(): array
    {
        return [
            'menu.dashboard_ijin',
            'menu.ijin.data_ijin',
            'menu.ijin.data_boyong',
        ];
    }

    public static function ijinStaffSelectors(): array
    {
        return self::merge(self::ijinMenus(), self::superAdminMenus());
    }

    public static function cashlessMenus(): array
    {
        return [
            'PREFIX:menu.cashless.',
        ];
    }

    public static function umrohMenus(): array
    {
        return [
            'menu.dashboard_umroh',
            'menu.umroh.jamaah',
            'menu.umroh.tabungan',
            'menu.laporan_umroh',
        ];
    }

    public static function kalenderStaffMenus(): array
    {
        return [
            'menu.kalender',
            'menu.kalender.hari_penting',
            'menu.kalender.pengaturan',
            'menu.converter',
        ];
    }

    public static function lembagaGetSelectors(): array
    {
        return self::merge(
            self::tarbiyahLembagaMenus(),
            self::uwabaStaffMenus(),
            self::financeMenus(),
            self::superAdminMenus(),
            ['menu.ugt.guru_tugas']
        );
    }

    public static function lembagaWriteSelectors(): array
    {
        return self::merge(self::tarbiyahLembagaMenus(), self::superAdminMenus());
    }

    public static function manageUsersV2Selectors(): array
    {
        return self::merge(
            ['menu.manage_users'],
            self::cashlessMenus(),
            self::superAdminMenus()
        );
    }

    /** GET /api/v2/users/{id}/detail-readonly — detail akun mode baca dari berbagai halaman. */
    public static function userDetailReadonlySelectors(): array
    {
        return self::merge(
            self::manageUsersV2Selectors(),
            self::manageUsersLegacySelectors(),
            self::pengurusListSelectors(),
            self::santriCrudApiSelectors(),
            self::ugtMenus()
        );
    }

    public static function manageUsersLegacySelectors(): array
    {
        return self::merge(
            self::superAdminMenus(),
            self::ugtMenus(),
            self::tarbiyahLembagaMenus()
        );
    }

    public static function chatStaffSelectors(): array
    {
        return self::merge(self::uwabaStaffMenus(), self::psbMenus(), self::superAdminMenus());
    }

    public static function waSendSelectors(): array
    {
        return self::merge(self::superAdminMenus(), self::psbMenus(), self::uwabaStaffMenus());
    }

    public static function waProcessPendingSelectors(): array
    {
        return self::merge(self::superAdminMenus(), self::psbMenus());
    }

    public static function tarbiyahSuperSelectors(): array
    {
        return self::merge(self::tarbiyahLembagaMenus(), self::superAdminMenus());
    }

    /** GET/POST /api/santri (tulis) — tanpa menu ijin (cari santri ijin pakai santriListApiSelectors). */
    public static function santriCrudApiSelectors(): array
    {
        return self::merge(
            self::psbMenus(),
            self::tarbiyahLembagaMenus(),
            self::superAdminMenus(),
            ['action.santri.halaman', 'action.rombel.halaman', 'menu.ugt.guru_tugas']
        );
    }

    /**
     * GET /api/santri (daftar / by id / since) — termasuk petugas/admin ijin
     * agar SearchOffcanvas Data Ijin bisa sync indeks santri.
     */
    public static function santriListApiSelectors(): array
    {
        return self::merge(
            self::santriCrudApiSelectors(),
            self::ijinMenus()
        );
    }

    /** GET /api/santri/by-kelas, riwayat-rombel, riwayat-kamar */
    public static function santriByKelasApiSelectors(): array
    {
        return self::santriCrudApiSelectors();
    }

    /** DELETE /api/santri/riwayat-rombel/{id} */
    public static function santriRiwayatRombelDeleteApiSelectors(): array
    {
        return self::merge(
            self::santriByKelasApiSelectors(),
            ['action.santri.riwayat_rombel.hapus']
        );
    }

    /** GET/POST /api/santri/excel-* */
    public static function santriExcelApiSelectors(): array
    {
        return self::merge(
            self::superAdminMenus(),
            ['action.santri.excel']
        );
    }

    /** POST /api/pengurus/excel-bulk-update */
    public static function pengurusExcelApiSelectors(): array
    {
        return self::merge(
            self::superAdminMenus(),
            ['action.pengurus.excel']
        );
    }

    /** /api/rombel, /api/wali-kelas, /api/santri-lulusan (konteks rombel) */
    public static function rombelWaliKelasApiSelectors(): array
    {
        return self::merge(
            self::psbMenus(),
            self::tarbiyahLembagaMenus(),
            self::superAdminMenus(),
            [
                'action.rombel.halaman',
                'action.mapel.halaman',
                'action.rombel.filter.semua_rombel_lembaga',
                'action.rombel.rombel_bertugas',
            ]
        );
    }

    /** /api/jabatan */
    public static function jabatanCrudApiSelectors(): array
    {
        return self::merge(
            self::psbMenus(),
            self::tarbiyahLembagaMenus(),
            self::superAdminMenus(),
            ['action.manage_jabatan.halaman']
        );
    }

    /** /api/mapel */
    public static function mapelCrudApiSelectors(): array
    {
        return self::merge(
            self::psbMenus(),
            self::tarbiyahLembagaMenus(),
            self::superAdminMenus(),
            ['action.mapel.halaman'],
            ['PREFIX:action.kurikulum.']
        );
    }

    /** /api/kurikulum-jadwal */
    public static function kurikulumJadwalCrudApiSelectors(): array
    {
        return self::merge(
            self::psbMenus(),
            self::tarbiyahLembagaMenus(),
            self::superAdminMenus(),
            ['menu.kurikulum'],
            ['PREFIX:action.kurikulum.']
        );
    }

    /** /api/ujian — jadwal & nilai per mapel (lembaga___kitab) */
    public static function ujianCrudApiSelectors(): array
    {
        return self::merge(
            self::psbMenus(),
            self::tarbiyahLembagaMenus(),
            self::superAdminMenus(),
            ['action.ujian.halaman']
        );
    }

    /** /api/kitab — dipakai halaman Mapel (master kitab) */
    public static function kitabCrudApiSelectors(): array
    {
        return self::merge(
            self::psbMenus(),
            self::tarbiyahLembagaMenus(),
            self::superAdminMenus(),
            ['action.mapel.halaman'],
            ['PREFIX:action.kurikulum.']
        );
    }

    /** /api/tarbiyah/santri (catatan domisili dari konteks Rombel, dll.) */
    public static function tarbiyahSantriDomisiliApiSelectors(): array
    {
        return self::merge(
            self::tarbiyahSuperSelectors(),
            ['action.rombel.halaman', 'action.santri.halaman']
        );
    }

    /**
     * GET /api/absen-pengurus (+ rekap): tab Riwayat atau legacy menu.absen tanpa aksi granular.
     */
    public static function absenPengurusApiSelectors(): array
    {
        return self::merge(
            self::superAdminMenus(),
            ['menu.absen', 'action.absen.tab.riwayat']
        );
    }

    /** GET/POST/PUT/DELETE /api/absen-lokasi dan /api/absen-alamat (master alamat titik) */
    public static function absenLokasiCrudApiSelectors(): array
    {
        return self::merge(
            self::superAdminMenus(),
            [
                'menu.absen',
                'action.absen.lokasi.list',
                'action.absen.lokasi.absen',
                'action.absen.lokasi.tambah',
                'action.absen.lokasi.ubah',
                'action.absen.lokasi.hapus',
                'action.absen.tab.pengaturan',
            ]
        );
    }

    /** GET/PUT /api/absen-setting — pengaturan global absen (jadwal default, sidik jari) */
    public static function absenSettingApiSelectors(): array
    {
        return self::absenLokasiCrudApiSelectors();
    }

    /** POST /api/absen-pengurus/lokasi */
    public static function absenPengurusLokasiPostSelectors(): array
    {
        return self::merge(
            self::superAdminMenus(),
            ['menu.absen', 'action.absen.lokasi.absen'],
            ['menu.absen', 'action.absen.tab.absen'],
            ['menu.absen', 'action.absen.tab.ngabsen']
        );
    }

    /** GET /api/geocode/reverse — alamat administratif dari koordinat (tab Absen) */
    public static function absenGeocodeReverseSelectors(): array
    {
        return self::merge(
            self::superAdminMenus(),
            ['menu.absen', 'action.absen.tab.absen'],
            ['menu.absen', 'action.absen.tab.ngabsen'],
            ['menu.absen', 'action.absen.tab.pengaturan'],
            ['menu.absen', 'action.absen.lokasi.absen'],
            ['menu.absen', 'action.absen.lokasi.list']
        );
    }

    public static function alamatListSelectors(): array
    {
        return self::merge(self::ugtMenus(), self::tarbiyahLembagaMenus(), self::superAdminMenus());
    }

    public static function pengurusListSelectors(): array
    {
        return self::merge(self::ugtMenus(), self::uwabaStaffMenus(), self::tarbiyahLembagaMenus(), self::superAdminMenus());
    }

    public static function ijinBoyongSelectors(): array
    {
        return self::merge(['menu.ijin.data_boyong'], self::superAdminMenus());
    }

    public static function psbTarbiyahSuperSelectors(): array
    {
        return self::merge(self::psbMenus(), self::tarbiyahLembagaMenus(), self::superAdminMenus());
    }

    public static function psbAdminSuperSelectors(): array
    {
        return self::merge(self::psbMenus(), self::superAdminMenus());
    }

    public static function psbStaffSuperSelectors(): array
    {
        return self::psbAdminSuperSelectors();
    }

    /**
     * GET opsi kategori/daerah/kamar untuk filter halaman Santri — PSB staff atau aksi halaman Santri.
     */
    public static function pendaftaranSantriFilterOptionsSelectors(): array
    {
        return self::merge(
            self::psbStaffSuperSelectors(),
            ['action.santri.halaman', 'menu.ugt.guru_tugas']
        );
    }

    /**
     * Opsi tingkatan LTTQ untuk form biodata santri (UWABA, PSB, halaman Santri) — bukan scope modul LTTQ.
     */
    public static function santriBiodataLttqOptionsSelectors(): array
    {
        return self::merge(
            self::uwabaStaffSuperSelectors(),
            self::psbStaffSuperSelectors(),
            self::psbPanitiaTesApiSelectors(),
            ['action.santri.halaman', 'action.rombel.halaman', 'menu.ugt.guru_tugas']
        );
    }

    public static function dashboardLaporanIjinSelectors(): array
    {
        return self::merge(self::ijinMenus(), self::uwabaStaffMenus(), self::superAdminMenus());
    }

    public static function dashboardLaporanPsbSelectors(): array
    {
        return self::merge(self::uwabaStaffMenus(), self::psbMenus(), self::superAdminMenus());
    }

    public static function cashlessAdminSelectors(): array
    {
        return self::merge(self::cashlessMenus(), self::superAdminMenus());
    }

    public static function umrohModuleSelectors(): array
    {
        return self::merge(self::umrohMenus(), self::uwabaStaffMenus(), self::superAdminMenus());
    }

    public static function uwabaStaffSuperSelectors(): array
    {
        return self::merge(self::uwabaStaffMenus(), self::superAdminMenus());
    }

    public static function profilSaldoKeuanganSelectors(): array
    {
        return self::merge(self::uwabaStaffSuperSelectors(), self::financeMenus());
    }

    public static function userListUwabaNotifySelectors(): array
    {
        return self::merge(self::uwabaStaffSuperSelectors(), self::financeMenus());
    }

    public static function aktivitasPemasukanAdminSelectors(): array
    {
        return self::merge(
            self::superAdminMenus(),
            [
                'menu.aktivitas',
                'menu.aktivitas_tahun_ajaran',
                'menu.pemasukan',
                'menu.dashboard_keuangan',
            ]
        );
    }

    /** POST /api/kalender (bulk bulan) — terpisah dari tab hari penting. */
    public static function kalenderPengaturanBulanSelectors(): array
    {
        return self::merge(
            ['action.kalender.pengaturan.tab_bulan'],
            ['menu.kalender.pengaturan']
        );
    }

    /** Grup /api/hari-penting (picker, simpan, hapus). */
    public static function kalenderPengaturanHariPentingSelectors(): array
    {
        return self::merge(
            ['action.kalender.pengaturan.tab_hari_penting'],
            ['menu.kalender.pengaturan']
        );
    }

    /** Grup PUT /api/kalender/istiwa-lokasi. */
    public static function kalenderPengaturanIstiwaSelectors(): array
    {
        return self::merge(
            self::tarbiyahSuperSelectors(),
            ['action.kalender.pengaturan.tab_istiwa'],
            ['menu.kalender.pengaturan']
        );
    }

    /** Menu grup Wirid — Nailul Murod */
    public static function wiridMenus(): array
    {
        return [
            'menu.wirid.nailul_murod',
        ];
    }

    /** Dashboard monitoring install/aktivitas aplikasi. */
    public static function installActivitySelectors(): array
    {
        return self::merge(
            self::superAdminMenus(),
            ['menu.super_admin.install_activity']
        );
    }

    /**
     * GET/POST/PUT/DELETE /api/wirid-nailul-murod.
     * Admin yang mengelola konten: admin_wirid + super_admin.
     */
    public static function wiridNailulMurodApiSelectors(): array
    {
        return self::merge(
            self::wiridMenus(),
            self::superAdminMenus()
        );
    }

    /** /api/alumni/staff — Data Alumni eBeddien */
    public static function alumniStaffApiSelectors(): array
    {
        return self::merge(
            self::superAdminMenus(),
            self::psbMenus(),
            [
                'menu.alumni',
                'PREFIX:action.alumni.',
            ]
        );
    }
}
