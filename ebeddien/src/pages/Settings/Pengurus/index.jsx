import { useState, useEffect, useMemo, useCallback, memo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useOffcanvasBackClose } from '../../../hooks/useOffcanvasBackClose'
import { usePengurusFiturAccess } from '../../../hooks/usePengurusFiturAccess'
import { manageUsersAPI } from '../../../services/api'
import api from '../../../services/api'
import ExportPengurusOffcanvas from './components/ExportPengurusOffcanvas'
import TambahPengurusOffcanvas from './components/TambahPengurusOffcanvas'
import DetailPengurusOffcanvas from '../../../components/DetailPengurusOffcanvas'
import * as XLSX from 'xlsx'

// Memoized Search and Filter Section - Menu (Tambah, Export, Import, Template) + Filter
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
  viewMode = 'detail',
  onViewModeChange,
  jabatanLembagaFilter,
  onJabatanLembagaFilterChange,
  kategoriLembagaFilter,
  onKategoriLembagaFilterChange,
  jabatanFilter,
  onJabatanFilterChange,
  statusFilter,
  onStatusFilterChange,
  statusOptions = [],
  kategoriOptions = [],
  lembagaOptions = [],
  lembagaFilterDisabled = false,
  jabatanOptions = [],
  onRefresh,
  onResetFilter,
  itemsPerPage,
  onItemsPerPageChange,
  totalPengurus = 0,
  currentPage = 1
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
    <div className="sticky top-0 z-10 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 mb-4">
      <div className="relative pb-2 px-4 pt-3">
        <div className="relative">
          <input
            type="text"
            value={searchInput}
            onChange={onSearchInputChange}
            onFocus={onSearchInputFocus}
            onBlur={onSearchInputBlur}
            className="w-full p-2 pr-28 focus:outline-none bg-transparent dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400"
            placeholder="Cari"
          />
          <div className="absolute right-0 top-0 bottom-0 flex items-center gap-1 pr-1 pointer-events-none">
            <div ref={menuRef} className="relative pointer-events-auto">
              <button
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
                      onClick={() => runAndClose(onTambahClick)}
                      className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                      </svg>
                      Tambah
                    </button>
                    <button
                      onClick={() => runAndClose(onExportClick)}
                      className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      Export
                    </button>
                    <button
                      onClick={() => runAndClose(onImportClick)}
                      className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                      Import
                    </button>
                    <button
                      onClick={() => runAndClose(onTemplateClick)}
                      className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      Template
                    </button>
                    <div className="border-t border-gray-100 dark:border-gray-600 my-1" />
                    <div className="px-3 py-1.5 text-xs font-medium text-gray-500 dark:text-gray-400">Tampilan</div>
                    <button
                      onClick={() => { onViewModeChange?.('detail'); setMenuOpen(false) }}
                      className={`w-full px-3 py-2 text-left text-sm flex items-center gap-2 ${viewMode === 'detail' ? 'text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-900/20' : 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                    >
                      {viewMode === 'detail' && (
                        <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      )}
                      Detail
                    </button>
                    <button
                      onClick={() => { onViewModeChange?.('minimalis'); setMenuOpen(false) }}
                      className={`w-full px-3 py-2 text-left text-sm flex items-center gap-2 ${viewMode === 'minimalis' ? 'text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-900/20' : 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                    >
                      {viewMode === 'minimalis' && (
                        <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      )}
                      Minimalis
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <button
              onClick={onFilterToggle}
              className="bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 p-1.5 rounded text-xs flex items-center gap-1 transition-colors pointer-events-auto"
              title={isFilterOpen ? 'Sembunyikan Filter' : 'Tampilkan Filter'}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"></path>
              </svg>
              {isFilterOpen ? (
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 15l7-7 7 7"></path>
                </svg>
              ) : (
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path>
                </svg>
              )}
            </button>
          </div>
        </div>
        <div className="absolute left-0 right-0 bottom-0 h-0.5 bg-gray-300 dark:bg-gray-600"></div>
        <div className={`absolute left-0 right-0 bottom-0 h-0.5 bg-teal-500 transition-opacity ${isInputFocused ? 'opacity-100' : 'opacity-0'}`}></div>
      </div>

      <AnimatePresence>
        {isFilterOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden border-t bg-gray-50 dark:bg-gray-700/50"
          >
            <div className="px-4 py-2">
              <div className="flex flex-wrap gap-2 items-center">
                <select
                  value={kategoriLembagaFilter}
                  onChange={onKategoriLembagaFilterChange}
                  className="border rounded p-1 h-7 min-w-0 text-xs bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 focus:ring-1 focus:ring-teal-400"
                >
                  <option key="kategori-semua" value="">Kategori</option>
                  {(kategoriOptions || []).map((o, i) => (
                    <option key={o.value !== '' && o.value != null ? o.value : `kategori-${i}`} value={o.value}>{o.label} ({o.count})</option>
                  ))}
                </select>
                <select
                  value={jabatanLembagaFilter}
                  onChange={onJabatanLembagaFilterChange}
                  disabled={lembagaFilterDisabled}
                  title={lembagaFilterDisabled ? 'Filter lembaga sesuai penugasan (buka di Pengaturan → Fitur jika perlu akses semua lembaga)' : undefined}
                  className="border rounded p-1 h-7 min-w-0 text-xs bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 focus:ring-1 focus:ring-teal-400 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <option key="lembaga-semua" value="">Lembaga</option>
                  {(lembagaOptions || []).map((o, i) => (
                    <option key={o.value !== '' && o.value != null ? o.value : `lembaga-${i}`} value={o.value}>{o.label} ({o.count})</option>
                  ))}
                </select>
                <select
                  value={jabatanFilter}
                  onChange={onJabatanFilterChange}
                  className="border rounded p-1 h-7 min-w-0 text-xs bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 focus:ring-1 focus:ring-teal-400"
                >
                  <option key="jabatan-semua" value="">Jabatan</option>
                  {(jabatanOptions || []).map((o, i) => (
                    <option key={o.value !== '' && o.value != null ? o.value : `jabatan-${i}`} value={o.value}>{o.label} ({o.count})</option>
                  ))}
                </select>
                <select
                  value={statusFilter}
                  onChange={onStatusFilterChange}
                  className="border rounded p-1 h-7 min-w-0 text-xs bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 focus:ring-1 focus:ring-teal-400"
                >
                  <option key="status-semua" value="">Status</option>
                  {(statusOptions || []).map((o, i) => (
                    <option key={o.value !== '' && o.value != null ? o.value : `status-${i}`} value={o.value}>{o.label} ({o.count})</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2 pt-3 mt-2 border-t border-gray-200 dark:border-gray-600">
                <button
                  type="button"
                  onClick={() => onRefresh?.()}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
                  title="Refresh"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Refresh
                </button>
                <button
                  type="button"
                  onClick={() => onResetFilter?.()}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
                  title="Reset filter"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
                  </svg>
                  Reset filter
                </button>
                <select
                  value={itemsPerPage}
                  onChange={(e) => onItemsPerPageChange?.(e.target.value)}
                  className="border rounded p-1 h-7 min-w-0 text-xs bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 focus:ring-1 focus:ring-teal-400"
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
                <span className="text-xs font-medium text-gray-700 dark:text-gray-200 tabular-nums">{totalPengurus}</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
})

SearchAndFilterSection.displayName = 'SearchAndFilterSection'

// Memoized Pengurus List Item (data dari tabel pengurus; role tidak di-join, lembaga & jabatan dengan kategori)
const PengurusListItem = memo(({ pengurus, index, onClick, getStatusBadgeColor, getStatusDisplayName, lembagaList, viewMode = 'detail' }) => {
  const jabatanList = pengurus.jabatan || []
  const lembagaFromApi = pengurus.lembaga || []
  const getLembagaNama = (id) => {
    const fromApi = lembagaFromApi.find((l) => String(l.id) === String(id))
    if (fromApi) return fromApi.kategori ? `${fromApi.nama || ''} (${fromApi.kategori})` : (fromApi.nama || id)
    return (lembagaList || []).find((l) => String(l.id) === String(id))?.nama || id
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: index * 0.03 }}
      onClick={() => onClick(pengurus.id)}
      className="p-4 hover:bg-gray-50 dark:hover:bg-gray-700/30 cursor-pointer transition-all duration-200 group"
    >
      <div className="flex items-center justify-between">
        <div className="flex-1 min-w-0 pr-4">
          <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-0.5 group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">
            {pengurus.nama || '-'}
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
            NIP: {pengurus.nip ?? pengurus.id} {pengurus.email ? ` · ${pengurus.email}` : ''} {pengurus.whatsapp ? ` · ${pengurus.whatsapp}` : ''}
          </p>
          {viewMode === 'detail' && lembagaFromApi.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {lembagaFromApi.map((l, idx) => (
                <span key={l.id != null && l.id !== '' ? l.id : `lembaga-${idx}`} className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400">
                  {l.kategori ? `${l.nama || l.id} (${l.kategori})` : (l.nama || l.id)}
                </span>
              ))}
            </div>
          )}
          {viewMode === 'detail' && jabatanList.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-1">
              {jabatanList.map((j, i) => (
                <span key={j.pengurus_jabatan_id != null ? j.pengurus_jabatan_id : `jabatan-${i}`} className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-400">
                  {j.lembaga_id ? `${j.jabatan_nama || '-'} (${getLembagaNama(j.lembaga_id)})` : (j.jabatan_nama || '-')}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {pengurus.status && (
            <span className={`px-2.5 py-1 rounded-md text-xs font-medium ${getStatusBadgeColor(pengurus.status)}`}>
              {getStatusDisplayName(pengurus.status)}
            </span>
          )}
          <svg className="w-5 h-5 text-gray-400 group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </div>
    </motion.div>
  )
})

PengurusListItem.displayName = 'PengurusListItem'

function Pengurus() {
  const pengurusFitur = usePengurusFiturAccess()
  const [allPengurus, setAllPengurus] = useState([])
  const [filteredPengurus, setFilteredPengurus] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [jabatanLembagaFilter, setJabatanLembagaFilter] = useState('')
  const [kategoriLembagaFilter, setKategoriLembagaFilter] = useState('')
  const [jabatanFilter, setJabatanFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('active')
  const [lembagaList, setLembagaList] = useState([])
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [isInputFocused, setIsInputFocused] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(25)
  const [showAddModal, setShowAddModal] = useState(false)
  const [showExportOffcanvas, setShowExportOffcanvas] = useState(false)
  const [viewMode, setViewMode] = useState(() => {
    try {
      const saved = localStorage.getItem('pengurus_list_view_mode')
      if (saved === 'detail' || saved === 'minimalis') return saved
    } catch (e) {}
    return 'detail'
  })
  const handleViewModeChange = useCallback((mode) => {
    setViewMode(mode)
    try {
      localStorage.setItem('pengurus_list_view_mode', mode)
    } catch (e) {}
  }, [])
  const [detailPengurusId, setDetailPengurusId] = useState(null)
  const [showEditPanel, setShowEditPanel] = useState(false)
  const detailPushRef = useRef(false)
  const editPushRef = useRef(false)
  const pushCountRef = useRef(0)

  const closeExportOffcanvas = useOffcanvasBackClose(showExportOffcanvas, () => setShowExportOffcanvas(false))
  const closeTambahOffcanvas = useOffcanvasBackClose(showAddModal, () => setShowAddModal(false))

  // History: detail open → push state 'detail'; edit open → push state 'edit'. Back: jika state 'detail' → tutup edit saja; else → tutup detail.
  useEffect(() => {
    if (!detailPengurusId) {
      detailPushRef.current = false
      editPushRef.current = false
      pushCountRef.current = 0
      return
    }
    if (!showEditPanel) {
      if (!detailPushRef.current) {
        window.history.pushState({ step: 'detail' }, '', window.location.href)
        detailPushRef.current = true
        pushCountRef.current = 1
      }
    } else {
      if (!editPushRef.current) {
        window.history.pushState({ step: 'edit' }, '', window.location.href)
        editPushRef.current = true
        pushCountRef.current = 2
      }
    }
  }, [detailPengurusId, showEditPanel])

  useEffect(() => {
    const onPopState = () => {
      if (window.history.state?.step === 'detail') {
        setShowEditPanel(false)
        editPushRef.current = false
        pushCountRef.current = 1
      } else {
        setDetailPengurusId(null)
        setShowEditPanel(false)
        detailPushRef.current = false
        editPushRef.current = false
        pushCountRef.current = 0
      }
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const closeDetailOffcanvas = useCallback(() => {
    setDetailPengurusId(null)
    setShowEditPanel(false)
    detailPushRef.current = false
    editPushRef.current = false
    for (let i = 0; i < pushCountRef.current; i++) window.history.back()
    pushCountRef.current = 0
  }, [])

  const closeEditOnly = useCallback(() => {
    setShowEditPanel(false)
    editPushRef.current = false
    if (pushCountRef.current > 0) {
      window.history.back()
      pushCountRef.current -= 1
    }
  }, [])

  const navigate = useNavigate()

  const lockedJabatanLembagaId = useMemo(() => {
    if (
      pengurusFitur.lembagaFilterLocked &&
      pengurusFitur.allowedLembagaIdsFilter?.length === 1
    ) {
      return pengurusFitur.allowedLembagaIdsFilter[0]
    }
    return null
  }, [pengurusFitur.lembagaFilterLocked, pengurusFitur.allowedLembagaIdsFilter])

  useEffect(() => {
    if (lockedJabatanLembagaId == null) return
    setJabatanLembagaFilter((prev) => (String(prev) === String(lockedJabatanLembagaId) ? prev : lockedJabatanLembagaId))
  }, [lockedJabatanLembagaId])

  useEffect(() => {
    const loadLembaga = async () => {
      try {
        const lembagaResponse = await api.get('/lembaga')
        if (lembagaResponse.data?.success) {
          setLembagaList(lembagaResponse.data.data || [])
        }
      } catch (err) {
        console.error('Error loading lembaga:', err)
      }
    }
    loadLembaga()
  }, [])

  // Load semua pengurus sekali (tanpa filter) — filter dilakukan client-side agar opsi filter unik & cascading
  const loadAllPengurus = useCallback(async () => {
    try {
      setLoading(true)
      setError('')
      const token = localStorage.getItem('auth_token')
      if (!token) {
        setError('Anda belum login. Silakan login terlebih dahulu.')
        return
      }
      const response = await manageUsersAPI.getAll({ limit: 10000 })
      if (response.success) {
        setAllPengurus(response.data?.users || [])
      } else {
        setError(response.message || 'Gagal memuat data pengurus')
      }
    } catch (err) {
      console.error('Error loading pengurus:', err)
      if (err.response?.status === 401) {
        setError('Sesi Anda telah berakhir. Silakan login kembali.')
        setTimeout(() => { window.location.href = '/login' }, 2000)
      } else if (err.response?.status === 403) {
        setError('Anda tidak memiliki izin untuk mengakses halaman ini.')
      } else {
        setError(err.response?.data?.message || 'Terjadi kesalahan saat memuat data pengurus')
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadAllPengurus()
  }, [loadAllPengurus])

  // Normalisasi status untuk pencocokan (active/aktif -> active, dll)
  const normalizeStatus = useCallback((s) => {
    if (!s) return ''
    const t = String(s).toLowerCase().trim()
    if (t === 'active' || t === 'aktif') return 'active'
    if (t === 'inactive' || t === 'tidak aktif') return 'inactive'
    if (t === 'pending') return 'pending'
    return t
  }, [])

  const matchByStatus = useCallback((p, statusVal) => {
    if (!statusVal) return true
    return normalizeStatus(p.status) === normalizeStatus(statusVal)
  }, [normalizeStatus])

  const matchByKategori = useCallback((p, kategoriVal) => {
    if (!kategoriVal) return true
    const lemb = p.lembaga || []
    return lemb.some((l) => String(l.kategori || '').trim() === String(kategoriVal).trim())
  }, [])

  const matchByLembaga = useCallback((p, lembagaVal) => {
    if (!lembagaVal) return true
    const ids = p.lembaga_ids || (p.lembaga || []).map((l) => String(l.id))
    return ids.includes(String(lembagaVal))
  }, [])

  const matchByJabatan = useCallback((p, jabatanVal) => {
    if (!jabatanVal) return true
    const v = String(jabatanVal).trim()
    const jabs = p.jabatan || []
    const byId = /^\d+$/.test(v)
    return jabs.some((j) =>
      byId ? String(j.jabatan_id || '') === v : String(j.jabatan_nama || '').trim() === v
    )
  }, [])

  // Data yang sudah memenuhi filter status, kategori, lembaga, jabatan (sebelum search)
  const dataAfterFilters = useMemo(() => {
    return allPengurus.filter(
      (p) =>
        matchByStatus(p, statusFilter) &&
        matchByKategori(p, kategoriLembagaFilter) &&
        matchByLembaga(p, jabatanLembagaFilter) &&
        matchByJabatan(p, jabatanFilter)
    )
  }, [allPengurus, statusFilter, kategoriLembagaFilter, jabatanLembagaFilter, jabatanFilter, matchByStatus, matchByKategori, matchByLembaga, matchByJabatan])

  // Pencarian client-side dari data yang sudah difilter
  useEffect(() => {
    if (dataAfterFilters.length === 0) {
      setFilteredPengurus([])
      setCurrentPage(1)
      return
    }
    const q = searchQuery.trim().toLowerCase()
    if (!q) {
      setFilteredPengurus([...dataAfterFilters])
      setCurrentPage(1)
      return
    }
    const filtered = dataAfterFilters.filter(
      (p) =>
        (p.nama && p.nama.toLowerCase().includes(q)) ||
        (p.email && p.email.toLowerCase().includes(q)) ||
        (p.nip && String(p.nip).includes(q)) ||
        (p.id && p.id.toString().includes(q))
    )
    setFilteredPengurus(filtered)
    setCurrentPage(1)
  }, [dataAfterFilters, searchQuery])

  const statusLabel = useCallback((value) => {
    const map = { active: 'Aktif', inactive: 'Tidak Aktif', pending: 'Pending' }
    return map[value] || value
  }, [])

  // Opsi filter unik + cascading: hanya nilai yang ada di data (dengan filter lain), dengan jumlah
  const { statusOptions, kategoriOptions, lembagaOptions, jabatanOptions } = useMemo(() => {
    const base = allPengurus

    const dataForStatus = base.filter(
      (p) => matchByKategori(p, kategoriLembagaFilter) && matchByLembaga(p, jabatanLembagaFilter) && matchByJabatan(p, jabatanFilter)
    )
    const statusCounts = {}
    dataForStatus.forEach((p) => {
      const n = normalizeStatus(p.status) || '(tanpa status)'
      statusCounts[n] = (statusCounts[n] || 0) + 1
    })
    const statusOptions = Object.entries(statusCounts)
      .filter(([value]) => value !== '(tanpa status)' && value !== '')
      .map(([value, count]) => ({
        value,
        label: statusLabel(value),
        count
      }))
      .sort((a, b) => (a.label || '').localeCompare(b.label || ''))

    const dataForKategori = base.filter(
      (p) => matchByStatus(p, statusFilter) && matchByLembaga(p, jabatanLembagaFilter) && matchByJabatan(p, jabatanFilter)
    )
    const kategoriCounts = {}
    dataForKategori.forEach((p) => {
      const kategoris = new Set((p.lembaga || []).map((l) => (l.kategori || '').trim()).filter(Boolean))
      kategoris.forEach((k) => {
        kategoriCounts[k] = (kategoriCounts[k] || 0) + 1
      })
    })
    const kategoriOptions = Object.entries(kategoriCounts).map(([value, count]) => ({ value, label: value, count })).sort((a, b) => (a.label || '').localeCompare(b.label || ''))

    const dataForLembaga = base.filter(
      (p) => matchByStatus(p, statusFilter) && matchByKategori(p, kategoriLembagaFilter) && matchByJabatan(p, jabatanFilter)
    )
    const lembagaCounts = {}
    dataForLembaga.forEach((p) => {
      const seen = new Set()
      ;(p.lembaga || []).forEach((l) => {
        const id = String(l.id)
        if (!id || seen.has(id)) return
        seen.add(id)
        if (!lembagaCounts[id]) lembagaCounts[id] = { count: 0, nama: l.nama || id }
        lembagaCounts[id].count += 1
      })
    })
    let lembagaOptions = Object.entries(lembagaCounts).map(([value, o]) => ({ value, label: o.nama, count: o.count })).sort((a, b) => (a.label || '').localeCompare(b.label || ''))
    if (pengurusFitur.allowedLembagaIdsFilter?.length) {
      const allow = new Set(pengurusFitur.allowedLembagaIdsFilter.map((x) => String(x)))
      lembagaOptions = lembagaOptions.filter((o) => allow.has(String(o.value)))
    }

    const dataForJabatan = base.filter(
      (p) => matchByStatus(p, statusFilter) && matchByKategori(p, kategoriLembagaFilter) && matchByLembaga(p, jabatanLembagaFilter)
    )
    // Kelompokkan jabatan by nama saja — nama sama (misal "Bendahara") jadi 1 opsi dengan total jumlah
    const jabatanCounts = {}
    dataForJabatan.forEach((p) => {
      const seen = new Set()
      ;(p.jabatan || []).forEach((j) => {
        const nama = String(j.jabatan_nama || '').trim()
        if (!nama || seen.has(nama)) return
        seen.add(nama)
        jabatanCounts[nama] = (jabatanCounts[nama] || 0) + 1
      })
    })
    const jabatanOptions = Object.entries(jabatanCounts)
      .map(([value, count]) => ({ value, label: value, count }))
      .sort((a, b) => (a.label || '').localeCompare(b.label || ''))

    return { statusOptions, kategoriOptions, lembagaOptions, jabatanOptions }
  }, [
    allPengurus,
    statusFilter,
    kategoriLembagaFilter,
    jabatanLembagaFilter,
    jabatanFilter,
    matchByStatus,
    matchByKategori,
    matchByLembaga,
    matchByJabatan,
    normalizeStatus,
    statusLabel,
    pengurusFitur.allowedLembagaIdsFilter
  ])

  // Reset filter yang tidak lagi ada di opsi (setelah filter lain berubah)
  useEffect(() => {
    const validStatus = new Set(['', ...statusOptions.map((o) => o.value)])
    if (statusFilter && statusOptions.length > 0 && !validStatus.has(statusFilter)) setStatusFilter('')
  }, [statusFilter, statusOptions])
  useEffect(() => {
    const validKategori = new Set(['', ...kategoriOptions.map((o) => o.value)])
    if (kategoriLembagaFilter && !validKategori.has(kategoriLembagaFilter)) setKategoriLembagaFilter('')
  }, [kategoriLembagaFilter, kategoriOptions])
  useEffect(() => {
    const validLembaga = new Set(['', ...lembagaOptions.map((o) => o.value)])
    if (jabatanLembagaFilter && !validLembaga.has(jabatanLembagaFilter)) setJabatanLembagaFilter('')
  }, [jabatanLembagaFilter, lembagaOptions])
  useEffect(() => {
    const validJabatan = new Set(['', ...jabatanOptions.map((o) => o.value)])
    if (jabatanFilter && !validJabatan.has(jabatanFilter)) setJabatanFilter('')
  }, [jabatanFilter, jabatanOptions])

  const totalPengurus = filteredPengurus.length
  const totalPages = Math.ceil(totalPengurus / itemsPerPage)
  const paginatedPengurus = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage
    return filteredPengurus.slice(startIndex, startIndex + itemsPerPage)
  }, [filteredPengurus, currentPage, itemsPerPage])

  const handlePageChange = useCallback((newPage) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }, [totalPages])

  const handleItemsPerPageChange = useCallback((newLimit) => {
    setItemsPerPage(parseInt(newLimit))
    setCurrentPage(1)
  }, [])

  const getStatusBadgeColor = useCallback((status) => {
    const s = status?.toLowerCase()
    if (s === 'active' || s === 'aktif') return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
    if (s === 'inactive' || s === 'tidak aktif') return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
    if (s === 'pending') return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
    return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
  }, [])

  const getStatusDisplayName = useCallback((status) => {
    const s = status?.toLowerCase()
    const map = { 'active': 'Aktif', 'aktif': 'Aktif', 'inactive': 'Tidak Aktif', 'tidak aktif': 'Tidak Aktif', 'pending': 'Pending' }
    return map[s] || status
  }, [])

  const handlePengurusClick = useCallback((pengurusId) => {
    setDetailPengurusId(pengurusId)
  }, [])

const handleDownloadTemplate = useCallback(() => {
    try {
      const headers = ['NIP', 'Nama', 'Gender', 'Tahun Hijriyah', 'Email', 'WhatsApp', 'Status', 'Grup']
      const templateData = [
        headers,
        ['', 'Contoh Pengurus', 'L', '1447-1448', '', '', 'active', 1]
      ]
      const ws = XLSX.utils.aoa_to_sheet(templateData)
      ws['!cols'] = [{ wch: 10 }, { wch: 24 }, { wch: 8 }, { wch: 14 }, { wch: 28 }, { wch: 14 }, { wch: 10 }, { wch: 6 }]
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Pengurus')
      XLSX.writeFile(wb, 'template_import_pengurus.xlsx')
    } catch (error) {
      console.error('Error creating template:', error)
      alert('Gagal membuat template: ' + error.message)
    }
  }, [])

  const handleImportPengurus = useCallback(() => {
    navigate('/pengurus/import')
  }, [navigate])

  const handleAddUserSuccess = useCallback(() => {
    loadAllPengurus()
  }, [loadAllPengurus])

  const handleResetFilter = useCallback(() => {
    setStatusFilter('active')
    setKategoriLembagaFilter('')
    setJabatanLembagaFilter('')
    setJabatanFilter('')
    setSearchQuery('')
    setCurrentPage(1)
  }, [])

  /** Update satu pengurus di list tanpa reload semua data (setelah ubah jabatan/role/status/edit di offcanvas). */
  const handlePengurusPatch = useCallback((pengurusId, patch) => {
    if (pengurusId == null) return
    setAllPengurus((prev) =>
      prev.map((p) => (p.id === pengurusId || p.id === Number(pengurusId) ? { ...p, ...patch } : p))
    )
  }, [])

  if (loading) {
    return (
      <div className="h-full overflow-hidden" style={{ minHeight: 0 }}>
<div className="h-full overflow-y-auto page-content-scroll" style={{ minHeight: 0 }}>
        <div className="p-4 sm:p-6 lg:p-8">
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-hidden" style={{ minHeight: 0 }}>
      <div className="h-full overflow-y-auto page-content-scroll" style={{ minHeight: 0 }}>
        <div className="p-4 sm:p-6 lg:p-8">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            {error && (
              <div className="mb-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg">
                {error}
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
              onTambahClick={() => setShowAddModal(true)}
              onExportClick={() => setShowExportOffcanvas(true)}
              onImportClick={handleImportPengurus}
              onTemplateClick={handleDownloadTemplate}
              viewMode={viewMode}
              onViewModeChange={handleViewModeChange}
              jabatanLembagaFilter={jabatanLembagaFilter}
              onJabatanLembagaFilterChange={(e) => setJabatanLembagaFilter(e.target.value)}
              kategoriLembagaFilter={kategoriLembagaFilter}
              onKategoriLembagaFilterChange={(e) => setKategoriLembagaFilter(e.target.value)}
              jabatanFilter={jabatanFilter}
              onJabatanFilterChange={(e) => setJabatanFilter(e.target.value)}
              statusFilter={statusFilter}
              onStatusFilterChange={(e) => setStatusFilter(e.target.value)}
              statusOptions={statusOptions}
              kategoriOptions={kategoriOptions}
              lembagaOptions={lembagaOptions}
              lembagaFilterDisabled={!!lockedJabatanLembagaId}
              jabatanOptions={jabatanOptions}
              onRefresh={loadAllPengurus}
              onResetFilter={handleResetFilter}
              itemsPerPage={itemsPerPage}
              onItemsPerPageChange={handleItemsPerPageChange}
              totalPengurus={totalPengurus}
              currentPage={currentPage}
            />

            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
              {paginatedPengurus.length === 0 ? (
                <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                  {filteredPengurus.length === 0 && allPengurus.length > 0
                    ? 'Tidak ada pengurus yang sesuai dengan filter'
                    : 'Tidak ada pengurus ditemukan'}
                </div>
              ) : (
                <>
                  <div className="divide-y divide-gray-100 dark:divide-gray-700/50">
                    {paginatedPengurus.map((pengurus, index) => (
                      <PengurusListItem
                        key={pengurus.id}
                        pengurus={pengurus}
                        index={index}
                        onClick={handlePengurusClick}
                        getStatusBadgeColor={getStatusBadgeColor}
                        getStatusDisplayName={getStatusDisplayName}
                        lembagaList={lembagaList}
                        viewMode={viewMode}
                      />
                    ))}
                  </div>
                  {totalPages > 1 && (
                    <div className="px-4 py-4 border-t border-gray-200 dark:border-gray-700">
                      <div className="flex flex-wrap items-center justify-center sm:justify-end gap-2">
                          <button
                            onClick={() => handlePageChange(currentPage - 1)}
                            disabled={currentPage === 1}
                            className="p-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-sm inline-flex items-center justify-center min-w-[2.25rem]"
                            aria-label="Sebelumnya"
                          >
                            &lt;
                          </button>
                          <div className="flex items-center gap-1">
                            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                              const pageNum = totalPages <= 5 ? i + 1 : currentPage <= 3 ? i + 1 : currentPage >= totalPages - 2 ? totalPages - 4 + i : currentPage - 2 + i
                              return (
                                <button
                                  key={pageNum}
                                  onClick={() => handlePageChange(pageNum)}
                                  className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${currentPage === pageNum ? 'bg-primary-600 text-white' : 'border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'}`}
                                >
                                  {pageNum}
                                </button>
                              )
                            })}
                          </div>
                          <button
                          onClick={() => handlePageChange(currentPage + 1)}
                          disabled={currentPage === totalPages}
                          className="p-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-sm inline-flex items-center justify-center min-w-[2.25rem]"
                          aria-label="Selanjutnya"
                        >
                          &gt;
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
            {/* Spacer agar bagian bawah tidak tertutup nav bawah di HP */}
            <div className="h-20 sm:h-0 flex-shrink-0" aria-hidden="true" />
          </motion.div>
        </div>
      </div>
      {/* Offcanvas Tambah Pengurus Baru (bawah) */}
      {createPortal(
        <TambahPengurusOffcanvas
          isOpen={showAddModal}
          onClose={closeTambahOffcanvas}
          onSuccess={handleAddUserSuccess}
        />,
        document.body
      )}
      {/* Offcanvas Eksport - render via portal ke document.body agar overlay menutup seluruh layar (sidebar + nav) seperti Cari Santri */}
      {createPortal(
        <ExportPengurusOffcanvas
          isOpen={showExportOffcanvas}
          onClose={closeExportOffcanvas}
          filteredData={filteredPengurus}
          lembagaList={lembagaList}
        />,
        document.body
      )}
      {/* Offcanvas Detail Pengurus - klik list buka kanan, tampil nama/username/email/wa/verifikasi, jabatan (tambah/hapus), status toggle */}
      {createPortal(
        <DetailPengurusOffcanvas
          isOpen={detailPengurusId != null}
          onClose={closeDetailOffcanvas}
          showEditPanel={showEditPanel}
          onOpenEdit={() => setShowEditPanel(true)}
          onCloseEdit={closeEditOnly}
          pengurusId={detailPengurusId}
          lembagaList={lembagaList}
          onPengurusPatch={handlePengurusPatch}
        />,
        document.body
      )}
    </div>
  )
}

export default Pengurus
