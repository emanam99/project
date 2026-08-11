import { useRef, useEffect, useCallback } from 'react'
import { registerDomisiliPopstateLayer } from '../history/domisiliPopstateStack'

/**
 * Hook agar offcanvas tertutup saat user menekan tombol Kembali (back).
 * - Jika urlManaged: false (default): saat buka pushState; saat tutup tombol panggil history.back() sinkron.
 * - Jika useDomisiliPopstateStack: satu stack capture bersama halaman Domisili (Daerah) — tidak bentrok dengan listener lain.
 * - Jika urlManaged: true: URL dikelola parent. Hanya listen popstate → onClose; tombol tutup cukup onClose().
 *
 * @param {boolean} isOpen
 * @param {function} onClose
 * @param {object} [options]
 * @param {object} [options.state] — state pushState
 * @param {boolean} [options.urlManaged]
 * @param {boolean} [options.popCapture] — window listener capture (bila tidak pakai stack Domisili)
 * @param {boolean} [options.stopImmediatePropagation]
 * @param {boolean} [options.useDomisiliPopstateStack]
 * @param {string} [options.domisiliStackId]
 * @param {number} [options.domisiliStackPriority]
 */
export function useOffcanvasBackClose(isOpen, onClose, options = {}) {
  const pushedRef = useRef(false)
  const urlManaged = options.urlManaged === true
  const popCapture = options.popCapture === true
  const stopImmediate = options.stopImmediatePropagation === true
  const useDomisiliStack = options.useDomisiliPopstateStack === true
  const domisiliStackId = options.domisiliStackId ?? 'offcanvas-layer'
  const domisiliStackPriority =
    typeof options.domisiliStackPriority === 'number' ? options.domisiliStackPriority : 5

  const isOpenRef = useRef(isOpen)
  const onCloseRef = useRef(onClose)
  isOpenRef.current = isOpen
  onCloseRef.current = onClose

  // Saat offcanvas terbuka, push state sekali (hanya jika URL tidak dikelola parent)
  useEffect(() => {
    if (urlManaged || !isOpen || pushedRef.current) return
    window.history.pushState(
      options.state != null ? options.state : { offcanvas: true },
      '',
      window.location.href
    )
    pushedRef.current = true
  }, [isOpen, urlManaged, options.state])

  // Reset ref saat tertutup
  useEffect(() => {
    if (!isOpen) pushedRef.current = false
  }, [isOpen])

  /** Popstate lewat window (halaman di luar stack Domisili). */
  useEffect(() => {
    if (urlManaged || useDomisiliStack) return
    const onPopState = (e) => {
      if (!pushedRef.current && !isOpenRef.current) return
      if (stopImmediate) e.stopImmediatePropagation()
      pushedRef.current = false
      if (isOpenRef.current) onCloseRef.current()
    }
    window.addEventListener('popstate', onPopState, popCapture)
    return () => window.removeEventListener('popstate', onPopState, popCapture)
  }, [urlManaged, useDomisiliStack, popCapture, stopImmediate])

  /** Popstate lewat stack Domisili (urutan prioritas). */
  useEffect(() => {
    if (urlManaged || !useDomisiliStack) return () => {}
    return registerDomisiliPopstateLayer(domisiliStackId, domisiliStackPriority, () => {
      if (!pushedRef.current && !isOpenRef.current) return false
      pushedRef.current = false
      if (isOpenRef.current) onCloseRef.current()
      return true
    })
  }, [urlManaged, useDomisiliStack, domisiliStackId, domisiliStackPriority])

  /**
   * Tutup lewat tombol: history.back() sinkron agar handler popstate memanggil onClose saat isOpen masih true.
   */
  return useCallback(() => {
    if (urlManaged) {
      onClose()
      return
    }
    if (pushedRef.current) {
      window.history.back()
    } else {
      onClose()
    }
  }, [onClose, urlManaged])
}
