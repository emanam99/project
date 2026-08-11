import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import { useEffect, useState } from 'react'
import { userHasSuperAdminAccess } from '../../utils/roleAccess'
import { canAccessPathByFitur } from '../../utils/menuPathAccess'

function MainAreaLoader() {
  return (
    <div className="flex w-full justify-center pt-24 sm:pt-32">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600" />
    </div>
  )
}

/**
 * Guard rute terpusat: hak akses halaman mengikuti fiturMenuCodes dari DB (GET /v2/me/fitur-menu).
 * Gantikan RoleRoute / SuperAdminRoute / FinanceRoute untuk rute yang sebelumnya pakai daftar role hardcode.
 */
export default function DatabaseMenuOutlet() {
  const {
    isAuthenticated,
    user,
    checkAuth,
    fetchFiturMenu,
    fetchFiturMenuCatalog,
    fiturMenuCodes,
    fiturMenuFetchStatus
  } = useAuthStore()
  const [gateReady, setGateReady] = useState(false)
  const location = useLocation()

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      try {
        await checkAuth()
        if (cancelled) return
        await Promise.all([
          fetchFiturMenu().catch(() => {}),
          fetchFiturMenuCatalog().catch(() => {})
        ])
      } finally {
        if (!cancelled) setGateReady(true)
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [checkAuth, fetchFiturMenu, fetchFiturMenuCatalog])

  if (!gateReady) {
    return <MainAreaLoader />
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  if (!user) {
    return <Navigate to="/akses-ditolak" replace />
  }

  const superBypassAll =
    userHasSuperAdminAccess(user) &&
    (!Array.isArray(fiturMenuCodes) || fiturMenuCodes.length === 0) &&
    fiturMenuFetchStatus !== 'loading'

  if (superBypassAll) {
    return <Outlet />
  }

  const ok = canAccessPathByFitur(location.pathname, fiturMenuCodes)
  if (!ok) {
    return <Navigate to="/akses-ditolak" replace />
  }

  return <Outlet />
}
