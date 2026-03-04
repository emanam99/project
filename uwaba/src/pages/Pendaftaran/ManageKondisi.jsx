import { Navigate } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import ManageKondisi from './components/ManageKondisi'

function ManageKondisiPage() {
  const { user } = useAuthStore()
  
  // Check if user is super_admin
  const roleKey = (user?.role_key || user?.level || '').toLowerCase()
  const isSuperAdmin = roleKey === 'super_admin'
  
  // Redirect if not super_admin
  if (!isSuperAdmin) {
    return <Navigate to="/" replace />
  }
  
  return <ManageKondisi />
}

export default ManageKondisiPage

