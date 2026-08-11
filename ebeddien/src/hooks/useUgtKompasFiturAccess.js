import { useMemo } from 'react'
import { useAuthStore } from '../store/authStore'
import { userHasSuperAdminAccess } from '../utils/roleAccess'
import { UGT_KOMPAS_ACTION_CODES as C, UGT_KOMPAS_MENU_CODE } from '../config/ugtKompasFiturCodes'

const TAB_PREFIX = 'action.ugt.kompas.tab.'
const ACTION_PREFIX = 'action.ugt.kompas.'

/**
 * Hak tab & CRUD halaman KOMMPAS — sumber: /me/fitur-menu.
 * Tanpa aksi granular di token → fallback penuh jika punya menu (legacy).
 */
export function useUgtKompasFiturAccess() {
  const user = useAuthStore((s) => s.user)
  const fiturMenuCodes = useAuthStore((s) => s.fiturMenuCodes)

  return useMemo(() => {
    const isSuper = userHasSuperAdminAccess(user)
    const codes = Array.isArray(fiturMenuCodes) ? fiturMenuCodes : []
    const useApi = codes.length > 0
    const hasMenu = codes.includes(UGT_KOMPAS_MENU_CODE)
    const apiHasTabGranular = useApi && codes.some((c) => String(c).startsWith(TAB_PREFIX))
    const apiHasAnyKompasAction = useApi && codes.some((c) => String(c).startsWith(ACTION_PREFIX))
    const apiHasCrudGranular =
      useApi &&
      codes.some((c) => {
        const s = String(c)
        return (
          s.startsWith('action.ugt.kompas.lomba.') ||
          s.startsWith('action.ugt.kompas.daftar.') ||
          s.startsWith('action.ugt.kompas.nilai.') ||
          s.startsWith('action.ugt.kompas.aturan.')
        )
      })

    const canTab = (code) => {
      if (isSuper) return true
      if (!apiHasTabGranular && !apiHasAnyKompasAction) return hasMenu
      return codes.includes(code)
    }

    const canCrud = (code) => {
      if (isSuper) return true
      if (apiHasTabGranular || apiHasCrudGranular || apiHasAnyKompasAction) {
        return codes.includes(code)
      }
      return hasMenu
    }

    const tabDashboard = canTab(C.tabDashboard)
    const tabLomba = canTab(C.tabLomba)
    const tabDaftar = canTab(C.tabDaftar)
    const tabNilai = canTab(C.tabNilai)
    const tabAturan = canTab(C.tabAturan)

    const lombaTambah = canCrud(C.lombaTambah)
    const lombaUbah = canCrud(C.lombaUbah)
    const lombaHapus = canCrud(C.lombaHapus)

    const daftarTambah = canCrud(C.daftarTambah)
    const daftarUbah = canCrud(C.daftarUbah)
    const daftarHapus = canCrud(C.daftarHapus)

    const nilaiTambah = canCrud(C.nilaiTambah)
    const nilaiUbah = canCrud(C.nilaiUbah)
    const nilaiHapus = canCrud(C.nilaiHapus)

    const aturanTambah = canCrud(C.aturanTambah)
    const aturanUbah = canCrud(C.aturanUbah)
    const aturanHapus = canCrud(C.aturanHapus)

    const visibleTabIds = [
      tabDashboard && 'dashboard',
      tabLomba && 'lomba',
      tabDaftar && 'daftar',
      tabNilai && 'nilai',
      tabAturan && 'aturan',
    ].filter(Boolean)

    const noTabAccess =
      (apiHasTabGranular || apiHasAnyKompasAction) &&
      hasMenu &&
      visibleTabIds.length === 0

    return {
      apiHasTabGranular,
      apiHasAnyKompasAction,
      noTabAccess,
      tabDashboard,
      tabLomba,
      tabDaftar,
      tabNilai,
      tabAturan,
      visibleTabIds,
      lombaTambah,
      lombaUbah,
      lombaHapus,
      daftarTambah,
      daftarUbah,
      daftarHapus,
      nilaiTambah,
      nilaiUbah,
      nilaiHapus,
      aturanTambah,
      aturanUbah,
      aturanHapus,
    }
  }, [user, fiturMenuCodes])
}
