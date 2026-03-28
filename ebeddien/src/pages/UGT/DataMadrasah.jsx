import { useState, useEffect, useMemo, useRef, memo, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import * as XLSX from 'xlsx'
import { madrasahAPI, pengurusAPI } from '../../services/api'
import { useNotification } from '../../contexts/NotificationContext'
import { useAuthStore } from '../../store/authStore'
import { useMadrasahDataFiturAccess } from '../../hooks/useMadrasahDataFiturAccess'
import { EXPORT_COLUMNS } from './exportMadrasahConfig'
import TambahMadrasahOffcanvas from './components/TambahMadrasahOffcanvas'
import CariKoordinatorOffcanvas from './components/CariKoordinatorOffcanvas'
import ExportMadrasahOffcanvas from './components/ExportMadrasahOffcanvas'
import ImportMadrasahOffcanvas from './components/ImportMadrasahOffcanvas'
import BulkEditMadrasahOffcanvas from './components/BulkEditMadrasahOffcanvas'

const KATEGORI_OPTIONS = ['Madrasah', 'Pesantren', 'Yayasan', 'Sekolah', 'Lainnya']
const KURIKULUM_OPTIONS = ['Depag', 'Diniyah (Mandiri)']
const STATUS_OPTIONS = ['Pendaftar Baru', 'Belum Survei', 'Sudah Survei', 'Penerima', 'Tidak Aktif']
/** Warna badge status di grid: variasi per status */
const STATUS_BADGE_CLASS = {
  'Pendaftar Baru': 'bg-blue-600/90 text-white',
  'Belum Survei': 'bg-amber-500/90 text-white',
  'Sudah Survei': 'bg-cyan-600/90 text-white',
  'Penerima': 'bg-emerald-600/90 text-white',
  'Tidak Aktif': 'bg-gray-500/90 text-white'
}
function getStatusBadgeClass(status) {
  return STATUS_BADGE_CLASS[status] ?? 'bg-teal-600/90 text-white'
}

/** Komponen foto/logo madrasah: fetch blob URL (dari cache/API). size = small | large (grid) | logo (thumbnail logo, object-contain). */
const MadrasahFotoImg = memo(function MadrasahFotoImg({ fotoPath, size = 'small' }) {
  const [blobUrl, setBlobUrl] = useState(null)
  useEffect(() => {
    if (!fotoPath || typeof fotoPath !== 'string') {
      setBlobUrl(null)
      return
    }
    let cancelled = false
    madrasahAPI.fetchFotoBlobUrl(fotoPath).then((url) => {
      if (!cancelled) setBlobUrl(url)
    }).catch(() => {
      if (!cancelled) setBlobUrl(null)
    })
    return () => { cancelled = true }
  }, [fotoPath])
  const boxClass =
    size === 'logo'
      ? 'w-8 h-8 rounded flex-shrink-0'
      : size === 'small'
        ? 'w-10 h-10 rounded'
        : 'w-full h-full min-h-[120px] rounded-lg'
  if (!fotoPath) {
    return (
      <div className={`flex items-center justify-center bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 ${boxClass}`}>
        <svg className={size === 'large' ? 'w-12 h-12' : 'w-5 h-5'} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14" />
        </svg>
      </div>
    )
  }
  if (!blobUrl) {
    return (
      <div className={`flex items-center justify-center bg-gray-100 dark:bg-gray-700 animate-pulse ${boxClass}`} />
    )
  }
  const imgClass =
    size === 'logo'
      ? 'w-8 h-8 rounded object-contain bg-white/90 dark:bg-gray-800/90 p-0.5 flex-shrink-0 border border-gray-200/80 dark:border-gray-600'
      : size === 'small'
        ? 'w-10 h-10 rounded object-cover bg-gray-100 dark:bg-gray-700 flex-shrink-0'
        : 'w-full h-full min-h-[120px] rounded-lg object-cover bg-gray-100 dark:bg-gray-700'
  return (
    <img
      src={blobUrl}
      alt={size === 'logo' ? 'Logo madrasah' : 'Foto madrasah'}
      className={imgClass}
    />
  )
})

const SearchAndFilterSection = memo(({
  searchInput,
  onSearchInputChange,
  onSearchInputFocus,
  onSearchInputBlur,
  isInputFocused,
  isFilterOpen,
  onFilterToggle,
  onTambahClick,
  onExportClick,
  onImportClick,
  onTemplateClick,
  kategoriFilter,
  onKategoriFilterChange,
  statusFilter,
  onStatusFilterChange,
  kurikulumFilter,
  onKurikulumFilterChange,
  dusunFilter,
  onDusunFilterChange,
  desaFilter,
  onDesaFilterChange,
  kecamatanFilter,
  onKecamatanFilterChange,
  kabupatenFilter,
  onKabupatenFilterChange,
  provinsiFilter,
  onProvinsiFilterChange,
  koordinatorFilter,
  onKoordinatorFilterChange,
  sektorFilter,
  onSektorFilterChange,
  dusunOptions,
  desaOptions,
  kecamatanOptions,
  kabupatenOptions,
  provinsiOptions,
  koordinatorOptions,
  sektorOptions,
  viewMode,
  onViewModeChange,
  koordinatorLocked = false,
  onRefresh
}) => {
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
            onChange={onSearchInputChange}
            onFocus={onSearchInputFocus}
            onBlur={onSearchInputBlur}
            className="w-full p-2 pr-32 focus:outline-none bg-transparent dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400"
            placeholder="Cari nama, kategori, status, pengasuh, PJGT..."
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
                    <button
                      type="button"
                      onClick={() => runAndClose(onExportClick)}
                      className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      Export
                    </button>
                    <button
                      type="button"
                      onClick={() => runAndClose(onImportClick)}
                      className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                      Import
                    </button>
                    <button
                      type="button"
                      onClick={() => runAndClose(onTemplateClick)}
                      className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      Template
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
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                        </svg>
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <button
              type="button"
              onClick={onFilterToggle}
              className="bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 p-1.5 rounded text-xs flex items-center gap-1 transition-colors pointer-events-auto"
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
            {onRefresh && (
              <button
                type="button"
                onClick={onRefresh}
                className="bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 p-1.5 rounded text-xs flex items-center justify-center transition-colors pointer-events-auto"
                title="Refresh data"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
            )}
          </div>
        </div>
        <div className="absolute left-0 right-0 bottom-0 h-0.5 bg-gray-300 dark:bg-gray-600" />
        <div className={`absolute left-0 right-0 bottom-0 h-0.5 bg-teal-500 transition-opacity ${isInputFocused ? 'opacity-100' : 'opacity-0'}`} />
      </div>

      <AnimatePresence>
        {isFilterOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden border-b bg-gray-50 dark:bg-gray-700/50"
          >
            <div className="px-4 py-3 space-y-3">
              <div className="flex flex-wrap gap-3 items-center">
                <span className="text-xs text-gray-600 dark:text-gray-400">Kategori:</span>
                <select
                  value={kategoriFilter}
                  onChange={onKategoriFilterChange}
                  className="border rounded p-1.5 h-8 min-w-0 text-xs bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 focus:ring-1 focus:ring-teal-400"
                >
                  <option value="">Semua</option>
                  {KATEGORI_OPTIONS.map((k) => (
                    <option key={k} value={k}>{k}</option>
                  ))}
                </select>
                <span className="text-xs text-gray-600 dark:text-gray-400 ml-1">Status:</span>
                <select
                  value={statusFilter}
                  onChange={onStatusFilterChange}
                  className="border rounded p-1.5 h-8 min-w-0 text-xs bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 focus:ring-1 focus:ring-teal-400"
                >
                  <option value="">Semua</option>
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
                <span className="text-xs text-gray-600 dark:text-gray-400 ml-1">Kurikulum:</span>
                <select
                  value={kurikulumFilter}
                  onChange={onKurikulumFilterChange}
                  className="border rounded p-1.5 h-8 min-w-0 text-xs bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 focus:ring-1 focus:ring-teal-400"
                >
                  <option value="">Semua</option>
                  {KURIKULUM_OPTIONS.map((k) => (
                    <option key={k} value={k}>{k}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-wrap gap-2 items-center">
                <span className="text-xs text-gray-600 dark:text-gray-400 w-full sm:w-auto">Alamat:</span>
                <select
                  value={dusunFilter}
                  onChange={onDusunFilterChange}
                  className="border rounded p-1.5 h-8 min-w-0 text-xs bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 focus:ring-1 focus:ring-teal-400 max-w-[140px]"
                >
                  <option value="">Semua Dusun</option>
                  {dusunOptions.map((v) => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
                <select
                  value={desaFilter}
                  onChange={onDesaFilterChange}
                  className="border rounded p-1.5 h-8 min-w-0 text-xs bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 focus:ring-1 focus:ring-teal-400 max-w-[140px]"
                >
                  <option value="">Semua Desa</option>
                  {desaOptions.map((v) => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
                <select
                  value={kecamatanFilter}
                  onChange={onKecamatanFilterChange}
                  className="border rounded p-1.5 h-8 min-w-0 text-xs bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 focus:ring-1 focus:ring-teal-400 max-w-[140px]"
                >
                  <option value="">Semua Kec.</option>
                  {kecamatanOptions.map((v) => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
                <select
                  value={kabupatenFilter}
                  onChange={onKabupatenFilterChange}
                  className="border rounded p-1.5 h-8 min-w-0 text-xs bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 focus:ring-1 focus:ring-teal-400 max-w-[140px]"
                >
                  <option value="">Semua Kab.</option>
                  {kabupatenOptions.map((v) => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
                <select
                  value={provinsiFilter}
                  onChange={onProvinsiFilterChange}
                  className="border rounded p-1.5 h-8 min-w-0 text-xs bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 focus:ring-1 focus:ring-teal-400 max-w-[140px]"
                >
                  <option value="">Semua Prov.</option>
                  {provinsiOptions.map((v) => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-wrap gap-2 items-center">
                <span className="text-xs text-gray-600 dark:text-gray-400 w-full sm:w-auto">Koordinator & Sektor:</span>
                {koordinatorLocked ? (
                  <span className="border rounded p-1.5 h-8 min-w-0 text-xs bg-gray-100 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600 flex-1 max-w-[200px] inline-flex items-center" title="Filter koordinator terkunci ke madrasah Anda. Untuk melihat semua madrasah, minta admin menambahkan aksi «Lihat semua madrasah» di Pengaturan → Fitur (Data Madrasah).">
                    {koordinatorFilter || '—'}
                  </span>
                ) : (
                  <select
                    value={koordinatorFilter}
                    onChange={onKoordinatorFilterChange}
                    className="border rounded p-1.5 h-8 min-w-0 text-xs bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 focus:ring-1 focus:ring-teal-400 flex-1 max-w-[200px]"
                  >
                    <option value="">Semua Koordinator</option>
                    {koordinatorOptions.map((v) => (
                      <option key={v} value={v}>{v}</option>
                    ))}
                  </select>
                )}
                <select
                  value={sektorFilter}
                  onChange={onSektorFilterChange}
                  className="border rounded p-1.5 h-8 min-w-0 text-xs bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 focus:ring-1 focus:ring-teal-400 flex-1 max-w-[200px]"
                >
                  <option value="">Semua Sektor</option>
                  {sektorOptions.map((v) => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
})

SearchAndFilterSection.displayName = 'SearchAndFilterSection'

function DataMadrasah() {
  const { showNotification } = useNotification()
  const { user } = useAuthStore()
  const [searchParams, setSearchParams] = useSearchParams()
  const editParam = searchParams.get('edit')
  const { koordinatorFilterLocked } = useMadrasahDataFiturAccess()

  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [isInputFocused, setIsInputFocused] = useState(false)
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [kategoriFilter, setKategoriFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [kurikulumFilter, setKurikulumFilter] = useState('')
  const [dusunFilter, setDusunFilter] = useState('')
  const [desaFilter, setDesaFilter] = useState('')
  const [kecamatanFilter, setKecamatanFilter] = useState('')
  const [kabupatenFilter, setKabupatenFilter] = useState('')
  const [provinsiFilter, setProvinsiFilter] = useState('')
  const [koordinatorFilter, setKoordinatorFilter] = useState('')
  const [sektorFilter, setSektorFilter] = useState('')

  // Koordinator tanpa aksi "semua madrasah": filter koordinator terkunci ke diri sendiri
  useEffect(() => {
    if (koordinatorFilterLocked && user?.nama) {
      setKoordinatorFilter(user.nama)
    }
  }, [koordinatorFilterLocked, user?.nama])
  const [showTambahOffcanvas, setShowTambahOffcanvas] = useState(false)
  const [showCariKoordinatorOffcanvas, setShowCariKoordinatorOffcanvas] = useState(false)
  const [showExportOffcanvas, setShowExportOffcanvas] = useState(false)
  const [showImportOffcanvas, setShowImportOffcanvas] = useState(false)
  const [showBulkEditOffcanvas, setShowBulkEditOffcanvas] = useState(false)
  const [viewMode, setViewMode] = useState('grid')
  const [selectedItems, setSelectedItems] = useState(() => new Set())
  const [editingMadrasah, setEditingMadrasah] = useState(null)
  const tambahMadrasahRef = useRef(null)

  const PER_PAGE_OPTIONS = [25, 50, 75, 100]
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(25)
  const [downloadFotoProgress, setDownloadFotoProgress] = useState(null) // { current, total }
  const downloadCancelRef = useRef(false)

  const toggleSelect = (id) => {
    setSelectedItems((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    const pageIds = paginatedList.map((m) => m.id)
    const allOnPageSelected = pageIds.length > 0 && pageIds.every((id) => selectedItems.has(id))
    setSelectedItems((prev) => {
      const next = new Set(prev)
      if (allOnPageSelected) pageIds.forEach((id) => next.delete(id))
      else pageIds.forEach((id) => next.add(id))
      return next
    })
  }

  const openEdit = (m) => {
    setEditingMadrasah(m)
    setShowTambahOffcanvas(true)
    setSearchParams(
      (prev) => {
        const n = new URLSearchParams(prev)
        n.set('edit', String(m.id))
        return n
      },
      { replace: false }
    )
  }

  const closeTambahOffcanvas = useCallback(() => {
    setShowTambahOffcanvas(false)
    setEditingMadrasah(null)
    setSearchParams(
      (prev) => {
        const n = new URLSearchParams(prev)
        n.delete('edit')
        return n
      },
      { replace: true }
    )
  }, [setSearchParams])

  useEffect(() => {
    loadMadrasah()
  }, [])

  // Buka edit dari URL (?edit=id) setelah data siaga; hapus param jika id tidak valid / tidak ada di list
  useEffect(() => {
    if (!editParam || loading) return
    const id = Number(editParam)
    if (!Number.isFinite(id)) {
      setSearchParams(
        (prev) => {
          const n = new URLSearchParams(prev)
          n.delete('edit')
          return n
        },
        { replace: true }
      )
      setShowTambahOffcanvas(false)
      setEditingMadrasah(null)
      return
    }
    const m = list.find((x) => x.id === id)
    if (m) {
      setEditingMadrasah(m)
      setShowTambahOffcanvas(true)
    } else {
      setSearchParams(
        (prev) => {
          const n = new URLSearchParams(prev)
          n.delete('edit')
          return n
        },
        { replace: true }
      )
      setShowTambahOffcanvas(false)
      setEditingMadrasah(null)
    }
  }, [editParam, list, loading, setSearchParams])

  // Tombol kembali browser: hilangnya ?edit=… menutup offcanvas edit
  useEffect(() => {
    if (editParam != null) return
    if (!showTambahOffcanvas || editingMadrasah == null) return
    setShowTambahOffcanvas(false)
    setEditingMadrasah(null)
  }, [editParam, showTambahOffcanvas, editingMadrasah])

  const filterOptions = useMemo(() => {
    const uniq = (arr) => [...new Set(arr)].filter(Boolean).map((v) => String(v).trim()).sort((a, b) => a.localeCompare(b, 'id'))
    return {
      dusun: uniq(list.map((m) => m.dusun)),
      desa: uniq(list.map((m) => m.desa)),
      kecamatan: uniq(list.map((m) => m.kecamatan)),
      kabupaten: uniq(list.map((m) => m.kabupaten)),
      provinsi: uniq(list.map((m) => m.provinsi)),
      koordinator: uniq(list.map((m) => m.koordinator_nama)),
      sektor: uniq(list.map((m) => m.sektor))
    }
  }, [list])

  const loadMadrasah = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await madrasahAPI.getAll()
      if (response.success) {
        setList(response.data || [])
      } else {
        setError(response.message || 'Gagal memuat data madrasah')
      }
    } catch (err) {
      console.error('Error loading madrasah:', err)
      setError('Terjadi kesalahan saat memuat data madrasah')
    } finally {
      setLoading(false)
    }
  }

  const filteredList = useMemo(() => {
    let result = list
    if (kategoriFilter) {
      result = result.filter((m) => m.kategori === kategoriFilter)
    }
    if (statusFilter) {
      result = result.filter((m) => (m.status || '') === statusFilter)
    }
    if (kurikulumFilter) {
      result = result.filter((m) => m.kurikulum === kurikulumFilter)
    }
    const q = searchQuery.trim().toLowerCase()
    if (q) {
      result = result.filter(
        (m) =>
          m.nama?.toLowerCase().includes(q) ||
          m.kategori?.toLowerCase().includes(q) ||
          m.status?.toLowerCase().includes(q) ||
          (m.nama_pengasuh || m.pengasuh_nama)?.toLowerCase().includes(q) ||
          (m.nama_pjgt || m.pjgt_nama)?.toLowerCase().includes(q) ||
          m.identitas?.toLowerCase().includes(q)
      )
    }
    if (dusunFilter) result = result.filter((m) => (m.dusun || '') === dusunFilter)
    if (desaFilter) result = result.filter((m) => (m.desa || '') === desaFilter)
    if (kecamatanFilter) result = result.filter((m) => (m.kecamatan || '') === kecamatanFilter)
    if (kabupatenFilter) result = result.filter((m) => (m.kabupaten || '') === kabupatenFilter)
    if (provinsiFilter) result = result.filter((m) => (m.provinsi || '') === provinsiFilter)
    if (koordinatorFilter) result = result.filter((m) => (m.koordinator_nama || '') === koordinatorFilter)
    if (sektorFilter) result = result.filter((m) => (m.sektor || '') === sektorFilter)
    return result
  }, [list, searchQuery, kategoriFilter, statusFilter, kurikulumFilter, dusunFilter, desaFilter, kecamatanFilter, kabupatenFilter, provinsiFilter, koordinatorFilter, sektorFilter])

  const totalFiltered = filteredList.length
  const totalPages = Math.max(1, Math.ceil(totalFiltered / perPage))
  const safePage = Math.min(page, totalPages)
  const paginatedList = useMemo(() => {
    const start = (safePage - 1) * perPage
    return filteredList.slice(start, start + perPage)
  }, [filteredList, safePage, perPage])

  useEffect(() => {
    setPage((p) => (totalPages > 0 ? Math.min(p, totalPages) : 1))
  }, [totalFiltered, perPage, totalPages])

  /** Format alamat pengurus dari dusun, rt, rw, desa, ... */
  function formatAlamatPengurus(p) {
    if (!p) return ''
    const parts = [
      p.dusun,
      p.rt ? `RT ${p.rt}` : '',
      p.rw ? `RW ${p.rw}` : '',
      p.desa,
      p.kecamatan,
      p.kabupaten,
      p.provinsi,
      p.kode_pos
    ].filter(Boolean)
    return parts.join(', ')
  }

  const sanitizeFilename = (nama, id, ext = '.jpg') => {
    const base = (nama || `madrasah-${id}`).replace(/[^\w\s\-\.]/g, '').replace(/\s+/g, '_').trim() || `madrasah-${id}`
    return base.slice(0, 80) + ext
  }

  const downloadFotoBatch = async (items) => {
    const withFoto = items.filter((m) => m.foto_path)
    if (withFoto.length === 0) {
      showNotification('Tidak ada foto untuk diunduh', 'info')
      return
    }
    setDownloadFotoProgress({ current: 0, total: withFoto.length })
    downloadCancelRef.current = false
    const delay = (ms) => new Promise((r) => setTimeout(r, ms))
    let downloaded = 0

    for (let i = 0; i < withFoto.length; i++) {
      if (downloadCancelRef.current) break
      setDownloadFotoProgress((p) => (p ? { ...p, current: i } : null))
      try {
        const m = withFoto[i]
        const path = m.foto_path.startsWith('uploads/') ? m.foto_path : `uploads/ugt/${m.foto_path}`
        const ext = path.match(/\.(jpe?g|png|gif|webp)$/i)?.[1] || 'jpg'
        const blobUrl = await madrasahAPI.fetchFotoBlobUrl(m.foto_path)
        if (blobUrl && !downloadCancelRef.current) {
          const res = await fetch(blobUrl)
          const blob = await res.blob()
          if (blob && !downloadCancelRef.current) {
            const a = document.createElement('a')
            a.href = URL.createObjectURL(blob)
            a.download = sanitizeFilename(m.nama, m.id, ext.startsWith('jpeg') ? '.jpg' : `.${ext}`)
            a.click()
            URL.revokeObjectURL(a.href)
            downloaded++
          }
        }
      } catch (_) {}
      setDownloadFotoProgress((p) => (p ? { ...p, current: i + 1 } : null))
      await delay(120)
    }

    setDownloadFotoProgress(null)
    if (!downloadCancelRef.current && downloaded > 0) showNotification(`Berhasil mengunduh ${downloaded} foto`, 'success')
  }

  const selectedList = useMemo(() => filteredList.filter((m) => selectedItems.has(m.id)), [filteredList, selectedItems])
  const handleDownloadFotoSelected = () => downloadFotoBatch(selectedList)
  const cancelDownloadFoto = () => {
    downloadCancelRef.current = true
  }

  const handleTemplate = async () => {
    try {
      const headers = EXPORT_COLUMNS.map((c) => c.label)
      const exampleRows = [
        { Nama: 'Contoh Madrasah 1', Kategori: 'Madrasah', Sektor: 'Sektor A', Desa: 'Desa Contoh', Kecamatan: 'Kec. Contoh', Kabupaten: 'Kab. Contoh', Provinsi: 'Jawa Barat', Kurikulum: 'Depag', 'Jumlah Murid': 50 },
        { Nama: 'Contoh Madrasah 2', Kategori: 'Pesantren', Sektor: 'Sektor B', Desa: 'Desa Sample', Kecamatan: 'Kec. Sample', Kabupaten: 'Kab. Sample', Provinsi: 'Jawa Tengah', Kurikulum: 'Diniyah (Mandiri)', 'Jumlah Murid': 80 },
        { Nama: 'Contoh Madrasah 3', Kategori: 'Madrasah', Sektor: 'Sektor C', Desa: 'Desa Demo', Kecamatan: 'Kec. Demo', Kabupaten: 'Kab. Demo', Provinsi: 'Jawa Timur', Kurikulum: 'Depag', 'Jumlah Murid': 120 }
      ]
      const templateData = exampleRows.map((row) => {
        const out = {}
        headers.forEach((h) => { out[h] = row[h] ?? '' })
        return out
      })
      const ws = XLSX.utils.json_to_sheet(templateData.length ? templateData : [headers.reduce((o, h) => ({ ...o, [h]: '' }), {})], { header: headers })
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Data Madrasah')

      let pengurusList = []
      try {
        // Sheet Referensi Koordinator: hanya pengurus yang role-nya UGT (admin_ugt, koordinator_ugt)
        const res = await pengurusAPI.getList({ role_keys: 'admin_ugt,koordinator_ugt' })
        if (res?.success && Array.isArray(res.data)) pengurusList = res.data
      } catch (_) {}
      const pengurusRows = pengurusList.map((p) => ({
        ID: p.id,
        Nama: p.nama ?? '',
        Alamat: formatAlamatPengurus(p)
      }))
      const wsPengurus = XLSX.utils.json_to_sheet(
        pengurusRows.length ? pengurusRows : [{ ID: '', Nama: '', Alamat: '' }],
        { header: ['ID', 'Nama', 'Alamat'] }
      )
      XLSX.utils.book_append_sheet(wb, wsPengurus, 'Referensi Koordinator')

      XLSX.writeFile(wb, 'template_import_madrasah.xlsx')
      showNotification('Template berhasil diunduh', 'success')
    } catch (e) {
      showNotification('Gagal unduh template: ' + (e.message || ''), 'error')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[200px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600" />
      </div>
    )
  }

  return (
    <div className="h-full overflow-hidden flex flex-col">
      {/* Bagian input: tetap di atas, tidak ikut scroll */}
      <div className="flex-shrink-0 p-4 sm:p-6 lg:p-8">
        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-4">
            <p className="text-red-800 dark:text-red-200">{error}</p>
          </div>
        )}

        <SearchAndFilterSection
            searchInput={searchQuery}
            onSearchInputChange={(e) => setSearchQuery(e.target.value)}
            onSearchInputFocus={() => setIsInputFocused(true)}
            onSearchInputBlur={() => setIsInputFocused(false)}
            isInputFocused={isInputFocused}
            isFilterOpen={isFilterOpen}
            onFilterToggle={() => setIsFilterOpen((p) => !p)}
            onTambahClick={() => {
              setEditingMadrasah(null)
              setShowTambahOffcanvas(true)
              setSearchParams(
                (prev) => {
                  const n = new URLSearchParams(prev)
                  n.delete('edit')
                  return n
                },
                { replace: true }
              )
            }}
            onExportClick={() => setShowExportOffcanvas(true)}
            onImportClick={() => setShowImportOffcanvas(true)}
            onTemplateClick={handleTemplate}
            kategoriFilter={kategoriFilter}
            onKategoriFilterChange={(e) => setKategoriFilter(e.target.value)}
            statusFilter={statusFilter}
            onStatusFilterChange={(e) => setStatusFilter(e.target.value)}
            kurikulumFilter={kurikulumFilter}
            onKurikulumFilterChange={(e) => setKurikulumFilter(e.target.value)}
            dusunFilter={dusunFilter}
            onDusunFilterChange={(e) => setDusunFilter(e.target.value)}
            desaFilter={desaFilter}
            onDesaFilterChange={(e) => setDesaFilter(e.target.value)}
            kecamatanFilter={kecamatanFilter}
            onKecamatanFilterChange={(e) => setKecamatanFilter(e.target.value)}
            kabupatenFilter={kabupatenFilter}
            onKabupatenFilterChange={(e) => setKabupatenFilter(e.target.value)}
            provinsiFilter={provinsiFilter}
            onProvinsiFilterChange={(e) => setProvinsiFilter(e.target.value)}
            koordinatorFilter={koordinatorFilter}
            onKoordinatorFilterChange={(e) => setKoordinatorFilter(e.target.value)}
            sektorFilter={sektorFilter}
            onSektorFilterChange={(e) => setSektorFilter(e.target.value)}
            dusunOptions={filterOptions.dusun}
            desaOptions={filterOptions.desa}
            kecamatanOptions={filterOptions.kecamatan}
            kabupatenOptions={filterOptions.kabupaten}
            provinsiOptions={filterOptions.provinsi}
            koordinatorOptions={filterOptions.koordinator}
            sektorOptions={filterOptions.sektor}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            koordinatorLocked={koordinatorFilterLocked}
            onRefresh={loadMadrasah}
          />

          {selectedItems.size > 0 && (
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <button
                type="button"
                onClick={() => setShowBulkEditOffcanvas(true)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-teal-600 hover:bg-teal-700 text-white rounded transition-colors"
                title="Ubah massal data terpilih"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                Ubah Massal ({selectedItems.size})
              </button>
              <button
                type="button"
                onClick={handleDownloadFotoSelected}
                disabled={selectedList.filter((m) => m.foto_path).length === 0}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
                title="Unduh foto yang ditandai"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Unduh foto ({selectedList.filter((m) => m.foto_path).length})
              </button>
              <button
                type="button"
                onClick={() => setSelectedItems(new Set())}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-gray-600 hover:bg-gray-700 text-white rounded transition-colors"
                title="Hapus semua pilihan"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
                Hapus pilihan
              </button>
            </div>
          )}
      </div>

      {/* Bagian list: hanya area ini yang scroll */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 lg:px-8 pb-4 sm:pb-6 lg:pb-8">
          {/* Pagination & unduh foto - hanya tampil bila ada data */}
          {filteredList.length > 0 && (
            <div className="flex flex-wrap items-center gap-3 mb-3">
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-600 dark:text-gray-400">Tampilkan:</span>
                <select
                  value={perPage}
                  onChange={(e) => { setPerPage(Number(e.target.value)); setPage(1) }}
                  className="border rounded px-2 py-1.5 text-sm bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                >
                  {PER_PAGE_OPTIONS.map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </div>
              <span className="text-xs text-gray-600 dark:text-gray-400">
                {totalFiltered === 0 ? '0' : `${(safePage - 1) * perPage + 1}–${Math.min(safePage * perPage, totalFiltered)}`} dari {totalFiltered}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={safePage <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="p-1.5 rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100 dark:hover:bg-gray-700"
                  title="Halaman sebelumnya"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" /></svg>
                </button>
                <span className="text-xs px-1 min-w-[4rem] text-center text-gray-600 dark:text-gray-400">Hal. {safePage} / {totalPages}</span>
                <button
                  type="button"
                  disabled={safePage >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="p-1.5 rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100 dark:hover:bg-gray-700"
                  title="Halaman berikutnya"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" /></svg>
                </button>
              </div>
            </div>
          )}

          {filteredList.length === 0 ? (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-8 text-center text-gray-500 dark:text-gray-400">
              {list.length === 0
                ? 'Belum ada data madrasah.'
                : 'Tidak ada hasil yang cocok dengan pencarian atau filter.'}
            </div>
          ) : viewMode === 'list' ? (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 dark:bg-gray-900">
                    <tr>
                      <th className="px-3 py-2 text-center w-10">
                        <input
                          type="checkbox"
                          checked={paginatedList.length > 0 && paginatedList.every((m) => selectedItems.has(m.id))}
                          ref={(el) => {
                            if (el) {
                              const some = paginatedList.some((m) => selectedItems.has(m.id))
                              const all = paginatedList.length > 0 && paginatedList.every((m) => selectedItems.has(m.id))
                              el.indeterminate = some && !all
                            }
                          }}
                          onChange={toggleSelectAll}
                          className="w-4 h-4 text-teal-600 rounded border-gray-300 dark:border-gray-600 focus:ring-teal-500"
                        />
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase w-14">Foto</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">No</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Nama</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Kategori</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Status</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Alamat</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Koordinator · Sektor</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Pengasuh</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Kepala</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">PJGT</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Jumlah</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Kurikulum</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {paginatedList.map((m, index) => (
                      <tr
                        key={m.id}
                        onClick={(e) => { if (e.target.type !== 'checkbox') openEdit(m) }}
                        className={`cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 ${selectedItems.has(m.id) ? 'bg-teal-50 dark:bg-teal-900/20' : ''}`}
                      >
                        <td className="px-3 py-2 text-center" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selectedItems.has(m.id)}
                            onChange={() => toggleSelect(m.id)}
                            className="w-4 h-4 text-teal-600 rounded border-gray-300 dark:border-gray-600 focus:ring-teal-500"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1">
                            <MadrasahFotoImg fotoPath={m.foto_path} size="small" />
                            {m.logo_path ? <MadrasahFotoImg fotoPath={m.logo_path} size="logo" /> : null}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-sm text-gray-600 dark:text-gray-400">{(safePage - 1) * perPage + index + 1}</td>
                        <td className="px-3 py-2 font-medium text-gray-900 dark:text-gray-100">{m.nama || '-'}</td>
                        <td className="px-3 py-2 text-sm text-gray-600 dark:text-gray-400">{m.kategori || '-'}</td>
                        <td className="px-3 py-2 text-sm text-gray-600 dark:text-gray-400">{m.status || '-'}</td>
                        <td className="px-3 py-2 text-sm text-gray-600 dark:text-gray-400 max-w-[180px] truncate" title={[m.dusun, m.desa, m.kecamatan, m.kabupaten, m.provinsi].filter(Boolean).join(', ')}>
                          {[m.dusun, m.desa, m.kecamatan].filter(Boolean).join(', ') || '-'}
                        </td>
                        <td className="px-3 py-2 text-sm text-gray-600 dark:text-gray-400">{[m.koordinator_nama, m.sektor].filter(Boolean).join(' · ') || '-'}</td>
                        <td className="px-3 py-2 text-sm text-gray-600 dark:text-gray-400">{(m.nama_pengasuh || m.pengasuh_nama) || '-'}</td>
                        <td className="px-3 py-2 text-sm text-gray-600 dark:text-gray-400">{m.kepala || '-'}</td>
                        <td className="px-3 py-2 text-sm text-gray-600 dark:text-gray-400">{(m.nama_pjgt || m.pjgt_nama) || '-'}</td>
                        <td className="px-3 py-2 text-sm text-gray-600 dark:text-gray-400">{m.jumlah_murid ?? '-'}</td>
                        <td className="px-3 py-2 text-sm text-gray-600 dark:text-gray-400">{m.kurikulum || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3 md:gap-3 lg:gap-3 xl:gap-2">
              <AnimatePresence>
                {paginatedList.map((m, index) => (
                  <motion.div
                    key={m.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.03 }}
                    onClick={(e) => { if (!e.target.closest('[data-checkbox]')) openEdit(m) }}
                    className="bg-white dark:bg-gray-800 rounded-lg shadow-md border border-gray-200 dark:border-gray-700 relative cursor-pointer hover:ring-2 hover:ring-teal-500/50 overflow-hidden grid grid-rows-[3fr_1fr] aspect-[3/4] min-h-0"
                  >
                    <div className="absolute top-2 right-2 z-10" data-checkbox onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedItems.has(m.id)}
                        onChange={() => toggleSelect(m.id)}
                        className="w-4 h-4 text-teal-600 rounded border-gray-300 dark:border-gray-600 focus:ring-teal-500"
                      />
                    </div>
                    {m.status && (
                      <span className={`absolute top-2 left-2 z-10 px-1.5 py-0.5 text-[10px] font-medium rounded shadow truncate max-w-[80%] ${getStatusBadgeClass(m.status)}`} title={m.status}>
                        {m.status}
                      </span>
                    )}
                    {/* Grid: 3/4 foto, 1/4 info (nama, pengasuh, pjgt) */}
                    <div className="min-h-0 h-full overflow-hidden rounded-t-lg relative">
                      <MadrasahFotoImg fotoPath={m.foto_path} size="large" />
                      {m.logo_path && (
                        <div className="absolute bottom-2 left-2 z-10 shadow-sm rounded" title="Logo">
                          <MadrasahFotoImg fotoPath={m.logo_path} size="logo" />
                        </div>
                      )}
                    </div>
                    <div className="p-2 sm:p-3 flex flex-col justify-center min-h-0 overflow-hidden gap-0.5">
                      <h3 className="text-xs sm:text-sm font-semibold text-gray-800 dark:text-gray-200 truncate pr-6" title={m.nama || '-'}>
                        {m.nama || '-'}
                      </h3>
                      <p className="text-[10px] sm:text-xs text-gray-600 dark:text-gray-400 truncate leading-tight" title={(m.nama_pengasuh || m.pengasuh_nama) || '-'}>
                        <span className="font-medium">Pengasuh:</span> {(m.nama_pengasuh || m.pengasuh_nama) || '-'}
                      </p>
                      <p className="text-[10px] sm:text-xs text-gray-600 dark:text-gray-400 truncate leading-tight" title={(m.nama_pjgt || m.pjgt_nama) || '-'}>
                        <span className="font-medium">PJGT:</span> {(m.nama_pjgt || m.pjgt_nama) || '-'}
                      </p>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
      </div>

      <TambahMadrasahOffcanvas
        ref={tambahMadrasahRef}
        isOpen={showTambahOffcanvas}
        onClose={closeTambahOffcanvas}
        onSuccess={loadMadrasah}
        onOpenCariKoordinator={() => setShowCariKoordinatorOffcanvas(true)}
        initialData={editingMadrasah}
        koordinatorLocked={koordinatorFilterLocked}
        currentUserId={user?.id}
        currentUserNip={user?.nip}
      />
      {/* Offcanvas Cari Pengurus - portal terpisah (sibling) agar selalu tampil di depan */}
      {createPortal(
        <CariKoordinatorOffcanvas
          isOpen={showCariKoordinatorOffcanvas}
          onClose={() => setShowCariKoordinatorOffcanvas(false)}
          onSelect={(p) => {
            tambahMadrasahRef.current?.setKoordinatorFromSelection?.(p)
            setShowCariKoordinatorOffcanvas(false)
          }}
        />,
        document.body
      )}
      {/* Offcanvas Eksport - pilih kolom lalu eksport ke Excel */}
      {createPortal(
        <ExportMadrasahOffcanvas
          isOpen={showExportOffcanvas}
          onClose={() => setShowExportOffcanvas(false)}
          filteredData={filteredList}
        />,
        document.body
      )}
      {/* Offcanvas Import - pilih file Excel lalu import */}
      {createPortal(
        <ImportMadrasahOffcanvas
          isOpen={showImportOffcanvas}
          onClose={() => setShowImportOffcanvas(false)}
          onSuccess={loadMadrasah}
        />,
        document.body
      )}
      {createPortal(
        <BulkEditMadrasahOffcanvas
          isOpen={showBulkEditOffcanvas}
          onClose={() => setShowBulkEditOffcanvas(false)}
          selectedIds={selectedItems}
          list={filteredList}
          onSuccess={() => { loadMadrasah(); setSelectedItems(new Set()) }}
        />,
        document.body
      )}

      {/* Modal progress unduh foto */}
      {downloadFotoProgress && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50" role="dialog" aria-label="Progress unduh foto">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl p-6 max-w-sm w-full mx-4">
            <p className="text-sm font-medium text-gray-800 dark:text-gray-200 mb-2">Mengunduh foto...</p>
            <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
              {downloadFotoProgress.current + 1} dari {downloadFotoProgress.total}
            </p>
            <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden mb-4">
              <div
                className="h-full bg-teal-500 transition-all duration-300"
                style={{ width: `${downloadFotoProgress.total ? (downloadFotoProgress.current / downloadFotoProgress.total) * 100 : 0}%` }}
              />
            </div>
            <button
              type="button"
              onClick={cancelDownloadFoto}
              className="w-full py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg border border-gray-300 dark:border-gray-600"
            >
              Batalkan
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}

export default DataMadrasah
