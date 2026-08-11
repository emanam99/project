import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { createPortal } from 'react-dom'
import { useNotification } from '../../../contexts/NotificationContext'
import { cashlessAPI, mahromAPI } from '../../../services/api'
import KartuQrValidateScanner from './KartuQrValidateScanner'
import { MahromCardPreview, MahromCardDesignPicker } from './MahromCardDesigns'
import { mergeMahromAddressFields, readMahromCardDesign, writeMahromCardDesign } from '../constants/mahromCardDesign'
import { CARD_TYPE_SHORT } from '../constants/cashlessKartu'
import './CetakKartuCashlessOffcanvas.css'

function santriOptionLabel(row) {
  const nama = row.santri_nama || row.nama || `Santri #${row.santri_id}`
  const nis = row.nis ? ` · ${row.nis}` : ''
  return `${nama}${nis}`
}

/**
 * Cetak kartu CM dari halaman Data Mahrom — tidak wajib punya akun cashless santri.
 * Kartu baru status pending sampai discan setelah cetak; kartu aktif lama tetap valid.
 */
export default function CetakKartuMahromOffcanvas({ isOpen, onClose, mahromId = null }) {
  const { showNotification } = useNotification()
  const [showPortal, setShowPortal] = useState(isOpen)
  const [loading, setLoading] = useState(false)
  const [mahrom, setMahrom] = useState(null)
  const [selectedSantriId, setSelectedSantriId] = useState(null)
  const [tokenCard, setTokenCard] = useState(null)
  const [activeCard, setActiveCard] = useState(null)
  const [pendingCard, setPendingCard] = useState(null)
  const [busy, setBusy] = useState(false)
  const [validateOpen, setValidateOpen] = useState(false)
  const [validating, setValidating] = useState(false)
  const [printSnapshot, setPrintSnapshot] = useState(null)
  const [mahromDesign, setMahromDesign] = useState(readMahromCardDesign)
  const validateTargetRef = useRef(null)

  const handleMahromDesignChange = useCallback((designId) => {
    setMahromDesign(designId)
    writeMahromCardDesign(designId)
  }, [])

  useEffect(() => {
    if (isOpen) setShowPortal(true)
  }, [isOpen])

  const relasiList = mahrom?.relasi_santri || []

  const loadMahrom = useCallback(async () => {
    if (!mahromId) {
      setMahrom(null)
      return
    }
    setLoading(true)
    try {
      const res = await mahromAPI.getById(mahromId)
      if (res?.success && res.data) {
        setMahrom(res.data)
        const relasi = res.data.relasi_santri || []
        setSelectedSantriId((prev) => {
          if (prev && relasi.some((r) => Number(r.santri_id) === Number(prev))) return prev
          const utama = relasi.find((r) => r.is_utama)
          return utama?.santri_id || relasi[0]?.santri_id || null
        })
      } else {
        showNotification(res?.message || 'Gagal memuat mahrom', 'error')
      }
    } catch {
      showNotification('Gagal memuat mahrom', 'error')
    } finally {
      setLoading(false)
    }
  }, [mahromId, showNotification])

  const loadKartuStatus = useCallback(async () => {
    if (!selectedSantriId || !mahromId) {
      setActiveCard(null)
      setPendingCard(null)
      return
    }
    try {
      const res = await cashlessAPI.listKartuBySantri(selectedSantriId)
      if (!res?.success || !Array.isArray(res.data)) {
        setActiveCard(null)
        setPendingCard(null)
        return
      }
      const rows = res.data.filter(
        (r) => r.card_type === 'MAHROM' && Number(r.mahrom_id) === Number(mahromId)
      )
      setActiveCard(rows.find((r) => r.validated || r.status === 'active') || null)
      setPendingCard(rows.find((r) => r.awaiting_validation || r.status === 'pending') || null)
    } catch {
      setActiveCard(null)
      setPendingCard(null)
    }
  }, [selectedSantriId, mahromId])

  useEffect(() => {
    if (!isOpen) {
      setMahrom(null)
      setSelectedSantriId(null)
      setTokenCard(null)
      setActiveCard(null)
      setPendingCard(null)
      setValidateOpen(false)
      setPrintSnapshot(null)
      validateTargetRef.current = null
      return
    }
    loadMahrom()
  }, [isOpen, loadMahrom])

  useEffect(() => {
    if (!isOpen) return
    setTokenCard(null)
    loadKartuStatus()
  }, [isOpen, selectedSantriId, mahromId, loadKartuStatus])

  useEffect(() => {
    if (isOpen) document.body.classList.add('print-offcanvas-open')
    else document.body.classList.remove('print-offcanvas-open')
    return () => document.body.classList.remove('print-offcanvas-open')
  }, [isOpen])

  useEffect(() => {
    const onAfterPrint = () => {
      setPrintSnapshot(null)
      if (validateTargetRef.current) {
        setValidateOpen(true)
      }
    }
    window.addEventListener('afterprint', onAfterPrint)
    return () => window.removeEventListener('afterprint', onAfterPrint)
  }, [])

  const selectedRelasi = relasiList.find((r) => Number(r.santri_id) === Number(selectedSantriId))
  const santri = selectedRelasi
    ? { id: selectedRelasi.santri_id, nama: selectedRelasi.santri_nama, nis: selectedRelasi.nis }
    : null

  const displayCard = useMemo(() => {
    const hubungan = selectedRelasi?.hubungan || 'Mahrom'
    let base = mergeMahromAddressFields(
      {
        card_type: 'MAHROM',
        card_label: `${CARD_TYPE_SHORT.MAHROM} · ${hubungan}`,
        mahrom_id: mahromId,
        mahrom_nim: mahrom?.nim || '',
        mahrom_nama: mahrom?.nama || '',
        mahrom_hubungan: hubungan,
        display_nama: mahrom?.nama || '',
        holder_label: hubungan,
        santri_nama: santri?.nama || null,
        santri_nis: santri?.nis ?? null,
        token: tokenCard?.token || null,
        token_prefix: tokenCard?.token_prefix || null,
      },
      mahrom
    )
    if (tokenCard) {
      base = mergeMahromAddressFields({ ...base, ...tokenCard }, tokenCard)
    }
    return base
  }, [mahrom, mahromId, selectedRelasi, santri, tokenCard])

  const openValidateFromPending = useCallback(() => {
    if (!pendingCard?.printed || !pendingCard?.kartu_id) {
      showNotification('Belum ada kartu yang menunggu validasi', 'warning')
      return
    }
    validateTargetRef.current = {
      kartuId: pendingCard.kartu_id,
      expectedToken: tokenCard?.token || '',
      label: `${CARD_TYPE_SHORT.MAHROM} · ${selectedRelasi?.hubungan || 'Mahrom'} — ${mahrom?.nama || ''}`,
    }
    setValidateOpen(true)
  }, [pendingCard, tokenCard, selectedRelasi, mahrom, showNotification])

  const runPrint = useCallback(() => {
    requestAnimationFrame(() => {
      window.setTimeout(() => window.print(), 80)
    })
  }, [])

  const issueCard = useCallback(async () => {
    if (!selectedSantriId || !mahromId) return null
    const res = await cashlessAPI.issueKartuSingle(selectedSantriId, 'MAHROM', mahromId)
    if (res?.success && res.data?.card) {
      setTokenCard(res.data.card)
      return res.data.card
    }
    showNotification(res?.message || 'Gagal menerbitkan kartu', 'error')
    return null
  }, [selectedSantriId, mahromId, showNotification])

  const handlePrint = useCallback(async () => {
    if (!selectedSantriId) {
      showNotification('Pilih santri yang ditautkan ke mahrom ini', 'warning')
      return
    }
    setBusy(true)
    try {
      const card = await issueCard()
      if (!card?.token || !card?.kartu_id) return

      const res = await cashlessAPI.markKartuPrinted(
        selectedSantriId,
        'MAHROM',
        mahromId,
        card.kartu_id
      )
      if (!res?.success) {
        showNotification(res?.message || 'Gagal menyimpan status cetak', 'error')
        return
      }

      const snapshot = {
        ...displayCard,
        token: card.token,
        token_prefix: card.token_prefix,
        kartu_id: card.kartu_id,
      }
      setPrintSnapshot(snapshot)
      setTokenCard(card)

      validateTargetRef.current = {
        kartuId: card.kartu_id,
        expectedToken: card.token,
        label: `${CARD_TYPE_SHORT.MAHROM} · ${selectedRelasi?.hubungan || 'Mahrom'} — ${mahrom?.nama || ''}`,
      }

      runPrint()
    } finally {
      setBusy(false)
    }
  }, [selectedSantriId, mahromId, issueCard, runPrint, showNotification, selectedRelasi, mahrom, displayCard])

  const handleValidate = useCallback(
    async ({ token }) => {
      const target = validateTargetRef.current
      if (!target) return
      setValidating(true)
      try {
        const res = await cashlessAPI.validateKartuPrinted(token, target.kartuId)
        if (!res?.success) {
          showNotification(res?.message || 'Validasi gagal', 'error')
          return
        }
        showNotification('Kartu berhasil divalidasi dan sekarang aktif.', 'success')
        validateTargetRef.current = null
        setValidateOpen(false)
        setTokenCard(null)
        await loadKartuStatus()
      } catch {
        showNotification('Gagal memvalidasi kartu', 'error')
      } finally {
        setValidating(false)
      }
    },
    [showNotification, loadKartuStatus]
  )

  const statusText = useMemo(() => {
    if (pendingCard?.printed && !pendingCard?.validated) {
      return 'Ada kartu baru yang sudah dicetak — menunggu scan validasi.'
    }
    if (activeCard?.validated) {
      return 'Kartu CM aktif (sudah divalidasi). Cetak ulang tidak menonaktifkan kartu ini sampai kartu baru discan.'
    }
    if (pendingCard) {
      return 'Kartu pending — cetak lalu scan QR untuk mengaktifkan.'
    }
    return 'Belum ada kartu CM aktif. Terbitkan & cetak, lalu scan QR pada kartu fisik.'
  }, [activeCard, pendingCard])

  if (!showPortal) return null

  const validateTarget = validateTargetRef.current

  return createPortal(
    <>
      <AnimatePresence onExitComplete={() => setShowPortal(false)}>
        {isOpen && mahromId && (
          <>
            <motion.div
              key="mahrom-cetak-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onClose}
              className="no-print fixed inset-0 bg-black/50 z-[200]"
            />
            <motion.div
              key="mahrom-cetak-panel"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'tween', ease: [0.25, 0.1, 0.25, 1], duration: 0.35 }}
              className="print-offcanvas-wrapper fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 rounded-t-2xl shadow-xl z-[201] flex flex-col"
              style={{ maxHeight: '92vh' }}
            >
              <div className="no-print flex justify-between items-start gap-3 p-4 border-b border-gray-200 dark:border-gray-700">
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold text-blue-700 dark:text-blue-300">Cetak Kartu Mahrom (CM)</h2>
                  {mahrom && (
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                      {mahrom.nama}{mahrom.nim ? ` · NIM ${mahrom.nim}` : ''}
                    </p>
                  )}
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Cetak → scan QR → kartu baru aktif. Kartu lama tetap dipakai sampai validasi selesai.
                  </p>
                </div>
                <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700" aria-label="Tutup">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="flex-1 overflow-auto p-4 print-card-cashless-container">
                {loading ? (
                  <div className="flex justify-center py-12">
                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
                  </div>
                ) : relasiList.length === 0 ? (
                  <p className="text-sm text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
                    Mahrom belum ditautkan ke santri. Edit mahrom dan tautkan minimal satu santri terlebih dahulu.
                  </p>
                ) : (
                  <div className="no-print max-w-lg mx-auto space-y-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                        Santri (konteks kartu CM)
                      </label>
                      <select
                        value={selectedSantriId || ''}
                        onChange={(e) => setSelectedSantriId(Number(e.target.value) || null)}
                        className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm"
                      >
                        {relasiList.map((r) => (
                          <option key={r.santri_id} value={r.santri_id}>
                            {santriOptionLabel(r)} — {r.hubungan}
                          </option>
                        ))}
                      </select>
                    </div>

                    <MahromCardDesignPicker
                      value={mahromDesign}
                      onChange={handleMahromDesignChange}
                      className="max-w-lg mx-auto"
                    />

                    <div className="rounded-xl border border-blue-200 dark:border-blue-800 p-4 flex flex-col sm:flex-row gap-4 items-center">
                      <div className="cashless-bank-card-showcase flex-shrink-0">
                        <MahromCardPreview card={displayCard} santri={santri} design={mahromDesign} />
                      </div>
                      <div className="flex-1 space-y-2 w-full">
                        <p className="text-sm text-gray-600 dark:text-gray-300">{statusText}</p>
                        {activeCard?.validated && (
                          <span className="inline-flex text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                            Aktif
                          </span>
                        )}
                        {pendingCard?.printed && !pendingCard?.validated && (
                          <span className="inline-flex text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                            Menunggu validasi
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={handlePrint}
                          disabled={busy || !selectedSantriId}
                          className="w-full px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium"
                        >
                          {busy ? 'Memproses...' : pendingCard?.printed && !pendingCard?.validated
                            ? 'Cetak ulang CM'
                            : activeCard
                              ? 'Cetak kartu baru'
                              : 'Terbitkan & cetak CM'}
                        </button>
                        {pendingCard?.printed && !pendingCard?.validated && (
                          <button
                            type="button"
                            onClick={openValidateFromPending}
                            className="w-full px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium"
                          >
                            Validasi kartu (scan QR)
                          </button>
                        )}
                        <p className="text-[11px] text-gray-500 dark:text-gray-400">
                          Cetak di laptop? Buka halaman ini di HP lalu tap Validasi untuk scan QR.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                <div className="print-cards-sheet hidden print:block mx-auto">
                  {(printSnapshot || displayCard)?.token ? (
                    <MahromCardPreview
                      card={printSnapshot || displayCard}
                      santri={santri}
                      design={mahromDesign}
                    />
                  ) : null}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <KartuQrValidateScanner
        isOpen={validateOpen}
        onClose={() => {
          if (!validating) {
            setValidateOpen(false)
          }
        }}
        expectedToken={validateTarget?.expectedToken || tokenCard?.token || ''}
        kartuLabel={validateTarget?.label || 'Kartu Mahrom (CM)'}
        onValidate={handleValidate}
        validating={validating}
      />
    </>,
    document.body
  )
}
