import { useState, useEffect, useCallback } from 'react'
import {
  isNotificationSupported,
  getNotificationPermission,
  requestNotificationPermission,
  showNotification,
  closeAllNotifications,
  getActiveNotifications
} from '../services/pwaNotificationService'

/**
 * Custom hook untuk mengelola PWA notifications
 * @returns {Object} State dan functions untuk notifikasi PWA
 */
export const usePWANotification = () => {
  const [isSupported, setIsSupported] = useState(false)
  const [permission, setPermission] = useState('default')
  const [isRequesting, setIsRequesting] = useState(false)
  const [activeNotifications, setActiveNotifications] = useState([])

  // Cek support dan permission saat mount
  useEffect(() => {
    const checkSupport = () => {
      const supported = isNotificationSupported()
      setIsSupported(supported)

      if (supported) {
        getNotificationPermission().then(perm => {
          setPermission(perm)
        })
      }
    }

    checkSupport()

    // Update permission jika berubah
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        getNotificationPermission().then(perm => {
          setPermission(perm)
        })
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  // Load active notifications
  const loadActiveNotifications = useCallback(async () => {
    if (!isSupported || permission !== 'granted') {
      return
    }

    try {
      const notifications = await getActiveNotifications()
      setActiveNotifications(notifications)
    } catch (error) {
      console.error('Error loading active notifications:', error)
    }
  }, [isSupported, permission])

  // Load notifications saat permission granted
  useEffect(() => {
    if (permission === 'granted') {
      loadActiveNotifications()
    }
  }, [permission, loadActiveNotifications])

  /**
   * Request permission untuk notifikasi
   */
  const requestPermission = useCallback(async () => {
    if (!isSupported) {
      throw new Error('Browser tidak mendukung notifikasi')
    }

    setIsRequesting(true)
    try {
      const perm = await requestNotificationPermission()
      setPermission(perm)
      return perm
    } catch (error) {
      console.error('Error requesting permission:', error)
      throw error
    } finally {
      setIsRequesting(false)
    }
  }, [isSupported])

  /**
   * Kirim notifikasi
   * @param {Object} options - Opsi notifikasi
   */
  const sendNotification = useCallback(async (options) => {
    if (!isSupported) {
      throw new Error('Browser tidak mendukung notifikasi')
    }

    if (permission !== 'granted') {
      // Auto request permission jika belum granted
      const perm = await requestPermission()
      if (perm !== 'granted') {
        throw new Error('Permission notifikasi diperlukan untuk mengirim notifikasi')
      }
    }

    try {
      await showNotification(options)
      // Reload active notifications setelah kirim
      await loadActiveNotifications()
    } catch (error) {
      console.error('Error sending notification:', error)
      throw error
    }
  }, [isSupported, permission, requestPermission, loadActiveNotifications])

  /**
   * Tutup semua notifikasi
   */
  const closeAll = useCallback(async () => {
    try {
      await closeAllNotifications()
      setActiveNotifications([])
    } catch (error) {
      console.error('Error closing notifications:', error)
    }
  }, [])

  return {
    // State
    isSupported,
    permission,
    isRequesting,
    activeNotifications,
    isGranted: permission === 'granted',
    isDenied: permission === 'denied',
    isDefault: permission === 'default',

    // Functions
    requestPermission,
    sendNotification,
    closeAll,
    loadActiveNotifications
  }
}

