import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import { useEffect, useState } from 'react'

// Factory function untuk membuat PermissionRoute dengan permission tertentu
export function createPermissionRoute(requiredPermission) {
  function PermissionRoute() {
    const { isAuthenticated, user, checkAuth } = useAuthStore()
    const [isChecking, setIsChecking] = useState(true)
    const location = useLocation()

    useEffect(() => {
      checkAuth()
      const timer = setTimeout(() => {
        setIsChecking(false)
      }, 100)

      return () => clearTimeout(timer)
    }, [checkAuth])

    if (isChecking) {
      return null
    }

    if (!isAuthenticated) {
      return <Navigate to="/login" state={{ from: location }} replace />
    }

    if (!user || !user.permissions || !Array.isArray(user.permissions)) {
      return <Navigate to="/" replace />
    }

    const hasPermission = user.permissions.includes(requiredPermission)
    if (!hasPermission) {
      return <Navigate to="/" replace />
    }

    return <Outlet />
  }

  return PermissionRoute
}

export default createPermissionRoute('manage_finance')
