import { useMemo } from 'react'
import { useAuthStore } from '../store/authStore'
import { userHasSuperAdminAccess, userMatchesAnyAllowedRole } from '../utils/roleAccess'
import { LAPORAN_ACTION_CODES } from '../config/laporanFiturCodes'

export function buildCanLaporanAction(user, fiturMenuCodes) {
  const isSuper = userHasSuperAdminAccess(user)
  const useApi = Array.isArray(fiturMenuCodes) && fiturMenuCodes.length > 0
  const apiHas =
    useApi && fiturMenuCodes.some((c) => String(c).startsWith('action.laporan.'))
  return (code, fallback) => {
    if (isSuper) return true
    if (!useApi) return fallback()
    if (apiHas && String(code).startsWith('action.laporan.')) {
      return fiturMenuCodes.includes(code)
    }
    if (fiturMenuCodes.includes(code)) return true
    return fallback()
  }
}

export function useLaporanFiturAccess() {
  const user = useAuthStore((s) => s.user)
  const fiturMenuCodes = useAuthStore((s) => s.fiturMenuCodes)

  return useMemo(() => {
    const useApi = Array.isArray(fiturMenuCodes) && fiturMenuCodes.length > 0
    const apiHasLaporanTabs =
      useApi && fiturMenuCodes.some((c) => String(c).startsWith('action.laporan.'))

    const can = buildCanLaporanAction(user, fiturMenuCodes)
    const uwabaTabFb = () =>
      userMatchesAnyAllowedRole(user, ['admin_uwaba', 'petugas_uwaba', 'super_admin'])
    const psbTabFb = () =>
      userMatchesAnyAllowedRole(user, ['admin_psb', 'petugas_psb', 'super_admin'])

    const tabTunggakan = can(LAPORAN_ACTION_CODES.tabTunggakan, uwabaTabFb)
    const tabKhusus = can(LAPORAN_ACTION_CODES.tabKhusus, uwabaTabFb)
    const tabUwaba = can(LAPORAN_ACTION_CODES.tabUwaba, uwabaTabFb)
    const tabPendaftaran = can(LAPORAN_ACTION_CODES.tabPendaftaran, psbTabFb)

    const hasUwaba = userMatchesAnyAllowedRole(user, [
      'admin_uwaba',
      'petugas_uwaba',
      'super_admin'
    ])
    const hasPsb = userMatchesAnyAllowedRole(user, ['admin_psb', 'petugas_psb', 'super_admin'])
    const noTabAccess =
      apiHasLaporanTabs &&
      !(hasUwaba && (tabTunggakan || tabKhusus || tabUwaba)) &&
      !(hasPsb && tabPendaftaran)

    return {
      apiHasLaporanTabs,
      noTabAccess,
      can,
      tabTunggakan,
      tabKhusus,
      tabUwaba,
      tabPendaftaran
    }
  }, [user, fiturMenuCodes])
}
