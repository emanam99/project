import { useState, useEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { lulusanAPI } from '../../services/api'
import { useOffcanvasBackClose } from '../../hooks/useOffcanvasBackClose'
import ExportLulusanOffcanvas from './components/ExportLulusanOffcanvas'
import DetailLulusanOffcanvas from './components/DetailLulusanOffcanvas'

function DataLulusan() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [lulusanList, setLulusanList] = useState([])
  const [filteredList, setFilteredList] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(50)
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [isInputFocused, setIsInputFocused] = useState(false)
  const [tahunAjaranFilter, setTahunAjaranFilter] = useState('')
  const [kategoriFilter, setKategoriFilter] = useState('')
  const [lembagaFilter, setLembagaFilter] = useState('')
  const [rombelFilter, setRombelFilter] = useState('')
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' })
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)
  const [isExportOffcanvasOpen, setIsExportOffcanvasOpen] = useState(false)
  const [detailOffcanvasRow, setDetailOffcanvasRow] = useState(null)
  const closeExportOffcanvas = useOffcanvasBackClose(isExportOffcanvasOpen, () => setIsExportOffcanvasOpen(false))
  const closeDetailOffcanvas = useOffcanvasBackClose(!!detailOffcanvasRow, () => setDetailOffcanvasRow(null))

  // Dynamic unique values untuk filter (dengan count)
  const dynamicUniqueTahunAjaran = useMemo(() => {
    let filtered = lulusanList
    if (kategoriFilter) filtered = filtered.filter(r => (r.lembaga_kategori || '') === kategoriFilter)
    if (lembagaFilter) filtered = filtered.filter(r => String(r.lembaga_nama || '') === lembagaFilter)
    if (rombelFilter) filtered = filtered.filter(r => (r.rombel_label || '') === rombelFilter || (r.id_rombel != null && String(r.id_rombel) === rombelFilter))
    const values = [...new Set(filtered.map(r => (r.tahun_ajaran != null && r.tahun_ajaran !== '') ? String(r.tahun_ajaran) : null).filter(Boolean))]
    const counts = values.map(val => ({
      value: val,
      count: filtered.filter(r => (r.tahun_ajaran || '') === val).length
    }))
    return counts.sort((a, b) => (b.value || '').localeCompare(a.value || ''))
  }, [lulusanList, kategoriFilter, lembagaFilter, rombelFilter])

  const dynamicUniqueKategori = useMemo(() => {
    let filtered = lulusanList
    if (tahunAjaranFilter) filtered = filtered.filter(r => (r.tahun_ajaran || '') === tahunAjaranFilter)
    if (lembagaFilter) filtered = filtered.filter(r => String(r.lembaga_nama || '') === lembagaFilter)
    if (rombelFilter) filtered = filtered.filter(r => (r.rombel_label || '') === rombelFilter || (r.id_rombel != null && String(r.id_rombel) === rombelFilter))
    const values = [...new Set(filtered.map(r => (r.lembaga_kategori != null && r.lembaga_kategori !== '') ? String(r.lembaga_kategori) : null).filter(Boolean))]
    const counts = values.map(val => ({
      value: val,
      count: filtered.filter(r => (r.lembaga_kategori || '') === val).length
    }))
    return counts.sort((a, b) => (a.value || '').localeCompare(b.value || ''))
  }, [lulusanList, tahunAjaranFilter, lembagaFilter, rombelFilter])

  const dynamicUniqueLembaga = useMemo(() => {
    let filtered = lulusanList
    if (tahunAjaranFilter) filtered = filtered.filter(r => (r.tahun_ajaran || '') === tahunAjaranFilter)
    if (kategoriFilter) filtered = filtered.filter(r => (r.lembaga_kategori || '') === kategoriFilter)
    if (rombelFilter) filtered = filtered.filter(r => (r.rombel_label || '') === rombelFilter)
    const values = [...new Set(filtered.map(r => String(r.lembaga_nama || '')).filter(Boolean))]
    const counts = values.map(val => ({
      value: val,
      count: filtered.filter(r => String(r.lembaga_nama || '') === val).length
    }))
    return counts.sort((a, b) => (a.value || '').localeCompare(b.value || ''))
  }, [lulusanList, tahunAjaranFilter, kategoriFilter, rombelFilter])

  const dynamicUniqueRombel = useMemo(() => {
    let filtered = lulusanList
    if (tahunAjaranFilter) filtered = filtered.filter(r => (r.tahun_ajaran || '') === tahunAjaranFilter)
    if (kategoriFilter) filtered = filtered.filter(r => (r.lembaga_kategori || '') === kategoriFilter)
    if (lembagaFilter) filtered = filtered.filter(r => String(r.lembaga_nama || '') === lembagaFilter)
    const values = [...new Set(filtered.map(r => (r.rombel_label != null && r.rombel_label !== '') ? String(r.rombel_label) : (r.id_rombel != null ? String(r.id_rombel) : null)).filter(Boolean))]
    const counts = values.map(val => ({
      value: val,
      count: filtered.filter(r => (r.rombel_label || '') === val || (r.id_rombel != null && String(r.id_rombel) === val)).length
    }))
    return counts.sort((a, b) => (a.value || '').localeCompare(b.value || ''))
  }, [lulusanList, tahunAjaranFilter, kategoriFilter, lembagaFilter])

  // Filter data berdasarkan search dan filter
  useEffect(() => {
    let filtered = lulusanList

    if (tahunAjaranFilter) {
      filtered = filtered.filter(r => (r.tahun_ajaran || '') === tahunAjaranFilter)
    }
    if (kategoriFilter) {
      filtered = filtered.filter(r => (r.lembaga_kategori || '') === kategoriFilter)
    }
    if (lembagaFilter) {
      filtered = filtered.filter(r => String(r.lembaga_nama || '') === lembagaFilter)
    }
    if (rombelFilter) {
      filtered = filtered.filter(r => (r.rombel_label || '') === rombelFilter || (r.id_rombel != null && String(r.id_rombel) === rombelFilter))
    }

    if (searchQuery.trim() !== '') {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(r =>
        (r.nama && r.nama.toLowerCase().includes(query)) ||
        (r.nis != null && String(r.nis).toLowerCase().includes(query)) ||
        (r.id != null && String(r.id).includes(query)) ||
        (r.id_santri != null && String(r.id_santri).includes(query)) ||
        (r.nik && String(r.nik).includes(query)) ||
        (r.lembaga_nama && r.lembaga_nama.toLowerCase().includes(query))
      )
    }

    if (sortConfig.key) {
      filtered = [...filtered].sort((a, b) => {
        const aVal = a[sortConfig.key]
        const bVal = b[sortConfig.key]
        if (aVal == null && bVal == null) return 0
        if (aVal == null) return 1
        if (bVal == null) return -1
        if (typeof aVal === 'string') {
          return sortConfig.direction === 'asc'
            ? aVal.localeCompare(bVal)
            : bVal.localeCompare(aVal)
        }
        return sortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal
      })
    }

    setFilteredList(filtered)
  }, [searchQuery, lulusanList, tahunAjaranFilter, kategoriFilter, lembagaFilter, rombelFilter, sortConfig])

  useEffect(() => {
    loadLulusanData()
  }, [])

  const loadLulusanData = async () => {
    setLoading(true)
    setError('')
    try {
      const result = await lulusanAPI.getAll()
      if (result.success) {
        const data = result.data || []
        setLulusanList(data)
        setFilteredList(data)
        setCurrentPage(1)
      } else {
        setError(result.message || 'Gagal memuat data lulusan')
      }
    } catch (err) {
      console.error('Error loading lulusan:', err)
      setError(err.message || 'Terjadi kesalahan saat memuat data')
    } finally {
      setLoading(false)
    }
  }

  const totalPages = Math.ceil(filteredList.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const paginatedList = filteredList.slice(startIndex, endIndex)

  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery, tahunAjaranFilter, kategoriFilter, lembagaFilter, rombelFilter, sortConfig, itemsPerPage])

  const handlePageChange = (page) => {
    setCurrentPage(page)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleItemsPerPageChange = (value) => {
    const newItemsPerPage = value === 'all' ? filteredList.length : Number(value)
    setItemsPerPage(newItemsPerPage)
    setCurrentPage(1)
  }

  const handleSort = (key) => {
    let direction = 'asc'
    if (sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc'
    setSortConfig({ key, direction })
  }

  useEffect(() => {
    if (!menuOpen) return
    const onOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false)
    }
    document.addEventListener('click', onOutside)
    return () => document.removeEventListener('click', onOutside)
  }, [menuOpen])

  const exportData = selectionMode && selectedIds.size > 0
    ? filteredList.filter((r) => selectedIds.has(r.id))
    : filteredList

  const toggleSelectAllPage = () => {
    if (selectedIds.size >= paginatedList.length) {
      setSelectedIds((prev) => {
        const next = new Set(prev)
        paginatedList.forEach((r) => next.delete(r.id))
        return next
      })
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev)
        paginatedList.forEach((r) => next.add(r.id))
        return next
      })
    }
  }

  const toggleSelectOne = (id, e) => {
    e.stopPropagation()
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const SortIcon = ({ columnKey }) => {
    if (sortConfig.key !== columnKey) {
      return (
        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
        </svg>
      )
    }
    return sortConfig.direction === 'asc' ? (
      <svg className="w-4 h-4 text-teal-600 dark:text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 15l7-7 7 7" />
      </svg>
    ) : (
      <svg className="w-4 h-4 text-teal-600 dark:text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
      </svg>
    )
  }

  if (loading) {
    return (
      <div className="h-full overflow-hidden" style={{ minHeight: 0 }}>
        <div className="h-full overflow-y-auto page-content-scroll" style={{ minHeight: 0 }}>
          <div className="p-4 sm:p-6 lg:p-8">
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600"></div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="h-full overflow-hidden" style={{ minHeight: 0 }}>
        <div className="h-full overflow-y-auto page-content-scroll" style={{ minHeight: 0 }}>
          <div className="p-4 sm:p-6 lg:p-8">
            <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg">
              {error}
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
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            {/* Search & Filter — sticky seperti Pengurus/Santri */}
            <div className="sticky top-0 z-10 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 mb-4">
              <div className="rounded-xl overflow-hidden">
                <div className="relative pb-2 px-4 pt-3">
                  <div className="relative">
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onFocus={() => setIsInputFocused(true)}
                      onBlur={() => setIsInputFocused(false)}
                      className="w-full p-2 pr-12 focus:outline-none bg-transparent dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400"
                      placeholder="Cari"
                    />
                    <div className="absolute right-0 top-0 bottom-0 flex items-center gap-1 pr-1 pointer-events-none">
                      <button
                        onClick={() => setIsFilterOpen(!isFilterOpen)}
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
                        <div className="flex flex-wrap gap-2">
                          <select
                            value={tahunAjaranFilter}
                            onChange={(e) => setTahunAjaranFilter(e.target.value)}
                            className="border rounded p-1 h-7 min-w-0 text-xs bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 focus:ring-1 focus:ring-teal-400"
                          >
                            <option value="">Tahun Ajaran</option>
                            {dynamicUniqueTahunAjaran.map(item => (
                              <option key={item.value} value={item.value}>{item.value} ({item.count})</option>
                            ))}
                          </select>
                          <select
                            value={kategoriFilter}
                            onChange={(e) => setKategoriFilter(e.target.value)}
                            className="border rounded p-1 h-7 min-w-0 text-xs bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 focus:ring-1 focus:ring-teal-400"
                          >
                            <option value="">Kategori Lembaga</option>
                            {dynamicUniqueKategori.map(item => (
                              <option key={item.value} value={item.value}>{item.value} ({item.count})</option>
                            ))}
                          </select>
                          <select
                            value={lembagaFilter}
                            onChange={(e) => setLembagaFilter(e.target.value)}
                            className="border rounded p-1 h-7 min-w-0 text-xs bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 focus:ring-1 focus:ring-teal-400"
                          >
                            <option value="">Lembaga</option>
                            {dynamicUniqueLembaga.map(item => (
                              <option key={item.value} value={item.value}>{String(item.value)} ({item.count})</option>
                            ))}
                          </select>
                          <select
                            value={rombelFilter}
                            onChange={(e) => setRombelFilter(e.target.value)}
                            className="border rounded p-1 h-7 min-w-0 text-xs bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 focus:ring-1 focus:ring-teal-400"
                          >
                            <option value="">Rombel</option>
                            {dynamicUniqueRombel.map(item => (
                              <option key={item.value} value={item.value}>{item.value} ({item.count})</option>
                            ))}
                          </select>
                        </div>
                        <div className="flex flex-wrap items-center justify-end gap-2 pt-3 mt-2 border-t border-gray-200 dark:border-gray-600">
                          <button
                            type="button"
                            onClick={loadLulusanData}
                            disabled={loading}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors disabled:opacity-50"
                            title="Refresh"
                          >
                            <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                            Refresh
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setTahunAjaranFilter('')
                              setKategoriFilter('')
                              setLembagaFilter('')
                              setRombelFilter('')
                              setSearchQuery('')
                              setCurrentPage(1)
                            }}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
                            title="Reset filter"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
                            </svg>
                            Reset filter
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* Tabel Lulusan — style sama dengan page Santri */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden">
              <div className="px-4 sm:px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                <div className="flex flex-row items-center justify-between gap-2 min-w-0">
                  <h2 className="text-base sm:text-lg font-semibold text-gray-500 dark:text-gray-400 shrink-0">
                    {filteredList.length}
                  </h2>
                  <div className="flex items-center gap-2 shrink-0" ref={menuRef}>
                    <select
                      value={itemsPerPage >= filteredList.length ? 'all' : itemsPerPage}
                      onChange={(e) => handleItemsPerPageChange(e.target.value)}
                      className="h-8 pr-6 pl-1 py-1 text-xs bg-transparent border-none text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-0 min-w-0 w-14 sm:w-16 cursor-pointer appearance-none bg-[length:12px] bg-[right_2px_center] bg-no-repeat [background-image:url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20fill%3D%22none%22%20viewBox%3D%220%200%2024%2024%22%20stroke%3D%22%236b7280%22%3E%3Cpath%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%20stroke-width%3D%222%22%20d%3D%22M19%209l-7%207-7-7%22%2F%3E%3C%2Fsvg%3E')] dark:[background-image:url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20fill%3D%22none%22%20viewBox%3D%220%200%2024%2024%22%20stroke%3D%22%239ca3af%22%3E%3Cpath%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%20stroke-width%3D%222%22%20d%3D%22M19%209l-7%207-7-7%22%2F%3E%3C%2Fsvg%3E')]"
                      aria-label="Jumlah per halaman"
                    >
                      <option value="25">25</option>
                      <option value="50">50</option>
                      <option value="100">100</option>
                      <option value="200">200</option>
                      <option value="500">500</option>
                      <option value="all">Semua</option>
                    </select>
                    <div className="hidden sm:flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setIsExportOffcanvasOpen(true)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 h-8 text-xs font-medium rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-teal-500/50"
                        title="Eksport data"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                        Eksport
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectionMode((m) => { if (m) setSelectedIds(new Set()); return !m })}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 h-8 text-xs font-medium rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/50 ${selectionMode ? 'text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-900/20' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        {selectionMode ? 'Selesai Pilih' : 'Pilih Check'}
                      </button>
                    </div>
                    <div className="relative sm:hidden">
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setMenuOpen((o) => !o) }}
                        className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-teal-500/50"
                        title="Menu"
                        aria-expanded={menuOpen}
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
                        </svg>
                      </button>
                      <AnimatePresence>
                        {menuOpen && (
                          <motion.div
                            initial={{ opacity: 0, y: -4 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -4 }}
                            transition={{ duration: 0.15 }}
                            className="absolute right-0 top-full mt-1 py-1 w-44 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 shadow-lg z-50"
                          >
                            <button
                              type="button"
                              onClick={() => { setMenuOpen(false); setIsExportOffcanvasOpen(true) }}
                              className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                              </svg>
                              Eksport
                            </button>
                            <button
                              type="button"
                              onClick={() => { setSelectionMode((m) => { if (m) setSelectedIds(new Set()); return !m }); setMenuOpen(false) }}
                              className={`w-full px-3 py-2 text-left text-sm flex items-center gap-2 ${selectionMode ? 'text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-900/20' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                              {selectionMode ? 'Selesai Pilih' : 'Pilih Check'}
                            </button>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                </div>
              </div>

              {filteredList.length === 0 ? (
                <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                  <svg className="w-12 h-12 mx-auto mb-4 text-gray-300 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 14l9-5-9-5-9 5 9 5z" />
                  </svg>
                  <p>Belum ada data lulusan</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 dark:bg-gray-900">
                      <tr>
                        {selectionMode && (
                          <th className="px-2 sm:px-4 py-3 w-10">
                            <input
                              type="checkbox"
                              checked={paginatedList.length > 0 && paginatedList.every((r) => selectedIds.has(r.id))}
                              onChange={toggleSelectAllPage}
                              onClick={(e) => e.stopPropagation()}
                              className="rounded border-gray-300 dark:border-gray-600 text-teal-600 focus:ring-teal-500"
                            />
                          </th>
                        )}
                        <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">No</th>
                        <th onClick={() => handleSort('nama')} className="px-4 sm:px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors whitespace-nowrap">
                          <div className="flex items-center gap-2">Nama <SortIcon columnKey="nama" /></div>
                        </th>
                        <th onClick={() => handleSort('nis')} className="px-4 sm:px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors whitespace-nowrap">
                          <div className="flex items-center gap-2">NIS <SortIcon columnKey="nis" /></div>
                        </th>
                        <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">NIK</th>
                        <th onClick={() => handleSort('lembaga_nama')} className="px-4 sm:px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors whitespace-nowrap">
                          <div className="flex items-center gap-2">Lembaga <SortIcon columnKey="lembaga_nama" /></div>
                        </th>
                        <th onClick={() => handleSort('lembaga_kategori')} className="px-4 sm:px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors whitespace-nowrap">
                          <div className="flex items-center gap-2">Kategori <SortIcon columnKey="lembaga_kategori" /></div>
                        </th>
                        <th onClick={() => handleSort('rombel_label')} className="px-4 sm:px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors whitespace-nowrap">
                          <div className="flex items-center gap-2">Rombel <SortIcon columnKey="rombel_label" /></div>
                        </th>
                        <th onClick={() => handleSort('tahun_ajaran')} className="px-4 sm:px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors whitespace-nowrap">
                          <div className="flex items-center gap-2">Tahun Ajaran <SortIcon columnKey="tahun_ajaran" /></div>
                        </th>
                        <th onClick={() => handleSort('tanggal_dibuat')} className="px-4 sm:px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors whitespace-nowrap">
                          <div className="flex items-center gap-2">Tanggal Dibuat <SortIcon columnKey="tanggal_dibuat" /></div>
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                      {paginatedList.map((row, index) => (
                        <motion.tr
                          key={row.id}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ duration: 0.3, delay: index * 0.02 }}
                          onClick={() => setDetailOffcanvasRow(row)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setDetailOffcanvasRow(row) } }}
                          className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors duration-150 cursor-pointer"
                        >
                          {selectionMode && (
                            <td className="px-2 sm:px-4 py-4 w-10" onClick={(e) => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                checked={selectedIds.has(row.id)}
                                onChange={(e) => toggleSelectOne(row.id, e)}
                                className="rounded border-gray-300 dark:border-gray-600 text-teal-600 focus:ring-teal-500"
                              />
                            </td>
                          )}
                          <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-200">
                            {startIndex + index + 1}
                          </td>
                          <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-200">{row.nama || '-'}</td>
                          <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-700 dark:text-gray-300">{row.nis ?? row.id_santri ?? '-'}</td>
                          <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-700 dark:text-gray-300">{row.nik || '-'}</td>
                          <td className="px-4 sm:px-6 py-4 whitespace-nowrap">
                            <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-400">
                              {row.lembaga_nama || '-'}
                            </span>
                          </td>
                          <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">{row.lembaga_kategori || '-'}</td>
                          <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">{row.rombel_label || '-'}</td>
                          <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">{row.tahun_ajaran || '-'}</td>
                          <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">{row.tanggal_dibuat || '-'}</td>
                        </motion.tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {filteredList.length > 0 && totalPages > 1 && (
                <div className="px-4 sm:px-6 py-4 border-t border-gray-200 dark:border-gray-700">
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="text-sm text-gray-700 dark:text-gray-300">
                      Menampilkan {startIndex + 1} - {Math.min(endIndex, filteredList.length)} dari {filteredList.length} lulusan
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handlePageChange(currentPage - 1)}
                        disabled={currentPage === 1}
                        className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
                        </svg>
                      </button>
                      <div className="flex items-center gap-1">
                        {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                          let pageNum
                          if (totalPages <= 5) pageNum = i + 1
                          else if (currentPage <= 3) pageNum = i + 1
                          else if (currentPage >= totalPages - 2) pageNum = totalPages - 4 + i
                          else pageNum = currentPage - 2 + i
                          return (
                            <button
                              key={pageNum}
                              onClick={() => handlePageChange(pageNum)}
                              className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${currentPage === pageNum ? 'bg-teal-600 text-white' : 'border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'}`}
                            >
                              {pageNum}
                            </button>
                          )
                        })}
                      </div>
                      <button
                        onClick={() => handlePageChange(currentPage + 1)}
                        disabled={currentPage === totalPages}
                        className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {createPortal(
              <ExportLulusanOffcanvas
                isOpen={isExportOffcanvasOpen}
                onClose={closeExportOffcanvas}
                filteredData={exportData}
              />,
              document.body
            )}
            {createPortal(
              <DetailLulusanOffcanvas
                isOpen={!!detailOffcanvasRow}
                onClose={closeDetailOffcanvas}
                lulusanRow={detailOffcanvasRow}
              />,
              document.body
            )}
            <div className="h-20 sm:h-0" aria-hidden="true" />
          </motion.div>
        </div>
      </div>
    </div>
  )
}

export default DataLulusan
