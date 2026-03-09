import { useRef, useEffect, useCallback } from 'react'

/**
 * Hook agar offcanvas tertutup saat user menekan tombol Kembali (back).
 * - Jika urlManaged: false (default): saat buka pushState; saat tutup tombol panggil onClose lalu history.back().
 * - Jika urlManaged: true: URL dikelola parent (setSearchParams replace:false saat buka). Hanya listen popstate → onClose.
 *   Saat tutup tombol cukup onClose() (parent akan setSearchParams replace:true sehingga link berubah).
 *
 * @param {boolean} isOpen - Apakah offcanvas sedang terbuka
 * @param {function} onClose - Callback untuk menutup (biasanya setState(false) + setSearchParams tanpa param)
 * @param {object} [options] - { state?: object, urlManaged?: boolean }
 * @returns {function} Fungsi close untuk onClose offcanvas
 */
export function useOffcanvasBackClose(isOpen, onClose, options = {}) {
  const pushedRef = useRef(false)
  const urlManaged = options.urlManaged === true

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

  // Listen back: tutup offcanvas (URL berubah = state beda, tutup offcanvas)
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

  // Wrapped close: urlManaged → cukup onClose (link berubah lewat setSearchParams). Tidak urlManaged → onClose lalu history.back()
  return useCallback(() => {
    if (urlManaged) {
      onClose()
      return
    }
    if (pushedRef.current) {
      pushedRef.current = false
      onClose()
      setTimeout(() => window.history.back(), 0)
    } else {
      onClose()
    }
  }, [onClose, urlManaged])
}
