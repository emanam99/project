<?php

declare(strict_types=1);

namespace App\Config;

/**
 * Kode menu/aksi eBeddien untuk EbeddienFiturMiddleware.
 * Sumber utama: tabel ebeddien_fitur_selector (seed EbeddienFiturSelectorSeed); fallback: EbeddienFiturAccessDefinitions.
 */
final class EbeddienFiturAccess
{
    /** @param list<list<string>> $lists */
    public static function merge(array ...$lists): array
    {
        return EbeddienFiturAccessDefinitions::merge(...$lists);
    }

    public static function superAdminMenus(): array
    {
        return EbeddienFiturSelectorRepository::codesForMethod('superAdminMenus');
    }

    public static function uwabaStaffMenus(): array
    {
        return EbeddienFiturSelectorRepository::codesForMethod('uwabaStaffMenus');
    }

    public static function financeMenus(): array
    {
        return EbeddienFiturSelectorRepository::codesForMethod('financeMenus');
    }

    public static function psbMenus(): array
    {
        return EbeddienFiturSelectorRepository::codesForMethod('psbMenus');
    }

    public static function tarbiyahLembagaMenus(): array
    {
        return EbeddienFiturSelectorRepository::codesForMethod('tarbiyahLembagaMenus');
    }

    public static function ugtMenus(): array
    {
        return EbeddienFiturSelectorRepository::codesForMethod('ugtMenus');
    }

    public static function ijinMenus(): array
    {
        return EbeddienFiturSelectorRepository::codesForMethod('ijinMenus');
    }

    public static function ijinStaffSelectors(): array
    {
        return EbeddienFiturSelectorRepository::codesForMethod('ijinStaffSelectors');
    }

    public static function cashlessMenus(): array
    {
        return EbeddienFiturSelectorRepository::codesForMethod('cashlessMenus');
    }

    public static function umrohMenus(): array
    {
        return EbeddienFiturSelectorRepository::codesForMethod('umrohMenus');
    }

    public static function kalenderStaffMenus(): array
    {
        return EbeddienFiturSelectorRepository::codesForMethod('kalenderStaffMenus');
    }

    public static function lembagaGetSelectors(): array
    {
        return EbeddienFiturSelectorRepository::codesForMethod('lembagaGetSelectors');
    }

    public static function lembagaWriteSelectors(): array
    {
        return EbeddienFiturSelectorRepository::codesForMethod('lembagaWriteSelectors');
    }

    public static function manageUsersV2Selectors(): array
    {
        return EbeddienFiturSelectorRepository::codesForMethod('manageUsersV2Selectors');
    }

    public static function manageUsersLegacySelectors(): array
    {
        return EbeddienFiturSelectorRepository::codesForMethod('manageUsersLegacySelectors');
    }

    public static function chatStaffSelectors(): array
    {
        return EbeddienFiturSelectorRepository::codesForMethod('chatStaffSelectors');
    }

    public static function waSendSelectors(): array
    {
        return EbeddienFiturSelectorRepository::codesForMethod('waSendSelectors');
    }

    public static function waProcessPendingSelectors(): array
    {
        return EbeddienFiturSelectorRepository::codesForMethod('waProcessPendingSelectors');
    }

    public static function tarbiyahSuperSelectors(): array
    {
        return EbeddienFiturSelectorRepository::codesForMethod('tarbiyahSuperSelectors');
    }

    public static function santriCrudApiSelectors(): array
    {
        return EbeddienFiturSelectorRepository::codesForMethod('santriCrudApiSelectors');
    }

    public static function santriByKelasApiSelectors(): array
    {
        return EbeddienFiturSelectorRepository::codesForMethod('santriByKelasApiSelectors');
    }

    public static function santriExcelApiSelectors(): array
    {
        return EbeddienFiturSelectorRepository::codesForMethod('santriExcelApiSelectors');
    }

    public static function rombelWaliKelasApiSelectors(): array
    {
        return EbeddienFiturSelectorRepository::codesForMethod('rombelWaliKelasApiSelectors');
    }

    public static function jabatanCrudApiSelectors(): array
    {
        return EbeddienFiturSelectorRepository::codesForMethod('jabatanCrudApiSelectors');
    }

    public static function mapelCrudApiSelectors(): array
    {
        return EbeddienFiturSelectorRepository::codesForMethod('mapelCrudApiSelectors');
    }

    public static function kitabCrudApiSelectors(): array
    {
        return EbeddienFiturSelectorRepository::codesForMethod('kitabCrudApiSelectors');
    }

    public static function tarbiyahSantriDomisiliApiSelectors(): array
    {
        return EbeddienFiturSelectorRepository::codesForMethod('tarbiyahSantriDomisiliApiSelectors');
    }

    public static function absenPengurusApiSelectors(): array
    {
        return EbeddienFiturSelectorRepository::codesForMethod('absenPengurusApiSelectors');
    }

    public static function absenLokasiCrudApiSelectors(): array
    {
        return EbeddienFiturSelectorRepository::codesForMethod('absenLokasiCrudApiSelectors');
    }

    public static function absenSettingApiSelectors(): array
    {
        return EbeddienFiturSelectorRepository::codesForMethod('absenSettingApiSelectors');
    }

    public static function absenPengurusLokasiPostSelectors(): array
    {
        return EbeddienFiturSelectorRepository::codesForMethod('absenPengurusLokasiPostSelectors');
    }

    public static function absenGeocodeReverseSelectors(): array
    {
        return EbeddienFiturSelectorRepository::codesForMethod('absenGeocodeReverseSelectors');
    }

    public static function alamatListSelectors(): array
    {
        return EbeddienFiturSelectorRepository::codesForMethod('alamatListSelectors');
    }

    public static function pengurusListSelectors(): array
    {
        return EbeddienFiturSelectorRepository::codesForMethod('pengurusListSelectors');
    }

    public static function ijinBoyongSelectors(): array
    {
        return EbeddienFiturSelectorRepository::codesForMethod('ijinBoyongSelectors');
    }

    public static function psbTarbiyahSuperSelectors(): array
    {
        return EbeddienFiturSelectorRepository::codesForMethod('psbTarbiyahSuperSelectors');
    }

    public static function psbAdminSuperSelectors(): array
    {
        return EbeddienFiturSelectorRepository::codesForMethod('psbAdminSuperSelectors');
    }

    public static function psbStaffSuperSelectors(): array
    {
        return EbeddienFiturSelectorRepository::codesForMethod('psbStaffSuperSelectors');
    }

    public static function pendaftaranSantriFilterOptionsSelectors(): array
    {
        return EbeddienFiturSelectorRepository::codesForMethod('pendaftaranSantriFilterOptionsSelectors');
    }

    public static function dashboardLaporanIjinSelectors(): array
    {
        return EbeddienFiturSelectorRepository::codesForMethod('dashboardLaporanIjinSelectors');
    }

    public static function dashboardLaporanPsbSelectors(): array
    {
        return EbeddienFiturSelectorRepository::codesForMethod('dashboardLaporanPsbSelectors');
    }

    public static function cashlessAdminSelectors(): array
    {
        return EbeddienFiturSelectorRepository::codesForMethod('cashlessAdminSelectors');
    }

    public static function umrohModuleSelectors(): array
    {
        return EbeddienFiturSelectorRepository::codesForMethod('umrohModuleSelectors');
    }

    public static function uwabaStaffSuperSelectors(): array
    {
        return EbeddienFiturSelectorRepository::codesForMethod('uwabaStaffSuperSelectors');
    }

    public static function profilSaldoKeuanganSelectors(): array
    {
        return EbeddienFiturSelectorRepository::codesForMethod('profilSaldoKeuanganSelectors');
    }

    public static function userListUwabaNotifySelectors(): array
    {
        return EbeddienFiturSelectorRepository::codesForMethod('userListUwabaNotifySelectors');
    }

    public static function aktivitasPemasukanAdminSelectors(): array
    {
        return EbeddienFiturSelectorRepository::codesForMethod('aktivitasPemasukanAdminSelectors');
    }

    public static function kalenderPengaturanBulanSelectors(): array
    {
        return EbeddienFiturSelectorRepository::codesForMethod('kalenderPengaturanBulanSelectors');
    }

    public static function kalenderPengaturanHariPentingSelectors(): array
    {
        return EbeddienFiturSelectorRepository::codesForMethod('kalenderPengaturanHariPentingSelectors');
    }

    public static function wiridMenus(): array
    {
        return EbeddienFiturSelectorRepository::codesForMethod('wiridMenus');
    }

    public static function wiridNailulMurodApiSelectors(): array
    {
        return EbeddienFiturSelectorRepository::codesForMethod('wiridNailulMurodApiSelectors');
    }
}
