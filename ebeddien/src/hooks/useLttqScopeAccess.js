import { useMemo } from 'react'
import { useAuthStore } from '../store/authStore'
import { userHasSuperAdminAccess } from '../utils/roleAccess'
import { LTTQ_ACTION_CODES } from '../config/lttqFiturCodes'

/**
 * Scope tingkatan LTTQ: admin vs petugas (hanya tingkatan bertugas / mualim aktif).
 */
export function useLttqScopeAccess() {
  const user = useAuthStore((s) => s.user)
  const fiturMenuCodes = useAuthStore((s) => s.fiturMenuCodes)

  return useMemo(() => {
    const codes = Array.isArray(fiturMenuCodes) ? fiturMenuCodes : []
    const isSuper = userHasSuperAdminAccess(user)
    const canKelolaMaster =
      isSuper ||
      codes.includes(LTTQ_ACTION_CODES.tingkatanTambah) ||
      codes.includes(LTTQ_ACTION_CODES.tingkatanUbah)
    const hasTingkatanBertugas = codes.includes(LTTQ_ACTION_CODES.tingkatanBertugas)
    const applyBertugasFilter = !isSuper && !canKelolaMaster && hasTingkatanBertugas

    return {
      isSuper,
      canKelolaMaster,
      hasTingkatanBertugas,
      applyBertugasFilter,
      tingkatanFormReadOnly: applyBertugasFilter && !isSuper
    }
  }, [user, fiturMenuCodes])
}
