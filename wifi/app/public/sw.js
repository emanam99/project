/* eslint-disable no-restricted-globals */
/* eslint-disable no-undef */
import { clientsClaim, skipWaiting } from 'workbox-core'
import { createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { NetworkFirst, CacheFirst, StaleWhileRevalidate } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'
import { CacheableResponsePlugin } from 'workbox-cacheable-response'

skipWaiting()
clientsClaim()

/** Samakan dengan APP_VERSION di src/config/version.ts saat naik versi cache. */
const CACHE_REV = '0.2.8'
const IMAGES_CACHE = `wifi-images-${CACHE_REV}`
const ASSETS_CACHE = `wifi-assets-${CACHE_REV}`
const API_CACHE = `wifi-api-${CACHE_REV}`
const HTML_CACHE = `wifi-html-${CACHE_REV}`
const FONT_CACHE = `wifi-fonts-${CACHE_REV}`

precacheAndRoute(self.__WB_MANIFEST || [])

self.addEventListener('activate', (event) => {
  const keep = new Set([IMAGES_CACHE, ASSETS_CACHE, API_CACHE, HTML_CACHE, FONT_CACHE])
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => {
            if (!key.startsWith('wifi-') && !key.startsWith('images-cache') && !key.startsWith('api-cache') && !key.startsWith('html-cache') && !key.startsWith('assets-cache') && !key.startsWith('version-cache')) {
              return false
            }
            return !keep.has(key)
          })
          .map((key) => caches.delete(key)),
      ),
    ),
  )
})

// SPA: navigasi apa pun → shell index.html (offline-friendly)
try {
  const navigationHandler = createHandlerBoundToURL('index.html')
  registerRoute(
    new NavigationRoute(navigationHandler, {
      denylist: [
        /\/api\//,
        /\/gambar\//,
        /version\.json$/i,
        /\.(?:js|css|png|jpg|jpeg|svg|gif|webp|ico|woff2?|webmanifest|map)$/i,
      ],
    }),
  )
} catch (err) {
  // Precache belum siap (dev) — fallback NetworkFirst ke index
  console.warn('[Wifi SW] NavigationRoute belum siap:', err)
}

registerRoute(
  /\/index\.html$/i,
  new NetworkFirst({
    cacheName: HTML_CACHE,
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 8, maxAgeSeconds: 60 * 60 * 24 * 30 }),
    ],
    networkTimeoutSeconds: 4,
  }),
)

registerRoute(
  /version\.json$/i,
  new NetworkFirst({
    cacheName: HTML_CACHE,
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 4, maxAgeSeconds: 60 * 60 }),
    ],
    networkTimeoutSeconds: 3,
  }),
)

registerRoute(
  ({ url }) => url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com',
  new CacheFirst({
    cacheName: FONT_CACHE,
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 }),
    ],
  }),
)

registerRoute(
  /\.(?:js|css|woff2?)$/i,
  new CacheFirst({
    cacheName: ASSETS_CACHE,
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({
        maxEntries: 120,
        maxAgeSeconds: 60 * 60 * 24 * 365,
      }),
    ],
  }),
)

registerRoute(
  /\.(?:png|jpg|jpeg|svg|gif|webp|ico)$/i,
  new CacheFirst({
    cacheName: IMAGES_CACHE,
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({
        maxEntries: 150,
        maxAgeSeconds: 60 * 60 * 24 * 365,
      }),
    ],
  }),
)

registerRoute(
  ({ url }) => /\/gambar\//i.test(url.pathname),
  new CacheFirst({
    cacheName: IMAGES_CACHE,
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({
        maxEntries: 150,
        maxAgeSeconds: 60 * 60 * 24 * 365,
      }),
    ],
  }),
)

// API: online dulu, fallback cache (data yang pernah dibuka tetap bisa dilihat offline)
registerRoute(
  ({ url }) => /\/api\//i.test(url.pathname),
  new NetworkFirst({
    cacheName: API_CACHE,
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({
        maxEntries: 120,
        maxAgeSeconds: 60 * 60 * 24 * 7,
      }),
    ],
    networkTimeoutSeconds: 8,
  }),
)

// Manifest & asset lain
registerRoute(
  /\.webmanifest$/i,
  new StaleWhileRevalidate({
    cacheName: ASSETS_CACHE,
    plugins: [new CacheableResponsePlugin({ statuses: [0, 200] })],
  }),
)

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    skipWaiting()
  }
  if (event.data && event.data.type === 'CLIENT_CLAIM') {
    clientsClaim()
  }
})
