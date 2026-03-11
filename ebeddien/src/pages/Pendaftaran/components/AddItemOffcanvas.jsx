import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { pendaftaranAPI } from '../../../services/api'
import { useNotification } from '../../../contexts/NotificationContext'

function AddItemOffcanvas({ isOpen, onClose, idRegistrasi, registrasiDetail = [], onItemAdded }) {
  const { showNotification } = useNotification()
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedKategori, setSelectedKategori] = useState('')
  const [itemList, setItemList] = useState([])
  const [filteredList, setFilteredList] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(false)
  const [isInputFocused, setIsInputFocused] = useState(false)

  // Hitung jumlah item yang sudah ada di registrasi detail berdasarkan id_item
  const getItemCount = (itemId) => {
    if (!registrasiDetail || registrasiDetail.length === 0) return 0
    return registrasiDetail.filter(detail => detail.id_item === itemId).length
  }

  // Fetch item list
  const fetchItemList = async () => {
    setLoading(true)
    try {
      const result = await pendaftaranAPI.getItemList(selectedKategori || null, searchQuery || null)
      if (result.success) {
        setItemList(result.data || [])
        setCategories(result.categories || [])
      }
    } catch (error) {
      console.error('Error fetching item list:', error)
      showNotification('Gagal mengambil daftar item', 'error')
      setItemList([])
      setCategories([])
    } finally {
      setLoading(false)
    }
  }

  // Filter list berdasarkan search query
  useEffect(() => {
    let filtered = [...itemList]

    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(item =>
        (item.nama_item && item.nama_item.toLowerCase().includes(query)) ||
        (item.id && item.id.toString().toLowerCase().includes(query))
      )
    }

    setFilteredList(filtered)
  }, [itemList, searchQuery])

  // Fetch data saat offcanvas dibuka atau filter berubah
  useEffect(() => {
    if (isOpen) {
      fetchItemList()
    }
  }, [isOpen, selectedKategori])

  // Fetch ulang saat search query berubah (dengan debounce)
  useEffect(() => {
    if (isOpen) {
      const timeoutId = setTimeout(() => {
        fetchItemList()
      }, 300)
      return () => clearTimeout(timeoutId)
    }
  }, [searchQuery, isOpen])

  // Handle add item
  const handleAddItem = async (item) => {
    if (!idRegistrasi) {
      showNotification('ID registrasi tidak valid', 'error')
      return
    }

    try {
      // id_item sekarang integer (auto increment)
      const result = await pendaftaranAPI.addItemToDetail(idRegistrasi, item.id)
      if (result.success) {
        showNotification('Item berhasil ditambahkan', 'success')
        if (onItemAdded) {
          onItemAdded()
        }
        // Reset search
        setSearchQuery('')
        setSelectedKategori('')
      } else {
        showNotification(result.message || 'Gagal menambahkan item', 'error')
      }
    } catch (error) {
      console.error('Error adding item:', error)
      const errorMessage = error.response?.data?.message || error.message || 'Gagal menambahkan item'
      showNotification(errorMessage, 'error')
    }
  }

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

  return createPortal(
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
                <h2 className="text-xl font-semibold text-teal-600 dark:text-teal-400">Tambah Item</h2>
                <button
                  onClick={onClose}
                  className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                  </svg>
                </button>
              </div>

              {/* Filter Kategori */}
              <div className="mb-4">
                <select
                  value={selectedKategori || ''}
                  onChange={(e) => setSelectedKategori(e.target.value)}
                  className="w-full border border-gray-300 dark:border-gray-600 rounded p-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-1 focus:ring-teal-400"
                >
                  <option value="">Semua Kategori</option>
                  {categories.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              {/* Search Input */}
              <div className="relative pb-2">
                <div className="relative">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onFocus={() => setIsInputFocused(true)}
                    onBlur={() => setIsInputFocused(false)}
                    className="w-full p-2 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
                    placeholder="Cari ID atau Nama Item"
                    autoFocus
                  />
                </div>
                {/* Border bawah yang sampai ke kanan */}
                <div className="absolute left-0 right-0 bottom-0 h-0.5 bg-gray-300 dark:bg-gray-600"></div>
                <div className={`absolute left-0 right-0 bottom-0 h-0.5 bg-teal-500 dark:bg-teal-400 transition-opacity ${isInputFocused ? 'opacity-100' : 'opacity-0'}`}></div>
              </div>
            </div>

            {/* Results */}
            <div className="flex-1 overflow-y-auto p-6">
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600 dark:border-teal-400"></div>
                  <span className="ml-3 text-gray-600 dark:text-gray-400">Memuat data...</span>
                </div>
              ) : filteredList.length === 0 ? (
                <p className="text-gray-500 dark:text-gray-400 text-center py-8">Item tidak ditemukan.</p>
              ) : (
                <div className="space-y-0">
                  {filteredList.map(item => {
                    const isItemExists = getItemCount(item.id) > 0
                    
                    return (
                      <div
                        key={item.id}
                        onClick={() => handleAddItem(item)}
                        className="p-3 border-b border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-teal-50 dark:hover:bg-gray-700/50 flex items-center justify-between gap-2 transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm text-gray-900 dark:text-gray-100">
                            <strong>{item.id}</strong> - {item.nama_item || '-'}
                          </p>
                          <div className="text-[10px] text-gray-500 dark:text-gray-400 mt-1">
                            {item.kategori && <span>Kategori: {item.kategori} | </span>}
                            Harga: Rp {parseFloat(item.harga_standar || 0).toLocaleString('id-ID')}
                          </div>
                        </div>
                        {/* Checkbox indicator di kanan */}
                        {isItemExists && (
                          <div className="flex-shrink-0">
                            <svg className="w-5 h-5 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                            </svg>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  )
}

export default AddItemOffcanvas

