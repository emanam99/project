import { createContext, useContext, useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { io } from 'socket.io-client'
import { useAuthStore } from '../store/authStore'
import { getLiveServerUrl } from '../config/liveServer'
import { chatUserAPI } from '../services/api'

const LiveSocketContext = createContext(null)

/** Socket singleton: hindari "WebSocket closed before connection established" (React Strict Mode unmount). */
let liveSocketInstance = null

function getOrCreateSocket() {
  if (liveSocketInstance != null) return liveSocketInstance
  liveSocketInstance = io(getLiveServerUrl(), {
    transports: ['polling', 'websocket'],
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
      const halaman = location.pathname || '/'
      if (user?.id) {
        s.emit('connect_user', {
          user_id: String(user.id),
          nama: user.nama || user.username || 'User',
          halaman,
        })
        chatUserAPI.getMe().then((r) => {
          if (r?.success && r?.my_user_id != null) {
            s.emit('connect_user', {
              user_id: String(r.my_user_id),
              nama: user.nama || user.username || 'User',
              halaman,
            })
          }
        }).catch(() => {})
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

  // Presence: daftar dengan users.id agar receive_message chat sampai (getSocketIdByUserId pakai users.id)
  useEffect(() => {
    if (!socket?.connected) return
    const halaman = location.pathname || '/'
    if (user?.id) {
      socket.emit('connect_user', {
        user_id: String(user.id),
        nama: user.nama || user.username || 'User',
        halaman,
      })
      chatUserAPI.getMe().then((r) => {
        if (r?.success && r?.my_user_id != null) {
          socket.emit('connect_user', {
            user_id: String(r.my_user_id),
            nama: user.nama || user.username || 'User',
            halaman,
          })
        }
      }).catch(() => {})
    } else {
      socket.emit('connect_visitor', { halaman })
    }
  }, [socket, user?.id, user?.nama, user?.username, location.pathname])

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
