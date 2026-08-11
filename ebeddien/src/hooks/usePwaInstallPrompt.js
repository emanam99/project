import { useCallback, useEffect, useState } from 'react'

const PWA_DISPLAY_MEDIA = '(display-mode: standalone), (display-mode: minimal-ui), (display-mode: fullscreen)'

let promptEvent = null
let installed = false
let listenersAttached = false
const subscribers = new Set()

function isPwaDisplayMode() {
  if (typeof window === 'undefined') return false
  const nav = window.navigator || {}
  return (
    window.matchMedia?.(PWA_DISPLAY_MEDIA)?.matches === true ||
    nav.standalone === true ||
    document.referrer.startsWith('android-app://')
  )
}

function snapshot() {
  return {
    canInstall: Boolean(promptEvent) && !installed,
    installReady: Boolean(promptEvent),
    installed,
  }
}

function notify() {
  const next = snapshot()
  subscribers.forEach((fn) => fn(next))
}

function ensureListeners() {
  if (listenersAttached || typeof window === 'undefined') return
  listenersAttached = true
  installed = isPwaDisplayMode()

  const handleBeforeInstallPrompt = (event) => {
    event.preventDefault()
    promptEvent = event
    installed = isPwaDisplayMode()
    notify()
  }

  const handleAppInstalled = () => {
    installed = true
    promptEvent = null
    notify()
  }

  const media = window.matchMedia?.(PWA_DISPLAY_MEDIA)
  const handleDisplayModeChange = () => {
    installed = isPwaDisplayMode()
    if (installed) promptEvent = null
    notify()
  }

  window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
  window.addEventListener('appinstalled', handleAppInstalled)
  media?.addEventListener?.('change', handleDisplayModeChange)
}

export function usePwaInstallPrompt() {
  const [state, setState] = useState(() => {
    ensureListeners()
    return snapshot()
  })

  useEffect(() => {
    ensureListeners()
    const update = (next) => setState(next)
    subscribers.add(update)
    update(snapshot())
    return () => {
      subscribers.delete(update)
    }
  }, [])

  const promptInstall = useCallback(async () => {
    if (!promptEvent || installed) return false
    const event = promptEvent
    promptEvent = null
    notify()

    try {
      await event.prompt()
      const result = await event.userChoice
      if (result?.outcome === 'accepted') {
        installed = true
      }
      notify()
      return result?.outcome === 'accepted'
    } catch (err) {
      console.warn('[eBeddien] PWA install prompt error:', err)
      notify()
      return false
    }
  }, [])

  return { ...state, promptInstall }
}
