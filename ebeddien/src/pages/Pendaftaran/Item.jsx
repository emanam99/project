import { useState, useEffect, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { createPortal } from 'react-dom'
import { pendaftaranAPI } from '../../services/api'
import { useNotification } from '../../contexts/NotificationContext'

function Item() {
  const { showNotification } = useNotification()
  const [items, setItems] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(false)
  const [searchInput, setSearchInput] = useState('')
  const [kategoriFilter, setKategoriFilter] = useState('')
  const [isInputFocused, setIsInputFocused] = useState(false)
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [showOffcanvas, setShowOffcanvas] = useState(false)
  const [isEditMode, setIsEditMode] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [focusedField, setFocusedField] = useState(null)
  const [formData, setFormData] = useState({
    item: '',
    kategori: '',
    urutan: '',
    harga: '',
    gender: '',
    status_santri: '',
    status_pendaftar: '',
    lembaga: '',
    dari: '',
    sampai: ''
  })

  // Fetch items
  const fetchItems = useCallback(async () => {
    setLoading(true)
    try {
      const response = await pendaftaranAPI.getItemList(kategoriFilter || null, searchInput || null)
      if (response.success) {
        setItems(response.data || [])
        if (response.categories) {
          setCategories(response.categories)
        }
      }
    } catch (error) {
      console.error('Error fetching items:', error)
      showNotification('Gagal memuat data item', 'error')
    } finally {
      setLoading(false)
    }
  }, [kategoriFilter, searchInput, showNotification])

  useEffect(() => {
    fetchItems()
  }, [fetchItems])

  // Prevent body scroll saat offcanvas terbuka
  useEffect(() => {
    if (showOffcanvas) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'unset'
    }
    
    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [showOffcanvas])

  // Filtered items
  const filteredItems = useMemo(() => {
    return items
  }, [items])

  const itemsByCategory = useMemo(() => {
    const acc = {}
    filteredItems.forEach((row) => {
      const raw = row.kategori != null ? String(row.kategori).trim() : ''
      const cat = raw || 'Lainnya'
      if (!acc[cat]) acc[cat] = []
      acc[cat].push(row)
    })
    Object.keys(acc).forEach((cat) => {
      acc[cat].sort((a, b) => {
        const ua = Number(a.urutan)
        const ub = Number(b.urutan)
        const na = Number.isFinite(ua) ? ua : 0
        const nb = Number.isFinite(ub) ? ub : 0
        if (na !== nb) return na - nb
        return String(a.nama_item || a.item || '').localeCompare(String(b.nama_item || b.item || ''), 'id')
      })
    })
    return acc
  }, [filteredItems])

  /** Urut kategori: ikuti master `categories`, lalu sisa (A-Z), `Lainnya` terakhir */
  const sortedCategoryKeys = useMemo(() => {
    const keys = new Set(Object.keys(itemsByCategory))
    const out = []
    ;(categories || []).forEach((c) => {
      if (keys.has(c)) {
        out.push(c)
        keys.delete(c)
      }
    })
    const rest = [...keys].sort((a, b) => {
      if (a === 'Lainnya') return 1
      if (b === 'Lainnya') return -1
      return a.localeCompare(b, 'id')
    })
    return [...out, ...rest]
  }, [itemsByCategory, categories])

  // Opsi kategori untuk form: unique dari tabel item, plus nilai saat ini jika edit dan belum ada di list
  const kategoriOptions = useMemo(() => {
    const list = [...(categories || [])]
    if (isEditMode && formData.kategori && formData.kategori.trim() && !list.includes(formData.kategori.trim())) {
      list.push(formData.kategori.trim())
      list.sort()
    }
    return list
  }, [categories, isEditMode, formData.kategori])

  // Handle create
  const handleCreate = async (e) => {
    e.preventDefault()
    try {
      const response = await pendaftaranAPI.createItem(formData)
      if (response.success) {
        showNotification('Item berhasil ditambahkan', 'success')
        handleCloseOffcanvas()
        fetchItems()
      } else {
        showNotification(response.message || 'Gagal menambahkan item', 'error')
      }
    } catch (error) {
      console.error('Error creating item:', error)
      const msg = error.response?.data?.message || error.message || 'Gagal menambahkan item'
      showNotification(msg, 'error')
    }
  }

  // Handle create button click
  const handleCreateClick = () => {
    setIsEditMode(false)
    setEditingId(null)
    setFormData({
      item: '',
      kategori: '',
      urutan: '',
      harga: '',
      gender: '',
      status_santri: '',
      status_pendaftar: '',
      lembaga: '',
      dari: '',
      sampai: ''
    })
    setShowOffcanvas(true)
  }

  // Handle edit - open offcanvas
  const handleItemClick = (item) => {
    setIsEditMode(true)
    setEditingId(item.id)
    setFormData({
      item: item.nama_item || item.item || '',
      kategori: item.kategori || '',
      urutan: item.urutan || '',
      harga: item.harga_standar || item.harga || '',
      gender: item.gender || '',
      status_santri: item.status_santri || '',
      status_pendaftar: item.status_pendaftar || '',
      lembaga: item.lembaga || '',
      dari: item.dari || '',
      sampai: item.sampai || ''
    })
    setShowOffcanvas(true)
  }

  // Close offcanvas
  const handleCloseOffcanvas = () => {
    setShowOffcanvas(false)
    setIsEditMode(false)
    setEditingId(null)
    setFormData({
      item: '',
      kategori: '',
      urutan: '',
      harga: '',
      gender: '',
      status_santri: '',
      status_pendaftar: '',
      lembaga: '',
      dari: '',
      sampai: ''
    })
  }

  // Handle update
  const handleUpdate = async (e) => {
    e.preventDefault()
    try {
      const response = await pendaftaranAPI.updateItem(editingId, formData)
      if (response.success) {
        showNotification('Item berhasil diupdate', 'success')
        handleCloseOffcanvas()
        fetchItems()
      } else {
        showNotification(response.message || 'Gagal mengupdate item', 'error')
      }
    } catch (error) {
      console.error('Error updating item:', error)
      showNotification('Gagal mengupdate item', 'error')
    }
  }

  // Handle submit (create or update)
  const handleSubmit = async (e) => {
    e.preventDefault()
    if (isEditMode) {
      await handleUpdate(e)
    } else {
      await handleCreate(e)
    }
  }

  // Helper function untuk mendapatkan className label berdasarkan focused state
  const getLabelClassName = (fieldName) => {
    const baseClass = "block text-xs mb-1 transition-colors duration-200"
    if (focusedField === fieldName) {
      return `${baseClass} text-teal-600 dark:text-teal-400 font-semibold`
    }
    return `${baseClass} text-gray-500 dark:text-gray-400`
  }

  return (
    <div className="h-full overflow-hidden" style={{ minHeight: 0 }}>
      <div className="h-full overflow-y-auto" style={{ minHeight: 0 }}>
        <div className="p-2 sm:p-3">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="flex flex-col"
          >
            {/* Search and Filter */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 mb-4 flex-shrink-0">
          {/* Search Input dengan tombol di kanan */}
          <div className="relative pb-2 px-4 pt-3">
            <div className="relative">
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onFocus={() => setIsInputFocused(true)}
                onBlur={() => setIsInputFocused(false)}
                className="w-full p-2 pr-20 focus:outline-none bg-transparent dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400"
                placeholder="Cari item..."
              />
              {/* Tombol Filter di kanan */}
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
              </div>
            </div>
            {/* Border bawah yang sampai ke kanan */}
            <div className="absolute left-0 right-0 bottom-0 h-0.5 bg-gray-300 dark:bg-gray-600"></div>
            <div className={`absolute left-0 right-0 bottom-0 h-0.5 bg-teal-500 transition-opacity ${isInputFocused ? 'opacity-100' : 'opacity-0'}`}></div>
          </div>

          {/* Filter Container dengan Accordion */}
          <AnimatePresence>
            {isFilterOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden border-b bg-gray-50 dark:bg-gray-700/50"
              >
                <div className="px-4 py-2">
                  <div className="flex flex-wrap gap-2">
                    <select
                      value={kategoriFilter}
                      onChange={(e) => setKategoriFilter(e.target.value)}
                      className="border rounded p-1 h-7 min-w-0 text-xs bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 focus:ring-1 focus:ring-teal-400"
                    >
                      <option value="">Semua Kategori</option>
                      {categories.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Create Button */}
          <div className="px-4 py-2 border-t border-gray-200 dark:border-gray-700 flex justify-end">
            <button
              onClick={handleCreateClick}
              className="px-3 py-1.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors flex items-center gap-1.5 text-sm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
              </svg>
              Buat
            </button>
          </div>
        </div>

            {/* Items List */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden flex-shrink-0">
              {loading ? (
                <div className="flex justify-center items-center py-12">
                  <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-teal-600"></div>
                </div>
              ) : filteredItems.length === 0 ? (
                <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                  Tidak ada item ditemukan
                </div>
              ) : (
                <div className="space-y-4 p-4">
                  {sortedCategoryKeys.map((category) => (
                    <div key={category} className="space-y-2">
                      <div className="flex items-center justify-between gap-2 px-0.5">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-teal-700 dark:text-teal-400">
                          {category}
                        </h3>
                        <span className="text-[10px] font-medium text-gray-400 dark:text-gray-500 tabular-nums">
                          {itemsByCategory[category].length}
                        </span>
                      </div>
                      <div className="space-y-3">
                        {itemsByCategory[category].map((item, index) => (
                          <motion.div
                            key={item.id}
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: Math.min(index * 0.02, 0.35) }}
                            onClick={() => handleItemClick(item)}
                            className="cursor-pointer rounded-lg border border-gray-200 bg-white p-3 shadow-sm transition-shadow hover:shadow-md dark:border-gray-700 dark:bg-gray-800 border-l-4 border-l-teal-500"
                          >
                            <div className="flex items-start gap-2">
                              <div className="mt-0.5 flex-shrink-0">
                                <svg className="h-4 w-4 text-teal-600 dark:text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth="2"
                                    d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                                  />
                                </svg>
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="line-clamp-2 text-sm font-medium text-gray-900 dark:text-gray-100">
                                  {item.nama_item || item.item}
                                </div>
                                <div className="mt-1 flex flex-wrap items-center gap-2">
                                  <span className="text-xs text-gray-500 dark:text-gray-400">ID: {item.id}</span>
                                  {item.urutan ? (
                                    <>
                                      <span className="text-xs text-gray-500 dark:text-gray-400">•</span>
                                      <span className="text-xs text-gray-500 dark:text-gray-400">Urutan: {item.urutan}</span>
                                    </>
                                  ) : null}
                                </div>
                              </div>
                              <div className="flex-shrink-0 text-right">
                                <div className="text-sm font-bold text-teal-600 dark:text-teal-400">
                                  {item.harga_standar || item.harga
                                    ? `Rp ${parseInt(item.harga_standar || item.harga).toLocaleString('id-ID')}`
                                    : '-'}
                                </div>
                              </div>
                            </div>
                          </motion.div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        </div>
      </div>

      {/* Create/Edit Offcanvas */}
      {createPortal(
        <AnimatePresence mode="wait">
          {showOffcanvas && (
            <>
              {/* Backdrop */}
              <motion.div
                key="backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                onClick={handleCloseOffcanvas}
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
                    <h2 className="text-xl font-semibold text-teal-600 dark:text-teal-400">
                      {isEditMode ? 'Edit Item' : 'Tambah Item Baru'}
                    </h2>
                    <button
                      onClick={handleCloseOffcanvas}
                      className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                    >
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Form Content */}
                <div className="flex-1 overflow-y-auto p-6 pb-24">
                  <form onSubmit={handleSubmit} id="item-form" className="space-y-4">
                    <div>
                      <label className={getLabelClassName('item')}>
                        Nama Item <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={formData.item}
                        onChange={(e) => setFormData({ ...formData, item: e.target.value })}
                        onFocus={() => setFocusedField('item')}
                        onBlur={() => setFocusedField(null)}
                        className="w-full p-2 border-b-2 border-gray-300 dark:border-gray-600 focus:border-teal-500 dark:focus:border-teal-400 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100"
                        required
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className={getLabelClassName('kategori')}>
                          Kategori
                        </label>
                        <select
                          value={formData.kategori}
                          onChange={(e) => setFormData({ ...formData, kategori: e.target.value })}
                          onFocus={() => setFocusedField('kategori')}
                          onBlur={() => setFocusedField(null)}
                          className="w-full p-2 border-b-2 border-gray-300 dark:border-gray-600 focus:border-teal-500 dark:focus:border-teal-400 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100"
                        >
                          <option value="">Pilih Kategori</option>
                          {kategoriOptions.map((cat) => (
                            <option key={cat} value={cat}>
                              {cat}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className={getLabelClassName('urutan')}>
                          Urutan
                        </label>
                        <input
                          type="number"
                          value={formData.urutan}
                          onChange={(e) => setFormData({ ...formData, urutan: e.target.value })}
                          onFocus={() => setFocusedField('urutan')}
                          onBlur={() => setFocusedField(null)}
                          className="w-full p-2 border-b-2 border-gray-300 dark:border-gray-600 focus:border-teal-500 dark:focus:border-teal-400 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100"
                        />
                      </div>
                    </div>
                    <div>
                      <label className={getLabelClassName('harga')}>
                        Harga
                      </label>
                      <input
                        type="number"
                        value={formData.harga}
                        onChange={(e) => setFormData({ ...formData, harga: e.target.value })}
                        onFocus={() => setFocusedField('harga')}
                        onBlur={() => setFocusedField(null)}
                        className="w-full p-2 border-b-2 border-gray-300 dark:border-gray-600 focus:border-teal-500 dark:focus:border-teal-400 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100"
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className={getLabelClassName('dari')}>
                          Dari Tanggal
                        </label>
                        <input
                          type="date"
                          value={formData.dari}
                          onChange={(e) => setFormData({ ...formData, dari: e.target.value })}
                          onFocus={() => setFocusedField('dari')}
                          onBlur={() => setFocusedField(null)}
                          className="w-full p-2 border-b-2 border-gray-300 dark:border-gray-600 focus:border-teal-500 dark:focus:border-teal-400 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100"
                        />
                      </div>
                      <div>
                        <label className={getLabelClassName('sampai')}>
                          Sampai Tanggal
                        </label>
                        <input
                          type="date"
                          value={formData.sampai}
                          onChange={(e) => setFormData({ ...formData, sampai: e.target.value })}
                          onFocus={() => setFocusedField('sampai')}
                          onBlur={() => setFocusedField(null)}
                          className="w-full p-2 border-b-2 border-gray-300 dark:border-gray-600 focus:border-teal-500 dark:focus:border-teal-400 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100"
                        />
                      </div>
                    </div>
                  </form>
                </div>

                {/* Fixed Action Buttons */}
                <div className="sticky bottom-0 left-0 right-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 px-6 py-3 flex justify-end gap-2 sm:pb-3 pb-20 z-10">
                  <button
                    type="button"
                    onClick={handleCloseOffcanvas}
                    className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    form="item-form"
                    className="px-3 py-1.5 text-sm bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-medium transition-colors"
                  >
                    {isEditMode ? 'Update' : 'Simpan'}
                  </button>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  )
}

export default Item

