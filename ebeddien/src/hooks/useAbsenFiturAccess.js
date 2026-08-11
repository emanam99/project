import { useMemo } from 'react'
import { useAuthStore } from '../store/authStore'
import { userHasSuperAdminAccess } from '../utils/roleAccess'
import { ABSEN_ACTION_CODES as C } from '../config/absenFiturCodes'

function collectLembagaIds(user) {
  const s = new Set()
  if (user?.lembaga_id != null && String(user.lembaga_id).trim() !== '') {
    s.add(String(user.lembaga_id).trim())
  }
  const arr = user?.lembaga_ids
  if (Array.isArray(arr)) {
    arr.forEach((x) => {
      if (x != null && String(x).trim() !== '') s.add(String(x).trim())
    })
  }
  return [...s]
}

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
    const apiHasAnyAbsenAction = useApi && codes.some((c) => String(c).startsWith('action.absen.'))
    const apiHasLokasiGranular =
      useApi && codes.some((c) => String(c).startsWith('action.absen.lokasi.'))
    const hasMenuAbsen = codes.includes('menu.absen')
    const lembagaIds = collectLembagaIds(user)

    const riwayatLembagaSemua =
      isSuper ||
      lembagaIds.length === 0 ||
      !apiHasAnyAbsenAction ||
      codes.includes(C.riwayatLembagaSemua)
    const riwayatLembagaFilterLocked =
      apiHasAnyAbsenAction && lembagaIds.length > 0 && !riwayatLembagaSemua && !isSuper
    /** null = semua lembaga (UI); array = batasi ke id ini */
    const allowedLembagaIdsRiwayat = riwayatLembagaSemua ? null : lembagaIds.length ? lembagaIds : null

    const canTab = (code, fb) => {
      if (isSuper) return true
      if (!apiHasAbsenTabGranular) return typeof fb === 'function' ? fb() : false
      return codes.includes(code)
    }

    const tabRiwayat = canTab(C.tabRiwayat, () => hasMenuAbsen)
    const tabAbsen = canTab(C.tabAbsen, () => hasMenuAbsen)
    const tabPengaturan = canTab(C.tabPengaturan, () => hasMenuAbsen)
    const tabNgabsen = canTab(C.tabNgabsen, () => hasMenuAbsen)

    const noTabAccess =
      apiHasAbsenTabGranular && !tabRiwayat && !tabAbsen && !tabPengaturan && !tabNgabsen

    // Bila ada aksi granular tab atau lokasi, hak lokasi (list/tambah/ubah/hapus) wajib eksplisit —
    // jangan fallback ke menu.absen (menghindari tombol Tambah “bocor” untuk user tab.absen saja).
    const canLokasi = (code, fb) => {
      if (isSuper) return true
      if (apiHasAbsenTabGranular || apiHasLokasiGranular) return codes.includes(code)
      return typeof fb === 'function' ? fb() : false
    }

    const lokasiList = canLokasi(C.lokasiList, () => hasMenuAbsen)
    /**
     * Tampilkan zona GPS + tombol absen mandiri: cukup punya tab «Absen» (bukan aksi lokasi.absen terpisah).
     */
    const lokasiAbsenMandiri = isSuper || tabAbsen
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
      apiHasAnyAbsenAction,
      apiHasLokasiGranular,
      noTabAccess,
      tabRiwayat,
      tabAbsen,
      tabPengaturan,
      tabNgabsen,
      riwayatLembagaSemua,
      riwayatLembagaFilterLocked,
      allowedLembagaIdsRiwayat,
      lokasiList,
      lokasiAbsenMandiri,
      lokasiTambah,
      lokasiUbah,
      lokasiHapus,
      lokasiKelolaTerlihat
    }
  }, [user, fiturMenuCodes])
}
