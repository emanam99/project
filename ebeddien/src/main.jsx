import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import './index.css'
// CSS halaman cetak dipindah ke masing-masing komponen print
// (PrintPendaftaran/PrintKwitansi/PrintUwaba/PrintPengeluaran) per audit Mei 2026,
// agar bundle awal lebih ramping. Komponennya sudah React.lazy() di App.jsx.
import { getAppEnv, getApiBaseUrl } from './services/api.js'

// Lepaskan SW lama di dev (cache masih memuat sw ber-import workbox dari sesi sebelumnya).
if (import.meta.env.DEV && typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations?.().then((regs) => {
    regs.forEach((r) => r.unregister())
  })
}

// Log environment di development saja agar console production lebih bersih
if (import.meta.env.DEV) {
  const appEnv = getAppEnv()
  const apiBase = getApiBaseUrl()
  console.log(`[Uwaba] Environment: ${appEnv} | API: ${apiBase}`)
}

function getInstallId() {
  const key = 'ebeddien_install_id'
  const existing = localStorage.getItem(key)
  if (existing && existing.trim()) return existing
  const next = (globalThis.crypto?.randomUUID?.() || `eb-${Date.now()}-${Math.random().toString(16).slice(2)}`)
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
        app: 'ebeddien',
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
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(() => throttledTrackInstallActivity(null, 'open', 0))
  } else {
    window.setTimeout(() => throttledTrackInstallActivity(null, 'open', 0), 1200)
  }
  const onVisibilityChange = () => {
    if (document.visibilityState === 'visible') throttledTrackInstallActivity()
  }
  const onAppInstalled = () => {
    throttledTrackInstallActivity('pwa', 'install', 0)
  }
  document.addEventListener('visibilitychange', onVisibilityChange)
  window.addEventListener('appinstalled', onAppInstalled)
}

// Initialize theme on mount (theme is already initialized in themeStore)

// Setup React Query
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 5 * 60 * 1000, // 5 minutes
    },
  },
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '') || undefined}>
          <App />
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>,
)


