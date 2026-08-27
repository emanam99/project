import { useState, useEffect, useMemo, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { kitabAPI } from '../services/api'
import { useOffcanvasBackClose } from '../hooks/useOffcanvasBackClose'

const RESULT_LIMIT = 80

/** Di atas offcanvas form Mapel (z 10210/10211). */
export const CARI_KITAB_Z_BACKDROP = 10230
export const CARI_KITAB_Z_PANEL = 10231

function kitabListTitle(row) {
  const arab = String(row?.nama_arab ?? '').trim()
  return arab || String(row?.nama_indo ?? '').trim() || '—'
}

function kitabTitleIsArab(row) {
  return String(row?.nama_arab ?? '').trim() !== ''
}

function kitabMatchesSearch(row, query) {
  if (!query) return true
  const hay = [
    row?.nama_indo,
    row?.nama_arab,
    row?.penulis,
    row?.penerbit,
    row?.isbn,
    row?.fan,
    row?.id,
  ]
    .map((v) => String(v ?? '').toLowerCase())
    .join(' ')
  return hay.includes(query)
}

/**
 * Offcanvas Cari Kitab — pola sama Cari Santri: header, cari, filter, daftar.
 * Props:
 * - isOpen, onClose
 * - onSelect: (kitab) => void
 * - initialList: array kitab opsional (dari parent, tampil dulu sebelum fetch)
 */
export default function CariKitabOffcanvas({
  isOpen,
  onClose,
  onSelect,
  title = 'Cari Kitab',
  initialList = null,
  zIndexBackdrop = CARI_KITAB_Z_BACKDROP,
  zIndexPanel = CARI_KITAB_Z_PANEL,
}) {
  const handleClose = useOffcanvasBackClose(isOpen, onClose)
  const [kitabList, setKitabList] = useState(() => (Array.isArray(initialList) ? initialList : []))
  const [fanOptions, setFanOptions] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [fanFilter, setFanFilter] = useState('')
  const [penulisFilter, setPenulisFilter] = useState('')
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [isInputFocused, setIsInputFocused] = useState(false)
  const [displayCount, setDisplayCount] = useState(RESULT_LIMIT)

  const loadListFromServer = useCallback(async (opts = {}) => {
    const { syncUi } = opts
    if (syncUi) setSyncing(true)
    else setLoading(true)
    try {
      const [listRes, fanRes] = await Promise.all([kitabAPI.getList(), kitabAPI.getFanOptions()])
      const list = Array.isArray(listRes?.data) ? listRes.data : []
      setKitabList(list)
      if (fanRes?.success && Array.isArray(fanRes.data)) setFanOptions(fanRes.data)
    } catch {
      if (!syncUi) setKitabList([])
    } finally {
      if (syncUi) setSyncing(false)
      else setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!isOpen) return
    setSearchQuery('')
    setFanFilter('')
    setPenulisFilter('')
    setIsFilterOpen(false)
    setDisplayCount(RESULT_LIMIT)
    const seed = Array.isArray(initialList) ? initialList : []
    if (seed.length > 0) {
      setKitabList(seed)
      setLoading(false)
    }
    loadListFromServer({ syncUi: seed.length > 0 })
  }, [isOpen, loadListFromServer])

  useEffect(() => {
    if (!isOpen) return undefined
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  const penulisOptions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    const names = new Set()
    kitabList.forEach((row) => {
      if (fanFilter && String(row?.fan ?? '').trim() !== fanFilter) return
      if (!kitabMatchesSearch(row, q)) return
      const name = String(row?.penulis ?? '').trim()
      if (name) names.add(name)
    })
    return [...names].sort((a, b) => a.localeCompare(b, 'id'))
  }, [kitabList, fanFilter, searchQuery])

  useEffect(() => {
    if (penulisFilter && !penulisOptions.includes(penulisFilter)) setPenulisFilter('')
  }, [penulisOptions, penulisFilter])

  const fanSelectOptions = useMemo(() => {
    const fromList = new Set()
    kitabList.forEach((row) => {
      const fan = String(row?.fan ?? '').trim()
      if (fan) fromList.add(fan)
    })
    const merged = new Set([...(fanOptions || []), ...fromList])
    return [...merged].sort((a, b) => a.localeCompare(b, 'id'))
  }, [fanOptions, kitabList])

  const filteredList = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return kitabList.filter((row) => {
      if (fanFilter && String(row?.fan ?? '').trim() !== fanFilter) return false
      if (penulisFilter && String(row?.penulis ?? '').trim() !== penulisFilter) return false
      return kitabMatchesSearch(row, q)
    })
  }, [kitabList, searchQuery, fanFilter, penulisFilter])

  useEffect(() => {
    if (isOpen) setDisplayCount(RESULT_LIMIT)
  }, [isOpen, searchQuery, fanFilter, penulisFilter])

  const visibleList = useMemo(
    () => filteredList.slice(0, displayCount),
    [filteredList, displayCount]
  )
  const hasMore = filteredList.length > displayCount

  const resetAllFilters = () => {
    setSearchQuery('')
    setFanFilter('')
    setPenulisFilter('')
    setDisplayCount(RESULT_LIMIT)
  }

  const handleSelect = (row) => {
    onSelect?.(row)
    handleClose()
  }

  const content = (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            key="cari-kitab-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={handleClose}
            className="fixed inset-0 bg-black/50"
            style={{ zIndex: zIndexBackdrop }}
            aria-hidden="true"
          />
          <motion.div
            key="cari-kitab-panel"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'tween', duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
            className="fixed inset-y-0 right-0 w-full sm:w-96 lg:w-[500px] bg-white dark:bg-gray-800 shadow-xl flex flex-col"
            style={{ zIndex: zIndexPanel, willChange: 'transform' }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="cari-kitab-title"
            onClick={(ev) => ev.stopPropagation()}
          >
            <div className="flex-shrink-0 p-6 border-b border-gray-200 dark:border-gray-700">
              <div className="flex justify-between items-center mb-4">
                <h2 id="cari-kitab-title" className="text-xl font-semibold text-teal-600 dark:text-teal-400">
                  {title}
                </h2>
                <button
                  type="button"
                  onClick={handleClose}
                  className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                  aria-label="Tutup"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="relative pb-2">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onFocus={() => setIsInputFocused(true)}
                  onBlur={() => setIsInputFocused(false)}
                  className="w-full p-2 pr-[7.5rem] sm:pr-36 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
                  placeholder="Cari judul, penulis, penerbit, ISBN, fan…"
                  autoFocus
                />
                <div className="absolute right-0 top-0 bottom-0 flex items-center gap-0.5 pr-0.5 pointer-events-none">
                  <button
                    type="button"
                    onClick={() => setIsFilterOpen((v) => !v)}
                    className="bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 p-1.5 rounded text-xs flex items-center gap-1 transition-colors pointer-events-auto"
                    title={isFilterOpen ? 'Sembunyikan Filter' : 'Tampilkan Filter'}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                    </svg>
                    {isFilterOpen ? (
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 15l7-7 7 7" />
                      </svg>
                    ) : (
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                      </svg>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={resetAllFilters}
                    className="bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 p-1.5 rounded text-xs flex items-center justify-center transition-colors pointer-events-auto"
                    title="Reset filter & pencarian"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => loadListFromServer({ syncUi: true })}
                    disabled={syncing}
                    className="bg-teal-500 hover:bg-teal-600 disabled:opacity-50 text-white p-1.5 rounded text-xs flex items-center justify-center transition-colors pointer-events-auto"
                    title="Muat ulang daftar kitab"
                  >
                    {syncing ? (
                      <svg className="animate-spin w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                    )}
                  </button>
                </div>
                <div className="absolute left-0 right-0 bottom-0 h-0.5 bg-gray-300 dark:bg-gray-600" />
                <div
                  className={`absolute left-0 right-0 bottom-0 h-0.5 bg-teal-500 transition-opacity ${isInputFocused ? 'opacity-100' : 'opacity-0'}`}
                />
              </div>
            </div>

            <AnimatePresence>
              {isFilterOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50"
                >
                  <div className="px-4 py-2 flex flex-wrap gap-2">
                    <select
                      value={fanFilter}
                      onChange={(e) => setFanFilter(e.target.value)}
                      className="border border-gray-300 dark:border-gray-600 rounded p-1 h-7 min-w-0 text-xs bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-1 focus:ring-teal-400 flex-1"
                    >
                      <option value="">Semua fan</option>
                      {fanSelectOptions.map((f) => (
                        <option key={f} value={f}>
                          {f}
                        </option>
                      ))}
                    </select>
                    <select
                      value={penulisFilter}
                      onChange={(e) => setPenulisFilter(e.target.value)}
                      className="border border-gray-300 dark:border-gray-600 rounded p-1 h-7 min-w-0 text-xs bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-1 focus:ring-teal-400 flex-1"
                    >
                      <option value="">Semua penulis</option>
                      {penulisOptions.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="flex-1 overflow-y-auto min-h-0">
              {loading && kitabList.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 gap-2">
                  <div className="animate-spin rounded-full h-7 w-7 border-2 border-teal-600 border-t-transparent dark:border-teal-400" />
                  <span className="text-xs text-gray-500 dark:text-gray-400">Memuat data...</span>
                </div>
              ) : filteredList.length === 0 ? (
                <p className="text-gray-500 dark:text-gray-400 text-center py-8 text-xs px-4">
                  {searchQuery.trim() || fanFilter || penulisFilter
                    ? 'Tidak ada kitab yang cocok.'
                    : 'Belum ada data kitab.'}
                </p>
              ) : (
                <div className="divide-y divide-gray-100 dark:divide-gray-700/50">
                  {visibleList.map((row) => {
                    const isArab = kitabTitleIsArab(row)
                    const penulis = String(row?.penulis ?? '').trim()
                    const indo = String(row?.nama_indo ?? '').trim()
                    return (
                      <button
                        key={row.id}
                        type="button"
                        onClick={() => handleSelect(row)}
                        className="w-full text-left px-4 py-3 hover:bg-teal-50 dark:hover:bg-gray-700/50 focus:bg-teal-50 dark:focus:bg-gray-700/50 transition-colors focus:outline-none"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p
                              className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate"
                              dir={isArab ? 'rtl' : 'ltr'}
                            >
                              {kitabListTitle(row)}
                            </p>
                            {(penulis || (isArab && indo)) && (
                              <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 truncate" dir="ltr">
                                {isArab && indo ? indo : ''}
                                {isArab && indo && penulis ? ' · ' : ''}
                                {penulis || ''}
                              </p>
                            )}
                          </div>
                          {row.fan ? (
                            <span className="shrink-0 px-2 py-0.5 rounded-md text-xs font-medium bg-teal-50 dark:bg-teal-900/40 text-teal-800 dark:text-teal-200">
                              {row.fan}
                            </span>
                          ) : null}
                        </div>
                      </button>
                    )
                  })}
                  {filteredList.length > 0 && (
                    <div className="border-t border-gray-100 dark:border-gray-700/50 px-3 py-2 flex flex-col items-center gap-2">
                      <p className="text-[11px] text-gray-400 dark:text-gray-500 text-center">
                        {hasMore
                          ? `Menampilkan ${displayCount} dari ${filteredList.length} hasil`
                          : `Menampilkan ${filteredList.length} hasil`}
                      </p>
                      {hasMore && (
                        <button
                          type="button"
                          onClick={() => setDisplayCount((c) => Math.min(c + RESULT_LIMIT, filteredList.length))}
                          className="text-xs font-medium text-teal-600 dark:text-teal-400 hover:underline focus:outline-none"
                        >
                          Tampilkan lebih banyak
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )

  return createPortal(content, document.body)
}
