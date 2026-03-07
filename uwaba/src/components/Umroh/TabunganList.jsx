import { useState, useEffect } from 'react'
import { umrohTabunganAPI } from '../../services/api'
import { useNotification } from '../../contexts/NotificationContext'
import { useAuthStore } from '../../store/authStore'
import { useOffcanvasBackClose } from '../../hooks/useOffcanvasBackClose'
import { motion } from 'framer-motion'
import TabunganFormOffcanvas from './TabunganFormOffcanvas'
import DeleteTabunganModal from './DeleteTabunganModal'

function TabunganList({ jamaahId, jamaahData }) {
  const { showNotification } = useNotification()
  const { user } = useAuthStore()
  const isSuperAdmin = user?.role_key === 'super_admin' || user?.level?.toLowerCase() === 'super_admin'
  const [tabunganList, setTabunganList] = useState([])
  const [loading, setLoading] = useState(false)
  const [saldo, setSaldo] = useState(0)
  const [showFormOffcanvas, setShowFormOffcanvas] = useState(false)
  const closeFormOffcanvas = useOffcanvasBackClose(showFormOffcanvas, () => setShowFormOffcanvas(false))
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [itemToDelete, setItemToDelete] = useState(null)

  // Format currency
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0
    }).format(amount || 0)
  }

  // Fetch tabungan data
  const fetchTabungan = async () => {
    if (!jamaahId) {
      setTabunganList([])
      setSaldo(0)
      return
    }

    setLoading(true)
    try {
      const response = await umrohTabunganAPI.getByJamaahId(jamaahId)
      console.log('Tabungan response:', response) // Debug log
      if (response.success) {
        // Backend mengembalikan data langsung sebagai array di response.data
        // Bisa juga berupa object dengan pagination
        let list = []
        if (Array.isArray(response.data)) {
          list = response.data
        } else if (response.data && Array.isArray(response.data.data)) {
          list = response.data.data
        } else if (response.data && response.data.list) {
          list = response.data.list
        }
        
        setTabunganList(list)
        
        // Hitung saldo dari data terakhir (data sudah diurutkan DESC)
        if (list.length > 0) {
          const lastItem = list[0] // Transaksi terbaru
          setSaldo(parseFloat(lastItem.saldo_sesudah || 0))
        } else {
          // Jika tidak ada transaksi, saldo = 0
          setSaldo(0)
        }
      } else {
        setTabunganList([])
        setSaldo(0)
        showNotification(response.message || 'Gagal memuat data tabungan', 'error')
      }
    } catch (error) {
      console.error('Error fetching tabungan:', error)
      setTabunganList([])
      setSaldo(0)
      showNotification(
        error.response?.data?.message || 'Terjadi kesalahan saat memuat data tabungan',
        'error'
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchTabungan()
  }, [jamaahId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Handle delete tabungan
  const handleDeleteTabungan = (item) => {
    setItemToDelete(item)
    setShowDeleteModal(true)
  }

  // Confirm delete
  const handleConfirmDelete = async () => {
    if (!itemToDelete) return

    try {
      const response = await umrohTabunganAPI.delete(itemToDelete.id)
      if (response.success) {
        showNotification(response.message || 'Tabungan berhasil dihapus', 'success')
        fetchTabungan() // Refresh list
        setShowDeleteModal(false)
        setItemToDelete(null)
      } else {
        showNotification(response.message || 'Gagal menghapus tabungan', 'error')
      }
    } catch (error) {
      console.error('Error deleting tabungan:', error)
      showNotification(
        error.response?.data?.message || 'Terjadi kesalahan saat menghapus tabungan',
        'error'
      )
    }
  }

  if (!jamaahId) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-gray-500 dark:text-gray-400">Pilih jamaah terlebih dahulu untuk melihat tabungan</p>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header dengan Saldo */}
      <div className="flex-shrink-0 mb-4">
        <div className="flex justify-between items-center mb-2">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Tabungan
          </h2>
          <button
            onClick={() => setShowFormOffcanvas(true)}
            className="px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-sm font-semibold transition-colors flex items-center gap-1"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
            </svg>
            Tambah
          </button>
        </div>
        <div className="bg-teal-50 dark:bg-teal-900/20 rounded-lg p-4 border border-teal-200 dark:border-teal-800">
          <div className="flex items-center justify-between">
            <span className="text-sm text-teal-700 dark:text-teal-300">Saldo Saat Ini</span>
            <span className="text-2xl font-bold text-teal-600 dark:text-teal-400">
              {formatCurrency(saldo)}
            </span>
          </div>
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600"></div>
        </div>
      )}

      {/* Tabungan List */}
      {!loading && (
        <div className="flex-1 overflow-y-auto">
          {tabunganList.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-gray-500 dark:text-gray-400">Belum ada transaksi tabungan</p>
            </div>
          ) : (
            <div className="space-y-2">
              {tabunganList.map((item, index) => {
                // Tentukan warna border kiri berdasarkan jenis transaksi
                const borderColorClass = item.jenis === 'Setoran' 
                  ? 'border-l-green-500'
                  : item.jenis === 'Penarikan'
                  ? 'border-l-red-500'
                  : 'border-l-gray-500'
                
                return (
                <motion.div
                  key={item.id || index}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className={`bg-white dark:bg-gray-800 rounded-lg shadow-sm border-l-4 ${borderColorClass} border border-gray-200 dark:border-gray-700 p-3 hover:shadow-md transition-shadow`}
                >
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                            item.jenis === 'Setoran' 
                              ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                              : item.jenis === 'Penarikan'
                              ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                              : 'bg-gray-100 text-gray-800 dark:bg-gray-600 dark:text-gray-200'
                          }`}>
                            {item.jenis === 'Setoran' ? 'Setor' : item.jenis === 'Penarikan' ? 'Tarik' : item.jenis || '-'}
                          </span>
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {item.tanggal_dibuat ? new Date(item.tanggal_dibuat).toLocaleDateString('id-ID') : '-'}
                          </span>
                        </div>
                        <span className={`text-sm font-bold ${
                          item.jenis === 'Setoran'
                            ? 'text-green-600 dark:text-green-400'
                            : item.jenis === 'Penarikan'
                            ? 'text-red-600 dark:text-red-400'
                            : 'text-gray-600 dark:text-gray-400'
                        }`}>
                          {item.jenis === 'Setoran' ? '+' : item.jenis === 'Penarikan' ? '-' : ''}
                          {formatCurrency(item.nominal)}
                        </span>
                      </div>
                      {item.keterangan && (
                        <div className="text-sm text-gray-700 dark:text-gray-300 mb-1 line-clamp-1">
                          {item.keterangan}
                        </div>
                      )}
                      <div className="flex items-center gap-2 flex-wrap">
                        {item.kode_transaksi && (
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            Kode: {item.kode_transaksi}
                          </span>
                        )}
                        {item.metode_pembayaran && (
                          <>
                            {item.kode_transaksi && (
                              <span className="text-xs text-gray-400 dark:text-gray-500">•</span>
                            )}
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              Via: {item.metode_pembayaran}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    {isSuperAdmin && (
                      <button
                        onClick={() => handleDeleteTabungan(item)}
                        className="text-red-400 hover:text-red-600 p-1 rounded-full inline-flex items-center justify-center transition-colors flex-shrink-0"
                        title="Hapus tabungan"
                      >
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z" clipRule="evenodd"></path>
                        </svg>
                      </button>
                    )}
                  </div>
                </motion.div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Form Offcanvas */}
      <TabunganFormOffcanvas
        isOpen={showFormOffcanvas}
        onClose={closeFormOffcanvas}
        jamaahId={jamaahId}
        jamaahData={jamaahData}
        onSuccess={() => {
          fetchTabungan()
          setShowFormOffcanvas(false)
        }}
      />

      {/* Delete Modal */}
      <DeleteTabunganModal
        isOpen={showDeleteModal}
        onClose={() => {
          setShowDeleteModal(false)
          setItemToDelete(null)
        }}
        onConfirm={handleConfirmDelete}
        tabunganData={itemToDelete}
        jamaahId={jamaahId}
      />
    </div>
  )
}

export default TabunganList

