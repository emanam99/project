import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import { userMatchesAnyAllowedRole } from '../../utils/roleAccess'
import { useEffect, useState } from 'react'

// Factory function untuk membuat PermissionRoute dengan permission tertentu
export function createPermissionRoute(requiredPermission) {
  function PermissionRoute() {
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

    // Show loading or nothing while checking
    if (isChecking) {
      return null // or a loading spinner
    }

    if (!isAuthenticated) {
      // Save current location to redirect back after login
      return <Navigate to="/login" state={{ from: location }} replace />
    }

    // Check if user has the required permission
    if (!user || !user.permissions || !Array.isArray(user.permissions)) {
      // Redirect to dashboard if user doesn't have permissions array
      return <Navigate to="/" replace />
    }

    const hasPermission = user.permissions.includes(requiredPermission)
    if (!hasPermission) {
      // Redirect to dashboard if user doesn't have permission
      return <Navigate to="/" replace />
    }

    return <Outlet />
  }

  return PermissionRoute
}

// Route Keuangan: harus punya permission manage_finance DAN role admin_uwaba atau super_admin (bukan admin_umroh)
export function createFinanceRoute() {
  const requiredPermission = 'manage_finance'
  const allowedRoles = ['admin_uwaba', 'super_admin']

  function FinanceRoute() {
    const { isAuthenticated, user, checkAuth } = useAuthStore()
    const [isChecking, setIsChecking] = useState(true)
    const location = useLocation()

    useEffect(() => {
      checkAuth()
      const timer = setTimeout(() => setIsChecking(false), 100)
      return () => clearTimeout(timer)
    }, [checkAuth])

    if (isChecking) return null
    if (!isAuthenticated) {
      return <Navigate to="/login" state={{ from: location }} replace />
    }
    if (!user || !user.permissions || !Array.isArray(user.permissions)) {
      return <Navigate to="/" replace />
    }
    const hasPermission = user.permissions.includes(requiredPermission)
    const hasRole = userMatchesAnyAllowedRole(user, allowedRoles)
    if (!hasPermission || !hasRole) {
      return <Navigate to="/" replace />
    }
    return <Outlet />
  }
  return FinanceRoute
}

// Export default untuk manage_finance (untuk backward compatibility atau convenience)
export default createPermissionRoute('manage_finance')
