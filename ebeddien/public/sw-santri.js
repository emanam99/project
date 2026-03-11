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

// Runtime caching untuk HTML
registerRoute(
  /\/public\/.*\.html$/i,
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

// Runtime caching untuk API (public santri)
registerRoute(
  /\/backend\/public\/.*/i,
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

// Message handler untuk komunikasi dengan main thread
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    skipWaiting()
  }
  
  if (event.data && event.data.type === 'CLIENT_CLAIM') {
    clientsClaim()
  }
})
