import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { paymentAPI } from '../../../services/api'
import { useNotification } from '../../../contexts/NotificationContext'
import { useOffcanvasBackClose } from '../../../hooks/useOffcanvasBackClose'
import Modal from '../../../components/Modal/Modal'
import TunggakanFormModal from './TunggakanFormModal'
import UnifiedPaymentOffcanvas from './UnifiedPaymentOffcanvas'
import PrintOffcanvas from './PrintOffcanvas'

// Komponen tombol tambah dengan animasi hover
function AddButton({ onClick, disabled, label, colorClass }) {
  const [isHovered, setIsHovered] = useState(false)
  
  return (
    <motion.button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`relative flex items-center justify-center rounded-lg shadow transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden ${
        colorClass || 'bg-teal-500 hover:bg-teal-600 text-white'
      }`}
      animate={{ width: isHovered ? 'auto' : '2.5rem' }}
      initial={{ width: '2.5rem' }}
      style={{ minWidth: '2.5rem' }}
    >
      <div className="flex items-center gap-2 px-3 py-2 whitespace-nowrap">
        <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"/>
        </svg>
        <motion.span
          animate={{ opacity: isHovered ? 1 : 0, width: isHovered ? 'auto' : 0 }}
          initial={{ opacity: 0, width: 0 }}
          className="font-semibold overflow-hidden"
        >
          {label}
        </motion.span>
      </div>
    </motion.button>
  )
}

function RincianList({ santriId, mode = 'tunggakan' }) {
  const { showNotification } = useNotification()
  const [rincian, setRincian] = useState([])
  const [total, setTotal] = useState({ total: 0, bayar: 0, kurang: 0 })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [showFormModal, setShowFormModal] = useState(false)
  const [formItemData, setFormItemData] = useState(null)
  const [showPaymentOffcanvas, setShowPaymentOffcanvas] = useState(false)
  const [selectedItem, setSelectedItem] = useState(null)
  const [showPrintOffcanvas, setShowPrintOffcanvas] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [itemToDelete, setItemToDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const closePaymentOffcanvas = useOffcanvasBackClose(showPaymentOffcanvas, () => { setShowPaymentOffcanvas(false); setSelectedItem(null) })
  const closePrintOffcanvas = useOffcanvasBackClose(showPrintOffcanvas, () => setShowPrintOffcanvas(false))

  // Fetch rincian data (santriId bisa id numerik atau NIS 7 digit; backend resolve otomatis)
  const fetchRincian = async () => {
    const id = String(santriId ?? '').trim()
    if (!id) {
      setRincian([])
      setTotal({ total: 0, bayar: 0, kurang: 0 })
      setError(null)
      return
    }

    setLoading(true)
    setError(null)
    try {
      // Untuk tunggakan dan khusus, tidak perlu filter tahun ajaran
      const result = await paymentAPI.getRincian(santriId, mode, null)
      
      if (result.success && result.data) {
        setRincian(result.data.rincian || [])
        setTotal(result.data.total || { total: 0, bayar: 0, kurang: 0 })
      } else {
        setRincian([])
        setTotal({ total: 0, bayar: 0, kurang: 0 })
        setError(result.message || 'Gagal mengambil data rincian')
      }
    } catch (err) {
      console.error('Error fetching rincian:', err)
      setRincian([])
      setTotal({ total: 0, bayar: 0, kurang: 0 })
      setError(err.message || 'Gagal mengambil data rincian')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchRincian()
  }, [santriId, mode])

  // Handle bayar button click
  const handleBayar = (item) => {
    setSelectedItem(item)
    setShowPaymentOffcanvas(true)
  }

  // Handle print button click
  const handlePrint = () => {
    if (!santriId || String(santriId).trim() === '') {
      return
    }
    setShowPrintOffcanvas(true)
  }

  // Handle tambah button click
  const handleTambah = () => {
    setFormItemData(null)
    setShowFormModal(true)
  }

  // Handle edit button click
  const handleEdit = (item) => {
    setFormItemData(item)
    setShowFormModal(true)
  }

  // Handle delete button click - buka modal
  const handleDelete = (item) => {
    setItemToDelete(item)
    setShowDeleteModal(true)
  }

  // Handle close delete modal
  const handleCloseDeleteModal = () => {
    if (!deleting) {
      setShowDeleteModal(false)
      setItemToDelete(null)
    }
  }

  // Handle confirm delete
  const handleDeleteConfirm = async () => {
    if (!itemToDelete) return

    // Pastikan pembayaran = 0
    if (parseInt(itemToDelete.bayar || 0) > 0) {
      showNotification('Tidak dapat menghapus item yang sudah memiliki pembayaran.', 'error')
      return
    }

    setDeleting(true)
    try {
      const result = await paymentAPI.deleteTunggakanKhusus(itemToDelete.id, mode)
      
      if (result.success) {
        showNotification(result.message || 'Data berhasil dihapus.', 'success')
        setShowDeleteModal(false)
        setItemToDelete(null)
        fetchRincian()
      } else {
        showNotification(result.message || 'Gagal menghapus data.', 'error')
      }
    } catch (err) {
      console.error('Error deleting item:', err)
      showNotification(err.message || 'Gagal menghapus data.', 'error')
    } finally {
      setDeleting(false)
    }
  }

  // Handle form success
  const handleFormSuccess = () => {
    fetchRincian()
  }

  // Handle payment success
  const handlePaymentSuccess = () => {
    fetchRincian()
  }

  if (!santriId || String(santriId).trim() === '') {
    return (
      <div className="text-gray-500 dark:text-gray-400 text-center py-8">
        <p>Masukkan NIS untuk melihat rincian.</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600 dark:border-teal-400"></div>
        <span className="ml-3 text-gray-600 dark:text-gray-400">Memuat data rincian...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <div className="text-red-500 dark:text-red-400 mb-2">⚠️ {error}</div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header dengan Total - Fixed */}
      <div className="flex justify-between items-center mb-4 pb-2 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
        {rincian.length > 0 ? (
          <>
            <div className="text-center flex-1">
              <div className="text-gray-600 dark:text-gray-400 font-medium mb-1 text-xs sm:text-sm">Total</div>
              <div className="text-blue-600 dark:text-blue-400 font-semibold text-sm sm:text-base">Rp {total.total.toLocaleString()}</div>
            </div>
            <div className="text-center flex-1">
              <div className="text-gray-600 dark:text-gray-400 font-medium mb-1 text-xs sm:text-sm">Bayar</div>
              <div className="text-green-600 dark:text-green-400 font-semibold text-sm sm:text-base">Rp {total.bayar.toLocaleString()}</div>
            </div>
            <div className="text-center flex-1">
              <div className="text-gray-600 dark:text-gray-400 font-medium mb-1 text-xs sm:text-sm">Kurang</div>
              <div className="text-red-600 dark:text-red-400 font-semibold text-sm sm:text-base">Rp {total.kurang.toLocaleString()}</div>
            </div>
            <div className="flex-shrink-0 ml-4">
              <AddButton
                onClick={handleTambah}
                disabled={!santriId || !/^\d{7}$/.test(santriId)}
                label={mode === 'khusus' ? 'Khusus' : 'Tunggakan'}
                colorClass={
                  mode === 'khusus'
                    ? 'bg-blue-500 hover:bg-blue-600 text-white'
                    : 'bg-orange-500 hover:bg-orange-600 text-white'
                }
              />
            </div>
          </>
        ) : (
          <div className="flex justify-end w-full">
            <AddButton
              onClick={handleTambah}
              disabled={!santriId || !/^\d{7}$/.test(santriId)}
              label={mode === 'khusus' ? 'Khusus' : 'Tunggakan'}
              colorClass={
                mode === 'khusus'
                  ? 'bg-blue-500 hover:bg-blue-600 text-white'
                  : 'bg-orange-500 hover:bg-orange-600 text-white'
              }
            />
          </div>
        )}
      </div>

      {/* List Rincian - Scrollable */}
      <div className="flex-1 overflow-y-auto space-y-2 pr-2 min-h-0" style={{ 
        scrollbarWidth: 'thin',
        scrollbarColor: '#cbd5e1 #f1f5f9'
      }}>
        <style>{`
          div::-webkit-scrollbar {
            width: 8px;
          }
          div::-webkit-scrollbar-track {
            background: #f1f5f9;
            border-radius: 4px;
          }
          div::-webkit-scrollbar-thumb {
            background: #cbd5e1;
            border-radius: 4px;
          }
          div::-webkit-scrollbar-thumb:hover {
            background: #94a3b8;
          }
          .dark div::-webkit-scrollbar-track {
            background: #1f2937;
          }
          .dark div::-webkit-scrollbar-thumb {
            background: #4b5563;
          }
          .dark div::-webkit-scrollbar-thumb:hover {
            background: #6b7280;
          }
        `}</style>
        {rincian.length === 0 ? (
          <p className="text-gray-500 dark:text-gray-400 text-center py-4">Tidak ada data untuk ditampilkan.</p>
        ) : (
          rincian.map((item) => {
            const isLunas = item.kurang <= 0
            const buttonClass = isLunas
              ? 'bg-blue-500 text-white hover:bg-blue-600'
              : 'bg-teal-500 text-white hover:bg-teal-600'
            const buttonText = isLunas ? 'Lunas (Lihat Rincian)' : 'Bayar'
            const hasPayment = parseInt(item.bayar || 0) > 0
            const canDelete = !hasPayment

            return (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 bg-white dark:bg-gray-800 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="text-lg font-bold text-gray-800 dark:text-gray-200">
                      Rp {parseInt(item.wajib ?? item.total ?? 0).toLocaleString()}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{item.keterangan_1 || ''}</div>
                    {item.keterangan_2 && (
                      <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">{item.keterangan_2}</div>
                    )}
                    {(item.tahun_ajaran || item.lembaga) && (
                      <div className="flex justify-between mt-1">
                        {item.lembaga && (
                          <span className="text-xs text-indigo-500">{item.lembaga}</span>
                        )}
                        {item.tahun_ajaran && (
                          <span className="text-xs text-blue-500">{item.tahun_ajaran}</span>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="text-right ml-4 text-xs" style={{ minWidth: '80px' }}>
                    <div className="text-gray-600 dark:text-gray-400 mb-1">
                      <span className="font-medium">Bayar:</span>
                      <br />
                      <span className="text-green-600 dark:text-green-400 font-semibold">
                        Rp {parseInt(item.bayar || 0).toLocaleString()}
                      </span>
                    </div>
                    <div className="text-gray-600 dark:text-gray-400">
                      <span className="font-medium">Kurang:</span>
                      <br />
                      <span className="text-red-600 dark:text-red-400 font-semibold">
                        Rp {parseInt(item.kurang || 0).toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <button
                    onClick={() => handleBayar(item)}
                    className={`flex-1 text-center px-3 py-1 text-xs rounded-md transition-all duration-200 ${buttonClass}`}
                  >
                    {buttonText}
                  </button>
                  <button
                    onClick={() => handleEdit(item)}
                    className="px-3 py-1 text-xs rounded-md transition-all duration-200 bg-blue-500 text-white hover:bg-blue-600 flex items-center gap-1"
                    title="Edit"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                  <button
                    onClick={handlePrint}
                    disabled={!santriId || !/^\d{7}$/.test(santriId)}
                    className="px-3 py-1 text-xs rounded-md transition-all duration-200 bg-purple-500 text-white hover:bg-purple-600 flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"
                      />
                    </svg>
                    Print
                  </button>
                  <button
                    onClick={() => handleDelete(item)}
                    disabled={!canDelete || deleting}
                    className="px-3 py-1 text-xs rounded-md transition-all duration-200 bg-red-500 text-white hover:bg-red-600 flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                    title={hasPayment ? 'Tidak dapat dihapus karena sudah ada pembayaran' : 'Hapus'}
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </motion.div>
            )
          })
        )}
      </div>

      {/* Form Modal */}
      <TunggakanFormModal
        isOpen={showFormModal}
        onClose={() => {
          setShowFormModal(false)
          setFormItemData(null)
        }}
        mode={mode}
        santriId={santriId}
        itemData={formItemData}
        onSuccess={handleFormSuccess}
      />

      {/* Payment Offcanvas */}
      <UnifiedPaymentOffcanvas
        isOpen={showPaymentOffcanvas}
        onClose={closePaymentOffcanvas}
        mode={mode}
        item={selectedItem}
        santriId={santriId}
        onPaymentSuccess={handlePaymentSuccess}
      />

      {/* Print Offcanvas */}
      <PrintOffcanvas
        isOpen={showPrintOffcanvas}
        onClose={closePrintOffcanvas}
        santriId={santriId}
        mode={mode}
      />

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={showDeleteModal}
        onClose={handleCloseDeleteModal}
        title={`Konfirmasi Hapus ${mode === 'khusus' ? 'Pembayaran Khusus' : 'Tunggakan'}`}
        maxWidth="max-w-md"
        closeOnBackdropClick={!deleting}
      >
        <div className="p-6">
          <div className="mb-4">
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              Apakah Anda yakin ingin menghapus {mode === 'khusus' ? 'pembayaran khusus' : 'tunggakan'} ini?
            </p>
            {itemToDelete && (
              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 mb-4">
                <p className="font-medium text-gray-800 dark:text-gray-200 mb-2">
                  {itemToDelete.keterangan_1 || 'Tidak ada keterangan'}
                </p>
                {itemToDelete.keterangan_2 && (
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                    {itemToDelete.keterangan_2}
                  </p>
                )}
                <div className="flex justify-between items-center mt-2">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Total:</span>
                  <span className="font-semibold text-gray-800 dark:text-gray-200">
                    Rp {parseInt(itemToDelete.wajib || itemToDelete.total || 0).toLocaleString()}
                  </span>
                </div>
                {parseInt(itemToDelete.bayar || 0) > 0 && (
                  <div className="mt-2 p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded">
                    <p className="text-xs text-red-600 dark:text-red-400 font-medium">
                      ⚠️ Item ini memiliki pembayaran sebesar Rp {parseInt(itemToDelete.bayar || 0).toLocaleString()}
                    </p>
                  </div>
                )}
              </div>
            )}
            <p className="text-sm text-red-600 dark:text-red-400 mb-4 font-medium">
              ⚠️ Tindakan ini tidak dapat dibatalkan!
            </p>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
            <button
              type="button"
              onClick={handleCloseDeleteModal}
              disabled={deleting}
              className="px-4 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={handleDeleteConfirm}
              disabled={deleting || (itemToDelete && parseInt(itemToDelete.bayar || 0) > 0)}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {deleting ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Menghapus...
                </>
              ) : (
                'Hapus'
              )}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

export default RincianList

