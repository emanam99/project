import { Navigate, useParams } from 'react-router-dom'

/** URL lama /manage-users/edit/:id → buka offcanvas di halaman Kelola User */
export default function ManageUsersEditRedirect() {
  const { id } = useParams()
  return <Navigate to="/manage-users" replace state={{ openEditUserId: id != null ? String(id) : '' }} />
}
