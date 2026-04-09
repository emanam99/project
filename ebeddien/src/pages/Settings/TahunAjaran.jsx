import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { tahunAjaranAPI } from '../../services/api'
import TahunAjaranFormOffcanvas from './components/TahunAjaranFormOffcanvas'

function TahunAjaran() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [kategoriFilter, setKategoriFilter] = useState('')
  const [isInputFocused, setIsInputFocused] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [editingItem, setEditingItem] = useState(null)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await tahunAjaranAPI.getAll({})
      if (res.success) {
        setItems(res.data || [])
      } else {
        setError(res.message || 'Gagal memuat data tahun ajaran')
      }
    } catch (err) {
      console.error('Error loading tahun ajaran:', err)
      setError('Terjadi kesalahan saat memuat data tahun ajaran')
    } finally {
      setLoading(false)
    }
  }

  const openForm = (item = null) => {
    setEditingItem(item)
    setFormOpen(true)
  }

  const closeForm = () => {
    setFormOpen(false)
    setEditingItem(null)
  }

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return (items || []).filter((item) => {
      if (kategoriFilter && item.kategori !== kategoriFilter) return false
      if (!q) return true
      return (
        (item.tahun_ajaran && item.tahun_ajaran.toLowerCase().includes(q)) ||
        (item.kategori && item.kategori.toLowerCase().includes(q))
      )
    })
  }, [items, searchQuery, kategoriFilter])

  const kategoriOptions = useMemo(() => {
    const counts = {}
    for (const item of items) {
      const k = item.kategori || ''
      if (!k) continue
      counts[k] = (counts[k] || 0) + 1
    }
    return Object.entries(counts).map(([value, count]) => ({
      value,
      label: value === 'hijriyah' ? 'Hijriyah' : value === 'masehi' ? 'Masehi' : value,
      count
    }))
  }, [items])

  if (loading && !items.length) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600"></div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-hidden flex flex-col">
      <div className="container mx-auto px-3 sm:px-4 py-4 sm:py-6 max-w-7xl flex-shrink-0">
        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 sm:p-4 mb-3 sm:mb-4">
            <p className="text-sm sm:text-base text-red-800 dark:text-red-200">{error}</p>
          </div>
        )}

        {/* Search + Filter + Add */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 mb-3 sm:mb-4">
          <div className="relative pb-2 px-3 sm:px-4 pt-2 sm:pt-3">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
              <div className="flex-1 relative min-w-0">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onFocus={() => setIsInputFocused(true)}
                  onBlur={() => setIsInputFocused(false)}
                  className="w-full py-1.5 sm:p-2 pr-20 sm:pr-24 text-sm sm:text-base focus:outline-none bg-transparent dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400"
                  placeholder="Cari tahun ajaran..."
                />
                <div className="absolute left-0 right-0 bottom-0 h-0.5 bg-gray-300 dark:bg-gray-600" />
                <div
                  className={`absolute left-0 right-0 bottom-0 h-0.5 bg-teal-500 transition-opacity ${
                    isInputFocused ? 'opacity-100' : 'opacity-0'
                  }`}
                />
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <select
                  value={kategoriFilter}
                  onChange={(e) => setKategoriFilter(e.target.value)}
                  className="px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-xs sm:text-sm text-gray-700 dark:text-gray-200 min-w-0"
                >
                  <option value="">Semua Kategori</option>
                  {kategoriOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label} {o.count ? `(${o.count})` : ''}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => openForm(null)}
                  className="px-2.5 sm:px-3 py-1.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors flex items-center gap-1 sm:gap-1.5 text-xs sm:text-sm shrink-0"
                >
                  <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                  </svg>
                  Tambah
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* List Tahun Ajaran */}
      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="container mx-auto px-3 sm:px-4 pb-4 sm:pb-6 max-w-7xl">
          {filteredItems.length === 0 ? (
            <p className="text-center text-sm sm:text-base text-gray-500 dark:text-gray-400 py-6 sm:py-8">
              {searchQuery || kategoriFilter ? 'Tidak ada tahun ajaran yang sesuai filter' : 'Belum ada data tahun ajaran'}
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
              <AnimatePresence>
                {filteredItems.map((item, index) => (
                  <motion.div
                    key={item.tahun_ajaran}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -12 }}
                    transition={{ delay: index * 0.02 }}
                    onClick={() => openForm(item)}
                    className="bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700 cursor-pointer hover:shadow-md hover:border-teal-300 dark:hover:border-teal-600 transition-all duration-200 group p-3 sm:p-4"
                  >
                    <div className="flex justify-between items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <h3 className="text-base sm:text-lg font-semibold text-gray-800 dark:text-gray-200 group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors truncate">
                          {item.tahun_ajaran}
                        </h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                          Kategori:{' '}
                          <span className="font-medium">
                            {item.kategori === 'hijriyah'
                              ? 'Hijriyah'
                              : item.kategori === 'masehi'
                              ? 'Masehi'
                              : item.kategori || '-'}
                          </span>
                        </p>
                        {(item.dari || item.sampai) && (
                          <p className="text-xs text-gray-600 dark:text-gray-400 mt-1.5">
                            Periode:{' '}
                            <span className="font-medium">
                              {item.dari ? new Date(item.dari).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '–'} s/d{' '}
                              {item.sampai ? new Date(item.sampai).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '–'}
                            </span>
                          </p>
                        )}
                      </div>
                      <svg
                        className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400 group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors flex-shrink-0 mt-0.5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>

      <TahunAjaranFormOffcanvas
        isOpen={formOpen}
        onClose={closeForm}
        item={editingItem}
        onSaved={loadData}
      />
    </div>
  )
}

export default TahunAjaran
