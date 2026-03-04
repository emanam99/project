import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { umrohJamaahAPI } from '../../services/api'

function SearchJamaahOffcanvas({ isOpen, onClose, onSelectJamaah }) {
  const [searchQuery, setSearchQuery] = useState('')
  const [jamaahList, setJamaahList] = useState([])
  const [filteredList, setFilteredList] = useState([])
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [isInputFocused, setIsInputFocused] = useState(false)
  
  const [filters, setFilters] = useState({
    status: '',
    status_keberangkatan: '',
    status_pembayaran: '',
    paket_umroh: ''
  })

  // Prevent body scroll saat offcanvas terbuka
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'unset'
    }
    
    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [isOpen])

  // Ambil data jamaah dari API
  const fetchJamaahList = async () => {
    setLoading(true)
    try {
      const result = await umrohJamaahAPI.getAll({ limit: 1000 })
      if (result.success && result.data) {
        setJamaahList(result.data.list || result.data || [])
        setFilteredList((result.data.list || result.data || []).slice(0, 50))
      }
    } catch (error) {
      console.error('Error fetching jamaah list:', error)
    } finally {
      setLoading(false)
    }
  }

  // Sinkronisasi data dari server
  const handleSync = async () => {
    setSyncing(true)
    try {
      await fetchJamaahList()
    } catch (error) {
      console.error('Error syncing data:', error)
    } finally {
      setSyncing(false)
    }
  }

  // Get unique values untuk filter options
  const getUniqueValues = (key, list) => {
    const values = list.map(j => j[key]).filter(v => v !== null && v !== '')
    return [...new Set(values)].sort((a, b) => a.localeCompare(b, 'id'))
  }

  // Filter list berdasarkan query dan filters
  const applyFilters = () => {
    let filtered = [...jamaahList]

    // Filter berdasarkan search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(j =>
        (j.kode_jamaah && j.kode_jamaah.toString().toLowerCase().includes(query)) ||
        (j.id && j.id.toString().toLowerCase().includes(query)) ||
        (j.nama_lengkap && j.nama_lengkap.toLowerCase().includes(query)) ||
        (j.nik && j.nik.toString().toLowerCase().includes(query)) ||
        (j.passport && j.passport.toString().toLowerCase().includes(query))
      )
    }

    // Filter berdasarkan filter dropdown
    Object.keys(filters).forEach(key => {
      if (filters[key]) {
        if (filters[key] === '__NULL__') {
          filtered = filtered.filter(j => !j[key] || j[key] === '')
        } else {
          filtered = filtered.filter(j => j[key] === filters[key])
        }
      }
    })

    setFilteredList(filtered.slice(0, 50))
  }

  // Handle filter change
  const handleFilterChange = (key, value) => {
    setFilters(prev => ({
      ...prev,
      [key]: value
    }))
  }

  // Handle select jamaah
  const handleSelectJamaah = (jamaah) => {
    if (onSelectJamaah) {
      // Return ID atau kode_jamaah
      onSelectJamaah(jamaah.id || jamaah.kode_jamaah)
    }
    onClose()
  }

  // Load data saat offcanvas dibuka
  useEffect(() => {
    if (isOpen) {
      if (jamaahList.length === 0) {
        fetchJamaahList()
      }
    }
  }, [isOpen])

  // Apply filters saat search query atau filters berubah
  useEffect(() => {
    applyFilters()
  }, [searchQuery, filters, jamaahList])

  // Get filter options berdasarkan data yang sudah terfilter
  const getFilterOptions = (key) => {
    // Buat temporary list yang sudah terfilter oleh filter lain
    let tempList = [...jamaahList]
    Object.keys(filters).forEach(otherKey => {
      if (otherKey !== key && filters[otherKey]) {
        if (filters[otherKey] === '__NULL__') {
          tempList = tempList.filter(j => !j[otherKey] || j[otherKey] === '')
        } else {
          tempList = tempList.filter(j => j[otherKey] === filters[otherKey])
        }
      }
    })
    
    const uniqueValues = getUniqueValues(key, tempList)
    return uniqueValues
  }

  const filterConfig = [
    [
      { key: 'status', label: 'Status' },
      { key: 'status_keberangkatan', label: 'Keberangkatan' },
      { key: 'status_pembayaran', label: 'Pembayaran' },
      { key: 'paket_umroh', label: 'Paket' }
    ]
  ]

  return (
    <AnimatePresence mode="wait">
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 bg-black bg-opacity-50 z-40"
            style={{ willChange: 'opacity' }}
          />

          {/* Offcanvas */}
          <motion.div
            key="offcanvas"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ 
              type: 'tween', 
              duration: 0.35,
              ease: [0.25, 0.1, 0.25, 1]
            }}
            className="fixed inset-y-0 right-0 w-full sm:w-96 lg:w-[500px] bg-white dark:bg-gray-800 shadow-xl z-50 flex flex-col"
            style={{ 
              willChange: 'transform',
              backfaceVisibility: 'hidden'
            }}
          >
            {/* Header */}
            <div className="p-6 border-b border-gray-200 dark:border-gray-700">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold text-teal-600 dark:text-teal-400">Cari Jamaah</h2>
                <button
                  onClick={onClose}
                  className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                  </svg>
                </button>
              </div>

              {/* Search Input dengan tombol di kanan */}
              <div className="relative pb-2">
                <div className="relative">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onFocus={() => setIsInputFocused(true)}
                    onBlur={() => setIsInputFocused(false)}
                    className="w-full p-2 pr-28 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
                    placeholder="Cari Kode, ID, Nama, NIK, atau Passport"
                    autoFocus
                  />
                  {/* Tombol Filter dan Sync di kanan */}
                  <div className="absolute right-0 top-0 bottom-0 flex items-center gap-1 pr-1 pointer-events-none">
                  <button
                    onClick={() => setIsFilterOpen(!isFilterOpen)}
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
                  <button
                    onClick={handleSync}
                    disabled={syncing}
                    className="bg-teal-500 hover:bg-teal-600 text-white p-1.5 rounded text-xs flex items-center gap-1 transition-colors disabled:opacity-50 pointer-events-auto"
                    title="Sinkronisasi Data"
                  >
                    {syncing ? (
                      <svg className="animate-spin w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
                      </svg>
                    )}
                  </button>
                </div>
                </div>
                {/* Border bawah yang sampai ke kanan */}
                <div className="absolute left-0 right-0 bottom-0 h-0.5 bg-gray-300 dark:bg-gray-600"></div>
                <div className={`absolute left-0 right-0 bottom-0 h-0.5 bg-teal-500 dark:bg-teal-400 transition-opacity ${isInputFocused ? 'opacity-100' : 'opacity-0'}`}></div>
              </div>
            </div>

            {/* Filter Container dengan Accordion */}
            <AnimatePresence>
              {isFilterOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50"
                >
                  <div className="px-6 py-2">
                    {filterConfig.map((row, rowIndex) => (
                      <div key={rowIndex} className="flex flex-wrap gap-2 mb-2 last:mb-0">
                        {row.map(filter => (
                          <select
                            key={filter.key}
                            value={filters[filter.key] || ''}
                            onChange={(e) => handleFilterChange(filter.key, e.target.value)}
                            className="border border-gray-300 dark:border-gray-600 rounded p-1 h-7 min-w-0 text-xs bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-1 focus:ring-teal-400"
                          >
                            <option value="">{filter.label}</option>
                            {getFilterOptions(filter.key).map(opt => (
                              <option key={opt} value={opt}>{opt}</option>
                            ))}
                            {/* Option untuk nilai kosong/null */}
                            {jamaahList.some(j => !j[filter.key] || j[filter.key] === '') && (
                              <option value="__NULL__">Kosong/Null</option>
                            )}
                          </select>
                        ))}
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Results */}
            <div className="flex-1 overflow-y-auto p-6">
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600 dark:border-teal-400"></div>
                  <span className="ml-3 text-gray-600 dark:text-gray-400">Memuat data...</span>
                </div>
              ) : filteredList.length === 0 ? (
                <p className="text-gray-500 dark:text-gray-400 text-center py-8">Data tidak ditemukan.</p>
              ) : (
                <div className="space-y-0">
                  {filteredList.map(jamaah => (
                    <div
                      key={jamaah.id || jamaah.kode_jamaah}
                      onClick={() => handleSelectJamaah(jamaah)}
                      className="p-2 border-b border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-teal-50 dark:hover:bg-gray-700/50 flex items-center justify-between gap-2 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm text-gray-900 dark:text-gray-100">
                          <strong>{jamaah.kode_jamaah || jamaah.id}</strong> - {jamaah.nama_lengkap || '-'}
                        </p>
                        <div className="text-[10px] text-gray-500 dark:text-gray-400 mt-1">
                          NIK: {jamaah.nik || '-'} | Passport: {jamaah.passport || '-'} | Paket: {jamaah.paket_umroh || '-'}
                        </div>
                      </div>
                      <div className="flex flex-col items-end min-w-[70px] ml-2 flex-shrink-0">
                        <span className="text-[10px] px-2 py-0.5 rounded bg-teal-100 dark:bg-teal-900/50 text-teal-700 dark:text-teal-300 mb-0.5 whitespace-nowrap">
                          {jamaah.status || '-'}
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 whitespace-nowrap">
                          {jamaah.status_keberangkatan || '-'}
                        </span>
                      </div>
                    </div>
                  ))}
                  {filteredList.length >= 50 && (
                    <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-2">
                      Menampilkan 50 hasil pertama
                    </p>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

export default SearchJamaahOffcanvas

