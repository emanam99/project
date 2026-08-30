import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { isPwaDisplayMode } from './lib/isPwaDisplayMode'
import { prefetchReaderFonts } from './utils/readerFonts'
import './style.css'

const API_BASE = (import.meta.env.VITE_API_BASE || '/api').replace(/\/$/, '')

function getInstallId(): string {
  const key = 'nailul_murod_install_id'
  const existing = localStorage.getItem(key)
  if (existing && existing.trim()) return existing
  const next = (globalThis.crypto?.randomUUID?.() || `nm-${Date.now()}-${Math.random().toString(16).slice(2)}`)
  localStorage.setItem(key, next)
  return next
}

function detectAccessMode(): 'browser' | 'pwa' {
  return isPwaDisplayMode() ? 'pwa' : 'browser'
}

async function trackInstallActivity(forcedMode: 'browser' | 'pwa' | null = null, eventType: 'heartbeat' | 'install' | 'open' = 'heartbeat') {
  try {
    const token = localStorage.getItem('auth_token')
    await fetch(`${API_BASE}/app-install-activity/track`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      credentials: 'include',
      body: JSON.stringify({
        app: 'nailul-murod',
        install_id: getInstallId(),
        access_mode: forcedMode || detectAccessMode(),
        event_type: eventType,
        event_source: 'web',
        screen: window.location?.pathname || '/',
        app_version: import.meta.env.VITE_APP_VERSION || null
      })
    })
  } catch {
    // silent: tracking tidak boleh mengganggu UX
  }
}

let lastTrackAt = 0
let lastTrackSignature = ''
function throttledTrackInstallActivity(forcedMode: 'browser' | 'pwa' | null = null, eventType: 'heartbeat' | 'install' | 'open' = 'heartbeat', minIntervalMs = 30_000) {
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

const root = document.getElementById('app')
if (!root) throw new Error('Root #app tidak ditemukan')

createRoot(root).render(
  React.createElement(
    React.StrictMode,
    null,
    React.createElement(BrowserRouter, { basename: import.meta.env.BASE_URL }, React.createElement(App))
  )
)

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const base = import.meta.env.BASE_URL
    const swUrl = `${base}sw.js?nm=${encodeURIComponent(__NM_BUILD_ID__)}`
    navigator.serviceWorker
      .register(swUrl, {
        updateViaCache: 'none',
        scope: base,
      })
      .catch(() => {})
  })
}

if (typeof navigator !== 'undefined' && navigator.onLine) {
  void prefetchReaderFonts()
}
