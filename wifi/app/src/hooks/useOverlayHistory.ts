import { useEffect, useId, useRef } from 'react'

type StackEntry = {
  key: string
  close: () => void
}

const stack: StackEntry[] = []
let ignorePopCount = 0
let listenerAttached = false

function ensureListener() {
  if (listenerAttached || typeof window === 'undefined') return
  listenerAttached = true
  window.addEventListener('popstate', () => {
    if (ignorePopCount > 0) {
      ignorePopCount -= 1
      return
    }
    const top = stack.pop()
    if (top) top.close()
  })
}

function rewindHistory(steps: number) {
  if (steps <= 0) return
  ignorePopCount += steps
  if (steps === 1) history.back()
  else history.go(-steps)
}

function currentOverlayKey(): string | null {
  const state = history.state
  if (state && typeof state === 'object' && 'wifiOverlay' in state) {
    const key = (state as { wifiOverlay?: unknown }).wifiOverlay
    return typeof key === 'string' ? key : null
  }
  return null
}

/**
 * Sinkronkan overlay (offcanvas/sheet) dengan history browser.
 * Back menutup lapisan teratas dulu (mis. bayar → baru detail).
 *
 * Jika navigasi route sudah mengganti history.state (bukan lagi wifiOverlay),
 * tutup overlay tanpa history.back() — agar tidak membatalkan pindah halaman.
 */
export function useOverlayHistory(open: boolean, onClose: () => void, keyPrefix = 'oc') {
  const reactId = useId()
  const overlayKey = `${keyPrefix}:${reactId}`
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const wasOpenRef = useRef(false)
  const keyRef = useRef(overlayKey)
  keyRef.current = overlayKey

  useEffect(() => {
    ensureListener()
  }, [])

  useEffect(() => {
    const key = keyRef.current

    if (open && !wasOpenRef.current) {
      wasOpenRef.current = true
      const prev = typeof history.state === 'object' && history.state ? history.state : {}
      history.pushState({ ...prev, wifiOverlay: key }, '')
      stack.push({
        key,
        close: () => {
          wasOpenRef.current = false
          onCloseRef.current()
        },
      })
      return
    }

    if (!open && wasOpenRef.current) {
      wasOpenRef.current = false
      const idx = stack.findIndex((e) => e.key === key)
      if (idx === -1) return

      const steps = stack.length - idx
      const topKey = stack[stack.length - 1]?.key
      const stateKey = currentOverlayKey()

      // Hanya rewind jika history masih menunjuk overlay ini (belum pindah route).
      const canRewind = stateKey === key || (stateKey === topKey && topKey === key)

      stack.splice(idx)
      if (canRewind) {
        rewindHistory(steps)
      }
    }
  }, [open])

  useEffect(() => {
    return () => {
      if (!wasOpenRef.current) return
      wasOpenRef.current = false
      const key = keyRef.current
      const idx = stack.findIndex((e) => e.key === key)
      if (idx === -1) return
      const steps = stack.length - idx
      const stateKey = currentOverlayKey()
      const canRewind = stateKey === key
      stack.splice(idx)
      if (canRewind) {
        rewindHistory(steps)
      }
    }
  }, [])
}
