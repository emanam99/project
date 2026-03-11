import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import { useEffect, useState } from 'react'

function SuperAdminRoute({ children }) {
  const { isAuthenticated, user, checkAuth, getEffectiveRole, isRealSuperAdmin } = useAuthStore()
  const [isChecking, setIsChecking] = useState(true)
  const location = useLocation()
  const pathname = location.pathname || ''

  useEffect(() => {
    checkAuth()
    const timer = setTimeout(() => setIsChecking(false), 100)
    return () => clearTimeout(timer)
  }, [checkAuth])

  if (isChecking) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  const realSuperAdmin = isRealSuperAdmin?.() ?? (user && (user?.role_key || user?.level || '').toLowerCase() === 'super_admin')
  const effectiveRole = getEffectiveRole?.() ?? (user?.role_key || user?.level || '').toLowerCase()

  // Halaman Role & Akses selalu boleh diakses oleh super_admin asli (meski sedang "coba sebagai" role lain)
  if (pathname === '/settings/role-akses' && realSuperAdmin) {
    return children || <Outlet />
  }

  // Route super_admin lainnya: hanya boleh jika effectiveRole === super_admin (tidak sedang "coba sebagai" role lain)
  if (!user || effectiveRole !== 'super_admin') {
    return <Navigate to="/" replace />
  }

  return children || <Outlet />
}

export default SuperAdminRoute

