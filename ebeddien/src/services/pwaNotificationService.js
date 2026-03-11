/**
 * PWA Notification Service
 * Service untuk mengelola notifikasi PWA yang muncul di notifikasi HP
 */
import { getGambarUrl } from '../config/images'

/**
 * Cek apakah browser mendukung notifikasi
 * @returns {boolean}
 */
export const isNotificationSupported = () => {
  return 'Notification' in window && 'serviceWorker' in navigator
}

/**
 * Cek status permission notifikasi
 * @returns {Promise<string>} 'default' | 'granted' | 'denied'
 */
export const getNotificationPermission = async () => {
  if (!isNotificationSupported()) {
    return 'denied'
  }
  return Notification.permission
}

/**
 * Request permission untuk notifikasi
 * @returns {Promise<string>} 'granted' | 'denied' | 'default'
 */
export const requestNotificationPermission = async () => {
  if (!isNotificationSupported()) {
    throw new Error('Browser tidak mendukung notifikasi')
  }

  if (Notification.permission === 'granted') {
    return 'granted'
  }

  if (Notification.permission === 'denied') {
    throw new Error('Permission notifikasi telah ditolak. Silakan aktifkan di pengaturan browser.')
  }

  const permission = await Notification.requestPermission()
  return permission
}

/**
 * Cek apakah service worker sudah ready
 * @returns {Promise<ServiceWorkerRegistration>}
 */
export const getServiceWorkerRegistration = async () => {
  if (!('serviceWorker' in navigator)) {
    throw new Error('Service Worker tidak didukung')
  }

  const registration = await navigator.serviceWorker.ready
  return registration
}

/**
 * Kirim notifikasi PWA
 * @param {Object} options - Opsi notifikasi
 * @param {string} options.title - Judul notifikasi
 * @param {string} options.body - Isi notifikasi
 * @param {string} options.icon - URL icon (opsional)
 * @param {string} options.badge - URL badge (opsional)
 * @param {string} options.image - URL gambar (opsional)
 * @param {string} options.tag - Tag untuk grouping notifikasi (opsional)
 * @param {boolean} options.requireInteraction - Perlu interaksi user untuk menutup (opsional)
 * @param {number} options.renotify - Re-notify jika tag sama (opsional)
 * @param {boolean} options.silent - Silent notification (opsional)
 * @param {Object} options.data - Data tambahan untuk notifikasi (opsional)
 * @param {Array} options.actions - Array of action buttons (opsional)
 * @param {string} options.dir - Direction text (opsional)
 * @param {string} options.lang - Language (opsional)
 * @param {string} options.vibrate - Vibration pattern (opsional)
 * @returns {Promise<Notification>}
 */
export const showNotification = async (options) => {
  const {
    title,
    body,
    icon = getGambarUrl('/icon/ebeddien192.png'),
    badge = getGambarUrl('/icon/ebeddien128.png'),
    image,
    tag,
    requireInteraction = false,
    renotify = false,
    silent = false,
    data = {},
    actions = [],
    dir = 'ltr',
    lang = 'id',
    vibrate
  } = options

  // Cek permission
  const permission = await getNotificationPermission()
  if (permission !== 'granted') {
    throw new Error('Permission notifikasi belum diberikan')
  }

  // Cek service worker
  const registration = await getServiceWorkerRegistration()

  // Kirim notifikasi via service worker
  const notificationOptions = {
    body,
    icon,
    badge,
    image,
    tag,
    requireInteraction,
    renotify,
    silent,
    data,
    actions,
    dir,
    lang,
    vibrate
  }

  // Hapus undefined values
  Object.keys(notificationOptions).forEach(key => {
    if (notificationOptions[key] === undefined) {
      delete notificationOptions[key]
    }
  })

  await registration.showNotification(title, notificationOptions)
}

/**
 * Tutup semua notifikasi dengan tag tertentu
 * @param {string} tag - Tag notifikasi
 */
export const closeNotificationsByTag = async (tag) => {
  const registration = await getServiceWorkerRegistration()
  const notifications = await registration.getNotifications({ tag })
  notifications.forEach(notification => notification.close())
}

/**
 * Tutup semua notifikasi
 */
export const closeAllNotifications = async () => {
  const registration = await getServiceWorkerRegistration()
  const notifications = await registration.getNotifications()
  notifications.forEach(notification => notification.close())
}

/**
 * Dapatkan semua notifikasi aktif
 * @returns {Promise<Array<Notification>>}
 */
export const getActiveNotifications = async () => {
  const registration = await getServiceWorkerRegistration()
  return await registration.getNotifications()
}

