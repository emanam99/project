import { Navigate, Outlet } from 'react-router-dom'
import { useAlumniAuthStore } from '../../store/alumniAuthStore'
import { alumniPath } from '../../config/alumniApp'

/**
 * Guard rute alumni (butuh JWT).
 * Redirect biodata↔tercatat diputus di page setelah cek API — hindari loop dari store stale.
 */
function AlumniProtectedRoute() {
  const { isAuthenticated } = useAlumniAuthStore()

  if (!isAuthenticated) {
    return <Navigate to={alumniPath()} replace />
  }

  return <Outlet />
}

export default AlumniProtectedRoute
