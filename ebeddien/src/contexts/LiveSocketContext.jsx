import { createContext, useContext, useEffect, useState, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { io } from 'socket.io-client'
import { useAuthStore } from '../store/authStore'
import { getLiveServerUrl } from '../config/liveServer'
import { chatUserAPI } from '../services/api'
import { labelForPathFromMenuCatalog } from '../utils/menuCatalogNav'

const LiveSocketContext = createContext(null)

/** Format tampilan: "nama @username" (nama dari pengurus, username dari users). */
function buildNamaUsername(nama, username, fallback = 'User') {
  const n = nama && String(nama).trim()
  const u = username && String(username).trim()
  if (n && u) return `${n} @${u}`
  if (u) return u
  if (n) return n
  return fallback
}

/** Label halaman untuk presence — dari katalog menu DB bila sudah termuat. */
function getHalamanLabel(pathname, catalog) {
  const path = (pathname || '/').replace(/\/$/, '') || '/'
  const label = labelForPathFromMenuCatalog(catalog, path)
  if (label) return label
  return path
}

/** Socket singleton: hindari "WebSocket closed before connection established" (React Strict Mode unmount). */
let liveSocketInstance = null

function getOrCreateSocket() {
  if (liveSocketInstance != null) return liveSocketInstance
  liveSocketInstance = io(getLiveServerUrl(), {
    // WebSocket dulu: hindari latensi long-polling di awal sesi (chat & presence lebih responsif).
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 1000,
  })
  return liveSocketInstance
}

/**
 * Provider: satu socket untuk presence + chat. Menyimpan daftar user online (users_updated).
 */
export function LiveSocketProvider({ children }) {
  const [onlineUsers, setOnlineUsers] = useState([])
  const [isConnected, setIsConnected] = useState(false)
  const [socket, setSocket] = useState(null)
  const location = useLocation()
  const user = useAuthStore((s) => s.user)

  useEffect(() => {
    const s = getOrCreateSocket()
    setSocket(s)

    const onConnect = () => {
      setIsConnected(true)
      const halaman = getHalamanLabel(location.pathname)
      if (user?.id) {
        const usersId = user?.users_id != null ? String(user.users_id) : null
        const displayName = buildNamaUsername(user?.nama, user?.username, 'User')
        if (usersId) {
          s.emit('connect_user', { user_id: usersId, nama: displayName, halaman })
        } else {
          chatUserAPI.getMe().then((r) => {
            if (r?.success && r?.my_user_id != null) {
              const name = (r?.display_name && String(r.display_name).trim()) || buildNamaUsername(r?.nama, r?.username, 'User')
              s.emit('connect_user', { user_id: String(r.my_user_id), nama: name, halaman })
            }
          }).catch(() => {})
        }
      } else {
        s.emit('connect_visitor', { halaman })
      }
    }

    const onUsersUpdated = (data) => {
      setOnlineUsers(Array.isArray(data?.users) ? data.users : [])
    }

    s.on('connect', onConnect)
    s.on('users_updated', onUsersUpdated)
    s.on('disconnect', () => setIsConnected(false))
    s.on('connect_error', () => setIsConnected(false))

    if (s.connected) onConnect()

    return () => {
      s.off('connect', onConnect)
      s.off('users_updated', onUsersUpdated)
      s.off('disconnect')
      s.off('connect_error')
      // Jangan disconnect: socket dipakai ulang (strict mode / navigasi)
    }
  }, [])

  // Presence: pakai users_id dari login (users.id); fallback getMe() bila belum ada (session lama).
  const fiturMenuCatalog = useAuthStore((s) => s.fiturMenuCatalog)
  useEffect(() => {
    if (!socket?.connected) return
    const halaman = getHalamanLabel(location.pathname, fiturMenuCatalog)
    if (user?.id) {
      const usersId = user?.users_id != null ? String(user.users_id) : null
      const displayName = buildNamaUsername(user?.nama, user?.username, 'User')
      if (usersId) {
        socket.emit('connect_user', { user_id: usersId, nama: displayName, halaman })
      } else {
        chatUserAPI.getMe().then((r) => {
          if (r?.success && r?.my_user_id != null) {
            const name = (r?.display_name && String(r.display_name).trim()) || buildNamaUsername(r?.nama, r?.username, 'User')
            socket.emit('connect_user', { user_id: String(r.my_user_id), nama: name, halaman })
          }
        }).catch(() => {})
      }
    } else {
      socket.emit('connect_visitor', { halaman })
    }
  }, [socket, user?.id, user?.users_id, user?.nama, user?.username, location.pathname, fiturMenuCatalog])

  const value = {
    socket,
    onlineUsers,
    isConnected,
  }

  return (
    <LiveSocketContext.Provider value={value}>
      {children}
    </LiveSocketContext.Provider>
  )
}

export function useLiveSocket() {
  const ctx = useContext(LiveSocketContext)
  return ctx
}
