import { Navigate } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import { userHasSuperAdminAccess } from '../../utils/roleAccess'
import AssignItemToSet from './components/AssignItemToSet'

function AssignItemToSetPage() {
  const { user } = useAuthStore()
  
  // Check if user is super_admin
  const isSuperAdmin = userHasSuperAdminAccess(user)
  
  // Redirect if not super_admin
  if (!isSuperAdmin) {
    return <Navigate to="/" replace />
  }
  
  return <AssignItemToSet />
}

export default AssignItemToSetPage

