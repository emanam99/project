// Service Worker Registration untuk Public Santri PWA
// Menggunakan skipWaiting dan clientsClaim untuk update cepat

const isLocalhost = Boolean(
  window.location.hostname === 'localhost' ||
  window.location.hostname === '127.0.0.1' ||
  window.location.hostname === ''
)

export function registerSantriPWA(config) {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      const swUrl = '/sw-santri.js'

      // Skip service worker registration in development mode
      const isDevServer = isLocalhost && window.location.port && 
                         window.location.port !== '80' && 
                         window.location.port !== '443' &&
                         !window.location.pathname.includes('/dist/')
      
      if (isDevServer) {
        console.log('Service Worker registration skipped in development mode')
        if (config && config.onSuccess) {
          config.onSuccess(null)
        }
        return
      }

      if (isLocalhost) {
        checkValidServiceWorker(swUrl, config)
      } else {
        registerValidSW(swUrl, config)
      }
    })
  }
}

function registerValidSW(swUrl, config) {
  if (!('serviceWorker' in navigator)) {
    console.warn('Service Worker tidak didukung di browser ini')
    if (config && config.onError) {
      config.onError(new Error('Service Worker tidak didukung'))
    }
    return
  }

  if (!window.isSecureContext && window.location.protocol !== 'https:' && !isLocalhost) {
    console.warn('Service Worker memerlukan HTTPS atau localhost')
    if (config && config.onError) {
      config.onError(new Error('Service Worker memerlukan HTTPS'))
    }
    return
  }

  navigator.serviceWorker
    .register(swUrl, { 
      scope: '/public/',
      updateViaCache: 'none'
    })
    .then((registration) => {
      console.log('✅ Santri Beddian PWA Service Worker registered successfully:', registration.scope)
      
      registration.onupdatefound = () => {
        const installingWorker = registration.installing
        if (installingWorker == null) {
          return
        }
        
        installingWorker.onstatechange = () => {
          if (installingWorker.state === 'installed') {
            if (navigator.serviceWorker.controller) {
              console.log('🔄 New content is available. Reloading...')
              if (config && config.onUpdate) {
                config.onUpdate(registration)
              }
              installingWorker.postMessage({ type: 'SKIP_WAITING' })
            } else {
              console.log('✅ Content cached for offline use.')
              if (config && config.onSuccess) {
                config.onSuccess(registration)
              }
            }
          } else if (installingWorker.state === 'activated') {
            console.log('✅ Service Worker activated')
            if (config && config.onSuccess) {
              config.onSuccess(registration)
            }
          }
        }
        
        installingWorker.onerror = (error) => {
          console.error('❌ Service Worker installation error:', error)
          if (config && config.onError) {
            config.onError(error)
          }
        }
      }

      let refreshing = false
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!refreshing) {
          refreshing = true
          console.log('🔄 Service Worker controller changed, reloading...')
          window.location.reload()
        }
      })

      if (registration.waiting) {
        registration.waiting.postMessage({ type: 'SKIP_WAITING' })
      }
      
      setInterval(() => {
        registration.update()
      }, 60000)
    })
    .catch((error) => {
      console.error('❌ Error during service worker registration:', error)
      const isDevServer = isLocalhost && window.location.port && 
                         window.location.port !== '80' && 
                         window.location.port !== '443' &&
                         !window.location.pathname.includes('/dist/')
      
      if (isDevServer) {
        console.log('⚠️ Service Worker registration skipped in development mode. This is normal.')
        if (config && config.onSuccess) {
          config.onSuccess(null)
        }
      } else {
        console.error('❌ Service Worker registration failed in production')
        if (config && config.onError) {
          config.onError(error)
        }
      }
    })
}

function checkValidServiceWorker(swUrl, config) {
  fetch(swUrl, {
    headers: { 'Service-Worker': 'script' },
  })
    .then((response) => {
      const contentType = response.headers.get('content-type')
      if (
        response.status === 404 ||
        (contentType != null && contentType.indexOf('javascript') === -1)
      ) {
        navigator.serviceWorker.ready.then((registration) => {
          registration.unregister().then(() => {
            window.location.reload()
          })
        })
      } else {
        registerValidSW(swUrl, config)
      }
    })
    .catch((error) => {
      const isDevServer = isLocalhost && window.location.port && 
                         window.location.port !== '80' && 
                         window.location.port !== '443' &&
                         !window.location.pathname.includes('/dist/')
      
      if (isDevServer) {
        console.log('Service Worker not available in development mode. This is normal.')
        if (config && config.onSuccess) {
          config.onSuccess(null)
        }
        return
      }
      console.log('No internet connection found. App is running in offline mode.')
    })
}

export function unregisterSantriPWA() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.ready
      .then((registration) => {
        registration.unregister()
      })
      .catch((error) => {
        console.error(error.message)
      })
  }
}
