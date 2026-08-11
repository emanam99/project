import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { createPortal } from 'react-dom'
import UserDetailOffcanvas from '../components/UserDetailOffcanvas'
import { useOffcanvasBackClose } from '../hooks/useOffcanvasBackClose'
import { DOMISILI_POP_PRIORITY } from '../history/domisiliPopstateStack'
import { useUmumFiturAccess } from '../hooks/useUmumFiturAccess'
import { useNotification } from './NotificationContext'

const UserDetailOffcanvasContext = createContext(null)

const HISTORY_STATE = Object.freeze({ userDetailOffcanvas: true })

/**
 * Detail user global (mode baca saja). Portal ke document.body.
 *
 * @example openUserDetail(userId)
 * @example openUserDetail(userId, { stackBaseZIndex: 10350 })
 */
export function UserDetailOffcanvasProvider({ children }) {
  const location = useLocation()
  const { showNotification } = useNotification()
  const { canDetailUser } = useUmumFiturAccess()
  const [userId, setUserId] = useState(null)
  const [stackBaseZ, setStackBaseZ] = useState(null)

  const closeInternal = useCallback(() => {
    setUserId(null)
    setStackBaseZ(null)
  }, [])

  const closeUserDetail = useOffcanvasBackClose(!!userId, closeInternal, {
    state: HISTORY_STATE,
    useDomisiliPopstateStack: true,
    domisiliStackId: 'user-detail-readonly',
    domisiliStackPriority: DOMISILI_POP_PRIORITY.userDetail
  })

  const openUserDetail = useCallback((id, opts = {}) => {
    if (id == null || id === '') return
    if (!canDetailUser) {
      showNotification('Anda tidak memiliki akses Detail User (Fitur → Umum)', 'error')
      return
    }
    const z = opts.stackBaseZIndex
    const zResolved = typeof z === 'number' && Number.isFinite(z) ? Math.floor(z) : null
    setStackBaseZ(zResolved)
    setUserId(String(id))
  }, [canDetailUser, showNotification])

  useEffect(() => {
    closeInternal()
  }, [location.pathname, closeInternal])

  const value = useMemo(
    () => ({
      openUserDetail,
      closeUserDetail,
      isOpen: !!userId
    }),
    [openUserDetail, closeUserDetail, userId]
  )

  const overlays =
    typeof document !== 'undefined'
      ? createPortal(
          <UserDetailOffcanvas
            isOpen={!!userId}
            onClose={closeUserDetail}
            userId={userId}
            stackBaseZIndex={stackBaseZ}
          />,
          document.body
        )
      : null

  return (
    <UserDetailOffcanvasContext.Provider value={value}>
      {children}
      {overlays}
    </UserDetailOffcanvasContext.Provider>
  )
}

export function useUserDetailOffcanvas() {
  const ctx = useContext(UserDetailOffcanvasContext)
  if (!ctx) {
    throw new Error('useUserDetailOffcanvas harus dipakai di dalam UserDetailOffcanvasProvider')
  }
  return ctx
}
