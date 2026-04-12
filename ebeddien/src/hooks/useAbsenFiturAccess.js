import { useMemo } from 'react'
import { useAuthStore } from '../store/authStore'
import { userHasSuperAdminAccess } from '../utils/roleAccess'
import { ABSEN_ACTION_CODES as C } from '../config/absenFiturCodes'

/**
 * Hak tab & lokasi halaman Absen — sumber: /me/fitur-menu.
 */
export function useAbsenFiturAccess() {
  const user = useAuthStore((s) => s.user)
  const fiturMenuCodes = useAuthStore((s) => s.fiturMenuCodes)

  return useMemo(() => {
    const isSuper = userHasSuperAdminAccess(user)
    const codes = Array.isArray(fiturMenuCodes) ? fiturMenuCodes : []
    const useApi = codes.length > 0
    const apiHasAbsenTabGranular =
      useApi && codes.some((c) => String(c).startsWith('action.absen.tab.'))
    const apiHasLokasiGranular =
      useApi && codes.some((c) => String(c).startsWith('action.absen.lokasi.'))
    const hasMenuAbsen = codes.includes('menu.absen')

    const canTab = (code, fb) => {
      if (isSuper) return true
      if (!apiHasAbsenTabGranular) return typeof fb === 'function' ? fb() : false
      return codes.includes(code)
    }

    const tabRiwayat = canTab(C.tabRiwayat, () => hasMenuAbsen)
    const tabAbsen = canTab(C.tabAbsen, () => hasMenuAbsen)
    const tabNgabsen = canTab(C.tabNgabsen, () => hasMenuAbsen)

    const noTabAccess = apiHasAbsenTabGranular && !tabRiwayat && !tabAbsen && !tabNgabsen

    // Bila ada aksi granular tab atau lokasi, hak lokasi (list/tambah/ubah/hapus) wajib eksplisit —
    // jangan fallback ke menu.absen (menghindari tombol Tambah “bocor” untuk user tab.absen saja).
    const canLokasi = (code, fb) => {
      if (isSuper) return true
      if (apiHasAbsenTabGranular || apiHasLokasiGranular) return codes.includes(code)
      return typeof fb === 'function' ? fb() : false
    }

    const lokasiList = canLokasi(C.lokasiList, () => hasMenuAbsen)
    // Selaras API canNgabsenLokasi: tab Absen/Ngabsen = boleh mandiri; lokasi.absen = mandiri tanpa tab.
    const lokasiAbsenMandiri =
      isSuper ||
      (!hasMenuAbsen
        ? false
        : codes.includes(C.lokasiAbsenMandiri) ||
          (!apiHasAbsenTabGranular && !apiHasLokasiGranular) ||
          codes.includes(C.tabAbsen) ||
          codes.includes(C.tabNgabsen))
    const lokasiTambah = canLokasi(C.lokasiTambah, () => hasMenuAbsen)
    const lokasiUbah = canLokasi(C.lokasiUbah, () => hasMenuAbsen)
    const lokasiHapus = canLokasi(C.lokasiHapus, () => hasMenuAbsen)

    const lokasiKelolaTerlihat =
      isSuper ||
      (hasMenuAbsen &&
        (!apiHasLokasiGranular ||
          lokasiList ||
          lokasiTambah ||
          lokasiUbah ||
          lokasiHapus ||
          lokasiAbsenMandiri))

    return {
      apiHasAbsenTabGranular,
      apiHasLokasiGranular,
      noTabAccess,
      tabRiwayat,
      tabAbsen,
      tabNgabsen,
      lokasiList,
      lokasiAbsenMandiri,
      lokasiTambah,
      lokasiUbah,
      lokasiHapus,
      lokasiKelolaTerlihat
    }
  }, [user, fiturMenuCodes])
}
