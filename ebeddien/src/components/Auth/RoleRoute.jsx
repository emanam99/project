import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import { useEffect, useState } from 'react'

/**
 * RoleRoute - Route guard yang memastikan user memiliki salah satu role yang diizinkan
 * @param {Array<string>} allowedRoles - Array role yang diizinkan mengakses route ini
 * @param {ReactNode} children - Optional children untuk direct component wrapping
 */
function RoleRoute({ allowedRoles = [], children }) {
  const { isAuthenticated, user, checkAuth, getEffectiveRole } = useAuthStore()
  const [isChecking, setIsChecking] = useState(true)
  const location = useLocation()
  const effectiveRole = getEffectiveRole?.() ?? (user?.role_key || user?.level || '').toLowerCase()

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

  // Cek akses pakai effectiveRole (super_admin yang "coba sebagai" role X dianggap sebagai role X)
  const hasAllowedRole = user && allowedRoles.length > 0 && allowedRoles.map(r => r.toLowerCase()).includes(effectiveRole)

  // Check if user has one of the allowed roles
  if (!user || !hasAllowedRole) {
    // Redirect to first accessible page or home
    // Redirect berdasarkan effectiveRole
    if (effectiveRole && allowedRoles.length > 0) {
      if (['admin_psb', 'petugas_psb', 'super_admin'].includes(effectiveRole)) {
        return <Navigate to="/pendaftaran" replace />
      }
      if (['petugas_uwaba', 'admin_uwaba', 'super_admin'].includes(effectiveRole)) {
        return <Navigate to="/uwaba" replace />
      }
    }
    
    // Default redirect to profil or login
    return <Navigate to="/profil" replace />
  }

  // If children provided, render children (for direct component wrapping)
  // Otherwise, render Outlet (for nested routes)
  return children || <Outlet />
}

export default RoleRoute

