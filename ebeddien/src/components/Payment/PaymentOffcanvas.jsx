import { useState, useEffect, useRef, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { paymentAPI } from '../../services/api'
import { useAuthStore } from '../../store/authStore'
import { getTanggalFromAPI } from '../../utils/hijriDate'
import DeletePaymentModal from './DeletePaymentModal'
import { getGambarUrl } from '../../config/images'

function PaymentOffcanvas({ isOpen, onClose, item, mode, santriId, onPaymentSuccess }) {
  const { user } = useAuthStore()
  const [paymentHistory, setPaymentHistory] = useState([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentVia, setPaymentVia] = useState('Cash')
  const [error, setError] = useState(null)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deletePaymentId, setDeletePaymentId] = useState(null)
  const [deletePaymentAmount, setDeletePaymentAmount] = useState(0)

  // Calculate totals
  const total = parseInt(item?.total || 0)
  const bayar = parseInt(item?.bayar || 0)
  const kurang = parseInt(item?.kurang || 0)
  const isLunas = kurang <= 0

  // Live totals saat input pembayaran
  const newPaymentAmount = parseFloat(paymentAmount.replace(/\./g, '')) || 0
  const newTotalBayar = bayar + newPaymentAmount
  const newSisaKurang = Math.max(total - newTotalBayar, 0)

  // Fetch payment history
  const fetchPaymentHistory = async () => {
    if (!item?.id) return

    setLoading(true)
    try {
      const result = await paymentAPI.getPaymentHistory(item.id, mode)
      if (result.success && result.data) {
        setPaymentHistory(result.data)
      } else {
        setPaymentHistory([])
      }
    } catch (err) {
      console.error('Error fetching payment history:', err)
      setPaymentHistory([])
    } finally {
      setLoading(false)
    }
  }

  // Load history saat offcanvas dibuka
  useEffect(() => {
    if (isOpen && item?.id) {
      fetchPaymentHistory()
      setShowForm(false)
      setPaymentAmount('')
      setPaymentVia('Cash')
      setError(null)
    }
  }, [isOpen, item?.id])

  // Format currency input
  const handleAmountInput = (e) => {
    let value = e.target.value.replace(/\D/g, '')
    const formatted = new Intl.NumberFormat('id-ID').format(value)
    setPaymentAmount(formatted)
  }

  // Handle payment submit
  const handlePaymentSubmit = async (e) => {
    e.preventDefault()
    setError(null)

    const amount = parseFloat(paymentAmount.replace(/\./g, '')) || 0

    if (!amount || amount <= 0) {
      setError('Masukkan nominal yang valid')
      return
    }

    if (amount > kurang) {
      setError(`Pembayaran tidak boleh melebihi sisa tunggakan (Rp ${kurang.toLocaleString()})`)
      return
    }

    setSaving(true)
    try {
      // Validasi semua field required
      if (!santriId || !/^\d{7}$/.test(santriId)) {
        setError('NIS tidak valid')
        setSaving(false)
        return
      }

      if (!user?.id || !user?.nama) {
        setError('User information tidak lengkap')
        setSaving(false)
        return
      }

      // Get hijriyah date from API
      let hijriyah = '-'
      try {
        const tanggalData = await getTanggalFromAPI()
        hijriyah = tanggalData.hijriyah || '-'
      } catch (err) {
        console.error('Error fetching hijriyah date:', err)
        // Use default if API fails
        hijriyah = '-'
      }

      // Format id_admin - remove "ID" prefix if exists
      let idAdmin = user.id
      if (typeof idAdmin === 'string' && idAdmin.startsWith('ID')) {
        idAdmin = idAdmin.replace(/^ID/, '')
      }

      const paymentData = {
        id_santri: santriId,
        amount: parseFloat(amount), // Ensure it's a number
        admin: user.nama,
        id_admin: idAdmin,
        hijriyah: hijriyah,
        via: paymentVia,
        page: mode
      }

      // Debug log (remove in production)
      console.log('Payment data being sent:', paymentData)

      // Add id_tunggakan or id_khusus based on mode
      if (mode === 'khusus') {
        paymentData.id_khusus = item.id
      } else {
        paymentData.id_tunggakan = item.id
      }

      const result = await paymentAPI.savePayment(paymentData)

      if (result.success) {
        setShowForm(false)
        setPaymentAmount('')
        // Call onPaymentSuccess untuk refresh rincian
        if (onPaymentSuccess) onPaymentSuccess()
        // Tutup offcanvas setelah pembayaran berhasil
        onClose()
      } else {
        setError(result.message || 'Gagal menyimpan pembayaran')
      }
    } catch (err) {
      console.error('Error saving payment:', err)
      setError(err.message || 'Gagal menyimpan pembayaran')
    } finally {
      setSaving(false)
    }
  }

  // Handle delete payment - show modal
  const handleDeletePayment = (paymentId, amount) => {
    setDeletePaymentId(paymentId)
    setDeletePaymentAmount(amount)
    setShowDeleteModal(true)
  }

  // Confirm delete payment
  const handleConfirmDelete = async () => {
    if (!deletePaymentId) return

    try {
      const result = await paymentAPI.deletePayment(deletePaymentId, mode)
      if (result.success) {
        // Call onPaymentSuccess untuk refresh rincian
        if (onPaymentSuccess) onPaymentSuccess()
        setShowDeleteModal(false)
        setDeletePaymentId(null)
        setDeletePaymentAmount(0)
        // Tutup offcanvas setelah hapus berhasil
        onClose()
      } else {
        throw new Error(result.message || 'Gagal menghapus pembayaran')
      }
    } catch (err) {
      console.error('Error deleting payment:', err)
      throw err // Re-throw untuk ditangani di modal
    }
  }

  // Stable key based on item.id (harus dipanggil sebelum conditional return - Rules of Hooks)
  const offcanvasKey = useMemo(() => `payment-offcanvas-${item?.id || 'default'}`, [item?.id])

  if (!item) return null

  return (
    <AnimatePresence>
      {isOpen && (
        <div key={offcanvasKey}>
          {/* Backdrop */}
          <motion.div
            key={`backdrop-${offcanvasKey}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black bg-opacity-50 z-40"
          />

          {/* Offcanvas */}
          <motion.div
            key={`offcanvas-${offcanvasKey}`}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'tween', duration: 0.3 }}
            className="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 rounded-t-2xl shadow-[0_-10px_25px_-5px_rgba(0,0,0,0.1)] overflow-hidden max-h-[calc(100vh-7rem)]"
            style={{ 
              zIndex: 101, // Lebih tinggi dari navigation (z-[100])
              paddingBottom: 'env(safe-area-inset-bottom, 0)' // Safe area untuk iPhone
            }}
          >
            <div className="md:grid md:grid-cols-2 h-full">
              {/* Kolom Gambar (Desktop) */}
              <div className="hidden md:block relative">
                <img 
                  src={getGambarUrl('/icon-2.png')} 
                  alt="Gedung Pesantren" 
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    e.target.style.display = 'none'
                  }}
                />
                <div className="absolute inset-0 bg-teal-800 bg-opacity-50"></div>
              </div>

              {/* Kolom Konten */}
              <div className="p-6 h-full flex flex-col overflow-hidden">
                {/* Header */}
                <div className="flex justify-between items-center mb-4 border-b pb-3">
                  <h2 className="text-xl font-semibold text-teal-600">Detail Pembayaran</h2>
                  <button
                    onClick={onClose}
                    className="text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                    </svg>
                  </button>
                </div>

                {/* Scrollable Content */}
                <div className="overflow-y-auto pr-2 flex-1" style={{ maxHeight: '45vh' }}>
                  {/* Item Info */}
                  <div className="mb-4">
                    <p className="text-lg font-medium text-gray-800 dark:text-gray-200">{item.keterangan_1 || 'Tunggakan'}</p>
                    <div className="flex justify-between text-sm mt-2">
                      <span className="text-gray-600 dark:text-gray-400">
                        Wajib: <strong className="text-blue-600 dark:text-blue-400">Rp {total.toLocaleString()}</strong>
                      </span>
                      <span className="text-gray-600 dark:text-gray-400">
                        Total Bayar: <strong className="text-green-600 dark:text-green-400">Rp {bayar.toLocaleString()}</strong>
                      </span>
                      <span className="text-gray-600 dark:text-gray-400">
                        Kurang: <strong className="text-red-600 dark:text-red-400">Rp {kurang.toLocaleString()}</strong>
                      </span>
                    </div>
                  </div>

                  {/* Payment History */}
                  <div className="mb-4 border border-gray-200 dark:border-gray-700 rounded-lg p-2 bg-gray-50 dark:bg-gray-900/50">
                    <h3 className="font-semibold text-sm mb-2 text-gray-700 dark:text-gray-300">Riwayat Pembayaran</h3>
                    {loading ? (
                      <div className="text-center py-4">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-teal-600 mx-auto"></div>
                      </div>
                    ) : paymentHistory.length === 0 ? (
                      <p className="text-xs text-gray-500 dark:text-gray-400 text-center">Tidak ada riwayat pembayaran.</p>
                    ) : (
                      <div className="space-y-2">
                        {paymentHistory.map((payment) => {
                          const viaColors = {
                            'TF': '#2563eb',
                            'Lembaga': '#059669',
                            'Beasiswa': '#7c3aed',
                            'BagDIS': '#dc2626',
                            'PIP': '#f59e0b',
                            'KIP': '#10b981',
                            'Adiktis': '#8b5cf6',
                            'PemKab': '#ef4444',
                            'Subsidi': '#06b6d4',
                            'Prestasi': '#ec4899',
                            'Cash': '#64748b'
                          }
                          const viaColor = viaColors[payment.via] || '#64748b'
                          const tanggal = payment.tanggal_dibuat 
                            ? new Date(payment.tanggal_dibuat).toLocaleDateString('id-ID')
                            : '-'

                          return (
                            <div key={payment.id} className="p-2 bg-white dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700 text-xs">
                              <div className="flex items-start justify-between gap-2">
                                <span
                                  className="inline-block min-w-[48px] text-center px-2 py-0.5 rounded text-white text-[10px] font-semibold mt-1"
                                  style={{ background: viaColor }}
                                >
                                  {payment.via || '-'}
                                </span>
                                <span className="flex-1 text-center font-semibold text-teal-700 dark:text-teal-400 text-base mt-1">
                                  Rp {parseInt(payment.nominal || 0).toLocaleString()}
                                </span>
                                <div className="flex flex-col items-end justify-center flex-1 min-w-[70px]">
                                  <span className="text-gray-500 dark:text-gray-400 leading-tight">{tanggal}</span>
                                  {payment.hijriyah && (
                                    <span className="text-gray-500 dark:text-gray-400 leading-tight text-[10px]">{payment.hijriyah}</span>
                                  )}
                                </div>
                                <button
                                  onClick={() => handleDeletePayment(payment.id, payment.nominal)}
                                  className="text-red-400 hover:text-red-600 p-1 rounded-full inline-flex items-center justify-center transition-colors ml-2 mt-0.5 self-start"
                                  title="Hapus pembayaran"
                                >
                                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z" clipRule="evenodd"></path>
                                  </svg>
                                </button>
                              </div>
                              <div className="text-gray-600 dark:text-gray-400 mt-1">
                                Oleh: <span className="font-medium">{payment.admin || '-'}</span>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {/* Payment Form (Fixed at bottom) */}
                <div className="pt-4 border-t">
                  {error && (
                    <div className="mb-2 p-2 bg-red-100 text-red-700 rounded text-xs">
                      {error}
                    </div>
                  )}

                  {showForm ? (
                    <form onSubmit={handlePaymentSubmit} className="space-y-2">
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={paymentAmount}
                          onChange={handleAmountInput}
                          placeholder="Masukkan nominal"
                          className="flex-1 p-2 border-b-2 border-gray-300 focus:border-teal-500 focus:outline-none bg-transparent text-right font-mono"
                        />
                        <select
                          value={paymentVia}
                          onChange={(e) => setPaymentVia(e.target.value)}
                          className="p-2 border-b-2 border-gray-300 focus:border-teal-500 focus:outline-none bg-transparent"
                        >
                          <option value="Cash">Cash</option>
                          <option value="TF">TF</option>
                          <option value="Lembaga">Lembaga</option>
                          <option value="Beasiswa">Beasiswa</option>
                          <option value="BagDIS">BagDIS</option>
                          <option value="PIP">PIP</option>
                          <option value="KIP">KIP</option>
                          <option value="Adiktis">Adiktis</option>
                          <option value="PemKab">PemKab</option>
                          <option value="Subsidi">Subsidi</option>
                          <option value="Prestasi">Prestasi</option>
                        </select>
                        <button
                          type="submit"
                          disabled={saving}
                          className="bg-teal-500 text-white p-2 rounded-lg hover:bg-teal-600 font-semibold disabled:opacity-50"
                        >
                          {saving ? '...' : 'Bayar'}
                        </button>
                      </div>
                      {/* Live Totals */}
                      <div className="mt-2 text-xs text-center space-y-1">
                        <p>
                          Total Bayar Baru: <strong className="text-green-600">Rp {newTotalBayar.toLocaleString()}</strong>
                        </p>
                        <p>
                          Sisa Kurang: <strong className="text-red-600">Rp {newSisaKurang.toLocaleString()}</strong>
                        </p>
                      </div>
                    </form>
                  ) : (
                    <button
                      onClick={() => setShowForm(true)}
                      disabled={isLunas}
                      className="w-full bg-blue-500 text-white p-2 rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isLunas ? 'Sudah Lunas' : 'Tambah Pembayaran'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* Delete Payment Modal */}
      <DeletePaymentModal
        isOpen={showDeleteModal}
        onClose={() => {
          setShowDeleteModal(false)
          setDeletePaymentId(null)
          setDeletePaymentAmount(0)
        }}
        onConfirm={handleConfirmDelete}
        paymentAmount={deletePaymentAmount}
        santriId={santriId}
      />
    </AnimatePresence>
  )
}

export default PaymentOffcanvas

