import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useMemo, useRef, useState } from 'react'
import { NavLink } from 'react-router-dom'
import type { WiridItem } from '../../../types/wirid'
import { groupByBab } from '../../../utils/groupByBab'
import { slugify } from '../../../utils/slug'

type Props = {
  rows: WiridItem[]
}

export function ListBabPage({ rows }: Props) {
  const grouped = useMemo(() => groupByBab(rows), [rows])
  const [search, setSearch] = useState('')
  const [scrolled, setScrolled] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const searchInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    const onScroll = () => {
      const next = window.scrollY > 72
      setScrolled(next)
      if (!next) setSearchOpen(false)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus()
  }, [searchOpen])

  const normalizedSearch = search.trim().toLowerCase()
  const filtered = useMemo(() => {
    if (!normalizedSearch) return grouped
    return grouped.filter(([bab]) => bab.toLowerCase().includes(normalizedSearch))
  }, [grouped, normalizedSearch])

  return (
    <section className="page-block">
      <div className="page-head">
        <h2>List Bab</h2>
        <p>Pilih bab untuk melihat daftar wirid/dzikir.</p>
      </div>
      <div className={`list-search-wrap${scrolled ? ' compact' : ''}`}>
        {!scrolled && (
          <label className="list-search-field" htmlFor="list-bab-search">
            <span className="list-search-icon" aria-hidden="true">
              🔎
            </span>
            <input
              id="list-bab-search"
              ref={searchInputRef}
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari bab..."
              autoComplete="off"
            />
          </label>
        )}
        {scrolled && (
          <div className="list-search-compact-area">
            <AnimatePresence mode="wait" initial={false}>
              {searchOpen ? (
                <motion.div
                  key="search-open"
                  className="list-search-field compact-open"
                  initial={{ width: 44, opacity: 0.7 }}
                  animate={{ width: 240, opacity: 1 }}
                  exit={{ width: 44, opacity: 0.6 }}
                  transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                >
                  <span className="list-search-icon" aria-hidden="true">
                    🔎
                  </span>
                  <input
                    id="list-bab-search"
                    ref={searchInputRef}
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Cari bab..."
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    className="list-search-close"
                    aria-label="Tutup pencarian"
                    onClick={() => setSearchOpen(false)}
                  >
                    ✕
                  </button>
                </motion.div>
              ) : (
                <motion.button
                  key="search-button"
                  type="button"
                  className="list-search-fab"
                  aria-label="Buka pencarian"
                  title="Cari bab"
                  initial={{ scale: 0.95, opacity: 0.6 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.95, opacity: 0.6 }}
                  onClick={() => setSearchOpen(true)}
                >
                  🔎
                </motion.button>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>
      <div className="cards">
        {filtered.map(([bab, list]) => (
          <NavLink key={bab} to={`/list/${slugify(bab)}`} className="card link-card">
            <strong>{bab}</strong>
            <span>{list.length} wirid</span>
          </NavLink>
        ))}
        {filtered.length === 0 && (
          <div className="card">
            <strong>Tidak ada hasil</strong>
            <span>Coba kata kunci lain untuk mencari bab.</span>
          </div>
        )}
      </div>
    </section>
  )
}
