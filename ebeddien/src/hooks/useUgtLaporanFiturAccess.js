import { useMemo } from 'react'
import { useAuthStore } from '../store/authStore'
import { userHasSuperAdminAccess } from '../utils/roleAccess'
import { UGT_LAPORAN_ACTION_CODES } from '../config/ugtLaporanFiturCodes'
import { useMadrasahDataFiturAccess } from './useMadrasahDataFiturAccess'

const BASE = '/ugt/laporan'

export function buildCanUgtLaporanAction(user, fiturMenuCodes) {
  const isSuper = userHasSuperAdminAccess(user)
  const useApi = Array.isArray(fiturMenuCodes) && fiturMenuCodes.length > 0
  const apiHasTabs =
    useApi && fiturMenuCodes.some((c) => String(c).startsWith('action.ugt.laporan.tab.'))
  return (code, fallback) => {
    if (isSuper) return true
    if (!useApi) return fallback()
    if (apiHasTabs && String(code).startsWith('action.ugt.laporan.tab.')) {
      return fiturMenuCodes.includes(code)
    }
    if (fiturMenuCodes.includes(code)) return true
    return fallback()
  }
}

export function useUgtLaporanFiturAccess() {
  const user = useAuthStore((s) => s.user)
  const fiturMenuCodes = useAuthStore((s) => s.fiturMenuCodes)
  const { scopeAll } = useMadrasahDataFiturAccess()

  return useMemo(() => {
    const isSuper = userHasSuperAdminAccess(user)
    const codes = Array.isArray(fiturMenuCodes) ? fiturMenuCodes : []
    const hasUgtLaporanMenu = codes.includes('menu.ugt.laporan')
    const hasKoordinatorMenu = codes.includes('menu.koordinator')

    const useApi = codes.length > 0
    const apiHasUgtLaporanTabs =
      useApi && codes.some((c) => String(c).startsWith('action.ugt.laporan.tab.'))

    const can = buildCanUgtLaporanAction(user, fiturMenuCodes)
    const tabFb = () => hasUgtLaporanMenu

    const tabKoordinator = can(UGT_LAPORAN_ACTION_CODES.tabKoordinator, tabFb)
    const tabGt = can(UGT_LAPORAN_ACTION_CODES.tabGt, tabFb)
    const tabPjgt = can(UGT_LAPORAN_ACTION_CODES.tabPjgt, tabFb)

    const hasFilterKoordinatorSemuaCode = codes.includes(
      UGT_LAPORAN_ACTION_CODES.filterKoordinatorSemua
    )

    const noTabAccess =
      apiHasUgtLaporanTabs && hasUgtLaporanMenu && !tabKoordinator && !tabGt && !tabPjgt

    const visibleTabs = [
      tabKoordinator && { to: `${BASE}/koordinator`, label: 'Koordinator', key: 'koordinator' },
      tabGt && { to: `${BASE}/gt`, label: 'GT', key: 'gt' },
      tabPjgt && { to: `${BASE}/pjgt`, label: 'PJGT', key: 'pjgt' }
    ].filter(Boolean)

    const firstTabPath = visibleTabs[0]?.to ?? null

    /** Belum ada action tab di token → filter penuh jika punya menu koordinator (admin UGT) */
    const legacyShowKoordinatorFilter = !apiHasUgtLaporanTabs && hasKoordinatorMenu

    const hasFilterKoordinatorSemua =
      isSuper ||
      hasKoordinatorMenu ||
      scopeAll ||
      (apiHasUgtLaporanTabs && hasFilterKoordinatorSemuaCode)

    const isKoordinatorOnly =
      hasUgtLaporanMenu && !hasKoordinatorMenu

    const koordinatorFilterLocked =
      apiHasUgtLaporanTabs &&
      isKoordinatorOnly &&
      !isSuper &&
      !scopeAll &&
      !hasFilterKoordinatorSemuaCode

    const showKoordinatorFilter =
      legacyShowKoordinatorFilter ||
      hasFilterKoordinatorSemua ||
      koordinatorFilterLocked

    return {
      tabKoordinator,
      tabGt,
      tabPjgt,
      apiHasUgtLaporanTabs,
      noTabAccess,
      visibleTabs,
      firstTabPath,
      showKoordinatorFilter,
      koordinatorFilterLocked,
      hasFilterKoordinatorSemua
    }
  }, [user, fiturMenuCodes, scopeAll])
}
