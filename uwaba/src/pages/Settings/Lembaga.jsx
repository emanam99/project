import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { lembagaAPI } from '../../services/api'
import Modal from '../../components/Modal/Modal'
import { useNotification } from '../../contexts/NotificationContext'

function Lembaga() {
  const { showNotification } = useNotification()
  const [lembagaList, setLembagaList] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingLembaga, setEditingLembaga] = useState(null)
  const [formData, setFormData] = useState({
    id: '',
    nama: '',
    kategori: '',
    deskripsi: ''
  })
  const [searchQuery, setSearchQuery] = useState('')
  const [isInputFocused, setIsInputFocused] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deletingLembaga, setDeletingLembaga] = useState(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadLembaga()
  }, [])

  const loadLembaga = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await lembagaAPI.getAll()
      if (response.success) {
        setLembagaList(response.data || [])
      } else {
        setError(response.message || 'Gagal memuat data lembaga')
      }
    } catch (err) {
      console.error('Error loading lembaga:', err)
      setError('Terjadi kesalahan saat memuat data lembaga')
    } finally {
      setLoading(false)
    }
  }

  const handleOpenModal = (lembaga = null) => {
    if (lembaga) {
      setEditingLembaga(lembaga)
      setFormData({
        id: lembaga.id,
        nama: lembaga.nama || '',
        kategori: lembaga.kategori || '',
        deskripsi: lembaga.deskripsi || ''
      })
    } else {
      setEditingLembaga(null)
      setFormData({
        id: '',
        nama: '',
        kategori: '',
        deskripsi: ''
      })
    }
    setIsModalOpen(true)
  }

  const handleCloseModal = () => {
    setIsModalOpen(false)
    setEditingLembaga(null)
    setFormData({
      id: '',
      nama: '',
      kategori: '',
      deskripsi: ''
    })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    if (!formData.id.trim()) {
      showNotification('ID lembaga wajib diisi', 'error')
      return
    }

    setSaving(true)
    try {
      if (editingLembaga) {
        // Update
        const response = await lembagaAPI.update(editingLembaga.id, {
          nama: formData.nama || null,
          kategori: formData.kategori || null,
          deskripsi: formData.deskripsi || null
        })
        
        if (response.success) {
          showNotification('Lembaga berhasil diupdate', 'success')
          handleCloseModal()
          loadLembaga()
        } else {
          showNotification(response.message || 'Gagal mengupdate lembaga', 'error')
        }
      } else {
        // Create
        const response = await lembagaAPI.create(formData)
        
        if (response.success) {
          showNotification('Lembaga berhasil ditambahkan', 'success')
          handleCloseModal()
          loadLembaga()
        } else {
          showNotification(response.message || 'Gagal menambahkan lembaga', 'error')
        }
      }
    } catch (err) {
      console.error('Error saving lembaga:', err)
      showNotification('Terjadi kesalahan saat menyimpan data', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = (lembaga) => {
    setDeletingLembaga(lembaga)
    setDeleteConfirmId('')
    setShowDeleteModal(true)
  }

  const handleConfirmDelete = async () => {
    if (!deletingLembaga) return

    if (deleteConfirmId.trim() !== String(deletingLembaga.id)) {
      showNotification('ID yang dimasukkan tidak sesuai', 'error')
      return
    }

    setDeleting(true)
    try {
      const response = await lembagaAPI.delete(deletingLembaga.id)
      if (response.success) {
        showNotification('Lembaga berhasil dihapus', 'success')
        setShowDeleteModal(false)
        setDeletingLembaga(null)
        setDeleteConfirmId('')
        loadLembaga()
      } else {
        showNotification(response.message || 'Gagal menghapus lembaga', 'error')
      }
    } catch (err) {
      console.error('Error deleting lembaga:', err)
      showNotification('Terjadi kesalahan saat menghapus data', 'error')
    } finally {
      setDeleting(false)
    }
  }

  const filteredLembaga = lembagaList.filter(lembaga => {
    const query = searchQuery.toLowerCase()
    return (
      lembaga.id?.toLowerCase().includes(query) ||
      lembaga.nama?.toLowerCase().includes(query) ||
      lembaga.kategori?.toLowerCase().includes(query) ||
      lembaga.deskripsi?.toLowerCase().includes(query)
    )
  })

  if (loading) {
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

        {/* Search and Add Button */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 mb-4">
          {/* Search Input dengan tombol di kanan */}
          <div className="relative pb-2 px-4 pt-3">
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => setIsInputFocused(true)}
                onBlur={() => setIsInputFocused(false)}
                className="w-full p-2 pr-24 focus:outline-none bg-transparent dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400"
                placeholder="Cari lembaga..."
              />
            </div>
            {/* Border bawah yang sampai ke kanan */}
            <div className="absolute left-0 right-0 bottom-0 h-0.5 bg-gray-300 dark:bg-gray-600"></div>
            <div className={`absolute left-0 right-0 bottom-0 h-0.5 bg-teal-500 transition-opacity ${isInputFocused ? 'opacity-100' : 'opacity-0'}`}></div>
          </div>

          {/* Create Button */}
          <div className="px-4 py-2 border-t border-gray-200 dark:border-gray-700 flex justify-end">
            <button
              onClick={() => handleOpenModal()}
              className="px-3 py-1.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors flex items-center gap-1.5 text-sm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
              </svg>
              Tambah Lembaga
            </button>
          </div>
        </div>
      </div>

      {/* Lembaga List - Scrollable */}
      <div className="flex-1 overflow-y-auto">
        <div className="container mx-auto px-4 pb-6 max-w-7xl">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <AnimatePresence>
          {filteredLembaga.map((lembaga, index) => (
            <motion.div
              key={lembaga.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ delay: index * 0.03 }}
              onClick={() => handleOpenModal(lembaga)}
              className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 border border-gray-200 dark:border-gray-700 cursor-pointer hover:shadow-lg transition-all duration-200 group"
            >
              <div className="flex justify-between items-start mb-2">
                <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors">
                  {lembaga.id}
                </h3>
                <svg className="w-5 h-5 text-gray-400 group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                </svg>
              </div>
              
              {lembaga.nama && (
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                  <span className="font-medium">Nama:</span> {lembaga.nama}
                </p>
              )}
              
              {lembaga.kategori && (
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                  <span className="font-medium">Kategori:</span> {lembaga.kategori}
                </p>
              )}
              
              {lembaga.deskripsi && (
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-1 line-clamp-2">
                  <span className="font-medium">Deskripsi:</span> {lembaga.deskripsi}
                </p>
              )}

              {lembaga.tanggal_dibuat && (
                <p className="text-xs text-gray-500 dark:text-gray-500 mt-2">
                  Dibuat: {new Date(lembaga.tanggal_dibuat).toLocaleDateString('id-ID')}
                </p>
              )}
            </motion.div>
          ))}
            </AnimatePresence>
          </div>

          {filteredLembaga.length === 0 && (
            <div className="text-center py-12">
              <p className="text-gray-500 dark:text-gray-400">
                {searchQuery ? 'Tidak ada lembaga yang ditemukan' : 'Belum ada data lembaga'}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Add/Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        title={editingLembaga ? 'Edit Lembaga' : 'Tambah Lembaga'}
        maxWidth="max-w-md"
      >
        <form onSubmit={handleSubmit} className="p-6">
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        ID Lembaga <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={formData.id}
                        onChange={(e) => setFormData({ ...formData, id: e.target.value })}
                        disabled={!!editingLembaga}
                        className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:bg-gray-100 dark:disabled:bg-gray-900"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Nama
                      </label>
                      <input
                        type="text"
                        value={formData.nama}
                        onChange={(e) => setFormData({ ...formData, nama: e.target.value })}
                        className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-teal-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Kategori
                      </label>
                      <input
                        type="text"
                        value={formData.kategori}
                        onChange={(e) => setFormData({ ...formData, kategori: e.target.value })}
                        className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-teal-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Deskripsi
                      </label>
                      <textarea
                        value={formData.deskripsi}
                        onChange={(e) => setFormData({ ...formData, deskripsi: e.target.value })}
                        rows={4}
                        className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-teal-500"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-6 border-t border-gray-200 dark:border-gray-700 mt-6">
                    {editingLembaga && (
                      <button
                        type="button"
                        onClick={() => {
                          handleCloseModal()
                          handleDelete(editingLembaga)
                        }}
                        className="px-4 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center gap-1.5 text-sm"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                        Hapus
                      </button>
                    )}
                    <div className="flex items-center gap-2 ml-auto">
                      <button
                        type="button"
                        onClick={handleCloseModal}
                        className="px-4 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-sm"
                      >
                        Batal
                      </button>
                      <button
                        type="submit"
                        disabled={saving}
                        className="px-4 py-1.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                      >
                        {saving ? 'Menyimpan...' : (editingLembaga ? 'Update' : 'Simpan')}
                      </button>
                    </div>
                  </div>
                </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={showDeleteModal}
        onClose={() => {
          if (!deleting) {
            setShowDeleteModal(false)
            setDeletingLembaga(null)
            setDeleteConfirmId('')
          }
        }}
        title="Konfirmasi Hapus Lembaga"
        maxWidth="max-w-md"
        closeOnBackdropClick={!deleting}
      >
        <div className="p-6">
          <div className="mb-4">
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              Anda akan menghapus lembaga <strong>{deletingLembaga?.id}</strong>
              {deletingLembaga?.nama && ` - ${deletingLembaga.nama}`}.
            </p>
            <p className="text-sm text-red-600 dark:text-red-400 mb-4 font-medium">
              ⚠️ Tindakan ini tidak dapat dibatalkan!
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Untuk mengonfirmasi, masukkan ID lembaga yang akan dihapus:
            </p>
            <input
              type="text"
              value={deleteConfirmId}
              onChange={(e) => {
                setDeleteConfirmId(e.target.value)
              }}
              placeholder={`Masukkan ID: ${deletingLembaga?.id}`}
              disabled={deleting}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent dark:bg-gray-700 dark:text-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
              autoFocus
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
            <button
              type="button"
              onClick={() => {
                setShowDeleteModal(false)
                setDeletingLembaga(null)
                setDeleteConfirmId('')
              }}
              disabled={deleting}
              className="px-6 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={handleConfirmDelete}
              disabled={deleting || deleteConfirmId.trim() !== String(deletingLembaga?.id)}
              className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              {deleting ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  <span>Menghapus...</span>
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  <span>Hapus</span>
                </>
              )}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

export default Lembaga


