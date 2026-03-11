import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App.jsx'
import './index.css'
import * as serviceWorkerRegistration from './serviceWorkerRegistration.js'
import { getAppEnv, getApiBaseUrl } from './services/api.js'

// Log environment dan API saat awal render (local / staging / production pakai .env)
const appEnv = getAppEnv()
const apiBase = getApiBaseUrl()
console.log(`[Uwaba] Environment: ${appEnv} | API: ${apiBase}`)

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
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
)

// Register service worker dengan skipWaiting dan clientsClaim
serviceWorkerRegistration.register({
  onUpdate: (registration) => {
    // Auto-update: skip waiting dan claim clients
    if (registration.waiting) {
      registration.waiting.postMessage({ type: 'SKIP_WAITING' })
    }
  },
  onSuccess: (registration) => {
    console.log('Service Worker registered successfully')
  }
})

