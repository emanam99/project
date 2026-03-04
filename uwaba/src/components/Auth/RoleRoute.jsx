import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import { useEffect, useState } from 'react'

/**
 * RoleRoute - Route guard yang memastikan user memiliki salah satu role yang diizinkan
 * @param {Array<string>} allowedRoles - Array role yang diizinkan mengakses route ini
 * @param {ReactNode} children - Optional children untuk direct component wrapping
 */
function RoleRoute({ allowedRoles = [], children }) {
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

  // Helper untuk cek role - support multiple roles
  const hasRole = (roles) => {
    if (!user || !roles || !Array.isArray(roles)) {
      return false
    }
    
    // Cek dari all_roles (array semua role user) jika ada
    if (user.all_roles && Array.isArray(user.all_roles) && user.all_roles.length > 0) {
      const userRoles = user.all_roles.map(r => (r || '').toLowerCase()).filter(r => r)
      const allowedRolesLower = roles.map(r => r.toLowerCase())
      return userRoles.some(userRole => allowedRolesLower.includes(userRole))
    }
    
    // Fallback: cek role_key utama
    const userRole = (user.role_key || user.level || '').toLowerCase()
    return roles.map(r => r.toLowerCase()).includes(userRole)
  }

  // Check if user has one of the allowed roles
  if (!user || !hasRole(allowedRoles)) {
    // Redirect to first accessible page or home
    // Try to find first accessible menu based on user roles
    if (user) {
      // Check if user has access to pendaftaran
      if (hasRole(['admin_psb', 'petugas_psb', 'super_admin'])) {
        return <Navigate to="/pendaftaran" replace />
      }
      // Check if user has access to uwaba
      if (hasRole(['petugas_uwaba', 'admin_uwaba', 'super_admin'])) {
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

