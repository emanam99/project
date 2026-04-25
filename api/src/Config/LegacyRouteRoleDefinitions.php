<?php

declare(strict_types=1);

namespace App\Config;

/**
 * Fallback bila tabel ebeddien_legacy_route_role kosong / baris belum ada (deploy tanpa migrate).
 * Isi identik seed migrasi 20260405200000_ebeddien_legacy_route_role.
 */
final class LegacyRouteRoleDefinitions
{
    /**
     * @return array<string, list<string>>
     */
    public static function allGroups(): array
    {
        return [
            LegacyRouteRoleKeys::FINANCE_MENUS => ['admin_uwaba', 'admin_lembaga', 'petugas_keuangan', 'super_admin'],
            LegacyRouteRoleKeys::SUPER_ADMIN_MENUS => ['super_admin'],
            LegacyRouteRoleKeys::UGT_MENUS => ['admin_ugt', 'koordinator_ugt', 'super_admin'],
            LegacyRouteRoleKeys::TARBIYAH_SUPER_SELECTORS => ['super_admin', 'tarbiyah', 'admin_daerah', 'admin_domisili', 'kapdar', 'wakapdar'],
            LegacyRouteRoleKeys::KALENDER_GOOGLE_STAFF_SELECTORS => ['admin_kalender', 'super_admin'],
            LegacyRouteRoleKeys::PSB_STAFF_SUPER_SELECTORS => ['admin_psb', 'petugas_psb', 'super_admin', 'santri'],
            LegacyRouteRoleKeys::PSB_ADMIN_SUPER_SELECTORS => ['admin_psb', 'super_admin'],
            LegacyRouteRoleKeys::PSB_TARBIYAH_SUPER_SELECTORS => ['admin_psb', 'petugas_psb', 'super_admin', 'tarbiyah'],
            LegacyRouteRoleKeys::PSB_TARBIYAH_SUPER_SELECTORS_SANTRI => ['admin_psb', 'petugas_psb', 'super_admin', 'santri', 'tarbiyah'],
            LegacyRouteRoleKeys::DASHBOARD_LAPORAN_IJIN_SELECTORS => ['admin_uwaba', 'petugas_uwaba', 'admin_ijin', 'petugas_ijin', 'super_admin'],
            LegacyRouteRoleKeys::DASHBOARD_LAPORAN_PSB_SELECTORS => ['admin_uwaba', 'petugas_uwaba', 'admin_psb', 'petugas_psb', 'super_admin'],
            LegacyRouteRoleKeys::CASHLESS_ADMIN_SELECTORS => ['admin_cashless', 'super_admin'],
            LegacyRouteRoleKeys::KALENDER_PENGATURAN_BULAN_SELECTORS => ['admin_kalender', 'super_admin'],
            LegacyRouteRoleKeys::KALENDER_PENGATURAN_HARI_PENTING_SELECTORS => ['admin_kalender', 'super_admin'],
            LegacyRouteRoleKeys::UMROH_MODULE_SELECTORS => ['admin_uwaba', 'petugas_uwaba', 'admin_umroh', 'petugas_umroh', 'super_admin'],
            LegacyRouteRoleKeys::UWABA_STAFF_SUPER_SELECTORS => ['petugas_uwaba', 'admin_uwaba', 'super_admin'],
            LegacyRouteRoleKeys::AKTIVITAS_PEMASUKAN_ADMIN_SELECTORS => ['admin_uwaba', 'petugas_keuangan', 'super_admin'],
            LegacyRouteRoleKeys::USER_LIST_UWABA_NOTIFY_SELECTORS => ['admin_uwaba', 'admin_lembaga', 'petugas_keuangan', 'super_admin'],
            LegacyRouteRoleKeys::UWABA_STAFF_SELECTORS => ['petugas_uwaba', 'admin_uwaba', 'super_admin'],
            LegacyRouteRoleKeys::PROFIL_SALDO_KEUANGAN_SELECTORS => ['admin_uwaba', 'petugas_uwaba', 'admin_lembaga', 'petugas_keuangan', 'super_admin'],
            LegacyRouteRoleKeys::WA_SEND_SELECTORS => ['super_admin', 'admin_psb', 'petugas_psb', 'admin_uwaba', 'petugas_uwaba'],
            LegacyRouteRoleKeys::WA_PROCESS_PENDING_SELECTORS => ['super_admin', 'admin_psb', 'petugas_psb'],
            LegacyRouteRoleKeys::CHAT_STAFF_SELECTORS => ['admin_uwaba', 'petugas_uwaba', 'admin_psb', 'petugas_psb', 'super_admin'],
            LegacyRouteRoleKeys::IJIN_STAFF_SELECTORS => ['admin_ijin', 'petugas_ijin', 'super_admin'],
            LegacyRouteRoleKeys::IJIN_BOYONG_SELECTORS => ['admin_ijin', 'super_admin'],
            LegacyRouteRoleKeys::MANAGE_USERS_V2_SELECTORS => ['super_admin', 'admin_cashless'],
            LegacyRouteRoleKeys::MANAGE_USERS_LEGACY_SELECTORS => ['super_admin', 'admin_ugt', 'tarbiyah'],
            LegacyRouteRoleKeys::LEMBAGA_GET_SELECTORS => ['super_admin', 'admin_uwaba', 'admin_lembaga', 'tarbiyah', 'admin_daerah', 'admin_domisili', 'kapdar', 'wakapdar'],
            LegacyRouteRoleKeys::LEMBAGA_WRITE_SELECTORS => ['super_admin', 'tarbiyah'],
            LegacyRouteRoleKeys::ALAMAT_LIST_SELECTORS => ['admin_ugt', 'super_admin', 'tarbiyah', 'admin_daerah', 'admin_domisili', 'kapdar', 'wakapdar'],
            LegacyRouteRoleKeys::PENGURUS_LIST_SELECTORS => ['admin_ugt', 'super_admin', 'admin_uwaba', 'tarbiyah', 'admin_daerah', 'admin_domisili', 'kapdar', 'wakapdar'],
            LegacyRouteRoleKeys::WIRID_NAILUL_MUROD_SELECTORS => ['admin_wirid', 'super_admin'],
        ];
    }

    /**
     * @return list<string>
     */
    public static function rolesForKey(string $legacyKey): array
    {
        $all = self::allGroups();

        return $all[$legacyKey] ?? [];
    }
}
