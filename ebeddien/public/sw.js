/* eslint-disable no-restricted-globals */
/* eslint-disable no-undef */
import { clientsClaim, skipWaiting } from 'workbox-core'
import { precacheAndRoute } from 'workbox-precaching'
import { registerRoute } from 'workbox-routing'
import { NetworkFirst, CacheFirst } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'

// Skip waiting dan claim clients untuk update cepat
skipWaiting()
clientsClaim()

// Precache assets
precacheAndRoute(self.__WB_MANIFEST || [])

// Navigation route dihapus karena index.html tidak di-precache
// (dikonfigurasi dengan globIgnores di vite.config.js)
// Sebagai gantinya, gunakan runtime caching untuk HTML files (lihat di bawah)

// Runtime caching untuk HTML
registerRoute(
  /\/index\.html$/i,
  new NetworkFirst({
    cacheName: 'html-cache',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 10,
        maxAgeSeconds: 0,
      }),
    ],
    networkTimeoutSeconds: 3,
  })
)

registerRoute(
  /\.html$/i,
  new NetworkFirst({
    cacheName: 'html-cache',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 10,
        maxAgeSeconds: 0,
      }),
    ],
    networkTimeoutSeconds: 3,
  })
)

// Runtime caching untuk assets
registerRoute(
  /\.(?:js|css|woff2?)$/i,
  new CacheFirst({
    cacheName: 'assets-cache',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 100,
        maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
      }),
    ],
  })
)

// Runtime caching untuk images
registerRoute(
  /\.(?:png|jpg|jpeg|svg|gif|webp|ico)$/i,
  new CacheFirst({
    cacheName: 'images-cache',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 100,
        maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
      }),
    ],
  })
)

registerRoute(
  /\/gambar\/.*/i,
  new CacheFirst({
    cacheName: 'images-cache',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 100,
        maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
      }),
    ],
  })
)

registerRoute(
  /^https:\/\/alutsmani\.id\/gambar\/.*/i,
  new CacheFirst({
    cacheName: 'images-cache',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 100,
        maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
      }),
    ],
  })
)

// Runtime caching untuk fonts
registerRoute(
  /^https:\/\/fonts\.googleapis\.com\/.*/i,
  new CacheFirst({
    cacheName: 'google-fonts-cache',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 10,
        maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
      }),
    ],
  })
)

registerRoute(
  /^https:\/\/fonts\.gstatic\.com\/.*/i,
  new CacheFirst({
    cacheName: 'gstatic-fonts-cache',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 10,
        maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
      }),
    ],
  })
)

// Runtime caching untuk API
registerRoute(
  /\/backend\/.*/i,
  new NetworkFirst({
    cacheName: 'api-cache',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 50,
        maxAgeSeconds: 60 * 5, // 5 minutes
      }),
    ],
    networkTimeoutSeconds: 10,
  })
)

// ============================================
// PWA NOTIFICATION HANDLERS
// ============================================

function resolveNotificationTargetUrl(raw) {
  const fallback = new URL('/', self.location.origin).href
  if (!raw || raw === '/') {
    return fallback
  }
  if (/^https?:\/\//i.test(String(raw))) {
    return String(raw)
  }
  try {
    return new URL(String(raw), self.location.origin).href
  } catch {
    return fallback
  }
}

function navigateClientsToUrl(urlToOpenResolved) {
  const targetOrigin = (() => {
    try {
      return new URL(urlToOpenResolved).origin
    } catch {
      return self.location.origin
    }
  })()

  return clients.matchAll({
    type: 'window',
    includeUncontrolled: true
  }).then((clientList) => {
    for (let i = 0; i < clientList.length; i++) {
      const client = clientList[i]
      let clientOrigin = ''
      try {
        clientOrigin = new URL(client.url).origin
      } catch {
        continue
      }
      if (clientOrigin === targetOrigin && 'focus' in client) {
        return client.focus().then((c) => {
          if (c && 'navigate' in c && typeof c.navigate === 'function') {
            return c.navigate(urlToOpenResolved)
          }
          return c
        })
      }
    }
    if (clients.openWindow) {
      return clients.openWindow(urlToOpenResolved)
    }
  })
}

// Event listener untuk notifikasi klik
self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const notificationData = event.notification.data || {}
  if (notificationData.no_nav === true || notificationData.no_nav === '1' || notificationData.no_nav === 1) {
    return
  }
  const action = event.action || ''

  let rawUrl = notificationData.url || '/'

  // Tombol "Balas" pada notifikasi chat (data dari push / showNotification)
  if (
    action === 'reply' &&
    notificationData.type === 'chat_message' &&
    notificationData.from_user_id != null
  ) {
    const uid = Number(notificationData.from_user_id)
    if (uid > 0) {
      rawUrl = `/chat?u=${uid}&reply=1`
    }
  } else if (action && Array.isArray(notificationData.actions)) {
    const actionData = notificationData.actions.find((a) => a.action === action)
    if (actionData && actionData.url) {
      rawUrl = actionData.url
    }
  }

  const urlToOpen = resolveNotificationTargetUrl(rawUrl)
  event.waitUntil(navigateClientsToUrl(urlToOpen))
})

// Event listener untuk notifikasi close
self.addEventListener('notificationclose', (event) => {
  // Bisa digunakan untuk tracking atau analytics
  console.log('Notification closed:', event.notification.tag)
})

// Event listener untuk push notification (untuk future use)
self.addEventListener('push', (event) => {
  let data = {}
  
  if (event.data) {
    try {
      data = event.data.json()
    } catch (e) {
      data = { body: event.data.text() }
    }
  }

  const mergedData =
    typeof data.data === 'object' && data.data !== null && !Array.isArray(data.data)
      ? { ...data.data }
      : {}
  const noNav =
    mergedData.no_nav === true || mergedData.no_nav === '1' || mergedData.no_nav === 1
  const topUrl = noNav
    ? ''
    : typeof data.url === 'string' && data.url !== ''
      ? data.url
      : '/'
  if (!noNav && (mergedData.url == null || mergedData.url === '')) {
    mergedData.url = topUrl
  }

  const topActions = Array.isArray(data.actions) ? data.actions : []

  const senderNameRaw =
    typeof data.sender_name === 'string' && data.sender_name.trim()
      ? data.sender_name.trim()
      : typeof mergedData.sender_name === 'string' && mergedData.sender_name.trim()
        ? mergedData.sender_name.trim()
        : ''
  const rawBody = data.body || 'Anda memiliki notifikasi baru'
  const body =
    senderNameRaw &&
    rawBody &&
    !String(rawBody).startsWith(senderNameRaw + ':') &&
    !String(rawBody).startsWith(senderNameRaw + '：')
      ? `${senderNameRaw}: ${rawBody}`
      : rawBody

  const options = {
    body,
    icon: data.icon || 'https://alutsmani.id/gambar/icon/notif.png',
    badge: data.badge || 'https://alutsmani.id/gambar/icon/notif.png',
    tag: data.tag,
    data: mergedData,
    requireInteraction: data.requireInteraction || false,
    actions: topActions,
    image: data.image,
    vibrate: data.vibrate,
    silent: data.silent || false
  }

  event.waitUntil(
    self.registration.showNotification(
      data.title || 'eBeddien',
      options
    )
  )
})

// Message handler untuk komunikasi dengan main thread
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    skipWaiting()
  }
  
  if (event.data && event.data.type === 'CLIENT_CLAIM') {
    clientsClaim()
  }
})

