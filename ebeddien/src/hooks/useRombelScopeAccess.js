import { useMemo } from 'react'
import { useAuthStore } from '../store/authStore'
import { userHasSuperAdminAccess } from '../utils/roleAccess'
import { ROMBEL_SCOPE_ACTION_CODES } from '../config/lembagaFilterFiturCodes'

/**
 * Aksi Rombel: semua rombel di lembaga vs rombel bertugas (wali / guru FAN).
 * Tanpa aksi «semua rombel» tetapi punya «rombel bertugas» → daftar dibatasi server ke rombel yang diampu.
 */
export function useRombelScopeAccess() {
  const user = useAuthStore((s) => s.user)
  const fiturMenuCodes = useAuthStore((s) => s.fiturMenuCodes)

  return useMemo(() => {
    const codes = Array.isArray(fiturMenuCodes) ? fiturMenuCodes : []
    const isSuper = userHasSuperAdminAccess(user)
    const canSemuaRombelDiLembaga =
      isSuper || codes.includes(ROMBEL_SCOPE_ACTION_CODES.semuaRombelDiLembaga)
    const hasRombelBertugas = codes.includes(ROMBEL_SCOPE_ACTION_CODES.rombelBertugas)
    const applyBertugasFilter = !isSuper && !canSemuaRombelDiLembaga && hasRombelBertugas
    const canFilterPengurusAmpu = canSemuaRombelDiLembaga

    return {
      isSuper,
      canSemuaRombelDiLembaga,
      hasRombelBertugas,
      applyBertugasFilter,
      canFilterPengurusAmpu,
    }
  }, [user, fiturMenuCodes])
}
