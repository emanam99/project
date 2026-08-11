import { AnimatePresence, motion, useMotionValue, useTransform } from 'framer-motion'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useMainScrollEl } from '../../contexts/MainScrollContext'

/** Jarak scroll (px) untuk morf penuh: bar → ikon */
const SCROLL_RANGE = 96

/** Hysteresis: hindari flip cepat mode compact saat scroll elastis */
const COMPACT_ON = 0.58
const COMPACT_OFF = 0.38

type Props = {
  inputId: string
  placeholder: string
  search: string
  onSearchChange: (value: string) => void
}

export function ListSearchMorph({ inputId, placeholder, search, onSearchChange }: Props) {
  const mainScrollRef = useMainScrollEl()
  const compactProgress = useMotionValue(0)

  const barOpacity = useTransform(compactProgress, [0, 0.42], [1, 0], { clamp: true })
  const barScaleY = useTransform(compactProgress, [0, 0.5], [1, 0.88], { clamp: true })
  const barScaleX = useTransform(compactProgress, [0, 0.72], [1, 0.94], { clamp: true })
  const barFlexGrow = useTransform(compactProgress, [0, 0.88], [1, 0], { clamp: true })

  const fabOpacity = useTransform(compactProgress, [0.22, 0.82], [0, 1], { clamp: true })
  const fabScale = useTransform(compactProgress, [0.22, 1], [0.82, 1], { clamp: true })

  const [compactFixed, setCompactFixed] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const searchInputRef = useRef<HTMLInputElement | null>(null)

  useLayoutEffect(() => {
    let el: HTMLElement | null = null
    let raf = 0
    let cancelled = false
    let bindAttempts = 0
    const MAX_BIND_ATTEMPTS = 90

    const sync = () => {
      if (!el) return
      const maxScroll = Math.max(0, el.scrollHeight - el.clientHeight)
      const st = Math.min(maxScroll, Math.max(0, el.scrollTop))
      const p = Math.min(1, st / SCROLL_RANGE)
      compactProgress.set(p)

      setSearchOpen((open) => (open && p < 0.06 ? false : open))

      setCompactFixed((prev) => {
        if (!prev && p >= COMPACT_ON) return true
        if (prev && p <= COMPACT_OFF) return false
        return prev
      })
    }

    const bind = () => {
      if (cancelled) return
      el = mainScrollRef?.current ?? null
      if (!el) {
        bindAttempts += 1
        if (bindAttempts < MAX_BIND_ATTEMPTS) {
          raf = requestAnimationFrame(bind)
        }
        return
      }
      sync()
      el.addEventListener('scroll', sync, { passive: true })
    }

    bind()

    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
      if (el) el.removeEventListener('scroll', sync)
      el = null
    }
  }, [mainScrollRef, compactProgress])

  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus()
  }, [searchOpen])

  const openSearch = () => setSearchOpen(true)
  const closeSearch = () => setSearchOpen(false)

  return (
    <div className={`list-search-wrap${compactFixed ? ' compact' : ''}`}>
      {/*
        mode="wait": tutup panel dulu (exit), baru tampilkan morh — hindari 2 ikon sekaligus.
        Exit morh saat buka panel sangat singkat agar FAB tidak “kedip” lama.
      */}
      <AnimatePresence mode="wait" initial={false}>
        {searchOpen ? (
          <motion.div
            key="search-panel"
            className="list-search-field compact-open list-search-field--panel-only"
            initial={{ width: 44, opacity: 0.88 }}
            animate={{ width: 240, opacity: 1 }}
            exit={{ width: 44, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <input
              id={inputId}
              ref={searchInputRef}
              type="search"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={placeholder}
              autoComplete="off"
            />
            <button
              type="button"
              className="list-search-close"
              aria-label="Tutup pencarian"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation()
                closeSearch()
              }}
            >
              ✕
            </button>
          </motion.div>
        ) : (
          <motion.div
            key="search-morph"
            className="list-search-morph-row"
            initial={{ opacity: 1 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.1, ease: 'easeOut' }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <motion.div
              className="list-search-morph-bar"
              style={{
                flexGrow: barFlexGrow,
                flexShrink: 1,
                flexBasis: 0,
                minWidth: 0,
                opacity: barOpacity,
                scaleX: barScaleX,
                scaleY: barScaleY,
                transformOrigin: '100% 0%',
                overflow: 'hidden',
              }}
            >
              <label className="list-search-field list-search-field--icon-end" htmlFor={inputId}>
                <input
                  id={inputId}
                  ref={searchInputRef}
                  type="search"
                  value={search}
                  onChange={(e) => onSearchChange(e.target.value)}
                  placeholder={placeholder}
                  autoComplete="off"
                  enterKeyHint="search"
                />
                <span className="list-search-icon" aria-hidden="true">
                  🔎
                </span>
              </label>
            </motion.div>
            <motion.div
              className="list-search-morph-fab-slot"
              style={{
                flexGrow: 0,
                flexShrink: 0,
                flexBasis: 48,
                minWidth: 48,
                maxWidth: 48,
                opacity: fabOpacity,
                scale: fabScale,
                transformOrigin: '100% 0%',
              }}
            >
              <button
                type="button"
                className="list-search-fab"
                aria-label="Buka pencarian"
                title={placeholder}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation()
                  openSearch()
                }}
              >
                🔎
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
