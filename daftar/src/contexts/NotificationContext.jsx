import { createContext, useContext, useState, useCallback } from 'react'
import { AnimatePresence } from 'framer-motion'
import Notification from '../components/Notification/Notification'

const NotificationContext = createContext(null)

export function NotificationProvider({ children }) {
  const [notifications, setNotifications] = useState([])
  
  const showNotification = useCallback((message, type = 'info', duration = null) => {
    // Hapus notifikasi yang sudah ada (hanya satu notifikasi pada satu waktu)
    setNotifications([])
    
    const id = Date.now()
    
    // Set duration default berdasarkan type
    if (duration === null) {
      duration = type === 'success' ? 3000 : type === 'loading' ? null : 5000
    }
    
    setNotifications([{ id, message, type, duration }])
    
    // Return function untuk close notification
    return () => {
      setNotifications(prev => prev.filter(n => n.id !== id))
    }
  }, [])
  
  const closeNotification = useCallback((id) => {
    setNotifications(prev => prev.filter(n => n.id !== id))
  }, [])
  
  const clearAll = useCallback(() => {
    setNotifications([])
  }, [])
  
  return (
    <NotificationContext.Provider value={{ showNotification, closeNotification, clearAll }}>
      {children}
      <AnimatePresence>
        {notifications.map(notification => (
          <Notification
            key={notification.id}
            message={notification.message}
            type={notification.type}
            duration={notification.duration}
            onClose={() => closeNotification(notification.id)}
          />
        ))}
      </AnimatePresence>
    </NotificationContext.Provider>
  )
}

export function useNotification() {
  const context = useContext(NotificationContext)
  if (!context) {
    throw new Error('useNotification must be used within NotificationProvider')
  }
  return context
}
