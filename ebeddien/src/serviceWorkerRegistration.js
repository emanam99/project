// Modern Service Worker Registration
// Menggunakan skipWaiting dan clientsClaim untuk update cepat

const isLocalhost = Boolean(
  window.location.hostname === 'localhost' ||
  window.location.hostname === '127.0.0.1' ||
  window.location.hostname === ''
)

export function register(config) {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      const swUrl = '/sw.js'

      // Skip service worker registration in development mode (localhost with dev server)
      // Service worker hanya aktif di production build
      // Check if running on Vite dev server (common ports: 5173, 3000, 8080, etc.)
      const isDevServer = isLocalhost && window.location.port && 
                         window.location.port !== '80' && 
                         window.location.port !== '443' &&
                         !window.location.pathname.includes('/dist/')
      
      if (isDevServer) {
        // Development mode - skip registration
        console.log('Service Worker registration skipped in development mode')
        if (config && config.onSuccess) {
          // Simulate success for development
          config.onSuccess(null)
        }
        return
      }

      if (isLocalhost) {
        // This is running on localhost. Let's check if a service worker still exists or not.
        checkValidServiceWorker(swUrl, config)
      } else {
        // Is not localhost. Just register service worker
        registerValidSW(swUrl, config)
      }
    })
  }
}

function registerValidSW(swUrl, config) {
  // Check if service worker is supported
  if (!('serviceWorker' in navigator)) {
    console.warn('Service Worker tidak didukung di browser ini')
    if (config && config.onError) {
      config.onError(new Error('Service Worker tidak didukung'))
    }
    return
  }

  // Check if we're in a secure context (HTTPS or localhost)
  if (!window.isSecureContext && window.location.protocol !== 'https:' && !isLocalhost) {
    console.warn('Service Worker memerlukan HTTPS atau localhost')
    if (config && config.onError) {
      config.onError(new Error('Service Worker memerlukan HTTPS'))
    }
    return
  }

  navigator.serviceWorker
    .register(swUrl, { 
      scope: '/',
      updateViaCache: 'none' // Always check for updates
    })
    .then((registration) => {
      console.log('✅ Service Worker registered successfully:', registration.scope)
      
      // Auto-update: skipWaiting dan clientsClaim
      // Service worker sudah dikonfigurasi dengan skipWaiting dan clientsClaim di vite.config.js
      
      registration.onupdatefound = () => {
        const installingWorker = registration.installing
        if (installingWorker == null) {
          return
        }
        
        installingWorker.onstatechange = () => {
          if (installingWorker.state === 'installed') {
            if (navigator.serviceWorker.controller) {
              // New service worker available
              console.log('🔄 New content is available. Reloading...')
              
              // Execute callback
              if (config && config.onUpdate) {
                config.onUpdate(registration)
              }
              
              // Auto-reload setelah update
              installingWorker.postMessage({ type: 'SKIP_WAITING' })
            } else {
              // Content cached for offline use
              console.log('✅ Content cached for offline use.')
              
              // Execute callback
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
        
        // Handle errors during installation
        installingWorker.onerror = (error) => {
          console.error('❌ Service Worker installation error:', error)
          if (config && config.onError) {
            config.onError(error)
          }
        }
      }

      // Listen for controller change (when new SW takes control)
      let refreshing = false
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!refreshing) {
          refreshing = true
          console.log('🔄 Service Worker controller changed, reloading...')
          window.location.reload()
        }
      })

      // Handle waiting service worker
      if (registration.waiting) {
        registration.waiting.postMessage({ type: 'SKIP_WAITING' })
      }
      
      // Check for updates periodically
      setInterval(() => {
        registration.update()
      }, 60000) // Check every minute
    })
    .catch((error) => {
      console.error('❌ Error during service worker registration:', error)
      console.error('Error details:', {
        message: error.message,
        name: error.name,
        stack: error.stack,
        swUrl: swUrl
      })
      
      // In development mode, service worker might fail to register
      // This is expected because service worker needs to be built first
      const isDevServer = isLocalhost && window.location.port && 
                         window.location.port !== '80' && 
                         window.location.port !== '443' &&
                         !window.location.pathname.includes('/dist/')
      
      if (isDevServer) {
        console.log('⚠️ Service Worker registration skipped in development mode. This is normal.')
        if (config && config.onSuccess) {
          // Simulate success for development
          config.onSuccess(null)
        }
      } else {
        // Production error - log and notify
        console.error('❌ Service Worker registration failed in production')
        if (config && config.onError) {
          config.onError(error)
        }
      }
    })
}

function checkValidServiceWorker(swUrl, config) {
  // Check if the service worker can be found. If it can't reload the page.
  fetch(swUrl, {
    headers: { 'Service-Worker': 'script' },
  })
    .then((response) => {
      // Ensure service worker exists, and that we really are getting a JS file.
      const contentType = response.headers.get('content-type')
      if (
        response.status === 404 ||
        (contentType != null && contentType.indexOf('javascript') === -1)
      ) {
        // No service worker found. Probably a different app. Reload the page.
        navigator.serviceWorker.ready.then((registration) => {
          registration.unregister().then(() => {
            window.location.reload()
          })
        })
      } else {
        // Service worker found. Proceed normally.
        registerValidSW(swUrl, config)
      }
    })
    .catch((error) => {
      // In development, service worker might not be available
      const isDevServer = isLocalhost && window.location.port && 
                         window.location.port !== '80' && 
                         window.location.port !== '443' &&
                         !window.location.pathname.includes('/dist/')
      
      if (isDevServer) {
        console.log('Service Worker not available in development mode. This is normal.')
        if (config && config.onSuccess) {
          // Simulate success for development
          config.onSuccess(null)
        }
        return
      }
      console.log(
        'No internet connection found. App is running in offline mode.'
      )
    })
}

export function unregister() {
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

