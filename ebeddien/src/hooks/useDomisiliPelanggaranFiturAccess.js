import { useMemo } from 'react'
import { useAuthStore } from '../store/authStore'
import { getUserRoleKeysLower, userHasSuperAdminAccess } from '../utils/roleAccess'

/** Selaras middleware legacy TARBIYAH_SUPER_SELECTORS untuk domisili. */
const LEGACY_TARBIYAH_DOMISILI_ROLES = [
  'super_admin',
  'tarbiyah',
  'admin_daerah',
  'admin_domisili',
  'kapdar',
  'wakapdar'
]

function userMatchesLegacyTarbiyahDomisili(user) {
  if (!user) return false
  const keys = getUserRoleKeysLower(user)
  return keys.some((k) => LEGACY_TARBIYAH_DOMISILI_ROLES.includes(k))
}

/**
 * Hak halaman master Pelanggaran (menu + aksi granular), selaras PelanggaranMasterController.
 */
export function useDomisiliPelanggaranFiturAccess() {
  const user = useAuthStore((s) => s.user)
  const fiturMenuCodes = useAuthStore((s) => s.fiturMenuCodes)
  const fiturMenuFetchStatus = useAuthStore((s) => s.fiturMenuFetchStatus)

  return useMemo(() => {
    const codes = Array.isArray(fiturMenuCodes) ? fiturMenuCodes : []
    const isSuper = userHasSuperAdminAccess(user)
    const legacyDom = userMatchesLegacyTarbiyahDomisili(user)
    const fiturReady = fiturMenuFetchStatus === 'ok'
    const noFiturCodes = fiturReady && codes.length === 0

    const canLoadMasterList =
      isSuper ||
      codes.includes('menu.domisili.pelanggaran') ||
      codes.includes('action.domisili.pelanggaran.halaman') ||
      (noFiturCodes && legacyDom)

    const canCreate =
      isSuper || codes.includes('action.domisili.pelanggaran.buat') || (noFiturCodes && legacyDom)

    const canEdit = isSuper || codes.includes('action.domisili.pelanggaran.ubah') || (noFiturCodes && legacyDom)

    const canSetStatus =
      isSuper || codes.includes('action.domisili.pelanggaran.status') || (noFiturCodes && legacyDom)

    return {
      fiturReady,
      canLoadMasterList,
      canCreate,
      canEdit,
      canSetStatus
    }
  }, [user, fiturMenuCodes, fiturMenuFetchStatus])
}
