// Auto-reload ketika ada pembaruan di server (PWA update)
const isLocalhost = Boolean(
  window.location.hostname === 'localhost' ||
  window.location.hostname === '127.0.0.1' ||
  window.location.hostname === ''
)

export function register(config) {
  if (!('serviceWorker' in navigator)) return
  window.addEventListener('load', () => {
    const swUrl = `${import.meta.env.BASE_URL}sw.js`
    const isDevServer = isLocalhost && window.location.port &&
      window.location.port !== '80' && window.location.port !== '443' &&
      !window.location.pathname.includes('/dist/')
    if (isDevServer) {
      if (config?.onSuccess) config.onSuccess(null)
      return
    }
    navigator.serviceWorker
      .register(swUrl, { scope: '/', updateViaCache: 'none' })
      .then((registration) => {
        registration.onupdatefound = () => {
          const installingWorker = registration.installing
          if (!installingWorker) return
          installingWorker.onstatechange = () => {
            if (installingWorker.state === 'installed') {
              if (navigator.serviceWorker.controller) {
                if (config?.onUpdate) config.onUpdate(registration)
                installingWorker.postMessage({ type: 'SKIP_WAITING' })
              } else if (config?.onSuccess) config.onSuccess(registration)
            }
          }
        }
        let refreshing = false
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          if (!refreshing) {
            refreshing = true
            window.location.reload()
          }
        })
        if (registration.waiting) registration.waiting.postMessage({ type: 'SKIP_WAITING' })
        setInterval(() => registration.update(), 60000)
      })
      .catch((err) => {
        if (config?.onError) config.onError(err)
      })
  })
}

export function unregister() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.ready.then((reg) => reg.unregister()).catch(() => {})
  }
}
