import { useRef, useEffect, useCallback } from 'react'

/**
 * Hook agar offcanvas tertutup saat user menekan tombol Kembali (back).
 * - Saat offcanvas dibuka: pushState ke history.
 * - Saat user tekan back: popstate → panggil onClose.
 * - Saat tutup lewat tombol/overlay: history.back() lalu onClose agar stack bersih.
 *
 * @param {boolean} isOpen - Apakah offcanvas sedang terbuka
 * @param {function} onClose - Callback untuk menutup (biasanya setState(false))
 * @param {object} [options] - { state: object } state untuk pushState (default { offcanvas: true })
 * @returns {function} Fungsi close yang harus dipass ke onClose offcanvas (dan panggil saat buka jika perlu pushState)
 */
export function useOffcanvasBackClose(isOpen, onClose, options = {}) {
  const pushedRef = useRef(false)

  // Saat offcanvas terbuka, push state sekali
  useEffect(() => {
    if (isOpen && !pushedRef.current) {
      window.history.pushState(
        options.state != null ? options.state : { offcanvas: true },
        '',
        window.location.href
      )
      pushedRef.current = true
    }
  }, [isOpen, options.state])

  // Reset ref saat tertutup (bukan dari back)
  useEffect(() => {
    if (!isOpen) pushedRef.current = false
  }, [isOpen])

  // Listen back: tutup offcanvas
  useEffect(() => {
    const onPopState = () => {
      if (isOpen) {
        pushedRef.current = false
        onClose()
      }
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [isOpen, onClose])

  // Wrapped close: history.back() dulu agar stack bersih, lalu onClose
  return useCallback(() => {
    if (pushedRef.current) {
      window.history.back()
      pushedRef.current = false
    }
    onClose()
  }, [onClose])
}
