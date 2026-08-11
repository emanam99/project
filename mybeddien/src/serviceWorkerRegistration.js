// Registrasi SW — selaras eBeddien (skipWaiting, polling update, auto-reload)

function getSwUrlAndScope() {
  const base =
    typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL != null
      ? String(import.meta.env.BASE_URL)
      : '/'
  const normalized = base.endsWith('/') ? base : `${base}/`
  return { swUrl: `${normalized}sw.js`, scope: normalized }
}

const isLocalhost = Boolean(
  window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1' ||
    window.location.hostname === ''
)

function isDevServer() {
  return (
    isLocalhost &&
    window.location.port &&
    window.location.port !== '80' &&
    window.location.port !== '443' &&
    !window.location.pathname.includes('/dist/')
  )
}

export function register(config) {
  if (!('serviceWorker' in navigator)) return

  const run = () => {
    const { swUrl, scope } = getSwUrlAndScope()

    if (isDevServer()) {
      Promise.all([
        navigator.serviceWorker.getRegistrations().then((regs) =>
          Promise.all(regs.map((r) => r.unregister()))
        ),
        typeof caches !== 'undefined'
          ? caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
          : Promise.resolve(),
      ]).finally(() => {
        if (config?.onSuccess) config.onSuccess(null)
      })
      return
    }

    if (isLocalhost) {
      checkValidServiceWorker(swUrl, scope, config)
    } else {
      registerValidSW(swUrl, scope, config)
    }
  }

  if (document.readyState === 'complete') {
    run()
  } else {
    window.addEventListener('load', run)
  }
}

function registerValidSW(swUrl, scope, config) {
  navigator.serviceWorker
    .register(swUrl, { scope, updateViaCache: 'none' })
    .then((registration) => {
      console.log('[myBeddien] Service Worker registered:', registration.scope)

      registration.onupdatefound = () => {
        const installingWorker = registration.installing
        if (!installingWorker) return

        installingWorker.onstatechange = () => {
          if (installingWorker.state === 'installed') {
            if (navigator.serviceWorker.controller) {
              console.log('[myBeddien] Pembaruan tersedia — mengaktifkan SW baru…')
              if (config?.onUpdate) config.onUpdate(registration)
              installingWorker.postMessage({ type: 'SKIP_WAITING' })
            } else if (config?.onSuccess) {
              config.onSuccess(registration)
            }
          } else if (installingWorker.state === 'activated' && config?.onSuccess) {
            config.onSuccess(registration)
          }
        }

        installingWorker.onerror = (error) => {
          console.error('[myBeddien] Service Worker install error:', error)
          if (config?.onError) config.onError(error)
        }
      }

      let refreshing = false
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!refreshing) {
          refreshing = true
          console.log('[myBeddien] SW controller changed — reload')
          window.location.reload()
        }
      })

      if (registration.waiting) {
        registration.waiting.postMessage({ type: 'SKIP_WAITING' })
      }

      try {
        registration.update()
      } catch {
        /* noop */
      }

      setInterval(() => {
        try {
          registration.update()
        } catch {
          /* noop */
        }
      }, 60_000)

      if (config?.onSuccess) config.onSuccess(registration)
    })
    .catch((error) => {
      console.error('[myBeddien] Service Worker registration failed:', error)
      if (isDevServer()) {
        if (config?.onSuccess) config.onSuccess(null)
        return
      }
      if (config?.onError) config.onError(error)
    })
}

function checkValidServiceWorker(swUrl, scope, config) {
  fetch(swUrl, { headers: { 'Service-Worker': 'script' } })
    .then((response) => {
      const contentType = response.headers.get('content-type')
      if (
        response.status === 404 ||
        (contentType != null && contentType.indexOf('javascript') === -1)
      ) {
        navigator.serviceWorker.ready.then((registration) => {
          registration.unregister().then(() => window.location.reload())
        })
      } else {
        registerValidSW(swUrl, scope, config)
      }
    })
    .catch(() => {
      if (isDevServer()) {
        if (config?.onSuccess) config.onSuccess(null)
        return
      }
      console.log('[myBeddien] Offline — SW tidak dicek.')
    })
}

export function unregister() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.ready
      .then((registration) => registration.unregister())
      .catch(() => {})
  }
}
