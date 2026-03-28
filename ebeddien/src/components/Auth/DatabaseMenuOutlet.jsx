import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import { useEffect, useState } from 'react'
import { userHasSuperAdminAccess } from '../../utils/roleAccess'
import { canAccessPathByFitur } from '../../utils/menuPathAccess'

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
    fiturMenuCodes,
    fiturMenuFetchStatus
  } = useAuthStore()
  const [isChecking, setIsChecking] = useState(true)
  const location = useLocation()

  useEffect(() => {
    checkAuth()
    fetchFiturMenu().catch(() => {})
    const timer = setTimeout(() => setIsChecking(false), 100)
    return () => clearTimeout(timer)
  }, [checkAuth, fetchFiturMenu])

  if (isChecking) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600" />
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  if (!user) {
    return <Navigate to="/beranda" replace />
  }

  if (userHasSuperAdminAccess(user)) {
    return <Outlet />
  }

  if (fiturMenuFetchStatus === 'loading') {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600" />
      </div>
    )
  }

  const ok = canAccessPathByFitur(location.pathname, fiturMenuCodes)
  if (!ok) {
    return <Navigate to="/beranda" replace />
  }

  return <Outlet />
}
