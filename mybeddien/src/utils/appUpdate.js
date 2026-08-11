/**
 * Deteksi deploy baru via pwa-release.txt + dorong update service worker.
 * Selaras eBeddien: reload otomatis saat versi server berbeda dari bundle lokal.
 */

const CHECK_INTERVAL_MS = 60 * 1000
const RELOAD_GUARD_KEY = 'mybeddien_reload_for_version'
const VERSION_RE = /^\d+\.\d+\.\d+/

function getAppBase() {
  return (import.meta.env.BASE_URL || '/').replace(/\/?$/, '/')
}

function getLocalVersion() {
  return String(import.meta.env.VITE_APP_VERSION || '').trim()
}

function safeSessionGet(key) {
  try {
    return sessionStorage.getItem(key)
  } catch {
    return null
  }
}

function safeSessionSet(key, value) {
  try {
    sessionStorage.setItem(key, value)
  } catch {
    /* abaikan */
  }
}

function safeSessionRemove(key) {
  try {
    sessionStorage.removeItem(key)
  } catch {
    /* abaikan */
  }
}

async function resolveRegistration(registrationOrGetter) {
  if (typeof registrationOrGetter === 'function') {
    const fromGetter = registrationOrGetter()
    if (fromGetter) return fromGetter
  } else if (registrationOrGetter) {
    return registrationOrGetter
  }
  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    try {
      return await navigator.serviceWorker.getRegistration()
    } catch {
      return null
    }
  }
  return null
}

async function clearPwaCachesAndUnregister() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
  try {
    const regs = await navigator.serviceWorker.getRegistrations()
    await Promise.all(regs.map((r) => r.unregister()))
  } catch {
    /* abaikan */
  }
  if (typeof caches !== 'undefined') {
    try {
      const keys = await caches.keys()
      await Promise.all(keys.map((k) => caches.delete(k)))
    } catch {
      /* abaikan */
    }
  }
}

async function promptWaitingWorker(registration) {
  if (!registration) return
  try {
    if (registration.waiting) {
      registration.waiting.postMessage({ type: 'SKIP_WAITING' })
    }
    await registration.update()
  } catch {
    /* abaikan */
  }
}

async function fetchRemoteReleaseVersion() {
  const url = `${getAppBase()}pwa-release.txt?t=${Date.now()}`
  const res = await fetch(url, { cache: 'no-store', credentials: 'same-origin' })
  if (!res.ok) return null
  const text = (await res.text()).trim().split(/\s+/)[0]
  if (!text || !VERSION_RE.test(text)) return null
  return text
}

/**
 * @returns {Promise<boolean>} true jika reload dipicu
 */
export async function checkReleaseAndReload({ registration = null } = {}) {
  if (import.meta.env.DEV) return false
  const local = getLocalVersion()
  if (!local) return false

  let remote = null
  try {
    remote = await fetchRemoteReleaseVersion()
  } catch {
    return false
  }
  if (!remote) return false

  if (remote === local) {
    safeSessionRemove(RELOAD_GUARD_KEY)
    return false
  }

  const guard = safeSessionGet(RELOAD_GUARD_KEY)
  if (guard === remote) {
    // Reload sudah dicoba tapi bundle masih lama — buang cache SW lalu coba lagi
    await clearPwaCachesAndUnregister()
    safeSessionRemove(RELOAD_GUARD_KEY)
    window.location.reload()
    return true
  }

  safeSessionSet(RELOAD_GUARD_KEY, remote)
  await promptWaitingWorker(registration)
  window.location.reload()
  return true
}

/**
 * @param {ServiceWorkerRegistration | null | (() => ServiceWorkerRegistration | null)} registrationOrGetter
 */
export function startAppUpdateWatcher(registrationOrGetter = null) {
  if (import.meta.env.DEV) return () => {}
  if (typeof window === 'undefined') return () => {}

  let busy = false
  const run = async () => {
    if (busy || document.hidden) return
    busy = true
    try {
      const registration = await resolveRegistration(registrationOrGetter)
      await promptWaitingWorker(registration)
      await checkReleaseAndReload({ registration })
    } finally {
      busy = false
    }
  }

  const bootTimer = window.setTimeout(run, 1500)
  const intervalId = window.setInterval(run, CHECK_INTERVAL_MS)

  const onVisible = () => {
    if (!document.hidden) run()
  }
  const onFocus = () => run()
  const onPageShow = (e) => {
    if (e.persisted) run()
  }

  document.addEventListener('visibilitychange', onVisible)
  window.addEventListener('focus', onFocus)
  window.addEventListener('pageshow', onPageShow)

  return () => {
    window.clearTimeout(bootTimer)
    window.clearInterval(intervalId)
    document.removeEventListener('visibilitychange', onVisible)
    window.removeEventListener('focus', onFocus)
    window.removeEventListener('pageshow', onPageShow)
  }
}
