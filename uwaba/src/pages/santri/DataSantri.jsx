import { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { santriAPI } from '../../services/api'
import { useOffcanvasBackClose } from '../../hooks/useOffcanvasBackClose'
import ExportSantriOffcanvas from './components/ExportSantriOffcanvas'
import DetailSantriOffcanvas from './components/DetailSantriOffcanvas'
import EditSantriOffcanvas from './components/EditSantriOffcanvas'

function DataSantri() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [santriList, setSantriList] = useState([])
  const [filteredList, setFilteredList] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(50)
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [isInputFocused, setIsInputFocused] = useState(false)
  const [diniyahFilter, setDiniyahFilter] = useState('')
  const [formalFilter, setFormalFilter] = useState('')
  const [statusSantriFilter, setStatusSantriFilter] = useState('')
  const [kategoriFilter, setKategoriFilter] = useState('')
  const [daerahFilter, setDaerahFilter] = useState('')
  const [kamarFilter, setKamarFilter] = useState('')
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' })
  const [isExportOffcanvasOpen, setIsExportOffcanvasOpen] = useState(false)
  const [detailOffcanvasRow, setDetailOffcanvasRow] = useState(null)
  const [editSantri, setEditSantri] = useState(null)
  const closeExportOffcanvas = useOffcanvasBackClose(isExportOffcanvasOpen, () => setIsExportOffcanvasOpen(false))
  const closeDetailOffcanvas = useOffcanvasBackClose(!!detailOffcanvasRow, () => setDetailOffcanvasRow(null))
  const closeEditOffcanvas = useOffcanvasBackClose(!!editSantri, () => setEditSantri(null))

  const sameLembaga = (a, b) => (a != null && b != null && String(a) === String(b))

  // Dynamic unique values untuk filter (dengan count)
  const dynamicUniqueDiniyah = useMemo(() => {
    let filtered = santriList
    if (formalFilter) filtered = filtered.filter(s => sameLembaga(s.formal, formalFilter))
    if (statusSantriFilter) filtered = filtered.filter(s => (s.status_santri || '') === statusSantriFilter)
    if (kategoriFilter) filtered = filtered.filter(s => (s.kategori || '') === kategoriFilter)
    if (daerahFilter) filtered = filtered.filter(s => (s.daerah || '') === daerahFilter)
    if (kamarFilter) filtered = filtered.filter(s => (s.kamar || '') === kamarFilter)
    const values = [...new Set(filtered.map(s => s.diniyah).filter(Boolean))]
    const counts = values.map(val => ({
      value: val,
      count: filtered.filter(s => sameLembaga(s.diniyah, val)).length
    }))
    return counts.sort((a, b) => (String(a.value || '')).localeCompare(String(b.value || '')))
  }, [santriList, formalFilter, statusSantriFilter, kategoriFilter, daerahFilter, kamarFilter])

  const dynamicUniqueFormal = useMemo(() => {
    let filtered = santriList
    if (diniyahFilter) filtered = filtered.filter(s => sameLembaga(s.diniyah, diniyahFilter))
    if (statusSantriFilter) filtered = filtered.filter(s => (s.status_santri || '') === statusSantriFilter)
    if (kategoriFilter) filtered = filtered.filter(s => (s.kategori || '') === kategoriFilter)
    if (daerahFilter) filtered = filtered.filter(s => (s.daerah || '') === daerahFilter)
    if (kamarFilter) filtered = filtered.filter(s => (s.kamar || '') === kamarFilter)
    const values = [...new Set(filtered.map(s => s.formal).filter(Boolean))]
    const counts = values.map(val => ({
      value: val,
      count: filtered.filter(s => sameLembaga(s.formal, val)).length
    }))
    return counts.sort((a, b) => (String(a.value || '')).localeCompare(String(b.value || '')))
  }, [santriList, diniyahFilter, statusSantriFilter, kategoriFilter, daerahFilter, kamarFilter])

  const dynamicUniqueStatusSantri = useMemo(() => {
    let filtered = santriList
    if (diniyahFilter) filtered = filtered.filter(s => sameLembaga(s.diniyah, diniyahFilter))
    if (formalFilter) filtered = filtered.filter(s => sameLembaga(s.formal, formalFilter))
    if (kategoriFilter) filtered = filtered.filter(s => (s.kategori || '') === kategoriFilter)
    if (daerahFilter) filtered = filtered.filter(s => (s.daerah || '') === daerahFilter)
    if (kamarFilter) filtered = filtered.filter(s => (s.kamar || '') === kamarFilter)
    const values = [...new Set(filtered.map(s => (s.status_santri != null && s.status_santri !== '') ? String(s.status_santri) : null).filter(Boolean))]
    const counts = values.map(val => ({
      value: val,
      count: filtered.filter(s => (s.status_santri || '') === val).length
    }))
    return counts.sort((a, b) => (a.value || '').localeCompare(b.value || ''))
  }, [santriList, diniyahFilter, formalFilter, kategoriFilter, daerahFilter, kamarFilter])

  const dynamicUniqueKategori = useMemo(() => {
    let filtered = santriList
    if (diniyahFilter) filtered = filtered.filter(s => sameLembaga(s.diniyah, diniyahFilter))
    if (formalFilter) filtered = filtered.filter(s => sameLembaga(s.formal, formalFilter))
    if (statusSantriFilter) filtered = filtered.filter(s => (s.status_santri || '') === statusSantriFilter)
    if (daerahFilter) filtered = filtered.filter(s => (s.daerah || '') === daerahFilter)
    if (kamarFilter) filtered = filtered.filter(s => (s.kamar || '') === kamarFilter)
    const values = [...new Set(filtered.map(s => (s.kategori != null && s.kategori !== '') ? String(s.kategori) : null).filter(Boolean))]
    const counts = values.map(val => ({
      value: val,
      count: filtered.filter(s => (s.kategori || '') === val).length
    }))
    return counts.sort((a, b) => (a.value || '').localeCompare(b.value || ''))
  }, [santriList, diniyahFilter, formalFilter, statusSantriFilter, daerahFilter, kamarFilter])

  const dynamicUniqueDaerah = useMemo(() => {
    let filtered = santriList
    if (diniyahFilter) filtered = filtered.filter(s => sameLembaga(s.diniyah, diniyahFilter))
    if (formalFilter) filtered = filtered.filter(s => sameLembaga(s.formal, formalFilter))
    if (statusSantriFilter) filtered = filtered.filter(s => (s.status_santri || '') === statusSantriFilter)
    if (kategoriFilter) filtered = filtered.filter(s => (s.kategori || '') === kategoriFilter)
    if (kamarFilter) filtered = filtered.filter(s => (s.kamar || '') === kamarFilter)
    const values = [...new Set(filtered.map(s => (s.daerah != null && s.daerah !== '') ? String(s.daerah) : null).filter(Boolean))]
    const counts = values.map(val => ({
      value: val,
      count: filtered.filter(s => (s.daerah || '') === val).length
    }))
    return counts.sort((a, b) => (a.value || '').localeCompare(b.value || ''))
  }, [santriList, diniyahFilter, formalFilter, statusSantriFilter, kategoriFilter, kamarFilter])

  const dynamicUniqueKamar = useMemo(() => {
    let filtered = santriList
    if (diniyahFilter) filtered = filtered.filter(s => sameLembaga(s.diniyah, diniyahFilter))
    if (formalFilter) filtered = filtered.filter(s => sameLembaga(s.formal, formalFilter))
    if (statusSantriFilter) filtered = filtered.filter(s => (s.status_santri || '') === statusSantriFilter)
    if (kategoriFilter) filtered = filtered.filter(s => (s.kategori || '') === kategoriFilter)
    if (daerahFilter) filtered = filtered.filter(s => (s.daerah || '') === daerahFilter)
    const values = [...new Set(filtered.map(s => (s.kamar != null && s.kamar !== '') ? String(s.kamar) : null).filter(Boolean))]
    const counts = values.map(val => ({
      value: val,
      count: filtered.filter(s => (s.kamar || '') === val).length
    }))
    return counts.sort((a, b) => (a.value || '').localeCompare(b.value || ''))
  }, [santriList, diniyahFilter, formalFilter, statusSantriFilter, kategoriFilter, daerahFilter])

  // Filter data berdasarkan search dan filter
  useEffect(() => {
    let filtered = santriList

    if (diniyahFilter) {
      filtered = filtered.filter(s => sameLembaga(s.diniyah, diniyahFilter))
    }
    if (formalFilter) {
      filtered = filtered.filter(s => sameLembaga(s.formal, formalFilter))
    }
    if (statusSantriFilter) {
      filtered = filtered.filter(s => (s.status_santri || '') === statusSantriFilter)
    }
    if (kategoriFilter) {
      filtered = filtered.filter(s => (s.kategori || '') === kategoriFilter)
    }
    if (daerahFilter) {
      filtered = filtered.filter(s => (s.daerah || '') === daerahFilter)
    }
    if (kamarFilter) {
      filtered = filtered.filter(s => (s.kamar || '') === kamarFilter)
    }

    if (searchQuery.trim() !== '') {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(s =>
        (s.nama && s.nama.toLowerCase().includes(query)) ||
        (s.nis != null && String(s.nis).toLowerCase().includes(query)) ||
        (s.id != null && String(s.id).includes(query)) ||
        (s.nik && String(s.nik).includes(query))
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
  }, [searchQuery, santriList, diniyahFilter, formalFilter, statusSantriFilter, kategoriFilter, daerahFilter, kamarFilter, sortConfig])

  useEffect(() => {
    loadSantriData()
  }, [])

  const loadSantriData = async () => {
    setLoading(true)
    setError('')
    try {
      const result = await santriAPI.getAll()
      if (result.success) {
        const data = result.data || []
        setSantriList(data)
        setFilteredList(data)
        setCurrentPage(1)
      } else {
        setError(result.message || 'Gagal memuat data santri')
      }
    } catch (err) {
      console.error('Error loading santri:', err)
      setError(err.message || 'Terjadi kesalahan saat memuat data')
    } finally {
      setLoading(false)
    }
  }

  const totalPages = Math.ceil(filteredList.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const paginatedList = filteredList.slice(startIndex, endIndex)

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
    setCurrentPage(1)
  }, [searchQuery, diniyahFilter, formalFilter, statusSantriFilter, kategoriFilter, daerahFilter, kamarFilter, sortConfig, itemsPerPage])

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
        <div className="h-full overflow-y-auto" style={{ minHeight: 0 }}>
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
        <div className="h-full overflow-y-auto" style={{ minHeight: 0 }}>
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
      <div className="h-full overflow-y-auto" style={{ minHeight: 0 }}>
        <div className="p-4 sm:p-6 lg:p-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            {/* Search & Filter - gaya Data Pendaftar */}
            <div className="mb-6">
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden">
                <div className="relative pb-2 px-4 pt-3">
                  <div className="relative">
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onFocus={() => setIsInputFocused(true)}
                      onBlur={() => setIsInputFocused(false)}
                      className="w-full p-2 pr-28 focus:outline-none bg-transparent dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400"
                      placeholder="Cari berdasarkan nama, NIS, atau NIK..."
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
                      <button
                        onClick={loadSantriData}
                        className="bg-blue-100 hover:bg-blue-200 dark:bg-blue-700 dark:hover:bg-blue-600 text-blue-700 dark:text-blue-300 p-1.5 rounded text-xs transition-colors pointer-events-auto"
                        title="Refresh"
                        disabled={loading}
                      >
                        <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
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
                            value={diniyahFilter}
                            onChange={(e) => setDiniyahFilter(e.target.value)}
                            className="border rounded p-1 h-7 min-w-0 text-xs bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 focus:ring-1 focus:ring-teal-400"
                          >
                            <option value="">Lembaga Diniyah</option>
                            {dynamicUniqueDiniyah.map(item => (
                              <option key={item.value} value={item.value}>{String(item.value)} ({item.count})</option>
                            ))}
                          </select>
                          <select
                            value={formalFilter}
                            onChange={(e) => setFormalFilter(e.target.value)}
                            className="border rounded p-1 h-7 min-w-0 text-xs bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 focus:ring-1 focus:ring-teal-400"
                          >
                            <option value="">Lembaga Formal</option>
                            {dynamicUniqueFormal.map(item => (
                              <option key={item.value} value={item.value}>{String(item.value)} ({item.count})</option>
                            ))}
                          </select>
                          <select
                            value={statusSantriFilter}
                            onChange={(e) => setStatusSantriFilter(e.target.value)}
                            className="border rounded p-1 h-7 min-w-0 text-xs bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 focus:ring-1 focus:ring-teal-400"
                          >
                            <option value="">Status Santri</option>
                            {dynamicUniqueStatusSantri.map(item => (
                              <option key={item.value} value={item.value}>{item.value} ({item.count})</option>
                            ))}
                          </select>
                          <select
                            value={kategoriFilter}
                            onChange={(e) => setKategoriFilter(e.target.value)}
                            className="border rounded p-1 h-7 min-w-0 text-xs bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 focus:ring-1 focus:ring-teal-400"
                          >
                            <option value="">Kategori</option>
                            {dynamicUniqueKategori.map(item => (
                              <option key={item.value} value={item.value}>{item.value} ({item.count})</option>
                            ))}
                          </select>
                          <select
                            value={daerahFilter}
                            onChange={(e) => { setDaerahFilter(e.target.value); setKamarFilter('') }}
                            className="border rounded p-1 h-7 min-w-0 text-xs bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 focus:ring-1 focus:ring-teal-400"
                          >
                            <option value="">Daerah</option>
                            {dynamicUniqueDaerah.map(item => (
                              <option key={item.value} value={item.value}>{item.value} ({item.count})</option>
                            ))}
                          </select>
                          <select
                            value={kamarFilter}
                            onChange={(e) => setKamarFilter(e.target.value)}
                            className="border rounded p-1 h-7 min-w-0 text-xs bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 focus:ring-1 focus:ring-teal-400"
                          >
                            <option value="">Kamar</option>
                            {dynamicUniqueKamar.map(item => (
                              <option key={item.value} value={item.value}>{item.value} ({item.count})</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* Tabel Santri */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden">
              <div className="px-4 sm:px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <h2 className="text-lg font-semibold text-gray-500 dark:text-gray-400">
                    {filteredList.length}
                  </h2>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setIsExportOffcanvasOpen(true)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-green-600 hover:bg-green-700 text-white rounded transition-colors"
                      title="Eksport data"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      Eksport
                    </button>
                    <select
                      value={itemsPerPage >= filteredList.length ? 'all' : itemsPerPage}
                      onChange={(e) => handleItemsPerPageChange(e.target.value)}
                      className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                    >
                      <option value="25">25</option>
                      <option value="50">50</option>
                      <option value="100">100</option>
                      <option value="200">200</option>
                      <option value="500">500</option>
                      <option value="all">Semua</option>
                    </select>
                  </div>
                </div>
              </div>

              {filteredList.length === 0 ? (
                <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                  <svg className="w-12 h-12 mx-auto mb-4 text-gray-300 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <p>Belum ada data santri</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 dark:bg-gray-900">
                      <tr>
                        <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">No</th>
                        <th onClick={() => handleSort('nama')} className="px-4 sm:px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors whitespace-nowrap">
                          <div className="flex items-center gap-2">Nama <SortIcon columnKey="nama" /></div>
                        </th>
                        <th onClick={() => handleSort('nis')} className="px-4 sm:px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors whitespace-nowrap">
                          <div className="flex items-center gap-2">NIS <SortIcon columnKey="nis" /></div>
                        </th>
                        <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">NIK</th>
                        <th onClick={() => handleSort('diniyah')} className="px-4 sm:px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors whitespace-nowrap">
                          <div className="flex items-center gap-2">Diniyah <SortIcon columnKey="diniyah" /></div>
                        </th>
                        <th onClick={() => handleSort('formal')} className="px-4 sm:px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors whitespace-nowrap">
                          <div className="flex items-center gap-2">Formal <SortIcon columnKey="formal" /></div>
                        </th>
                        <th onClick={() => handleSort('status_santri')} className="px-4 sm:px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors whitespace-nowrap">
                          <div className="flex items-center gap-2">Status Santri <SortIcon columnKey="status_santri" /></div>
                        </th>
                        <th onClick={() => handleSort('kategori')} className="px-4 sm:px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors whitespace-nowrap">
                          <div className="flex items-center gap-2">Kategori <SortIcon columnKey="kategori" /></div>
                        </th>
                        <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Daerah.Kamar</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                      {paginatedList.map((santri, index) => (
                        <motion.tr
                          key={santri.id}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ duration: 0.3, delay: index * 0.02 }}
                          onClick={() => setDetailOffcanvasRow(santri)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setDetailOffcanvasRow(santri) } }}
                          className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors duration-150 cursor-pointer"
                        >
                          <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-200">
                            {startIndex + index + 1}
                          </td>
                          <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-200">{santri.nama || '-'}</td>
                          <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-700 dark:text-gray-300">{santri.nis ?? santri.id ?? '-'}</td>
                          <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-700 dark:text-gray-300">{santri.nik || '-'}</td>
                          <td className="px-4 sm:px-6 py-4 whitespace-nowrap">
                            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${santri.diniyah ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'}`}>
                              {santri.diniyah || '-'}
                            </span>
                          </td>
                          <td className="px-4 sm:px-6 py-4 whitespace-nowrap">
                            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${santri.formal ? 'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-400' : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'}`}>
                              {santri.formal || '-'}
                            </span>
                          </td>
                          <td className="px-4 sm:px-6 py-4 whitespace-nowrap">
                            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${santri.status_santri ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400' : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'}`}>
                              {santri.status_santri || '-'}
                            </span>
                          </td>
                          <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">{santri.kategori || '-'}</td>
                          <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">
                            {santri.daerah && santri.kamar ? `${santri.daerah}.${santri.kamar}` : (santri.daerah || santri.kamar || '-')}
                          </td>
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
                      Menampilkan {startIndex + 1} - {Math.min(endIndex, filteredList.length)} dari {filteredList.length} santri
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
              <ExportSantriOffcanvas
                isOpen={isExportOffcanvasOpen}
                onClose={() => setIsExportOffcanvasOpen(false)}
                filteredData={filteredList}
              />,
              document.body
            )}
            {createPortal(
              <DetailSantriOffcanvas
                isOpen={!!detailOffcanvasRow}
                onClose={closeDetailOffcanvas}
                santriRow={detailOffcanvasRow}
                onEdit={(santriData) => {
                  setDetailOffcanvasRow(null)
                  setEditSantri(santriData || detailOffcanvasRow)
                }}
              />,
              document.body
            )}
            {createPortal(
              <EditSantriOffcanvas
                isOpen={!!editSantri}
                onClose={closeEditOffcanvas}
                santri={editSantri}
                onSaved={() => loadSantriData()}
              />,
              document.body
            )}
          </motion.div>
        </div>
      </div>
    </div>
  )
}

export default DataSantri
