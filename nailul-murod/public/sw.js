const APP_VERSION = 'v8'
const CACHE_HTML = `nm-html-${APP_VERSION}`
const CACHE_ASSET = `nm-asset-${APP_VERSION}`
const CACHE_IMG = `nm-img-${APP_VERSION}`
const CACHE_FONT = `nm-font-${APP_VERSION}`

/** Diisi otomatis saat vite build (lihat vite.config) — JS/CSS utama agar offline tersedia */
const PRECACHE_CORE = ['/', '/index.html', '/manifest.webmanifest']
const PRECACHE_BUNDLES = [] // nm-precache-bundles
const PRECACHE_FONTS = [
  'https://fonts.googleapis.com/css2?family=Amiri:ital,wght@0,400;0,700;1,400&family=Lateef:wght@200;300;400;500;600;700;800&family=Scheherazade+New:wght@400;500;600;700&family=Roboto:ital,wght@0,400;0,500;0,700&family=Inter:wght@400;600;700&display=swap',
]

/**
 * Jangan hapus seluruh Cache Storage di install — itu membuang bundle JS/CSS yang sudah ada
 * sehingga mode pesawat layar putih sampai buka online lagi.
 */
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const htmlCache = await caches.open(CACHE_HTML)
      const assetCache = await caches.open(CACHE_ASSET)
      const fontCache = await caches.open(CACHE_FONT)
      await Promise.all(PRECACHE_CORE.map((url) => htmlCache.add(url).catch(() => {})))
      await Promise.all(PRECACHE_BUNDLES.map((url) => assetCache.add(url).catch(() => {})))
      await Promise.all(PRECACHE_FONTS.map((url) => fontCache.add(url).catch(() => {})))
      try {
        const cssRes = await fetch(PRECACHE_FONTS[0])
        if (cssRes.ok) {
          const css = await cssRes.text()
          const woffUrls = [...css.matchAll(/url\((https:\/\/fonts\.gstatic\.com[^)]+)\)/g)].map((m) =>
            m[1].replace(/['"]/g, '')
          )
          await Promise.all([...new Set(woffUrls)].map((u) => fontCache.add(u).catch(() => {})))
        }
      } catch {
        // install tetap lanjut; font akan ter-cache saat online pertama
      }
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
            k === CACHE_HTML || k === CACHE_ASSET || k === CACHE_IMG || k === CACHE_FONT
              ? Promise.resolve()
              : caches.delete(k)
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

  // Google Fonts: cache-first agar font pembaca tersedia offline setelah pernah online
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(cacheFirst(event.request, CACHE_FONT))
    return
  }

  event.respondWith(networkFirst(event.request, CACHE_HTML))
})
