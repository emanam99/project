import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import { userHasSuperAdminAccess } from '../../utils/roleAccess'
import { buildCanPendaftaranAction } from '../../hooks/usePendaftaranFiturAccess'
import {
  PENDAFTARAN_ADMIN_PATH_TO_CODE,
  PENDAFTARAN_ADMIN_MENU_ONLY_PATHS
} from '../../config/pendaftaranFiturCodes'
import { useMemo } from 'react'

/**
 * Sub-rute admin PSB: item (+ sub) lewat aksi route; padukan-data & pengaturan lewat kode menu induk.
 */
export default function PendaftaranAdminSubRouteGuard() {
  const { pathname } = useLocation()
  const user = useAuthStore((s) => s.user)
  const fiturMenuCodes = useAuthStore((s) => s.fiturMenuCodes)

  const allowed = useMemo(() => {
    const key = pathname.replace(/\/$/, '') || pathname
    if (PENDAFTARAN_ADMIN_MENU_ONLY_PATHS.has(key)) return true
    const code = PENDAFTARAN_ADMIN_PATH_TO_CODE[key]
    if (!code) return false
    const can = buildCanPendaftaranAction(user, fiturMenuCodes)
    return can(code, () => userHasSuperAdminAccess(user))
  }, [pathname, user, fiturMenuCodes])

  if (!allowed) {
    return <Navigate to="/dashboard-pendaftaran" replace />
  }
  return <Outlet />
}
