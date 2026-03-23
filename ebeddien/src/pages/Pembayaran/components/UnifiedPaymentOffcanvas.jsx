import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { createPortal } from 'react-dom'
import { uwabaAPI, paymentAPI, paymentTransactionAPI, santriAPI } from '../../../services/api'
import { useAuthStore } from '../../../store/authStore'
import { useTahunAjaranStore } from '../../../store/tahunAjaranStore'
import { getTanggalFromAPI } from '../../../utils/hijriDate'
import DeletePaymentModal from './DeletePaymentModal'
import { useNotification } from '../../../contexts/NotificationContext'
import { getGambarUrl } from '../../../config/images'

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
  const { showNotification } = useNotification()
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
  const [showUploadBuktiModal, setShowUploadBuktiModal] = useState(false)
  const [processingIPaymu, setProcessingIPaymu] = useState(false)
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
        total: parseInt(item?.wajib || item?.total || 0),
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
      if (!santriId || !/^\d{7}$/.test(santriId)) return
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
          showNotification('Pembayaran berhasil dihapus', 'success')
        } else {
          const errorMessage = result.message || 'Gagal menghapus pembayaran'
          showNotification(errorMessage, 'error')
          throw new Error(errorMessage)
        }
      } else {
        const result = await paymentAPI.deletePayment(deletePaymentId, mode)
        if (result.success) {
          if (onPaymentSuccess) onPaymentSuccess()
          setShowDeleteModal(false)
          setDeletePaymentId(null)
          setDeletePaymentAmount(0)
          showNotification('Pembayaran berhasil dihapus', 'success')
          onClose()
        } else {
          const errorMessage = result.message || 'Gagal menghapus pembayaran'
          showNotification(errorMessage, 'error')
          throw new Error(errorMessage)
        }
      }
    } catch (err) {
      console.error('Error deleting payment:', err)
      // Extract error message from axios error if available
      let errorMessage = 'Gagal menghapus pembayaran'
      if (err.response?.data?.message) {
        errorMessage = err.response.data.message
      } else if (err.message) {
        errorMessage = err.message
      }
      showNotification(errorMessage, 'error')
      throw new Error(errorMessage)
    } finally {
      setSaving(false)
    }
  }

  // Handle iPayMu Payment
  const handleIPaymuPayment = async () => {
    if (totals.kurang <= 0) {
      showNotification('Pembayaran sudah lunas', 'info')
      return
    }

    setProcessingIPaymu(true)
    setError(null)

    try {
      // Get data santri untuk payment
      let santriData = null
      if (isUwaba && santriId) {
        try {
          const result = await santriAPI.getById(santriId)
          if (result.success && result.data) {
            santriData = result.data
          }
        } catch (err) {
          console.error('Error fetching santri data:', err)
        }
      } else if (!isUwaba && item?.id_santri) {
        try {
          const result = await santriAPI.getById(item.id_santri)
          if (result.success && result.data) {
            santriData = result.data
          }
        } catch (err) {
          console.error('Error fetching santri data:', err)
        }
      }

      if (!santriData) {
        throw new Error('Data santri tidak ditemukan. Pastikan ID santri valid.')
      }

      // Cari payment record yang sesuai untuk mendapatkan id_payment
      // Payment record seharusnya sudah ada di tabel payment karena dibuat saat create payment
      // Untuk sementara, kita akan membuat payment record baru dengan status Pending
      // TODO: Query payment record berdasarkan id_referensi dan tabel_referensi
      
      // Prepare payment data untuk iPayMu (jenis_pembayaran agar keterangan di email iPayMu sesuai tipe: UWABA, Tunggakan, Khusus)
      const jenisPembayaran = isUwaba ? 'Uwaba' : (mode === 'khusus' ? 'Khusus' : 'Tunggakan')
      const tabelReferensi = isUwaba ? 'uwaba___bayar' : (mode === 'khusus' ? 'uwaba___khusus' : 'uwaba___tunggakan')
      const paymentData = {
        amount: totals.kurang,
        name: santriData.nama || 'Pembayar',
        phone: santriData.no_hp || santriData.no_telp || santriData.no_wa || '',
        email: santriData.email || '',
        payment_method: 'va',
        reference_id: `PAY-${Date.now()}-${isUwaba ? 'UWABA' : mode.toUpperCase()}-${santriId || item?.id || 'NEW'}`,
        jenis_pembayaran: jenisPembayaran,
        tabel_referensi: tabelReferensi,
        id_referensi: isUwaba ? tahunAjaran : (item?.id ?? null),
        id_santri: santriId || item?.id_santri || null
      }
      if (isUwaba && tahunAjaran) paymentData.tahun_ajaran = tahunAjaran

      // Create transaction di iPayMu
      const result = await paymentTransactionAPI.createTransaction(paymentData)

      if (result.success && result.data) {
        const { payment_url, va_number, qr_code, session_id, transaction_id } = result.data

        // Redirect ke payment URL atau tampilkan informasi pembayaran
        if (payment_url) {
          window.open(payment_url, '_blank')
          showNotification('Halaman pembayaran iPayMu dibuka di tab baru', 'success')
          
          // Simpan session_id untuk pengecekan status nanti
          if (session_id) {
            localStorage.setItem(`ipaymu_session_${transaction_id || Date.now()}`, session_id)
          }
        } else if (va_number) {
          // Tampilkan modal dengan informasi VA
          showNotification(`Virtual Account: ${va_number}. Silakan transfer ke nomor VA tersebut.`, 'success')
        } else if (qr_code) {
          // Tampilkan modal dengan QR Code
          showNotification('QR Code pembayaran berhasil dibuat', 'success')
        }
        
        // Refresh payment history setelah beberapa detik
        setTimeout(() => {
          fetchPaymentHistory()
          if (onPaymentSuccess) onPaymentSuccess()
        }, 2000)
      } else {
        throw new Error(result.message || 'Gagal membuat transaksi iPayMu')
      }
    } catch (err) {
      console.error('Error creating iPayMu payment:', err)
      const errorMessage = err.response?.data?.message || err.message || 'Gagal membuat pembayaran iPayMu'
      setError(errorMessage)
      showNotification(errorMessage, 'error')
    } finally {
      setProcessingIPaymu(false)
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
                    <div className="space-y-2">
                      {/* Tombol Upload Bukti TF dan Bayar dengan iPayMu */}
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={() => setShowUploadBuktiModal(true)}
                          className="bg-indigo-500 text-white p-2 rounded-lg hover:bg-indigo-600 font-semibold text-sm flex items-center justify-center gap-1"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                          </svg>
                          Upload Bukti TF
                        </button>
                        <button
                          onClick={handleIPaymuPayment}
                          disabled={processingIPaymu}
                          className="bg-teal-600 text-white p-2 rounded-lg hover:bg-teal-700 font-semibold text-sm flex items-center justify-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {processingIPaymu ? (
                            <>
                              <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                              </svg>
                              Memproses...
                            </>
                          ) : (
                            <>
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                              </svg>
                              Bayar dengan iPayMu
                            </>
                          )}
                        </button>
                      </div>
                      {/* Tombol Tambah Pembayaran Manual */}
                      <button
                        onClick={() => setShowForm(true)}
                        className="w-full bg-blue-500 text-white p-2 rounded-lg hover:bg-blue-600 font-semibold"
                      >
                        Tambah Pembayaran Manual
                      </button>
                    </div>
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
            title={
              isUwaba
                ? 'Konfirmasi hapus pembayaran UWABA'
                : mode === 'khusus'
                  ? 'Konfirmasi hapus pembayaran khusus'
                  : 'Konfirmasi hapus pembayaran tunggakan'
            }
          />

          {/* Upload Bukti TF Modal */}
          <AnimatePresence>
            {showUploadBuktiModal && (
              <>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setShowUploadBuktiModal(false)}
                  className="fixed inset-0 bg-black bg-opacity-50 z-[110]"
                />
                <motion.div
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.9, opacity: 0 }}
                  className="fixed inset-0 z-[110] flex items-center justify-center p-4"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-6">
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                        Upload Bukti Transfer
                      </h3>
                      <button
                        onClick={() => setShowUploadBuktiModal(false)}
                        className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                      >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                        </svg>
                      </button>
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                      <p>Fitur upload bukti transfer akan segera tersedia.</p>
                      <p className="mt-2">Untuk saat ini, silakan gunakan fitur upload bukti di halaman pendaftaran atau hubungi admin untuk verifikasi manual.</p>
                    </div>
                    <button
                      onClick={() => setShowUploadBuktiModal(false)}
                      className="w-full bg-teal-500 text-white py-2 px-4 rounded-lg hover:bg-teal-600 font-semibold"
                    >
                      Tutup
                    </button>
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </>
      )}
    </AnimatePresence>
  )

  if (!showPortal) return null
  return createPortal(offcanvasContent, document.body)
}

export default UnifiedPaymentOffcanvas

