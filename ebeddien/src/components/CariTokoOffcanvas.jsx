import { useState, useEffect, useMemo, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { manageUsersAPI } from '../services/api'

const RESULT_LIMIT = 80

/** Di atas panel Edit User (z 201). */
export const CARI_TOKO_Z_BACKDROP = 220
export const CARI_TOKO_Z_PANEL = 221

/**
 * Offcanvas cari toko cashless — pola mirip Cari Santri / Cari Pengurus.
 * Props:
 * - isOpen, onClose
 * - onSelect: (toko) => void — { id, nama_toko, kode_toko }
 * - excludeIds: number[] — toko yang sudah tertaut (disembunyikan dari daftar)
 */
export default function CariTokoOffcanvas({
  isOpen,
  onClose,
  onSelect,
  title = 'Cari Toko',
  excludeIds = [],
  zIndexBackdrop = CARI_TOKO_Z_BACKDROP,
  zIndexPanel = CARI_TOKO_Z_PANEL,
}) {
  const [tokoList, setTokoList] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [isInputFocused, setIsInputFocused] = useState(false)
  const [displayCount, setDisplayCount] = useState(RESULT_LIMIT)

  const excludeSet = useMemo(() => new Set((excludeIds || []).map((id) => Number(id))), [excludeIds])

  const loadListFromServer = useCallback(async (opts = {}) => {
    const { syncUi } = opts
    if (syncUi) setSyncing(true)
    else setLoading(true)
    try {
      const res = await manageUsersAPI.getTokoOptions()
      const list = Array.isArray(res?.data) ? res.data : []
      setTokoList(list)
    } catch {
      setTokoList([])
    } finally {
      if (syncUi) setSyncing(false)
      else setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!isOpen) return
    setSearchQuery('')
    setDisplayCount(RESULT_LIMIT)
    loadListFromServer()
  }, [isOpen, loadListFromServer])

  useEffect(() => {
    if (!isOpen) return undefined
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [isOpen])

  const filteredList = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return tokoList.filter((t) => {
      if (excludeSet.has(Number(t.id))) return false
      if (!q) return true
      const nama = String(t.nama_toko || '').toLowerCase()
      const kode = String(t.kode_toko || '').toLowerCase()
      const pj = String(t.penanggung_jawab_nama || '').toLowerCase()
      return nama.includes(q) || kode.includes(q) || pj.includes(q)
    })
  }, [tokoList, searchQuery, excludeSet])

  const visibleList = useMemo(
    () => filteredList.slice(0, displayCount),
    [filteredList, displayCount]
  )

  const handleSelect = (t) => {
    onSelect?.({
      id: Number(t.id),
      nama_toko: t.nama_toko || '',
      kode_toko: t.kode_toko || '',
    })
    onClose?.()
  }

  const content = (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            key="cari-toko-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/50"
            style={{ zIndex: zIndexBackdrop }}
            aria-hidden="true"
          />
          <motion.div
            key="cari-toko-panel"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'tween', duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
            className="fixed inset-y-0 left-4 right-4 sm:left-auto sm:right-0 w-full max-w-md sm:w-[28rem] mx-auto sm:mx-0 bg-white dark:bg-gray-800 shadow-xl flex flex-col rounded-l-2xl overflow-hidden"
            style={{ zIndex: zIndexPanel }}
          >
            <div className="flex-shrink-0 p-3 sm:p-4 border-b border-gray-200 dark:border-gray-700">
              <div className="flex justify-between items-center mb-3">
                <h2 className="text-base font-semibold text-teal-600 dark:text-teal-400">{title}</h2>
                <button
                  type="button"
                  onClick={onClose}
                  className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-gray-400"
                  aria-label="Tutup"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                Pilih toko yang belum punya akun login. Ketuk baris untuk menautkan ke user ini.
              </p>
              <div className="relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => { setSearchQuery(e.target.value); setDisplayCount(RESULT_LIMIT) }}
                  onFocus={() => setIsInputFocused(true)}
                  onBlur={() => setIsInputFocused(false)}
                  className="w-full p-1.5 pr-12 text-sm focus:outline-none bg-transparent text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
                  placeholder="Cari nama atau kode toko..."
                  autoFocus
                />
                <div className="absolute right-0 top-0 bottom-0 flex items-center pr-0.5 pointer-events-none">
                  <button
                    type="button"
                    onClick={() => loadListFromServer({ syncUi: true })}
                    disabled={syncing}
                    className="pointer-events-auto bg-teal-500 hover:bg-teal-600 disabled:opacity-50 text-white px-1.5 py-1 rounded-md text-[11px] flex items-center transition-colors"
                    title="Muat ulang daftar toko"
                  >
                    {syncing ? (
                      <svg className="animate-spin w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                    ) : (
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                    )}
                  </button>
                </div>
                <div className="absolute left-0 right-0 bottom-0 h-0.5 bg-gray-300 dark:bg-gray-600" />
                <div className={`absolute left-0 right-0 bottom-0 h-0.5 bg-teal-500 transition-opacity ${isInputFocused ? 'opacity-100' : 'opacity-0'}`} />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto min-h-0">
              {loading ? (
                <div className="flex flex-col items-center justify-center py-8 gap-2">
                  <div className="animate-spin rounded-full h-7 w-7 border-2 border-teal-600 border-t-transparent dark:border-teal-400" />
                  <span className="text-xs text-gray-500 dark:text-gray-400">Memuat data...</span>
                </div>
              ) : filteredList.length === 0 ? (
                <p className="text-gray-500 dark:text-gray-400 text-center py-8 text-xs px-4">
                  {searchQuery.trim()
                    ? 'Tidak ada toko yang cocok.'
                    : 'Semua toko sudah punya akun atau belum ada data toko di Cashless.'}
                </p>
              ) : (
                <div className="divide-y divide-gray-100 dark:divide-gray-700/50">
                  {visibleList.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => handleSelect(t)}
                      className="w-full text-left px-3 sm:px-4 py-3 hover:bg-teal-50 dark:hover:bg-gray-700/50 focus:bg-teal-50 dark:focus:bg-gray-700/50 transition-colors"
                    >
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{t.nama_toko || '—'}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Kode: {t.kode_toko || '—'}</p>
                    </button>
                  ))}
                </div>
              )}
              {filteredList.length > visibleList.length && (
                <div className="p-3 text-center border-t border-gray-100 dark:border-gray-700">
                  <button
                    type="button"
                    onClick={() => setDisplayCount((c) => c + RESULT_LIMIT)}
                    className="text-xs text-teal-600 dark:text-teal-400 hover:underline"
                  >
                    Tampilkan lebih banyak ({filteredList.length - visibleList.length} lagi)
                  </button>
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
