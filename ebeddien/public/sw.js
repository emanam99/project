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

// Event listener untuk notifikasi klik
self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const notificationData = event.notification.data || {}
  const action = event.action

  // Handle action buttons jika ada
  if (action && notificationData.actions) {
    const actionData = notificationData.actions.find(a => a.action === action)
    if (actionData && actionData.url) {
      event.waitUntil(
        clients.openWindow(actionData.url)
      )
      return
    }
  }

  // Default: buka URL dari data atau root
  const urlToOpen = notificationData.url || '/'
  
  event.waitUntil(
    clients.matchAll({
      type: 'window',
      includeUncontrolled: true
    }).then((clientList) => {
      // Cek apakah ada window yang sudah terbuka
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i]
        if (client.url === urlToOpen && 'focus' in client) {
          return client.focus()
        }
      }
      // Jika tidak ada, buka window baru
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen)
      }
    })
  )
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

  const options = {
    body: data.body || 'Anda memiliki notifikasi baru',
    icon: data.icon || 'https://alutsmani.id/gambar/icon/notif.png',
    badge: data.badge || 'https://alutsmani.id/gambar/icon/notif.png',
    tag: data.tag,
    data: data.data || {},
    requireInteraction: data.requireInteraction || false,
    actions: data.actions || [],
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

