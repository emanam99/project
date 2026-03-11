import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { createPortal } from 'react-dom'
import { uwabaAPI } from '../../services/api'
import { useAuthStore } from '../../store/authStore'
import { useTahunAjaranStore } from '../../store/tahunAjaranStore'
import { getTanggalFromAPI } from '../../utils/hijriDate'
import { formatKeteranganPembayaran } from '../../utils/uwabaCalculator'
import DeletePaymentModal from '../Payment/DeletePaymentModal'
import { getGambarUrl } from '../../config/images'

function UwabaPaymentOffcanvas({ 
  isOpen, 
  onClose, 
  santriId, 
  totalWajib, 
  totalBayar, 
  kurang,
  onPaymentSuccess 
}) {
  const { user } = useAuthStore()
  const { tahunAjaran } = useTahunAjaranStore()
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
  const [showPortal, setShowPortal] = useState(false)

  useEffect(() => {
    if (isOpen) setShowPortal(true)
  }, [isOpen])

  // Fetch payment history
  const fetchPaymentHistory = async () => {
    if (!santriId) return

    setLoading(true)
    try {
      const result = await uwabaAPI.getPaymentHistory(santriId, tahunAjaran)
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
    if (isOpen && santriId) {
      fetchPaymentHistory()
      setShowForm(false)
      setPaymentAmount('')
      setPaymentVia('Cash')
      setError(null)
    }
  }, [isOpen, santriId, tahunAjaran])

  // Format currency input
  const handleAmountInput = (e) => {
    let value = e.target.value.replace(/\D/g, '')
    const formatted = new Intl.NumberFormat('id-ID').format(value)
    setPaymentAmount(formatted)
    // Update live totals saat input berubah
    updateLiveTotals()
  }

  // Update live totals
  const updateLiveTotals = () => {
    const amount = parseFloat(paymentAmount.replace(/\./g, '')) || 0
    const newTotalBayar = totalBayar + amount
    const newSisaKurang = Math.max(totalWajib - newTotalBayar, 0)
    // Live totals akan ditampilkan di form
  }

  // Live totals untuk ditampilkan
  const liveTotalBayar = totalBayar + (parseFloat(paymentAmount.replace(/\./g, '')) || 0)
  const liveSisaKurang = Math.max(totalWajib - liveTotalBayar, 0)

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
      setError(`Pembayaran tidak boleh melebihi sisa kurang (Rp ${kurang.toLocaleString()})`)
      return
    }

    setSaving(true)
    try {
      if (!santriId) {
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
        hijriyah = '-'
      }

      // Format id_admin - remove "ID" prefix if exists
      let idAdmin = user.id
      if (typeof idAdmin === 'string' && idAdmin.startsWith('ID')) {
        idAdmin = idAdmin.replace(/^ID/, '')
      }

      const paymentData = {
        id_santri: santriId,
        nominal: amount,
        via: paymentVia,
        tahun_ajaran: tahunAjaran,
        hijriyah: hijriyah,
        id_admin: idAdmin,
        admin: user.nama
      }

      const result = await uwabaAPI.savePayment(paymentData)

      if (result.success) {
        setShowForm(false)
        setPaymentAmount('')
        // Call onPaymentSuccess untuk refresh rincian dan distribusi
        if (onPaymentSuccess) onPaymentSuccess()
        // Tutup offcanvas setelah pembayaran berhasil
        onClose()
      } else {
        setError(result.message || 'Gagal menyimpan pembayaran')
      }
    } catch (err) {
      console.error('Error saving payment:', err)
      setError('Gagal menyimpan pembayaran: ' + (err.message || 'Unknown error'))
    } finally {
      setSaving(false)
    }
  }

  // Confirm delete payment (dipanggil dari modal setelah ID dikonfirmasi)
  const handleConfirmDelete = async () => {
    if (!deletePaymentId) return

    setSaving(true)
    try {
      const result = await uwabaAPI.deletePayment(deletePaymentId)
      
      if (result.success) {
        // Refresh payment history
        await fetchPaymentHistory()
        // Call onPaymentSuccess untuk refresh rincian dan distribusi
        if (onPaymentSuccess) onPaymentSuccess()
        setShowDeleteModal(false)
        setDeletePaymentId(null)
        setDeletePaymentAmount(0)
      } else {
        throw new Error(result.message || 'Gagal menghapus pembayaran')
      }
    } catch (err) {
      console.error('Error deleting payment:', err)
      throw err // Re-throw agar bisa ditangani oleh modal
    } finally {
      setSaving(false)
    }
  }

  // Get via color
  const getViaColor = (via) => {
    if (via === 'TF') return '#2563eb'
    if (via === 'Lembaga') return '#059669'
    if (via === 'Beasiswa') return '#7c3aed'
    if (via === 'BagDIS') return '#dc2626'
    if (via === 'PIP') return '#f59e0b'
    if (via === 'KIP') return '#10b981'
    if (via === 'Adiktis') return '#8b5cf6'
    if (via === 'PemKab') return '#ef4444'
    if (via === 'Subsidi') return '#06b6d4'
    if (via === 'Prestasi') return '#ec4899'
    return '#64748b'
  }

  const offcanvasContent = (
    <AnimatePresence onExitComplete={() => setShowPortal(false)}>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            key="uwaba-payment-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 bg-black bg-opacity-50 z-40"
          />

          {/* Offcanvas - tertutup geser ke bawah saat X atau klik luar */}
          <motion.div
            key="uwaba-payment-panel"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'tween', ease: [0.25, 0.1, 0.25, 1], duration: 0.35 }}
            className="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 rounded-t-2xl shadow-[0_-10px_25px_-5px_rgba(0,0,0,0.1)] overflow-hidden"
            style={{ 
              zIndex: 101, // Lebih tinggi dari navigation (z-[100])
              paddingBottom: 'env(safe-area-inset-bottom, 0)' // Safe area untuk iPhone
            }}
          >
            <div className="md:grid md:grid-cols-2 max-h-[calc(100vh-8rem)] sm:max-h-[calc(100vh-7rem)]">
              {/* Kolom Gambar (hanya tampil di layar medium ke atas) */}
              <div className="hidden md:block relative">
                <img src={getGambarUrl('/icon-2.png')} alt="Gedung Pesantren" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-teal-800 bg-opacity-50"></div>
              </div>

              {/* Kolom Konten Pembayaran */}
              <div className="p-6 h-full flex flex-col pb-20 sm:pb-6">
                {/* Offcanvas Header */}
                <div className="flex justify-between items-center mb-4 border-b pb-3">
                  <h2 className="text-xl font-semibold text-teal-600 dark:text-teal-400">Detail Pembayaran</h2>
                  <button
                    onClick={onClose}
                    className="text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                    </svg>
                  </button>
                </div>

                {/* Konten dengan scroll internal */}
                <div className="overflow-y-auto pr-2 flex-1" style={{ maxHeight: '45vh' }}>
                  {/* UWABA Info */}
                  <div className="mb-4">
                    <p className="text-lg font-medium text-gray-800 dark:text-gray-200">Pembayaran UWABA {tahunAjaran}</p>
                    <div className="flex justify-between text-sm mt-2">
                      <span className="text-gray-600 dark:text-gray-400">Wajib: <strong id="offcanvasTotal" className="text-blue-600 dark:text-blue-400">Rp {totalWajib.toLocaleString('id-ID')}</strong></span>
                      <span className="text-gray-600 dark:text-gray-400">Total Bayar: <strong id="offcanvasBayar" className="text-green-600 dark:text-green-400">Rp {totalBayar.toLocaleString('id-ID')}</strong></span>
                      <span className="text-gray-600 dark:text-gray-400">Kurang: <strong id="offcanvasKurang" className="text-red-600 dark:text-red-400">Rp {kurang.toLocaleString('id-ID')}</strong></span>
                    </div>
                  </div>

                  {/* Payment History */}
                  <div className="mb-4 border border-gray-200 dark:border-gray-700 rounded-lg p-2 bg-gray-50 dark:bg-gray-900/50">
                    <h3 className="font-semibold text-sm mb-2 text-gray-700 dark:text-gray-300">Riwayat Pembayaran</h3>
                    <div id="paymentHistoryList" className="space-y-2">
                      {loading ? (
                        <p className="text-xs text-gray-500 dark:text-gray-400 text-center">Memuat riwayat uwaba...</p>
                      ) : paymentHistory.length === 0 ? (
                        <p className="text-xs text-gray-500 dark:text-gray-400 text-center">Tidak ada riwayat pembayaran uwaba.</p>
                      ) : (
                        paymentHistory.map((item) => {
                          const paymentAmount = parseInt(item.nominal) || 0
                          const hijriyahStr = item.hijriyah || '-'
                          const via = item.via || 'Cash'
                          const viaColor = getViaColor(via)
                          
                          return (
                            <div key={item.id} className="p-2 bg-white dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700 text-xs">
                              <div className="flex items-start justify-between gap-2">
                                <span
                                  className="inline-block min-w-[48px] text-center px-2 py-0.5 rounded text-white text-[10px] font-semibold mt-1"
                                  style={{ background: viaColor }}
                                >
                                  {via}
                                </span>
                                <span className="flex-1 text-center font-semibold text-teal-700 dark:text-teal-400 text-base mt-1">
                                  Rp {isNaN(paymentAmount) ? '-' : paymentAmount.toLocaleString('id-ID')}
                                </span>
                                <div className="flex flex-col items-end justify-center flex-1 min-w-[70px]">
                                  <span className="text-gray-500 dark:text-gray-400 leading-tight">{hijriyahStr}</span>
                                  <span className="text-gray-400 dark:text-gray-500 text-[10px]">Uwaba</span>
                                </div>
                                <button
                                  onClick={() => {
                                    setDeletePaymentId(item.id)
                                    setDeletePaymentAmount(paymentAmount)
                                    setShowDeleteModal(true)
                                  }}
                                  className="text-red-400 hover:text-red-600 p-1 rounded-full inline-flex items-center justify-center transition-colors ml-2 mt-0.5 self-start"
                                  title="Hapus pembayaran"
                                >
                                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z" clipRule="evenodd"></path>
                                  </svg>
                                </button>
                              </div>
                              <div className="text-gray-600 dark:text-gray-400 mt-1">
                                Oleh: <span className="font-medium">{item.admin || '-'}</span>
                              </div>
                            </div>
                          )
                        })
                      )}
                    </div>
                  </div>
                </div>

                {/* New Payment Form (di luar area scroll) */}
                <div className="pt-4 border-t">
                  <AnimatePresence>
                    {showForm ? (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                      >
                        <form onSubmit={handlePaymentSubmit}>
                          <div className="flex items-center gap-2 mb-2">
                            <input
                              type="text"
                              id="newPaymentAmount"
                              value={paymentAmount}
                              onChange={handleAmountInput}
                              placeholder="Masukkan nominal"
                              className="w-full p-2 border-b-2 border-gray-300 focus:border-teal-500 focus:outline-none bg-transparent text-right font-mono"
                              autoFocus
                            />
                            <select
                              id="newPaymentVia"
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
                              id="processPaymentBtn"
                              disabled={saving}
                              className="bg-teal-500 text-white p-2 rounded-lg hover:bg-teal-600 font-semibold disabled:opacity-50"
                            >
                              {saving ? 'Memproses...' : 'Bayar'}
                            </button>
                          </div>
                          {/* Live Totals */}
                          <div id="liveTotals" className="mt-2 text-xs text-center space-y-1">
                            <p>Total Bayar Baru: <strong id="liveTotalBayar" className="text-green-600">Rp {liveTotalBayar.toLocaleString('id-ID')}</strong></p>
                            <p>Sisa Kurang: <strong id="liveSisaKurang" className="text-red-600">Rp {liveSisaKurang.toLocaleString('id-ID')}</strong></p>
                          </div>
                          {error && (
                            <div className="mt-2 p-2 bg-red-100 text-red-700 rounded text-xs text-center">
                              {error}
                            </div>
                          )}
                        </form>
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                  {kurang > 0 && !showForm && (
                    <button
                      id="addPaymentBtn"
                      onClick={() => setShowForm(true)}
                      className="w-full bg-blue-500 text-white p-2 rounded-lg hover:bg-blue-600 mt-2 font-semibold"
                    >
                      Tambah Pembayaran
                    </button>
                  )}
                </div>
              </div>
            </div>
          </motion.div>

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
        </>
      )}
    </AnimatePresence>
  )

  if (!showPortal) return null
  return createPortal(offcanvasContent, document.body)
}

export default UwabaPaymentOffcanvas

