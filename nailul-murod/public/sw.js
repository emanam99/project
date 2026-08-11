const APP_VERSION = 'v7'
const CACHE_HTML = `nm-html-${APP_VERSION}`
const CACHE_ASSET = `nm-asset-${APP_VERSION}`
const CACHE_IMG = `nm-img-${APP_VERSION}`

/** Diisi otomatis saat vite build (lihat vite.config) — JS/CSS utama agar offline tersedia */
const PRECACHE_CORE = ['/', '/index.html', '/manifest.webmanifest']
const PRECACHE_BUNDLES = [] // nm-precache-bundles

/**
 * Jangan hapus seluruh Cache Storage di install — itu membuang bundle JS/CSS yang sudah ada
 * sehingga mode pesawat layar putih sampai buka online lagi.
 */
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const htmlCache = await caches.open(CACHE_HTML)
      const assetCache = await caches.open(CACHE_ASSET)
      await Promise.all(PRECACHE_CORE.map((url) => htmlCache.add(url).catch(() => {})))
      await Promise.all(PRECACHE_BUNDLES.map((url) => assetCache.add(url).catch(() => {})))
      await self.skipWaiting()
    })()
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.map((k) =>
            k === CACHE_HTML || k === CACHE_ASSET || k === CACHE_IMG ? Promise.resolve() : caches.delete(k)
          )
        )
      )
      .then(() => self.clients.claim())
  )
})

async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request, { cache: 'no-cache' })
    if (response && response.ok && request.url.startsWith('http')) {
      const cache = await caches.open(cacheName)
      cache.put(request, response.clone())
    }
    return response
  } catch {
    const cached = await caches.match(request)
    if (cached) return cached
    const shell = await caches.match('/index.html')
    if (shell) return shell
    return caches.match('/')
  }
}

async function networkFirstAsset(request, cacheName) {
  const cache = await caches.open(cacheName)
  try {
    const response = await fetch(request, { cache: 'no-cache' })
    if (response && response.ok && request.url.startsWith('http')) {
      const ct = (response.headers.get('content-type') || '').toLowerCase()
      const path = new URL(request.url).pathname
      const looksCode =
        /\.(?:js|mjs|css)$/i.test(path) ||
        ct.includes('javascript') ||
        ct.includes('ecmascript') ||
        ct.includes('text/css')
      if (looksCode) {
        cache.put(request, response.clone())
      }
    }
    return response
  } catch {
    const cached = await cache.match(request)
    if (cached) return cached
    return Response.error()
  }
}

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request)
  if (cached) return cached
  const response = await fetch(request)
  if (response && response.ok && request.url.startsWith('http')) {
    const cache = await caches.open(cacheName)
    cache.put(request, response.clone())
  }
  return response
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return
  const url = new URL(event.request.url)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return

  if (event.request.mode === 'navigate' || url.pathname.endsWith('.html')) {
    event.respondWith(networkFirst(event.request, CACHE_HTML))
    return
  }

  if (/\.(?:png|jpg|jpeg|gif|svg|webp|ico)$/i.test(url.pathname)) {
    event.respondWith(cacheFirst(event.request, CACHE_IMG))
    return
  }

  if (/\.(?:js|css|mjs|woff2?|ttf|eot)$/i.test(url.pathname)) {
    event.respondWith(networkFirstAsset(event.request, CACHE_ASSET))
    return
  }

  // Google Fonts: fetch bawaan browser (bukan cache HTML); selaras CSP connect-src + stylesheet.
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(fetch(event.request))
    return
  }

  event.respondWith(networkFirst(event.request, CACHE_HTML))
})
