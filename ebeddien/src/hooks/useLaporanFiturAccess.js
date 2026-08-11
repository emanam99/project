import { useMemo } from 'react'
import { useAuthStore } from '../store/authStore'
import { userHasSuperAdminAccess } from '../utils/roleAccess'
import { LAPORAN_ACTION_CODES, LAPORAN_UWABA_TAB_CODES } from '../config/laporanFiturCodes'

const strictNo = () => false

export function buildCanLaporanAction(user, fiturMenuCodes) {
  const isSuper = userHasSuperAdminAccess(user)
  const codes = Array.isArray(fiturMenuCodes) ? fiturMenuCodes : []
  const useApi = codes.length > 0
  const apiHas =
    useApi && codes.some((c) => String(c).startsWith('action.laporan.'))
  return (code, fallback = strictNo) => {
    if (isSuper) return true
    if (!useApi) return typeof fallback === 'function' ? fallback() : false
    if (apiHas && String(code).startsWith('action.laporan.')) {
      return codes.includes(code)
    }
    if (codes.includes(code)) return true
    return typeof fallback === 'function' ? fallback() : false
  }
}

export function useLaporanFiturAccess() {
  const user = useAuthStore((s) => s.user)
  const fiturMenuCodes = useAuthStore((s) => s.fiturMenuCodes)

  return useMemo(() => {
    const codes = Array.isArray(fiturMenuCodes) ? fiturMenuCodes : []
    const useApi = codes.length > 0
    const apiHasLaporanTabs =
      useApi && codes.some((c) => String(c).startsWith('action.laporan.'))

    const isSuper = userHasSuperAdminAccess(user)
    const can = buildCanLaporanAction(user, fiturMenuCodes)

    const tabTunggakan = can(LAPORAN_ACTION_CODES.tabTunggakan, strictNo)
    const tabKhusus = can(LAPORAN_ACTION_CODES.tabKhusus, strictNo)
    const tabUwaba = can(LAPORAN_ACTION_CODES.tabUwaba, strictNo)
    const tabPendaftaran = can(LAPORAN_ACTION_CODES.tabPendaftaran, strictNo)

    /** Punya minimal satu tab laporan UWABA (tunggakan/khusus/uwaba) di token — bukan daftar role hardcode */
    const hasUwabaLaporanGroup =
      isSuper ||
      (useApi && LAPORAN_UWABA_TAB_CODES.some((c) => codes.includes(c)))
    /** Punya tab laporan pendaftaran */
    const hasPsbLaporanGroup =
      isSuper || (useApi && codes.includes(LAPORAN_ACTION_CODES.tabPendaftaran))

    const noTabAccess =
      apiHasLaporanTabs &&
      !(hasUwabaLaporanGroup && (tabTunggakan || tabKhusus || tabUwaba)) &&
      !(hasPsbLaporanGroup && tabPendaftaran)

    return {
      apiHasLaporanTabs,
      noTabAccess,
      can,
      tabTunggakan,
      tabKhusus,
      tabUwaba,
      tabPendaftaran,
      hasUwabaLaporanGroup,
      hasPsbLaporanGroup
    }
  }, [user, fiturMenuCodes])
}
