import { useRef, useEffect, useCallback } from 'react'

/**
 * @param {boolean} isOpen
 * @param {function} onClose
 * @param {{ urlManaged?: boolean }} [options]
 */
export function useOffcanvasBackClose(isOpen, onClose, options = {}) {
  const urlManaged = options.urlManaged === true
  const pushedRef = useRef(false)
  const isOpenRef = useRef(isOpen)
  const onCloseRef = useRef(onClose)
  isOpenRef.current = isOpen
  onCloseRef.current = onClose

  useEffect(() => {
    if (urlManaged || !isOpen || pushedRef.current) return
    window.history.pushState({ offcanvas: true }, '', window.location.href)
    pushedRef.current = true
  }, [isOpen, urlManaged])

  useEffect(() => {
    if (!isOpen) pushedRef.current = false
  }, [isOpen])

  useEffect(() => {
    if (urlManaged) return () => {}
    const onPopState = () => {
      pushedRef.current = false
      if (isOpenRef.current) onCloseRef.current()
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [urlManaged])

  return useCallback(() => {
    if (urlManaged) {
      onClose()
      return
    }
    if (pushedRef.current) window.history.back()
    else onClose()
  }, [onClose, urlManaged])
}
