import { useState, useEffect, useMemo, memo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { cashlessAPI } from '../../services/api'
import TambahTokoOffcanvas from './components/TambahTokoOffcanvas'

/** Komponen foto toko - fetch blob URL dan tampilkan. size = 'small' (list) | 'large' (grid). */
const TokoFotoImg = memo(function TokoFotoImg({ fotoPath, size = 'small' }) {
  const [blobUrl, setBlobUrl] = useState(null)
  useEffect(() => {
    if (!fotoPath || typeof fotoPath !== 'string') {
      setBlobUrl(null)
      return
    }
    let cancelled = false
    cashlessAPI.fetchFotoBlobUrl(fotoPath).then((url) => {
      if (!cancelled) setBlobUrl(url)
    }).catch(() => {
      if (!cancelled) setBlobUrl(null)
    })
    return () => { cancelled = true }
  }, [fotoPath])
  if (!fotoPath) {
    return (
      <div className={`flex items-center justify-center bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 ${size === 'small' ? 'w-10 h-10 rounded' : 'w-full h-full min-h-[120px] rounded-lg'}`}>
        <svg className={size === 'small' ? 'w-5 h-5' : 'w-12 h-12'} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
        </svg>
      </div>
    )
  }
  if (!blobUrl) {
    return (
      <div className={`flex items-center justify-center bg-gray-100 dark:bg-gray-700 animate-pulse ${size === 'small' ? 'w-10 h-10 rounded' : 'w-full h-full min-h-[120px] rounded-lg'}`} />
    )
  }
  return (
    <img
      src={blobUrl}
      alt="Foto toko"
      className={`object-cover bg-gray-100 dark:bg-gray-700 ${size === 'small' ? 'w-10 h-10 rounded flex-shrink-0' : 'w-full h-full min-h-[120px] rounded-lg'}`}
    />
  )
})

/** Bar pencarian + Menu (Tambah, List/Grid, Refresh) - mirip Data Madrasah */
const SearchAndMenuSection = memo(({ searchInput, onSearchInputChange, onSearchInputFocus, onSearchInputBlur, isInputFocused, onTambahClick, viewMode, onViewModeChange, onRefresh }) => {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false)
    }
    if (menuOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [menuOpen])

  const runAndClose = (fn) => {
    fn?.()
    setMenuOpen(false)
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 mb-4">
      <div className="relative pb-2 px-4 pt-3">
        <div className="relative">
          <input
            type="text"
            value={searchInput}
            onChange={(e) => onSearchInputChange(e.target.value)}
            onFocus={() => onSearchInputFocus?.()}
            onBlur={() => onSearchInputBlur?.()}
            onKeyDown={(e) => e.key === 'Enter' && onRefresh?.()}
            className="w-full p-2 pr-32 focus:outline-none bg-transparent dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400"
            placeholder="Cari nama atau kode toko..."
          />
          <div className="absolute right-0 top-0 bottom-0 flex items-center gap-1 pr-1 pointer-events-none">
            <div ref={menuRef} className="relative pointer-events-auto">
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                className="bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 p-1.5 rounded text-xs flex items-center gap-1 transition-colors"
                title="Menu"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
                Menu
              </button>
              <AnimatePresence>
                {menuOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 top-full mt-1 py-1 w-44 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-600 z-50"
                  >
                    <button
                      type="button"
                      onClick={() => runAndClose(onTambahClick)}
                      className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                      </svg>
                      Tambah
                    </button>
                    <div className="border-t border-gray-200 dark:border-gray-600 pt-2 mt-2 flex items-center justify-center gap-1">
                      <button
                        type="button"
                        onClick={() => runAndClose(() => onViewModeChange?.('list'))}
                        title="List (tabel)"
                        className={`p-2 rounded text-sm transition-colors ${viewMode === 'list' ? 'bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={() => runAndClose(() => onViewModeChange?.('grid'))}
                        title="Grid (kartu)"
                        className={`p-2 rounded text-sm transition-colors ${viewMode === 'grid' ? 'bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                        </svg>
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => runAndClose(onRefresh)}
                      className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 border-t border-gray-200 dark:border-gray-600 mt-1 pt-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      Refresh
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
        <div className="absolute left-0 right-0 bottom-0 h-0.5 bg-gray-300 dark:bg-gray-600" />
        <div className={`absolute left-0 right-0 bottom-0 h-0.5 bg-teal-500 transition-opacity ${isInputFocused ? 'opacity-100' : 'opacity-0'}`} />
      </div>
    </div>
  )
})

SearchAndMenuSection.displayName = 'SearchAndMenuSection'

export default function DataToko() {
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [searchInput, setSearchInput] = useState('')
  const [viewMode, setViewMode] = useState('grid')
  const [page, setPage] = useState(1)
  const [perPage] = useState(20)
  const [pagination, setPagination] = useState({ total: 0, total_pages: 0 })
  const [showTambahOffcanvas, setShowTambahOffcanvas] = useState(false)
  const [editingToko, setEditingToko] = useState(null)
  const [isInputFocused, setIsInputFocused] = useState(false)

  const openTambah = () => {
    setEditingToko(null)
    setShowTambahOffcanvas(true)
  }
  const openEdit = (t) => {
    setEditingToko(t)
    setShowTambahOffcanvas(true)
  }
  const closeOffcanvas = () => {
    setShowTambahOffcanvas(false)
    setEditingToko(null)
  }

  const loadToko = async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await cashlessAPI.getTokoList({
        page,
        limit: perPage,
        search: searchInput.trim() || undefined
      })
      if (res.success) {
        setList(res.data || [])
        setPagination(res.pagination || { total: 0, total_pages: 0 })
      } else {
        setError(res.message || 'Gagal memuat data toko')
      }
    } catch (err) {
      console.error('Error loading toko:', err)
      setError('Terjadi kesalahan saat memuat data toko')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadToko()
  }, [page])

  const handleSearch = () => {
    setPage(1)
    loadToko()
  }

  const totalPages = Math.max(1, pagination.total_pages || 1)
  const safePage = Math.min(Math.max(1, page), totalPages)

  if (loading && list.length === 0) {
    return (
      <div className="flex items-center justify-center h-full min-h-[200px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600" />
      </div>
    )
  }

  return (
    <div className="h-full overflow-hidden flex flex-col">
      <div className="flex-shrink-0 p-4 sm:p-6 lg:p-8">
        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-4">
            <p className="text-red-800 dark:text-red-200">{error}</p>
          </div>
        )}

        <SearchAndMenuSection
          searchInput={searchInput}
          onSearchInputChange={setSearchInput}
          onSearchInputFocus={() => setIsInputFocused(true)}
          onSearchInputBlur={() => setIsInputFocused(false)}
          isInputFocused={isInputFocused}
          onTambahClick={openTambah}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          onRefresh={handleSearch}
        />
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 lg:px-8 pb-4 sm:pb-6 lg:pb-8">
        {pagination.total > 0 && (
          <div className="flex flex-wrap items-center gap-3 mb-3">
            <span className="text-xs text-gray-600 dark:text-gray-400">
              {list.length === 0 ? '0' : `${(safePage - 1) * perPage + 1}–${Math.min(safePage * perPage, pagination.total)}`} dari {pagination.total}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={safePage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="p-1.5 rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" /></svg>
              </button>
              <span className="text-xs px-1 min-w-[4rem] text-center text-gray-600 dark:text-gray-400">Hal. {safePage} / {totalPages}</span>
              <button
                type="button"
                disabled={safePage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="p-1.5 rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" /></svg>
              </button>
            </div>
          </div>
        )}

        {list.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-8 text-center text-gray-500 dark:text-gray-400">
            {pagination.total === 0 && !loading
              ? 'Belum ada data toko. Klik Menu → Tambah untuk menambahkan toko.'
              : 'Tidak ada hasil yang cocok.'}
          </div>
        ) : viewMode === 'list' ? (
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-gray-900">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase w-14">Foto</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase w-12">No</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Nama Toko</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Kode</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">User Login</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Tanggal Dibuat</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {list.map((t, index) => (
                    <tr
                      key={t.id}
                      onClick={() => openEdit(t)}
                      className="hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer"
                    >
                      <td className="px-3 py-2">
                        <TokoFotoImg fotoPath={t.foto_path} size="small" />
                      </td>
                      <td className="px-3 py-2 text-sm text-gray-600 dark:text-gray-400">{(safePage - 1) * perPage + index + 1}</td>
                      <td className="px-3 py-2 font-medium text-gray-900 dark:text-gray-100">{t.nama_toko || '-'}</td>
                      <td className="px-3 py-2 text-sm text-gray-600 dark:text-gray-400">{t.kode_toko || '-'}</td>
                      <td className="px-3 py-2 text-sm text-gray-600 dark:text-gray-400">{t.user_username || (t.id_users ? '—' : 'Belum dihubungkan')}</td>
                      <td className="px-3 py-2 text-sm text-gray-600 dark:text-gray-400">{t.tanggal_dibuat ? new Date(t.tanggal_dibuat).toLocaleDateString('id-ID') : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 md:gap-4">
            <AnimatePresence>
              {list.map((t, index) => (
                <motion.div
                  key={t.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.02 }}
                  onClick={() => openEdit(t)}
                  className="bg-white dark:bg-gray-800 rounded-lg shadow-md border border-gray-200 dark:border-gray-700 overflow-hidden grid grid-rows-[3fr_1fr] aspect-[3/4] min-h-0 cursor-pointer"
                >
                  <div className="min-h-0 h-full overflow-hidden rounded-t-lg">
                    <TokoFotoImg fotoPath={t.foto_path} size="large" />
                  </div>
                  <div className="p-2 sm:p-3 flex flex-col justify-center min-h-0 overflow-hidden gap-0.5">
                    <h3 className="text-xs sm:text-sm font-semibold text-gray-800 dark:text-gray-200 truncate" title={t.nama_toko || '-'}>
                      {t.nama_toko || '-'}
                    </h3>
                    <p className="text-[10px] sm:text-xs text-gray-600 dark:text-gray-400">Kode: {t.kode_toko || '-'}</p>
                    <p className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-500 truncate" title={t.user_username || ''}>
                      {t.user_username || '—'}
                    </p>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {createPortal(
        <TambahTokoOffcanvas
          isOpen={showTambahOffcanvas}
          onClose={closeOffcanvas}
          onSuccess={() => { loadToko(); }}
          initialData={editingToko}
        />,
        document.body
      )}
    </div>
  )
}
