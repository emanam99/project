import { useMemo } from 'react'
import { useAuthStore } from '../store/authStore'
import { userHasSuperAdminAccess, userMatchesAnyAllowedRole } from '../utils/roleAccess'
import { UGT_MADRASAH_ACTION_CODES } from '../config/ugtMadrasahFiturCodes'

/**
 * Ruang lingkup Data Madrasah: semua madrasah vs hanya koordinator sendiri.
 * Selaras MadrasahController::madrasahApplyKoordinatorScope + fiturMenuCodes.
 */
export function useMadrasahDataFiturAccess() {
  const user = useAuthStore((s) => s.user)
  const fiturMenuCodes = useAuthStore((s) => s.fiturMenuCodes)

  return useMemo(() => {
    const isSuper = userHasSuperAdminAccess(user)
    const isAdminUgt = userMatchesAnyAllowedRole(user, ['admin_ugt'])
    const isKoordinatorUgt = userMatchesAnyAllowedRole(user, ['koordinator_ugt'])

    const useApi = Array.isArray(fiturMenuCodes) && fiturMenuCodes.length > 0
    const apiHasMadrasahActions =
      useApi && fiturMenuCodes.some((c) => String(c).startsWith('action.ugt.data_madrasah.'))

    /** Boleh melihat/mengelola semua madrasah (API tidak filter id_koordinator). */
    let scopeAll = false
    if (isSuper || isAdminUgt) {
      scopeAll = true
    } else if (apiHasMadrasahActions) {
      scopeAll = fiturMenuCodes.includes(UGT_MADRASAH_ACTION_CODES.scopeAll)
    }
    // Belum ada baris action di API: perilaku lama — hanya admin/super yang "semua" (sudah tertutup di atas)

    /** Filter koordinator di UI terkunci ke nama sendiri (hanya koordinator tanpa scope all). */
    const koordinatorFilterLocked =
      isKoordinatorUgt && !isSuper && !isAdminUgt && !scopeAll

    return {
      scopeAll,
      koordinatorFilterLocked,
      isKoordinatorUgt,
      apiHasMadrasahActions
    }
  }, [user, fiturMenuCodes])
}
