import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { createPortal } from 'react-dom'
import { paymentTransactionAPI, profilAPI } from '../../services/api'
import { BankIcon, CStoreIcon, QRISIcon } from './PaymentIcons'
import { getGambarUrl } from '../../config/images'

function getQrImageSrc(qrCode) {
  if (!qrCode || typeof qrCode !== 'string') return null
  const s = qrCode.trim()
  if (!s) return null
  if (s.startsWith('data:image') || s.startsWith('http://') || s.startsWith('https://')) return s
  if ((s.includes('+') || s.includes('/') || s.endsWith('=')) && /^[A-Za-z0-9+/=]+$/.test(s) && s.length > 200) {
    return `data:image/png;base64,${s}`
  }
  return `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(s)}`
}

const VA_CHANNELS = [
  { value: 'bca', label: 'VA BCA' }, { value: 'bni', label: 'VA BNI' }, { value: 'bri', label: 'VA BRI' },
  { value: 'mandiri', label: 'VA Mandiri' }, { value: 'permata', label: 'VA Permata' },
  { value: 'cimb', label: 'VA Cimb Niaga' }, { value: 'danamon', label: 'VA DANAMON' },
  { value: 'bag', label: 'VA BAG' }, { value: 'btn', label: 'VA BTN' }, { value: 'bsi', label: 'VA BSI' }, { value: 'muamalat', label: 'VA Muamalat' },
]
const CSTORE_CHANNELS = [
  { value: 'alfamart', label: 'Alfamart' },
  { value: 'indomaret', label: 'Indomaret' },
]

export default function BayarOffcanvas({
  isOpen,
  onClose,
  title = 'Bayar dengan iPayMu',
  jenisPembayaran = 'Pendaftaran',
  idSantri,
  idReferensi,
  tabelReferensi = 'psb___registrasi',
  idRegistrasi = null,
  wajib = 0,
  kurang = 0,
  onSuccess,
  onNotify = (msg, type) => { if (type === 'error') window.alert(msg) },
}) {
  const [ipaymuAmount, setIpaymuAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('')
  const [paymentChannel, setPaymentChannel] = useState('')
  const [vaInfo, setVaInfo] = useState(null)
  const [openAccordion, setOpenAccordion] = useState(null)
  const [ipaymuStep, setIpaymuStep] = useState(1)
  const [stepDirection, setStepDirection] = useState(1)
  const [transactionStatus, setTransactionStatus] = useState(null)
  const [processingIPaymu, setProcessingIPaymu] = useState(false)
  const [isCheckingStatus, setIsCheckingStatus] = useState(false)
  const [countdownRemaining, setCountdownRemaining] = useState(null)
  const [isSandboxMode, setIsSandboxMode] = useState(false)
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [isCancelling, setIsCancelling] = useState(false)
  const [successCountdown, setSuccessCountdown] = useState(null) // 4, 3, 2, 1 lalu tutup
  const paymentResolvedRef = useRef(false)
  const paymentSubmitLockRef = useRef(false)

  const isPendaftaran = jenisPembayaran === 'Pendaftaran'
  const idReg = idRegistrasi ?? (isPendaftaran ? idReferensi : null)

  useEffect(() => {
    if (isOpen && ipaymuStep === 1 && !vaInfo) {
      setIpaymuAmount('')
      setPaymentMethod('')
      setPaymentChannel('')
      setOpenAccordion(null)
      setVaInfo(null)
      setTransactionStatus(null)
      paymentResolvedRef.current = false
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    // Untuk Pendaftaran: filter by id_registrasi; untuk UWABA/Khusus/Tunggakan: filter by id_referensi + tabel_referensi agar yang muncul transaksi untuk referensi yang dipilih
    const hasPendingFilter = (isPendaftaran && idReg && idSantri) || (!isPendaftaran && idSantri && (idReferensi != null || tabelReferensi != null))
    if (hasPendingFilter) {
      setProcessingIPaymu(true)
      paymentTransactionAPI.getPendingTransaction(idReg ?? null, idSantri, idReferensi ?? null, tabelReferensi ?? null)
        .then((res) => {
          if (res?.success && res?.data) {
            const t = res.data
            let bankName = 'Bank'
            if (t.payment_method === 'va' && t.payment_channel) {
              const ch = VA_CHANNELS.find(c => c.value === t.payment_channel)
              bankName = ch ? ch.label : t.payment_channel
            } else if (t.payment_method === 'cstore' && t.payment_channel) {
              const ch = CSTORE_CHANNELS.find(c => c.value === t.payment_channel)
              bankName = ch ? ch.label : t.payment_channel
            } else if (t.payment_method === 'qris') bankName = 'QRIS'
            let qrCode = t.qr_code || null
            if (!qrCode && t.response_data) {
              try {
                const rd = typeof t.response_data === 'string' ? JSON.parse(t.response_data) : t.response_data
                const inner = rd.Data || rd.data || rd
                qrCode = inner.QRCode || inner.qr_code || inner.qrCode || null
              } catch (_) {}
            }
            const expiredAt = t.expired_at ? new Date(t.expired_at).getTime() : (Date.now() + 24 * 60 * 60 * 1000)
            setVaInfo({
              va_number: t.va_number || null,
              bank: bankName,
              payment_method: t.payment_method || null,
              payment_channel: t.payment_channel || null,
              amount: t.amount ?? 0,
              admin_fee: t.admin_fee ?? 0,
              total: t.total ?? t.amount ?? 0,
              payment_url: t.payment_url || null,
              qr_code: qrCode,
              session_id: t.session_id || null,
              transaction_id: t.id ?? t.trx_id ?? null,
              expired_at: expiredAt,
            })
            setTransactionStatus(t.status || 'pending')
            setIpaymuStep(3)
            onNotify('Menampilkan transaksi pembayaran yang sudah ada', 'info')
          }
        })
        .catch(() => {})
        .finally(() => setProcessingIPaymu(false))
    }
    paymentTransactionAPI.getMode().then((r) => {
      if (r?.success && r?.data?.is_sandbox) setIsSandboxMode(true)
      else setIsSandboxMode(false)
    }).catch(() => setIsSandboxMode(false))
  }, [isOpen, isPendaftaran, idReg, idSantri])

  useEffect(() => {
    if (!vaInfo?.expired_at || !['pending', null, undefined].includes(transactionStatus)) {
      setCountdownRemaining(null)
      return
    }
    const tick = () => {
      const remaining = Math.max(0, Math.floor((vaInfo.expired_at - Date.now()) / 1000))
      setCountdownRemaining(remaining)
    }
    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [vaInfo?.expired_at, transactionStatus])

  // Hitung mundur 4 detik saat pembayaran sukses, lalu tutup offcanvas
  const isSuccess = transactionStatus === 'paid' || transactionStatus === 'success'
  useEffect(() => {
    if (!vaInfo || !isSuccess) return
    setSuccessCountdown(4)
    const id = setInterval(() => {
      setSuccessCountdown((prev) => {
        if (prev === null) return 4
        if (prev <= 1) {
          onSuccess?.()
          setVaInfo(null)
          setTransactionStatus(null)
          setSuccessCountdown(null)
          goToStep(1)
          onClose()
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(id)
  }, [vaInfo, isSuccess])

  useEffect(() => {
    if (!vaInfo?.session_id || !isOpen) return
    paymentResolvedRef.current = false
    let mounted = true
    const check = async () => {
      if (!mounted || paymentResolvedRef.current) return
      try {
        const r = await paymentTransactionAPI.checkStatus(vaInfo.session_id)
        if (!mounted || paymentResolvedRef.current) return
        if (!r?.success || !r.data) return
        const s = String(r.data.status || '').toLowerCase().trim()
        setTransactionStatus(r.data.status)
        if (s === 'paid' || s === 'success') {
          paymentResolvedRef.current = true
          onNotify('Pembayaran berhasil!', 'success')
          setSuccessCountdown(4)
        } else if (['expired', 'cancelled', 'failed'].includes(s)) {
          paymentResolvedRef.current = true
          setVaInfo(null)
          setTransactionStatus(null)
        }
      } catch (_) {}
    }
    const t = setTimeout(check, 1000)
    const id = setInterval(check, 5000)
    return () => { mounted = false; clearTimeout(t); clearInterval(id) }
  }, [vaInfo?.session_id, isOpen])

  const goToStep = (step) => {
    setIpaymuStep(step)
  }

  const handleAmountInput = (e) => {
    const value = e.target.value.replace(/\D/g, '')
    setIpaymuAmount(new Intl.NumberFormat('id-ID').format(value))
  }

  const handleAccordionToggle = (method) => {
    if (openAccordion === method) {
      setOpenAccordion(null)
      setPaymentMethod('')
      setPaymentChannel('')
    } else {
      setOpenAccordion(method)
      setPaymentMethod(method)
      setPaymentChannel('')
    }
  }

  const handleChannelSelect = (ch) => {
    setPaymentChannel(ch)
  }

  const handleIPaymuPayment = async () => {
    if (paymentSubmitLockRef.current) return
    paymentSubmitLockRef.current = true
    setProcessingIPaymu(true)

    const amount = parseFloat(ipaymuAmount.replace(/\./g, '')) || 0
    const minAmount = 20000
    if (!amount || amount <= 0) {
      onNotify('Masukkan nominal pembayaran', 'error')
      paymentSubmitLockRef.current = false
      setProcessingIPaymu(false)
      return
    }
    if (amount < minAmount) {
      onNotify(`Minimal pembayaran Rp ${minAmount.toLocaleString('id-ID')}`, 'error')
      paymentSubmitLockRef.current = false
      setProcessingIPaymu(false)
      return
    }
    if (kurang > 0 && amount > kurang) {
      onNotify(`Tidak boleh melebihi sisa kurang Rp ${kurang.toLocaleString('id-ID')}`, 'error')
      paymentSubmitLockRef.current = false
      setProcessingIPaymu(false)
      return
    }
    if (!paymentMethod) {
      onNotify('Pilih metode pembayaran terlebih dahulu', 'error')
      paymentSubmitLockRef.current = false
      setProcessingIPaymu(false)
      return
    }
    if (paymentMethod === 'va' && !paymentChannel) {
      onNotify('Pilih bank untuk Virtual Account', 'error')
      paymentSubmitLockRef.current = false
      setProcessingIPaymu(false)
      return
    }
    if (paymentMethod === 'cstore' && !paymentChannel) {
      onNotify('Pilih merchant untuk Convenience Store', 'error')
      paymentSubmitLockRef.current = false
      setProcessingIPaymu(false)
      return
    }

    let nama = 'Pembayar'
    let phone = ''
    let email = 'alutsmani@gmail.com'
    try {
      const biodata = await profilAPI.getBiodata()
      if (biodata?.success && biodata?.data) {
        const d = biodata.data
        nama = d.nama || nama
        phone = d.no_wa_santri || d.no_telpon || d.no_wa || ''
        email = d.email || email
      }
    } catch (_) {}
    if (!phone || !phone.trim()) {
      onNotify('Nomor telepon/WA belum diisi. Lengkapi biodata di halaman Profil.', 'error')
      paymentSubmitLockRef.current = false
      setProcessingIPaymu(false)
      return
    }

    try {
      const paymentData = {
        amount,
        name: nama,
        phone: phone.trim(),
        email: email.trim() || 'alutsmani@gmail.com',
        payment_method: paymentMethod,
        reference_id: `PAY-${jenisPembayaran}-${Date.now()}-${idSantri || idReferensi || 'X'}`,
        jenis_pembayaran: jenisPembayaran,
        id_referensi: idReferensi ?? null,
        tabel_referensi: tabelReferensi,
        id_santri: idSantri ?? null,
      }
      if (isPendaftaran && idReg) paymentData.id_registrasi = idReg
      if (paymentChannel) paymentData.payment_channel = paymentChannel
      // UWABA: sertakan tahun_ajaran (format 1447-1448) agar payment & uwaba___bayar konsisten dengan kolom tahun_ajaran
      if (tabelReferensi === 'uwaba___bayar' && idReferensi) paymentData.tahun_ajaran = idReferensi

      const result = await paymentTransactionAPI.createTransaction(paymentData)
      if (!result?.success || !result?.data) throw new Error(result?.message || 'Gagal membuat transaksi')

      const rd = result.data
      const inner = rd.Data || rd.data || rd
      const finalVa = inner.PaymentNo || inner.paymentNo || inner.payment_no || rd.va_number || null
      const finalQr = inner.QRCode || inner.qr_code || inner.qrCode || rd.qr_code || null
      const sessionId = rd.session_id || inner.SessionId || inner.sessionId || null
      const txId = rd.transaction_id || rd.id || inner.TransactionId || null
      let bankName = 'Bank'
      if (paymentMethod === 'va' && paymentChannel) {
        const ch = VA_CHANNELS.find(c => c.value === paymentChannel)
        bankName = ch ? ch.label : paymentChannel
      } else if (paymentMethod === 'cstore' && paymentChannel) {
        const ch = CSTORE_CHANNELS.find(c => c.value === paymentChannel)
        bankName = ch ? ch.label : paymentChannel
      } else if (paymentMethod === 'qris') bankName = 'QRIS'

      setVaInfo({
        va_number: finalVa,
        bank: bankName,
        payment_method: paymentMethod,
        payment_channel: paymentChannel || null,
        amount,
        admin_fee: rd.admin_fee ?? 0,
        total: rd.total ?? amount,
        payment_url: rd.payment_url || null,
        qr_code: finalQr,
        session_id: sessionId,
        transaction_id: txId,
        expired_at: Date.now() + 24 * 60 * 60 * 1000,
      })
      setTransactionStatus('pending')
      setStepDirection(1)
      goToStep(3)
      onNotify('Pembayaran berhasil dibuat', 'success')
      if (rd.payment_url) window.open(rd.payment_url, '_blank')
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Gagal membuat pembayaran iPayMu'
      onNotify(msg, 'error')
      setVaInfo(null)
    } finally {
      paymentSubmitLockRef.current = false
      setProcessingIPaymu(false)
    }
  }

  const handleCancelTransaction = async () => {
    if (!vaInfo?.transaction_id || isCancelling) return
    setIsCancelling(true)
    try {
      const r = await paymentTransactionAPI.cancelTransaction(vaInfo.transaction_id)
      const ok = r?.success || r?.data?.status === 'cancelled'
      if (ok) {
        onNotify('Transaksi berhasil dibatalkan', 'success')
        setShowCancelModal(false)
        setVaInfo(null)
        setTransactionStatus(null)
        goToStep(1)
      } else {
        onNotify(r?.message || 'Gagal membatalkan transaksi', 'error')
      }
    } catch (err) {
      onNotify(err.response?.data?.message || 'Gagal membatalkan', 'error')
    } finally {
      setIsCancelling(false)
    }
  }

  const handleClose = () => {
    if (vaInfo && ipaymuStep === 3) {
      setVaInfo(null)
      setTransactionStatus(null)
      goToStep(1)
    } else {
      onClose()
    }
  }

  if (!isOpen) return null

  const content = (
    <AnimatePresence>
      <motion.div
        key="bayar-offcanvas-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 z-100"
        onClick={handleClose}
      />
      <motion.div
        key="bayar-offcanvas-panel"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        className="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 rounded-t-2xl shadow-2xl z-101 flex flex-col"
        style={{ height: 'calc(100vh - 64px)', maxHeight: 'calc(100vh - 64px)', paddingBottom: 'env(safe-area-inset-bottom, 0)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col md:grid md:grid-cols-2 md:grid-rows-1 flex-1 min-h-0 overflow-hidden" style={{ minHeight: 0 }}>
          <div className="hidden md:block relative overflow-hidden" style={{ minHeight: 200 }}>
            <img src={getGambarUrl('/icon-2.png')} alt="" className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-teal-800/50" />
          </div>
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 shrink-0">
              <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
                {vaInfo ? 'Informasi Pembayaran' : title}
              </h2>
              <button type="button" onClick={handleClose} className="p-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-4 space-y-4">
              {isSandboxMode && (
                <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg text-xs text-amber-800 dark:text-amber-200">
                  Mode Sandbox iPayMu. Transaksi tidak memproses pembayaran sebenarnya.
                </div>
              )}

              {!vaInfo && (
                <div className="flex items-center justify-center gap-1 text-xs text-gray-500 dark:text-gray-400 mb-2">
                  <div className={ipaymuStep >= 1 ? 'text-teal-600' : ''}><span className="inline-flex w-6 h-6 items-center justify-center rounded-full bg-gray-200 dark:bg-gray-700 font-semibold">{ipaymuStep > 1 ? '✓' : '1'}</span> Nominal</div>
                  <div className="h-0.5 w-8 bg-gray-300 dark:bg-gray-600" />
                  <div className={ipaymuStep >= 2 ? 'text-teal-600' : ''}><span className="inline-flex w-6 h-6 items-center justify-center rounded-full bg-gray-200 dark:bg-gray-700 font-semibold">{ipaymuStep > 2 ? '✓' : '2'}</span> Metode</div>
                  <div className="h-0.5 w-8 bg-gray-300 dark:bg-gray-600" />
                  <div className={ipaymuStep >= 3 ? 'text-teal-600' : ''}><span className="inline-flex w-6 h-6 items-center justify-center rounded-full bg-gray-200 dark:bg-gray-700 font-semibold">3</span> Bayar</div>
                </div>
              )}

              {!vaInfo && ipaymuStep === 1 && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
                  <div>
                    <h4 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-2">Mau Bayar Berapa?</h4>
                    {kurang > 0 && <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">Sisa kurang: <strong className="text-amber-600">Rp {kurang.toLocaleString('id-ID')}</strong></p>}
                    <p className="text-xs text-gray-500 mb-2">Minimal: Rp 20.000</p>
                  </div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Jumlah Pembayaran</label>
                  <input
                    type="text"
                    value={ipaymuAmount}
                    onChange={handleAmountInput}
                    placeholder="Masukkan nominal"
                    className="w-full p-3 border-2 border-gray-300 dark:border-gray-600 rounded-lg focus:border-teal-500 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100 text-right font-mono text-lg"
                  />
                </motion.div>
              )}

              {!vaInfo && ipaymuStep === 2 && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
                  <h4 className="text-base font-semibold text-gray-900 dark:text-gray-100">Pilih Metode Pembayaran</h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Nominal: <strong className="text-teal-600">Rp {ipaymuAmount || '0'}</strong></p>
                  <div className="border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden">
                    <button type="button" onClick={() => handleAccordionToggle('va')} className="w-full px-4 py-3 flex items-center justify-between bg-white dark:bg-gray-700/50">
                      <div className="flex items-center gap-2"><BankIcon bank="bca" className="h-7" /><span className="font-medium">Virtual Account (VA)</span></div>
                      <svg className={`w-5 h-5 transition-transform ${openAccordion === 'va' ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
                    </button>
                    {openAccordion === 'va' && (
                      <div className="p-3 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-200 dark:border-gray-600 flex flex-col gap-2">
                        {VA_CHANNELS.map((ch) => (
                          <button key={ch.value} type="button" onClick={() => handleChannelSelect(ch.value)} className={`px-3 py-2.5 text-sm rounded-lg border-2 flex items-center gap-3 w-full text-left ${paymentChannel === ch.value ? 'border-teal-500 bg-teal-50 dark:bg-teal-900/20' : 'border-gray-300 dark:border-gray-600'}`}>
                            {paymentChannel === ch.value ? <span className="w-5 h-5 rounded-full bg-teal-500 text-white flex items-center justify-center">✓</span> : <span className="w-5 h-5 rounded-full border-2 border-gray-400" />}
                            <span className="flex-1 font-medium">{ch.label}</span>
                            <BankIcon bank={ch.value} className="h-8" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden">
                    <button type="button" onClick={() => handleAccordionToggle('qris')} className="w-full px-4 py-3 flex items-center justify-between bg-white dark:bg-gray-700/50">
                      <div className="flex items-center gap-2"><QRISIcon className="h-7" /><span className="font-medium">QRIS</span></div>
                      <svg className={`w-5 h-5 transition-transform ${openAccordion === 'qris' ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
                    </button>
                    {openAccordion === 'qris' && (
                      <div className="p-3 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-200 dark:border-gray-600 space-y-2">
                        <p className="text-sm text-gray-600 dark:text-gray-400">Scan QR untuk bayar (Dana, GoPay, OVO, dll.)</p>
                        <div className="flex flex-wrap items-center gap-3">
                          <img src={getGambarUrl('/logo/dana.png')} alt="Dana" className="h-9 w-auto max-w-[90px] object-contain object-center" />
                          <img src={getGambarUrl('/logo/gopay.png')} alt="GoPay" className="h-9 w-auto max-w-[90px] object-contain object-center" />
                          <img src={getGambarUrl('/logo/shopee-pay.png')} alt="ShopeePay" className="h-9 w-auto max-w-[90px] object-contain object-center" />
                          <img src={getGambarUrl('/logo/ovo.png')} alt="OVO" className="h-9 w-auto max-w-[90px] object-contain object-center" />
                        </div>
                        {paymentMethod === 'qris' && <p className="text-xs text-teal-600 mt-1">✓ QRIS dipilih</p>}
                      </div>
                    )}
                  </div>
                  <div className="border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden">
                    <button type="button" onClick={() => handleAccordionToggle('cstore')} className="w-full px-4 py-3 flex items-center justify-between bg-white dark:bg-gray-700/50">
                      <div className="flex items-center gap-2"><CStoreIcon store="alfamart" className="h-7" /><span className="font-medium">Convenience Store</span></div>
                      <svg className={`w-5 h-5 transition-transform ${openAccordion === 'cstore' ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
                    </button>
                    {openAccordion === 'cstore' && (
                      <div className="p-3 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-200 dark:border-gray-600 flex flex-col gap-2">
                        {CSTORE_CHANNELS.map((ch) => (
                          <button key={ch.value} type="button" onClick={() => handleChannelSelect(ch.value)} className={`px-3 py-2.5 text-sm rounded-lg border-2 flex items-center gap-3 w-full text-left ${paymentChannel === ch.value ? 'border-teal-500 bg-teal-50 dark:bg-teal-900/20' : 'border-gray-300 dark:border-gray-600'}`}>
                            {paymentChannel === ch.value ? <span className="w-5 h-5 rounded-full bg-teal-500 text-white flex items-center justify-center">✓</span> : <span className="w-5 h-5 rounded-full border-2 border-gray-400" />}
                            <span className="flex-1 font-medium">{ch.label}</span>
                            <CStoreIcon store={ch.value} className="h-8" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </motion.div>
              )}

              {vaInfo && (transactionStatus === 'paid' || transactionStatus === 'success') && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.25 }}
                  className="text-center py-8"
                >
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 260, damping: 20 }}
                    className="w-20 h-20 rounded-full bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center mx-auto mb-5 ring-4 ring-emerald-200/50 dark:ring-emerald-800/50"
                  >
                    <motion.svg
                      initial={{ pathLength: 0 }}
                      animate={{ pathLength: 1 }}
                      transition={{ delay: 0.2, duration: 0.4 }}
                      className="w-10 h-10 text-emerald-600 dark:text-emerald-400"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2.5}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      viewBox="0 0 24 24"
                    >
                      <motion.path d="M5 13l4 4L19 7" />
                    </motion.svg>
                  </motion.div>
                  <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Pembayaran Sukses</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Transaksi berhasil diproses.</p>
                  {successCountdown !== null && successCountdown > 0 && (
                    <p className="text-sm text-teal-600 dark:text-teal-400 mt-3 font-medium">
                      Menutup dalam {successCountdown} detik...
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={() => { setVaInfo(null); setTransactionStatus(null); setSuccessCountdown(null); goToStep(1); onSuccess?.(); onClose() }}
                    className="mt-4 px-4 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-medium"
                  >
                    Tutup sekarang
                  </button>
                </motion.div>
              )}

              {vaInfo && transactionStatus !== 'paid' && transactionStatus !== 'success' && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
                  <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="font-semibold text-blue-700 dark:text-blue-300">Menunggu Pembayaran</div>
                        {countdownRemaining != null && <div className="text-sm font-mono text-blue-600 dark:text-blue-400 mt-1">Kadaluwarsa: {Math.floor(countdownRemaining / 3600)}:{String(Math.floor((countdownRemaining % 3600) / 60)).padStart(2, '0')}:{String(countdownRemaining % 60).padStart(2, '0')}</div>}
                      </div>
                      {vaInfo.session_id && (
                        <button type="button" onClick={async () => { setIsCheckingStatus(true); try { const r = await paymentTransactionAPI.checkStatus(vaInfo.session_id); if (r?.success && r?.data) { setTransactionStatus(r.data.status); const s = String(r.data.status||'').toLowerCase(); if (s === 'paid' || s === 'success') { onNotify('Pembayaran berhasil!', 'success'); setSuccessCountdown(4) } } } catch (_) {} finally { setIsCheckingStatus(false) } }} disabled={isCheckingStatus} className="p-2 rounded-lg bg-teal-100 dark:bg-teal-900/50 text-teal-600" title="Cek status">
                          {isCheckingStatus ? <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg> : <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>}
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="p-4 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700">
                    <div className="flex justify-between text-sm mb-1"><span className="text-gray-600 dark:text-gray-400">Nominal</span><span className="font-semibold text-gray-900 dark:text-gray-100">Rp {(vaInfo.amount ?? 0).toLocaleString('id-ID')}</span></div>
                    {(vaInfo.admin_fee != null && vaInfo.admin_fee > 0) && <div className="flex justify-between text-sm mb-1"><span className="text-gray-600 dark:text-gray-400">Biaya admin</span><span className="font-semibold text-gray-900 dark:text-gray-100">Rp {(vaInfo.admin_fee ?? 0).toLocaleString('id-ID')}</span></div>}
                    <div className="flex justify-between text-sm pt-2 border-t border-gray-200 dark:border-gray-600"><span className="font-semibold text-gray-800 dark:text-gray-200">Total</span><span className="font-bold text-teal-600 dark:text-teal-400">Rp {(vaInfo.total ?? vaInfo.amount ?? 0).toLocaleString('id-ID')}</span></div>
                  </div>
                  {vaInfo.va_number && (
                    <div className="p-4 rounded-lg bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-800">
                      <div className="flex items-center justify-between gap-3 mb-2">
                        <span className="text-sm font-medium text-teal-700 dark:text-teal-300">Bayar via {vaInfo.bank || (vaInfo.payment_method === 'cstore' ? 'Convenience Store' : 'Virtual Account')}</span>
                        <span className="shrink-0">
                          {vaInfo.payment_method === 'va' && <BankIcon bank={vaInfo.payment_channel || 'bca'} className="h-10" />}
                          {vaInfo.payment_method === 'cstore' && <CStoreIcon store={vaInfo.payment_channel || 'alfamart'} className="h-10" />}
                        </span>
                      </div>
                      <div className="font-mono text-lg font-bold text-teal-800 dark:text-teal-200 break-all">{vaInfo.va_number}</div>
                      <button type="button" onClick={() => { navigator.clipboard?.writeText(vaInfo.va_number); onNotify(vaInfo.payment_method === 'cstore' ? 'Kode pembayaran disalin' : 'Nomor VA disalin', 'success') }} className="mt-2 text-sm text-teal-600 dark:text-teal-400 hover:underline">Salin</button>
                    </div>
                  )}
                  {vaInfo.payment_method === 'cstore' && vaInfo.va_number && (
                    <div className="p-4 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700">
                      <div className="font-semibold text-gray-800 dark:text-gray-200 mb-2">Langkah-langkah pembayaran di {vaInfo.bank || 'Convenience Store'}</div>
                      <ol className="list-decimal list-inside space-y-1.5 text-sm text-gray-700 dark:text-gray-300">
                        {(vaInfo.payment_channel || '').toLowerCase() === 'alfamart' && (
                          <>
                            <li>Datang ke gerai Alfamart terdekat.</li>
                            <li>Beri tahu kasir: &quot;Bayar PLASAMAL&quot;.</li>
                            <li>Sebutkan kode pembayaran di atas.</li>
                            <li>Bayar sesuai nominal yang ditagihkan.</li>
                          </>
                        )}
                        {(vaInfo.payment_channel || '').toLowerCase() === 'indomaret' && (
                          <>
                            <li>Datang ke gerai Indomaret terdekat.</li>
                            <li>Beri tahu kasir: &quot;Bayar LINKITA&quot;.</li>
                            <li>Sebutkan kode pembayaran di atas.</li>
                            <li>Bayar sesuai nominal yang ditagihkan.</li>
                          </>
                        )}
                        {!['alfamart', 'indomaret'].includes((vaInfo.payment_channel || '').toLowerCase()) && (
                          <>
                            <li>Datang ke gerai {vaInfo.bank || 'mitra'} terdekat.</li>
                            <li>Beri tahu kasir kode pembayaran di atas.</li>
                            <li>Bayar sesuai nominal.</li>
                          </>
                        )}
                      </ol>
                    </div>
                  )}
                  {vaInfo.payment_method === 'va' && vaInfo.va_number && (
                    <div className="p-4 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700">
                      <div className="font-semibold text-gray-800 dark:text-gray-200 mb-2">Cara bayar Virtual Account ({vaInfo.bank || 'Bank'})</div>
                      <ol className="list-decimal list-inside space-y-1.5 text-sm text-gray-700 dark:text-gray-300">
                        <li>Buka aplikasi/ATM/iBanking bank {vaInfo.bank || 'yang dipilih'}.</li>
                        <li>Pilih menu Transfer ke Virtual Account.</li>
                        <li>Masukkan nomor VA di atas.</li>
                        <li>Bayar sesuai nominal dan konfirmasi.</li>
                      </ol>
                    </div>
                  )}
                  {vaInfo.qr_code && getQrImageSrc(vaInfo.qr_code) && (
                    <div className="p-4 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-center">
                      <div className="flex items-center justify-center gap-2 mb-2">
                        <span className="text-sm font-medium text-teal-700 dark:text-teal-300">Bayar via {vaInfo.payment_method === 'qris' ? 'QRIS' : (vaInfo.bank || '')}</span>
                        <span className="shrink-0">{vaInfo.payment_method === 'qris' && <QRISIcon className="h-8" />}</span>
                      </div>
                      <img src={getQrImageSrc(vaInfo.qr_code)} alt="QR Pembayaran" className="w-full max-w-[200px] h-auto mx-auto rounded" onError={(e) => { const fallback = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(vaInfo.qr_code)}`; if (e.target.src !== fallback) e.target.src = fallback; else e.target.style.display = 'none'; }} />
                      {vaInfo.payment_method === 'qris' && (
                        <button
                          type="button"
                          onClick={async () => {
                            const src = getQrImageSrc(vaInfo.qr_code)
                            const filename = 'qris-pembayaran.png'
                            try {
                              if (src.startsWith('data:')) {
                                const a = document.createElement('a')
                                a.href = src
                                a.download = filename
                                a.click()
                              } else {
                                const res = await fetch(src, { mode: 'cors' })
                                const blob = await res.blob()
                                const url = URL.createObjectURL(blob)
                                const a = document.createElement('a')
                                a.href = url
                                a.download = filename
                                a.click()
                                URL.revokeObjectURL(url)
                              }
                              onNotify('Gambar QR berhasil diunduh', 'success')
                            } catch (err) {
                              onNotify('Gagal mengunduh gambar QR', 'error')
                            }
                          }}
                          className="mt-3 px-4 py-2 text-sm font-medium text-teal-700 dark:text-teal-300 bg-teal-50 dark:bg-teal-900/30 border border-teal-200 dark:border-teal-700 rounded-lg hover:bg-teal-100 dark:hover:bg-teal-900/50 inline-flex items-center gap-2"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                          Unduh gambar QR
                        </button>
                      )}
                      <div className="text-sm text-teal-600 dark:text-teal-400 mt-2">{vaInfo.payment_method === 'qris' ? 'QRIS' : (vaInfo.bank || '')}</div>
                    </div>
                  )}
                  {vaInfo.payment_url && (
                    <div className="flex gap-2">
                      <a href={vaInfo.payment_url} target="_blank" rel="noopener noreferrer" className="flex-1 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-medium text-center">Buka Halaman Bayar</a>
                      <button type="button" onClick={() => setShowCancelModal(true)} className="px-4 py-2 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg font-medium">Batal</button>
                    </div>
                  )}
                </motion.div>
              )}

              {!vaInfo && ipaymuStep === 3 && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
                  <h4 className="text-base font-semibold text-gray-900 dark:text-gray-100">Konfirmasi</h4>
                  <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700">
                    <div className="flex justify-between text-sm"><span className="text-gray-600 dark:text-gray-400">Nominal</span><span className="font-semibold">Rp {(parseFloat(ipaymuAmount.replace(/\./g, '')) || 0).toLocaleString('id-ID')}</span></div>
                    <div className="flex justify-between text-sm pt-2 border-t border-gray-200 dark:border-gray-600"><span className="text-gray-600 dark:text-gray-400">Metode</span><span className="font-medium">{paymentMethod === 'qris' ? 'QRIS' : paymentMethod === 'va' ? (VA_CHANNELS.find(c => c.value === paymentChannel)?.label || paymentChannel) : (CSTORE_CHANNELS.find(c => c.value === paymentChannel)?.label || paymentChannel)}</span></div>
                  </div>
                </motion.div>
              )}
            </div>

            <div className="shrink-0 p-4 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex gap-2">
              {!vaInfo && ipaymuStep === 1 && (
                <>
                  <button type="button" onClick={handleClose} className="flex-1 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-lg font-medium">Batal</button>
                  <button
                    type="button"
                    onClick={() => { const amount = parseFloat(ipaymuAmount.replace(/\./g, '')) || 0; if (!amount || amount < 20000) { onNotify('Minimal Rp 20.000', 'error'); return } if (kurang > 0 && amount > kurang) { onNotify('Tidak boleh melebihi sisa kurang', 'error'); return } setStepDirection(1); goToStep(2) }}
                    className="flex-1 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-medium"
                  >Selanjutnya</button>
                </>
              )}
              {!vaInfo && ipaymuStep === 2 && (
                <>
                  <button type="button" onClick={() => { setStepDirection(-1); goToStep(1) }} className="flex-1 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-lg font-medium">Kembali</button>
                  <button type="button" onClick={() => { if (!paymentMethod) { onNotify('Pilih metode pembayaran', 'error'); return } if (paymentMethod === 'va' && !paymentChannel) { onNotify('Pilih bank', 'error'); return } if (paymentMethod === 'cstore' && !paymentChannel) { onNotify('Pilih merchant', 'error'); return } setStepDirection(1); goToStep(3) }} className="flex-1 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-medium">Selanjutnya</button>
                </>
              )}
              {!vaInfo && ipaymuStep === 3 && (
                <>
                  <button type="button" onClick={() => { setStepDirection(-1); goToStep(2) }} className="flex-1 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-lg font-medium">Kembali</button>
                  <button type="button" onClick={handleIPaymuPayment} disabled={processingIPaymu} className="flex-1 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none">{processingIPaymu ? 'Memproses...' : 'Bayar'}</button>
                </>
              )}
            </div>
          </div>
        </div>
      </motion.div>

      {showCancelModal && (
        <div className="fixed inset-0 z-102 flex items-center justify-center p-4 bg-black/50" onClick={() => setShowCancelModal(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-sm w-full p-4" onClick={(e) => e.stopPropagation()}>
            <p className="text-gray-800 dark:text-gray-200 font-medium mb-4">Batalkan transaksi pembayaran ini?</p>
            <div className="flex gap-2">
              <button type="button" onClick={() => setShowCancelModal(false)} className="flex-1 px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded-lg font-medium">Tidak</button>
              <button type="button" onClick={handleCancelTransaction} disabled={isCancelling} className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium disabled:opacity-50">{isCancelling ? '...' : 'Ya, Batalkan'}</button>
            </div>
          </div>
        </div>
      )}
    </AnimatePresence>
  )

  return createPortal(content, document.body)
}
