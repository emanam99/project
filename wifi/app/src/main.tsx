import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import { ThemeProvider } from './contexts/ThemeContext'
import { ensurePwaInstallListeners } from './hooks/usePwaInstallPrompt'
import { setupPwaAutoUpdate } from './utils/pwaUpdate'
import './style.css'

ensurePwaInstallListeners()
setupPwaAutoUpdate(registerSW)

const routerBasename = import.meta.env.BASE_URL.replace(/\/$/, '') || undefined

createRoot(document.getElementById('app')!).render(
  <StrictMode>
    <ThemeProvider>
      <BrowserRouter basename={routerBasename}>
        <App />
      </BrowserRouter>
    </ThemeProvider>
  </StrictMode>,
)
