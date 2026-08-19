import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import './style.css'
import { ThemeProvider } from './contexts/ThemeContext'
import { ensurePwaInstallListeners } from './hooks/usePwaInstallPrompt'
import { prefetchKalenderMonths } from './api/kalenderApi'

ensurePwaInstallListeners()
prefetchKalenderMonths()

const routerBasename = import.meta.env.BASE_URL.replace(/\/$/, '') || undefined

createRoot(document.getElementById('app')!).render(
  <StrictMode>
    <BrowserRouter basename={routerBasename}>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </BrowserRouter>
  </StrictMode>,
)

// PWA auto-update: SW baru → skipWaiting → reload
registerSW({
  immediate: true,
  onRegisteredSW(_swUrl, registration) {
    if (!registration) return
    const tryUpdate = () => {
      void registration.update().catch(() => {
        /* sw.js bisa gagal di-fetch (offline / CDN) — jangan biarkan uncaught */
      })
    }
    tryUpdate()
    setInterval(tryUpdate, 60_000)
  },
  onRegisterError() {
    /* Gagal daftar/update SW tidak boleh memutus halaman */
  },
  onNeedRefresh() {
    // autoUpdate + skipWaiting di SW menangani refresh
  },
})
