import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { createPortal } from 'react-dom'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { pendaftaranAPI, paymentTransactionAPI, santriAPI } from '../../services/api'
import { useNotification } from '../../contexts/NotificationContext'
import { BankIcon, CStoreIcon, QRISIcon } from './PaymentIcons'
import { getGambarUrl } from '../../config/images'

/** Helper: konversi qr_code ke URL gambar yang bisa dipakai di <img src>. iPayMu bisa return base64, data URL, atau QR string (EMVCo). */
function getQrImageSrc(qrCode) {
  if (!qrCode || typeof qrCode !== 'string') return null
  const s = qrCode.trim()
  if (!s) return null
  // Sudah URL atau data URL - pakai langsung
  if (s.startsWith('data:image') || s.startsWith('http://') || s.startsWith('https://')) return s
  // Base64 tanpa prefix: biasanya punya + / = dan panjang. EMVCo QRIS dimulai 0002.
  if ((s.includes('+') || s.includes('/') || s.endsWith('=')) && /^[A-Za-z0-9+/=]+$/.test(s) && s.length > 200) {
    return `data:image/png;base64,${s}`
  }
  // QR string (EMVCo QRIS, dll) - generate via api.qrserver.com (gratis, pengganti chart.googleapis)
  return `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(s)}`
}

/** Sementara disembunyikan: set true untuk menampilkan lagi tombol Upload TF. Saat false, user hanya pakai iPayMu. */
const SHOW_UPLOAD_TF_BUTTON = false

/** Snapshot session iPayMu agar setelah remount (Strict Mode / refresh) URL step=3 tidak kehilangan vaInfo */
const IPAYMU_SESSION_STORAGE_KEY = 'daftar_ipaymu_session_v1'
/** Abaikan status failed/expired dari API jika transaksi baru dibuat (iPayMu/DB belum konsisten) */
const IPAYMU_FAIL_GRACE_MS = 50000

function clearIpaymuSessionPersistence() {
  try {
    sessionStorage.removeItem(IPAYMU_SESSION_STORAGE_KEY)
  } catch (_) {}
}

function writeIpaymuSessionPersistence(sessionId, idRegistrasi, idSantriUser) {
  if (!sessionId || typeof sessionStorage === 'undefined') return
  try {
    sessionStorage.setItem(
      IPAYMU_SESSION_STORAGE_KEY,
      JSON.stringify({
        session_id: sessionId,
        id_registrasi: idRegistrasi ?? null,
        id_santri: idSantriUser ?? null,
        savedAt: Date.now()
      })
    )
  } catch (_) {}
}

function bankLabelFromChannels(paymentMethod, paymentChannel, vaChannels, cstoreChannels) {
  if (paymentMethod === 'va' && paymentChannel) {
    const channelData = vaChannels.find((c) => c.value === paymentChannel)
    return channelData ? channelData.label : String(paymentChannel).toUpperCase()
  }
  if (paymentMethod === 'cstore' && paymentChannel) {
    const channelData = cstoreChannels.find((c) => c.value === paymentChannel)
    return channelData ? channelData.label : String(paymentChannel).toUpperCase()
  }
  if (paymentMethod === 'qris') return 'QRIS'
  return 'iPayMu'
}

/** Bangun vaInfo dari baris payment___transaction (response checkStatus / pending) */
function transactionRowToVaInfo(row, vaChannels, cstoreChannels, localCreatedAt) {
  if (!row) return null
  const expiredAt = row.expired_at
    ? new Date(row.expired_at).getTime()
    : row.tanggal_dibuat
      ? new Date(row.tanggal_dibuat).getTime() + 24 * 60 * 60 * 1000
      : Date.now() + 24 * 60 * 60 * 1000
  const bankName = bankLabelFromChannels(row.payment_method, row.payment_channel, vaChannels, cstoreChannels)
  const amt = row.amount ?? row.sub_total ?? 0
  const fee = row.admin_fee ?? row.fee ?? 0
  const num = (v) => (typeof v === 'number' ? v : parseFloat(v) || 0)
  return {
    va_number: row.va_number || null,
    bank: bankName,
    payment_method: row.payment_method || null,
    payment_channel: row.payment_channel || null,
    payment_url: row.payment_url || null,
    qr_code: row.qr_code || null,
    session_id: row.session_id || null,
    transaction_id: row.id || row.trx_id || null,
    ipaymu_transaction_id: row.trx_id || row.id || null,
    amount: num(amt),
    admin_fee: num(fee),
    total: row.total != null ? num(row.total) : num(amt) + num(fee),
    expired_at: expiredAt,
    localCreatedAt: localCreatedAt ?? Date.now()
  }
}

const IPAYMU_VA_CHANNELS = [
  { value: 'bag', label: 'VA BAG' },
  { value: 'bca', label: 'VA BCA' },
  { value: 'bni', label: 'VA BNI' },
  { value: 'bri', label: 'VA BRI' },
  { value: 'bsi', label: 'VA BSI' },
  { value: 'btn', label: 'VA BTN' },
  { value: 'cimb', label: 'VA Cimb Niaga' },
  { value: 'danamon', label: 'VA DANAMON' },
  { value: 'mandiri', label: 'VA Mandiri' },
  { value: 'muamalat', label: 'VA Muamalat' },
  { value: 'permata', label: 'VA Permata' }
]

const IPAYMU_CSTORE_CHANNELS = [
  { value: 'alfamart', label: 'Alfamart' },
  { value: 'indomaret', label: 'Indomaret' }
]

/** Tagihan pending sudah lewat batas waktu bayar (selaras pengecekan backend getPendingTransaction) */
function isPaymentPendingExpiredClient(tx) {
  if (!tx) return true
  const now = Date.now()
  if (tx.expired_at) {
    const end = new Date(tx.expired_at).getTime()
    if (!Number.isNaN(end) && end <= now) return true
  }
  try {
    const rd = tx.response_data
    if (rd == null || rd === '') return false
    const parsed = typeof rd === 'string' ? JSON.parse(rd) : rd
    if (!parsed || typeof parsed !== 'object') return false
    const merged = { ...parsed }
    if (parsed.Data && typeof parsed.Data === 'object') Object.assign(merged, parsed.Data)
    if (parsed.data && typeof parsed.data === 'object') Object.assign(merged, parsed.data)
    const d = merged.ExpiredDate ?? merged.expiredDate ?? merged.expired_at
    if (d) {
      const end = new Date(d).getTime()
      if (!Number.isNaN(end) && end <= now) return true
    }
  } catch (_) {
    /* abaikan */
  }
  return false
}

function normalizeIpaymuStatusForList(status) {
  const s = String(status || '').toLowerCase().trim()
  if (!s) return 'pending'
  if (s === 'success') return 'paid'
  return s
}

/** Status tampilan baris iPayMu: jika DB masih pending tapi waktu bayar lewat → tampilkan expired */
function effectiveIpaymuRowStatus(p) {
  const base = normalizeIpaymuStatusForList(p?.transaction_status || p?.status || 'pending')
  if (base === 'pending' && isPaymentPendingExpiredClient(p)) return 'expired'
  return base
}

function PembayaranListOffcanvas({
  isOpen,
  onClose,
  pathname: pathnameProp,
  registrasi,
  idSantri,
  buktiPembayaranList = [],
  wajib,
  wajibNol = false,
  bayar,
  kurang,
  onUploadBuktiClick,
  onPreviewBukti,
  bisaUploadBukti,
  jumlahBukti,
  nomorBuktiBerikutnya,
  /** Riwayat transaksi dari parent (satu sumber dengan refreshPembayaran — hindari getTransaksi ganda) */
  paymentHistory = [],
  paymentDataLoading = false,
  onRefreshRegistrasi = null // Callback: invalidasi cache + refresh penuh di parent
}) {
  const onRefreshRegistrasiRef = useRef(onRefreshRegistrasi)
  onRefreshRegistrasiRef.current = onRefreshRegistrasi

  const navigate = useNavigate()
  const location = useLocation()
  const pathname = pathnameProp || location.pathname || '/pembayaran'
  const { showNotification } = useNotification()
  const [processingIPaymu, setProcessingIPaymu] = useState(false)
  const [ipaymuAmount, setIpaymuAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('') // va, cstore, qris
  const [paymentChannel, setPaymentChannel] = useState('') // bca, bni, bri, mandiri, permata, dll
  const [isDeleting, setIsDeleting] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [itemToDelete, setItemToDelete] = useState(null)
  const [vaInfo, setVaInfo] = useState(null) // { va_number, bank, payment_method, payment_url, qr_code, session_id, transaction_id, ipaymu_transaction_id, expired_at }
  const [openAccordion, setOpenAccordion] = useState(null) // null, 'va', 'qris', 'cstore'
  const [stepDirection, setStepDirection] = useState(1) // 1: maju (kanan), -1: mundur (kiri)
  const [transactionStatus, setTransactionStatus] = useState(null) // Status transaksi: 'pending', 'paid', 'expired', 'cancelled', 'failed'
  const [isCheckingStatus, setIsCheckingStatus] = useState(false) // Loading state untuk check status manual
  const [openingIpaymuHistoryId, setOpeningIpaymuHistoryId] = useState(null)
  const [countdownRemaining, setCountdownRemaining] = useState(null) // Sisa detik sampai kadaluwarsa (untuk hitungan mundur)
  const [isSandboxMode, setIsSandboxMode] = useState(false) // Mode sandbox dari pengaturan - untuk tampilkan peringatan
  const cancelInProgressRef = useRef(false) // Blok multiple klik pembatalan
  const paymentResolvedRef = useRef(false) // True jika sudah dapat status akhir (paid/expired/failed/cancelled), hentikan polling
  const countdownAutoExpiredRef = useRef(false) // Cegah ganda: setelah countdown 0 → sync expired sekali per session
  const [ipaymuListTimeTick, setIpaymuListTimeTick] = useState(0)

  // Sinkron view dari URL: payment=open (list) | payment=ipaymu&step=1|2|3|4
  const searchParams = new URLSearchParams(location.search || '')
  const paymentParam = searchParams.get('payment')
  const stepParam = searchParams.get('step')
  const showIPaymuModal = paymentParam === 'ipaymu'
  const ipaymuStep = showIPaymuModal
    ? (stepParam === '4' ? 4 : stepParam === '3' ? 3 : stepParam === '2' ? 2 : 1)
    : 1

  const goToPaymentOpen = useCallback(() => {
    clearIpaymuSessionPersistence()
    navigate(`${pathname}?payment=open`, { replace: false })
  }, [pathname, navigate])

  const goToIPaymuStep = useCallback(
    (step) => {
      navigate(`${pathname}?payment=ipaymu&step=${step || 1}`, { replace: false })
    },
    [pathname, navigate]
  )

  const vaChannels = IPAYMU_VA_CHANNELS
  const cstoreChannels = IPAYMU_CSTORE_CHANNELS

  const [showEditModal, setShowEditModal] = useState(false)
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [isCancelling, setIsCancelling] = useState(false)
  const [isUpdating, setIsUpdating] = useState(false)
  const prevShowEditModalRef = useRef(showEditModal)

  // Fetch mode sandbox saat iPayMu view dibuka
  useEffect(() => {
    if (showIPaymuModal && isOpen) {
      paymentTransactionAPI.getMode().then((res) => {
        if (res.success && res.data?.is_sandbox) {
          setIsSandboxMode(true)
        } else {
          setIsSandboxMode(false)
        }
      }).catch(() => setIsSandboxMode(false))
    }
  }, [showIPaymuModal, isOpen])

  // Agar label "Menunggu" di daftar iPayMu berubah ke Kadaluwarsa saat jam sistem lewat expired_at (tanpa tunggu refetch)
  useEffect(() => {
    if (!isOpen) return
    const t = setInterval(() => setIpaymuListTimeTick((n) => n + 1), 5000)
    return () => clearInterval(t)
  }, [isOpen])

  // Hitungan mundur kadaluwarsa saat status Menunggu Pembayaran
  // 'cancelled' di app tidak menghentikan hitung mundur — QR unduhan mungkin masih bisa dibayar sampai expired_at iPayMu
  useEffect(() => {
    countdownAutoExpiredRef.current = false
  }, [vaInfo?.session_id])

  useEffect(() => {
    const terminal = ['expired', 'failed', 'paid', 'success']
    const isPending = transactionStatus == null || !terminal.includes(String(transactionStatus || '').toLowerCase())
    if (!vaInfo?.expired_at || !isPending) {
      setCountdownRemaining(null)
      return
    }
    const tick = () => {
      const now = Date.now()
      const end = vaInfo.expired_at
      const remaining = Math.max(0, Math.floor((end - now) / 1000))
      setCountdownRemaining(remaining)
      if (
        remaining <= 0 &&
        vaInfo.session_id &&
        !countdownAutoExpiredRef.current
      ) {
        const ts = String(transactionStatus || '').toLowerCase()
        if (!terminal.includes(ts)) {
          countdownAutoExpiredRef.current = true
          setTransactionStatus('expired')
          void (async () => {
            try {
              await paymentTransactionAPI.checkStatus(vaInfo.session_id)
            } catch (_) {}
            try {
              if (onRefreshRegistrasiRef.current) await onRefreshRegistrasiRef.current()
            } catch (_) {}
          })()
        }
      }
    }
    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [vaInfo?.expired_at, vaInfo?.session_id, transactionStatus])

  const normalizeIpaymuStatus = (status) => {
    const s = String(status || '').toLowerCase().trim()
    if (!s) return 'pending'
    if (s === 'success') return 'paid'
    return s
  }

  const getIpaymuBankName = (paymentMethod, paymentChannel) => {
    if (paymentMethod === 'va' && paymentChannel) {
      const channelData = vaChannels.find(c => c.value === paymentChannel)
      return channelData ? channelData.label : String(paymentChannel).toUpperCase()
    }
    if (paymentMethod === 'cstore' && paymentChannel) {
      const channelData = cstoreChannels.find(c => c.value === paymentChannel)
      return channelData ? channelData.label : String(paymentChannel).toUpperCase()
    }
    if (paymentMethod === 'qris') return 'QRIS'
    return 'iPayMu'
  }

  // Helper function untuk mendapatkan nomor dari jenis_berkas
  const getBuktiNumber = (berkas) => {
    if (berkas.jenis_berkas === 'Bukti Pembayaran') {
      return 1
    }
    const match = berkas.jenis_berkas.match(/\d+/)
    return match ? parseInt(match[0]) : 1
  }

  // Gabungkan data transaksi dengan bukti pembayaran yang menunggu verifikasi
  const combinedPaymentList = useMemo(() => {
    // Filter transaksi TF yang sudah diverifikasi dan urutkan berdasarkan tanggal (terlama dulu)
    // Hanya ambil transaksi dari psb___transaksi (unik berdasarkan id)
    const uniquePayments = new Map()
    paymentHistory.forEach(payment => {
      // Gunakan id dari psb___transaksi sebagai key untuk memastikan unik
      // Jika ada duplikasi (misal dari JOIN dengan payment), ambil yang pertama
      if (!uniquePayments.has(payment.id)) {
        uniquePayments.set(payment.id, payment)
      }
    })
    
    const uniquePaymentArray = Array.from(uniquePayments.values())
    
    const verifiedTfPayments = uniquePaymentArray
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

    // Tambahkan semua transaksi (termasuk yang bukan TF) - hanya yang unik
    uniquePaymentArray.forEach(payment => {
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

  const ipaymuCreateHistory = useMemo(() => {
    const rows = (paymentHistory || []).filter((p) => {
      const via = String(p?.via || '').toLowerCase().trim()
      return via === 'ipaymu' || via === 'ipay mu'
    })
    return rows
      .map((p) => ({
        ...p,
        txStatus: effectiveIpaymuRowStatus(p),
        txId: p?.id_payment_transaction || p?.session_id || p?.ipaymu_transaction_id || p?.id,
      }))
      .sort((a, b) => {
        const da = new Date(a?.created_at || a?.tanggal_dibuat || 0).getTime()
        const db = new Date(b?.created_at || b?.tanggal_dibuat || 0).getTime()
        return db - da
      })
  }, [paymentHistory, ipaymuListTimeTick])

  const handleOpenIpaymuHistory = async (tx) => {
    if (!tx?.txId) return
    setOpeningIpaymuHistoryId(tx.txId)
    try {
      const statusResult = await paymentTransactionAPI.checkStatus(tx.txId)
      const txData = statusResult?.success && statusResult?.data ? statusResult.data : null
      const rawStatus = txData?.status || tx?.txStatus || 'pending'
      const normalizedStatus = normalizeIpaymuStatus(rawStatus)
      const bankName = getIpaymuBankName(
        txData?.payment_method || tx?.payment_method,
        txData?.payment_channel || tx?.payment_channel
      )
      const expiredAt = (txData?.expired_at && new Date(txData.expired_at).getTime())
        || (tx?.expired_at && new Date(tx.expired_at).getTime())
        || ((tx?.created_at || tx?.tanggal_dibuat)
          ? new Date(tx.created_at || tx.tanggal_dibuat).getTime() + 24 * 60 * 60 * 1000
          : Date.now() + 24 * 60 * 60 * 1000)

      const histCreatedMs = (tx?.created_at || tx?.tanggal_dibuat)
        ? new Date(tx.created_at || tx.tanggal_dibuat).getTime()
        : Date.now()
      setVaInfo({
        va_number: txData?.va_number || tx?.va_number || null,
        bank: bankName,
        payment_method: txData?.payment_method || tx?.payment_method || null,
        payment_channel: txData?.payment_channel || tx?.payment_channel || null,
        payment_url: txData?.payment_url || tx?.payment_url || null,
        qr_code: txData?.qr_code || tx?.qr_code || null,
        session_id: txData?.session_id || tx?.session_id || tx.txId,
        transaction_id: txData?.transaction_id || tx?.ipaymu_transaction_id || tx.txId,
        ipaymu_transaction_id: txData?.transaction_id || tx?.ipaymu_transaction_id || tx.txId,
        amount: txData?.amount || tx?.nominal || null,
        admin_fee: txData?.admin_fee ?? tx?.admin_fee ?? 0,
        total: txData?.total ?? tx?.total ?? txData?.amount ?? tx?.nominal ?? 0,
        expired_at: expiredAt,
        localCreatedAt: histCreatedMs
      })
      setTransactionStatus(rawStatus)
      setStepDirection(1)
      if (normalizedStatus === 'paid') {
        goToIPaymuStep(4)
      } else {
        // pending/cancelled/expired/failed tetap dibuka ke halaman menunggu/detail
        goToIPaymuStep(3)
      }
    } catch (err) {
      showNotification('Gagal membuka detail transaksi iPayMu', 'error')
    } finally {
      setOpeningIpaymuHistoryId(null)
    }
  }

  /** Setelah mutasi: satu refetch parent (sudah termasuk getTransaksi + cache) */
  const syncAfterPembayaranMutation = useCallback(async () => {
    if (onRefreshRegistrasi) await onRefreshRegistrasi()
  }, [onRefreshRegistrasi])

  const latestVaInfoRef = useRef(null)
  latestVaInfoRef.current = vaInfo
  const syncAfterPembayaranMutationRef = useRef(syncAfterPembayaranMutation)
  syncAfterPembayaranMutationRef.current = syncAfterPembayaranMutation

  // Pulihkan vaInfo jika remount/Strict Mode: URL masih ipaymu step≥3 tapi state React hilang. Pakai useEffect (bukan layout) agar jalan setelah batch setState dari klik Bayar.
  useEffect(() => {
    if (!isOpen || !showIPaymuModal || ipaymuStep < 3 || vaInfo || processingIPaymu) return

    let raw = null
    try {
      raw = sessionStorage.getItem(IPAYMU_SESSION_STORAGE_KEY)
    } catch (_) {
      return
    }
    if (!raw) return

    let snap
    try {
      snap = JSON.parse(raw)
    } catch {
      return
    }
    if (!snap?.session_id || String(snap.id_santri) !== String(idSantri ?? '')) return
    if (
      registrasi?.id != null &&
      snap.id_registrasi != null &&
      String(snap.id_registrasi) !== String(registrasi.id)
    ) {
      return
    }

    let cancelled = false
    ;(async () => {
      try {
        const statusResult = await paymentTransactionAPI.checkStatus(snap.session_id)
        if (cancelled) return
        if (!statusResult?.success || !statusResult.data) return
        const row = statusResult.data
        const normalizedStatus = row.status ? String(row.status).toLowerCase().trim() : null

        if (
          normalizedStatus === 'expired' ||
          normalizedStatus === 'failed' ||
          isPaymentPendingExpiredClient(row)
        ) {
          clearIpaymuSessionPersistence()
          goToIPaymuStep(1)
          return
        }

        const createdMs = row.tanggal_dibuat ? new Date(row.tanggal_dibuat).getTime() : snap.savedAt
        const mapped = transactionRowToVaInfo(row, IPAYMU_VA_CHANNELS, IPAYMU_CSTORE_CHANNELS, createdMs)
        if (!mapped) return

        if (normalizedStatus === 'paid' || normalizedStatus === 'success') {
          clearIpaymuSessionPersistence()
          setVaInfo(mapped)
          setTransactionStatus(row.status)
          goToIPaymuStep(4)
          void syncAfterPembayaranMutationRef.current()
          return
        }

        setVaInfo(mapped)
        setTransactionStatus(row.status || 'pending')
      } catch (_) {
        /* biarkan user di wizard; polling/klik Bayar mengisi lagi */
      }
    })()

    return () => {
      cancelled = true
    }
  }, [isOpen, showIPaymuModal, ipaymuStep, vaInfo, processingIPaymu, idSantri, registrasi?.id, goToIPaymuStep])

  // Auto-check status pembayaran untuk transaksi pending (polling)
  // Hanya bergantung pada session_id + mode ipaymu — jangan sertakan registrasi/sync callback agar effect tidak di-reset saat refresh parent (penyebab race / flash kembali ke konfirmasi)
  useEffect(() => {
    if (!vaInfo?.session_id || !showIPaymuModal) return

    const sessionId = vaInfo.session_id
    paymentResolvedRef.current = false
    let isMounted = true

    const checkPaymentStatus = async () => {
      if (!isMounted || paymentResolvedRef.current) return
      try {
        const statusResult = await paymentTransactionAPI.checkStatus(sessionId)
        if (!isMounted || paymentResolvedRef.current) return
        if (!statusResult?.success || !statusResult.data) return

        const rawStatus = statusResult.data.status
        const normalizedStatus = rawStatus ? String(rawStatus).toLowerCase().trim() : null
        const vSnap = latestVaInfoRef.current
        const endMs = vSnap?.expired_at != null ? Number(vSnap.expired_at) : NaN
        const pastLocalExpiry = Number.isFinite(endMs) && Date.now() >= endMs
        const displayStatus =
          pastLocalExpiry && (normalizedStatus === 'pending' || normalizedStatus === 'cancelled')
            ? 'expired'
            : rawStatus

        setTransactionStatus(displayStatus)

        if (normalizedStatus === 'paid' || normalizedStatus === 'success') {
          paymentResolvedRef.current = true
          clearIpaymuSessionPersistence()
          showNotification('Pembayaran berhasil! Data diperbarui.', 'success')
          const txData = statusResult.data
          let bankName = 'iPayMu'
          if (txData.payment_method === 'va' && txData.payment_channel) {
            const channelData = IPAYMU_VA_CHANNELS.find(c => c.value === txData.payment_channel)
            bankName = channelData ? channelData.label : (txData.payment_channel || '').toUpperCase()
          } else if (txData.payment_method === 'cstore' && txData.payment_channel) {
            const channelData = IPAYMU_CSTORE_CHANNELS.find(c => c.value === txData.payment_channel)
            bankName = channelData ? channelData.label : (txData.payment_channel || '').toUpperCase()
          } else if (txData.payment_method === 'qris') bankName = 'QRIS'
          setVaInfo(prev => ({
            ...prev,
            va_number: txData.va_number ?? prev?.va_number,
            qr_code: txData.qr_code ?? prev?.qr_code,
            payment_method: txData.payment_method ?? prev?.payment_method ?? 'va',
            payment_channel: txData.payment_channel ?? prev?.payment_channel,
            bank: bankName,
            payment_url: txData.payment_url ?? prev?.payment_url,
            session_id: txData.session_id ?? prev?.session_id,
            transaction_id: txData.id ?? txData.trx_id ?? prev?.transaction_id,
            ipaymu_transaction_id: txData.trx_id ?? txData.id ?? prev?.ipaymu_transaction_id,
            amount: txData.amount ?? prev?.amount
          }))
          setStepDirection(1)
          goToIPaymuStep(4)
          await syncAfterPembayaranMutationRef.current()
          return
        }

        if (normalizedStatus === 'cancelled' && !pastLocalExpiry) {
          return
        }

        if (normalizedStatus === 'expired' || normalizedStatus === 'failed') {
          const v = latestVaInfoRef.current
          const t0 = v?.localCreatedAt
          if (t0 && Date.now() - t0 < IPAYMU_FAIL_GRACE_MS) {
            return
          }
          paymentResolvedRef.current = true
          if (isMounted) {
            clearIpaymuSessionPersistence()
            setVaInfo(null)
            setTransactionStatus(null)
            if (showIPaymuModal) goToPaymentOpen()
          }
          await syncAfterPembayaranMutationRef.current()
        }
      } catch (err) {
        if (isMounted && !paymentResolvedRef.current) {
          // Tetap lanjut polling
        }
      }
    }

    const initialTimeout = setTimeout(() => { if (isMounted && !paymentResolvedRef.current) checkPaymentStatus() }, 1000)
    const intervalId = setInterval(() => { if (isMounted && !paymentResolvedRef.current) checkPaymentStatus() }, 5000)

    return () => {
      isMounted = false
      clearTimeout(initialTimeout)
      clearInterval(intervalId)
    }
  }, [vaInfo?.session_id, showIPaymuModal, goToIPaymuStep, goToPaymentOpen])

  // Isi form edit saat modal edit dibuka; reset field wizard hanya saat modal edit benar-benar ditutup (bukan setiap vaInfo berubah dari polling)
  useEffect(() => {
    if (showEditModal && vaInfo) {
      if (vaInfo.amount) {
        const formattedAmount = new Intl.NumberFormat('id-ID').format(vaInfo.amount)
        setIpaymuAmount(formattedAmount)
      }
      if (vaInfo.payment_method) {
        setPaymentMethod(vaInfo.payment_method)
        if (vaInfo.payment_method === 'va' || vaInfo.payment_method === 'cstore') {
          setOpenAccordion(vaInfo.payment_method)
        } else if (vaInfo.payment_method === 'qris') {
          setOpenAccordion('qris')
        }
      }
      if (vaInfo.payment_channel) {
        setPaymentChannel(vaInfo.payment_channel)
      }
    }
    const wasOpen = prevShowEditModalRef.current
    prevShowEditModalRef.current = showEditModal
    if (wasOpen && !showEditModal) {
      setIpaymuAmount('')
      setPaymentMethod('')
      setPaymentChannel('')
      setOpenAccordion(null)
    }
  }, [showEditModal, vaInfo])

  // Handle iPayMu Payment Modal
  const handleIPaymuClick = async () => {
    if (wajibNol) {
      showNotification('Total wajib Rp 0. Cek kondisi pendaftaran atau hubungi admin.', 'warning')
      return
    }
    if (kurang <= 0) {
      showNotification('Pembayaran sudah lunas', 'info')
      return
    }

    // Cek apakah ada transaksi pending terlebih dahulu
    setProcessingIPaymu(true)
    try {
      console.log('Checking pending transaction for:', { idRegistrasi: registrasi?.id, idSantri })
      const pendingResult = await paymentTransactionAPI.getPendingTransaction(registrasi?.id, idSantri)
      console.log('Pending transaction result:', pendingResult)
      
      if (pendingResult && pendingResult.success === true && pendingResult.data) {
        const pendingTransaction = pendingResult.data
        if (isPaymentPendingExpiredClient(pendingTransaction)) {
          clearIpaymuSessionPersistence()
          setIpaymuAmount('')
          setPaymentMethod('')
          setPaymentChannel('')
          setVaInfo(null)
          setOpenAccordion(null)
          goToIPaymuStep(1)
          setProcessingIPaymu(false)
          showNotification('Tagihan sebelumnya sudah kedaluwarsa. Silakan buat pembayaran baru.', 'info')
          return
        }
        // Ada transaksi pending, tampilkan informasi transaksi yang sudah ada
        console.log('Found pending transaction:', pendingTransaction)
        
        // Tentukan bank name berdasarkan payment method dan channel
        let bankName = 'Bank'
        if (pendingTransaction.payment_method === 'va' && pendingTransaction.payment_channel) {
          const channelData = vaChannels.find(c => c.value === pendingTransaction.payment_channel)
          bankName = channelData ? channelData.label : pendingTransaction.payment_channel.toUpperCase()
        } else if (pendingTransaction.payment_method === 'cstore' && pendingTransaction.payment_channel) {
          const channelData = cstoreChannels.find(c => c.value === pendingTransaction.payment_channel)
          bankName = channelData ? channelData.label : pendingTransaction.payment_channel.toUpperCase()
        } else if (pendingTransaction.payment_method === 'qris') {
          bankName = 'QRIS'
        }

        // Extract qr_code dari berbagai kemungkinan field
        let qrCode = pendingTransaction.qr_code || null
        
        // Jika qr_code tidak ada, coba ambil dari response_data (JSON string)
        if (!qrCode && pendingTransaction.response_data) {
          try {
            const responseData = typeof pendingTransaction.response_data === 'string' 
              ? JSON.parse(pendingTransaction.response_data) 
              : pendingTransaction.response_data
            
            const dataObject = responseData.Data || responseData.data || responseData
            qrCode = dataObject.QRCode
              || dataObject.qr_code
              || dataObject.qrCode
              || dataObject.QR_Code
              || dataObject.qr_string
              || dataObject.QrString
              || dataObject.qrString
              || responseData.QRCode
              || responseData.qr_code
              || responseData.qrCode
              || null
          } catch (e) {
            console.error('Error parsing response_data for QR code:', e)
          }
        }
        
        console.log('QR Code from pending transaction:', qrCode ? `${qrCode.substring(0, 50)}... (${qrCode.length} chars)` : 'null')
        console.log('Pending transaction full data:', {
          va_number: pendingTransaction.va_number,
          qr_code: pendingTransaction.qr_code,
          payment_method: pendingTransaction.payment_method,
          has_response_data: !!pendingTransaction.response_data
        })
        
        // Clear transactionStatus terlebih dahulu untuk menghindari sisa status
        setTransactionStatus(null)
        
        // Waktu kadaluwarsa: dari API jika ada, else 24 jam dari sekarang
        // expired_at dari API/DB (sesuai method); fallback dari tanggal_dibuat + 24j jika data lama
        const expiredAt = pendingTransaction.expired_at
          ? new Date(pendingTransaction.expired_at).getTime()
          : (pendingTransaction.tanggal_dibuat || pendingTransaction.created_at ? new Date(pendingTransaction.tanggal_dibuat || pendingTransaction.created_at).getTime() + 24 * 60 * 60 * 1000 : Date.now() + 24 * 60 * 60 * 1000)
        const amt = pendingTransaction.amount ?? 0
        const fee = pendingTransaction.admin_fee ?? 0
        // Set VA info dari transaksi pending
        const pendingCreatedMs = pendingTransaction.tanggal_dibuat || pendingTransaction.created_at
          ? new Date(pendingTransaction.tanggal_dibuat || pendingTransaction.created_at).getTime()
          : Date.now()
        const vaInfoData = {
          va_number: pendingTransaction.va_number || null,
          bank: bankName,
          payment_method: pendingTransaction.payment_method || null,
          payment_channel: pendingTransaction.payment_channel || null,
          payment_url: pendingTransaction.payment_url || null,
          qr_code: qrCode,
          session_id: pendingTransaction.session_id || null,
          transaction_id: pendingTransaction.id || pendingTransaction.trx_id || null,
          ipaymu_transaction_id: pendingTransaction.trx_id || pendingTransaction.id || null,
          amount: amt,
          admin_fee: fee,
          total: (pendingTransaction.total ?? (amt + fee)),
          expired_at: expiredAt,
          localCreatedAt: pendingCreatedMs
        }
        
        console.log('Setting vaInfo with:', {
          ...vaInfoData,
          qr_code: vaInfoData.qr_code ? `${vaInfoData.qr_code.substring(0, 50)}...` : null
        })
        
        setVaInfo(vaInfoData)
        if (vaInfoData.session_id) {
          writeIpaymuSessionPersistence(vaInfoData.session_id, registrasi?.id, idSantri)
        }
        
        // Clear transactionStatus terlebih dahulu untuk menghindari sisa status
        setTransactionStatus(pendingTransaction.status || 'pending')
        
        goToIPaymuStep(3)
        setProcessingIPaymu(false)
        showNotification('Menampilkan transaksi pembayaran yang sudah ada', 'info')
        return // Keluar dari function, jangan lanjut ke kode di bawah
      } else {
        // Tidak ada transaksi pending, buka modal untuk membuat transaksi baru
        console.log('No pending transaction found, opening new transaction modal')
        clearIpaymuSessionPersistence()
        setIpaymuAmount('')
        setPaymentMethod('')
        setPaymentChannel('')
        setVaInfo(null)
        setOpenAccordion(null)
        goToIPaymuStep(1)
        setProcessingIPaymu(false)
      }
    } catch (err) {
      console.error('Error checking pending transaction:', err)
      clearIpaymuSessionPersistence()
      setIpaymuAmount('')
      setPaymentMethod('')
      setPaymentChannel('')
      setVaInfo(null)
      setOpenAccordion(null)
      goToIPaymuStep(1)
      setProcessingIPaymu(false)
    }
  }

  // Handle accordion toggle
  const handleAccordionToggle = (method) => {
    if (openAccordion === method) {
      setOpenAccordion(null)
      setPaymentMethod('')
      setPaymentChannel('')
    } else {
      setOpenAccordion(method)
      setPaymentMethod(method)
      setPaymentChannel('') // Reset channel saat ganti method
    }
  }

  // Handle channel selection
  const handleChannelSelect = (channel) => {
    setPaymentChannel(channel)
  }

  // Format currency input
  const handleAmountInput = (e) => {
    let value = e.target.value.replace(/\D/g, '')
    const formatted = new Intl.NumberFormat('id-ID').format(value)
    setIpaymuAmount(formatted)
  }

  // Handle iPayMu Payment
  const handleIPaymuPayment = async () => {
    const amount = parseFloat(ipaymuAmount.replace(/\./g, '')) || 0
    const minAmount = 100000

    if (!amount || amount <= 0) {
      showNotification('Masukkan nominal pembayaran', 'error')
      return
    }

    if (amount < minAmount) {
      showNotification(`Minimal pembayaran adalah Rp ${minAmount.toLocaleString('id-ID')}`, 'error')
      return
    }

    if (amount > kurang) {
      showNotification(`Pembayaran tidak boleh melebihi sisa kurang (Rp ${kurang.toLocaleString('id-ID')})`, 'error')
      return
    }

    setProcessingIPaymu(true)
    // Jangan tutup modal dulu, biarkan tetap terbuka untuk menampilkan VA info

    try {
      // Get data pendaftar/santri untuk payment
      let namaPembayar = 'Pembayar Pendaftaran'
      let phone = ''
      let email = ''

      // Coba ambil data dari registrasi jika ada
      if (registrasi) {
        namaPembayar = registrasi.nama || namaPembayar
        phone = registrasi.no_hp || registrasi.no_telp || registrasi.no_wa || ''
        email = registrasi.email || ''
      }

      // Jika nama/phone/email masih kosong, ambil dari biodata santri via endpoint PUBLIC.
      // GET /api/santri hanya untuk admin → 403 di aplikasi daftar; pakai /api/public/santri.
      if ((!namaPembayar || namaPembayar === 'Pembayar Pendaftaran' || !phone || !email) && idSantri) {
        try {
          const biodataResult = await santriAPI.getByIdPublic(idSantri)
          if (biodataResult.success && biodataResult.data) {
            if (!namaPembayar || namaPembayar === 'Pembayar Pendaftaran') {
              const d = biodataResult.data
              // iPayMu menampilkan "nama pembeli" — harus nama santri (s.nama), bukan wali/ayah.
              const namaSantri = String(d.nama ?? '').trim()
              const namaWali = String(d.wali ?? '').trim()
              namaPembayar = namaSantri || namaWali || namaPembayar
            }
            if (!phone) {
              phone = biodataResult.data.no_telpon || biodataResult.data.no_wa_santri || ''
            }
            if (!email) {
              email = biodataResult.data.email || ''
            }
          }
        } catch (err) {
          console.error('Error fetching biodata for payment:', err)
        }
      }

      // Validasi phone wajib
      if (!phone || phone.trim() === '') {
        showNotification('Nomor telepon wali belum diisi. Silakan lengkapi biodata terlebih dahulu di halaman Biodata.', 'error')
        setProcessingIPaymu(false)
        return
      }

      // Jika email kosong, gunakan default email
      if (!email || email.trim() === '') {
        email = 'alutsmanipps@gmail.com'
      }

      // Validasi payment method sudah dipilih
      if (!paymentMethod) {
        showNotification('Pilih metode pembayaran terlebih dahulu', 'error')
        setProcessingIPaymu(false)
        return
      }

      // Validasi payment channel jika payment method adalah va
      if (paymentMethod === 'va' && !paymentChannel) {
        showNotification('Pilih bank untuk Virtual Account', 'error')
        setProcessingIPaymu(false)
        return
      }

      // Validasi payment channel jika payment method adalah cstore
      if (paymentMethod === 'cstore' && !paymentChannel) {
        showNotification('Pilih merchant untuk Convenience Store', 'error')
        setProcessingIPaymu(false)
        return
      }

      // URL untuk redirect setelah bayar/batal di iPayMu — user kembali ke halaman pembayaran daftar
      const baseUrl = typeof window !== 'undefined' ? window.location.origin + (pathname || '/pembayaran') : ''
      const sep = baseUrl && baseUrl.includes('?') ? '&' : '?'
      const returnCancelUrl = baseUrl ? `${baseUrl}${sep}payment=open` : ''

      // Prepare payment data untuk iPayMu
      const paymentData = {
        amount: amount,
        name: namaPembayar,
        phone: phone,
        email: email,
        payment_method: paymentMethod,
        reference_id: `PAY-PSB-${Date.now()}-${idSantri || registrasi?.id || 'NEW'}`,
        jenis_pembayaran: 'Pendaftaran',
        id_registrasi: registrasi?.id || null,
        id_santri: idSantri || null,
        tabel_referensi: 'psb___registrasi',
        return_url: returnCancelUrl,
        cancel_url: returnCancelUrl
      }

      if (paymentChannel) {
        paymentData.payment_channel = paymentChannel
      }

      // Create transaction di iPayMu
      const result = await paymentTransactionAPI.createTransaction(paymentData)

      console.log('iPayMu Response:', result) // Debug log
      console.log('iPayMu Response Data:', result.data) // Debug log detail
      // Log qr_code jika ada (tanpa menampilkan seluruh string)
      if (result.data?.qr_code || result.data?.Data?.QRCode || result.data?.data?.qr_code) {
        const qrCodePreview = result.data?.qr_code || result.data?.Data?.QRCode || result.data?.data?.qr_code
        console.log('QR Code detected in response:', qrCodePreview ? `${qrCodePreview.substring(0, 30)}... (${qrCodePreview.length} chars)` : 'null')
      }

      if (result.success && result.data) {
        const responseData = result.data
        const { payment_url, session_id, transaction_id, ipaymu_transaction_id, payment_channel: responseChannel } = responseData

        // Cari VA number di berbagai kemungkinan field
        // iPayMu mengembalikan response dengan struktur: { "Status": 200, "Data": { "PaymentNo": "..." } }
        // Jadi PaymentNo ada di dalam Data object
        const dataObject = responseData.Data || responseData.data || responseData
        
        // Cari QR code di berbagai kemungkinan field
        let finalQrCode = dataObject.QRCode
          || dataObject.qr_code
          || dataObject.qrCode
          || dataObject.QR_Code
          || dataObject.qr_string
          || dataObject.QrString
          || dataObject.qrString
          || responseData.QRCode
          || responseData.qr_code
          || responseData.qrCode
          || responseData.QR_Code
          || responseData.qr_string
          || responseData.QrString
          || responseData.qrString
          || null
        
        // Jika qr_code tidak ditemukan, coba parse dari response_data jika ada
        if (!finalQrCode && responseData.response_data) {
          try {
            const responseDataParsed = typeof responseData.response_data === 'string' 
              ? JSON.parse(responseData.response_data) 
              : responseData.response_data
            const innerData = responseDataParsed.Data || responseDataParsed.data || responseDataParsed
            finalQrCode = innerData.QRCode
              || innerData.qr_code
              || innerData.qrCode
              || innerData.QR_Code
              || innerData.qr_string
              || innerData.QrString
              || innerData.qrString
              || responseDataParsed.QRCode
              || responseDataParsed.qr_code
              || responseDataParsed.qrCode
              || null
          } catch (e) {
            console.error('Error parsing response_data for QR code:', e)
          }
        }
        
        console.log('QR Code Found:', finalQrCode ? 'Yes' : 'No', finalQrCode ? finalQrCode.substring(0, 50) + '...' : 'null') // Debug log
        
        const finalVaNumber = dataObject.PaymentNo
          || dataObject.paymentNo
          || dataObject.payment_no
          || dataObject.Payment_No
          || responseData.PaymentNo
          || responseData.paymentNo
          || responseData.payment_no
          || responseData.Payment_No
          || dataObject.va_number 
          || dataObject.vaNumber 
          || dataObject.va 
          || dataObject.Va
          || dataObject.VA
          || responseData.va_number 
          || responseData.vaNumber 
          || responseData.va 
          || responseData.Va
          || responseData.VA
          || null

        console.log('VA Number Found:', finalVaNumber) // Debug log

        // Waktu kadaluwarsa dari backend (sesuai method/channel: BRI 2j, BSI 3j, QRIS 5m, dll) — jangan pakai 24 jam tetap
        const expiredAtTs = responseData.expired_at
          ? new Date(responseData.expired_at).getTime()
          : (Date.now() + 24 * 60 * 60 * 1000)

        // Jika VA number tidak ada di response, coba ambil dari database menggunakan transaction_id
        let finalVaNumberWithFallback = finalVaNumber
        if (!finalVaNumberWithFallback && transaction_id) {
          try {
            // Coba ambil dari payment___transaction menggunakan transaction_id
            const statusResult = await paymentTransactionAPI.checkStatus(session_id || transaction_id)
            if (statusResult.success && statusResult.data) {
              const transactionData = statusResult.data
              finalVaNumberWithFallback = transactionData.va_number 
                || transactionData.vaNumber 
                || transactionData.va 
                || transactionData.Va
                || null
              console.log('VA Number from DB:', finalVaNumberWithFallback) // Debug log
            }
          } catch (err) {
            console.error('Error fetching VA from DB:', err)
          }
        }

        // Dapatkan nama bank dari channel yang dipilih user (bukan dari response)
        // Gunakan paymentChannel dari state karena itu yang dipilih user
        let bankName = 'Bank'
        if (paymentChannel) {
          if (paymentMethod === 'va') {
            const channelData = vaChannels.find(c => c.value === paymentChannel)
            bankName = channelData ? channelData.label : paymentChannel.toUpperCase()
          } else if (paymentMethod === 'cstore') {
            const channelData = cstoreChannels.find(c => c.value === paymentChannel)
            bankName = channelData ? channelData.label : paymentChannel.toUpperCase()
          } else if (paymentMethod === 'qris') {
            bankName = 'QRIS'
          }
        } else if (paymentMethod === 'qris') {
          bankName = 'QRIS'
        } else if (responseChannel) {
          // Fallback: gunakan dari response jika ada
          bankName = responseChannel.toUpperCase()
        }

        console.log('VA Info:', { finalVaNumber: finalVaNumberWithFallback, bankName, paymentChannel, paymentMethod }) // Debug log

        // Simpan informasi VA untuk ditampilkan di modal
        // Prioritas: VA number > QR code > payment URL
        const amount = parseFloat(ipaymuAmount.replace(/\./g, '')) || 0
        const localCreatedAt = Date.now()

        if (finalVaNumberWithFallback) {
          setVaInfo({
            va_number: finalVaNumberWithFallback,
            bank: bankName,
            payment_method: paymentMethod,
            payment_channel: paymentChannel || null,
            amount: amount,
            admin_fee: responseData.admin_fee ?? 0,
            total: responseData.total ?? amount,
            payment_url,
            qr_code: finalQrCode,
            session_id,
            transaction_id,
            ipaymu_transaction_id: ipaymu_transaction_id || transaction_id,
            expired_at: expiredAtTs,
            localCreatedAt
          })
          
          // Pindah ke step 3 (status pending)
          setStepDirection(1) // Maju ke kanan
          goToIPaymuStep(3)
          
          // Tetap buka payment URL di tab baru jika ada
          if (payment_url) {
            window.open(payment_url, '_blank')
          }
        } else if (finalQrCode) {
          setVaInfo({
            va_number: null,
            bank: bankName,
            payment_method: paymentMethod,
            payment_channel: paymentChannel || null,
            amount: amount,
            admin_fee: responseData.admin_fee ?? 0,
            total: responseData.total ?? amount,
            payment_url: null,
            qr_code: finalQrCode,
            session_id,
            transaction_id,
            ipaymu_transaction_id: ipaymu_transaction_id || transaction_id,
            expired_at: expiredAtTs,
            localCreatedAt
          })
          
          // Pindah ke step 3 (status pending)
          setStepDirection(1) // Maju ke kanan
          goToIPaymuStep(3)
        } else if (payment_url) {
          setVaInfo({
            va_number: null,
            bank: bankName,
            payment_method: paymentMethod,
            payment_channel: paymentChannel || null,
            amount: amount,
            admin_fee: responseData.admin_fee ?? 0,
            total: responseData.total ?? amount,
            payment_url,
            qr_code: null,
            session_id,
            transaction_id,
            expired_at: expiredAtTs,
            localCreatedAt
          })
          
          // Pindah ke step 3 (status pending)
          setStepDirection(1) // Maju ke kanan
          goToIPaymuStep(3)
          
          window.open(payment_url, '_blank')
        } else {
          setVaInfo({
            va_number: null,
            bank: bankName,
            payment_method: paymentMethod,
            payment_channel: paymentChannel || null,
            amount: amount,
            admin_fee: responseData.admin_fee ?? 0,
            total: responseData.total ?? amount,
            payment_url: null,
            qr_code: null,
            session_id,
            transaction_id,
            expired_at: expiredAtTs,
            localCreatedAt
          })
          
          // Pindah ke step 3 (status pending)
          setStepDirection(1) // Maju ke kanan
          goToIPaymuStep(3)
        }

        if (session_id) {
          writeIpaymuSessionPersistence(session_id, registrasi?.id, idSantri)
        }

        setTransactionStatus('pending')
        paymentResolvedRef.current = false
        if (responseData.reused_existing) {
          showNotification('Memakai tagihan yang sama (nominal & metode sama, belum kedaluwarsa). Tidak dibuat order baru. Hitung mundur mengikuti sisa waktu berlaku.', 'info')
        } else if (finalVaNumberWithFallback) {
          showNotification('Pembayaran berhasil dibuat', 'success')
        } else if (finalQrCode) {
          showNotification('QR Code pembayaran berhasil dibuat', 'success')
        } else if (payment_url) {
          showNotification('Halaman pembayaran iPayMu dibuka di tab baru', 'success')
        } else {
          showNotification('Pembayaran berhasil dibuat', 'success')
        }

        // Simpan session_id untuk pengecekan status nanti
        if (session_id) {
          localStorage.setItem(`ipaymu_session_${transaction_id || Date.now()}`, session_id)
        }

        // Sinkron transaksi + parent (cache dashboard/pembayaran) setelah order dibuat
        setTimeout(() => {
          void syncAfterPembayaranMutation()
        }, 2000)
      } else {
        throw new Error(result.message || 'Gagal membuat transaksi iPayMu')
      }
    } catch (err) {
      console.error('Error creating iPayMu payment:', err)
      const errorMessage = err.response?.data?.message || err.message || 'Gagal membuat pembayaran iPayMu'
      showNotification(errorMessage, 'error')
      clearIpaymuSessionPersistence()
      setVaInfo(null)
      goToPaymentOpen()
      setIpaymuAmount('')
    } finally {
      setProcessingIPaymu(false)
    }
  }

  // Handle Cancel Transaction
  const handleCancelTransaction = async () => {
    if (!vaInfo?.transaction_id) return
    if (cancelInProgressRef.current || isCancelling) return // Cegah double submit

    cancelInProgressRef.current = true
    setIsCancelling(true)
    try {
      const result = await paymentTransactionAPI.cancelTransaction(vaInfo.transaction_id)
      // Handle berbagai format response (success di root atau di data)
      const ok = result && (result.success === true || result.data?.status === 'cancelled')

      if (ok) {
        showNotification('Transaksi berhasil dibatalkan', 'success')
        setShowCancelModal(false)
        setVaInfo(null)
        setTransactionStatus('cancelled')
        goToPaymentOpen()
        await syncAfterPembayaranMutation()
      } else {
        showNotification(result?.message || 'Gagal membatalkan transaksi', 'error')
      }
    } catch (err) {
      console.error('Error cancelling transaction:', err)
      showNotification(err.response?.data?.message || 'Terjadi kesalahan saat membatalkan transaksi', 'error')
    } finally {
      setIsCancelling(false)
      cancelInProgressRef.current = false
    }
  }

  // Ubah = batalkan pesanan sekarang, lalu tampilkan wizard buat pesanan baru (tanpa API update)
  const handleUbahTransaction = async () => {
    if (!vaInfo?.transaction_id) return
    if (!window.confirm('Ubah pesanan? Pesanan saat ini akan dibatalkan. Setelah itu Anda bisa memasukkan nominal dan metode baru, lalu buat pesanan baru.')) return
    if (cancelInProgressRef.current || isCancelling) return

    cancelInProgressRef.current = true
    setIsCancelling(true)
    try {
      const result = await paymentTransactionAPI.cancelTransaction(vaInfo.transaction_id)
      const ok = result && (result.success === true || result.data?.status === 'cancelled')
      if (ok) {
        showNotification('Pesanan dibatalkan. Silakan buat pesanan baru.', 'success')
        setShowEditModal(false)
        clearIpaymuSessionPersistence()
        setVaInfo(null)
        setTransactionStatus(null)
        goToIPaymuStep(1)
        setPaymentMethod('')
        setPaymentChannel('')
        setOpenAccordion(null)
        setIpaymuAmount('')
        await syncAfterPembayaranMutation()
      } else {
        showNotification(result?.message || 'Gagal membatalkan pesanan', 'error')
      }
    } catch (err) {
      console.error('Error ubah (cancel) transaction:', err)
      showNotification(err.response?.data?.message || 'Terjadi kesalahan. Coba lagi.', 'error')
    } finally {
      setIsCancelling(false)
      cancelInProgressRef.current = false
    }
  }

  // Handle Update Transaction (tidak dipakai; Ubah sekarang = cancel + buat baru)
  const handleUpdateTransaction = async () => {
    if (!vaInfo?.transaction_id) return

    setIsUpdating(true)
    try {
      // Ambil data dari form edit
      const amount = parseFloat(ipaymuAmount.replace(/\./g, '')) || 0
      const minAmount = 100000

      if (!amount || amount <= 0) {
        showNotification('Masukkan nominal pembayaran', 'error')
        setIsUpdating(false)
        return
      }

      if (amount < minAmount) {
        showNotification(`Minimal pembayaran adalah Rp ${minAmount.toLocaleString('id-ID')}`, 'error')
        setIsUpdating(false)
        return
      }

      if (amount > kurang) {
        showNotification(`Pembayaran tidak boleh melebihi sisa kurang (Rp ${kurang.toLocaleString('id-ID')})`, 'error')
        setIsUpdating(false)
        return
      }

      if (!paymentMethod) {
        showNotification('Pilih metode pembayaran terlebih dahulu', 'error')
        setIsUpdating(false)
        return
      }

      // Validasi payment channel jika diperlukan
      if (paymentMethod === 'va' && !paymentChannel) {
        showNotification('Pilih bank untuk Virtual Account', 'error')
        setIsUpdating(false)
        return
      }

      if (paymentMethod === 'cstore' && !paymentChannel) {
        showNotification('Pilih merchant untuk Convenience Store', 'error')
        setIsUpdating(false)
        return
      }

      const updateData = {
        amount: amount,
        payment_method: paymentMethod,
        payment_channel: paymentChannel || null
      }

      const result = await paymentTransactionAPI.updateTransaction(vaInfo.transaction_id, updateData)
      
      if (result.success) {
        showNotification('Transaksi berhasil diupdate', 'success')
        setShowEditModal(false)
        
        // Kembali ke list dulu, lalu fetch pending
        setVaInfo(null)
        goToPaymentOpen()
        
        // Fetch pending transaction baru setelah update
        setTimeout(async () => {
          try {
            const pendingResult = await paymentTransactionAPI.getPendingTransaction(registrasi?.id, idSantri)
            
            if (pendingResult && pendingResult.success === true && pendingResult.data) {
              const pendingTransaction = pendingResult.data
              if (isPaymentPendingExpiredClient(pendingTransaction)) {
                clearIpaymuSessionPersistence()
                goToIPaymuStep(1)
                showNotification('Tagihan sudah kedaluwarsa. Silakan buat pembayaran baru.', 'info')
                void syncAfterPembayaranMutation()
                return
              }
              // Ada transaksi pending baru, tampilkan
              // Tentukan bank name
              let bankName = 'Bank'
              if (pendingTransaction.payment_method === 'va' && pendingTransaction.payment_channel) {
                const channelData = vaChannels.find(c => c.value === pendingTransaction.payment_channel)
                bankName = channelData ? channelData.label : pendingTransaction.payment_channel.toUpperCase()
              } else if (pendingTransaction.payment_method === 'cstore' && pendingTransaction.payment_channel) {
                const channelData = cstoreChannels.find(c => c.value === pendingTransaction.payment_channel)
                bankName = channelData ? channelData.label : pendingTransaction.payment_channel.toUpperCase()
              } else if (pendingTransaction.payment_method === 'qris') {
                bankName = 'QRIS'
              }
              
              // Extract qr_code
              let qrCode = pendingTransaction.qr_code || null
              if (!qrCode && pendingTransaction.response_data) {
                try {
                  const responseData = typeof pendingTransaction.response_data === 'string' 
                    ? JSON.parse(pendingTransaction.response_data) 
                    : pendingTransaction.response_data
                  const dataObject = responseData.Data || responseData.data || responseData
                  qrCode = dataObject.QRCode || dataObject.qr_code || dataObject.qrCode || null
                } catch (e) {
                  console.error('Error parsing response_data for QR code:', e)
                }
              }
              
              // Pakai expired_at dari API/DB (sesuai method: BRI 2j, BSI 3j, QRIS 5m, dll); fallback 24j hanya jika data lama
              const expiredAtUpdate = pendingTransaction.expired_at
                ? new Date(pendingTransaction.expired_at).getTime()
                : (pendingTransaction.tanggal_dibuat ? new Date(pendingTransaction.tanggal_dibuat).getTime() + 24 * 60 * 60 * 1000 : Date.now() + 24 * 60 * 60 * 1000)
              // Set VA info dari transaksi baru dan buka flow iPayMu step 1
              setVaInfo({
                va_number: pendingTransaction.va_number || null,
                bank: bankName,
                payment_method: pendingTransaction.payment_method || null,
                payment_channel: pendingTransaction.payment_channel || null,
                amount: pendingTransaction.amount || null,
                payment_url: pendingTransaction.payment_url || null,
                qr_code: qrCode,
                session_id: pendingTransaction.session_id || null,
                transaction_id: pendingTransaction.id || pendingTransaction.trx_id || null,
                ipaymu_transaction_id: pendingTransaction.trx_id || pendingTransaction.id || null,
                expired_at: expiredAtUpdate
              })
              
              goToIPaymuStep(1)
              showNotification('Menampilkan transaksi baru yang sudah diupdate', 'info')
            } else {
              // Tidak ada transaksi pending baru, buka modal untuk membuat baru
              goToIPaymuStep(1)
              showNotification('Silakan buat pembayaran baru dengan data yang sudah diupdate', 'info')
            }
          } catch (err) {
            console.error('Error fetching pending transaction after update:', err)
            // Tetap buka modal untuk membuat baru
            goToIPaymuStep(1)
          }
          
          void syncAfterPembayaranMutation()
        }, 1000)
      } else {
        showNotification(result.message || 'Gagal mengupdate transaksi', 'error')
      }
    } catch (err) {
      console.error('Error updating transaction:', err)
      showNotification('Terjadi kesalahan saat mengupdate transaksi', 'error')
    } finally {
      setIsUpdating(false)
    }
  }

  // Handle Delete Bukti TF
  const handleDeleteClick = (e, item) => {
    e.stopPropagation()
    setItemToDelete(item)
    setShowDeleteModal(true)
  }

  const confirmDelete = async () => {
    if (!itemToDelete?.bukti?.id) return

    setIsDeleting(true)
    try {
      const result = await pendaftaranAPI.deleteBerkas(itemToDelete.bukti.id)
      if (result.success) {
        showNotification('Bukti pembayaran berhasil dihapus', 'success')
        setShowDeleteModal(false)
        setItemToDelete(null)
        await syncAfterPembayaranMutation()
        if (onClose) onClose()
      } else {
        showNotification(result.message || 'Gagal menghapus bukti pembayaran', 'error')
      }
    } catch (err) {
      console.error('Error deleting bukti:', err)
      showNotification('Terjadi kesalahan saat menghapus bukti pembayaran', 'error')
    } finally {
      setIsDeleting(false)
    }
  }

  // Helper function untuk mendapatkan warna via
  const getViaColor = (via) => {
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
    return viaColors[via] || '#64748b'
  }


  const offcanvasContent = !isOpen ? null : createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black bg-opacity-50"
            style={{ zIndex: 100 }}
          />

          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 rounded-t-2xl shadow-2xl overflow-hidden"
            style={{
              zIndex: 101,
              maxHeight: 'calc(100vh - 64px)',
              paddingBottom: 'env(safe-area-inset-bottom, 0)'
            }}
          >
            <div className="md:grid md:grid-cols-2" style={{ height: 'calc(100vh - 64px)', maxHeight: 'calc(100vh - 64px)' }}>
              {/* Kolom Gambar (hanya tampil di layar medium ke atas) */}
              <div className="hidden md:block relative overflow-hidden" style={{ height: '100%' }}>
                <img 
                  src={getGambarUrl('/icon-2.png')} 
                  alt="Gedung Pesantren" 
                  className="w-full h-full object-cover" 
                />
                <div className="absolute inset-0 bg-teal-800 bg-opacity-50"></div>
              </div>

              {/* Kolom Konten */}
              <div className="flex flex-col" style={{ height: '100%', maxHeight: '100%', overflow: 'hidden' }}>
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
              <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
                {showIPaymuModal ? (vaInfo ? 'Informasi Pembayaran' : 'Tambah Pembayaran') : 'Rincian Pembayaran'}
              </h2>
              <button
                onClick={showIPaymuModal ? () => {
                  setTransactionStatus(null)
                  goToPaymentOpen()
                } : onClose}
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                </svg>
              </button>
            </div>

            {/* Content - List atau iPayMu */}
                <div className={`flex-1 flex flex-col min-h-0 p-4 ${showIPaymuModal ? 'overflow-hidden pb-4' : 'overflow-y-auto pb-20 md:pb-4'}`}>
                  {showIPaymuModal ? (
                  /* === Konten iPayMu (dalam offcanvas) === */
                  <div className="flex flex-col flex-1 min-h-0">
                    {/* FIXED - Nominal-Metode indicator (tidak terscroll) */}
                    {!vaInfo && (
                      <div className="flex-shrink-0 mb-2">
                        <div className="flex items-center justify-center gap-1 sm:gap-2">
                          <div className={`flex items-center gap-1 ${ipaymuStep >= 1 ? 'text-teal-600 dark:text-teal-400' : 'text-gray-400 dark:text-gray-500'}`}>
                            <div className={`w-6 h-6 sm:w-8 sm:h-8 rounded-full flex items-center justify-center font-semibold text-xs sm:text-sm ${
                              ipaymuStep >= 1 ? 'bg-teal-600 dark:bg-teal-500 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                            }`}>{ipaymuStep > 1 ? '✓' : '1'}</div>
                            <span className="text-xs sm:text-sm font-medium">Nominal</span>
                          </div>
                          <div className={`h-0.5 w-6 sm:w-12 ${ipaymuStep >= 2 ? 'bg-teal-600 dark:bg-teal-500' : 'bg-gray-300 dark:bg-gray-600'}`}></div>
                          <div className={`flex items-center gap-1 ${ipaymuStep >= 2 ? 'text-teal-600 dark:text-teal-400' : 'text-gray-400 dark:text-gray-500'}`}>
                            <div className={`w-6 h-6 sm:w-8 sm:h-8 rounded-full flex items-center justify-center font-semibold text-xs sm:text-sm ${
                              ipaymuStep >= 2 ? 'bg-teal-600 dark:bg-teal-500 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                            }`}>{ipaymuStep > 2 ? '✓' : '2'}</div>
                            <span className="text-xs sm:text-sm font-medium">Metode</span>
                          </div>
                          <div className={`h-0.5 w-6 sm:w-12 ${ipaymuStep >= 3 ? 'bg-teal-600 dark:bg-teal-500' : 'bg-gray-300 dark:bg-gray-600'}`}></div>
                          <div className={`flex items-center gap-1 ${ipaymuStep >= 3 ? 'text-teal-600 dark:text-teal-400' : 'text-gray-400 dark:text-gray-500'}`}>
                            <div className={`w-6 h-6 sm:w-8 sm:h-8 rounded-full flex items-center justify-center font-semibold text-xs sm:text-sm ${
                              ipaymuStep >= 3 ? 'bg-teal-600 dark:bg-teal-500 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                            }`}>3</div>
                            <span className="text-xs sm:text-sm font-medium">Bayar</span>
                          </div>
                        </div>
                      </div>
                    )}
                    {isSandboxMode && (
                    <div className="flex-shrink-0 mb-3 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                      <div className="flex items-start gap-2">
                        <svg className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        <div className="flex-1">
                          <p className="text-xs font-medium text-amber-800 dark:text-amber-200 mb-1">Mode Sandbox / Uji Coba</p>
                          <p className="text-xs text-amber-700 dark:text-amber-300">iPayMu saat ini masih dalam mode sandbox. Transaksi tidak memproses pembayaran sebenarnya.</p>
                        </div>
                      </div>
                    </div>
                    )}
                    {/* SCROLLABLE - konten di bawah Nominal-Metode; pakai flex agar step-3 punya footer tetap */}
                    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                    <div className="relative flex flex-col flex-1 min-h-0">
                      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                      <AnimatePresence mode="wait" initial={false}>
                        {vaInfo && (() => {
                          const norm = transactionStatus ? String(transactionStatus).toLowerCase().trim() : null
                          return norm !== 'paid' && norm !== 'success'
                        })() && (
                          <motion.div key="step-3" initial={{ x: stepDirection === 1 ? 300 : -300, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: stepDirection === 1 ? -300 : 300, opacity: 0 }} transition={{ duration: 0.3 }} className="flex flex-col h-full min-h-0">
                            <div className="flex-1 overflow-y-auto pr-2 min-h-0" style={{ WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain' }}>
                              <div className="space-y-4 pb-4">
                                <div className={`p-4 rounded-lg border-2 ${
                                  ['expired','cancelled','failed'].includes(String(transactionStatus||'').toLowerCase())
                                    ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                                    : 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
                                }`}>
                                  <div className="flex items-center justify-between gap-3">
                                    <div className="flex-1">
                                      {transactionStatus === 'expired' && <><svg className="w-6 h-6 text-red-600 inline mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg><div className="font-semibold text-red-700">Transaksi Kadaluarsa</div><div className="text-sm text-red-600">Waktu pembayaran telah habis.</div></>}
                                      {transactionStatus === 'cancelled' && <><svg className="w-6 h-6 text-red-600 inline mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg><div className="font-semibold text-red-700">Transaksi Dibatalkan</div></>}
                                      {transactionStatus === 'failed' && <><svg className="w-6 h-6 text-red-600 inline mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg><div className="font-semibold text-red-700">Pembayaran Gagal</div></>}
                                      {!['expired','cancelled','failed'].includes(String(transactionStatus||'').toLowerCase()) && (
                                        <>
                                          <svg className="w-6 h-6 text-blue-600 animate-pulse inline mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                          <div>
                                            <div className="font-semibold text-blue-700">Menunggu Pembayaran</div>
                                            {countdownRemaining !== null && (
                                              <div className="text-sm text-blue-600 dark:text-blue-400 mt-1 font-mono">
                                                {countdownRemaining <= 0 ? 'Kadaluwarsa: 0:00:00' : (
                                                  <>Kadaluwarsa dalam: {String(Math.floor(countdownRemaining / 3600)).padStart(2, '0')}:{String(Math.floor((countdownRemaining % 3600) / 60)).padStart(2, '0')}:{String(countdownRemaining % 60).padStart(2, '0')}</>
                                                )}
                                              </div>
                                            )}
                                          </div>
                                        </>
                                      )}
                                    </div>
                                    {vaInfo.session_id && (
                                      <button onClick={async () => { if (!vaInfo.session_id) return; setIsCheckingStatus(true); try { const r = await paymentTransactionAPI.checkStatus(vaInfo.session_id); if (r.success && r.data) { setTransactionStatus(r.data.status); const s = String(r.data.status||'').toLowerCase(); if (s==='paid'||s==='success') { showNotification('Pembayaran berhasil!','success'); goToIPaymuStep(4); await syncAfterPembayaranMutation(); } } } catch(e) {} finally { setIsCheckingStatus(false) } }} disabled={isCheckingStatus} className="p-2 rounded-lg bg-teal-100 dark:bg-teal-900/50 text-teal-600 hover:bg-teal-200" title="Cek status">
                                        {isCheckingStatus ? <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg> : <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>}
                                      </button>
                                    )}
                                  </div>
                                </div>
                                {(vaInfo.amount != null || vaInfo.admin_fee != null || vaInfo.total != null) && (
                                  <div className="p-4 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700">
                                    <div className="flex justify-between text-sm mb-1"><span className="text-gray-600 dark:text-gray-400">Nominal</span><span className="font-semibold text-gray-900 dark:text-gray-100">Rp {(vaInfo.amount ?? 0).toLocaleString('id-ID')}</span></div>
                                    <div className="flex justify-between text-sm mb-1"><span className="text-gray-600 dark:text-gray-400">Biaya admin</span><span className="font-semibold text-gray-900 dark:text-gray-100">Rp {(vaInfo.admin_fee ?? 0).toLocaleString('id-ID')}</span></div>
                                    <div className="flex justify-between text-sm pt-2 border-t border-gray-200 dark:border-gray-600"><span className="font-semibold text-gray-800 dark:text-gray-200">Total</span><span className="font-bold text-teal-600 dark:text-teal-400">Rp {(vaInfo.total ?? vaInfo.amount ?? 0).toLocaleString('id-ID')}</span></div>
                                  </div>
                                )}
                                {vaInfo.va_number && (
                                  <div className="p-4 rounded-lg bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-800">
                                    <div className="flex items-center justify-between gap-3 mb-3">
                                      <span className="text-sm font-medium text-teal-700 dark:text-teal-300">Bayar via {vaInfo.bank || (vaInfo.payment_method === 'cstore' ? 'Convenience Store' : 'Virtual Account')}</span>
                                      <span className="flex-shrink-0">
                                        {vaInfo.payment_method === 'va' && <BankIcon bank={vaInfo.payment_channel || 'bca'} className="h-10" />}
                                        {vaInfo.payment_method === 'cstore' && <CStoreIcon store={vaInfo.payment_channel || 'alfamart'} className="h-10" />}
                                      </span>
                                    </div>
                                    <div className="font-mono text-lg font-bold text-teal-800 dark:text-teal-200 break-all">{vaInfo.va_number}</div>
                                    <div className="text-sm text-teal-600 dark:text-teal-400 mt-1">{vaInfo.bank || 'Virtual Account'}</div>
                                    <button onClick={() => { navigator.clipboard.writeText(vaInfo.va_number); showNotification(vaInfo.payment_method === 'cstore' ? 'Kode pembayaran disalin' : 'Nomor VA disalin','success') }} className="mt-2 text-sm text-teal-600 hover:text-teal-800">Salin</button>
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
                                      {!['alfamart','indomaret'].includes((vaInfo.payment_channel || '').toLowerCase()) && (
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
                                    <div className="flex items-center justify-between gap-2 mb-2">
                                      <span className="text-sm font-medium text-teal-700 dark:text-teal-300">Bayar via {vaInfo.payment_method === 'qris' ? 'QRIS' : (vaInfo.bank || '')}</span>
                                      <span className="flex-shrink-0">{vaInfo.payment_method === 'qris' && <QRISIcon className="h-8" />}</span>
                                    </div>
                                    <img src={getQrImageSrc(vaInfo.qr_code)} alt="QR Pembayaran" className="w-full max-w-[200px] h-auto mx-auto rounded" onError={e => { const fallback = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(vaInfo.qr_code)}`; if (e.target.src !== fallback) e.target.src = fallback; else e.target.style.display = 'none'; }} />
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
                                            showNotification('Gambar QR berhasil diunduh', 'success')
                                          } catch (err) {
                                            showNotification('Gagal mengunduh gambar QR', 'error')
                                          }
                                        }}
                                        className="mt-2 px-3 py-1.5 text-xs font-medium text-teal-700 dark:text-teal-300 bg-teal-50 dark:bg-teal-900/30 border border-teal-200 dark:border-teal-700 rounded-lg hover:bg-teal-100 dark:hover:bg-teal-900/50 inline-flex items-center gap-1.5"
                                      >
                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                                        Unduh gambar QR
                                      </button>
                                    )}
                                    <div className="text-sm text-teal-600 mt-2">{vaInfo.payment_method==='qris' ? 'QRIS' : (vaInfo.bank||'')}</div>
                                  </div>
                                )}
                              </div>
                            </div>
                            {/* Footer tetap: Buka Halaman Bayar, Ubah, Batal — tidak ikut scroll */}
                            {(vaInfo.payment_url || vaInfo.ipaymu_transaction_id || vaInfo.session_id) && (
                              <div className="flex-shrink-0 flex flex-wrap items-center justify-between gap-2 p-3 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                                {vaInfo.payment_url && <a href={vaInfo.payment_url} target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-xs font-medium text-center min-w-0 flex-1 sm:flex-initial">Buka Halaman Bayar</a>}
                                <div className="flex gap-2 flex-shrink-0 ml-auto">
                                  <button onClick={handleUbahTransaction} disabled={isCancelling} className="px-3 py-1.5 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-lg text-xs font-medium disabled:opacity-50 shadow-sm">Ubah</button>
                                  <button onClick={() => setShowCancelModal(true)} className="px-3 py-1.5 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg text-xs font-medium shadow-sm">Batal</button>
                                </div>
                              </div>
                            )}
                          </motion.div>
                        )}
                        {vaInfo && (() => { const s = transactionStatus ? String(transactionStatus).toLowerCase().trim() : null; return s === 'paid' || s === 'success' })( ) && (
                          <motion.div key="step-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }} className="flex flex-col items-center justify-center min-h-[280px] py-8 px-4">
                            <div className="w-full max-w-sm mx-auto text-center space-y-6">
                              <div className="flex justify-center">
                                <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center">
                                  <svg className="w-8 h-8 text-emerald-600 dark:text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                  </svg>
                                </div>
                              </div>
                              <div className="space-y-1">
                                <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 tracking-tight">Pembayaran Sukses</h3>
                                <p className="text-sm text-gray-500 dark:text-gray-400">Transaksi Anda telah berhasil diproses.</p>
                              </div>
                              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-gray-100 dark:bg-gray-700/80 text-gray-600 dark:text-gray-300 text-xs font-medium">
                                {vaInfo.payment_method === 'va' && <BankIcon bank={vaInfo.payment_channel || 'bca'} className="h-5" />}
                                {vaInfo.payment_method === 'cstore' && <CStoreIcon store={vaInfo.payment_channel || 'alfamart'} className="h-5" />}
                                {vaInfo.payment_method === 'qris' && <QRISIcon className="h-5" />}
                                <span>{vaInfo.payment_method === 'qris' ? 'QRIS' : (vaInfo.bank || 'Pembayaran')}</span>
                              </div>
                              <button
                                onClick={() => { setTransactionStatus(null); setVaInfo(null); goToPaymentOpen() }}
                                className="w-full mt-2 px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-medium rounded-lg transition-colors"
                              >
                                Tutup
                              </button>
                            </div>
                          </motion.div>
                        )}
                        {!vaInfo && ipaymuStep === 1 && (
                          <motion.div key="step-1" initial={{ x: stepDirection === 1 ? 300 : -300, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: stepDirection === 1 ? -300 : 300, opacity: 0 }} transition={{ duration: 0.3 }} className="flex-1 min-h-0 space-y-4 overflow-y-auto">
                            <div><h4 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-3">Mau Bayar Berapa?</h4>
                              <div className="text-sm text-gray-600 dark:text-gray-400 mb-2">Sisa kurang: <strong className="text-red-600">Rp {kurang.toLocaleString('id-ID')}</strong></div>
                              <div className="text-xs text-gray-500 mb-4">Minimal pembayaran: <strong>Rp 100.000</strong></div>
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Jumlah Pembayaran</label>
                              <input type="text" value={ipaymuAmount} onChange={handleAmountInput} placeholder="Masukkan nominal (min. 100.000)" className="w-full p-3 border-2 border-gray-300 dark:border-gray-600 rounded-lg focus:border-teal-500 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100 text-right font-mono text-lg" autoFocus />
                            </div>
                          </motion.div>
                        )}
                        {!vaInfo && ipaymuStep === 2 && (
                          <motion.div key="step-2" initial={{ x: stepDirection === 1 ? 300 : -300, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: stepDirection === 1 ? -300 : 300, opacity: 0 }} transition={{ duration: 0.3 }} className="flex-1 min-h-0 space-y-4 overflow-y-auto">
                            <div><h4 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-3">Pilih Metode Pembayaran</h4><div className="text-sm text-gray-600 dark:text-gray-400 mb-2">Nominal: <strong className="text-teal-600">Rp {ipaymuAmount||'0'}</strong></div></div>
                            <div className="mb-2 border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden">
                              <button type="button" onClick={() => handleAccordionToggle('va')} className={`w-full px-4 py-3 flex items-center justify-between bg-white dark:bg-gray-700 ${openAccordion==='va'?'border-b border-gray-300':''}`}>
                                <div className="flex items-center gap-2"><BankIcon bank="bca" className="h-7" /><span className="font-medium">Virtual Account (VA)</span></div>
                                <motion.svg animate={{ rotate: openAccordion==='va'?180:0 }} className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></motion.svg>
                              </button>
                              <AnimatePresence>{openAccordion==='va' && <motion.div initial={{ height:0, opacity:0 }} animate={{ height:'auto', opacity:1 }} exit={{ height:0, opacity:0 }} className="overflow-hidden"><div className="p-3 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-300 flex flex-col gap-2">{vaChannels.map(ch => <button key={ch.value} type="button" onClick={() => handleChannelSelect(ch.value)} className={`px-3 py-2.5 text-sm rounded-lg border-2 flex items-center gap-3 w-full text-left ${paymentChannel===ch.value?'border-teal-500 bg-teal-50 dark:bg-teal-900/20 text-teal-700 font-medium':'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700'}`}>{paymentChannel===ch.value ? <span className="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded-full bg-teal-500 text-white"><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" /></svg></span> : <span className="flex-shrink-0 w-5 h-5 rounded-full border-2 border-gray-400 dark:border-gray-500" />}<span className="flex-1 min-w-0 font-medium">{ch.label}</span><BankIcon bank={ch.value} className="h-8" /></button>)}</div></motion.div>}</AnimatePresence>
                            </div>
                            <div className="mb-2 border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden">
                              <button type="button" onClick={() => handleAccordionToggle('qris')} className={`w-full px-4 py-3 flex items-center justify-between bg-white dark:bg-gray-700 ${openAccordion==='qris'?'border-b border-gray-300':''}`}>
                                <div className="flex items-center gap-2"><QRISIcon className="h-7" /><span className="font-medium">QRIS</span></div>
                                <motion.svg animate={{ rotate: openAccordion==='qris'?180:0 }} className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></motion.svg>
                              </button>
                              <AnimatePresence>{openAccordion==='qris' && <motion.div initial={{ height:0, opacity:0 }} animate={{ height:'auto', opacity:1 }} exit={{ height:0, opacity:0 }} className="overflow-hidden"><div className="p-3 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-300 space-y-2"><div className="text-sm text-gray-600 dark:text-gray-400">Scan QR code untuk pembayaran</div><div className="flex flex-wrap items-center gap-3"><img src={getGambarUrl('/logo/dana.png')} alt="Dana" className="h-9 w-auto max-w-[90px] object-contain object-center" /><img src={getGambarUrl('/logo/gopay.png')} alt="Gopay" className="h-9 w-auto max-w-[90px] object-contain object-center" /><img src={getGambarUrl('/logo/shopee-pay.png')} alt="ShopeePay" className="h-9 w-auto max-w-[90px] object-contain object-center" /><img src={getGambarUrl('/logo/ovo.png')} alt="OVO" className="h-9 w-auto max-w-[90px] object-contain object-center" /></div></div>{paymentMethod==='qris' && <div className="px-3 pb-2 text-xs text-teal-600">✓ QRIS dipilih</div>}</motion.div>}</AnimatePresence>
                            </div>
                            <div className="mb-2 border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden">
                              <button type="button" onClick={() => handleAccordionToggle('cstore')} className={`w-full px-4 py-3 flex items-center justify-between bg-white dark:bg-gray-700 ${openAccordion==='cstore'?'border-b border-gray-300':''}`}>
                                <div className="flex items-center gap-2"><CStoreIcon store="alfamart" className="h-7" /><span className="font-medium">Convenience Store</span></div>
                                <motion.svg animate={{ rotate: openAccordion==='cstore'?180:0 }} className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></motion.svg>
                              </button>
                              <AnimatePresence>{openAccordion==='cstore' && <motion.div initial={{ height:0, opacity:0 }} animate={{ height:'auto', opacity:1 }} exit={{ height:0, opacity:0 }} className="overflow-hidden"><div className="p-3 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-300 flex flex-col gap-2">{cstoreChannels.map(ch => <button key={ch.value} type="button" onClick={() => handleChannelSelect(ch.value)} className={`px-3 py-2.5 text-sm rounded-lg border-2 flex items-center gap-3 w-full text-left ${paymentChannel===ch.value?'border-teal-500 bg-teal-50 dark:bg-teal-900/20 text-teal-700 font-medium':'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700'}`}>{paymentChannel===ch.value ? <span className="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded-full bg-teal-500 text-white"><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" /></svg></span> : <span className="flex-shrink-0 w-5 h-5 rounded-full border-2 border-gray-400 dark:border-gray-500" />}<span className="flex-1 min-w-0 font-medium">{ch.label}</span><CStoreIcon store={ch.value} className="h-8" /></button>)}</div></motion.div>}</AnimatePresence>
                            </div>
                          </motion.div>
                        )}
                        {!vaInfo && ipaymuStep === 3 && (
                          <motion.div key="step-3-confirm" initial={{ x: stepDirection === 1 ? 300 : -300, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: stepDirection === 1 ? -300 : 300, opacity: 0 }} transition={{ duration: 0.3 }} className="space-y-4">
                            <h4 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-3">Konfirmasi Pembayaran</h4>
                            {(() => {
                              const amount = parseFloat(ipaymuAmount.replace(/\./g,''))||0
                              const methodLabel = paymentMethod === 'qris' ? 'QRIS' : paymentMethod === 'va' ? (vaChannels.find(c => c.value === paymentChannel)?.label || paymentChannel) : (cstoreChannels.find(c => c.value === paymentChannel)?.label || paymentChannel)
                              return (
                            <div className="space-y-3 p-4 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700">
                              <div className="flex justify-between text-sm"><span className="text-gray-600 dark:text-gray-400">Nominal</span><span className="font-semibold text-gray-900 dark:text-gray-100">Rp {amount.toLocaleString('id-ID')}</span></div>
                              <div className="flex justify-between text-sm pt-2 border-t border-gray-200 dark:border-gray-600"><span className="text-gray-600 dark:text-gray-400">Metode</span><span className="font-medium text-gray-800 dark:text-gray-200">{methodLabel}</span></div>
                            </div>
                              )
                            })()}
                          </motion.div>
                        )}
                      </AnimatePresence>
                      </div>
                    </div>
                    </div>
                    {!vaInfo && (ipaymuStep === 1 || ipaymuStep === 2 || ipaymuStep === 3) && (
                      <div className="flex-shrink-0 p-3 pt-2 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                        <div className="flex gap-2">
                          {ipaymuStep === 1 && (
                            <>
                              <button onClick={() => goToPaymentOpen()} className="flex-1 px-3 py-1.5 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 text-xs font-medium">Batal</button>
                              <button onClick={() => { const amount = parseFloat(ipaymuAmount.replace(/\./g,''))||0; const minAmount=100000; if(!amount||amount<=0){showNotification('Masukkan nominal pembayaran','error');return} if(amount<minAmount){showNotification(`Minimal Rp ${minAmount.toLocaleString('id-ID')}`,'error');return} if(amount>kurang){showNotification(`Tidak boleh melebihi Rp ${kurang.toLocaleString('id-ID')}`,'error');return} setStepDirection(1); goToIPaymuStep(2) }} className="flex-1 px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-xs font-medium flex items-center justify-center gap-1.5">Selanjutnya <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" /></svg></button>
                            </>
                          )}
                          {ipaymuStep === 2 && (
                            <>
                              <button onClick={() => { setStepDirection(-1); goToIPaymuStep(1) }} className="flex-1 px-3 py-1.5 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-lg hover:bg-gray-300 text-xs font-medium flex items-center justify-center gap-1.5"><svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" /></svg>Kembali</button>
                              <button onClick={() => { if (!paymentMethod) { showNotification('Pilih metode pembayaran terlebih dahulu', 'error'); return } if (paymentMethod === 'va' && !paymentChannel) { showNotification('Pilih bank untuk Virtual Account', 'error'); return } if (paymentMethod === 'cstore' && !paymentChannel) { showNotification('Pilih merchant untuk Convenience Store', 'error'); return } setStepDirection(1); goToIPaymuStep(3) }} className="flex-1 px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-xs font-medium flex items-center justify-center gap-1.5">Selanjutnya<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" /></svg></button>
                            </>
                          )}
                          {ipaymuStep === 3 && (
                            <>
                              <button onClick={() => { setStepDirection(-1); goToIPaymuStep(2) }} className="flex-1 px-3 py-1.5 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-lg hover:bg-gray-300 text-xs font-medium flex items-center justify-center gap-1.5"><svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" /></svg>Kembali</button>
                              <button onClick={handleIPaymuPayment} disabled={processingIPaymu} className="flex-1 px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-xs font-medium disabled:opacity-50 flex items-center justify-center gap-1.5">{processingIPaymu ? <><svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>Memproses...</> : 'Bayar'}</button>
                            </>
                          )}
                        </div>
                      </div>
                    )}
                    {!vaInfo && (
                      <div className="flex-shrink-0 pt-3 pb-1 border-t border-gray-200 dark:border-gray-700">
                        <p className="text-xs text-gray-600 dark:text-gray-400 text-center mb-1.5">Informasi Penting:</p>
                        <div className="flex flex-wrap gap-2 justify-center text-xs">
                          <Link to="/syarat-ketentuan" onClick={e => { e.preventDefault(); navigate('/syarat-ketentuan', { state: { from: '/pembayaran' } }) }} className="text-teal-600 dark:text-teal-400 hover:underline">Syarat & Ketentuan</Link>
                          <span className="text-gray-400">•</span>
                          <Link to="/kebijakan-pengembalian-dana" onClick={e => { e.preventDefault(); navigate('/kebijakan-pengembalian-dana', { state: { from: '/pembayaran' } }) }} className="text-teal-600 dark:text-teal-400 hover:underline">Kebijakan Pengembalian Dana</Link>
                          <span className="text-gray-400">•</span>
                          <Link to="/faq" onClick={e => { e.preventDefault(); navigate('/faq', { state: { from: '/pembayaran' } }) }} className="text-teal-600 dark:text-teal-400 hover:underline">FAQ</Link>
                        </div>
                      </div>
                    )}
                  </div>
                  ) : (
              <>
              {/* Peringatan ketika total wajib 0 */}
              {wajibNol && (
                <div className="mb-4 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700">
                  <p className="text-xs text-amber-800 dark:text-amber-200 font-medium mb-2">
                    Total wajib Rp 0. Cek kondisi pendaftaran (mungkin ada yang keliru), atau hubungi admin:
                  </p>
                  <a
                    href="https://wa.me/6282232999921"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-medium rounded-lg transition-colors"
                  >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                    </svg>
                    Hubungi Admin (WA)
                  </a>
                </div>
              )}
              {/* Ringkasan */}
              <div className="grid grid-cols-3 gap-3 mb-6">
                <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg text-center">
                  <div className="text-xs text-blue-600 dark:text-blue-400 mb-1">Total Wajib</div>
                  <div className="text-sm font-bold text-blue-700 dark:text-blue-300">
                    Rp {wajib.toLocaleString('id-ID')}
                  </div>
                </div>
                <div className="bg-green-50 dark:bg-green-900/20 p-3 rounded-lg text-center">
                  <div className="text-xs text-green-600 dark:text-green-400 mb-1">Bayar</div>
                  <div className="text-sm font-bold text-green-700 dark:text-green-300">
                    Rp {bayar.toLocaleString('id-ID')}
                  </div>
                </div>
                <div className="bg-red-50 dark:bg-red-900/20 p-3 rounded-lg text-center">
                  <div className="text-xs text-red-600 dark:text-red-400 mb-1">Kurang</div>
                  <div className="text-sm font-bold text-red-700 dark:text-red-300">
                    Rp {kurang.toLocaleString('id-ID')}
                  </div>
                </div>
              </div>

              {/* Payment History */}
              <div className="mb-4 border border-gray-200 dark:border-gray-700 rounded-lg p-2 bg-gray-50 dark:bg-gray-900/50">
                <h3 className="font-semibold text-sm mb-2 text-gray-700 dark:text-gray-300">Riwayat Pembayaran</h3>
                {paymentDataLoading ? (
                  <div className="text-center py-4">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-teal-600 mx-auto"></div>
                  </div>
                ) : combinedPaymentList.length === 0 ? (
                  <div className="text-center py-4">
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Tidak ada riwayat pembayaran.</p>
                    <p className="text-[10px] text-gray-400 dark:text-gray-500 italic">
                      Data pembayaran akan muncul setelah admin melakukan verifikasi pembayaran.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {combinedPaymentList.map((payment) => {
                      const paymentAmount = parseInt(payment.nominal || 0) || 0
                      const hijriyahStr = payment.hijriyah || '-'
                      const masehiStr = payment.masehi
                        ? new Date(payment.masehi).toLocaleDateString('id-ID')
                        : (payment.tanggal_dibuat
                          ? new Date(payment.tanggal_dibuat).toLocaleDateString('id-ID')
                          : '-')
                      const via = payment.via || 'Cash'
                      const viaColor = getViaColor(via)
                      const isPending = payment.type === 'pending'

                      // Tentukan apakah bisa diklik
                      // TF dengan bukti: preview bukti
                      // iPayMu: tampilkan modal status sukses
                      const isIPayMu = via && (via.toLowerCase() === 'ipaymu' || via.toLowerCase() === 'ipay mu')
                      const ipaymuRowEff = isIPayMu ? effectiveIpaymuRowStatus(payment) : null
                      const ipaymuStatusShort =
                        ipaymuRowEff === 'paid'
                          ? 'Lunas'
                          : ipaymuRowEff === 'expired'
                            ? 'Kadaluwarsa'
                            : ipaymuRowEff === 'cancelled'
                              ? 'Dibatalkan'
                              : ipaymuRowEff === 'failed'
                                ? 'Gagal'
                                : 'Menunggu'
                      // Untuk iPayMu: label metode (VA BCA, Indomaret, QRIS, dll) dan tipe untuk icon
                      const ipaymuMethodLabel = isIPayMu ? (
                        payment.payment_method === 'qris' ? 'QRIS'
                          : payment.payment_method === 'va' && payment.payment_channel
                            ? (vaChannels.find(c => c.value === payment.payment_channel)?.label || 'VA ' + (payment.payment_channel || '').toUpperCase())
                            : payment.payment_method === 'cstore' && payment.payment_channel
                              ? (cstoreChannels.find(c => c.value === payment.payment_channel)?.label || payment.payment_channel)
                              : (payment.payment_method === 'va' ? 'VA' : payment.payment_method === 'cstore' ? 'CStore' : 'iPayMu')
                      ) : null
                      const hasBukti = (isPending && payment.bukti) || (!isPending && payment.relatedBukti)
                      const canClick = hasBukti || isIPayMu
                      
                      const handleClick = canClick ? () => {
                        if (isIPayMu) {
                          // Jika iPayMu, tampilkan modal dengan status sukses
                          // Payment sudah memiliki data dari backend (id_payment_transaction, session_id, dll)
                          const transactionId = payment.id_payment_transaction || payment.session_id
                          
                          if (transactionId) {
                            // Fetch status transaksi dan tampilkan di modal
                            paymentTransactionAPI.checkStatus(transactionId).then(statusResult => {
                              if (statusResult.success && statusResult.data) {
                                const txData = statusResult.data
                                const status = txData.status
                                
                                // Tentukan bank name
                                let bankName = 'iPayMu'
                                if (payment.payment_method === 'va' && payment.payment_channel) {
                                  const channelData = vaChannels.find(c => c.value === payment.payment_channel)
                                  bankName = channelData ? channelData.label : payment.payment_channel.toUpperCase()
                                } else if (payment.payment_method === 'cstore' && payment.payment_channel) {
                                  const channelData = cstoreChannels.find(c => c.value === payment.payment_channel)
                                  bankName = channelData ? channelData.label : payment.payment_channel.toUpperCase()
                                } else if (payment.payment_method === 'qris') {
                                  bankName = 'QRIS'
                                }
                                
                                // Prioritas: expired_at dari transaksi (API/DB); fallback 24j jika data lama
                                const expiredAtFromTx = (txData.expired_at && new Date(txData.expired_at).getTime()) || (payment.expired_at && new Date(payment.expired_at).getTime()) || (payment.created_at ? new Date(payment.created_at).getTime() + 24 * 60 * 60 * 1000 : null) || Date.now() + 24 * 60 * 60 * 1000
                                // Set vaInfo untuk menampilkan di modal
                                setVaInfo({
                                  va_number: txData.va_number || payment.va_number || null,
                                  bank: bankName,
                                  payment_method: txData.payment_method || payment.payment_method || null,
                                  payment_channel: txData.payment_channel || payment.payment_channel || null,
                                  payment_url: txData.payment_url || payment.payment_url || null,
                                  qr_code: txData.qr_code || payment.qr_code || null,
                                  session_id: txData.session_id || payment.session_id || transactionId,
                                  transaction_id: txData.transaction_id || payment.ipaymu_transaction_id || transactionId,
                                  ipaymu_transaction_id: txData.transaction_id || payment.ipaymu_transaction_id || transactionId,
                                  amount: txData.amount || payment.nominal || null,
                                  expired_at: expiredAtFromTx
                                })
                                
                                // Set status transaksi
                                setTransactionStatus(status)
                                
                                // Normalisasi status untuk menentukan step
                                const normalizedStatus = status ? String(status).toLowerCase().trim() : null
                                
                                setStepDirection(1)
                                if (normalizedStatus === 'paid' || normalizedStatus === 'success') {
                                  goToIPaymuStep(4)
                                } else {
                                  goToIPaymuStep(3)
                                }
                              }
                            }).catch(err => {
                              console.error('Error checking iPayMu status:', err)
                              // Jika error, tetap tampilkan modal dengan data yang ada
                              let bankName = 'iPayMu'
                              if (payment.payment_method === 'va' && payment.payment_channel) {
                                const channelData = vaChannels.find(c => c.value === payment.payment_channel)
                                bankName = channelData ? channelData.label : payment.payment_channel.toUpperCase()
                              } else if (payment.payment_method === 'cstore' && payment.payment_channel) {
                                const channelData = cstoreChannels.find(c => c.value === payment.payment_channel)
                                bankName = channelData ? channelData.label : payment.payment_channel.toUpperCase()
                              } else if (payment.payment_method === 'qris') {
                                bankName = 'QRIS'
                              }
                              
                              setVaInfo({
                                va_number: payment.va_number || null,
                                bank: bankName,
                                payment_method: payment.payment_method || null,
                                payment_channel: payment.payment_channel || null,
                                payment_url: payment.payment_url || null,
                                qr_code: payment.qr_code || null,
                                session_id: payment.session_id || null,
                                transaction_id: payment.ipaymu_transaction_id || null,
                                ipaymu_transaction_id: payment.ipaymu_transaction_id || null,
                                amount: payment.nominal || null,
                                expired_at: (payment.expired_at && new Date(payment.expired_at).getTime()) || (payment.created_at ? new Date(payment.created_at).getTime() + 24 * 60 * 60 * 1000 : Date.now() + 24 * 60 * 60 * 1000)
                              })
                              const statusFromPayment = payment.transaction_status || 'paid'
                              setTransactionStatus(statusFromPayment)
                              
                              const normalizedStatus = statusFromPayment ? String(statusFromPayment).toLowerCase().trim() : 'paid'
                              setStepDirection(1)
                              if (normalizedStatus === 'paid' || normalizedStatus === 'success') {
                                goToIPaymuStep(4)
                              } else {
                                goToIPaymuStep(3)
                              }
                            })
                          } else {
                            // Jika tidak ada transaction_id, tampilkan info dasar dengan status paid
                            let bankName = 'iPayMu'
                            if (payment.payment_method === 'va' && payment.payment_channel) {
                              const channelData = vaChannels.find(c => c.value === payment.payment_channel)
                              bankName = channelData ? channelData.label : payment.payment_channel.toUpperCase()
                            } else if (payment.payment_method === 'cstore' && payment.payment_channel) {
                              const channelData = cstoreChannels.find(c => c.value === payment.payment_channel)
                              bankName = channelData ? channelData.label : payment.payment_channel.toUpperCase()
                            } else if (payment.payment_method === 'qris') {
                              bankName = 'QRIS'
                            }
                            
                            setVaInfo({
                              va_number: payment.va_number || null,
                              bank: bankName,
                              payment_method: payment.payment_method || null,
                              payment_channel: payment.payment_channel || null,
                              payment_url: payment.payment_url || null,
                              qr_code: payment.qr_code || null,
                              session_id: null,
                              transaction_id: null,
                              ipaymu_transaction_id: null,
                              amount: payment.nominal || null,
                              expired_at: (payment.expired_at && new Date(payment.expired_at).getTime()) || (payment.created_at ? new Date(payment.created_at).getTime() + 24 * 60 * 60 * 1000 : Date.now() + 24 * 60 * 60 * 1000)
                            })
                              const statusFromPayment = payment.transaction_status || 'paid'
                              setTransactionStatus(statusFromPayment)
                              
                              const normalizedStatus = statusFromPayment ? String(statusFromPayment).toLowerCase().trim() : 'paid'
                              setStepDirection(1)
                              if (normalizedStatus === 'paid' || normalizedStatus === 'success') {
                                goToIPaymuStep(4)
                              } else {
                                goToIPaymuStep(3)
                              }
                          }
                        } else if (hasBukti && onPreviewBukti) {
                          // Jika TF dengan bukti, tampilkan preview
                        const buktiToPreview = isPending ? payment.bukti : payment.relatedBukti
                        if (buktiToPreview) {
                          onPreviewBukti(buktiToPreview)
                          onClose()
                          }
                        }
                      } : undefined

                      return (
                        <div
                          key={payment.id}
                          className={`p-2 rounded-md border text-xs ${canClick
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
                            <div className="flex items-center gap-1.5 mt-1">
                              {isIPayMu && (payment.payment_method === 'va' || payment.payment_method === 'cstore' || payment.payment_method === 'qris') ? (
                                <>
                                  <span className="flex-shrink-0 inline-flex items-center" title={ipaymuMethodLabel || 'iPayMu'}>
                                    {payment.payment_method === 'va' && <BankIcon bank={payment.payment_channel || 'bca'} className="h-5 w-5" />}
                                    {payment.payment_method === 'cstore' && <CStoreIcon store={payment.payment_channel || 'alfamart'} className="h-5 w-5" />}
                                    {payment.payment_method === 'qris' && <QRISIcon className="h-5 w-5" />}
                                  </span>
                                  <span
                                    className="inline-block max-w-[85px] min-w-0 truncate text-center px-2 py-0.5 rounded text-white text-[10px] font-semibold"
                                    style={{ background: viaColor }}
                                    title={ipaymuMethodLabel || 'iPayMu'}
                                  >
                                    {ipaymuMethodLabel || 'iPayMu'}
                                  </span>
                                </>
                              ) : (
                                <span
                                  className="inline-block min-w-[48px] text-center px-2 py-0.5 rounded text-white text-[10px] font-semibold"
                                  style={{ background: viaColor }}
                                >
                                  {via}
                                </span>
                              )}
                            </div>
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
                          </div>
                          {isPending ? (
                            <div className="flex items-center justify-between mt-1">
                              <div className="text-yellow-700 dark:text-yellow-400 text-[10px] font-medium">
                                Pembayaran Menunggu Verifikasi
                              </div>
                              <button
                                onClick={(e) => handleDeleteClick(e, payment)}
                                className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-md transition-all"
                                title="Hapus bukti transfer ini"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            </div>
                          ) : isIPayMu ? (
                            <div className="mt-1 space-y-0.5">
                              <div className="flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
                                {payment.payment_method === 'va' && <BankIcon bank={payment.payment_channel || 'bca'} className="h-4 w-4 flex-shrink-0" />}
                                {payment.payment_method === 'cstore' && <CStoreIcon store={payment.payment_channel || 'alfamart'} className="h-4 w-4 flex-shrink-0" />}
                                {payment.payment_method === 'qris' && <QRISIcon className="h-4 w-4 flex-shrink-0" />}
                                <span>Metode: <span className="font-medium">{ipaymuMethodLabel || 'iPayMu'}</span></span>
                              </div>
                              <div className="text-[10px] font-medium">
                                {ipaymuRowEff === 'expired' || ipaymuRowEff === 'failed' ? (
                                  <span className="text-red-600 dark:text-red-400">Status: {ipaymuStatusShort}</span>
                                ) : ipaymuRowEff === 'paid' ? (
                                  <span className="text-emerald-600 dark:text-emerald-400">Status: {ipaymuStatusShort}</span>
                                ) : (
                                  <span className="text-amber-600 dark:text-amber-400">Status: {ipaymuStatusShort}</span>
                                )}
                              </div>
                            </div>
                          ) : (
                            <div className="text-gray-600 dark:text-gray-400 mt-1">
                              Oleh: <span className="font-medium">{payment.admin || '-'}</span>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Tombol Upload Bukti TF dan Bayar dengan iPayMu */}
              {kurang > 0 && (
                <div className="mt-4 pt-3 border-t border-gray-200 dark:border-gray-700">
                  <div className={`grid gap-2 ${SHOW_UPLOAD_TF_BUTTON ? 'grid-cols-2' : 'grid-cols-1'}`}>
                    {/* Tombol Upload Bukti TF (sementara disembunyikan via SHOW_UPLOAD_TF_BUTTON) */}
                    {SHOW_UPLOAD_TF_BUTTON && bisaUploadBukti ? (
                      <div className="flex flex-col gap-0.5">
                        <button
                          onClick={onUploadBuktiClick}
                          className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors text-xs font-medium flex items-center justify-center gap-1.5"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                          </svg>
                          {jumlahBukti > 0 ? `TF ${nomorBuktiBerikutnya}` : 'Upload TF'}
                        </button>
                        <p className="text-[10px] text-center text-gray-500 dark:text-gray-400">Diverifikasi manual oleh admin</p>
                      </div>
                    ) : null}
                    {/* Tombol Bayar dengan iPayMu */}
                    <div className="flex flex-col gap-0.5">
                      <button
                        onClick={handleIPaymuClick}
                        disabled={processingIPaymu || kurang <= 0}
                        className="px-3 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition-colors text-xs font-medium flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
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
                            Tambah Pembayaran
                          </>
                        )}
                      </button>
                      <p className="text-[10px] text-center text-gray-500 dark:text-gray-400">Pembayaran Terdeteksi Otomatis</p>
                    </div>
                  </div>
                  {ipaymuCreateHistory.length > 0 && (
                    <div className="mt-3 border border-gray-200 dark:border-gray-700 rounded-lg p-2 bg-gray-50 dark:bg-gray-900/50">
                      <p className="text-[11px] font-semibold text-gray-700 dark:text-gray-300 mb-2">Riwayat Buat Pembayaran iPayMu</p>
                      <div className="space-y-1.5 max-h-28 overflow-y-auto">
                        {ipaymuCreateHistory.slice(0, 6).map((tx) => {
                          const status = normalizeIpaymuStatus(tx.txStatus)
                          const statusLabel = status === 'paid'
                            ? 'Paid'
                            : status === 'cancelled'
                              ? 'Dibatalkan'
                              : status === 'expired'
                                ? 'Expired'
                                : status === 'failed'
                                  ? 'Gagal'
                                  : 'Menunggu'
                          const methodLabel = tx.payment_method === 'qris'
                            ? 'QRIS'
                            : tx.payment_method === 'cstore'
                              ? (cstoreChannels.find(c => c.value === tx.payment_channel)?.label || 'CStore')
                              : tx.payment_method === 'va'
                                ? (vaChannels.find(c => c.value === tx.payment_channel)?.label || 'VA')
                                : 'iPayMu'
                          return (
                            <button
                              key={String(tx.txId)}
                              type="button"
                              onClick={() => handleOpenIpaymuHistory(tx)}
                              disabled={openingIpaymuHistoryId === tx.txId}
                              className="w-full text-left px-2 py-1.5 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-60"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-[11px] font-medium text-gray-700 dark:text-gray-200 truncate">
                                  {methodLabel} - Rp {Number(tx.nominal || 0).toLocaleString('id-ID')}
                                </span>
                                <span className="text-[10px] text-gray-500 dark:text-gray-400">{statusLabel}</span>
                              </div>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
                </>
                  )}
                </div>

                {/* Bantuan Kendala Pembayaran — selalu tampil di bawah offcanvas Rincian Pembayaran */}
                <div className="flex-shrink-0 p-3 pt-2 border-t border-gray-200 dark:border-gray-700">
                  <a
                    href="https://wa.me/6282232999921"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-1.5 w-full px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-medium rounded-lg transition-colors"
                  >
                    <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                    </svg>
                    Bantuan Kendala Pembayaran
                  </a>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Modal Konfirmasi Hapus */}
          <AnimatePresence>
            {showDeleteModal && (
              <>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => !isDeleting && setShowDeleteModal(false)}
                  className="fixed inset-0 bg-black bg-opacity-60 backdrop-blur-sm"
                  style={{ zIndex: 110 }}
                />
                <motion.div
                  initial={{ scale: 0.9, opacity: 0, y: 20 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  exit={{ scale: 0.9, opacity: 0, y: 20 }}
                  className="fixed inset-0 flex items-center justify-center p-4"
                  style={{ zIndex: 111 }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden">
                    <div className="p-6 text-center">
                      <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4 text-red-600 dark:text-red-400">
                        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </div>
                      <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                        Hapus Bukti Transfer?
                      </h3>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                        Anda akan menghapus <span className="font-semibold text-gray-700 dark:text-gray-300">Bukti TF {itemToDelete?.nomorBukti}</span>. Tindakan ini tidak dapat dibatalkan.
                      </p>

                      <div className="flex gap-3">
                        <button
                          disabled={isDeleting}
                          onClick={() => setShowDeleteModal(false)}
                          className="flex-1 px-4 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 font-semibold transition-colors disabled:opacity-50"
                        >
                          Batal
                        </button>
                        <button
                          disabled={isDeleting}
                          onClick={confirmDelete}
                          className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl font-semibold shadow-lg shadow-red-500/30 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                          {isDeleting ? (
                            <>
                              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                              Menghapus...
                            </>
                          ) : (
                            'Ya, Hapus'
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>

          {/* Modal Konfirmasi Batal Transaksi */}
          <AnimatePresence>
            {showCancelModal && (
              <>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => !isCancelling && setShowCancelModal(false)}
                  className="fixed inset-0 bg-black bg-opacity-60 backdrop-blur-sm"
                  style={{ zIndex: 110 }}
                />
                <motion.div
                  initial={{ scale: 0.9, opacity: 0, y: 20 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  exit={{ scale: 0.9, opacity: 0, y: 20 }}
                  className="fixed inset-0 flex items-center justify-center p-4"
                  style={{ zIndex: 111 }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden">
                    <div className="p-6 text-center">
                      <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4 text-red-600 dark:text-red-400">
                        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </div>
                      <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                        Batalkan Transaksi?
                      </h3>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                        Anda akan membatalkan transaksi pembayaran ini. Tindakan ini tidak dapat dibatalkan.
                      </p>

                      <div className="flex gap-3">
                        <button
                          type="button"
                          disabled={isCancelling}
                          onClick={() => setShowCancelModal(false)}
                          className="flex-1 px-4 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 font-semibold transition-colors disabled:opacity-50"
                        >
                          Batal
                        </button>
                        <button
                          type="button"
                          disabled={isCancelling}
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleCancelTransaction() }}
                          className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl font-semibold shadow-lg shadow-red-500/30 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                          {isCancelling ? (
                            <>
                              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                              Membatalkan...
                            </>
                          ) : (
                            'Ya, Batalkan'
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>

          {/* Modal Edit Transaksi */}
          <AnimatePresence>
            {showEditModal && (
              <>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => !isUpdating && setShowEditModal(false)}
                  className="fixed inset-0 bg-black bg-opacity-50"
                  style={{ zIndex: 110 }}
                />
                <motion.div
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.9, opacity: 0 }}
                  className="fixed inset-0 flex items-center justify-center p-4"
                  style={{ zIndex: 111 }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                        Ubah Transaksi
                      </h3>
                      <button
                        onClick={() => !isUpdating && setShowEditModal(false)}
                        disabled={isUpdating}
                        className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 disabled:opacity-50"
                      >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                        </svg>
                      </button>
                    </div>

                    <div className="space-y-4">
                      {/* Input Nominal */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Nominal Pembayaran
                        </label>
                        <input
                          type="text"
                          value={ipaymuAmount}
                          onChange={handleAmountInput}
                          placeholder="Masukkan nominal (min. 100.000)"
                          className="w-full p-3 border-2 border-gray-300 dark:border-gray-600 rounded-lg focus:border-teal-500 dark:focus:border-teal-400 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100 text-right font-mono text-lg"
                          disabled={isUpdating}
                        />
                        <div className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                          Sisa kurang: <strong>Rp {kurang.toLocaleString('id-ID')}</strong>
                        </div>
                      </div>

                      {/* Pilih Metode Pembayaran */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                          Metode Pembayaran
                        </label>
                        
                        {/* Accordion VA */}
                        <div className="mb-2 border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden">
                          <button
                            type="button"
                            onClick={() => handleAccordionToggle('va')}
                            disabled={isUpdating}
                            className={`w-full px-4 py-3 flex items-center justify-between bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors disabled:opacity-50 ${
                              openAccordion === 'va' ? 'border-b border-gray-300 dark:border-gray-600' : ''
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <BankIcon bank="bca" className="h-7" />
                              <span className="font-medium text-gray-900 dark:text-gray-100">Virtual Account (VA)</span>
                            </div>
                            <motion.svg
                              animate={{ rotate: openAccordion === 'va' ? 180 : 0 }}
                              transition={{ duration: 0.3, ease: 'easeInOut' }}
                              className="w-5 h-5 text-gray-500 dark:text-gray-400"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                            </motion.svg>
                          </button>
                          <AnimatePresence>
                            {openAccordion === 'va' && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.3, ease: 'easeInOut' }}
                                className="overflow-hidden"
                              >
                                <div className="p-3 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-300 dark:border-gray-600">
                                  <motion.div
                                    initial={{ y: -10, opacity: 0 }}
                                    animate={{ y: 0, opacity: 1 }}
                                    transition={{ delay: 0.1, duration: 0.2 }}
                                    className="flex flex-col gap-2"
                                  >
                                    {vaChannels.map((channel, index) => (
                                      <motion.button
                                        key={channel.value}
                                        type="button"
                                        onClick={() => handleChannelSelect(channel.value)}
                                        disabled={isUpdating}
                                        initial={{ scale: 0.9, opacity: 0 }}
                                        animate={{ scale: 1, opacity: 1 }}
                                        transition={{ delay: 0.1 + index * 0.03, duration: 0.2 }}
                                        whileHover={{ scale: 1.01 }}
                                        whileTap={{ scale: 0.98 }}
                                        className={`px-3 py-2.5 text-sm rounded-lg border-2 transition-colors disabled:opacity-50 flex items-center gap-3 text-left ${
                                          paymentChannel === channel.value
                                            ? 'border-teal-500 bg-teal-50 dark:bg-teal-900/20 text-teal-700 dark:text-teal-300 font-medium'
                                            : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:border-teal-400 dark:hover:border-teal-500'
                                        }`}
                                      >
                                        {paymentChannel === channel.value ? (
                                          <span className="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded-full bg-teal-500 text-white">
                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                                            </svg>
                                          </span>
                                        ) : (
                                          <span className="flex-shrink-0 w-5 h-5 rounded-full border-2 border-gray-400 dark:border-gray-500" />
                                        )}
                                        <span className="flex-1 min-w-0 font-medium">{channel.label}</span>
                                        <BankIcon bank={channel.value} className="h-8" />
                                      </motion.button>
                                    ))}
                                  </motion.div>
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>

                        {/* Accordion QRIS */}
                        <div className="mb-2 border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden">
                          <button
                            type="button"
                            onClick={() => handleAccordionToggle('qris')}
                            disabled={isUpdating}
                            className={`w-full px-4 py-3 flex items-center justify-between bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors disabled:opacity-50 ${
                              openAccordion === 'qris' ? 'border-b border-gray-300 dark:border-gray-600' : ''
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <QRISIcon className="h-7" />
                              <span className="font-medium text-gray-900 dark:text-gray-100">QRIS</span>
                            </div>
                            <motion.svg
                              animate={{ rotate: openAccordion === 'qris' ? 180 : 0 }}
                              transition={{ duration: 0.3, ease: 'easeInOut' }}
                              className="w-5 h-5 text-gray-500 dark:text-gray-400"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                            </motion.svg>
                          </button>
                          <AnimatePresence>
                            {openAccordion === 'qris' && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.3, ease: 'easeInOut' }}
                                className="overflow-hidden"
                              >
                                <div className="p-3 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-300 dark:border-gray-600 space-y-2">
                                  <div className="text-sm text-gray-600 dark:text-gray-400">
                                    Scan QR code untuk melakukan pembayaran
                                  </div>
                                  <div className="flex flex-wrap items-center gap-3">
                                    <img src={getGambarUrl('/logo/dana.png')} alt="Dana" className="h-9 w-auto max-w-[90px] object-contain object-center" />
                                    <img src={getGambarUrl('/logo/gopay.png')} alt="Gopay" className="h-9 w-auto max-w-[90px] object-contain object-center" />
                                    <img src={getGambarUrl('/logo/shopee-pay.png')} alt="ShopeePay" className="h-9 w-auto max-w-[90px] object-contain object-center" />
                                    <img src={getGambarUrl('/logo/ovo.png')} alt="OVO" className="h-9 w-auto max-w-[90px] object-contain object-center" />
                                  </div>
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>

                        {/* Accordion Convenience Store */}
                        <div className="mb-2 border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden">
                          <button
                            type="button"
                            onClick={() => handleAccordionToggle('cstore')}
                            disabled={isUpdating}
                            className={`w-full px-4 py-3 flex items-center justify-between bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors disabled:opacity-50 ${
                              openAccordion === 'cstore' ? 'border-b border-gray-300 dark:border-gray-600' : ''
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <CStoreIcon store="alfamart" className="h-7" />
                              <span className="font-medium text-gray-900 dark:text-gray-100">Convenience Store</span>
                            </div>
                            <motion.svg
                              animate={{ rotate: openAccordion === 'cstore' ? 180 : 0 }}
                              transition={{ duration: 0.3, ease: 'easeInOut' }}
                              className="w-5 h-5 text-gray-500 dark:text-gray-400"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                            </motion.svg>
                          </button>
                          <AnimatePresence>
                            {openAccordion === 'cstore' && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.3, ease: 'easeInOut' }}
                                className="overflow-hidden"
                              >
                                <div className="p-3 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-300 dark:border-gray-600">
                                  <motion.div
                                    initial={{ y: -10, opacity: 0 }}
                                    animate={{ y: 0, opacity: 1 }}
                                    transition={{ delay: 0.1, duration: 0.2 }}
                                    className="flex flex-col gap-2"
                                  >
                                    {cstoreChannels.map((channel, index) => (
                                      <motion.button
                                        key={channel.value}
                                        type="button"
                                        onClick={() => handleChannelSelect(channel.value)}
                                        disabled={isUpdating}
                                        initial={{ scale: 0.9, opacity: 0 }}
                                        animate={{ scale: 1, opacity: 1 }}
                                        transition={{ delay: 0.1 + index * 0.03, duration: 0.2 }}
                                        whileHover={{ scale: 1.01 }}
                                        whileTap={{ scale: 0.98 }}
                                        className={`px-3 py-2.5 text-sm rounded-lg border-2 transition-colors disabled:opacity-50 flex items-center gap-3 w-full text-left ${
                                          paymentChannel === channel.value
                                            ? 'border-teal-500 bg-teal-50 dark:bg-teal-900/20 text-teal-700 dark:text-teal-300 font-medium'
                                            : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:border-teal-400 dark:hover:border-teal-500'
                                        }`}
                                      >
                                        {paymentChannel === channel.value ? (
                                          <span className="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded-full bg-teal-500 text-white">
                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                                            </svg>
                                          </span>
                                        ) : (
                                          <span className="flex-shrink-0 w-5 h-5 rounded-full border-2 border-gray-400 dark:border-gray-500" />
                                        )}
                                        <span className="flex-1 min-w-0 font-medium">{channel.label}</span>
                                        <CStoreIcon store={channel.value} className="h-8" />
                                      </motion.button>
                                    ))}
                                  </motion.div>
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      </div>

                      <div className="flex gap-2 pt-4 border-t border-gray-200 dark:border-gray-700">
                        <button
                          onClick={() => setShowEditModal(false)}
                          disabled={isUpdating}
                          className="flex-1 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 font-medium disabled:opacity-50"
                        >
                          Batal
                        </button>
                        <button
                          onClick={handleUpdateTransaction}
                          disabled={isUpdating}
                          className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                          {isUpdating ? (
                            <>
                              <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                              </svg>
                              Memproses...
                            </>
                          ) : (
                            'Simpan Perubahan'
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </>
      )}
    </AnimatePresence>,
    document.body
  )

  return offcanvasContent
}

export default PembayaranListOffcanvas
