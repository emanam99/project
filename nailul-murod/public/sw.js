const APP_VERSION = 'v2'
const CACHE_HTML = `nm-html-${APP_VERSION}`
const CACHE_ASSET = `nm-asset-${APP_VERSION}`
const CACHE_IMG = `nm-img-${APP_VERSION}`
const PRECACHE = ['/', '/index.html', '/manifest.webmanifest']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_HTML).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting())
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
    const response = await fetch(request)
    const cache = await caches.open(cacheName)
    cache.put(request, response.clone())
    return response
  } catch {
    const cached = await caches.match(request)
    if (cached) return cached
    return caches.match('/index.html')
  }
}

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request)
  if (cached) return cached
  const response = await fetch(request)
  const cache = await caches.open(cacheName)
  cache.put(request, response.clone())
  return response
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return
  const url = new URL(event.request.url)

  if (event.request.mode === 'navigate' || url.pathname.endsWith('.html')) {
    event.respondWith(networkFirst(event.request, CACHE_HTML))
    return
  }

  if (/\.(?:png|jpg|jpeg|gif|svg|webp|ico)$/i.test(url.pathname)) {
    event.respondWith(cacheFirst(event.request, CACHE_IMG))
    return
  }

  if (/\.(?:js|css|woff2?|ttf|eot)$/i.test(url.pathname)) {
    event.respondWith(cacheFirst(event.request, CACHE_ASSET))
    return
  }

  event.respondWith(networkFirst(event.request, CACHE_HTML))
})
