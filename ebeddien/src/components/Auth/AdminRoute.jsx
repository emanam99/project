import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import { userHasAdminRouteAccess } from '../../utils/roleAccess'
import { useEffect, useState } from 'react'

function AdminRoute() {
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

  const isAdmin = userHasAdminRouteAccess(user)
  
  if (!user || !isAdmin) {
    // Don't redirect, just show nothing or error message
    // The route won't be accessible anyway
    return <Navigate to="/beranda" replace />
  }

  return <Outlet />
}

export default AdminRoute

