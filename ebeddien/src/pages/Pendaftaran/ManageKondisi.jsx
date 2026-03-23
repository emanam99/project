import { Navigate } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import { userHasSuperAdminAccess } from '../../utils/roleAccess'
import ManageKondisi from './components/ManageKondisi'

function ManageKondisiPage() {
  const { user } = useAuthStore()
  
  // Check if user is super_admin
  const isSuperAdmin = userHasSuperAdminAccess(user)
  
  // Redirect if not super_admin
  if (!isSuperAdmin) {
    return <Navigate to="/" replace />
  }
  
  return <ManageKondisi />
}

export default ManageKondisiPage

