import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import './index.css'
import { getAppEnv, getApiBaseUrl } from './services/api'
import { initTheme } from './utils/theme'
import { ThemeProvider } from './contexts/ThemeContext'

initTheme()
if (typeof window !== 'undefined') {
  console.log(`[Mybeddian] Env: ${getAppEnv()} | API: ${getApiBaseUrl()}`)
}

// PWA: auto-reload saat ada pembaruan di server
import * as serviceWorkerRegistration from './serviceWorkerRegistration'
serviceWorkerRegistration.register({
  onUpdate: (registration) => {
    if (registration.waiting) registration.waiting.postMessage({ type: 'SKIP_WAITING' })
  },
  onSuccess: () => console.log('[Mybeddian] Service Worker siap – pembaruan akan auto-load.'),
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </BrowserRouter>
  </React.StrictMode>
)
