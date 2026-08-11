import { useState, useEffect } from 'react'
import { pendaftaranAPI } from '../../../services/api'
import { useNotification } from '../../../contexts/NotificationContext'
import Modal from '../../../components/Modal/Modal'

function ManageItemSet() {
  const { showNotification } = useNotification()
  const [itemSets, setItemSets] = useState([])
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [selectedSet, setSelectedSet] = useState(null)
  const [isEditMode, setIsEditMode] = useState(false)
  const [formData, setFormData] = useState({
    nama_set: '',
    is_active: 1,
    urutan: '',
    keterangan: '',
    kondisi_value_ids: [],
    item_ids: []
  })
  const [showFormMobile, setShowFormMobile] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [itemToDelete, setItemToDelete] = useState(null)

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setLoading(true)
    try {
      const [setsResult, itemsResult] = await Promise.all([
        pendaftaranAPI.getItemSets(),
        pendaftaranAPI.getItemList()
      ])
      if (setsResult.success) {
        setItemSets(setsResult.data || [])
      }
      if (itemsResult.success) {
        setItems(itemsResult.data || [])
      }
    } catch (error) {
      console.error('Error fetching data:', error)
      showNotification('Gagal mengambil data', 'error')
    } finally {
      setLoading(false)
    }
  }

  const fetchItemSets = async () => {
    setLoading(true)
    try {
      const result = await pendaftaranAPI.getItemSets()
      if (result.success) {
        setItemSets(result.data || [])
      }
    } catch (error) {
      console.error('Error fetching item sets:', error)
      showNotification('Gagal mengambil daftar item set', 'error')
    } finally {
      setLoading(false)
    }
  }

  const resetForm = () => {
    setSelectedSet(null)
    setIsEditMode(false)
    setFormData({
      nama_set: '',
      is_active: 1,
      urutan: '',
      keterangan: '',
      kondisi_value_ids: [],
      item_ids: []
    })
  }

  const handleCreate = () => {
    resetForm()
    // Hanya set showFormMobile di mobile (akan di-handle oleh CSS lg:)
    if (window.innerWidth < 1024) {
      setShowFormMobile(true)
    }
  }

  const handleEdit = (set) => {
    setSelectedSet(set)
    setIsEditMode(true)
    setFormData({
      nama_set: set.nama_set,
      is_active: set.is_active,
      urutan: set.urutan || '',
      keterangan: set.keterangan || '',
      kondisi_value_ids: set.kondisi?.map(k => k.value_id) || [],
      item_ids: set.items?.map(i => i.id_item) || []
    })
    // Hanya set showFormMobile di mobile (akan di-handle oleh CSS lg:)
    if (window.innerWidth < 1024) {
      setShowFormMobile(true)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      if (isEditMode && selectedSet) {
        const result = await pendaftaranAPI.updateItemSet(selectedSet.id, formData)
      if (result.success) {
        showNotification('Item set berhasil diupdate', 'success')
        fetchItemSets()
        resetForm()
        setShowFormMobile(false) // Tutup form di mobile setelah simpan
      }
    } else {
      const result = await pendaftaranAPI.createItemSet(formData)
      if (result.success) {
        showNotification('Item set berhasil dibuat', 'success')
        fetchItemSets()
        resetForm()
        setShowFormMobile(false) // Tutup form di mobile setelah simpan
      }
    }
    } catch (error) {
      console.error('Error saving item set:', error)
      showNotification(error.response?.data?.message || 'Gagal menyimpan item set', 'error')
    }
  }

  const handleDeleteClick = (set) => {
    setItemToDelete(set)
    setShowDeleteModal(true)
  }

  const handleDeleteConfirm = async () => {
    if (!itemToDelete) return
    
    try {
      const result = await pendaftaranAPI.deleteItemSet(itemToDelete.id)
      if (result.success) {
        showNotification('Item set berhasil dihapus', 'success')
        fetchItemSets()
        if (selectedSet?.id === itemToDelete.id) {
          resetForm()
          setShowFormMobile(false)
        }
        setShowDeleteModal(false)
        setItemToDelete(null)
      }
    } catch (error) {
      console.error('Error deleting item set:', error)
      showNotification(error.response?.data?.message || 'Gagal menghapus item set', 'error')
    }
  }

  const handleCloseDeleteModal = () => {
    setShowDeleteModal(false)
    setItemToDelete(null)
  }

  const handleCloseForm = () => {
    setShowFormMobile(false)
    resetForm()
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-4 min-h-0 overflow-hidden p-2 sm:p-3">
        {/* List Item Sets */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 overflow-hidden flex flex-col">
          <div className="flex justify-between items-center mb-4 flex-shrink-0">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">Daftar Set</h3>
            <button
              onClick={handleCreate}
              className="px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white text-sm rounded-md transition-colors"
            >
              + Tambah
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600"></div>
              </div>
            ) : itemSets.length === 0 ? (
              <p className="text-gray-500 dark:text-gray-400 text-center py-8">Belum ada item set</p>
            ) : (
              <div className="space-y-2">
                {itemSets.map(set => {
                  // Calculate total price for items in this set
                  const setItemIds = set.items?.map(i => i.id_item) || []
                  const setItemsData = items.filter(item => setItemIds.includes(item.id))
                  const setTotalPrice = setItemsData.reduce((sum, item) => {
                    return sum + parseFloat(item.harga_standar || 0)
                  }, 0)
                  
                  return (
                    <div
                      key={set.id}
                      className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                        selectedSet?.id === set.id
                          ? 'border-teal-500 bg-teal-50 dark:bg-teal-900/20'
                          : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                      }`}
                      onClick={() => handleEdit(set)}
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <h4 className="font-medium text-gray-900 dark:text-gray-100">{set.nama_set}</h4>
                          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            {set.kondisi?.length || 0} kondisi • {set.items?.length || 0} item
                            {set.items?.length > 0 && (
                              <span className="ml-1">• Rp {setTotalPrice.toLocaleString('id-ID')}</span>
                            )}
                            {set.is_active === 0 && <span className="ml-2 text-red-500">(Nonaktif)</span>}
                          </div>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDeleteClick(set)
                          }}
                          className="ml-2 p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                          title="Hapus"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Form - Desktop: Always visible, Mobile: Conditional dengan backdrop */}
        {/* Backdrop untuk mobile */}
        {showFormMobile && (
          <div 
            className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden transition-opacity" 
            onClick={handleCloseForm}
          ></div>
        )}
        
        {/* Form Container - Mobile: Modal, Desktop: Sidebar */}
        <div className={`bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 overflow-y-auto transition-all ${
          showFormMobile 
            ? 'fixed inset-4 z-50 lg:relative lg:inset-0 lg:block' 
            : 'hidden lg:block'
        }`}>
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">
              {isEditMode ? 'Edit Set' : 'Tambah Set Baru'}
            </h3>
            {/* Close button untuk mobile */}
            <button
              type="button"
              onClick={handleCloseForm}
              className="lg:hidden text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Nama Set *
              </label>
              <input
                type="text"
                value={formData.nama_set}
                onChange={(e) => setFormData({ ...formData, nama_set: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Urutan
                </label>
                <input
                  type="number"
                  value={formData.urutan}
                  onChange={(e) => setFormData({ ...formData, urutan: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Status
                </label>
                <select
                  value={formData.is_active}
                  onChange={(e) => setFormData({ ...formData, is_active: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                >
                  <option value={1}>Aktif</option>
                  <option value={0}>Nonaktif</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Keterangan
              </label>
              <textarea
                value={formData.keterangan}
                onChange={(e) => setFormData({ ...formData, keterangan: e.target.value })}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              />
            </div>

            <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                <strong>Catatan:</strong> Untuk mengatur kondisi dan item, gunakan tab "Manage Kondisi" dan "Assign Item ke Set"
              </p>
            </div>

            <div className="flex gap-2">
              <button
                type="submit"
                className="flex-1 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-md transition-colors"
              >
                {isEditMode ? 'Update' : 'Simpan'}
              </button>
              <button
                type="button"
                onClick={handleCloseForm}
                className="px-4 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-md transition-colors"
              >
                Batal
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={showDeleteModal}
        onClose={handleCloseDeleteModal}
        title="Konfirmasi Hapus Item Set"
        maxWidth="max-w-md"
      >
        <div className="p-6">
          <div className="mb-4">
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              Anda yakin ingin menghapus item set <strong>"{itemToDelete?.nama_set}"</strong>?
            </p>
            <p className="text-sm text-red-600 dark:text-red-400 mb-4 font-medium">
              ⚠️ Tindakan ini tidak dapat dibatalkan!
            </p>
            {itemToDelete && (
              <div className="text-sm text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-700/50 p-3 rounded-lg">
                <p>• {itemToDelete.kondisi?.length || 0} kondisi akan terhapus</p>
                <p>• {itemToDelete.items?.length || 0} item akan terhapus</p>
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
            <button
              type="button"
              onClick={handleCloseDeleteModal}
              className="px-4 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-md transition-colors"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={handleDeleteConfirm}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md transition-colors"
            >
              Hapus
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

export default ManageItemSet

