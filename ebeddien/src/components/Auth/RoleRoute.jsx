import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import { useEffect, useState } from 'react'
import { getUserRoleKeysLower, userMatchesAnyAllowedRole, userHasSuperAdminAccess } from '../../utils/roleAccess'

/**
 * RoleRoute - Route guard yang memastikan user memiliki salah satu role yang diizinkan
 * @param {Array<string>} allowedRoles - Array role yang diizinkan mengakses route ini
 * @param {boolean} [allowIfRealSuperAdmin] - Jika true, user dengan role super_admin (gabungan all_roles) tetap boleh
 * @param {ReactNode} children - Optional children untuk direct component wrapping
 */
function RoleRoute({ allowedRoles = [], allowIfRealSuperAdmin = false, children }) {
  const { isAuthenticated, user, checkAuth } = useAuthStore()
  const [isChecking, setIsChecking] = useState(true)
  const location = useLocation()

  useEffect(() => {
    // Check auth on mount
    checkAuth()
    // Give a small delay to ensure checkAuth completes
    const timer = setTimeout(() => {
      setIsChecking(false)
    }, 100)
    
    return () => clearTimeout(timer)
  }, [checkAuth])

  // Show loading while checking
  if (isChecking) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  if (!isAuthenticated) {
    // Save current location to redirect back after login
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  const isSuperAdminUser = userHasSuperAdminAccess(user)
  const hasAllowedRole =
    userMatchesAnyAllowedRole(user, allowedRoles) || (allowIfRealSuperAdmin && isSuperAdminUser)

  // Check if user has one of the allowed roles
  if (!user || !hasAllowedRole) {
    const keys = getUserRoleKeysLower(user)
    const hasAny = (candidates) => candidates.some((r) => keys.includes(r))
    if (keys.length > 0 && allowedRoles.length > 0) {
      if (hasAny(['admin_psb', 'petugas_psb', 'super_admin'])) {
        return <Navigate to="/pendaftaran" replace />
      }
      if (hasAny(['petugas_uwaba', 'admin_uwaba', 'super_admin'])) {
        return <Navigate to="/uwaba" replace />
      }
    }

    return <Navigate to="/profil" replace />
  }

  // If children provided, render children (for direct component wrapping)
  // Otherwise, render Outlet (for nested routes)
  return children || <Outlet />
}

export default RoleRoute

