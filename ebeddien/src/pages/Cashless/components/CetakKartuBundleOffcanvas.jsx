import { useState, useEffect, useCallback, useMemo, useId, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { createPortal } from 'react-dom'
import { QRCodeSVG } from 'qrcode.react'
import { useNotification } from '../../../contexts/NotificationContext'
import { cashlessAPI, santriAPI, pendaftaranAPI } from '../../../services/api'
import { createTypedObjectUrl } from '../../../utils/filePreviewMedia'
import KartuCetakUlangModal from './KartuCetakUlangModal'
import KartuQrValidateScanner from './KartuQrValidateScanner'
import KartuPinForm from './KartuPinForm'
import { MahromCardPreview, MahromCardDesignPicker } from './MahromCardDesigns'
import { SantriCardPhotoPreview, SantriCardDesignPicker } from './SantriCardDesigns'
import { CARD_TYPE_LABELS, CARD_TYPE_SHORT } from '../constants/cashlessKartu'
import { mergeMahromAddressFields, readMahromCardDesign, writeMahromCardDesign } from '../constants/mahromCardDesign'
import { readSantriCardDesign, writeSantriCardDesign } from '../constants/santriCardDesign'
import { getGambarUrl } from '../../../config/images'
import './CetakKartuCashlessOffcanvas.css'
import './CashlessBankCard.css'

const CARD_BRAND_LOGO = getGambarUrl('/logo.png')

const CARD_WIDTH_MM = 85.6
const CARD_HEIGHT_MM = 53.98

const TARGET_CLASS_PREFIX = 'print-cashless-target-'

const CARD_SLOT_ACCENT = {
  SANTRI: 'text-emerald-700 dark:text-emerald-400',
  MAHROM: 'text-blue-700 dark:text-blue-400',
}

function formatEmbossedNumber(raw) {
  const digits = String(raw || '').replace(/\D/g, '')
  if (!digits) return ''
  return digits.replace(/(\d{3})(?=\d)/g, '$1 ').trim()
}

function EmvChip({ className = '' }) {
  const gradId = useId().replace(/:/g, '')
  return (
    <svg className={className} viewBox="0 0 44 34" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <rect x="1" y="1" width="42" height="32" rx="4" fill={`url(#${gradId})`} stroke="#b8860b" strokeWidth="0.6" />
      <path d="M14 1v32M30 1v32M1 12h42M1 22h42" stroke="#c9a227" strokeWidth="0.5" opacity="0.65" />
      <defs>
        <linearGradient id={gradId} x1="4" y1="2" x2="40" y2="32" gradientUnits="userSpaceOnUse">
          <stop stopColor="#f5e6a8" />
          <stop offset="0.45" stopColor="#d4af37" />
          <stop offset="1" stopColor="#a67c00" />
        </linearGradient>
      </defs>
    </svg>
  )
}

function ContactlessIcon({ className = '' }) {
  return (
    <svg className={`cashless-bank-card__contactless ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M8.5 12.5c2.2-2.2 5.8-2.2 8 0" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M5.5 9.5c3.9-3.9 10.1-3.9 14 0" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.75" />
      <path d="M11.5 15.5c1.1-1.1 2.9-1.1 4 0" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

function bodyTargetClass(cardTypeOrAll, mahromId = null) {
  if (!cardTypeOrAll) return null
  if (cardTypeOrAll === 'all') return `${TARGET_CLASS_PREFIX}all`
  if (cardTypeOrAll === 'SANTRI') return `${TARGET_CLASS_PREFIX}santri`
  if (cardTypeOrAll === 'MAHROM' && mahromId) return `${TARGET_CLASS_PREFIX}mahrom-${mahromId}`
  return `${TARGET_CLASS_PREFIX}${String(cardTypeOrAll).toLowerCase()}`
}

function cardSlotKey(card) {
  if (!card) return ''
  if (card.card_type === 'MAHROM' && card.mahrom_id) return `MAHROM:${card.mahrom_id}`
  return String(card.card_type || '')
}

function cardSantriIdentity(card, santri) {
  const namaSantri = (card?.santri_nama || santri?.nama || '').trim()
  const nis = card?.santri_nis ? String(card.santri_nis).trim() : (santri?.nis ? String(santri.nis).trim() : '')
  return { namaSantri, nis }
}

function cardDisplayIdentity(card, santri) {
  const { namaSantri, nis } = cardSantriIdentity(card, santri)
  if (card.card_type === 'MAHROM') {
    const mahromNama = (card.mahrom_nama || card.display_nama || '').trim()
    const hubungan = card.mahrom_hubungan || card.holder_label || 'Mahrom'
    const nim = card.mahrom_nim ? String(card.mahrom_nim).trim() : ''
    return {
      primaryLabel: hubungan,
      primaryNama: mahromNama,
      mahromNim: nim,
      showSantriLine: true,
      namaSantri,
      nis,
    }
  }
  return {
    primaryLabel: null,
    primaryNama: namaSantri,
    showSantriLine: false,
    namaSantri,
    nis,
  }
}

export function SingleCardPreview({
  card,
  santri,
  dataCardType,
  className = '',
  mahromDesign = 'classic',
  santriDesign = 'classic',
  santriDetail = null,
  santriFotoUrl = null,
}) {
  const cardType = dataCardType || card.card_type
  if (cardType === 'MAHROM') {
    return (
      <MahromCardPreview card={card} santri={santri} design={mahromDesign} className={className} />
    )
  }

  if (cardType === 'SANTRI' && santriDesign === 'photo') {
    return (
      <SantriCardPhotoPreview
        card={card}
        santri={santri}
        santriDetail={santriDetail}
        fotoUrl={santriFotoUrl}
        className={className}
      />
    )
  }

  const display = cardDisplayIdentity(card, santri)
  const hasToken = !!card.token
  const embossedNumber = formatEmbossedNumber(display.nis)
  const typeShort = CARD_TYPE_SHORT[cardType] || card.card_label

  return (
    <div
      data-card-type={cardType}
      className={`cashless-bank-card cashless-bank-card--santri print-card-cashless print-card-item ${className}`}
      style={{ width: `${CARD_WIDTH_MM}mm`, height: `${CARD_HEIGHT_MM}mm`, minHeight: `${CARD_HEIGHT_MM}mm` }}
    >
      <div className="cashless-bank-card__pattern" aria-hidden />
      <div className="cashless-bank-card__shine" aria-hidden />
      <div className="cashless-bank-card__inner">
        <div className="cashless-bank-card__top">
          <div className="cashless-bank-card__brand">
            <img src={CARD_BRAND_LOGO} alt="" className="cashless-bank-card__brand-logo" draggable={false} />
            <div className="cashless-bank-card__brand-text">
              <span className="cashless-bank-card__brand-name">Al-Utsmani</span>
              <span className="cashless-bank-card__brand-sub">Cashless</span>
            </div>
          </div>
          <div className="cashless-bank-card__badges">
            <span className="cashless-bank-card__type-badge">{card.card_label || typeShort}</span>
            <ContactlessIcon />
          </div>
        </div>
        <div className="cashless-bank-card__chip-row">
          <EmvChip className="cashless-bank-card__chip" />
        </div>
        <div className="cashless-bank-card__body">
          <div className="cashless-bank-card__main">
            <p className="cashless-bank-card__number" title={display.nis || undefined}>
              {embossedNumber || '•••• •••• ••••'}
            </p>
            <p className="cashless-bank-card__name" title={display.primaryNama || undefined}>
              {display.primaryNama ? display.primaryNama.toUpperCase() : 'NAMA SANTRI'}
            </p>
            {hasToken ? (
              <p className="cashless-bank-card__token" title={card.token}>
                {card.token_prefix} ••••
              </p>
            ) : (
              <p className="cashless-bank-card__token cashless-bank-card__token--muted">
                Terbitkan kartu untuk melihat QR
              </p>
            )}
          </div>
          <div className="cashless-bank-card__qr">
            {hasToken ? (
              <QRCodeSVG value={card.token} size={68} level="M" includeMargin={false} bgColor="#ffffff" fgColor="#0f172a" />
            ) : (
              <div className="cashless-bank-card__qr-placeholder">QR setelah terbit</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function PrintStatusBadge({ printed, active, pendingValidation, hasPending }) {
  if (pendingValidation) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 px-2 py-0.5 rounded-full">
        Menunggu validasi
      </span>
    )
  }
  if (!active && !hasPending) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-full">
        Belum diterbitkan
      </span>
    )
  }
  if (active && printed) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 px-2 py-0.5 rounded-full">
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
        </svg>
        Aktif
      </span>
    )
  }
  if (hasPending && !printed) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 rounded-full">
        Pending · belum cetak
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 px-2 py-0.5 rounded-full">
      Belum dicetak
    </span>
  )
}

function mergeIssuedIntoDisplay(displayBase, issued) {
  if (!issued) return displayBase
  return mergeMahromAddressFields(
    {
      ...displayBase,
      token: issued.token,
      token_prefix: issued.token_prefix,
      kartu_id: issued.kartu_id,
      santri_nama: issued.santri_nama || displayBase.santri_nama,
      santri_nis: issued.santri_nis ?? displayBase.santri_nis,
      mahrom_nim: issued.mahrom_nim || displayBase.mahrom_nim,
      mahrom_nama: issued.mahrom_nama || displayBase.mahrom_nama,
      mahrom_hubungan: issued.mahrom_hubungan || displayBase.mahrom_hubungan,
      display_nama: issued.mahrom_nama || displayBase.display_nama,
      holder_label: issued.mahrom_hubungan || displayBase.holder_label,
    },
    issued
  )
}

/**
 * Offcanvas cetak kartu per tipe (CS, CM) — cetak ulang hanya tipe yang dipilih.
 */
export default function CetakKartuBundleOffcanvas({
  isOpen,
  onClose,
  cards = [],
  santri = null,
  focusType = null,
  validateFocusType = null,
  autoOpenValidate = false,
  initialActiveMap = null,
  initialPrintedMap = null,
  onStatusChange = null,
}) {
  const { showNotification } = useNotification()
  const [showPortal, setShowPortal] = useState(isOpen)
  const [cardsState, setCardsState] = useState([])
  const [activeMap, setActiveMap] = useState({})
  const [printedMap, setPrintedMap] = useState({})
  const [kartuDbRows, setKartuDbRows] = useState([])
  const [activeMahromMap, setActiveMahromMap] = useState({})
  const [printedMahromMap, setPrintedMahromMap] = useState({})
  const [pendingSantriRow, setPendingSantriRow] = useState(null)
  const [pendingMahromMap, setPendingMahromMap] = useState({})
  const [printQueue, setPrintQueue] = useState(null)
  const [printSnapshot, setPrintSnapshot] = useState([])
  const [busyType, setBusyType] = useState(null)
  const [confirmState, setConfirmState] = useState(null)
  const [mahromOptions, setMahromOptions] = useState([])
  const [mahromDesign, setMahromDesign] = useState(readMahromCardDesign)
  const [santriDesign, setSantriDesign] = useState(readSantriCardDesign)
  const [santriDetail, setSantriDetail] = useState(null)
  const [santriFotoUrl, setSantriFotoUrl] = useState(null)
  const [validateOpen, setValidateOpen] = useState(false)
  const [validating, setValidating] = useState(false)
  const [validateTarget, setValidateTarget] = useState(null)
  const validateQueueRef = useRef([])
  const santriFotoUrlRef = useRef(null)

  const handleMahromDesignChange = useCallback((designId) => {
    setMahromDesign(designId)
    writeMahromCardDesign(designId)
  }, [])

  const handleSantriDesignChange = useCallback((designId) => {
    setSantriDesign(designId)
    writeSantriCardDesign(designId)
  }, [])

  const santriId = santri?.id ?? santri?.entity_id ?? null

  const revokeSantriFoto = useCallback(() => {
    if (santriFotoUrlRef.current?.startsWith('blob:')) {
      URL.revokeObjectURL(santriFotoUrlRef.current)
    }
    santriFotoUrlRef.current = null
    setSantriFotoUrl(null)
  }, [])

  // Detail santri (NIK, TTL, alamat) + pas foto untuk desain kartu berfoto.
  useEffect(() => {
    if (!isOpen || !santriId) return undefined
    let cancelled = false
    ;(async () => {
      try {
        const res = await santriAPI.getById(santriId)
        if (!cancelled) {
          const row = res?.data && typeof res.data === 'object' ? res.data : null
          setSantriDetail(row)
        }
      } catch {
        if (!cancelled) setSantriDetail(null)
      }
      try {
        const berkas = await pendaftaranAPI.getBerkasList(santriId, 'foto_cashless')
        const list =
          berkas?.success && Array.isArray(berkas.data)
            ? berkas.data.filter((b) => !b.status_tidak_ada).sort((a, b) => Number(b.id) - Number(a.id))
            : []
        const latest = list[0]
        if (latest?.id) {
          const blob = await pendaftaranAPI.downloadBerkas(latest.id)
          if (!cancelled && blob) {
            const { url } = createTypedObjectUrl(blob, latest.tipe_file, latest.nama_file)
            revokeSantriFoto()
            santriFotoUrlRef.current = url
            setSantriFotoUrl(url)
          }
        } else if (!cancelled) {
          revokeSantriFoto()
        }
      } catch {
        if (!cancelled) revokeSantriFoto()
      }
    })()
    return () => {
      cancelled = true
    }
  }, [isOpen, santriId, revokeSantriFoto])

  useEffect(() => {
    if (!isOpen) {
      setSantriDetail(null)
      revokeSantriFoto()
    }
  }, [isOpen, revokeSantriFoto])

  useEffect(() => () => revokeSantriFoto(), [revokeSantriFoto])

  useEffect(() => {
    if (isOpen) setShowPortal(true)
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) {
      setCardsState([])
      setMahromOptions([])
      setKartuDbRows([])
      setActiveMahromMap({})
      setPrintedMahromMap({})
      setPendingSantriRow(null)
      setPendingMahromMap({})
      setPrintQueue(null)
      setPrintSnapshot([])
      setValidateOpen(false)
      setValidateTarget(null)
      validateQueueRef.current = []
      setActiveMap({})
      setPrintedMap({})
      return
    }
    if (Array.isArray(cards) && cards.length > 0) {
      setCardsState(cards)
    }
    if (initialActiveMap) {
      setActiveMap(initialActiveMap)
    }
    if (initialPrintedMap) {
      setPrintedMap(initialPrintedMap)
    }
  }, [isOpen, cards, initialActiveMap, initialPrintedMap])

  const loadDbStatus = useCallback(async () => {
    if (!santriId) return
    try {
      const res = await cashlessAPI.listKartuBySantri(santriId)
      if (!res?.success) return
      if (Array.isArray(res.mahrom_options)) {
        setMahromOptions(res.mahrom_options)
      }
      if (!Array.isArray(res.data)) return
      setKartuDbRows(res.data)
      const active = {}
      const printed = {}
      const activeMahrom = {}
      const printedMahrom = {}
      const pendingMahrom = {}
      let pendingSantri = null
      res.data.forEach((row) => {
        const isActive = row.validated || row.status === 'active'
        const isPending = row.awaiting_validation || row.status === 'pending'
        if (row.card_type === 'SANTRI') {
          if (isActive) {
            active.SANTRI = true
            printed.SANTRI = !!row.printed
          }
          if (isPending) pendingSantri = row
        }
        if (row.card_type === 'MAHROM' && row.mahrom_id) {
          if (isActive) {
            activeMahrom[row.mahrom_id] = true
            printedMahrom[row.mahrom_id] = !!row.printed
            active.MAHROM = true
            if (row.printed) printed.MAHROM = true
          }
          if (isPending) pendingMahrom[row.mahrom_id] = row
        }
      })
      setActiveMap(active)
      setPrintedMap(printed)
      setActiveMahromMap(activeMahrom)
      setPrintedMahromMap(printedMahrom)
      setPendingSantriRow(pendingSantri)
      setPendingMahromMap(pendingMahrom)
    } catch {
      // abaikan
    }
  }, [santriId])

  useEffect(() => {
    if (!isOpen) return
    loadDbStatus()
  }, [isOpen, loadDbStatus])

  useEffect(() => {
    if (isOpen) document.body.classList.add('print-offcanvas-open')
    else document.body.classList.remove('print-offcanvas-open')
    return () => document.body.classList.remove('print-offcanvas-open')
  }, [isOpen])

  const clearBodyTarget = useCallback(() => {
    document.body.classList.forEach((cls) => {
      if (cls.startsWith(TARGET_CLASS_PREFIX)) {
        document.body.classList.remove(cls)
      }
    })
  }, [])

  useEffect(() => {
    const onAfterPrint = () => {
      clearBodyTarget()
      setPrintQueue(null)
      setPrintSnapshot([])
      if (validateQueueRef.current.length > 0) {
        setValidateTarget(validateQueueRef.current[0])
        setValidateOpen(true)
      }
    }
    window.addEventListener('afterprint', onAfterPrint)
    return () => {
      window.removeEventListener('afterprint', onAfterPrint)
      clearBodyTarget()
      setPrintQueue(null)
      setPrintSnapshot([])
    }
  }, [clearBodyTarget])

  const runPrint = useCallback((target, mahromId = null, snapshot = []) => {
    clearBodyTarget()
    setPrintSnapshot(snapshot)
    if (target === 'all') {
      setPrintQueue(null)
      document.body.classList.add(bodyTargetClass('all'))
    } else if (target === 'SANTRI') {
      setPrintQueue(['SANTRI'])
      document.body.classList.add(bodyTargetClass('SANTRI'))
    } else if (target === 'MAHROM' && mahromId) {
      setPrintQueue([`MAHROM:${mahromId}`])
      document.body.classList.add(bodyTargetClass('MAHROM', mahromId))
    }
    requestAnimationFrame(() => {
      window.setTimeout(() => window.print(), 100)
    })
  }, [clearBodyTarget])

  const getTokenCard = useCallback(
    (cardType, mahromId = null) => {
      if (cardType === 'MAHROM' && mahromId) {
        return cardsState.find(
          (c) => c.card_type === 'MAHROM' && Number(c.mahrom_id) === Number(mahromId)
        )
      }
      return cardsState.find((c) => c.card_type === cardType)
    },
    [cardsState]
  )

  const displayCards = useMemo(() => {
    const csFromState = getTokenCard('SANTRI')
    const csDb = kartuDbRows.find((r) => r.card_type === 'SANTRI' && (r.validated || r.status === 'active'))
    const csPending = pendingSantriRow
    const csCard = {
      card_type: 'SANTRI',
      card_label: CARD_TYPE_LABELS.SANTRI,
      token: csFromState?.token || null,
      token_prefix: csFromState?.token_prefix || csDb?.token_prefix || csPending?.token_prefix || null,
      kartu_id: csFromState?.kartu_id || csDb?.kartu_id || csPending?.kartu_id || null,
      has_pin: !!(csDb?.has_pin || csFromState?.has_pin),
      santri_nama: csFromState?.santri_nama || santri?.nama || null,
      santri_nis: csFromState?.santri_nis ?? santri?.nis ?? null,
      active: !!activeMap.SANTRI,
      printed: !!printedMap.SANTRI,
      hasPending: !!csPending,
      pendingValidation: !!(csPending?.printed && !csPending?.validated),
      awaitingScan: !!(csPending?.printed && !csPending?.validated),
    }

    const cmCards = mahromOptions.map((opt) => {
      const fromState = getTokenCard('MAHROM', opt.mahrom_id)
      const dbRow = kartuDbRows.find(
        (r) => r.card_type === 'MAHROM' && Number(r.mahrom_id) === Number(opt.mahrom_id) && (r.validated || r.status === 'active')
      )
      const pendingRow = pendingMahromMap[opt.mahrom_id]
      const hubungan = opt.hubungan || 'Mahrom'
      let cmCard = {
        card_type: 'MAHROM',
        mahrom_id: opt.mahrom_id,
        card_label: `${CARD_TYPE_SHORT.MAHROM} · ${hubungan}`,
        card_label_full: `${hubungan} — ${opt.nama || ''}`.trim(),
        token: fromState?.token || null,
        token_prefix: fromState?.token_prefix || dbRow?.token_prefix || pendingRow?.token_prefix || null,
        santri_nama: fromState?.santri_nama || santri?.nama || null,
        santri_nis: fromState?.santri_nis ?? santri?.nis ?? null,
        mahrom_nim: fromState?.mahrom_nim || opt.nim || dbRow?.mahrom_nim || pendingRow?.mahrom_nim || null,
        mahrom_nama: fromState?.mahrom_nama || opt.nama || dbRow?.mahrom_nama || pendingRow?.mahrom_nama || '',
        mahrom_hubungan: hubungan,
        display_nama: fromState?.mahrom_nama || opt.nama || '',
        holder_label: hubungan,
        active: !!activeMahromMap[opt.mahrom_id],
        printed: !!printedMahromMap[opt.mahrom_id],
        hasPending: !!pendingRow,
        pendingValidation: !!(pendingRow?.printed && !pendingRow?.validated),
        awaitingScan: !!(pendingRow?.printed && !pendingRow?.validated),
      }
      cmCard = mergeMahromAddressFields(cmCard, opt)
      cmCard = mergeMahromAddressFields(cmCard, dbRow)
      cmCard = mergeMahromAddressFields(cmCard, pendingRow)
      cmCard = mergeMahromAddressFields(cmCard, fromState)
      return cmCard
    })

    return [csCard, ...cmCards]
  }, [
    getTokenCard,
    kartuDbRows,
    santri,
    activeMap,
    printedMap,
    activeMahromMap,
    printedMahromMap,
    mahromOptions,
    pendingSantriRow,
    pendingMahromMap,
  ])

  const mergeIssuedCard = useCallback((newCard) => {
    if (!newCard?.card_type) return
    setCardsState((prev) => {
      const rest = prev.filter((c) => {
        if (newCard.card_type === 'MAHROM') {
          return !(c.card_type === 'MAHROM' && Number(c.mahrom_id) === Number(newCard.mahrom_id))
        }
        return c.card_type !== newCard.card_type
      })
      return [...rest, newCard]
    })
  }, [])

  const issueSingle = useCallback(async (cardType, mahromId = null) => {
    if (!santriId) {
      showNotification('Santri tidak dikenali', 'error')
      return null
    }
    if (cardType === 'MAHROM' && !mahromId) {
      showNotification('Pilih mahrom untuk kartu CM', 'warning')
      return null
    }
    setBusyType(cardType)
    try {
      const res = await cashlessAPI.issueKartuSingle(santriId, cardType, mahromId || undefined)
      if (!res?.success || !res.data?.card) {
        showNotification(res?.message || 'Gagal menerbitkan kartu', 'error')
        return null
      }
      mergeIssuedCard(res.data.card)
      await loadDbStatus()
      return res.data.card
    } catch (err) {
      showNotification(err.response?.data?.message || 'Gagal menerbitkan kartu', 'error')
      return null
    } finally {
      setBusyType(null)
    }
  }, [santriId, showNotification, mergeIssuedCard, loadDbStatus])

  const markPrinted = useCallback(async (cardType, mahromId = null, kartuId = null) => {
    if (!santriId) return false
    try {
      const res = await cashlessAPI.markKartuPrinted(
        santriId,
        cardType,
        cardType === 'MAHROM' ? mahromId : null,
        kartuId
      )
      if (!res?.success) {
        showNotification(res?.message || 'Gagal menyimpan status cetak', 'error')
        return false
      }
      await loadDbStatus()
      onStatusChange?.()
      return true
    } catch {
      showNotification('Gagal menyimpan status cetak', 'error')
      return false
    }
  }, [santriId, showNotification, onStatusChange, loadDbStatus])

  const queueValidation = useCallback((items) => {
    if (!items?.length) return
    validateQueueRef.current = [...validateQueueRef.current, ...items]
  }, [])

  const executePrintFlow = useCallback(
    async ({ cardType, mahromId, issued, displayBase, target }) => {
      if (!issued?.token || !issued?.kartu_id) return false
      const printCard = mergeIssuedIntoDisplay(displayBase, issued)
      const ok = await markPrinted(cardType, mahromId || null, issued.kartu_id)
      if (!ok) return false

      queueValidation([
        {
          kartuId: issued.kartu_id,
          expectedToken: issued.token,
          label: displayBase.card_label_full || displayBase.card_label,
        },
      ])

      runPrint(target || cardType, mahromId || null, [printCard])
      return true
    },
    [markPrinted, queueValidation, runPrint]
  )

  const openValidateForCard = useCallback(
    (card) => {
      const pending =
        card.card_type === 'MAHROM' ? pendingMahromMap[card.mahrom_id] : pendingSantriRow
      if (!pending?.printed) {
        showNotification('Cetak kartu terlebih dahulu sebelum validasi', 'warning')
        return
      }
      const fromState = getTokenCard(card.card_type, card.mahrom_id)
      const kartuId = pending.kartu_id || fromState?.kartu_id
      if (!kartuId) {
        showNotification('Data kartu pending tidak ditemukan', 'error')
        return
      }
      validateQueueRef.current = [
        {
          kartuId,
          expectedToken: fromState?.token || '',
          label: card.card_label_full || card.card_label,
        },
      ]
      setValidateTarget(validateQueueRef.current[0])
      setValidateOpen(true)
    },
    [pendingMahromMap, pendingSantriRow, getTokenCard, showNotification]
  )

  const openValidateQueue = useCallback(
    (cardsToValidate) => {
      const items = (cardsToValidate || [])
        .map((card) => {
          const pending =
            card.card_type === 'MAHROM' ? pendingMahromMap[card.mahrom_id] : pendingSantriRow
          if (!pending?.printed || !pending?.kartu_id) return null
          const fromState = getTokenCard(card.card_type, card.mahrom_id)
          return {
            kartuId: pending.kartu_id,
            expectedToken: fromState?.token || '',
            label: card.card_label_full || card.card_label,
          }
        })
        .filter(Boolean)
      if (!items.length) {
        showNotification('Tidak ada kartu yang menunggu validasi', 'warning')
        return
      }
      validateQueueRef.current = items
      setValidateTarget(items[0])
      setValidateOpen(true)
    },
    [pendingMahromMap, pendingSantriRow, getTokenCard, showNotification]
  )

  const handleValidate = useCallback(
    async ({ token }) => {
      const target = validateTarget || validateQueueRef.current[0]
      if (!target) return
      setValidating(true)
      try {
        const res = await cashlessAPI.validateKartuPrinted(token, target.kartuId)
        if (!res?.success) {
          showNotification(res?.message || 'Validasi gagal', 'error')
          return
        }
        validateQueueRef.current.shift()
        if (validateQueueRef.current.length > 0) {
          setValidateTarget(validateQueueRef.current[0])
          showNotification('Kartu divalidasi. Lanjut scan kartu berikutnya.', 'success')
        } else {
          showNotification('Kartu berhasil divalidasi dan sekarang aktif.', 'success')
          setValidateOpen(false)
          setValidateTarget(null)
        }
        setCardsState((prev) =>
          prev.filter((c) => {
            if (target.kartuId && c.kartu_id === target.kartuId) return false
            return true
          })
        )
        await loadDbStatus()
        onStatusChange?.()
      } catch {
        showNotification('Gagal memvalidasi kartu', 'error')
      } finally {
        setValidating(false)
      }
    },
    [validateTarget, showNotification, loadDbStatus, onStatusChange]
  )

  const reissueAndPrint = useCallback(
    async (cardType, mahromId = null, displayBase = null) => {
      if (cardType === 'MAHROM' && !mahromId) {
        showNotification('Mahrom tidak dikenali', 'warning')
        return
      }
      const card = await issueSingle(cardType, mahromId)
      if (!card) return
      const base =
        displayBase ||
        displayCards.find((c) =>
          cardType === 'MAHROM'
            ? c.card_type === 'MAHROM' && Number(c.mahrom_id) === Number(mahromId)
            : c.card_type === cardType
        )
      const busyKey = cardType === 'MAHROM' ? `MAHROM:${mahromId}` : cardType
      setBusyType(busyKey)
      await executePrintFlow({
        cardType,
        mahromId,
        issued: card,
        displayBase: base,
        target: cardType,
      })
      setBusyType(null)
    },
    [issueSingle, displayCards, executePrintFlow, showNotification]
  )

  const ensureTokenThenPrint = useCallback(
    async (card) => {
      const { card_type: cardType, mahrom_id: mahromId } = card

      if (cardType === 'MAHROM' && !mahromId) {
        showNotification('Mahrom tidak dikenali', 'warning')
        return
      }

      const hasActivePrinted = card.active && card.printed && !card.pendingValidation
      if (hasActivePrinted) {
        setConfirmState({
          mode: 'single',
          cardType,
          mahromId,
          displayCard: card,
          printedLabel: card.card_label_full || card.card_label,
        })
        return
      }

      if (card.pendingValidation) {
        const busyKey = cardType === 'MAHROM' ? `MAHROM:${mahromId}` : cardType
        setBusyType(busyKey)
        await reissueAndPrint(cardType, mahromId, card)
        setBusyType(null)
        return
      }

      let issued = getTokenCard(cardType, mahromId)
      if (!issued?.token) {
        issued = await issueSingle(cardType, mahromId)
        if (!issued) return
      }

      const busyKey = cardType === 'MAHROM' ? `MAHROM:${mahromId}` : cardType
      setBusyType(busyKey)
      await executePrintFlow({
        cardType,
        mahromId,
        issued,
        displayBase: card,
        target: cardType,
      })
      setBusyType(null)
    },
    [getTokenCard, issueSingle, executePrintFlow, reissueAndPrint, showNotification]
  )

  const autoValidateConsumedRef = useRef(false)

  useEffect(() => {
    if (!isOpen) {
      autoValidateConsumedRef.current = false
      return
    }
    if (!autoOpenValidate && !validateFocusType) return
    if (autoValidateConsumedRef.current) return

    const pendingCards = displayCards.filter((c) => c.pendingValidation)
    if (!pendingCards.length) return

    autoValidateConsumedRef.current = true
    if (validateFocusType) {
      const target = displayCards.find((c) => cardSlotKey(c) === validateFocusType)
      if (target?.pendingValidation) {
        openValidateForCard(target)
      } else {
        openValidateQueue(pendingCards)
      }
    } else {
      openValidateQueue(pendingCards)
    }
  }, [
    isOpen,
    autoOpenValidate,
    validateFocusType,
    displayCards,
    openValidateForCard,
    openValidateQueue,
  ])

  const handlePrintAll = useCallback(async () => {
    if (mahromOptions.length === 0) {
      showNotification('Belum ada mahrom terhubung ke santri ini', 'warning')
      return
    }
    const hasActivePrinted = displayCards.some((c) => c.active && c.printed)
    if (hasActivePrinted) {
      const toProcess = displayCards.filter((c) => c.active && c.printed)
      setConfirmState({
        mode: 'batch',
        types: toProcess.map((c) => ({
          cardType: c.card_type,
          mahromId: c.mahrom_id || null,
          displayCard: c,
        })),
        printedLabels: toProcess.map((c) => c.card_label_full || c.card_label),
      })
      return
    }

    setBusyType('all')
    const snapshots = []
    const validateItems = []
    for (const c of displayCards) {
      const mid = c.card_type === 'MAHROM' ? c.mahrom_id : null
      let issued = getTokenCard(c.card_type, mid)
      if (!issued?.token) {
        issued = await issueSingle(c.card_type, mid)
        if (!issued) {
          setBusyType(null)
          return
        }
      }
      const printCard = mergeIssuedIntoDisplay(c, issued)
      const ok = await markPrinted(c.card_type, mid, issued.kartu_id)
      if (!ok) {
        setBusyType(null)
        return
      }
      snapshots.push(printCard)
      validateItems.push({
        kartuId: issued.kartu_id,
        expectedToken: issued.token,
        label: c.card_label_full || c.card_label,
      })
    }
    queueValidation(validateItems)
    setBusyType(null)
    runPrint('all', null, snapshots)
  }, [mahromOptions, displayCards, getTokenCard, issueSingle, markPrinted, queueValidation, runPrint, showNotification])

  const handleConfirmReprint = useCallback(async () => {
    if (!confirmState) return
    setBusyType('confirm')

    if (confirmState.mode === 'single') {
      const { cardType, mahromId, displayCard } = confirmState
      await reissueAndPrint(cardType, mahromId || null, displayCard || null)
    } else if (confirmState.mode === 'batch') {
      const snapshots = []
      const validateItems = []
      for (const item of confirmState.types || []) {
        const cardType = item.cardType || item
        const mahromId = item.mahromId || (cardType === 'MAHROM' ? item : null)
        const mid = cardType === 'MAHROM' ? mahromId : null
        const displayBase =
          item.displayCard ||
          displayCards.find((c) =>
            cardType === 'MAHROM'
              ? c.card_type === 'MAHROM' && Number(c.mahrom_id) === Number(mid)
              : c.card_type === cardType
          )
        const issued = await issueSingle(cardType, mid)
        if (!issued) {
          setBusyType(null)
          setConfirmState(null)
          return
        }
        const printCard = mergeIssuedIntoDisplay(displayBase, issued)
        const ok = await markPrinted(cardType, mid, issued.kartu_id)
        if (!ok) {
          setBusyType(null)
          setConfirmState(null)
          return
        }
        snapshots.push(printCard)
        validateItems.push({
          kartuId: issued.kartu_id,
          expectedToken: issued.token,
          label: displayBase?.card_label_full || displayBase?.card_label || cardType,
        })
      }
      queueValidation(validateItems)
      runPrint('all', null, snapshots)
    }

    setBusyType(null)
    setConfirmState(null)
    loadDbStatus()
  }, [confirmState, reissueAndPrint, displayCards, issueSingle, markPrinted, queueValidation, runPrint, loadDbStatus])

  useEffect(() => {
    if (!isOpen || !focusType) return
    const el = document.getElementById(`kartu-slot-${focusType}`)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [isOpen, focusType])

  const isBusy = !!busyType
  const pendingValidateCards = displayCards.filter((c) => c.pendingValidation)

  const offcanvasContent = (
    <>
      <AnimatePresence onExitComplete={() => setShowPortal(false)}>
        {isOpen && santriId && (
          <>
            <motion.div
              key="bundle-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={onClose}
              className="no-print fixed inset-0 bg-black/50 z-40"
            />
            <motion.div
              key="bundle-panel"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'tween', ease: [0.25, 0.1, 0.25, 1], duration: 0.35 }}
              className="print-offcanvas-wrapper fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 rounded-t-2xl shadow-[0_-10px_25px_-5px_rgba(0,0,0,0.1)] z-50 overflow-hidden flex flex-col"
              style={{ maxHeight: '92vh' }}
            >
              <div className="no-print flex justify-between items-start gap-3 p-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
                <div className="min-w-0">
                  <h2 className="text-xl font-semibold text-teal-600 dark:text-teal-400">Cetak Kartu</h2>
                  {santri?.nama && (
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                      {santri.nama}{santri.nis ? ` · ${santri.nis}` : ''}
                    </p>
                  )}
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Cetak → scan QR → kartu baru aktif. Kartu lama tetap dipakai sampai validasi selesai.
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    type="button"
                    onClick={handlePrintAll}
                    disabled={isBusy}
                    className="px-3 py-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium flex items-center gap-1.5"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                    </svg>
                    Print semua
                  </button>
                  <button type="button" onClick={onClose} className="p-2 text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 rounded-lg" aria-label="Tutup">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-auto p-4 min-h-0 print-card-cashless-container">
                <div className="no-print w-full max-w-lg mx-auto space-y-4">
                  <SantriCardDesignPicker
                    value={santriDesign}
                    onChange={handleSantriDesignChange}
                    className="mb-1"
                  />
                  {mahromOptions.length > 0 && (
                    <MahromCardDesignPicker
                      value={mahromDesign}
                      onChange={handleMahromDesignChange}
                      className="mb-1"
                    />
                  )}
                  {pendingValidateCards.length > 0 && (
                    <div className="rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50/60 dark:bg-amber-900/20 p-4 space-y-2">
                      <p className="text-sm text-amber-900 dark:text-amber-100">
                        <strong>{pendingValidateCards.length}</strong> kartu sudah dicetak dan menunggu validasi scan QR.
                        Bisa divalidasi dari HP meski cetak dilakukan di laptop.
                      </p>
                      <button
                        type="button"
                        onClick={() => openValidateQueue(pendingValidateCards)}
                        className="w-full py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium"
                      >
                        Validasi kartu (buka kamera)
                      </button>
                    </div>
                  )}
                  {displayCards.map((card) => {
                    const accent = CARD_SLOT_ACCENT[card.card_type] || CARD_SLOT_ACCENT.SANTRI
                    const slotKey = cardSlotKey(card)
                    const slotBusy =
                      busyType === slotKey || busyType === card.card_type || busyType === 'all' || busyType === 'confirm'
                    return (
                      <div
                        key={slotKey}
                        id={`kartu-slot-${slotKey}`}
                        className={`rounded-xl border p-4 transition-colors ${
                          card.pendingValidation
                            ? 'border-amber-300 dark:border-amber-700/60 bg-amber-50/40 dark:bg-amber-900/15'
                            : card.active && card.printed
                              ? 'border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/30 dark:bg-emerald-900/10'
                              : card.hasPending || card.active
                                ? 'border-blue-200 dark:border-blue-800/40 bg-blue-50/20 dark:bg-blue-900/10'
                                : 'border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50'
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                          <div className="min-w-0">
                            <span className={`text-sm font-semibold ${accent}`}>{card.card_label}</span>
                            {card.card_type === 'MAHROM' && card.mahrom_nama && (
                              <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
                                {card.mahrom_nama}
                                {card.mahrom_nim ? ` · NIM ${card.mahrom_nim}` : ''}
                              </p>
                            )}
                          </div>
                          <PrintStatusBadge
                            printed={card.printed}
                            active={card.active}
                            pendingValidation={card.pendingValidation}
                            hasPending={card.hasPending}
                          />
                        </div>
                      <div className="cashless-bank-card-showcase flex justify-center mb-3">
                        <SingleCardPreview
                          card={card}
                          santri={santri}
                          mahromDesign={card.card_type === 'MAHROM' ? mahromDesign : undefined}
                          santriDesign={card.card_type === 'SANTRI' ? santriDesign : undefined}
                          santriDetail={card.card_type === 'SANTRI' ? santriDetail : undefined}
                          santriFotoUrl={card.card_type === 'SANTRI' ? santriFotoUrl : undefined}
                        />
                      </div>
                      <div className="flex flex-col gap-2">
                        {card.pendingValidation && (
                          <button
                            type="button"
                            onClick={() => openValidateForCard(card)}
                            disabled={slotBusy}
                            className="w-full py-2 rounded-lg bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-sm font-medium flex items-center justify-center gap-2"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                            Validasi kartu (scan QR)
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => ensureTokenThenPrint(card)}
                          disabled={slotBusy}
                          className="w-full py-2 rounded-lg border border-teal-300 dark:border-teal-700 text-teal-700 dark:text-teal-300 hover:bg-teal-50 dark:hover:bg-teal-900/20 disabled:opacity-50 text-sm font-medium flex items-center justify-center gap-2"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                          </svg>
                          {card.pendingValidation
                            ? `Cetak ulang (${card.card_label})`
                            : card.active && card.printed
                              ? `Cetak kartu baru (${card.card_label})`
                              : `Print ${card.card_label}`}
                        </button>
                        {card.card_type === 'SANTRI' && card.kartu_id && (card.active || card.hasPending) && (
                          <KartuPinForm
                            kartuId={card.kartu_id}
                            hasPin={!!card.has_pin}
                            onSaved={() => {
                              showNotification('PIN kartu berhasil disimpan', 'success')
                              setKartuDbRows((prev) =>
                                prev.map((r) =>
                                  r.kartu_id === card.kartu_id || (r.card_type === 'SANTRI' && r.kartu_id === card.kartu_id)
                                    ? { ...r, has_pin: true }
                                    : r
                                )
                              )
                            }}
                          />
                        )}
                      </div>
                      </div>
                    )
                  })}
                </div>

                <div className="print-cards-sheet hidden print:block">
                  {(printSnapshot.length > 0
                    ? printSnapshot
                    : displayCards.filter((c) => {
                        if (!c.token) return false
                        if (!printQueue) return true
                        return printQueue.includes(cardSlotKey(c))
                      })
                  ).map((card) => (
                    <SingleCardPreview
                      key={`print-${cardSlotKey(card)}`}
                      card={card}
                      santri={santri}
                      mahromDesign={card.card_type === 'MAHROM' ? mahromDesign : undefined}
                      santriDesign={card.card_type === 'SANTRI' ? santriDesign : undefined}
                      santriDetail={card.card_type === 'SANTRI' ? santriDetail : undefined}
                      santriFotoUrl={card.card_type === 'SANTRI' ? santriFotoUrl : undefined}
                    />
                  ))}
                </div>
              </div>

              <div className="no-print px-4 pb-4 flex-shrink-0">
                <p className="text-xs text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/30 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2">
                  Cetak di laptop, validasi di HP: buka halaman Cetak Kartu di HP → tap <strong>Validasi</strong> → scan QR pada kartu fisik.
                </p>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <KartuCetakUlangModal
        isOpen={!!confirmState}
        onClose={() => !isBusy && setConfirmState(null)}
        onConfirm={handleConfirmReprint}
        loading={!!busyType}
        variant={confirmState?.mode === 'batch' ? 'batch' : 'single'}
        cardLabel={confirmState?.printedLabel || (confirmState?.cardType ? CARD_TYPE_LABELS[confirmState.cardType] : '')}
        santriNama={santri?.nama || ''}
        printedLabels={confirmState?.printedLabels || []}
      />

      <KartuQrValidateScanner
        key={validateTarget?.kartuId || 'validate'}
        isOpen={validateOpen}
        onClose={() => {
          if (!validating) {
            setValidateOpen(false)
            validateQueueRef.current = []
            setValidateTarget(null)
          }
        }}
        expectedToken={validateTarget?.expectedToken || ''}
        kartuLabel={validateTarget?.label || 'Kartu cashless'}
        onValidate={handleValidate}
        validating={validating}
      />
    </>
  )

  if (!showPortal) return null
  return createPortal(offcanvasContent, document.body)
}
