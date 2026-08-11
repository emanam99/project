import { useMemo } from 'react'
import { useAuthStore } from '../store/authStore'
import { userHasSuperAdminAccess } from '../utils/roleAccess'
import { PENDAFTARAN_ACTION_CODES } from '../config/pendaftaranFiturCodes'
import { buildCanPendaftaranAction } from './usePendaftaranFiturAccess'

export function useTesMasukFiturAccess() {
  const user = useAuthStore((s) => s.user)
  const fiturMenuCodes = useAuthStore((s) => s.fiturMenuCodes)

  return useMemo(() => {
    const can = buildCanPendaftaranAction(user, fiturMenuCodes)
    const noImplicit = () => false

    const canAktifDiniyah =
      can(PENDAFTARAN_ACTION_CODES.tesMasukAktifDiniyah, noImplicit)
      || can(PENDAFTARAN_ACTION_CODES.dataPendaftarAktifDiniyah, noImplicit)
      || userHasSuperAdminAccess(user)

    return {
      canSimpan: can(PENDAFTARAN_ACTION_CODES.tesMasukSimpan, noImplicit),
      canPrint: can(PENDAFTARAN_ACTION_CODES.tesMasukCetak, noImplicit),
      canAktifDiniyah,
      canVerifikasi:
        can(PENDAFTARAN_ACTION_CODES.tesMasukVerifikasi, noImplicit)
        || can(PENDAFTARAN_ACTION_CODES.dataPendaftarVerifikasi, noImplicit)
        || userHasSuperAdminAccess(user),
    }
  }, [user, fiturMenuCodes])
}
