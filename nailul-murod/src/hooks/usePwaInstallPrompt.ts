import { useCallback, useEffect, useMemo, useState } from 'react'

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

function isStandaloneMode() {
  const nav = window.navigator as Navigator & { standalone?: boolean }
  return window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true
}

export function usePwaInstallPrompt() {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState(false)

  useEffect(() => {
    setInstalled(isStandaloneMode())

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault()
      setPromptEvent(event as BeforeInstallPromptEvent)
    }

    const handleAppInstalled = () => {
      setInstalled(true)
      setPromptEvent(null)
    }

    const media = window.matchMedia('(display-mode: standalone)')
    const handleDisplayModeChange = () => setInstalled(isStandaloneMode())

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleAppInstalled)
    media.addEventListener('change', handleDisplayModeChange)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
      media.removeEventListener('change', handleDisplayModeChange)
    }
  }, [])

  const canInstall = useMemo(() => Boolean(promptEvent) && !installed, [promptEvent, installed])
  const installReady = useMemo(() => Boolean(promptEvent), [promptEvent])

  const promptInstall = useCallback(async () => {
    if (!promptEvent) return false
    await promptEvent.prompt()
    const result = await promptEvent.userChoice
    if (result.outcome === 'accepted') {
      setInstalled(true)
      setPromptEvent(null)
      return true
    }
    return false
  }, [promptEvent])

  return { canInstall, installReady, installed, promptInstall }
}
