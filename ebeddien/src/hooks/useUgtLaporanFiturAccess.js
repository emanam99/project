import { useMemo } from 'react'
import { useAuthStore } from '../store/authStore'
import { userHasSuperAdminAccess, userMatchesAnyAllowedRole } from '../utils/roleAccess'
import { UGT_LAPORAN_ACTION_CODES } from '../config/ugtLaporanFiturCodes'
import { userCanTambahLaporanUgt } from '../utils/ugtLaporanTambahAccess'
import { useMadrasahDataFiturAccess } from './useMadrasahDataFiturAccess'

const BASE = '/ugt/laporan'
const TAB_PREFIX = 'action.ugt.laporan.tab.'
const GRANULAR_LAPORAN_PREFIXES = [
  TAB_PREFIX,
  'action.ugt.laporan.tambah.',
  'action.ugt.laporan.filter_'
]

const strictNo = () => false

function codesHaveGranularUgtLaporan(codes) {
  return codes.some((c) => GRANULAR_LAPORAN_PREFIXES.some((p) => String(c).startsWith(p)))
}

export function buildCanUgtLaporanAction(user, fiturMenuCodes) {
  const codes = Array.isArray(fiturMenuCodes) ? fiturMenuCodes : []
  const useApi = codes.length > 0
  const userHasTabCodes = useApi && codes.some((c) => String(c).startsWith(TAB_PREFIX))
  const userHasGranularLaporan = useApi && codesHaveGranularUgtLaporan(codes)
  const realSuper = user?.is_real_super_admin === true

  return (code, fallback = strictNo) => {
    /** Legacy: super admin instansi tanpa penugasan fitur di token */
    if (realSuper && !useApi) return true
    if (!useApi) return typeof fallback === 'function' ? fallback() : false
    if (String(code).startsWith(TAB_PREFIX)) {
      if (userHasTabCodes || userHasGranularLaporan) {
        return codes.includes(code)
      }
      return typeof fallback === 'function' ? fallback() : false
    }
    if (codes.includes(code)) return true
    return typeof fallback === 'function' ? fallback() : false
  }
}

export function useUgtLaporanFiturAccess() {
  const user = useAuthStore((s) => s.user)
  const fiturMenuCodes = useAuthStore((s) => s.fiturMenuCodes)
  const { scopeAll } = useMadrasahDataFiturAccess()

  return useMemo(() => {
    const isSuper = userHasSuperAdminAccess(user)
    const isUgtAdminStaff =
      isSuper || userMatchesAnyAllowedRole(user, ['admin_ugt'])
    const isKoordinatorUgtRole = userMatchesAnyAllowedRole(user, ['koordinator_ugt'])
    const codes = Array.isArray(fiturMenuCodes) ? fiturMenuCodes : []
    const hasUgtLaporanMenu = codes.includes('menu.ugt.laporan')
    const hasKoordinatorMenu = codes.includes('menu.koordinator')

    const useApi = codes.length > 0
    const apiHasUgtLaporanTabs =
      useApi && codes.some((c) => String(c).startsWith(TAB_PREFIX))
    const apiHasGranularLaporanFeatures = useApi && codesHaveGranularUgtLaporan(codes)

    const can = buildCanUgtLaporanAction(user, fiturMenuCodes)
    /** Legacy: hanya menu.ugt.laporan tanpa aksi tab/tambah/filter di token */
    const tabFb = () => hasUgtLaporanMenu

    const tabKoordinator = can(UGT_LAPORAN_ACTION_CODES.tabKoordinator, tabFb)
    const tabGt = can(UGT_LAPORAN_ACTION_CODES.tabGt, tabFb)
    const tabPjgt = can(UGT_LAPORAN_ACTION_CODES.tabPjgt, tabFb)

    const canTambahKoordinator = userCanTambahLaporanUgt(codes, user, 'koordinator', tabKoordinator)
    const canTambahGt = userCanTambahLaporanUgt(codes, user, 'gt', tabGt)
    const canTambahPjgt = userCanTambahLaporanUgt(codes, user, 'pjgt', tabPjgt)

    const hasFilterKoordinatorSemuaCode = codes.includes(
      UGT_LAPORAN_ACTION_CODES.filterKoordinatorSemua
    )

    const noTabAccess =
      (apiHasUgtLaporanTabs || apiHasGranularLaporanFeatures) &&
      hasUgtLaporanMenu &&
      !tabKoordinator &&
      !tabGt &&
      !tabPjgt

    const visibleTabs = [
      tabKoordinator && { to: `${BASE}/koordinator`, label: 'Koordinator', key: 'koordinator' },
      tabGt && { to: `${BASE}/gt`, label: 'GT', key: 'gt' },
      tabPjgt && { to: `${BASE}/pjgt`, label: 'PJGT', key: 'pjgt' }
    ].filter(Boolean)

    const firstTabPath = visibleTabs[0]?.to ?? null

    /** Belum ada aksi granular laporan di token → filter penuh jika punya menu koordinator (admin UGT) */
    const legacyShowKoordinatorFilter =
      !apiHasGranularLaporanFeatures && hasKoordinatorMenu

    const hasFilterKoordinatorSemua = apiHasGranularLaporanFeatures
      ? scopeAll ||
        hasFilterKoordinatorSemuaCode ||
        hasKoordinatorMenu ||
        isUgtAdminStaff
      : isSuper || hasKoordinatorMenu || scopeAll || hasFilterKoordinatorSemuaCode

    /** Koordinator UGT tanpa peran admin — hanya madrasah koordinator sendiri (selaras API). */
    const isKoordinatorOnly =
      hasUgtLaporanMenu && isKoordinatorUgtRole && !isUgtAdminStaff

    const koordinatorFilterLocked =
      apiHasGranularLaporanFeatures &&
      isKoordinatorOnly &&
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
      canTambahKoordinator,
      canTambahGt,
      canTambahPjgt,
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
