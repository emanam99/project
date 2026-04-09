import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import { useEffect, useState } from 'react'
import { userHasPermission } from '../../utils/roleAccess'

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

    if (!user || !userHasPermission(user, requiredPermission)) {
      return <Navigate to="/beranda" replace />
    }

    return <Outlet />
  }

  return PermissionRoute
}

export default createPermissionRoute('manage_finance')
