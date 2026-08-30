import { useCallback, useEffect, useState } from 'react'

const PWA_DISPLAY_MEDIA =
  '(display-mode: standalone), (display-mode: minimal-ui), (display-mode: fullscreen)'

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let promptEvent: BeforeInstallPromptEvent | null = null
let installed = false
let listenersAttached = false
const subscribers = new Set<(state: { canInstall: boolean; installed: boolean }) => void>()

function isPwaDisplayMode() {
  if (typeof window === 'undefined') return false
  const nav = window.navigator as Navigator & { standalone?: boolean }
  return (
    window.matchMedia?.(PWA_DISPLAY_MEDIA)?.matches === true ||
    nav.standalone === true ||
    document.referrer.startsWith('android-app://')
  )
}

export { isPwaDisplayMode }

function snapshot() {
  return {
    canInstall: Boolean(promptEvent) && !installed,
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

  window.addEventListener('beforeinstallprompt', ((event: Event) => {
    event.preventDefault()
    promptEvent = event as BeforeInstallPromptEvent
    installed = isPwaDisplayMode()
    notify()
  }) as EventListener)

  window.addEventListener('appinstalled', () => {
    installed = true
    promptEvent = null
    notify()
  })

  const media = window.matchMedia?.(PWA_DISPLAY_MEDIA)
  media?.addEventListener?.('change', () => {
    installed = isPwaDisplayMode()
    if (installed) promptEvent = null
    notify()
  })
}

/** Panggil di entry agar beforeinstallprompt tidak terlewat sebelum Layout mount. */
export function ensurePwaInstallListeners() {
  ensureListeners()
}

export function usePwaInstallPrompt() {
  const [state, setState] = useState(() => {
    ensureListeners()
    return snapshot()
  })

  useEffect(() => {
    ensureListeners()
    const update = (next: { canInstall: boolean; installed: boolean }) => setState(next)
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
      console.warn('[SPPG] PWA install prompt error:', err)
      notify()
      return false
    }
  }, [])

  return { ...state, promptInstall }
}
