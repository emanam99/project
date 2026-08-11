/* eslint-disable no-restricted-globals */
/* eslint-disable no-undef */
import { clientsClaim, skipWaiting } from 'workbox-core'
import { precacheAndRoute } from 'workbox-precaching'
import { registerRoute } from 'workbox-routing'
import { NetworkFirst, CacheFirst, NetworkOnly } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'

// Aktifkan SW baru segera — selaras eBeddien
skipWaiting()
clientsClaim()

precacheAndRoute(self.__WB_MANIFEST || [])

// index.html tidak di-precache — selalu ambil dari jaringan dulu
registerRoute(
  /\/index\.html$/i,
  new NetworkFirst({
    cacheName: 'mb-html-cache',
    plugins: [new ExpirationPlugin({ maxEntries: 10, maxAgeSeconds: 0 })],
    networkTimeoutSeconds: 3,
  })
)

registerRoute(
  /\.html$/i,
  new NetworkFirst({
    cacheName: 'mb-html-cache',
    plugins: [new ExpirationPlugin({ maxEntries: 10, maxAgeSeconds: 0 })],
    networkTimeoutSeconds: 3,
  })
)

registerRoute(
  /\/pwa-release\.txt(?:\?.*)?$/i,
  new NetworkOnly()
)

registerRoute(
  /\/wa\/check/i,
  new NetworkOnly()
)

registerRoute(
  /\/api\/public\/api\/(mybeddian\/v2\/(auth|profil)|payment-transaction|public\/pembayaran|pendaftaran)\//i,
  new NetworkOnly()
)

registerRoute(
  ({ url }) => /\/(ss|icon)\/[^/]+\.(png|jpe?g|webp|svg)$/i.test(url.pathname),
  new CacheFirst({
    cacheName: 'mb-gambar-static',
    plugins: [
      new ExpirationPlugin({ maxEntries: 80, maxAgeSeconds: 60 * 60 * 24 * 30 }),
    ],
  })
)

registerRoute(
  /\.(?:js|css|woff2?)$/i,
  new CacheFirst({
    cacheName: 'mb-assets-cache',
    plugins: [
      new ExpirationPlugin({ maxEntries: 120, maxAgeSeconds: 60 * 60 * 24 * 365 }),
    ],
  })
)

registerRoute(
  /\.(?:png|jpg|jpeg|svg|gif|webp|ico)$/i,
  new CacheFirst({
    cacheName: 'mb-images-cache',
    plugins: [
      new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 365 }),
    ],
  })
)

// Jangan cache respons API (auth, biodata, pembayaran) di SW — NetworkOnly.
registerRoute(
  ({ url }) => /\/api(\/|$)/i.test(url.pathname) || /^https:\/\/api(\d)?\.alutsmani\.id$/i.test(url.hostname),
  new NetworkOnly()
)

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    skipWaiting()
  }
  if (event.data && event.data.type === 'CLIENT_CLAIM') {
    clientsClaim()
  }
})
