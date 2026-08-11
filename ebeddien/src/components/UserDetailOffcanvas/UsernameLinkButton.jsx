import { useUserDetailOffcanvas } from '../../contexts/UserDetailOffcanvasContext'
import { useUmumFiturAccess } from '../../hooks/useUmumFiturAccess'

/**
 * Username yang bisa diklik → buka UserDetailOffcanvas (mode baca).
 */
export default function UsernameLinkButton({
  userId,
  username,
  className = '',
  stackBaseZIndex = null,
  emptyLabel = 'Belum ada akun login',
  stopPropagation = true
}) {
  const { openUserDetail } = useUserDetailOffcanvas()
  const { canDetailUser } = useUmumFiturAccess()
  const label = (username ?? '').toString().trim()
  const uid = userId != null && userId !== '' ? Number(userId) || userId : null

  if (!label) {
    return <span className={className || 'text-sm text-gray-500 dark:text-gray-400'}>{emptyLabel}</span>
  }

  if (uid == null || uid === '' || Number(uid) <= 0 || !canDetailUser) {
    return (
      <span className={className || 'text-sm font-semibold text-gray-900 dark:text-gray-100 break-all'}>
        @{label}
      </span>
    )
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        if (stopPropagation) {
          e.stopPropagation()
          e.preventDefault()
        }
        openUserDetail(uid, stackBaseZIndex != null ? { stackBaseZIndex } : {})
      }}
      className={
        className ||
        'text-sm font-semibold text-teal-700 dark:text-teal-300 hover:underline break-all text-left'
      }
      title="Lihat detail user (baca saja)"
    >
      @{label}
    </button>
  )
}
