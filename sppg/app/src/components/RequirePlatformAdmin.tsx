import { Navigate, Outlet } from 'react-router-dom'
import { getStoredUser, isLoggedIn, isPlatformAdminRole } from '../utils/auth'

export default function RequirePlatformAdmin() {
  if (!isLoggedIn()) {
    return <Navigate to="/login" replace />
  }
  const user = getStoredUser()
  if (!isPlatformAdminRole(user?.role)) {
    return <Navigate to="/login?error=Akses%20admin%20platform%20ditolak" replace />
  }
  return <Outlet />
}
