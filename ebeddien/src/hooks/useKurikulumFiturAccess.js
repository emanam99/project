import { useMemo } from 'react'
import { useAuthStore } from '../store/authStore'
import { userHasSuperAdminAccess } from '../utils/roleAccess'
import { KURIKULUM_ACTION_CODES as C, KURIKULUM_MENU_CODE } from '../config/kurikulumFiturCodes'

/**
 * Hak tab halaman Kurikulum — sumber: /me/fitur-menu.
 * Tab Kitab/Mapel tetap terbuka lewat menu.kitab / menu.mapel (legacy) jika aksi tab belum ada.
 */
export function useKurikulumFiturAccess() {
  const user = useAuthStore((s) => s.user)
  const fiturMenuCodes = useAuthStore((s) => s.fiturMenuCodes)

  return useMemo(() => {
    const isSuper = userHasSuperAdminAccess(user)
    const codes = Array.isArray(fiturMenuCodes) ? fiturMenuCodes : []
    const useApi = codes.length > 0
    const apiHasTabGranular = useApi && codes.some((c) => String(c).startsWith('action.kurikulum.tab.'))
    const hasMenuKurikulum = codes.includes(KURIKULUM_MENU_CODE)
    const hasLegacyKitab = codes.includes('menu.kitab')
    const hasLegacyMapel = codes.includes('menu.mapel') || codes.includes('action.mapel.halaman')

    const tabKitab =
      isSuper || codes.includes(C.tabKitab) || hasLegacyKitab || (!apiHasTabGranular && hasMenuKurikulum)
    const tabMapel =
      isSuper || codes.includes(C.tabMapel) || hasLegacyMapel || (!apiHasTabGranular && hasMenuKurikulum)
    const tabJadwal = isSuper || codes.includes(C.tabJadwal) || (!apiHasTabGranular && hasMenuKurikulum)

    const noTabAccess = !tabKitab && !tabMapel && !tabJadwal

    return {
      tabKitab,
      tabMapel,
      tabJadwal,
      noTabAccess,
    }
  }, [user, fiturMenuCodes])
}
