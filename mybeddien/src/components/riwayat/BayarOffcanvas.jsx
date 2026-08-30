import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { pembayaranAPI } from '../../services/api'
import { motion, AnimatePresence } from 'framer-motion'
import { createPortal } from 'react-dom'
import { paymentTransactionAPI, profilAPI } from '../../services/api'
import { useSantriDataStore } from '../../store/santriDataStore'
import { BankIcon, CStoreIcon, QRISIcon, EwalletIcon } from './PaymentIcons'
import { getGambarUrl } from '../../config/images'
import { useMybeddienToast } from '../../contexts/MybeddienToastContext'
import { QrCodeImage } from '../../utils/qrCodeImage'
import QRCode from 'qrcode'

function isValidEmailFormat(email) {
  const e = String(email || '').trim()
  if (!e) return false
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)
}

/** Digit lokal tanpa 0/62 di depan — iPayMu butuh ≥10 digit. */
function phoneDigitsForPayment(phone) {
  let p = String(phone || '').replace(/\D/g, '')
  if (!p) return ''
  if (p.startsWith('62')) p = p.slice(2)
  if (p.startsWith('0')) p = p.slice(1)
  return p
}

function isValidPhoneForPayment(phone) {
  return phoneDigitsForPayment(phone).length >= 10
}

function pickSantriPhone(d = {}) {
  return String(d.no_wa_santri || d.no_telpon || d.no_wa || '').trim()
}

function isEmailInvalidPaymentError(msg) {
  if (!msg || typeof msg !== 'string') return false
  const m = msg.toLowerCase()
  return m.includes('email') && (m.includes('tidak valid') || m.includes('invalid') || m.includes('format'))
}

function isPhoneInvalidPaymentError(msg) {
  if (!msg || typeof msg !== 'string') return false
  const m = msg.toLowerCase()
  return (m.includes('phone') || m.includes('telepon') || m.includes('nomor') || m.includes('hp'))
    && (m.includes('tidak valid') || m.includes('invalid') || m.includes('wajib') || m.includes('kosong') || m.includes('minimal'))
}

async function qrCodeToDataUrl(qrCode) {
  if (!qrCode || typeof qrCode !== 'string') return null
  const s = qrCode.trim()
  if (!s) return null
  if (s.startsWith('data:image') || s.startsWith('http://') || s.startsWith('https://')) return s
  if ((s.includes('+') || s.includes('/') || s.endsWith('=')) && /^[A-Za-z0-9+/=]+$/.test(s) && s.length > 200) {
    return `data:image/png;base64,${s}`
  }
  try {
    return await QRCode.toDataURL(s, { width: 300, margin: 1, errorCorrectionLevel: 'M' })
  } catch {
    return null
  }
}

const VA_CHANNELS = [
  { value: 'bca', label: 'VA BCA' }, { value: 'bni', label: 'VA BNI' }, { value: 'bri', label: 'VA BRI' },
  { value: 'mandiri', label: 'VA Mandiri' }, { value: 'permata', label: 'VA Permata' },
  { value: 'cimb', label: 'VA Cimb Niaga' }, { value: 'danamon', label: 'VA DANAMON' },
  { value: 'bag', label: 'VA BAG' }, { value: 'btn', label: 'VA BTN' }, { value: 'bsi', label: 'VA BSI' }, { value: 'muamalat', label: 'VA Muamalat' },
]
/** Logo ringkas di head accordion VA (bank dengan aset logo berbeda). */
const VA_HEAD_LOGOS = ['bca', 'bni', 'bri', 'mandiri', 'permata']
const CSTORE_CHANNELS = [
  { value: 'alfamart', label: 'Alfamart' },
  { value: 'indomaret', label: 'Indomaret' },
]

/** E-wallet iPaymu Direct: docs = shopeepay; channel `dana` aktif di dashboard merchant. */
const IPAYMU_EWALLET_CHANNELS = [
  { value: 'shopeepay', label: 'ShopeePay' },
  { value: 'dana', label: 'DANA' },
]

/** E-wallet Xendit (Payments API v3 — channel_code DANA, OVO, dll.) */
const XENDIT_EWALLET_CHANNELS = [
  { value: 'dana', label: 'DANA' },
  { value: 'ovo', label: 'OVO' },
  { value: 'gopay', label: 'GoPay' },
  { value: 'shopeepay', label: 'ShopeePay' },
  { value: 'linkaja', label: 'LinkAja' },
]

function paymentMethodDisplayName(paymentMethod, paymentChannel) {
  if (paymentMethod === 'va' && paymentChannel) {
    const ch = VA_CHANNELS.find(c => c.value === paymentChannel)
    return ch ? ch.label : paymentChannel
  }
  if (paymentMethod === 'cstore' && paymentChannel) {
    const ch = CSTORE_CHANNELS.find(c => c.value === paymentChannel)
    return ch ? ch.label : paymentChannel
  }
  if (paymentMethod === 'ewallet' && paymentChannel) {
    const ch = [...IPAYMU_EWALLET_CHANNELS, ...XENDIT_EWALLET_CHANNELS].find(c => c.value === paymentChannel)
    return ch ? ch.label : paymentChannel
  }
  if (paymentMethod === 'qris') return 'QRIS'
  return 'Bank'
}

function PaymentMethodLogo({ paymentMethod, paymentChannel, className = 'h-8' }) {
  if (paymentMethod === 'qris') return <QRISIcon className={className} />
  if (paymentMethod === 'va') return <BankIcon bank={paymentChannel || 'bca'} className={className} />
  if (paymentMethod === 'cstore') return <CStoreIcon store={paymentChannel || 'alfamart'} className={className} />
  if (paymentMethod === 'ewallet') return <EwalletIcon wallet={paymentChannel || 'dana'} className={className} />
  return null
}

/** Logo bank/merchant hanya untuk latar terang — daftar metode (langkah 2) tetap terang saat tema gelap. */
const PAY_METHODS_LIGHT =
  'rounded-xl border border-gray-200 bg-white text-gray-900 shadow-sm overflow-hidden space-y-0 divide-y divide-gray-200'
const PAY_METHODS_HEAD =
  'w-full px-4 py-3 flex items-center justify-between bg-white text-gray-900 hover:bg-gray-50 transition-colors'
const PAY_METHODS_PANEL = 'p-3 bg-gray-50 border-t border-gray-200 flex flex-col gap-2'
const payMethodItemCls = (selected) =>
  selected
    ? 'px-3 py-2.5 text-sm rounded-lg border-2 border-primary-500 bg-primary-50 text-gray-900 flex items-center gap-3 w-full text-left font-medium'
    : 'px-3 py-2.5 text-sm rounded-lg border-2 border-gray-300 bg-white text-gray-900 flex items-center gap-3 w-full text-left hover:border-gray-400 hover:bg-white'
const PAY_METHODS_CHEVRON = 'w-5 h-5 text-gray-600 transition-transform shrink-0'
/** Area QR selalu latar putih agar kode terbaca di tema gelap. */
const QR_PANEL_LIGHT = 'p-4 rounded-lg bg-white border border-gray-200 text-gray-900 text-center shadow-sm'

async function downloadQrisImage(qrCode, onNotify) {
  const src = await qrCodeToDataUrl(qrCode)
  if (!src) return
  const filename = 'qris-pembayaran.png'
  try {
    const a = document.createElement('a')
    a.href = src
    a.download = filename
    a.click()
    onNotify?.('Gambar QR berhasil diunduh', 'success')
  } catch {
    onNotify?.('Gagal mengunduh gambar QR', 'error')
  }
}

function parseNominalInput(str) {
  return parseFloat(String(str || '').replace(/\./g, '')) || 0
}

function formatNominalInput(n) {
  const v = Math.round(Number(n) || 0)
  if (v <= 0) return ''
  return new Intl.NumberFormat('id-ID').format(v)
}

function rowKurang(row) {
  const w = Number(row?.wajib ?? row?.total ?? 0) || 0
  const b = Number(row?.bayar ?? 0) || 0
  const k = row?.kurang
  return Math.max(0, Number.isFinite(Number(k)) ? Number(k) : w - b)
}

/** @param {Array<Record<string, unknown>>} rows */
function mapPayableFromRincian(rows) {
  if (!Array.isArray(rows)) return []
  return rows
    .map((row) => {
      const kurang = rowKurang(row)
      if (kurang <= 0) return null
      const id = row.id ?? row.id_bulan ?? row.id_registrasi
      if (id == null) return null
      const label =
        row.keterangan_1 ||
        row.bulan ||
        row.nama_item ||
        row.item ||
        'Item'
      return { id: String(id), label: String(label), kurang }
    })
    .filter(Boolean)
}

/**
 * Alokasi nominal ke item berurutan (bulan/item biaya): bulan penuh dicentang, sisa di bulan berikutnya → partial.
 * @param {number} amount
 * @param {Array<{ id: string, label: string, kurang: number }>} items
 */
function allocatePayablesForAmount(amount, items) {
  const fullIds = new Set()
  let remaining = Math.max(0, Math.round(Number(amount) || 0))
  /** @type {{ id: string, label: string, applied: number, shortage: number } | null} */
  let partial = null

  for (const item of items) {
    if (remaining <= 0) break
    const need = item.kurang
    if (remaining >= need) {
      fullIds.add(item.id)
      remaining -= need
    } else {
      partial = {
        id: item.id,
        label: item.label,
        applied: remaining,
        shortage: need - remaining,
      }
      remaining = 0
      break
    }
  }

  return { fullIds, partial }
}

function hasPayableListSelection(listPayables, selectedPayIds, partialPayable) {
  if (!listPayables.length) return true
  return selectedPayIds.size > 0 || partialPayable != null
}

/** @param {Array<Record<string, unknown>>} detailRows */
function mapPayableFromRegistrasiDetail(detailRows) {
  if (!Array.isArray(detailRows)) return []
  return detailRows
    .map((d) => {
      if (d.status_bayar === 'sudah_bayar') return null
      const harga = Number(d.harga_standar) || 0
      const dibayar = Number(d.nominal_dibayar) || 0
      const kurang = Math.max(0, harga - dibayar)
      if (kurang <= 0) return null
      return {
        id: String(d.id),
        label: String(d.nama_item || d.kategori_item || 'Item'),
        kurang,
      }
    })
    .filter(Boolean)
}

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
  /** 'single' = checkbox Bayar Lunas saja (khusus/tunggakan). 'list' = master lunas + centang per baris (uwaba/pendaftaran). */
  selectionMode = 'single',
  /** Baris yang bisa dicentang (uwaba: dari parent; pendaftaran: di-fetch jika kosong). */
  payableItems = [],
  onSuccess,
  onNotify: onNotifyProp,
}) {
  const { showToast } = useMybeddienToast()
  const onNotify = onNotifyProp ?? showToast
  const navigate = useNavigate()
  const location = useLocation()

  const openLegalPage = useCallback(
    (path) => {
      onClose?.()
      navigate(path, { state: { from: location.pathname + (location.search || '') } })
    },
    [navigate, location.pathname, location.search, onClose]
  )

  const [ipaymuAmount, setIpaymuAmount] = useState('')
  const [bayarLunasChecked, setBayarLunasChecked] = useState(false)
  const [selectedPayIds, setSelectedPayIds] = useState(() => new Set())
  /** @type {[{ id: string, label: string, applied: number, shortage: number } | null, Function]} */
  const [partialPayable, setPartialPayable] = useState(null)
  /** 'amount' = nominal mengontrol centang bulan; 'manual' = centang bulan mengontrol nominal */
  const [selectionSource, setSelectionSource] = useState(null)
  const [pendaftaranPayables, setPendaftaranPayables] = useState([])
  const [pendaftaranItemsLoading, setPendaftaranItemsLoading] = useState(false)
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
  const [paymentProvider, setPaymentProvider] = useState('ipaymu')
  const [paymentProviderLabel, setPaymentProviderLabel] = useState('iPayMu')
  const displayTitle = useMemo(() => {
    const base = String(title || 'Bayar')
      .replace(/\s*\(iPayMu\)\s*/gi, '')
      .replace(/\s*\(Xendit\)\s*/gi, '')
      .trim()
    return `${base} (${paymentProviderLabel})`
  }, [title, paymentProviderLabel])
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [isCancelling, setIsCancelling] = useState(false)
  const [successCountdown, setSuccessCountdown] = useState(null) // 4, 3, 2, 1 lalu tutup
  const [buyerEmail, setBuyerEmail] = useState('')
  const [buyerPhone, setBuyerPhone] = useState('')
  const [contactEmailInput, setContactEmailInput] = useState('')
  const [contactPhoneInput, setContactPhoneInput] = useState('')
  const [needEmailFix, setNeedEmailFix] = useState(false)
  const [needPhoneFix, setNeedPhoneFix] = useState(false)
  const [contactEditAll, setContactEditAll] = useState(false)
  const [contactReturnStep, setContactReturnStep] = useState(1)
  const [contactLoading, setContactLoading] = useState(false)
  const [contactSaving, setContactSaving] = useState(false)
  const [confirmAdminFee, setConfirmAdminFee] = useState(null)
  const [confirmAdminFeeLoading, setConfirmAdminFeeLoading] = useState(false)
  const paymentResolvedRef = useRef(false)
  const paymentSubmitLockRef = useRef(false)
  const openSessionRef = useRef(0)
  const skipContactGateRef = useRef(false)

  const isPendaftaran = jenisPembayaran === 'Pendaftaran'
  const idReg = idRegistrasi ?? (isPendaftaran ? idReferensi : null)
  const isListSelection = selectionMode === 'list'

  const listPayables = useMemo(() => {
    if (!isListSelection) return []
    const external = mapPayableFromRincian(payableItems)
    if (isPendaftaran) {
      return pendaftaranPayables.length > 0 ? pendaftaranPayables : external
    }
    return external
  }, [isListSelection, payableItems, isPendaftaran, pendaftaranPayables])

  const selectedSum = useMemo(() => {
    if (!isListSelection || selectedPayIds.size === 0) return 0
    return listPayables
      .filter((p) => selectedPayIds.has(p.id))
      .reduce((s, p) => s + p.kurang, 0)
  }, [isListSelection, listPayables, selectedPayIds])

  const allListIds = useMemo(
    () => listPayables.map((p) => p.id),
    [listPayables]
  )

  const listPayablesTotal = useMemo(
    () => listPayables.reduce((s, p) => s + p.kurang, 0),
    [listPayables]
  )

  const allocatedTotal = useMemo(() => {
    if (!isListSelection) return 0
    return selectedSum + (partialPayable?.applied ?? 0)
  }, [isListSelection, selectedSum, partialPayable])

  const syncSelectionFromAmount = useCallback(
    (amount) => {
      if (!isListSelection || listPayables.length === 0) return
      const n = Math.round(Number(amount) || 0)
      if (n <= 0) {
        setSelectedPayIds(new Set())
        setPartialPayable(null)
        return
      }
      const { fullIds, partial } = allocatePayablesForAmount(n, listPayables)
      setSelectedPayIds(fullIds)
      setPartialPayable(partial)
    },
    [isListSelection, listPayables]
  )

  const masterLunasChecked =
    isListSelection &&
    allListIds.length > 0 &&
    allListIds.every((id) => selectedPayIds.has(id))

  const applyAmount = useCallback((n) => {
    setIpaymuAmount(formatNominalInput(n))
  }, [])

  const resetNominalStep = useCallback(() => {
    setIpaymuAmount('')
    setBayarLunasChecked(false)
    setSelectedPayIds(new Set())
    setPartialPayable(null)
    setSelectionSource(null)
    setPendaftaranPayables([])
  }, [])

  const applyBuyerContact = useCallback((email, phone) => {
    const e = String(email || '').trim()
    const p = String(phone || '').trim()
    setBuyerEmail(e)
    setBuyerPhone(p)
    setContactEmailInput(e)
    setContactPhoneInput(p)
    setNeedEmailFix(!isValidEmailFormat(e))
    setNeedPhoneFix(!isValidPhoneForPayment(p))
    return { emailOk: isValidEmailFormat(e), phoneOk: isValidPhoneForPayment(p) }
  }, [])

  const openContactStep = useCallback((opts = {}) => {
    const editAll = opts.editAll === true
    const returnStep = opts.returnStep ?? 1
    setContactEditAll(editAll)
    setContactReturnStep(returnStep)
    setContactEmailInput(buyerEmail)
    setContactPhoneInput(buyerPhone)
    if (editAll) {
      setNeedEmailFix(true)
      setNeedPhoneFix(true)
    } else {
      setNeedEmailFix(!isValidEmailFormat(buyerEmail))
      setNeedPhoneFix(!isValidPhoneForPayment(buyerPhone))
    }
    setStepDirection(opts.direction ?? 1)
    setIpaymuStep(0)
  }, [buyerEmail, buyerPhone])

  useEffect(() => {
    if (!isOpen) return
    openSessionRef.current += 1
    const session = openSessionRef.current
    skipContactGateRef.current = false
    resetNominalStep()
    setPaymentMethod('')
    setPaymentChannel('')
    setOpenAccordion(null)
    setVaInfo(null)
    setTransactionStatus(null)
    setContactEditAll(false)
    setContactReturnStep(1)
    setContactSaving(false)
    setConfirmAdminFee(null)
    paymentResolvedRef.current = false
    setIpaymuStep(-1)
    setContactLoading(true)

    ;(async () => {
      let email = ''
      let phone = ''
      try {
        const storeBio = useSantriDataStore.getState().biodata
        if (storeBio) {
          email = String(storeBio.email || '').trim()
          phone = pickSantriPhone(storeBio)
        }
        const biodata = await profilAPI.getBiodata()
        if (session !== openSessionRef.current) return
        if (biodata?.success && biodata?.data) {
          email = String(biodata.data.email || '').trim()
          phone = pickSantriPhone(biodata.data)
          const store = useSantriDataStore.getState()
          if (store.biodata) {
            store.setBiodata({
              ...store.biodata,
              email,
              no_wa_santri: biodata.data.no_wa_santri ?? store.biodata.no_wa_santri,
              no_telpon: biodata.data.no_telpon ?? store.biodata.no_telpon,
            })
          }
        }
      } catch (_) {
        /* pakai cache store bila ada */
      }
      if (session !== openSessionRef.current) return
      const { emailOk, phoneOk } = applyBuyerContact(email, phone)
      setContactLoading(false)
      if (skipContactGateRef.current) return
      if (!emailOk || !phoneOk) {
        setContactEditAll(false)
        setContactReturnStep(1)
        setIpaymuStep(0)
      } else {
        setIpaymuStep(1)
      }
    })()
  }, [isOpen, resetNominalStep, applyBuyerContact])

  useEffect(() => {
    if (!isOpen || !isPendaftaran || !isListSelection || !idReg) return
    let cancelled = false
    setPendaftaranItemsLoading(true)
    pembayaranAPI
      .getRegistrasiDetail(idReg)
      .then((res) => {
        if (cancelled) return
        if (res?.success && Array.isArray(res.data)) {
          setPendaftaranPayables(mapPayableFromRegistrasiDetail(res.data))
        } else {
          setPendaftaranPayables([])
        }
      })
      .catch(() => {
        if (!cancelled) setPendaftaranPayables([])
      })
      .finally(() => {
        if (!cancelled) setPendaftaranItemsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [isOpen, isPendaftaran, isListSelection, idReg])

  useEffect(() => {
    if (!isOpen || selectionSource === 'amount') return
    if (isListSelection) {
      if (selectedPayIds.size > 0) {
        applyAmount(selectedSum)
      } else if (selectionSource === 'manual') {
        setIpaymuAmount('')
      }
      return
    }
    if (bayarLunasChecked && kurang > 0) {
      applyAmount(kurang)
    }
  }, [isOpen, isListSelection, selectionSource, bayarLunasChecked, kurang, selectedSum, selectedPayIds.size, applyAmount])

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
            const bankName = paymentMethodDisplayName(t.payment_method, t.payment_channel)
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
            skipContactGateRef.current = true
            onNotify('Menampilkan transaksi pembayaran yang sudah ada', 'info')
          }
        })
        .catch(() => {})
        .finally(() => setProcessingIPaymu(false))
    }
    paymentTransactionAPI.getMode().then((r) => {
      if (r?.success && r?.data) {
        if (r.data.is_sandbox) setIsSandboxMode(true)
        if (r.data.payment_provider) setPaymentProvider(r.data.payment_provider)
        if (r.data.provider_label) setPaymentProviderLabel(r.data.provider_label)
      }
      else setIsSandboxMode(false)
    }).catch(() => setIsSandboxMode(false))
  }, [isOpen, isPendaftaran, idReg, idSantri, idReferensi, tabelReferensi])

  // 'cancelled' lokal/API: hitung mundur tetap jalan — QR/VA bisa masih valid sampai expired_at iPayMu
  useEffect(() => {
    const terminal = ['expired', 'failed', 'paid', 'success']
    const isPending = transactionStatus == null || !terminal.includes(String(transactionStatus || '').toLowerCase())
    if (!vaInfo?.expired_at || !isPending) {
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
        const rawStatus = r.data.status
        const s = String(rawStatus || '').toLowerCase().trim()
        setTransactionStatus(rawStatus)

        if (s === 'paid' || s === 'success') {
          paymentResolvedRef.current = true
          onNotify('Pembayaran berhasil!', 'success')
          const tx = r.data
          const bankName = paymentMethodDisplayName(tx.payment_method, tx.payment_channel)
          setVaInfo(prev => ({
            ...prev,
            va_number: tx.va_number ?? prev?.va_number,
            qr_code: tx.qr_code ?? prev?.qr_code,
            payment_method: tx.payment_method ?? prev?.payment_method,
            payment_channel: tx.payment_channel ?? prev?.payment_channel,
            bank: bankName,
            payment_url: tx.payment_url ?? prev?.payment_url,
            session_id: tx.session_id ?? prev?.session_id,
            transaction_id: tx.id ?? tx.trx_id ?? prev?.transaction_id,
            amount: tx.amount ?? prev?.amount,
            admin_fee: tx.admin_fee ?? prev?.admin_fee,
            total: tx.total ?? prev?.total,
          }))
          setSuccessCountdown(4)
          return
        }

        if (s === 'cancelled') {
          setTransactionStatus(rawStatus)
          return
        }

        if (s === 'expired' || s === 'failed') {
          paymentResolvedRef.current = true
          if (mounted) {
            setVaInfo(null)
            setTransactionStatus(null)
            goToStep(1)
          }
        }
      } catch (_) {}
    }
    // Polling status pembayaran: backoff bertahap (5s → 15s → 30s) supaya tidak
    // menumpuk request ke backend + iPayMu saat banyak santri bayar bersamaan.
    // Pause saat tab di-hide. Berhenti otomatis setelah 30 menit (offcanvas perlu
    // dibuka ulang kalau session masih hidup).
    const POLL_STEPS_MS = [5000, 15000, 30000]
    const MAX_POLL_MS = 30 * 60 * 1000
    const startedAt = Date.now()
    let pollIdx = 0
    let timeoutId = null
    const tick = async () => {
      if (!mounted) return
      if (Date.now() - startedAt > MAX_POLL_MS) return
      if (typeof document !== 'undefined' && document.hidden) {
        timeoutId = setTimeout(tick, POLL_STEPS_MS[0])
        return
      }
      await check()
      const delay = POLL_STEPS_MS[Math.min(pollIdx, POLL_STEPS_MS.length - 1)]
      pollIdx += 1
      if (mounted) timeoutId = setTimeout(tick, delay)
    }
    const t = setTimeout(check, 1000)
    timeoutId = setTimeout(tick, POLL_STEPS_MS[0])
    return () => { mounted = false; clearTimeout(t); if (timeoutId) clearTimeout(timeoutId) }
  }, [vaInfo?.session_id, isOpen])

  const goToStep = (step) => {
    setIpaymuStep(step)
  }

  useEffect(() => {
    if (!isOpen || vaInfo || ipaymuStep !== 3 || !paymentMethod) {
      return
    }
    let cancelled = false
    setConfirmAdminFeeLoading(true)
    paymentTransactionAPI
      .getAdminFee(paymentMethod, paymentChannel || '')
      .then((res) => {
        if (cancelled) return
        const fee = res?.data?.admin_fee
        setConfirmAdminFee(fee != null && fee !== '' ? Number(fee) : 0)
      })
      .catch(() => {
        if (!cancelled) setConfirmAdminFee(0)
      })
      .finally(() => {
        if (!cancelled) setConfirmAdminFeeLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [isOpen, vaInfo, ipaymuStep, paymentMethod, paymentChannel])

  const handleManualCheckStatus = async () => {
    if (!vaInfo?.session_id || isCheckingStatus) return
    setIsCheckingStatus(true)
    try {
      const r = await paymentTransactionAPI.checkStatus(vaInfo.session_id)
      if (!r?.success || !r.data) return
      const tx = r.data
      const raw = tx.status
      const s = String(raw || '').toLowerCase()
      setTransactionStatus(raw)
      if (s !== 'paid' && s !== 'success') return
      onNotify('Pembayaran berhasil!', 'success')
      let bankName = 'Bank'
      bankName = paymentMethodDisplayName(tx.payment_method, tx.payment_channel)
      setVaInfo((prev) => ({
        ...prev,
        va_number: tx.va_number ?? prev?.va_number,
        qr_code: tx.qr_code ?? prev?.qr_code,
        payment_method: tx.payment_method ?? prev?.payment_method,
        payment_channel: tx.payment_channel ?? prev?.payment_channel,
        bank: bankName,
        payment_url: tx.payment_url ?? prev?.payment_url,
        session_id: tx.session_id ?? prev?.session_id,
        transaction_id: tx.id ?? tx.trx_id ?? prev?.transaction_id,
        amount: tx.amount ?? prev?.amount,
        admin_fee: tx.admin_fee ?? prev?.admin_fee,
        total: tx.total ?? prev?.total,
      }))
      setSuccessCountdown(4)
    } catch (_) {
      /* abaikan */
    } finally {
      setIsCheckingStatus(false)
    }
  }

  const handleAmountInput = (e) => {
    setSelectionSource('amount')
    setBayarLunasChecked(false)
    const value = e.target.value.replace(/\D/g, '')
    setIpaymuAmount(value ? new Intl.NumberFormat('id-ID').format(value) : '')
    syncSelectionFromAmount(parseInt(value, 10) || 0)
  }

  const handleBayarLunasSingle = (checked) => {
    setSelectionSource('manual')
    setBayarLunasChecked(checked)
    if (checked && kurang > 0) {
      applyAmount(kurang)
    } else if (!checked) {
      setIpaymuAmount('')
    }
  }

  const handleMasterLunas = (checked) => {
    setSelectionSource('manual')
    setPartialPayable(null)
    if (checked) {
      setSelectedPayIds(new Set(allListIds))
    } else {
      setSelectedPayIds(new Set())
      setIpaymuAmount('')
    }
  }

  const togglePayableItem = (id) => {
    setSelectionSource('manual')
    setPartialPayable(null)
    setSelectedPayIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const maxAllowedAmount = useMemo(() => {
    const totalCap =
      isListSelection && listPayablesTotal > 0
        ? kurang > 0
          ? Math.min(kurang, listPayablesTotal)
          : listPayablesTotal
        : kurang > 0
          ? kurang
          : 0
    if (!isListSelection) return totalCap
    if (selectionSource === 'manual' && selectedPayIds.size > 0) {
      return Math.min(totalCap, selectedSum)
    }
    return totalCap
  }, [isListSelection, selectionSource, selectedPayIds.size, selectedSum, listPayablesTotal, kurang])

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

  const handleSaveContact = async () => {
    const showEmail = contactEditAll || needEmailFix
    const showPhone = contactEditAll || needPhoneFix
    const email = contactEmailInput.trim()
    const phone = contactPhoneInput.trim()

    if (showEmail && !isValidEmailFormat(email)) {
      onNotify('Masukkan alamat email yang valid', 'error')
      return
    }
    if (showPhone && !isValidPhoneForPayment(phone)) {
      onNotify('Masukkan nomor HP/WA yang valid (minimal 10 digit)', 'error')
      return
    }

    setContactSaving(true)
    try {
      const payload = {}
      if (showEmail) payload.email = email
      if (showPhone) payload.no_wa_santri = phone
      const res = await profilAPI.updateBiodataContact(payload)
      if (!res?.success) throw new Error(res?.message || 'Gagal menyimpan kontak')

      const savedEmail = res.data?.email ?? (showEmail ? email : buyerEmail)
      const savedPhone = res.data?.no_wa_santri ?? (showPhone ? phone : buyerPhone)
      applyBuyerContact(savedEmail, savedPhone)

      const store = useSantriDataStore.getState()
      if (store.biodata) {
        store.setBiodata({
          ...store.biodata,
          email: savedEmail,
          no_wa_santri: savedPhone,
        })
      }

      setContactEditAll(false)
      onNotify('Kontak berhasil disimpan', 'success')
      setStepDirection(1)
      setIpaymuStep(contactReturnStep > 0 ? contactReturnStep : 1)
    } catch (err) {
      onNotify(err.response?.data?.message || err.message || 'Gagal menyimpan kontak', 'error')
    } finally {
      setContactSaving(false)
    }
  }

  const handleIPaymuPayment = async (opts = {}) => {
    if (paymentSubmitLockRef.current) return
    paymentSubmitLockRef.current = true
    setProcessingIPaymu(true)

    const amount = parseNominalInput(ipaymuAmount)
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
    if (maxAllowedAmount > 0 && amount > maxAllowedAmount) {
      onNotify(`Tidak boleh melebihi sisa kurang Rp ${maxAllowedAmount.toLocaleString('id-ID')}`, 'error')
      paymentSubmitLockRef.current = false
      setProcessingIPaymu(false)
      return
    }
    if (isListSelection && !hasPayableListSelection(listPayables, selectedPayIds, partialPayable)) {
      onNotify('Masukkan nominal atau pilih minimal satu bulan/item', 'error')
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
    if (paymentMethod === 'ewallet' && !paymentChannel) {
      onNotify('Pilih aplikasi e-wallet', 'error')
      paymentSubmitLockRef.current = false
      setProcessingIPaymu(false)
      return
    }

    let nama = 'Pembayar'
    let phone = typeof opts.phoneOverride === 'string' ? opts.phoneOverride.trim() : buyerPhone
    let email = typeof opts.emailOverride === 'string' ? opts.emailOverride.trim() : buyerEmail
    try {
      const biodata = await profilAPI.getBiodata()
      if (biodata?.success && biodata?.data) {
        const d = biodata.data
        nama = d.nama || nama
        if (!opts.emailOverride) email = String(d.email || email || '').trim()
        if (!opts.phoneOverride) phone = pickSantriPhone(d) || phone
        applyBuyerContact(email, phone)
      }
    } catch (_) {}

    if (!isValidPhoneForPayment(phone) || !isValidEmailFormat(email)) {
      openContactStep({ returnStep: 3, editAll: false, direction: -1 })
      onNotify('Lengkapi email dan nomor HP yang valid sebelum membayar.', 'error')
      paymentSubmitLockRef.current = false
      setProcessingIPaymu(false)
      return
    }

    try {
      // URL untuk redirect setelah bayar/batal di iPayMu — user kembali ke aplikasi myBeddien
      const origin = typeof window !== 'undefined' ? window.location.origin : ''
      const path = typeof window !== 'undefined' ? (window.location.pathname || '') : ''
      const returnCancelUrl = origin && path ? `${origin}${path}` : ''

      const paymentData = {
        amount,
        name: nama,
        phone: phone.trim(),
        email: email.trim(),
        payment_method: paymentMethod,
        reference_id: `PAY-${String(jenisPembayaran).toUpperCase()}-${Date.now()}-${idSantri || idReferensi || 'X'}`,
        jenis_pembayaran: jenisPembayaran,
        id_referensi: idReferensi ?? null,
        tabel_referensi: tabelReferensi,
        id_santri: idSantri ?? null,
        return_url: returnCancelUrl,
        cancel_url: returnCancelUrl,
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
      const bankName = paymentMethodDisplayName(paymentMethod, paymentChannel)

      let expiredAtTs = Date.now() + 24 * 60 * 60 * 1000
      if (rd.expired_at) {
        const parsed = new Date(rd.expired_at).getTime()
        if (!Number.isNaN(parsed)) expiredAtTs = parsed
      }
      const displayAmount = rd.amount != null && rd.amount !== '' ? Number(rd.amount) : amount
      const displayTotal = rd.total != null && rd.total !== '' ? Number(rd.total) : (displayAmount + (Number(rd.admin_fee) || 0))

      setVaInfo({
        va_number: finalVa,
        bank: bankName,
        payment_method: paymentMethod,
        payment_channel: paymentChannel || null,
        amount: displayAmount,
        admin_fee: rd.admin_fee ?? 0,
        total: displayTotal,
        payment_url: rd.payment_url || null,
        qr_code: finalQr,
        session_id: sessionId,
        transaction_id: txId,
        expired_at: expiredAtTs,
      })
      setTransactionStatus('pending')
      paymentResolvedRef.current = false
      setStepDirection(1)
      goToStep(3)
      if (rd.reused_existing) {
        onNotify('Memakai tagihan yang sama (nominal & metode sama, belum kedaluwarsa). Tidak dibuat order baru. Hitung mundur mengikuti sisa waktu berlaku.', 'info')
      } else {
        onNotify('Pembayaran berhasil dibuat', 'success')
      }
      if (rd.payment_url) window.open(rd.payment_url, '_blank', 'noopener,noreferrer')
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Gagal membuat pembayaran iPayMu'
      if (isEmailInvalidPaymentError(msg) || isPhoneInvalidPaymentError(msg)) {
        openContactStep({ returnStep: 3, editAll: true, direction: -1 })
        onNotify('Email atau nomor HP belum valid. Perbaiki lalu coba bayar lagi.', 'error')
      } else {
        onNotify(msg, 'error')
      }
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
            <div className="absolute inset-0 bg-primary-800/50" />
          </div>
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 shrink-0">
              <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
                {vaInfo ? 'Informasi Pembayaran' : displayTitle}
              </h2>
              <button type="button" onClick={handleClose} className="p-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-4 space-y-4">
              {isSandboxMode && (
                <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg text-xs text-amber-800 dark:text-amber-200">
                  Mode Sandbox {paymentProviderLabel}. Transaksi tidak memproses pembayaran sebenarnya.
                </div>
              )}

              {!vaInfo && ipaymuStep < 0 && (
                <div className="flex flex-col items-center justify-center py-12 gap-3">
                  <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary-500 border-t-transparent" />
                  <p className="text-sm text-gray-500 dark:text-gray-400">Memeriksa data kontak…</p>
                </div>
              )}

              {!vaInfo && ipaymuStep === 0 && (
                <div className="flex items-center justify-center gap-1 text-xs text-primary-600 dark:text-primary-400 mb-2">
                  <span className="inline-flex w-6 h-6 items-center justify-center rounded-full bg-primary-100 dark:bg-primary-900/40 font-semibold text-primary-700 dark:text-primary-300">!</span>
                  Lengkapi kontak
                </div>
              )}

              {!vaInfo && ipaymuStep > 0 && (
                <div className="flex items-center justify-center gap-1 text-xs text-gray-500 dark:text-gray-400 mb-2">
                  <div className={ipaymuStep >= 1 ? 'text-primary-600' : ''}><span className="inline-flex w-6 h-6 items-center justify-center rounded-full bg-gray-200 dark:bg-gray-700 font-semibold">{ipaymuStep > 1 ? '✓' : '1'}</span> Nominal</div>
                  <div className="h-0.5 w-8 bg-gray-300 dark:bg-gray-600" />
                  <div className={ipaymuStep >= 2 ? 'text-primary-600' : ''}><span className="inline-flex w-6 h-6 items-center justify-center rounded-full bg-gray-200 dark:bg-gray-700 font-semibold">{ipaymuStep > 2 ? '✓' : '2'}</span> Metode</div>
                  <div className="h-0.5 w-8 bg-gray-300 dark:bg-gray-600" />
                  <div className={ipaymuStep >= 3 ? 'text-primary-600' : ''}><span className="inline-flex w-6 h-6 items-center justify-center rounded-full bg-gray-200 dark:bg-gray-700 font-semibold">3</span> Bayar</div>
                </div>
              )}

              {!vaInfo && ipaymuStep === 0 && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
                  <div>
                    <h4 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-1">
                      {contactReturnStep === 3 ? 'Perbaiki kontak' : 'Lengkapi kontak pembayaran'}
                    </h4>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {paymentProviderLabel} membutuhkan email dan nomor HP yang valid. Data disimpan ke biodata Anda.
                    </p>
                  </div>
                  {contactLoading ? (
                    <div className="flex justify-center py-8">
                      <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary-500 border-t-transparent" />
                    </div>
                  ) : (
                    <>
                      {(contactEditAll || needEmailFix) && (
                        <div>
                          <label htmlFor="ipaymu-contact-email" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Email
                          </label>
                          <input
                            id="ipaymu-contact-email"
                            type="email"
                            inputMode="email"
                            autoComplete="email"
                            value={contactEmailInput}
                            onChange={(e) => setContactEmailInput(e.target.value)}
                            placeholder="contoh@email.com"
                            className="w-full px-3 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                          />
                        </div>
                      )}
                      {(contactEditAll || needPhoneFix) && (
                        <div>
                          <label htmlFor="ipaymu-contact-phone" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Nomor HP / WhatsApp
                          </label>
                          <input
                            id="ipaymu-contact-phone"
                            type="tel"
                            inputMode="numeric"
                            autoComplete="tel"
                            value={contactPhoneInput}
                            onChange={(e) => setContactPhoneInput(e.target.value.replace(/[^\d+]/g, '').slice(0, 16))}
                            placeholder="08xxxxxxxxxx"
                            className="w-full px-3 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 font-mono"
                          />
                          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Minimal 10 digit (contoh 081234567890).</p>
                        </div>
                      )}
                    </>
                  )}
                </motion.div>
              )}

              {!vaInfo && ipaymuStep === 1 && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
                  <div>
                    <h4 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-2">Mau Bayar Berapa?</h4>
                    {kurang > 0 && <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">Sisa kurang: <strong className="text-amber-600">Rp {kurang.toLocaleString('id-ID')}</strong></p>}
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Jumlah Pembayaran</label>
                    <p className="text-xs text-gray-500 dark:text-gray-400 shrink-0">Minimal: Rp 20.000</p>
                  </div>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={ipaymuAmount}
                    onChange={handleAmountInput}
                    placeholder="Masukkan nominal"
                    className="w-full p-3 border-2 border-gray-300 dark:border-gray-600 rounded-lg focus:border-primary-500 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100 text-right font-mono text-lg"
                  />
                  {isListSelection && listPayables.length > 0 && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5">
                      Isi nominal untuk centang bulan otomatis, atau centang bulan untuk hitung nominal.
                    </p>
                  )}

                  {!isListSelection && kurang > 0 && (
                    <label className="mt-3 flex items-start gap-2.5 cursor-pointer rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/50 px-3 py-2.5">
                      <input
                        type="checkbox"
                        checked={bayarLunasChecked}
                        onChange={(e) => handleBayarLunasSingle(e.target.checked)}
                        className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                      />
                      <span className="text-sm text-gray-800 dark:text-gray-200">
                        <span className="font-medium">Bayar Lunas</span>
                        <span className="block text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                          Isi otomatis Rp {kurang.toLocaleString('id-ID')}
                        </span>
                      </span>
                    </label>
                  )}

                  {isListSelection && (
                    <motion.div
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="mt-3 space-y-2"
                    >
                      {pendaftaranItemsLoading ? (
                        <p className="text-xs text-gray-500 dark:text-gray-400 py-2">Memuat daftar item…</p>
                      ) : listPayables.length === 0 ? (
                        <p className="text-xs text-gray-500 dark:text-gray-400 py-1">
                          Tidak ada item yang belum lunas. Anda tetap bisa memasukkan nominal manual (maks. sisa kurang).
                        </p>
                      ) : (
                        <>
                          <label className="flex items-start gap-2.5 cursor-pointer rounded-lg border-2 border-primary-200 dark:border-primary-600/70 bg-primary-50/80 dark:bg-primary-900/25 px-3 py-2.5">
                            <input
                              type="checkbox"
                              checked={masterLunasChecked}
                              onChange={(e) => handleMasterLunas(e.target.checked)}
                              className="mt-0.5 h-4 w-4 rounded border-gray-300 dark:border-gray-500 text-primary-600 focus:ring-primary-500"
                            />
                            <span className="text-sm text-gray-900 dark:text-gray-100">
                              <span className="font-semibold">Bayar Lunas</span>
                              <span className="block text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                                Centang semua item di bawah (
                                Rp{' '}
                                {listPayables
                                  .reduce((s, p) => s + p.kurang, 0)
                                  .toLocaleString('id-ID')}
                                )
                              </span>
                            </span>
                          </label>
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 px-0.5">
                            {isPendaftaran ? 'Pilih item biaya' : 'Pilih bulan'}
                          </p>
                          <ul className="rounded-lg border border-gray-200 dark:border-gray-600 divide-y divide-gray-100 dark:divide-gray-700">
                            {listPayables.map((item) => {
                              const isFull = selectedPayIds.has(item.id)
                              const isPartial = partialPayable?.id === item.id
                              return (
                                <li
                                  key={item.id}
                                  className={
                                    isPartial
                                      ? 'border-l-4 border-l-amber-400 bg-amber-50/90 dark:bg-amber-950/35'
                                      : ''
                                  }
                                >
                                  <label className="flex items-center gap-2.5 px-3 py-2.5 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/40">
                                    <input
                                      type="checkbox"
                                      checked={isFull}
                                      ref={(el) => {
                                        if (el) el.indeterminate = isPartial && !isFull
                                      }}
                                      onChange={() => togglePayableItem(item.id)}
                                      className="h-4 w-4 shrink-0 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                                    />
                                    <span className="flex-1 min-w-0">
                                      <span className="block text-sm text-gray-800 dark:text-gray-200 truncate">
                                        {item.label}
                                      </span>
                                      {isPartial && (
                                        <span className="block text-[11px] font-medium text-amber-800 dark:text-amber-200 mt-0.5">
                                          Kurang Rp {partialPayable.shortage.toLocaleString('id-ID')}
                                        </span>
                                      )}
                                    </span>
                                    <span className="text-xs font-semibold text-amber-700 dark:text-amber-300 tabular-nums shrink-0">
                                      Rp {item.kurang.toLocaleString('id-ID')}
                                    </span>
                                  </label>
                                </li>
                              )
                            })}
                          </ul>
                          {(selectedPayIds.size > 0 || partialPayable) && (
                            <p className="text-xs text-gray-600 dark:text-gray-400 text-right">
                              {selectionSource === 'amount' ? 'Alokasi' : 'Terpilih'}: Rp{' '}
                              {allocatedTotal.toLocaleString('id-ID')}
                            </p>
                          )}
                        </>
                      )}
                    </motion.div>
                  )}
                </motion.div>
              )}

              {!vaInfo && ipaymuStep === 2 && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
                  <h4 className="text-base font-semibold text-gray-900 dark:text-gray-100">Pilih Metode Pembayaran</h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Nominal:{' '}
                    <strong className="text-primary-600 dark:text-primary-400">Rp {ipaymuAmount || '0'}</strong>
                  </p>
                  <div className={PAY_METHODS_LIGHT}>
                    <div>
                    <button type="button" onClick={() => handleAccordionToggle('va')} className={PAY_METHODS_HEAD}>
                      <span className="font-medium text-gray-900 shrink-0">Virtual Account (VA)</span>
                      <div className="flex items-center gap-1.5 min-w-0 justify-end">
                        <span className="flex items-center gap-1 min-w-0 overflow-hidden">
                          {VA_HEAD_LOGOS.map((bank) => (
                            <BankIcon key={bank} bank={bank} className="h-5 shrink-0" />
                          ))}
                        </span>
                        <svg className={`${PAY_METHODS_CHEVRON} ${openAccordion === 'va' ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
                      </div>
                    </button>
                    {openAccordion === 'va' && (
                      <div className={PAY_METHODS_PANEL}>
                        {VA_CHANNELS.map((ch) => (
                          <button key={ch.value} type="button" onClick={() => handleChannelSelect(ch.value)} className={payMethodItemCls(paymentChannel === ch.value)}>
                            {paymentChannel === ch.value ? <span className="w-5 h-5 rounded-full bg-primary-500 text-white flex items-center justify-center shrink-0 text-xs font-bold">✓</span> : <span className="w-5 h-5 rounded-full border-2 border-gray-400 shrink-0" />}
                            <span className="flex-1 font-medium text-gray-900">{ch.label}</span>
                            <BankIcon bank={ch.value} className="h-8" />
                          </button>
                        ))}
                      </div>
                    )}
                    </div>
                    <div>
                      <button type="button" onClick={() => handleAccordionToggle('qris')} className={PAY_METHODS_HEAD}>
                        <span className="font-medium text-gray-900">QRIS</span>
                        <div className="flex items-center gap-2 shrink-0">
                          <QRISIcon className="h-7" />
                          <svg className={`${PAY_METHODS_CHEVRON} ${openAccordion === 'qris' ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
                        </div>
                      </button>
                    {openAccordion === 'qris' && (
                      <div className={PAY_METHODS_PANEL}>
                        <button
                          type="button"
                          onClick={() => {
                            setPaymentMethod('qris')
                            setPaymentChannel('')
                          }}
                          className={payMethodItemCls(paymentMethod === 'qris')}
                        >
                          {paymentMethod === 'qris' ? (
                            <span className="w-5 h-5 rounded-full bg-primary-500 text-white flex items-center justify-center shrink-0 text-xs font-bold">✓</span>
                          ) : (
                            <span className="w-5 h-5 rounded-full border-2 border-gray-400 shrink-0" />
                          )}
                          <span className="flex-1 font-medium text-gray-900">QRIS</span>
                          <QRISIcon className="h-8" />
                        </button>
                        <div className="flex flex-wrap items-center gap-3">
                          <img src={getGambarUrl('/logo/dana.png')} alt="Dana" className="h-9 w-auto max-w-[90px] object-contain object-center" />
                          <img src={getGambarUrl('/logo/gopay.png')} alt="GoPay" className="h-9 w-auto max-w-[90px] object-contain object-center" />
                          <img src={getGambarUrl('/logo/shopee-pay.png')} alt="ShopeePay" className="h-9 w-auto max-w-[90px] object-contain object-center" />
                          <img src={getGambarUrl('/logo/ovo.png')} alt="OVO" className="h-9 w-auto max-w-[90px] object-contain object-center" />
                          <img src={getGambarUrl('/logo/linkaja.png')} alt="LinkAja" className="h-9 w-auto max-w-[90px] object-contain object-center" />
                        </div>
                        <p className="text-sm text-gray-600">
                          Bisa memakai semua QRIS di mobile banking atau e-wallet, dengan scan QR atau upload gambar QR.
                        </p>
                      </div>
                    )}
                  </div>
                    {(() => {
                      const ewalletChannels = paymentProvider === 'xendit' ? XENDIT_EWALLET_CHANNELS : IPAYMU_EWALLET_CHANNELS
                      return (
                    <div>
                      <button type="button" onClick={() => handleAccordionToggle('ewallet')} className={PAY_METHODS_HEAD}>
                        <span className="font-medium text-gray-900">E-Wallet</span>
                        <div className="flex items-center gap-2 shrink-0">
                          {ewalletChannels.slice(0, 2).map((ch) => (
                            <EwalletIcon key={ch.value} wallet={ch.value} className="h-7" />
                          ))}
                          <svg className={`${PAY_METHODS_CHEVRON} ${openAccordion === 'ewallet' ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
                        </div>
                      </button>
                      {openAccordion === 'ewallet' && (
                        <div className={PAY_METHODS_PANEL}>
                          {ewalletChannels.map((ch) => (
                            <button key={ch.value} type="button" onClick={() => handleChannelSelect(ch.value)} className={payMethodItemCls(paymentChannel === ch.value && paymentMethod === 'ewallet')}>
                              {paymentChannel === ch.value && paymentMethod === 'ewallet' ? <span className="w-5 h-5 rounded-full bg-primary-500 text-white flex items-center justify-center shrink-0 text-xs font-bold">✓</span> : <span className="w-5 h-5 rounded-full border-2 border-gray-400 shrink-0" />}
                              <span className="flex-1 font-medium text-gray-900">{ch.label}</span>
                              <EwalletIcon wallet={ch.value} className="h-8" />
                            </button>
                          ))}
                          <p className="text-xs text-gray-600">
                            {paymentProvider === 'xendit'
                              ? 'Setelah bayar, Anda diarahkan kembali ke myBeddian (redirect Xendit).'
                              : 'Setelah bayar di aplikasi e-wallet, Anda diarahkan kembali ke myBeddian (iPaymu). Pastikan channel sudah diaktifkan di dashboard iPaymu.'}
                          </p>
                        </div>
                      )}
                    </div>
                      )
                    })()}
                    <div>
                      <button type="button" onClick={() => handleAccordionToggle('cstore')} className={PAY_METHODS_HEAD}>
                        <span className="font-medium text-gray-900 shrink-0">Convenience Store</span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <CStoreIcon store="alfamart" className="h-6" />
                          <CStoreIcon store="indomaret" className="h-6" />
                          <svg className={`${PAY_METHODS_CHEVRON} ${openAccordion === 'cstore' ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
                        </div>
                      </button>
                    {openAccordion === 'cstore' && (
                      <div className={PAY_METHODS_PANEL}>
                        {CSTORE_CHANNELS.map((ch) => (
                          <button key={ch.value} type="button" onClick={() => handleChannelSelect(ch.value)} className={payMethodItemCls(paymentChannel === ch.value)}>
                            {paymentChannel === ch.value ? <span className="w-5 h-5 rounded-full bg-primary-500 text-white flex items-center justify-center shrink-0 text-xs font-bold">✓</span> : <span className="w-5 h-5 rounded-full border-2 border-gray-400 shrink-0" />}
                            <span className="flex-1 font-medium text-gray-900">{ch.label}</span>
                            <CStoreIcon store={ch.value} className="h-8" />
                          </button>
                        ))}
                      </div>
                    )}
                    </div>
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
                    className="w-20 h-20 rounded-full bg-primary-100 dark:bg-primary-900/50 flex items-center justify-center mx-auto mb-5 ring-4 ring-primary-200/50 dark:ring-primary-800/50"
                  >
                    <motion.svg
                      initial={{ pathLength: 0 }}
                      animate={{ pathLength: 1 }}
                      transition={{ delay: 0.2, duration: 0.4 }}
                      className="w-10 h-10 text-primary-600 dark:text-primary-400"
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
                    <p className="text-sm text-primary-600 dark:text-primary-400 mt-3 font-medium">
                      Menutup dalam {successCountdown} detik...
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={() => { setVaInfo(null); setTransactionStatus(null); setSuccessCountdown(null); goToStep(1); onSuccess?.(); onClose() }}
                    className="mt-4 px-4 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium"
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
                        {String(transactionStatus || '').toLowerCase() === 'cancelled' && (
                          <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                            Dibatalkan di aplikasi — jika sudah membayar via QR/VA, gunakan &quot;Cek status&quot; atau tunggu konfirmasi otomatis.
                          </p>
                        )}
                        {countdownRemaining != null && <div className="text-sm font-mono text-blue-600 dark:text-blue-400 mt-1">Kadaluwarsa: {Math.floor(countdownRemaining / 3600)}:{String(Math.floor((countdownRemaining % 3600) / 60)).padStart(2, '0')}:{String(countdownRemaining % 60).padStart(2, '0')}</div>}
                      </div>
                      {vaInfo.session_id && (
                        <button type="button" onClick={handleManualCheckStatus} disabled={isCheckingStatus} className="p-2 rounded-lg bg-primary-100 dark:bg-primary-900/50 text-primary-600" title="Cek status">
                          {isCheckingStatus ? <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg> : <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>}
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="p-4 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700">
                    <div className="flex justify-between text-sm mb-1"><span className="text-gray-600 dark:text-gray-400">Nominal</span><span className="font-semibold text-gray-900 dark:text-gray-100">Rp {(vaInfo.amount ?? 0).toLocaleString('id-ID')}</span></div>
                    {(vaInfo.admin_fee != null && vaInfo.admin_fee > 0) && <div className="flex justify-between text-sm mb-1"><span className="text-gray-600 dark:text-gray-400">Biaya admin</span><span className="font-semibold text-gray-900 dark:text-gray-100">Rp {(vaInfo.admin_fee ?? 0).toLocaleString('id-ID')}</span></div>}
                    <div className="flex justify-between text-sm pt-2 border-t border-gray-200 dark:border-gray-600"><span className="font-semibold text-gray-800 dark:text-gray-200">Total</span><span className="font-bold text-primary-600 dark:text-primary-400">Rp {(vaInfo.total ?? vaInfo.amount ?? 0).toLocaleString('id-ID')}</span></div>
                  </div>
                  {vaInfo.va_number && (
                    <div className="p-4 rounded-lg bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800">
                      <div className="flex items-center justify-between gap-3 mb-2">
                        <span className="text-sm font-medium text-primary-700 dark:text-primary-300">Bayar via {vaInfo.bank || (vaInfo.payment_method === 'cstore' ? 'Convenience Store' : 'Virtual Account')}</span>
                        <span className="shrink-0">
                          {vaInfo.payment_method === 'va' && <BankIcon bank={vaInfo.payment_channel || 'bca'} className="h-10" />}
                          {vaInfo.payment_method === 'cstore' && <CStoreIcon store={vaInfo.payment_channel || 'alfamart'} className="h-10" />}
                          {vaInfo.payment_method === 'ewallet' && <EwalletIcon wallet={vaInfo.payment_channel || 'dana'} className="h-10" />}
                        </span>
                      </div>
                      <div className="font-mono text-lg font-bold text-primary-800 dark:text-primary-200 break-all">{vaInfo.va_number}</div>
                      <button type="button" onClick={() => { navigator.clipboard?.writeText(vaInfo.va_number); onNotify(vaInfo.payment_method === 'cstore' ? 'Kode pembayaran disalin' : 'Nomor VA disalin', 'success') }} className="mt-2 text-sm text-primary-600 dark:text-primary-400 hover:underline">Salin</button>
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
                  {vaInfo.qr_code && (
                    <div className={QR_PANEL_LIGHT}>
                      <div className="flex items-center justify-center gap-2 mb-2">
                        <span className="text-sm font-semibold text-primary-800">Bayar via {vaInfo.payment_method === 'qris' ? 'QRIS' : (vaInfo.bank || '')}</span>
                        {vaInfo.payment_method === 'qris' && <QRISIcon className="h-8" />}
                      </div>
                      <QrCodeImage value={vaInfo.qr_code} className="w-full max-w-[220px] h-auto mx-auto rounded border border-gray-100" />
                      {vaInfo.payment_method === 'qris' && (
                        <div className="mt-4 text-left space-y-3">
                          <p className="text-sm font-semibold text-gray-900 text-center">Cara bayar dengan QRIS</p>
                          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-2">
                            <p className="text-xs font-semibold uppercase tracking-wide text-primary-700">Metode 1 — Unduh &amp; upload</p>
                            <ol className="list-decimal list-inside text-sm text-gray-700 space-y-1">
                              <li>Unduh gambar QRIS (tombol di bawah).</li>
                              <li>Buka aplikasi e-wallet (Dana, GoPay, OVO, ShopeePay, dll.).</li>
                              <li>Pilih bayar via QRIS → <strong>Upload gambar QR</strong> / pilih dari galeri.</li>
                              <li>Konfirmasi nominal dan selesaikan pembayaran.</li>
                            </ol>
                            <button
                              type="button"
                              onClick={() => downloadQrisImage(vaInfo.qr_code, onNotify)}
                              className="w-full mt-1 px-4 py-2 text-sm font-medium text-primary-800 bg-primary-50 border border-primary-200 rounded-lg hover:bg-primary-100 inline-flex items-center justify-center gap-2"
                            >
                              <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                              Unduh gambar QRIS
                            </button>
                          </div>
                          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-1">
                            <p className="text-xs font-semibold uppercase tracking-wide text-primary-700">Metode 2 — Scan dengan HP lain</p>
                            <ol className="list-decimal list-inside text-sm text-gray-700 space-y-1">
                              <li>Buka aplikasi e-wallet di <strong>ponsel lain</strong> (bukan yang menampilkan halaman ini).</li>
                              <li>Pilih bayar / scan QRIS, lalu arahkan kamera ke kode QR di atas.</li>
                              <li>Periksa nominal, lalu konfirmasi pembayaran.</li>
                            </ol>
                          </div>
                          <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
                            <img src={getGambarUrl('/logo/dana.png')} alt="Dana" className="h-8 w-auto max-w-[80px] object-contain" />
                            <img src={getGambarUrl('/logo/gopay.png')} alt="GoPay" className="h-8 w-auto max-w-[80px] object-contain" />
                            <img src={getGambarUrl('/logo/shopee-pay.png')} alt="ShopeePay" className="h-8 w-auto max-w-[80px] object-contain" />
                            <img src={getGambarUrl('/logo/ovo.png')} alt="OVO" className="h-8 w-auto max-w-[80px] object-contain" />
                            <img src={getGambarUrl('/logo/linkaja.png')} alt="LinkAja" className="h-8 w-auto max-w-[80px] object-contain" />
                          </div>
                        </div>
                      )}
                      {vaInfo.payment_method !== 'qris' && (
                        <div className="text-sm text-primary-700 mt-2">{vaInfo.bank || ''}</div>
                      )}
                    </div>
                  )}
                  {vaInfo.payment_method === 'ewallet' && vaInfo.payment_url && (
                    <div className="p-4 rounded-lg bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800 space-y-2">
                      <p className="text-sm text-primary-800 dark:text-primary-200">
                        Buka aplikasi <strong>{vaInfo.bank || 'e-wallet'}</strong> untuk menyelesaikan pembayaran. Jika halaman tidak terbuka otomatis, gunakan tombol di bawah.
                      </p>
                      <a href={vaInfo.payment_url} target="_blank" rel="noopener noreferrer" className="block w-full px-4 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium text-center">
                        Lanjut ke {vaInfo.bank || 'E-Wallet'}
                      </a>
                    </div>
                  )}
                  {vaInfo.payment_url && vaInfo.payment_method !== 'ewallet' && (
                    <div className="flex gap-2">
                      <a href={vaInfo.payment_url} target="_blank" rel="noopener noreferrer" className="flex-1 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium text-center">Buka Halaman Bayar</a>
                      <button type="button" onClick={() => setShowCancelModal(true)} className="px-4 py-2 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg font-medium">Batal</button>
                    </div>
                  )}
                  {vaInfo.payment_method === 'ewallet' && (
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setShowCancelModal(true)} className="flex-1 px-4 py-2 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg font-medium">Batal</button>
                    </div>
                  )}
                </motion.div>
              )}

              {!vaInfo && ipaymuStep === 3 && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
                  <h4 className="text-base font-semibold text-gray-900 dark:text-gray-100">Konfirmasi Pembayaran</h4>
                  <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 space-y-3">
                    <div className="flex justify-between text-sm gap-3">
                      <span className="text-gray-600 dark:text-gray-400">Nominal</span>
                      <span className="font-semibold text-gray-900 dark:text-gray-100 tabular-nums">
                        Rp {(parseNominalInput(ipaymuAmount) || 0).toLocaleString('id-ID')}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm gap-3">
                      <span className="text-gray-600 dark:text-gray-400">Biaya admin</span>
                      <span className="font-semibold text-gray-900 dark:text-gray-100 tabular-nums text-right">
                        {confirmAdminFeeLoading
                          ? '…'
                          : `Rp ${(Number(confirmAdminFee) || 0).toLocaleString('id-ID')}`}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm gap-3 pt-2 border-t border-gray-200 dark:border-gray-600">
                      <span className="font-semibold text-gray-800 dark:text-gray-200">Total</span>
                      <span className="font-bold text-primary-600 dark:text-primary-400 tabular-nums">
                        {confirmAdminFeeLoading
                          ? '…'
                          : `Rp ${((parseNominalInput(ipaymuAmount) || 0) + (Number(confirmAdminFee) || 0)).toLocaleString('id-ID')}`}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm gap-3 pt-2 border-t border-gray-200 dark:border-gray-600">
                      <span className="text-gray-600 dark:text-gray-400">Metode</span>
                      <span className="inline-flex items-center gap-2 font-medium text-gray-900 dark:text-gray-100 text-right">
                        <PaymentMethodLogo paymentMethod={paymentMethod} paymentChannel={paymentChannel} className="h-7" />
                        {paymentMethodDisplayName(paymentMethod, paymentChannel)}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm gap-3 pt-2 border-t border-gray-200 dark:border-gray-600">
                      <span className="text-gray-600 dark:text-gray-400">Email</span>
                      <span className="font-medium text-gray-900 dark:text-gray-100 text-right break-all">
                        {buyerEmail || '—'}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm gap-3">
                      <span className="text-gray-600 dark:text-gray-400">No. HP</span>
                      <span className="font-medium text-gray-900 dark:text-gray-100 font-mono text-right">
                        {buyerPhone || '—'}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => openContactStep({ editAll: true, returnStep: 3, direction: -1 })}
                    className="w-full inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 text-sm font-medium text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                  >
                    <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    Edit email / no. HP
                  </button>
                </motion.div>
              )}
            </div>

            {!vaInfo && ipaymuStep >= 0 && (
              <div className="shrink-0 px-4 pt-2 pb-1 border-t border-gray-200 dark:border-gray-700">
                <p className="text-xs text-gray-600 dark:text-gray-400 text-center mb-1.5">Informasi penting:</p>
                <div className="flex flex-wrap gap-x-2 gap-y-1 justify-center text-xs">
                  <button
                    type="button"
                    onClick={() => openLegalPage('/syarat-ketentuan')}
                    className="text-primary-600 dark:text-primary-400 hover:underline"
                  >
                    Syarat &amp; Ketentuan
                  </button>
                  <span className="text-gray-400">•</span>
                  <button
                    type="button"
                    onClick={() => openLegalPage('/kebijakan-pengembalian-dana')}
                    className="text-primary-600 dark:text-primary-400 hover:underline"
                  >
                    Kebijakan Pengembalian Dana
                  </button>
                  <span className="text-gray-400">•</span>
                  <button
                    type="button"
                    onClick={() => openLegalPage('/faq')}
                    className="text-primary-600 dark:text-primary-400 hover:underline"
                  >
                    FAQ
                  </button>
                </div>
              </div>
            )}

            <div className="shrink-0 p-4 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex gap-2">
              {!vaInfo && ipaymuStep === 0 && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      if (contactReturnStep === 3 && isValidEmailFormat(buyerEmail) && isValidPhoneForPayment(buyerPhone)) {
                        setStepDirection(1)
                        setIpaymuStep(3)
                        setContactEditAll(false)
                        return
                      }
                      handleClose()
                    }}
                    disabled={contactSaving}
                    className="flex-1 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-lg font-medium disabled:opacity-50"
                  >
                    {contactReturnStep === 3 && isValidEmailFormat(buyerEmail) && isValidPhoneForPayment(buyerPhone) ? 'Kembali' : 'Batal'}
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveContact}
                    disabled={contactSaving || contactLoading}
                    className="flex-1 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {contactSaving ? 'Menyimpan...' : 'Simpan'}
                  </button>
                </>
              )}
              {!vaInfo && ipaymuStep === 1 && (
                <>
                  <button type="button" onClick={handleClose} className="flex-1 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-lg font-medium">Batal</button>
                  <button
                    type="button"
                    onClick={() => {
                      const amount = parseNominalInput(ipaymuAmount)
                      if (!amount || amount < 20000) {
                        onNotify('Minimal Rp 20.000', 'error')
                        return
                      }
                      if (maxAllowedAmount > 0 && amount > maxAllowedAmount) {
                        onNotify('Tidak boleh melebihi sisa kurang', 'error')
                        return
                      }
                      if (isListSelection && !hasPayableListSelection(listPayables, selectedPayIds, partialPayable)) {
                        onNotify('Masukkan nominal atau pilih minimal satu bulan/item', 'error')
                        return
                      }
                      setStepDirection(1)
                      goToStep(2)
                    }}
                    className="flex-1 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium"
                  >Selanjutnya</button>
                </>
              )}
              {!vaInfo && ipaymuStep === 2 && (
                <>
                  <button type="button" onClick={() => { setStepDirection(-1); goToStep(1) }} className="flex-1 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-lg font-medium">Kembali</button>
                  <button type="button" onClick={() => { if (!paymentMethod) { onNotify('Pilih metode pembayaran', 'error'); return } if (paymentMethod === 'va' && !paymentChannel) { onNotify('Pilih bank', 'error'); return } if (paymentMethod === 'cstore' && !paymentChannel) { onNotify('Pilih merchant', 'error'); return } if (paymentMethod === 'ewallet' && !paymentChannel) { onNotify('Pilih e-wallet', 'error'); return } setStepDirection(1); goToStep(3) }} className="flex-1 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium">Selanjutnya</button>
                </>
              )}
              {!vaInfo && ipaymuStep === 3 && (
                <>
                  <button type="button" onClick={() => { setStepDirection(-1); goToStep(2) }} className="flex-1 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-lg font-medium">Kembali</button>
                  <button type="button" onClick={() => handleIPaymuPayment()} disabled={processingIPaymu} className="flex-1 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none">{processingIPaymu ? 'Memproses...' : 'Bayar'}</button>
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
