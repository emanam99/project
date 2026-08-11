import { useState, useEffect, useMemo, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { madrasahAPI } from '../services/api'
import { matchMadrasahLocalSearch } from '../utils/madrasahSearchFilter'

const RESULT_LIMIT = 100
const zIndexBackdrop = 100020
const zIndexPanel = 100021

function formatAlamatMadrasah(m) {
  if (!m) return ''
  const parts = [
    m.dusun,
    m.rt ? `RT ${m.rt}` : '',
    m.rw ? `RW ${m.rw}` : '',
    m.desa,
    m.kecamatan,
    m.kabupaten,
    m.provinsi
  ].filter(Boolean)
  return parts.join(', ')
}

/**
 * Offcanvas cari madrasah (UGT) — pola mirip Cari Pengurus: search + daftar.
 * @param {{ isOpen: boolean, onClose: () => void, onSelect: (m: object) => void, title?: string }} props
 */
export default function CariMadrasahOffcanvas({ isOpen, onClose, onSelect, title = 'Cari Madrasah' }) {
  const [list, setList] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [displayCount, setDisplayCount] = useState(RESULT_LIMIT)

  const loadList = useCallback(async () => {
    setLoading(true)
    try {
      const res = await madrasahAPI.getAll()
      const rows = Array.isArray(res?.data) ? res.data : []
      setList(rows)
    } catch {
      setList([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!isOpen) return
    setSearchQuery('')
    setDisplayCount(RESULT_LIMIT)
    loadList()
  }, [isOpen, loadList])

  useEffect(() => {
    if (isOpen) document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  const q = (searchQuery || '').trim().toLowerCase()

  const filtered = useMemo(() => {
    if (!q) return list
    return list.filter((m) => matchMadrasahLocalSearch(m, q, formatAlamatMadrasah))
  }, [list, q])

  const visible = useMemo(() => filtered.slice(0, displayCount), [filtered, displayCount])

  if (typeof document === 'undefined') return null

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            key="cari-madrasah-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/45 backdrop-blur-sm"
            style={{ zIndex: zIndexBackdrop }}
            onClick={onClose}
            aria-hidden="true"
          />
          <motion.div
            key="cari-madrasah-panel"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'tween', duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
            className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-gray-50 dark:bg-gray-900 shadow-2xl flex flex-col rounded-l-2xl overflow-hidden border-l border-gray-200 dark:border-gray-700"
            style={{ zIndex: zIndexPanel }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="cari-madrasah-title"
          >
            <div className="flex-shrink-0 px-4 pt-4 pb-3 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between gap-2 mb-3">
                <h2 id="cari-madrasah-title" className="text-base font-semibold text-gray-900 dark:text-white truncate">
                  {title}
                </h2>
                <button
                  type="button"
                  onClick={onClose}
                  className="p-2 rounded-xl text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-gray-400 shrink-0"
                  aria-label="Tutup"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </span>
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value)
                    setDisplayCount(RESULT_LIMIT)
                  }}
                  placeholder="Nama, identitas madrasah, kategori, alamat, ID…"
                  className="w-full pl-10 pr-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500 outline-none"
                  autoComplete="off"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-3 py-3">
              {loading ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                  <div className="animate-spin rounded-full h-10 w-10 border-2 border-teal-500 border-t-transparent" />
                  <p className="text-sm text-gray-500 dark:text-gray-400">Memuat madrasah…</p>
                </div>
              ) : filtered.length === 0 ? (
                <p className="text-sm text-center text-gray-500 dark:text-gray-400 py-8">
                  {list.length === 0 ? 'Belum ada data madrasah.' : 'Tidak cocok dengan pencarian.'}
                </p>
              ) : (
                <ul className="space-y-2">
                  {visible.map((m) => {
                    const alamat = formatAlamatMadrasah(m)
                    return (
                      <li key={m.id}>
                        <button
                          type="button"
                          onClick={() => {
                            onSelect?.(m)
                            onClose()
                          }}
                          className="w-full text-left rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-3 hover:border-teal-400 dark:hover:border-teal-500 hover:bg-teal-50/50 dark:hover:bg-teal-900/10 transition-colors"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <span className="font-medium text-gray-900 dark:text-gray-100 text-sm">{m.nama || `ID ${m.id}`}</span>
                            <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0">#{m.id}</span>
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-1.5">
                            {m.identitas ? (
                              <span className="text-xs font-mono text-teal-800 dark:text-teal-300">
                                {m.identitas}
                              </span>
                            ) : null}
                            {m.kategori ? (
                              <span className="inline-block text-xs px-2 py-0.5 rounded-md bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                                {m.kategori}
                              </span>
                            ) : null}
                          </div>
                          {alamat && (
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5 line-clamp-2">{alamat}</p>
                          )}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
              {!loading && filtered.length > visible.length && (
                <button
                  type="button"
                  onClick={() => setDisplayCount((c) => c + RESULT_LIMIT)}
                  className="w-full mt-3 py-2.5 text-sm font-medium text-teal-600 dark:text-teal-400 border border-dashed border-teal-300 dark:border-teal-700 rounded-xl hover:bg-teal-50 dark:hover:bg-teal-900/20"
                >
                  Muat lebih banyak ({filtered.length - visible.length} sisanya)
                </button>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  )
}
