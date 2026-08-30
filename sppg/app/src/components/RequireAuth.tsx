import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { getStoredUser, hasAppAccess, isLoggedIn, isPendingRole, isSubscriptionActive } from '../utils/auth'

export default function RequireAuth() {
  const location = useLocation()
  const waiting = location.pathname === '/menunggu-akses'
  const langganan = location.pathname === '/langganan'
  const profil = location.pathname === '/profil-sppg'

  if (!isLoggedIn()) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  const user = getStoredUser()
  const pending = isPendingRole(user?.role)

  if (pending && !waiting) {
    return <Navigate to="/menunggu-akses" replace />
  }

  if (!pending && waiting) {
    return <Navigate to="/dashboard" replace />
  }

  if (!pending && !hasAppAccess(user?.role)) {
    return <Navigate to="/menunggu-akses" replace />
  }

  if (!pending && !isSubscriptionActive() && !langganan && !profil && !waiting) {
    return <Navigate to="/langganan" replace />
  }

  return <Outlet />
}
