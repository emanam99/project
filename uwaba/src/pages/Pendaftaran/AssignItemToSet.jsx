import { Navigate } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import AssignItemToSet from './components/AssignItemToSet'

function AssignItemToSetPage() {
  const { user } = useAuthStore()
  
  // Check if user is super_admin
  const roleKey = (user?.role_key || user?.level || '').toLowerCase()
  const isSuperAdmin = roleKey === 'super_admin'
  
  // Redirect if not super_admin
  if (!isSuperAdmin) {
    return <Navigate to="/" replace />
  }
  
  return <AssignItemToSet />
}

export default AssignItemToSetPage

