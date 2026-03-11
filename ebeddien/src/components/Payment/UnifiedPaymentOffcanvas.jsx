import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { createPortal } from 'react-dom'
import { uwabaAPI, paymentAPI } from '../../services/api'
import { useAuthStore } from '../../store/authStore'
import { useTahunAjaranStore } from '../../store/tahunAjaranStore'
import { getTanggalFromAPI } from '../../utils/hijriDate'
import DeletePaymentModal from './DeletePaymentModal'
import { getGambarUrl } from '../../config/images'

function UnifiedPaymentOffcanvas({ 
  isOpen, 
  onClose, 
  mode = 'uwaba', // 'uwaba', 'tunggakan', 'khusus'
  // Untuk uwaba
  santriId,
  totalWajib,
  totalBayar,
  kurang,
  // Untuk tunggakan/khusus
  item,
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

  // Calculate totals berdasarkan mode
  const isUwaba = mode === 'uwaba'
  const totals = useMemo(() => {
    if (isUwaba) {
      return {
        total: totalWajib || 0,
        bayar: totalBayar || 0,
        kurang: kurang || 0
      }
    } else {
      return {
        total: parseInt(item?.total || 0),
        bayar: parseInt(item?.bayar || 0),
        kurang: parseInt(item?.kurang || 0)
      }
    }
  }, [isUwaba, totalWajib, totalBayar, kurang, item])

  const isLunas = totals.kurang <= 0

  // Live totals saat input pembayaran
  const newPaymentAmount = parseFloat(paymentAmount.replace(/\./g, '')) || 0
  const liveTotalBayar = totals.bayar + newPaymentAmount
  const liveSisaKurang = Math.max(totals.total - liveTotalBayar, 0)

  // Fetch payment history
  const fetchPaymentHistory = async () => {
    if (isUwaba) {
      // santriId bisa id (angka) atau NIS (7 digit); keduanya valid setelah migrasi 78
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
    } else {
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
  }

  // Load history saat offcanvas dibuka
  useEffect(() => {
    if (isOpen) {
      if (isUwaba && santriId) {
        fetchPaymentHistory()
      } else if (!isUwaba && item?.id) {
        fetchPaymentHistory()
      }
      setShowForm(false)
      setPaymentAmount('')
      setPaymentVia('Cash')
      setError(null)
    }
  }, [isOpen, isUwaba ? santriId : item?.id, isUwaba ? tahunAjaran : mode])

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

    if (amount > totals.kurang) {
      setError(`Pembayaran tidak boleh melebihi sisa kurang (Rp ${totals.kurang.toLocaleString()})`)
      return
    }

    setSaving(true)
    try {
      if (isUwaba && !santriId) {
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

      if (isUwaba) {
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
          if (onPaymentSuccess) onPaymentSuccess()
          onClose()
        } else {
          setError(result.message || 'Gagal menyimpan pembayaran')
        }
      } else {
        const paymentData = {
          id_santri: santriId,
          amount: amount,
          admin: user.nama,
          id_admin: idAdmin,
          hijriyah: hijriyah,
          via: paymentVia,
          page: mode
        }

        if (mode === 'khusus') {
          paymentData.id_khusus = item.id
        } else {
          paymentData.id_tunggakan = item.id
        }

        const result = await paymentAPI.savePayment(paymentData)

        if (result.success) {
          setShowForm(false)
          setPaymentAmount('')
          if (onPaymentSuccess) onPaymentSuccess()
          onClose()
        } else {
          setError(result.message || 'Gagal menyimpan pembayaran')
        }
      }
    } catch (err) {
      console.error('Error saving payment:', err)
      setError('Gagal menyimpan pembayaran: ' + (err.message || 'Unknown error'))
    } finally {
      setSaving(false)
    }
  }

  // Handle delete payment
  const handleDeletePayment = (paymentId, amount) => {
    setDeletePaymentId(paymentId)
    setDeletePaymentAmount(amount)
    setShowDeleteModal(true)
  }

  // Confirm delete payment
  const handleConfirmDelete = async () => {
    if (!deletePaymentId) return

    setSaving(true)
    try {
      if (isUwaba) {
        const result = await uwabaAPI.deletePayment(deletePaymentId)
        if (result.success) {
          await fetchPaymentHistory()
          if (onPaymentSuccess) onPaymentSuccess()
          setShowDeleteModal(false)
          setDeletePaymentId(null)
          setDeletePaymentAmount(0)
        } else {
          throw new Error(result.message || 'Gagal menghapus pembayaran')
        }
      } else {
        const result = await paymentAPI.deletePayment(deletePaymentId, mode)
        if (result.success) {
          if (onPaymentSuccess) onPaymentSuccess()
          setShowDeleteModal(false)
          setDeletePaymentId(null)
          setDeletePaymentAmount(0)
          onClose()
        } else {
          throw new Error(result.message || 'Gagal menghapus pembayaran')
        }
      }
    } catch (err) {
      console.error('Error deleting payment:', err)
      throw err
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

  // Get title berdasarkan mode
  const getTitle = () => {
    if (isUwaba) {
      return `Pembayaran UWABA ${tahunAjaran}`
    } else {
      return item?.keterangan_1 || (mode === 'khusus' ? 'Khusus' : 'Tunggakan')
    }
  }

  const offcanvasContent = (
    <AnimatePresence mode="wait" onExitComplete={() => setShowPortal(false)}>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            key="unified-payment-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
            onClick={onClose}
            className="fixed inset-0 bg-black bg-opacity-50 z-40"
          />

          {/* Offcanvas - tertutup geser ke bawah saat X atau klik luar */}
          <motion.div
            key="unified-payment-panel"
            initial={{ y: '100%', opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '100%', opacity: 0 }}
            transition={{ 
              type: 'tween', 
              ease: [0.4, 0, 0.2, 1], // easeOut cubic-bezier untuk animasi lebih halus
              duration: 0.4 
            }}
            className="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 rounded-t-2xl shadow-[0_-10px_25px_-5px_rgba(0,0,0,0.1)] overflow-hidden"
            style={{ 
              zIndex: 101, // Lebih tinggi dari navigation (z-[100])
              paddingBottom: 'env(safe-area-inset-bottom, 0)' // Safe area untuk iPhone
            }}
          >
            <div className="md:grid md:grid-cols-2 overflow-hidden" style={{ height: 'calc(100vh - 8rem)', maxHeight: '90vh' }}>
              {/* Kolom Gambar (hanya tampil di layar medium ke atas) */}
              <div className="hidden md:block relative overflow-hidden" style={{ height: '100%' }}>
                <img src={getGambarUrl('/icon-2.png')} alt="Gedung Pesantren" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-teal-800 bg-opacity-50"></div>
              </div>

              {/* Kolom Konten Pembayaran */}
              <div className="p-6 flex flex-col overflow-hidden" style={{ height: '100%', minHeight: 0 }}>
                {/* Offcanvas Header */}
                <div className="flex justify-between items-center mb-4 border-b border-gray-200 dark:border-gray-700 pb-3 flex-shrink-0">
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
                <div className="flex-1 overflow-y-auto pr-2" style={{ minHeight: 0, flexShrink: 1, overflowY: 'scroll' }}>
                  {/* Info */}
                  <div className="mb-4">
                    <p className="text-lg font-medium text-gray-800 dark:text-gray-200">{getTitle()}</p>
                    <div className="flex justify-between text-sm mt-2">
                      <span className="text-gray-600 dark:text-gray-400">
                        {isUwaba ? 'Wajib' : 'Total'}: <strong className="text-blue-600 dark:text-blue-400">Rp {totals.total.toLocaleString('id-ID')}</strong>
                      </span>
                      <span className="text-gray-600 dark:text-gray-400">
                        Total Bayar: <strong className="text-green-600 dark:text-green-400">Rp {totals.bayar.toLocaleString('id-ID')}</strong>
                      </span>
                      <span className="text-gray-600 dark:text-gray-400">
                        Kurang: <strong className="text-red-600 dark:text-red-400">Rp {totals.kurang.toLocaleString('id-ID')}</strong>
                      </span>
                    </div>
                  </div>

                  {/* Payment History */}
                  <div className="mb-4 border border-gray-200 dark:border-gray-700 rounded-lg p-2 bg-gray-50 dark:bg-gray-900/50">
                    <h3 className="font-semibold text-sm mb-2 text-gray-700 dark:text-gray-300">Riwayat Pembayaran</h3>
                    <div className="space-y-2">
                      {loading ? (
                        <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
                          {isUwaba ? 'Memuat riwayat uwaba...' : 'Memuat riwayat pembayaran...'}
                        </p>
                      ) : paymentHistory.length === 0 ? (
                        <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
                          {isUwaba ? 'Tidak ada riwayat pembayaran uwaba.' : 'Tidak ada riwayat pembayaran.'}
                        </p>
                      ) : (
                        paymentHistory.map((payment) => {
                          const paymentAmount = parseInt(payment.nominal || payment.amount || 0) || 0
                          const hijriyahStr = payment.hijriyah || '-'
                          const via = payment.via || 'Cash'
                          const viaColor = getViaColor(via)
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
                                  {via}
                                </span>
                                <span className="flex-1 text-center font-semibold text-teal-700 dark:text-teal-400 text-base mt-1">
                                  Rp {isNaN(paymentAmount) ? '-' : paymentAmount.toLocaleString('id-ID')}
                                </span>
                                <div className="flex flex-col items-end justify-center flex-1 min-w-[70px]">
                                  {!isUwaba && tanggal && (
                                    <span className="text-gray-500 dark:text-gray-400 leading-tight">{tanggal}</span>
                                  )}
                                  {hijriyahStr && hijriyahStr !== '-' && (
                                    <span className="text-gray-500 dark:text-gray-400 leading-tight text-[10px]">{hijriyahStr}</span>
                                  )}
                                  <span className="text-gray-400 dark:text-gray-500 text-[10px]">
                                    {isUwaba ? 'Uwaba' : (mode === 'khusus' ? 'Khusus' : 'Tunggakan')}
                                  </span>
                                </div>
                                <button
                                  onClick={() => handleDeletePayment(payment.id, paymentAmount)}
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
                        })
                      )}
                    </div>
                  </div>
                </div>

                {/* New Payment Form (di luar area scroll) */}
                <div className="pt-4 border-t border-gray-200 dark:border-gray-700 flex-shrink-0" style={{ flexShrink: 0 }}>
                  <AnimatePresence mode="wait">
                    {showForm ? (
                      <motion.div
                        key="form"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
                        className="overflow-hidden"
                        style={{ flexShrink: 0 }}
                      >
                        <form onSubmit={handlePaymentSubmit}>
                          <div className="flex items-center gap-2 mb-2">
                            <input
                              type="text"
                              value={paymentAmount}
                              onChange={handleAmountInput}
                              placeholder="Masukkan nominal"
                              className="w-full p-2 border-b-2 border-gray-300 dark:border-gray-600 focus:border-teal-500 dark:focus:border-teal-400 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100 text-right font-mono"
                              autoFocus
                            />
                            <select
                              value={paymentVia}
                              onChange={(e) => setPaymentVia(e.target.value)}
                              className="p-2 border-b-2 border-gray-300 dark:border-gray-600 focus:border-teal-500 dark:focus:border-teal-400 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100"
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
                              {saving ? 'Memproses...' : 'Bayar'}
                            </button>
                          </div>
                          {/* Live Totals */}
                          <div className="mt-2 text-xs text-center space-y-1">
                            <p>Total Bayar Baru: <strong className="text-green-600 dark:text-green-400">Rp {liveTotalBayar.toLocaleString('id-ID')}</strong></p>
                            <p>Sisa Kurang: <strong className="text-red-600 dark:text-red-400">Rp {liveSisaKurang.toLocaleString('id-ID')}</strong></p>
                          </div>
                          {error && (
                            <div className="mt-2 p-2 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded text-xs text-center">
                              {error}
                            </div>
                          )}
                        </form>
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                  {totals.kurang > 0 && !showForm && (
                    <button
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

export default UnifiedPaymentOffcanvas

