import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import type { WiridBabMeta, WiridItem } from '../../types/wirid'
import { groupByBab, wiridBabLabel } from '../../utils/groupByBab'
import { slugify } from '../../utils/slug'
import { resolveBabLabel, resolveWiridTitle, babNameSearchText, wiridTitleSearchText } from '../../utils/wiridTitle'
import { useTitleLang } from '../../hooks/useTitleLang'

type Props = {
  isOpen: boolean
  onClose: () => void
  /** Navigasi ke wirid — tutup offcanvas tanpa history.back() setelah navigate */
  onPickWirid: (path: string) => void
  rows: WiridItem[]
  babList: WiridBabMeta[]
  currentBabSlug?: string
  currentWiridId?: number
}

export function ReaderPickOffcanvas({
  isOpen,
  onClose,
  onPickWirid,
  rows,
  babList,
  currentBabSlug,
  currentWiridId,
}: Props) {
  const { lang: titleLang } = useTitleLang()
  const [search, setSearch] = useState('')
  const [pickedBab, setPickedBab] = useState<string | null>(null)

  const grouped = useMemo(() => groupByBab(rows, babList), [rows, babList])

  useEffect(() => {
    if (!isOpen) {
      setSearch('')
      setPickedBab(null)
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (pickedBab) setPickedBab(null)
        else onClose()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [isOpen, onClose, pickedBab])

  const q = search.trim().toLowerCase()

  const filteredBab = useMemo(() => {
    if (!q) return grouped
    return grouped.filter(([canonical, list]) => {
      const meta = babList.find((b) => b.nama === canonical)
      const label = resolveBabLabel(canonical, babList, titleLang).toLowerCase()
      const metaText = meta ? babNameSearchText(meta) : canonical.toLowerCase()
      if (label.includes(q) || metaText.includes(q)) return true
      return list.some((w) => wiridTitleSearchText(w).includes(q))
    })
  }, [grouped, q, babList, titleLang])

  const wiridInPicked = useMemo(() => {
    if (!pickedBab) return []
    const entry = grouped.find(([b]) => b === pickedBab)
    let list = entry?.[1] ?? []
    if (q) list = list.filter((w) => wiridTitleSearchText(w).includes(q))
    return list
  }, [grouped, pickedBab, q])

  const pickWirid = (item: WiridItem) => {
    const babLabel = pickedBab || wiridBabLabel(item.bab)
    const path = `/list/${slugify(babLabel)}/${slugify(item.judul)}-${item.id}`
    onPickWirid(path)
  }

  if (typeof document === 'undefined') return null

  const t = { type: 'tween' as const, duration: 0.28, ease: [0.32, 0.72, 0, 1] as const }

  return createPortal(
    <AnimatePresence mode="sync">
      {isOpen && (
        <motion.div
          key="reader-pick-layer"
          className="reader-pick-offcanvas-layer"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22 }}
        >
          <button type="button" className="reader-pick-offcanvas-backdrop" aria-label="Tutup" onClick={onClose} />
          <motion.aside
            className="reader-pick-offcanvas"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={t}
            role="dialog"
            aria-modal="true"
            aria-label="Pilih bacaan"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="reader-pick-offcanvas__head">
              {pickedBab ? (
                <button
                  type="button"
                  className="reader-pick-offcanvas__back"
                  onClick={() => setPickedBab(null)}
                  aria-label="Kembali ke daftar bab"
                >
                  ←
                </button>
              ) : (
                <span className="reader-pick-offcanvas__back-spacer" aria-hidden />
              )}
              <div className="reader-pick-offcanvas__head-text">
                <h2 className="reader-pick-offcanvas__title">
                  {pickedBab ? resolveBabLabel(pickedBab, babList, titleLang) : 'Pilih bacaan'}
                </h2>
                {!pickedBab && (
                  <p className="reader-pick-offcanvas__subtitle">Tanpa keluar halaman baca</p>
                )}
              </div>
              <button type="button" className="reader-pick-offcanvas__close" onClick={onClose} aria-label="Tutup">
                ×
              </button>
            </div>

            <div className="reader-pick-offcanvas__search-wrap">
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={pickedBab ? 'Cari judul wirid…' : 'Cari bab atau judul…'}
                className="reader-pick-offcanvas__search"
                autoComplete="off"
              />
            </div>

            <div className="reader-pick-offcanvas__body">
              {!pickedBab ? (
                <ul className="reader-pick-list">
                  {filteredBab.map(([canonical, list]) => {
                    const label = resolveBabLabel(canonical, babList, titleLang)
                    const isArab = titleLang === 'ar'
                    return (
                    <li key={canonical}>
                      <button
                        type="button"
                        className={`reader-pick-bab-btn${slugify(canonical) === currentBabSlug ? ' reader-pick-bab-btn--current' : ''}`}
                        onClick={() => setPickedBab(canonical)}
                      >
                        <span className={`reader-pick-bab-btn__name${isArab ? ' reader-pick-bab-btn__name--ar' : ''}`} dir={isArab ? 'rtl' : undefined} lang={isArab ? 'ar' : 'id'}>
                          {label}
                        </span>
                        <span className="reader-pick-bab-btn__meta">{list.length} wirid</span>
                      </button>
                    </li>
                    )
                  })}
                  {filteredBab.length === 0 && (
                    <p className="reader-pick-empty">Tidak ada bab yang cocok.</p>
                  )}
                </ul>
              ) : (
                <ul className="reader-pick-list reader-pick-list--wirid">
                  {wiridInPicked.map((item, index) => {
                    const babLabel = pickedBab || wiridBabLabel(item.bab)
                    const active =
                      item.id === currentWiridId && slugify(babLabel) === currentBabSlug
                    return (
                      <li key={item.id}>
                        <button
                          type="button"
                          className={`reader-pick-wirid-btn${active ? ' reader-pick-wirid-btn--active' : ''}`}
                          onClick={() => pickWirid(item)}
                        >
                          <span className="reader-pick-wirid-btn__index" aria-hidden>
                            {String(index + 1).padStart(2, '0')}
                          </span>
                          <span
                            className={`reader-pick-wirid-btn__title${titleLang === 'ar' ? ' reader-pick-wirid-btn__title--ar' : ''}`}
                          >
                            {resolveWiridTitle(item, titleLang)}
                          </span>
                          {active ? (
                            <span className="reader-pick-wirid-btn__badge">Sedang dibaca</span>
                          ) : (
                            <span className="reader-pick-wirid-btn__chevron" aria-hidden>
                              ›
                            </span>
                          )}
                        </button>
                      </li>
                    )
                  })}
                  {wiridInPicked.length === 0 && (
                    <p className="reader-pick-empty">Tidak ada wirid yang cocok.</p>
                  )}
                </ul>
              )}
            </div>
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}
