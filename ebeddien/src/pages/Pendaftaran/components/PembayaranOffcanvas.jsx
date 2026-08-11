import { usePendaftaranDefaultTahunAjaran } from '../../../hooks/usePendaftaranDefaultTahunAjaran'
import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { createPortal } from 'react-dom'
import { pendaftaranAPI, santriAPI } from '../../../services/api'
import { useAuthStore } from '../../../store/authStore'
import { getTanggalFromAPI } from '../../../utils/hijriDate'
import { compressImage } from '../../../utils/imageCompression'
import { formatFileSize } from './utils/fileUtils'
import DeletePaymentModal from '../../Pembayaran/components/DeletePaymentModal'
import IpaymuStaffCheckout from '../../Pembayaran/components/IpaymuStaffCheckout'
import { useNotification } from '../../../contexts/NotificationContext'
import { getGambarUrl } from '../../../config/images'

function PembayaranOffcanvas({ 
  isOpen, 
  onClose, 
  idRegistrasi,
  wajib,
  bayar,
  kurang,
  onPaymentSuccess,
  buktiPembayaranList = [],
  onPreviewBukti,
  onUploadBuktiSuccess,
  canKelolaPembayaran = false,
  tahunHijriyah: tahunHijriyahProp,
  tahunMasehi: tahunMasehiProp
}) {
  const { user } = useAuthStore()
  const psbTahunAjaranDefault = usePendaftaranDefaultTahunAjaran()
  const tahunAjaran = tahunHijriyahProp !== undefined ? tahunHijriyahProp : psbTahunAjaranDefault.hijriyah
  const tahunAjaranMasehi = tahunMasehiProp !== undefined ? tahunMasehiProp : psbTahunAjaranDefault.masehi
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
  const [uploadSelectedFile, setUploadSelectedFile] = useState(null)
  const [uploadKeterangan, setUploadKeterangan] = useState('')
  const [uploadUploading, setUploadUploading] = useState(false)
  const [showIpaymuCheckout, setShowIpaymuCheckout] = useState(false)
  const [ipaymuSantriContact, setIpaymuSantriContact] = useState({ name: '', phone: '', email: '' })
  const [santriId, setSantriId] = useState(null)

  const totals = {
    total: parseInt(wajib || 0),
    bayar: parseInt(bayar || 0),
    kurang: parseInt(kurang || 0)
  }

  const isLunas = totals.kurang <= 0

  // Live totals saat input pembayaran
  const newPaymentAmount = parseFloat(paymentAmount.replace(/\./g, '')) || 0
  const liveTotalBayar = totals.bayar + newPaymentAmount
  const liveSisaKurang = Math.max(totals.total - liveTotalBayar, 0)

  // Fetch payment history
  const fetchPaymentHistory = async () => {
    if (!idRegistrasi) return

    setLoading(true)
    try {
      const result = await pendaftaranAPI.getTransaksi(idRegistrasi)
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

  // Fetch id_santri dari idRegistrasi (langsung dari tabel registrasi)
  const fetchSantriId = async () => {
    if (!idRegistrasi) {
      setSantriId(null)
      return
    }

    try {
      // Ambil id_santri langsung dari tabel registrasi menggunakan API
      const response = await pendaftaranAPI.getRegistrasiById(idRegistrasi)
      if (response.success && response.data && response.data.id_santri) {
        setSantriId(String(response.data.id_santri).padStart(7, '0'))
      } else {
        setSantriId(null)
      }
    } catch (err) {
      console.error('Error fetching santri id:', err)
      setSantriId(null)
    }
  }

  // Load history dan santriId saat offcanvas dibuka
  useEffect(() => {
    if (isOpen && idRegistrasi) {
      fetchPaymentHistory()
      fetchSantriId()
      setShowForm(false)
      setShowIpaymuCheckout(false)
      setPaymentAmount('')
      setPaymentVia('Cash')
      setError(null)
    }
  }, [isOpen, idRegistrasi])

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
      const ok = window.confirm(
        `Nominal melebihi sisa kurang (Rp ${Number(totals.kurang || 0).toLocaleString('id-ID')}). Lanjutkan sebagai overpay?`
      )
      if (!ok) {
        setError(`Pembayaran tidak boleh melebihi sisa kurang (Rp ${Number(totals.kurang || 0).toLocaleString('id-ID')})`)
        return
      }
    }

    if (Number(totals.kurang || 0) <= 0 && Number(totals.wajib || 0) > 0) {
      const ok = window.confirm(
        `Registrasi sudah lunas (bayar Rp ${Number(totals.bayar || 0).toLocaleString('id-ID')}). Tetap tambah pembayaran?`
      )
      if (!ok) return
    }

    setSaving(true)
    try {
      if (!idRegistrasi || idRegistrasi <= 0) {
        setError('ID Registrasi tidak valid')
        return
      }

      if (!user?.nama) {
        setError('User information tidak lengkap. Silakan login ulang.')
        return
      }

      let hijriyah = null
      let masehi = null
      try {
        const tanggalData = await getTanggalFromAPI()
        hijriyah = tanggalData.hijriyah || null
        masehi = tanggalData.masehi || new Date().toISOString().split('T')[0]
      } catch (err) {
        console.error('Error fetching hijriyah date:', err)
        masehi = new Date().toISOString().split('T')[0]
      }

      const pc = navigator.platform || 'Unknown'
      const paymentData = {
        id_registrasi: parseInt(idRegistrasi) || 0,
        nominal: parseInt(amount) || 0,
        via: String(paymentVia || 'Cash'),
        hijriyah: hijriyah || null,
        masehi: masehi || null,
        id_admin: user?.id || user?.user_id || null,
        pc: String(pc || 'Unknown'),
        confirm_overpay: amount > Number(totals.kurang || 0) || Number(totals.kurang || 0) <= 0 ? 1 : 0,
      }

      if (!paymentData.id_registrasi || paymentData.id_registrasi <= 0) {
        setError('ID Registrasi tidak valid')
        return
      }

      if (!paymentData.nominal || paymentData.nominal <= 0) {
        setError('Nominal tidak valid')
        return
      }

      let result
      try {
        result = await pendaftaranAPI.createPaymentPsb(paymentData)
      } catch (err) {
        const body = err.response?.data
        const code = body?.code
        if (err.response?.status === 409 && (code === 'already_paid' || code === 'exceeds_kurang' || code === 'duplicate_recent')) {
          const ok = window.confirm((body?.message || 'Pembayaran berisiko ganda.') + '\n\nLanjutkan tetap?')
          if (!ok) {
            setError(body?.message || 'Dibatalkan')
            return
          }
          result = await pendaftaranAPI.createPaymentPsb({
            ...paymentData,
            confirm_overpay: 1,
            confirm_duplicate: code === 'duplicate_recent' ? 1 : 0,
          })
        } else {
          throw err
        }
      }

      if (result && result.success) {
        setShowForm(false)
        setPaymentAmount('')
        showNotification('Pembayaran berhasil disimpan', 'success')
        if (onPaymentSuccess) onPaymentSuccess()
        onClose()
      } else {
        const errorMessage = result?.message || result?.data?.message || 'Gagal menyimpan pembayaran'
        setError(errorMessage)
        showNotification(errorMessage, 'error')
      }
    } catch (err) {
      console.error('Error saving payment:', err)
      let errorMessage = 'Gagal menyimpan pembayaran'
      if (err.response) {
        errorMessage = err.response.data?.message || err.response.data?.error || errorMessage
      } else if (err.request) {
        errorMessage = 'Tidak ada response dari server. Periksa koneksi internet Anda.'
      } else {
        errorMessage = err.message || errorMessage
      }
      setError(errorMessage)
      showNotification(errorMessage, 'error')
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
      const result = await pendaftaranAPI.deleteTransaksi(deletePaymentId)
      
      if (result.success) {
        showNotification('Pembayaran berhasil dihapus', 'success')
        setShowDeleteModal(false)
        setDeletePaymentId(null)
        setDeletePaymentAmount(0)
        fetchPaymentHistory()
        if (onPaymentSuccess) onPaymentSuccess()
      } else {
        const msg = result.message || 'Gagal menghapus pembayaran'
        showNotification(msg, 'error')
        throw new Error(msg)
      }
    } catch (err) {
      console.error('Error deleting payment:', err)
      const errorMessage = err.response?.data?.message || err.message || 'Gagal menghapus pembayaran'
      showNotification(errorMessage, 'error')
      throw err
    } finally {
      setSaving(false)
    }
  }

  // Buka panel checkout iPayMu (pilih metode + kirim WA)
  const openIpaymuCheckout = async () => {
    if (totals.kurang <= 0) {
      showNotification('Pembayaran sudah lunas', 'info')
      return
    }
    setError(null)
    let namaPembayar = 'Pembayar Pendaftaran'
    let phone = ''
    let email = ''
    if (santriId) {
      try {
        const res = await santriAPI.getById(santriId)
        const data = res?.data ?? res
        if (data) {
          namaPembayar = (data.nama || data.nama_santri || namaPembayar).trim() || namaPembayar
          phone = (data.no_telpon || data.no_wa_santri || data.no_telpon_wali || '').toString().trim()
          email = (data.email || '').toString().trim()
        }
      } catch (err) {
        console.error('Error fetching biodata for iPayMu:', err)
      }
    }
    setIpaymuSantriContact({ name: namaPembayar, phone, email })
    setShowIpaymuCheckout(true)
  }

  const ipaymuCreateExtras = useMemo(
    () => ({
      jenis_pembayaran: 'Pendaftaran',
      id_registrasi: idRegistrasi || null,
      tabel_referensi: 'psb___registrasi',
      id_santri: santriId || null,
      defer_wa: true
    }),
    [idRegistrasi, santriId]
  )

  // Helper function untuk mendapatkan nomor dari jenis_berkas
  const getBuktiNumber = (berkas) => {
    if (berkas.jenis_berkas === 'Bukti Pembayaran') {
      return 1
    }
    const match = berkas.jenis_berkas.match(/\d+/)
    return match ? parseInt(match[0]) : 1
  }

  // Nomor bukti untuk upload (berikutnya)
  const nomorBuktiUpload = buktiPembayaranList.length + 1
  const baseJenisBerkasUpload = nomorBuktiUpload === 1 ? 'Bukti Pembayaran' : `Bukti TF ${nomorBuktiUpload}`
  const jenisBerkasUpload = (tahunAjaran || tahunAjaranMasehi)
    ? `${baseJenisBerkasUpload} (${[tahunAjaran, tahunAjaranMasehi].filter(Boolean).join(' / ')})`
    : baseJenisBerkasUpload

  const handleFileSelectBukti = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const maxSizeBytes = 1024 * 1024 // 1MB
    const isImage = /\.(jpg|jpeg|png|webp)$/i.test(file.name) || file.type?.startsWith('image/')
    if (isImage && file.size > maxSizeBytes) {
      try {
        const compressed = await compressImage(file, 1)
        setUploadSelectedFile(compressed)
      } catch (err) {
        showNotification('Gagal mengompresi gambar.', 'error')
      }
      return
    }
    if (!isImage && file.size > maxSizeBytes) {
      showNotification(`Maksimal 1MB. File: ${formatFileSize(file.size)}`, 'warning')
      return
    }
    setUploadSelectedFile(file)
  }

  const handleUploadBukti = async (e) => {
    e.preventDefault()
    if (!uploadSelectedFile || !santriId) {
      showNotification('Pilih file terlebih dahulu', 'warning')
      return
    }
    if (uploadSelectedFile.size > 1024 * 1024) {
      showNotification('Maksimal 1MB. Silakan compress terlebih dahulu.', 'warning')
      return
    }
    setUploadUploading(true)
    try {
      const result = await pendaftaranAPI.uploadBerkas(
        santriId,
        jenisBerkasUpload,
        uploadSelectedFile,
        uploadKeterangan || `Bukti transfer - Bukti ${nomorBuktiUpload}`
      )
      if (result.success) {
        showNotification(`Bukti TF ${nomorBuktiUpload} berhasil di-upload`, 'success')
        setUploadSelectedFile(null)
        setUploadKeterangan('')
        setShowUploadBuktiModal(false)
        onUploadBuktiSuccess?.()
      } else {
        showNotification(result.message || 'Gagal upload', 'error')
      }
    } catch (err) {
      showNotification('Gagal upload bukti', 'error')
    } finally {
      setUploadUploading(false)
    }
  }

  // Gabungkan data transaksi dengan bukti pembayaran yang menunggu verifikasi
  const combinedPaymentList = useMemo(() => {
    // Filter transaksi TF yang sudah diverifikasi dan urutkan berdasarkan tanggal (terlama dulu)
    const verifiedTfPayments = paymentHistory
      .filter(payment => payment.via === 'TF' || payment.via === 'Transfer')
      .sort((a, b) => {
        const dateA = a.tanggal_dibuat ? new Date(a.tanggal_dibuat) : new Date(0)
        const dateB = b.tanggal_dibuat ? new Date(b.tanggal_dibuat) : new Date(0)
        return dateA - dateB // Terlama dulu
      })
    const verifiedTfCount = verifiedTfPayments.length

    // Buat mapping: transaksi TF ke bukti TF berdasarkan urutan
    // Transaksi TF pertama (terlama) = bukti TF 1, dst
    const tfPaymentToBuktiMap = new Map()
    verifiedTfPayments.forEach((payment, index) => {
      if (index < buktiPembayaranList.length) {
        tfPaymentToBuktiMap.set(payment.id, buktiPembayaranList[index])
      }
    })

    // Buat set untuk tracking bukti yang sudah digunakan
    const usedBuktiIds = new Set()
    verifiedTfPayments.forEach((payment) => {
      const relatedBukti = tfPaymentToBuktiMap.get(payment.id)
      if (relatedBukti) {
        usedBuktiIds.add(relatedBukti.id)
      }
    })

    // Buat list gabungan
    const combined = []
    const usedPaymentIds = new Set() // Track payment IDs yang sudah ditambahkan
    
    // Tambahkan semua transaksi (termasuk yang bukan TF) - filter untuk unique id
    paymentHistory.forEach(payment => {
      // Skip jika id sudah digunakan (untuk menghindari duplikasi)
      if (usedPaymentIds.has(payment.id)) {
        return
      }
      
      usedPaymentIds.add(payment.id)
      
      // Jika transaksi TF, cari bukti TF yang sesuai
      let relatedBukti = null
      if (payment.via === 'TF' || payment.via === 'Transfer') {
        relatedBukti = tfPaymentToBuktiMap.get(payment.id)
      }
      
      combined.push({
        ...payment,
        type: 'verified',
        isVerified: true,
        relatedBukti: relatedBukti // Simpan bukti yang terkait untuk preview
      })
    })

    // Tambahkan bukti pembayaran yang belum diverifikasi (belum ada di transaksi)
    buktiPembayaranList.forEach(bukti => {
      // Jika bukti belum digunakan (tidak ada di transaksi), tampilkan sebagai menunggu verifikasi
      if (!usedBuktiIds.has(bukti.id)) {
        const nomorBukti = getBuktiNumber(bukti)
        combined.push({
          id: `bukti-${bukti.id}`,
          type: 'pending',
          isVerified: false,
          bukti: bukti,
          nominal: 0, // Belum ada nominal karena belum diverifikasi
          via: 'TF',
          hijriyah: null,
          masehi: bukti.tanggal_upload || bukti.tanggal_dibuat,
          tanggal_dibuat: bukti.tanggal_upload || bukti.tanggal_dibuat,
          admin: null,
          nomorBukti: nomorBukti
        })
      }
    })

    // Sort berdasarkan tanggal (terbaru dulu)
    combined.sort((a, b) => {
      const dateA = a.tanggal_dibuat ? new Date(a.tanggal_dibuat) : new Date(0)
      const dateB = b.tanggal_dibuat ? new Date(b.tanggal_dibuat) : new Date(0)
      return dateB - dateA
    })

    return combined
  }, [paymentHistory, buktiPembayaranList])

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

  const offcanvasTransition = { type: 'tween', duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }

  const offcanvasContent = (
    <AnimatePresence mode="wait">
      {isOpen && (
        <motion.div
          key="pembayaran-offcanvas-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onClose}
          className="fixed inset-0 bg-black bg-opacity-50 z-40"
        />
      )}
      {isOpen && (
        <motion.div
          key="pembayaran-offcanvas-panel"
          initial={{ y: '100%', opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: '100%', opacity: 0 }}
          transition={offcanvasTransition}
          className="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 rounded-t-2xl shadow-[0_-10px_25px_-5px_rgba(0,0,0,0.1)] overflow-hidden"
          style={{ 
            zIndex: 101,
            paddingBottom: 'env(safe-area-inset-bottom, 0)'
          }}
        >
            <div className="md:grid md:grid-cols-2 max-h-[calc(100vh-8rem)] sm:max-h-[calc(100vh-7rem)]">
              {/* Kolom Gambar */}
              <div className="hidden md:block relative">
                <img src={getGambarUrl('/icon-2.png')} alt="Gedung Pesantren" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-teal-800 bg-opacity-50"></div>
              </div>

              {/* Kolom Konten Pembayaran */}
              <div className="p-6 h-full flex flex-col pb-20 sm:pb-6">
                {/* Offcanvas Header */}
                <div className="flex justify-between items-center mb-4 border-b border-gray-200 dark:border-gray-700 pb-3">
                  <h2 className="text-xl font-semibold text-teal-600 dark:text-teal-400">Detail Pembayaran PSB</h2>
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
                  {/* Info */}
                  <div className="mb-4">
                    <p className="text-lg font-medium text-gray-800 dark:text-gray-200">Pembayaran Pendaftaran</p>
                    <div className="flex justify-between text-sm mt-2">
                      <span className="text-gray-600 dark:text-gray-400">
                        Wajib: <strong className="text-blue-600 dark:text-blue-400">Rp {totals.total.toLocaleString('id-ID')}</strong>
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
                        <p className="text-xs text-gray-500 dark:text-gray-400 text-center">Memuat riwayat pembayaran...</p>
                      ) : combinedPaymentList.length === 0 ? (
                        <p className="text-xs text-gray-500 dark:text-gray-400 text-center">Tidak ada riwayat pembayaran.</p>
                      ) : (
                        combinedPaymentList.map((payment) => {
                          const paymentAmount = parseInt(payment.nominal || 0) || 0
                          const hijriyahStr = payment.hijriyah || '-'
                          // Gunakan masehi jika ada, jika tidak gunakan tanggal_dibuat
                          const masehiStr = payment.masehi 
                            ? new Date(payment.masehi).toLocaleDateString('id-ID')
                            : (payment.tanggal_dibuat 
                              ? new Date(payment.tanggal_dibuat).toLocaleDateString('id-ID')
                              : '-')
                          const via = payment.via || 'Cash'
                          const viaColor = getViaColor(via)
                          const isPending = payment.type === 'pending'
                          
                          // Tentukan apakah bisa diklik (untuk preview bukti)
                          const canClick = (isPending && payment.bukti) || (!isPending && payment.relatedBukti)
                          const handleClick = canClick && onPreviewBukti ? () => {
                            const buktiToPreview = isPending ? payment.bukti : payment.relatedBukti
                            if (buktiToPreview) {
                              onPreviewBukti(buktiToPreview)
                            }
                          } : undefined
                          
                          return (
                            <div 
                              key={payment.id} 
                              className={`p-2 rounded-md border text-xs ${
                                canClick 
                                  ? 'cursor-pointer transition-colors ' + (isPending 
                                    ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800 hover:bg-yellow-100 dark:hover:bg-yellow-900/30' 
                                    : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50')
                                  : (isPending 
                                    ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800' 
                                    : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700')
                              }`}
                              onClick={handleClick}
                              title={canClick ? 'Klik untuk melihat bukti TF' : ''}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <span
                                  className="inline-block min-w-[48px] text-center px-2 py-0.5 rounded text-white text-[10px] font-semibold mt-1"
                                  style={{ background: viaColor }}
                                >
                                  {via}
                                </span>
                                <span className="flex-1 text-center font-semibold text-teal-700 dark:text-teal-400 text-base mt-1">
                                  {isPending ? (
                                    <span className="text-yellow-700 dark:text-yellow-400">Bukti TF {payment.nomorBukti}</span>
                                  ) : (
                                    `Rp ${isNaN(paymentAmount) ? '-' : paymentAmount.toLocaleString('id-ID')}`
                                  )}
                                </span>
                                <div className="flex flex-col items-end justify-center flex-1 min-w-[70px]">
                                  {masehiStr && masehiStr !== '-' && (
                                    <span className="text-gray-500 dark:text-gray-400 leading-tight">{masehiStr}</span>
                                  )}
                                  {hijriyahStr && hijriyahStr !== '-' && (
                                    <span className="text-gray-500 dark:text-gray-400 leading-tight text-[10px]">{hijriyahStr}</span>
                                  )}
                                </div>
                                {!isPending && canKelolaPembayaran && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      handleDeletePayment(payment.id, paymentAmount)
                                    }}
                                    className="text-red-400 hover:text-red-600 p-1 rounded-full inline-flex items-center justify-center transition-colors ml-2 mt-0.5 self-start"
                                    title="Hapus pembayaran"
                                  >
                                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                      <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z" clipRule="evenodd"></path>
                                    </svg>
                                  </button>
                                )}
                              </div>
                              {isPending ? (
                                <div className="text-yellow-700 dark:text-yellow-400 mt-1 text-[10px] font-medium">
                                  Belum di Verifikasi
                                </div>
                              ) : (
                                <div className="text-gray-600 dark:text-gray-400 mt-1">
                                  Oleh: <span className="font-medium">{payment.admin || '-'}</span>
                                </div>
                              )}
                            </div>
                          )
                        })
                      )}
                    </div>
                  </div>
                </div>

                {/* Tambah/hapus pembayaran — butuh izin fitur */}
                <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                  {!canKelolaPembayaran && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 text-center mb-2">
                      Anda hanya dapat melihat riwayat. Hubungi admin untuk menambah atau menghapus pembayaran.
                    </p>
                  )}
                  <AnimatePresence mode="wait">
                    {canKelolaPembayaran && showForm ? (
                      <motion.div
                        key="form"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
                        className="overflow-hidden"
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
                  {canKelolaPembayaran && totals.kurang > 0 && !showForm && !showIpaymuCheckout && (
                    <div className="space-y-2">
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
                          onClick={openIpaymuCheckout}
                          className="bg-teal-600 text-white p-2 rounded-lg hover:bg-teal-700 font-semibold text-sm flex items-center justify-center gap-1"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                          </svg>
                          Bayar dengan iPayMu
                        </button>
                      </div>
                      <button
                        onClick={() => setShowForm(true)}
                        className="w-full bg-blue-500 text-white p-2 rounded-lg hover:bg-blue-600 font-semibold"
                      >
                        Tambah Pembayaran Manual
                      </button>
                    </div>
                  )}
                  {canKelolaPembayaran && showIpaymuCheckout && totals.kurang > 0 && (
                    <IpaymuStaffCheckout
                      key={`ipaymu-psb-${idRegistrasi}-${ipaymuSantriContact.phone}-${totals.kurang}`}
                      amount={totals.kurang}
                      name={ipaymuSantriContact.name}
                      initialPhone={ipaymuSantriContact.phone}
                      initialEmail={ipaymuSantriContact.email}
                      createExtras={ipaymuCreateExtras}
                      onCreated={() => {
                        setTimeout(() => {
                          fetchPaymentHistory()
                          if (onPaymentSuccess) onPaymentSuccess()
                        }, 1500)
                      }}
                      onClose={() => setShowIpaymuCheckout(false)}
                    />
                  )}
                </div>
              </div>
            </div>

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
            title="Konfirmasi hapus pembayaran PSB"
          />

          {/* Upload Bukti TF Modal - form upload di offcanvas (sama seperti aplikasi daftar) */}
          <AnimatePresence>
            {showUploadBuktiModal && (
              <>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => {
                    setShowUploadBuktiModal(false)
                    setUploadSelectedFile(null)
                    setUploadKeterangan('')
                  }}
                  className="fixed inset-0 bg-black bg-opacity-50 z-[110]"
                />
                <motion.div
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.9, opacity: 0 }}
                  className="fixed inset-0 z-[110] flex items-center justify-center p-4 overflow-y-auto"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-6 my-4">
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                        Upload Bukti TF {nomorBuktiUpload}
                      </h3>
                      <button
                        onClick={() => {
                          setShowUploadBuktiModal(false)
                          setUploadSelectedFile(null)
                          setUploadKeterangan('')
                        }}
                        className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                      >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                        </svg>
                      </button>
                    </div>
                    {!santriId ? (
                      <p className="text-sm text-gray-500 dark:text-gray-400">Memuat data santri...</p>
                    ) : (
                      <form onSubmit={handleUploadBukti} className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Pilih File
                          </label>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                            Maksimal 1MB. Foto otomatis dikompres jika lebih besar.
                          </p>
                          <input
                            type="file"
                            onChange={handleFileSelectBukti}
                            accept=".jpg,.jpeg,.png,.gif,.webp,.pdf"
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-teal-500"
                          />
                          {uploadSelectedFile && (
                            <div className={`mt-2 p-3 rounded-lg ${uploadSelectedFile.size > 1024 * 1024 ? 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800' : 'bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-800'}`}>
                              <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{uploadSelectedFile.name}</p>
                              <p className="text-xs text-gray-600 dark:text-gray-400">{formatFileSize(uploadSelectedFile.size)}</p>
                              {uploadSelectedFile.size > 1024 * 1024 && (
                                <p className="text-xs text-red-600 dark:text-red-400 mt-1">Maksimal 1MB. Silakan pilih file lain.</p>
                              )}
                            </div>
                          )}
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Keterangan (Optional)
                          </label>
                          <textarea
                            value={uploadKeterangan}
                            onChange={(e) => setUploadKeterangan(e.target.value)}
                            rows={2}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-teal-500"
                            placeholder="Tanggal transfer, jumlah transfer, dll."
                          />
                        </div>
                        <button
                          type="submit"
                          disabled={uploadUploading || !uploadSelectedFile || (uploadSelectedFile && uploadSelectedFile.size > 1024 * 1024)}
                          className={`w-full py-2.5 px-4 rounded-lg font-medium transition-colors ${
                            uploadUploading || !uploadSelectedFile || (uploadSelectedFile && uploadSelectedFile.size > 1024 * 1024)
                              ? 'bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed'
                              : 'bg-teal-500 hover:bg-teal-600 text-white'
                          }`}
                        >
                          {uploadUploading ? (
                            <span className="flex items-center justify-center gap-2">
                              <span className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                              Mengupload...
                            </span>
                          ) : (
                            'Upload Bukti Pembayaran'
                          )}
                        </button>
                      </form>
                    )}
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  )

  return createPortal(offcanvasContent, document.body)
}

export default PembayaranOffcanvas

