import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { alumniAPI } from '../services/alumniApi'

/** Estimasi awal saat loading (animasi 1 → 800) */
const BOOTSTRAP_CEILING = 800
const POLL_MS = 3000

let serverTotal = null // number | null
let displayTotal = 1
const listeners = new Set()
let rafId = 0
let lastTs = 0
let animStarted = false

function emit() {
  listeners.forEach((fn) => fn())
}

function subscribe(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

function getSnapshot() {
  return displayTotal
}

function getServerSnapshot() {
  return serverTotal
}

function animTick(now) {
  if (!lastTs) lastTs = now
  const dt = Math.min(0.05, (now - lastTs) / 1000)
  lastTs = now

  const loaded = serverTotal !== null
  const target = loaded ? Math.max(serverTotal, displayTotal) : BOOTSTRAP_CEILING

  if (displayTotal < target) {
    const remain = target - displayTotal
    const speed = !loaded ? 35 + remain * 0.06 : 100 + remain * 2.4
    const step = Math.max(1, Math.ceil(speed * dt))
    displayTotal = Math.min(target, displayTotal + step)
    emit()
  }

  rafId = requestAnimationFrame(animTick)
}

function ensureAnim() {
  if (animStarted) return
  animStarted = true
  lastTs = 0
  rafId = requestAnimationFrame(animTick)
}

async function fetchCount() {
  try {
    const res = await alumniAPI.count()
    if (!res.success || !res.data) return
    const n = Math.max(0, Number(res.data.total) || 0)
    if (serverTotal === null) {
      serverTotal = n
      emit()
      return
    }
    if (n > serverTotal) {
      serverTotal = n
      emit()
    }
  } catch {
    // ignore
  }
}

let pollStarted = false
function ensurePolling() {
  if (pollStarted) return
  pollStarted = true
  ensureAnim()
  fetchCount()
  setInterval(fetchCount, POLL_MS)
}

/**
 * Count alumni bersama (header + semua page).
 * Loading: naik pelan 1→800; data datang: percepat ke angka aktual; tidak turun.
 */
export function useAlumniCount() {
  ensurePolling()
  const animatedTotal = useSyncExternalStore(subscribe, getSnapshot, () => 1)
  const total = useSyncExternalStore(subscribe, getServerSnapshot, () => null)

  const refresh = useCallback(() => fetchCount(), [])

  // pastikan anim jalan saat mount
  useEffect(() => {
    ensureAnim()
  }, [])

  return {
    total: total ?? 0,
    animatedTotal,
    loading: total === null,
    refresh,
  }
}
