import { useState, useRef, useLayoutEffect } from 'react'

/**
 * Accordion: transisi height dalam px (bukan grid / height:auto) — kompatibel WebView & browser lama.
 * Buka: dua rAF agar browser sempat paint height 0 lalu interpolasi ke scrollHeight.
 * Tutup: satu rAF sebelum set 0 agar transisi dari tinggi penuh terlihat.
 */
export function PublicAnimatedCollapse({ isOpen, id, labelledBy, children }) {
  const innerRef = useRef(null)
  const isOpenRef = useRef(isOpen)
  const [heightPx, setHeightPx] = useState(0)

  isOpenRef.current = isOpen

  useLayoutEffect(() => {
    const el = innerRef.current
    if (!el) return

    let raf1 = 0
    let raf2 = 0
    let rafClose = 0

    if (!isOpen) {
      rafClose = requestAnimationFrame(() => {
        setHeightPx(0)
      })
      return () => {
        cancelAnimationFrame(rafClose)
      }
    }

    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        void el.getBoundingClientRect()
        setHeightPx(el.scrollHeight)
      })
    })

    const ro = new ResizeObserver(() => {
      const node = innerRef.current
      if (!node || !isOpenRef.current) return
      setHeightPx(node.scrollHeight)
    })
    ro.observe(el)

    return () => {
      cancelAnimationFrame(raf1)
      cancelAnimationFrame(raf2)
      cancelAnimationFrame(rafClose)
      ro.disconnect()
    }
  }, [isOpen])

  return (
    <div
      id={id}
      role="region"
      aria-labelledby={labelledBy}
      aria-hidden={!isOpen}
      className="public-accordion-host"
      style={{ height: heightPx }}
    >
      <div ref={innerRef} className="public-accordion-measure">
        {children}
      </div>
    </div>
  )
}
