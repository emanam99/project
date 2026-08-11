import { useMemo } from 'react'
import { useAuthStore } from '../store/authStore'
import { getUserRoleKeysLower, userHasSuperAdminAccess } from '../utils/roleAccess'

const LEGACY_ALUMNI_ROLES = [
  'super_admin',
  'tarbiyah',
  'admin_daerah',
  'admin_domisili',
  'kapdar',
  'wakapdar',
  'admin_psb',
  'petugas_psb',
]

function userMatchesLegacyAlumni(user) {
  if (!user) return false
  const keys = getUserRoleKeysLower(user)
  return keys.some((k) => LEGACY_ALUMNI_ROLES.includes(k))
}

/**
 * Hak halaman Data Alumni + aksi edit / hapus / status.
 * Sumber: /me/fitur-menu; tanpa assignment → fallback role legacy.
 */
export function useAlumniFiturAccess() {
  const user = useAuthStore((s) => s.user)
  const fiturMenuCodes = useAuthStore((s) => s.fiturMenuCodes)
  const fiturMenuFetchStatus = useAuthStore((s) => s.fiturMenuFetchStatus)

  return useMemo(() => {
    const codes = Array.isArray(fiturMenuCodes) ? fiturMenuCodes : []
    const isSuper = userHasSuperAdminAccess(user)
    const legacy = userMatchesLegacyAlumni(user)
    const fiturReady = fiturMenuFetchStatus === 'ok'
    const noFiturCodes = fiturReady && codes.length === 0
    const apiHasAlumniAction = fiturReady && codes.some((c) => String(c).startsWith('action.alumni.'))

    const canView =
      isSuper ||
      codes.includes('menu.alumni') ||
      codes.some((c) => String(c).startsWith('action.alumni.')) ||
      (noFiturCodes && legacy)

    const canEdit =
      isSuper ||
      codes.includes('action.alumni.edit') ||
      (noFiturCodes && legacy) ||
      (!apiHasAlumniAction && canView && legacy)

    const canDelete =
      isSuper ||
      codes.includes('action.alumni.hapus') ||
      (noFiturCodes && legacy) ||
      (!apiHasAlumniAction && canView && legacy)

    const canToggleStatus =
      isSuper ||
      codes.includes('action.alumni.status') ||
      (noFiturCodes && legacy) ||
      (!apiHasAlumniAction && canView && legacy)

    return {
      fiturReady,
      canView,
      canEdit,
      canDelete,
      canToggleStatus,
    }
  }, [user, fiturMenuCodes, fiturMenuFetchStatus])
}
