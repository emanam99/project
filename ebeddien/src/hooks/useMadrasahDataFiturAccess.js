import { useMemo } from 'react'
import { useAuthStore } from '../store/authStore'
import { userHasSuperAdminAccess } from '../utils/roleAccess'
import { UGT_MADRASAH_ACTION_CODES } from '../config/ugtMadrasahFiturCodes'

const MENU_DATA_MADRASAH = 'menu.ugt.data_madrasah'
const ACTION_DATA_MADRASAH_PREFIX = 'action.ugt.data_madrasah.'

/**
 * Ruang lingkup Data Madrasah: semua madrasah vs hanya koordinator sendiri.
 * Selaras MadrasahController::madrasahApplyKoordinatorScope + fiturMenuCodes (tanpa cek key role statis).
 */
export function useMadrasahDataFiturAccess() {
  const user = useAuthStore((s) => s.user)
  const fiturMenuCodes = useAuthStore((s) => s.fiturMenuCodes)

  return useMemo(() => {
    const isSuper = userHasSuperAdminAccess(user)
    const codes = Array.isArray(fiturMenuCodes) ? fiturMenuCodes : []
    const useApi = codes.length > 0
    const apiHasMadrasahActions =
      useApi && codes.some((c) => String(c).startsWith(ACTION_DATA_MADRASAH_PREFIX))

    const hasDataMadrasahAccess =
      isSuper ||
      codes.includes(MENU_DATA_MADRASAH) ||
      codes.some((c) => String(c).startsWith(ACTION_DATA_MADRASAH_PREFIX))

    /** Boleh melihat/mengelola semua madrasah (API tidak filter id_koordinator). */
    let scopeAll = false
    if (isSuper) {
      scopeAll = true
    } else if (apiHasMadrasahActions) {
      scopeAll = codes.includes(UGT_MADRASAH_ACTION_CODES.scopeAll)
    }

    /** Filter koordinator di UI terkunci ke nama sendiri (akses halaman tanpa aksi scope_all). */
    const koordinatorFilterLocked =
      hasDataMadrasahAccess && !scopeAll && !isSuper

    return {
      scopeAll,
      koordinatorFilterLocked,
      apiHasMadrasahActions,
      hasDataMadrasahAccess
    }
  }, [user, fiturMenuCodes])
}
