import { useRef, useCallback } from 'react'

const THRESHOLD_PX = 56

/**
 * Geser kanan pada bubble (mobile) → callback balas.
 */
export function useSwipeToReply(onReply, { disabled = false } = {}) {
  const startRef = useRef(null)
  const draggingRef = useRef(false)
  const offsetRef = useRef(0)

  const onTouchStart = useCallback(
    (e) => {
      if (disabled) return
      const t = e.touches?.[0]
      if (!t) return
      startRef.current = { x: t.clientX, y: t.clientY }
      draggingRef.current = true
      offsetRef.current = 0
    },
    [disabled],
  )

  const onTouchMove = useCallback(
    (e) => {
      if (!draggingRef.current || disabled || !startRef.current) return
      const t = e.touches?.[0]
      if (!t) return
      const dx = t.clientX - startRef.current.x
      const dy = t.clientY - startRef.current.y
      if (Math.abs(dy) > Math.abs(dx)) {
        draggingRef.current = false
        return
      }
      if (dx > 0) {
        offsetRef.current = Math.min(dx, 72)
        const el = e.currentTarget
        if (el?.style) {
          el.style.transform = `translateX(${offsetRef.current}px)`
        }
      }
    },
    [disabled],
  )

  const onTouchEnd = useCallback(
    (e) => {
      if (!startRef.current) return
      const el = e.currentTarget
      if (el?.style) el.style.transform = ''
      if (offsetRef.current >= THRESHOLD_PX && !disabled) {
        onReply?.()
      }
      startRef.current = null
      draggingRef.current = false
      offsetRef.current = 0
    },
    [disabled, onReply],
  )

  return { onTouchStart, onTouchMove, onTouchEnd }
}
