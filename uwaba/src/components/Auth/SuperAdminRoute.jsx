import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import { useEffect, useState } from 'react'

function SuperAdminRoute({ children }) {
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

  // Check if user has super_admin role
  // Prioritize role_key from new role system, fallback to level for backward compatibility
  const roleKey = (user?.role_key || user?.level || '').toLowerCase()
  const isSuperAdmin = roleKey === 'super_admin'
  
  if (!user || !isSuperAdmin) {
    // Don't redirect, just show nothing or error message
    // The route won't be accessible anyway
    return <Navigate to="/" replace />
  }

  // If children provided, render children (for direct component wrapping)
  // Otherwise, render Outlet (for nested routes)
  return children || <Outlet />
}

export default SuperAdminRoute

