import { APP_VERSION } from '../config/version'

const STORAGE_KEY = 'sppg_pwa_version'

function versionJsonUrl(): string {
  const base = import.meta.env.BASE_URL || '/'
  const normalized = base.endsWith('/') ? base : `${base}/`
  return `${normalized}version.json`
}

/**
 * Auto-update PWA:
 * - Poll service worker tiap 30 detik (+ saat tab kembali aktif)
 * - Saat SW baru mengontrol → reload segera
 * - Cek version.json; jika versi server beda → update SW lalu reload
 */
export function setupPwaAutoUpdate(registerSW: typeof import('virtual:pwa-register').registerSW): void {
  let refreshing = false

  const reloadOnce = () => {
    if (refreshing) return
    refreshing = true
    window.location.reload()
  }

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      reloadOnce()
    })
  }

  try {
    localStorage.setItem(STORAGE_KEY, APP_VERSION)
  } catch {
    /* ignore */
  }

  registerSW({
    immediate: true,
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return

      const check = () => {
        void registration.update()
        void checkRemoteVersion(reloadOnce)
      }

      check()
      setInterval(check, 30_000)

      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check()
      })
    },
    onNeedRefresh() {
      // autoUpdate + skipWaiting → controllerchange → reload
    },
  })
}

async function checkRemoteVersion(reloadOnce: () => void): Promise<void> {
  try {
    const res = await fetch(`${versionJsonUrl()}?t=${Date.now()}`, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) return
    const data = (await res.json()) as { version?: string }
    if (!data?.version || data.version === APP_VERSION) return

    try {
      localStorage.setItem(STORAGE_KEY, data.version)
    } catch {
      /* ignore */
    }

    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration()
      await reg?.update()
    }

    // Beri waktu SW mengklaim, lalu paksa reload jika masih bundle lama
    window.setTimeout(() => reloadOnce(), 1200)
  } catch {
    /* offline / ignore */
  }
}
