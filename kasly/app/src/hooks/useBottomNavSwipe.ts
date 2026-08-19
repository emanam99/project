import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

const SWIPE_MIN_DX = 56
const SWIPE_MAX_MS = 500
const SWIPE_RATIO = 1.35 // horizontal harus lebih dominan dari vertikal
const MOBILE_MQ = '(max-width: 767px)'

function findNavIndex(pathname: string, paths: string[]): number {
  let best = -1
  let bestLen = -1
  for (let i = 0; i < paths.length; i++) {
    const p = paths[i]
    if (pathname === p || pathname.startsWith(`${p}/`)) {
      if (p.length > bestLen) {
        best = i
        bestLen = p.length
      }
    }
  }
  return best
}

function isSwipeBlocked(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  return Boolean(
    target.closest(
      'input, textarea, select, [contenteditable="true"], [data-no-nav-swipe], .ui-offcanvas, [role="dialog"]',
    ),
  )
}

/**
 * Geser kiri/kanan di mobile untuk pindah tab sesuai urutan bottom nav.
 * Geser kiri → tab berikutnya; geser kanan → tab sebelumnya.
 */
export function useBottomNavSwipe(paths: string[]) {
  const navigate = useNavigate()
  const location = useLocation()
  const pathsRef = useRef(paths)
  pathsRef.current = paths

  const startRef = useRef<{ x: number; y: number; t: number } | null>(null)

  useEffect(() => {
    const mq = window.matchMedia(MOBILE_MQ)

    const onStart = (e: TouchEvent) => {
      if (!mq.matches || e.touches.length !== 1) {
        startRef.current = null
        return
      }
      if (isSwipeBlocked(e.target)) {
        startRef.current = null
        return
      }
      const t = e.touches[0]
      startRef.current = { x: t.clientX, y: t.clientY, t: Date.now() }
    }

    const onEnd = (e: TouchEvent) => {
      const start = startRef.current
      startRef.current = null
      if (!start || !mq.matches || e.changedTouches.length !== 1) return

      const t = e.changedTouches[0]
      const dx = t.clientX - start.x
      const dy = t.clientY - start.y
      const dt = Date.now() - start.t
      if (dt > SWIPE_MAX_MS) return
      if (Math.abs(dx) < SWIPE_MIN_DX) return
      if (Math.abs(dx) < Math.abs(dy) * SWIPE_RATIO) return

      const list = pathsRef.current
      if (list.length < 2) return
      const idx = findNavIndex(location.pathname, list)
      if (idx < 0) return

      // dx < 0 = geser kiri → next; dx > 0 = geser kanan → prev
      const nextIdx = dx < 0 ? idx + 1 : idx - 1
      if (nextIdx < 0 || nextIdx >= list.length) return
      if (list[nextIdx] === location.pathname) return

      navigate(list[nextIdx], {
        state: { navSwipe: dx < 0 ? 1 : -1 },
      })
    }

    const onCancel = () => {
      startRef.current = null
    }

    document.addEventListener('touchstart', onStart, { passive: true })
    document.addEventListener('touchend', onEnd, { passive: true })
    document.addEventListener('touchcancel', onCancel, { passive: true })
    return () => {
      document.removeEventListener('touchstart', onStart)
      document.removeEventListener('touchend', onEnd)
      document.removeEventListener('touchcancel', onCancel)
    }
  }, [location.pathname, navigate])
}
