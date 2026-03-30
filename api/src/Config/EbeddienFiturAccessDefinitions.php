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
            'menu.super_admin.dashboard',
            'menu.dashboard_umum',
            'menu.manage_users',
            'menu.manage_users.import',
            'menu.settings.tahun_ajaran',
            'menu.settings.role_akses',
            'menu.settings.fitur',
            'menu.settings.notifikasi',
            'menu.settings.watzap',
            'menu.settings.wa_interactive_menu',
            'menu.manage_uploads',
            'menu.whatsapp_koneksi',
            'menu.juara.data_juara',
            'menu.kalender_pesantren',
            'menu.kalender_pesantren.kelola_event',
            'menu.kalender_pesantren.pengaturan',
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
            'menu.pendaftaran.padukan_data',
            'menu.pendaftaran.pengaturan',
            'menu.pendaftaran.item',
            'PREFIX:action.pendaftaran.',
        ];
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
            'menu.domisili.daerah',
            'menu.domisili.kamar',
        ];
    }

    public static function ugtMenus(): array
    {
        return [
            'menu.ugt.data_madrasah',
            'menu.ugt.laporan',
            'menu.koordinator',
            'PREFIX:action.ugt.',
        ];
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
            self::superAdminMenus()
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

    public static function kalenderGoogleStaffSelectors(): array
    {
        return [
            'menu.kalender.pengaturan',
            'menu.converter',
            'menu.kalender_pesantren',
            'menu.kalender_pesantren.kelola_event',
            'menu.kalender_pesantren.pengaturan',
        ];
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
}
