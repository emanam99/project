import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Navigate, NavLink, useParams } from 'react-router-dom'
import type { WiridItem } from '../../../types/wirid'
import { groupByBab } from '../../../utils/groupByBab'
import { slugify } from '../../../utils/slug'
import { stripTags } from '../../../utils/text'
import { Breadcrumbs } from '../components/Breadcrumbs'

type Props = {
  rows: WiridItem[]
}

export function BabDetailPage({ rows }: Props) {
  const { babSlug } = useParams()
  const grouped = useMemo(() => groupByBab(rows), [rows])
  const entry = grouped.find(([bab]) => slugify(bab) === babSlug)
  const bab = entry?.[0] ?? ''
  const list = entry?.[1] ?? []
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
  const filteredList = useMemo(() => {
    if (!normalizedSearch) return list
    return list.filter((item) => item.judul.toLowerCase().includes(normalizedSearch))
  }, [list, normalizedSearch])

  if (!entry) return <Navigate to="/list" replace />

  return (
    <section className="page-block">
      <Breadcrumbs items={[{ label: 'List Bab', to: '/list' }, { label: bab }]} />
      <div className="page-head">
        <h2>{bab}</h2>
        <p>{list.length} wirid tersedia.</p>
      </div>
      <div className={`list-search-wrap${scrolled ? ' compact' : ''}`}>
        {!scrolled && (
          <label className="list-search-field" htmlFor="list-wirid-search">
            <span className="list-search-icon" aria-hidden="true">
              🔎
            </span>
            <input
              id="list-wirid-search"
              ref={searchInputRef}
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari judul wirid..."
              autoComplete="off"
            />
          </label>
        )}
        {scrolled && (
          <div className="list-search-compact-area">
            <AnimatePresence mode="wait" initial={false}>
              {searchOpen ? (
                <motion.div
                  key="search-open-wirid"
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
                    id="list-wirid-search"
                    ref={searchInputRef}
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Cari judul wirid..."
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
                  key="search-button-wirid"
                  type="button"
                  className="list-search-fab"
                  aria-label="Buka pencarian"
                  title="Cari judul wirid"
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
        {filteredList.map((item) => (
          <NavLink key={item.id} to={`/list/${babSlug}/${slugify(item.judul)}-${item.id}`} className="card link-card">
            <strong>{item.judul}</strong>
            <span>{stripTags(item.isi).slice(0, 140) || '-'}</span>
          </NavLink>
        ))}
        {filteredList.length === 0 && (
          <div className="card">
            <strong>Tidak ada hasil</strong>
            <span>Coba kata kunci lain untuk mencari judul wirid.</span>
          </div>
        )}
      </div>
    </section>
  )
}
