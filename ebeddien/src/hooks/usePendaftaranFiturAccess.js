import { useMemo } from 'react'
import { useAuthStore } from '../store/authStore'
import { userHasSuperAdminAccess, userMatchesAnyAllowedRole } from '../utils/roleAccess'
import { PENDAFTARAN_ACTION_CODES } from '../config/pendaftaranFiturCodes'

export function buildCanPendaftaranAction(user, fiturMenuCodes) {
  const isSuper = userHasSuperAdminAccess(user)
  const useApi = Array.isArray(fiturMenuCodes) && fiturMenuCodes.length > 0
  const apiHas =
    useApi && fiturMenuCodes.some((c) => String(c).startsWith('action.pendaftaran.'))
  return (code, fallback) => {
    if (isSuper) return true
    if (!useApi) return fallback()
    if (apiHas && String(code).startsWith('action.pendaftaran.')) {
      return fiturMenuCodes.includes(code)
    }
    if (fiturMenuCodes.includes(code)) return true
    return fallback()
  }
}

export function usePendaftaranFiturAccess() {
  const user = useAuthStore((s) => s.user)
  const fiturMenuCodes = useAuthStore((s) => s.fiturMenuCodes)

  return useMemo(() => {
    const can = buildCanPendaftaranAction(user, fiturMenuCodes)
    const superFb = () => userHasSuperAdminAccess(user)
    const hapusSantriFb = () => userMatchesAnyAllowedRole(user, ['super_admin', 'admin_psb'])
    const noImplicitFilterFull = () => false

    return {
      can,
      /** Tombol/modal hapus registrasi & opsi hapus di tabel santri (hanya alur biodata pendaftaran) */
      hapusSantri: can(PENDAFTARAN_ACTION_CODES.biodataHapusSantri, hapusSantriFb),
      /** Dropdown filter formal/diniyah memuat semua lembaga di data; tanpa aksi → terbatas scope lembaga role */
      dataPendaftarFilterFormalDiniyahSemuaLembaga: can(
        PENDAFTARAN_ACTION_CODES.dataPendaftarFilterFormalDiniyahSemuaLembaga,
        noImplicitFilterFull
      ),
      routeItem: can(PENDAFTARAN_ACTION_CODES.routeItem, superFb),
      routeManageItemSet: can(PENDAFTARAN_ACTION_CODES.routeManageItemSet, superFb),
      routeManageKondisi: can(PENDAFTARAN_ACTION_CODES.routeManageKondisi, superFb),
      routeKondisiRegistrasi: can(PENDAFTARAN_ACTION_CODES.routeKondisiRegistrasi, superFb),
      routeAssignItem: can(PENDAFTARAN_ACTION_CODES.routeAssignItem, superFb),
      routeSimulasi: can(PENDAFTARAN_ACTION_CODES.routeSimulasi, superFb)
    }
  }, [user, fiturMenuCodes])
}
