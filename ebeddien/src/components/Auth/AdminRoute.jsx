import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
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

  // Check if user has admin or super_admin role
  // Prioritize role_key from new role system, fallback to level for backward compatibility
  const roleKey = (user?.role_key || user?.level || '').toLowerCase()
  const isAdmin = roleKey === 'admin' || roleKey === 'super_admin'
  
  if (!user || !isAdmin) {
    // Don't redirect, just show nothing or error message
    // The route won't be accessible anyway
    return <Navigate to="/" replace />
  }

  return <Outlet />
}

export default AdminRoute

