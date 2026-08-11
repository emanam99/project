import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { MotionConfig } from 'framer-motion'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import './index.css'
import { getAppEnv, getApiBaseUrl } from './services/api'
import { initTheme } from './utils/theme'
import { ThemeProvider } from './contexts/ThemeContext'

initTheme()
if (typeof window !== 'undefined') {
  if (import.meta.env.DEV) {
    console.log(`[myBeddien] Env: ${getAppEnv()} | API: ${getApiBaseUrl()}`)
  }
  if (import.meta.env.DEV) {
    sessionStorage.removeItem('vite_dep_reload')
    const isDevServer =
      (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') &&
      window.location.port &&
      window.location.port !== '80' &&
      window.location.port !== '443'
    if (isDevServer && 'serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then((regs) => {
        regs.forEach((r) => r.unregister())
      })
      if (typeof caches !== 'undefined') {
        caches.keys().then((keys) => keys.forEach((k) => caches.delete(k)))
      }
    }
    window.addEventListener('vite:preloadError', () => {
      window.location.reload()
    })
  }
}

function getInstallId() {
  const key = 'mybeddien_install_id'
  const existing = localStorage.getItem(key)
  if (existing && existing.trim()) return existing
  const next = (globalThis.crypto?.randomUUID?.() || `mb-${Date.now()}-${Math.random().toString(16).slice(2)}`)
  localStorage.setItem(key, next)
  return next
}

function detectAccessMode() {
  const isStandalone =
    window.matchMedia?.('(display-mode: standalone)')?.matches ||
    window.navigator.standalone === true ||
    document.referrer.startsWith('android-app://')
  return isStandalone ? 'pwa' : 'browser'
}

async function trackInstallActivity(forcedMode = null, eventType = 'heartbeat') {
  try {
    const token = localStorage.getItem('auth_token')
    await fetch(`${getApiBaseUrl()}/app-install-activity/track`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      credentials: 'include',
      body: JSON.stringify({
        app: 'mybeddien',
        install_id: getInstallId(),
        access_mode: forcedMode || detectAccessMode(),
        event_type: eventType,
        event_source: 'web',
        screen: window.location?.pathname || '/',
        app_version: import.meta.env.VITE_APP_VERSION || null
      })
    })
  } catch (_) {
    // silent: tracking tidak boleh mengganggu UX
  }
}

let lastTrackAt = 0
let lastTrackSignature = ''
function throttledTrackInstallActivity(forcedMode = null, eventType = 'heartbeat', minIntervalMs = 30_000) {
  const signature = `${forcedMode || 'auto'}:${eventType}:${window.location?.pathname || '/'}`
  const now = Date.now()
  if (signature === lastTrackSignature && (now - lastTrackAt) < minIntervalMs) return
  lastTrackAt = now
  lastTrackSignature = signature
  trackInstallActivity(forcedMode, eventType)
}

if (typeof window !== 'undefined') {
  throttledTrackInstallActivity(null, 'open', 0)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') throttledTrackInstallActivity()
  })
  window.addEventListener('appinstalled', () => {
    throttledTrackInstallActivity('pwa', 'install', 0)
  })
}

// Service worker didaftarkan dari App.jsx saat app siap (bukan menunggu login).

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <MotionConfig reducedMotion={import.meta.env.PROD ? 'user' : 'never'}>
        <BrowserRouter>
          <ThemeProvider>
            <App />
          </ThemeProvider>
        </BrowserRouter>
      </MotionConfig>
    </ErrorBoundary>
  </React.StrictMode>
)
