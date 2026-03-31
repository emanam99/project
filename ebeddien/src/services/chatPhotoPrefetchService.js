const PREFETCH_SESSION_KEY = 'chat_photo_prefetch_v1'
const PREFETCH_COOLDOWN_MS = 6 * 60 * 60 * 1000 // 6 jam
const MAX_TRACKED = 500

const inflight = new Map()

function readPrefetchState() {
  try {
    const raw = sessionStorage.getItem(PREFETCH_SESSION_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writePrefetchState(state) {
  try {
    const entries = Object.entries(state).sort((a, b) => Number(b[1] || 0) - Number(a[1] || 0))
    const trimmed = entries.slice(0, MAX_TRACKED)
    const next = Object.fromEntries(trimmed)
    sessionStorage.setItem(PREFETCH_SESSION_KEY, JSON.stringify(next))
  } catch {
    // ignore storage errors
  }
}

function makeKey(url, version) {
  return `${String(version || '')}::${String(url || '')}`
}

export function prefetchChatPhoto(url, version = null) {
  const src = String(url || '').trim()
  if (!src) return
  const key = makeKey(src, version || src)
  if (inflight.has(key)) return

  const now = Date.now()
  const state = readPrefetchState()
  const lastTs = Number(state[key] || 0)
  if (lastTs && now - lastTs < PREFETCH_COOLDOWN_MS) return

  const job = new Promise((resolve) => {
    const img = new Image()
    img.decoding = 'async'
    img.onload = () => resolve(true)
    img.onerror = () => resolve(false)
    img.src = src
  }).finally(() => {
    inflight.delete(key)
    state[key] = now
    writePrefetchState(state)
  })

  inflight.set(key, job)
}

export function prefetchChatPhotos(items = []) {
  if (!Array.isArray(items) || items.length === 0) return
  items.forEach((it) => {
    if (!it) return
    prefetchChatPhoto(it.url, it.version)
  })
}

