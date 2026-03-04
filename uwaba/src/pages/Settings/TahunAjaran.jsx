import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { tahunAjaranAPI } from '../../services/api'
import Modal from '../../components/Modal/Modal'
import { useNotification } from '../../contexts/NotificationContext'

function TahunAjaran() {
  const { showNotification } = useNotification()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [kategoriFilter, setKategoriFilter] = useState('')
  const [isInputFocused, setIsInputFocused] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingItem, setEditingItem] = useState(null)
  const [saving, setSaving] = useState(false)
  const [formData, setFormData] = useState({
    tahun_ajaran: '',
    kategori: 'hijriyah',
    dari: '',
    sampai: ''
  })

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

  const handleOpenModal = (item = null) => {
    if (item) {
      setEditingItem(item)
      setFormData({
        tahun_ajaran: item.tahun_ajaran || '',
        kategori: item.kategori || 'hijriyah',
        dari: item.dari || '',
        sampai: item.sampai || ''
      })
    } else {
      setEditingItem(null)
      setFormData({
        tahun_ajaran: '',
        kategori: 'hijriyah',
        dari: '',
        sampai: ''
      })
    }
    setIsModalOpen(true)
  }

  const handleCloseModal = () => {
    setIsModalOpen(false)
    setEditingItem(null)
    setFormData({
      tahun_ajaran: '',
      kategori: 'hijriyah',
      dari: '',
      sampai: ''
    })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!formData.tahun_ajaran.trim()) {
      showNotification('Tahun ajaran wajib diisi', 'error')
      return
    }
    if (!['hijriyah', 'masehi'].includes(formData.kategori)) {
      showNotification('Kategori harus hijriyah atau masehi', 'error')
      return
    }

    setSaving(true)
    try {
      const payload = {
        tahun_ajaran: formData.tahun_ajaran.trim(),
        kategori: formData.kategori,
        dari: formData.dari || null,
        sampai: formData.sampai || null
      }

      if (editingItem) {
        const res = await tahunAjaranAPI.update(editingItem.tahun_ajaran, payload)
        if (res.success) {
          showNotification('Tahun ajaran berhasil diupdate', 'success')
          handleCloseModal()
          loadData()
        } else {
          showNotification(res.message || 'Gagal mengupdate tahun ajaran', 'error')
        }
      } else {
        const res = await tahunAjaranAPI.create(payload)
        if (res.success) {
          showNotification('Tahun ajaran berhasil ditambahkan', 'success')
          handleCloseModal()
          loadData()
        } else {
          showNotification(res.message || 'Gagal menambahkan tahun ajaran', 'error')
        }
      }
    } catch (err) {
      console.error('Error saving tahun ajaran:', err)
      showNotification('Terjadi kesalahan saat menyimpan data', 'error')
    } finally {
      setSaving(false)
    }
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
      <div className="container mx-auto px-4 py-6 max-w-7xl flex-shrink-0">
        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-4">
            <p className="text-red-800 dark:text-red-200">{error}</p>
          </div>
        )}

        {/* Search + Filter + Add */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 mb-4">
          <div className="relative pb-2 px-4 pt-3">
            <div className="flex items-center gap-3">
              <div className="flex-1 relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onFocus={() => setIsInputFocused(true)}
                  onBlur={() => setIsInputFocused(false)}
                  className="w-full p-2 pr-24 focus:outline-none bg-transparent dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400"
                  placeholder="Cari tahun ajaran..."
                />
                <div className="absolute left-0 right-0 bottom-0 h-0.5 bg-gray-300 dark:bg-gray-600" />
                <div
                  className={`absolute left-0 right-0 bottom-0 h-0.5 bg-teal-500 transition-opacity ${
                    isInputFocused ? 'opacity-100' : 'opacity-0'
                  }`}
                />
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={kategoriFilter}
                  onChange={(e) => setKategoriFilter(e.target.value)}
                  className="px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm text-gray-700 dark:text-gray-200"
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
                  onClick={() => handleOpenModal(null)}
                  className="px-3 py-1.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors flex items-center gap-1.5 text-sm"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
      <div className="flex-1 overflow-y-auto">
        <div className="container mx-auto px-4 pb-6 max-w-7xl">
          {filteredItems.length === 0 ? (
            <p className="text-center text-gray-500 dark:text-gray-400 py-8">
              {searchQuery || kategoriFilter ? 'Tidak ada tahun ajaran yang sesuai filter' : 'Belum ada data tahun ajaran'}
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <AnimatePresence>
                {filteredItems.map((item, index) => (
                  <motion.div
                    key={item.tahun_ajaran}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    transition={{ delay: index * 0.03 }}
                    onClick={() => handleOpenModal(item)}
                    className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 border border-gray-200 dark:border-gray-700 cursor-pointer hover:shadow-lg transition-all duration-200 group"
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors">
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
                      </div>
                      <svg
                        className="w-5 h-5 text-gray-400 group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                    {(item.dari || item.sampai) && (
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Periode:{' '}
                        <span className="font-medium">
                          {item.dari ? new Date(item.dari).toLocaleDateString('id-ID') : '–'} s/d{' '}
                          {item.sampai ? new Date(item.sampai).toLocaleDateString('id-ID') : '–'}
                        </span>
                      </p>
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>

      {/* Modal Tambah/Edit */}
      <Modal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        title={editingItem ? 'Edit Tahun Ajaran' : 'Tambah Tahun Ajaran'}
        size="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Tahun Ajaran <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.tahun_ajaran}
              onChange={(e) => setFormData({ ...formData, tahun_ajaran: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent dark:bg-gray-700 dark:text-gray-200"
              placeholder="Contoh: 1447-1448 atau 2025-2026"
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Kategori</label>
              <select
                value={formData.kategori}
                onChange={(e) => setFormData({ ...formData, kategori: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent dark:bg-gray-700 dark:text-gray-200"
              >
                <option value="hijriyah">Hijriyah</option>
                <option value="masehi">Masehi</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Periode (Masehi)</label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <input
                  type="date"
                  value={formData.dari || ''}
                  onChange={(e) => setFormData({ ...formData, dari: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent dark:bg-gray-700 dark:text-gray-200"
                />
                <input
                  type="date"
                  value={formData.sampai || ''}
                  onChange={(e) => setFormData({ ...formData, sampai: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent dark:bg-gray-700 dark:text-gray-200"
                />
              </div>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Tanggal mulai & selesai dalam kalender masehi (contoh: 2025-07-01 s/d 2026-06-30).
              </p>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={handleCloseModal}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 text-sm"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 text-sm"
            >
              {saving ? 'Menyimpan...' : editingItem ? 'Simpan Perubahan' : 'Simpan'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

export default TahunAjaran

