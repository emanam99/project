<?php

declare(strict_types=1);

namespace App\Config;

/**
 * Kunci grup fallback middleware — nilai string sama dengan baris ebeddien_legacy_route_role.legacy_key
 * (selaras nama method EbeddienFiturAccess, kecuali PSB_TARBIYAH_SUPER_SELECTORS_SANTRI).
 */
final class LegacyRouteRoleKeys
{
    public const FINANCE_MENUS = 'financeMenus';

    public const SUPER_ADMIN_MENUS = 'superAdminMenus';

    public const UGT_MENUS = 'ugtMenus';

    public const TARBIYAH_SUPER_SELECTORS = 'tarbiyahSuperSelectors';

    public const PSB_STAFF_SUPER_SELECTORS = 'psbStaffSuperSelectors';

    public const PSB_ADMIN_SUPER_SELECTORS = 'psbAdminSuperSelectors';

    /** Protected API: staff + tarbiyah (tanpa santri di legacy). */
    public const PSB_TARBIYAH_SUPER_SELECTORS = 'psbTarbiyahSuperSelectors';

    /** Santri berkas: termasuk santri di legacy. */
    public const PSB_TARBIYAH_SUPER_SELECTORS_SANTRI = 'psbTarbiyahSuperSelectorsSantri';

    public const DASHBOARD_LAPORAN_IJIN_SELECTORS = 'dashboardLaporanIjinSelectors';

    public const DASHBOARD_LAPORAN_PSB_SELECTORS = 'dashboardLaporanPsbSelectors';

    public const CASHLESS_ADMIN_SELECTORS = 'cashlessAdminSelectors';

    public const KALENDER_PENGATURAN_BULAN_SELECTORS = 'kalenderPengaturanBulanSelectors';

    public const KALENDER_PENGATURAN_HARI_PENTING_SELECTORS = 'kalenderPengaturanHariPentingSelectors';

    public const UMROH_MODULE_SELECTORS = 'umrohModuleSelectors';

    public const UWABA_STAFF_SUPER_SELECTORS = 'uwabaStaffSuperSelectors';

    public const AKTIVITAS_PEMASUKAN_ADMIN_SELECTORS = 'aktivitasPemasukanAdminSelectors';

    public const USER_LIST_UWABA_NOTIFY_SELECTORS = 'userListUwabaNotifySelectors';

    public const UWABA_STAFF_SELECTORS = 'uwabaStaffSelectors';

    public const PROFIL_SALDO_KEUANGAN_SELECTORS = 'profilSaldoKeuanganSelectors';

    public const WA_SEND_SELECTORS = 'waSendSelectors';

    public const WA_PROCESS_PENDING_SELECTORS = 'waProcessPendingSelectors';

    public const CHAT_STAFF_SELECTORS = 'chatStaffSelectors';

    public const IJIN_STAFF_SELECTORS = 'ijinStaffSelectors';

    public const IJIN_BOYONG_SELECTORS = 'ijinBoyongSelectors';

    public const MANAGE_USERS_V2_SELECTORS = 'manageUsersV2Selectors';

    public const MANAGE_USERS_LEGACY_SELECTORS = 'manageUsersLegacySelectors';

    public const LEMBAGA_GET_SELECTORS = 'lembagaGetSelectors';

    public const LEMBAGA_WRITE_SELECTORS = 'lembagaWriteSelectors';

    public const ALAMAT_LIST_SELECTORS = 'alamatListSelectors';

    public const PENGURUS_LIST_SELECTORS = 'pengurusListSelectors';

    public const WIRID_NAILUL_MUROD_SELECTORS = 'wiridNailulMurodSelectors';
}
