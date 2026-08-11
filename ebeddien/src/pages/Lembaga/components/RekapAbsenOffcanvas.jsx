import { useState, useEffect, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import * as XLSX from 'xlsx'
import PickDateHijri, { formatHijriDateDisplay } from '../../../components/PickDateHijri/PickDateHijri'
import { absenPengurusAPI } from '../../../services/api'
import { useOffcanvasBackClose } from '../../../hooks/useOffcanvasBackClose'
import { hijriYmdToMasehiYmd, masehiYmdToHijriYmd } from '../../../utils/hijriDate'

const HARI_SINGKAT = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab']

function pad2(n) {
  return String(n).padStart(2, '0')
}

function defaultRange() {
  const t = new Date()
  const to = `${t.getFullYear()}-${pad2(t.getMonth() + 1)}-${pad2(t.getDate())}`
  const f = new Date(t.getFullYear(), t.getMonth(), 1)
  const from = `${f.getFullYear()}-${pad2(f.getMonth() + 1)}-${pad2(f.getDate())}`
  return { from, to }
}

function labelHari(dateStr) {
  if (!dateStr) return ''
  const d = new Date(`${dateStr}T12:00:00`)
  if (Number.isNaN(d.getTime())) return ''
  return HARI_SINGKAT[d.getDay()]
}

const inputDateClass =
  'px-2.5 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-teal-500 focus:border-transparent'

const zBackdrop = 10210
const zPanel = 10211

/** Rekap: per slot pagi/sore/malam, per kalender (satu hari = 1), atau total durasi hadir (detik/hari). */
const REKAP_MODE_SESI = 'sesi'
const REKAP_MODE_HARI = 'hari'
const REKAP_MODE_JAM = 'jam'

const KAL_HIJRI = 'hijri'
const KAL_MASEHI = 'masehi'

const segBtnNeutral =
  'px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
const segBtnActive =
  'px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors bg-white dark:bg-gray-600 text-teal-700 dark:text-teal-200 shadow-sm'

function formatDurasiHMS(totalSeconds) {
  const s = Math.max(0, Math.floor(Number(totalSeconds) || 0))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return `${h} jam ${m} mnt ${sec} dtk`
}

function formatDurasiCell(totalSeconds) {
  const s = Math.max(0, Math.floor(Number(totalSeconds) || 0))
  if (s === 0) return ''
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const parts = []
  if (h > 0) parts.push(`${h}j`)
  if (m > 0 || h > 0) parts.push(`${m}m`)
  parts.push(`${sec}d`)
  return parts.join(' ')
}

/** Nominal uang: angka positif; titik/koma sebagai pemisah ribuan/desimal sederhana. */
function parseNominal(raw) {
  const t = String(raw ?? '').trim()
  if (t === '') return 0
  const normalized = t.replace(/\s/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.')
  const n = Number(normalized)
  return Number.isFinite(n) && n >= 0 ? n : 0
}

function formatRupiahPreview(n) {
  if (!Number.isFinite(n) || n === 0) return '—'
  try {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(
      Math.round(n)
    )
  } catch {
    return `Rp ${Math.round(n)}`
  }
}

/** Hari dengan absen pada tanggal dt (nilai sel > 0). */
function punyaAbsenHari(row, dt) {
  return ((row.days?.[dt] ?? 0) > 0)
}

/** Jumlah hari kalender (hari efektif) dalam kolom yang aktif saja. */
function hitungHariEfektif(row, datesArr, enabledSet) {
  let n = 0
  for (const dt of datesArr) {
    if (enabledSet.has(dt) && punyaAbsenHari(row, dt)) n += 1
  }
  return n
}

/** Total sesi/slot pada kolom aktif saja (untuk ringkasan mode per sesi). */
function hitungSesiPadaKolomAktif(row, datesArr, enabledSet) {
  let n = 0
  for (const dt of datesArr) {
    if (enabledSet.has(dt)) n += row.days?.[dt] ?? 0
  }
  return n
}

/** Total detik durasi pada kolom aktif (mode jam). */
function hitungTotalDetikKolomAktif(row, datesArr, enabledSet) {
  let n = 0
  for (const dt of datesArr) {
    if (enabledSet.has(dt)) n += row.days?.[dt] ?? 0
  }
  return n
}

function basisSimulasi(rekapMode, row, datesArr, enabledSet) {
  if (rekapMode === REKAP_MODE_HARI) {
    return hitungHariEfektif(row, datesArr, enabledSet)
  }
  if (rekapMode === REKAP_MODE_JAM) {
    return hitungTotalDetikKolomAktif(row, datesArr, enabledSet) / 3600
  }
  return hitungSesiPadaKolomAktif(row, datesArr, enabledSet)
}

export default function RekapAbsenOffcanvas({ isOpen, onClose, lembagaId = '' }) {
  const handleClose = useOffcanvasBackClose(isOpen, onClose, { urlManaged: true })

  const [dari, setDari] = useState('')
  const [sampai, setSampai] = useState('')
  const [dariHijri, setDariHijri] = useState(null)
  const [sampaiHijri, setSampaiHijri] = useState(null)
  const [nominalInput, setNominalInput] = useState('')
  const [rekapMode, setRekapMode] = useState(REKAP_MODE_SESI)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [dates, setDates] = useState([])
  const [rows, setRows] = useState([])
  /** Tanggal yang dihitung untuk hari efektif; secara default semua aktif. */
  const [enabledDates, setEnabledDates] = useState(() => new Set())
  const [dariJenisKalender, setDariJenisKalender] = useState(KAL_HIJRI)
  const [sampaiJenisKalender, setSampaiJenisKalender] = useState(KAL_HIJRI)
  /** Satu panel atas: pengaturan + ringkasan; diciutkan agar tabel leluasa. */
  const [panelAtasTerbuka, setPanelAtasTerbuka] = useState(true)

  useEffect(() => {
    if (!isOpen) return
    const { from, to } = defaultRange()
    setDari(from)
    setSampai(to)
    setDariHijri(null)
    setSampaiHijri(null)
    setNominalInput('')
    setRekapMode(REKAP_MODE_SESI)
    setError('')
    setDariJenisKalender(KAL_HIJRI)
    setSampaiJenisKalender(KAL_HIJRI)
    setPanelAtasTerbuka(true)
  }, [isOpen])

  useEffect(() => {
    if (!isOpen || !dari) return
    let cancelled = false
    masehiYmdToHijriYmd(dari, '12:00:00').then((h) => {
      if (!cancelled && h) setDariHijri(h)
    })
    return () => {
      cancelled = true
    }
  }, [isOpen, dari])

  useEffect(() => {
    if (!isOpen || !sampai) return
    let cancelled = false
    masehiYmdToHijriYmd(sampai, '12:00:00').then((h) => {
      if (!cancelled && h) setSampaiHijri(h)
    })
    return () => {
      cancelled = true
    }
  }, [isOpen, sampai])

  const loadRekap = useCallback(async () => {
    if (!dari || !sampai) return
    setLoading(true)
    setError('')
    try {
      const res = await absenPengurusAPI.getRekap({
        from: dari,
        to: sampai,
        lembaga_id: lembagaId || undefined,
        ...(rekapMode === REKAP_MODE_HARI ? { mode: 'hari' } : {}),
        ...(rekapMode === REKAP_MODE_JAM ? { mode: 'jam' } : {})
      })
      if (!res?.success) {
        setError(res?.message || 'Gagal memuat rekap')
        setRows([])
        setDates([])
        setEnabledDates(new Set())
        return
      }
      const dArr = Array.isArray(res.dates) ? res.dates : []
      setDates(dArr)
      setRows(Array.isArray(res.rows) ? res.rows : [])
      setEnabledDates(new Set(dArr))
    } catch (e) {
      setError(e?.response?.data?.message || 'Gagal memuat rekap')
      setRows([])
      setDates([])
      setEnabledDates(new Set())
    } finally {
      setLoading(false)
    }
  }, [dari, sampai, lembagaId, rekapMode])

  const onDariHijriChange = useCallback(async (ymd) => {
    setDariHijri(ymd)
    if (!ymd) return
    const m = await hijriYmdToMasehiYmd(ymd)
    if (!m) return
    setDari(m)
    setSampai((prev) => (prev && m > prev ? m : prev))
  }, [])

  const onSampaiHijriChange = useCallback(async (ymd) => {
    setSampaiHijri(ymd)
    if (!ymd) return
    const m = await hijriYmdToMasehiYmd(ymd)
    if (!m) return
    setSampai(m)
    setDari((prev) => (prev && m < prev ? m : prev))
  }, [])

  useEffect(() => {
    if (!isOpen || !dari || !sampai) return
    loadRekap()
  }, [isOpen, loadRekap])

  useEffect(() => {
    if (isOpen) document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  const toggleKolomHari = useCallback((dt) => {
    setEnabledDates((prev) => {
      const next = new Set(prev)
      if (next.has(dt)) next.delete(dt)
      else next.add(dt)
      return next
    })
  }, [])

  const ringkasanKolom = useMemo(() => {
    const total = dates.length
    let aktif = 0
    for (const dt of dates) {
      if (enabledDates.has(dt)) aktif += 1
    }
    return { aktif, total }
  }, [dates, enabledDates])

  const totalHariEfektifSemua = useMemo(
    () => rows.reduce((acc, r) => acc + hitungHariEfektif(r, dates, enabledDates), 0),
    [rows, dates, enabledDates]
  )

  const totalSesiKolomAktif = useMemo(
    () => rows.reduce((acc, r) => acc + hitungSesiPadaKolomAktif(r, dates, enabledDates), 0),
    [rows, dates, enabledDates]
  )

  const totalDetikKolomAktif = useMemo(
    () => rows.reduce((acc, r) => acc + hitungTotalDetikKolomAktif(r, dates, enabledDates), 0),
    [rows, dates, enabledDates]
  )

  const nominalParsed = useMemo(() => parseNominal(nominalInput), [nominalInput])

  const handleExport = useCallback(() => {
    if (!rows.length || !dates.length) return
    const datesEkspor = dates.filter((d) => enabledDates.has(d))
    const headerDates = datesEkspor.map((d) => `${d} (${labelHari(d)})`)
    const header = ['Nama', 'NIP', 'Hari efektif', 'Lembaga']
    if (rekapMode === REKAP_MODE_JAM) {
      header.push('Total durasi (kolom aktif)')
    }
    if (nominalParsed > 0) {
      header.push(
        rekapMode === REKAP_MODE_JAM
          ? 'Simulasi (× jam)'
          : rekapMode === REKAP_MODE_HARI
            ? 'Simulasi (× hari)'
            : 'Simulasi (× sesi)'
      )
    }
    header.push(...headerDates)
    const data = [header]
    for (const r of rows) {
      const nip = r.nip != null ? String(r.nip) : ''
      const he = hitungHariEfektif(r, dates, enabledDates)
      const rowOut = [r.nama || '', nip, he, r.lembaga_label || '']
      if (rekapMode === REKAP_MODE_JAM) {
        const td = hitungTotalDetikKolomAktif(r, dates, enabledDates)
        rowOut.push(td > 0 ? formatDurasiHMS(td) : '')
      }
      if (nominalParsed > 0) {
        const basis = basisSimulasi(rekapMode, r, dates, enabledDates)
        rowOut.push(basis > 0 ? Math.round(nominalParsed * basis) : '')
      }
      const dayVals = datesEkspor.map((dt) => {
        const c = r.days?.[dt] ?? 0
        if (c <= 0) return ''
        if (rekapMode === REKAP_MODE_JAM) return formatDurasiHMS(c)
        return c
      })
      rowOut.push(...dayVals)
      data.push(rowOut)
    }
    const ws = XLSX.utils.aoa_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Rekap absen')
    const modeSlug = rekapMode === REKAP_MODE_HARI ? 'hari' : rekapMode === REKAP_MODE_JAM ? 'jam' : 'sesi'
    const fname = `rekap-absen_${modeSlug}_${dari}_${sampai}.xlsx`
    XLSX.writeFile(wb, fname)
  }, [rows, dates, dari, sampai, enabledDates, rekapMode, nominalParsed])

  const rangeLabel = useMemo(() => {
    if (!dari || !sampai) return '—'
    const h1 = dariHijri ? formatHijriDateDisplay(dariHijri) : ''
    const h2 = sampaiHijri ? formatHijriDateDisplay(sampaiHijri) : ''
    const labelDari = dariJenisKalender === KAL_HIJRI && h1 ? `${h1} (Hijriyah)` : `Masehi ${dari}`
    const labelSampai = sampaiJenisKalender === KAL_HIJRI && h2 ? `${h2} (Hijriyah)` : `Masehi ${sampai}`
    return `${labelDari} → ${labelSampai} · Masehi ${dari}–${sampai}`
  }, [dari, sampai, dariHijri, sampaiHijri, dariJenisKalender, sampaiJenisKalender])

  if (typeof document === 'undefined') return null

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            key="rekap-absen-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/50"
            style={{ zIndex: zBackdrop }}
            onClick={handleClose}
            aria-hidden
          />
          <motion.div
            key="rekap-absen-panel"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'tween', duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
            className="fixed top-0 right-0 bottom-0 w-full max-w-2xl bg-gray-50 dark:bg-gray-900 shadow-2xl flex flex-col rounded-l-2xl overflow-hidden border-l border-gray-200 dark:border-gray-700"
            style={{ zIndex: zPanel }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="rekap-absen-title"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shrink-0">
              <h2 id="rekap-absen-title" className="text-lg font-semibold text-gray-900 dark:text-white truncate pr-2">
                Rekap absen pengurus
              </h2>
              <button
                type="button"
                onClick={handleClose}
                className="p-2 rounded-xl text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-gray-400 transition-colors"
                aria-label="Tutup"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="shrink-0 border-b border-gray-200 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-900/50">
              <button
                type="button"
                onClick={() => setPanelAtasTerbuka((v) => !v)}
                className="w-full flex items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-gray-100/90 dark:hover:bg-gray-800/55 transition-colors"
                aria-expanded={panelAtasTerbuka}
                aria-controls="rekap-absen-panel-atas"
                id="rekap-absen-panel-atas-toggle"
              >
                <div className="min-w-0 flex-1">
                  <span className="text-xs font-semibold text-gray-800 dark:text-gray-100">
                    Pengaturan rekap
                  </span>
                  {!panelAtasTerbuka && dari && sampai ? (
                    <span className="text-[10px] text-gray-500 dark:text-gray-400 truncate block mt-0.5">
                      {rangeLabel}
                    </span>
                  ) : (
                    <span className="text-[10px] text-gray-500 dark:text-gray-400 block mt-0.5">
                      Tap panah untuk membuka atau menutup panel ini.
                    </span>
                  )}
                </div>
                <motion.span
                  className="shrink-0 inline-flex rounded-lg p-1 text-gray-600 dark:text-gray-300"
                  animate={{ rotate: panelAtasTerbuka ? 180 : 0 }}
                  transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
                  aria-hidden
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </motion.span>
              </button>
              <motion.div
                id="rekap-absen-panel-atas"
                role="region"
                aria-labelledby="rekap-absen-panel-atas-toggle"
                initial={false}
                animate={{
                  height: panelAtasTerbuka ? 'auto' : 0,
                  opacity: panelAtasTerbuka ? 1 : 0
                }}
                transition={{
                  height: { duration: 0.34, ease: [0.25, 0.46, 0.45, 0.94] },
                  opacity: { duration: 0.24, ease: 'easeOut' }
                }}
                className={`overflow-hidden border-t border-gray-200 dark:border-gray-700 ${
                  !panelAtasTerbuka ? 'pointer-events-none' : ''
                }`}
              >
                <div className="px-3 py-3 space-y-3 max-h-[min(52vh,420px)] overflow-y-auto bg-white/50 dark:bg-gray-900/30">
                  <div className="space-y-1.5">
                    <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400">
                      Cara hitung rekap
                    </span>
                    <div
                      className="inline-flex flex-wrap rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-100/80 dark:bg-gray-700/50 p-0.5 gap-0.5 max-w-full"
                      role="radiogroup"
                      aria-label="Cara hitung rekap"
                    >
                      <button
                        type="button"
                        role="radio"
                        aria-checked={rekapMode === REKAP_MODE_SESI}
                        onClick={() => setRekapMode(REKAP_MODE_SESI)}
                        className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                          rekapMode === REKAP_MODE_SESI
                            ? 'bg-white dark:bg-gray-600 text-teal-700 dark:text-teal-200 shadow-sm'
                            : 'text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
                        }`}
                      >
                        Per sesi
                      </button>
                      <button
                        type="button"
                        role="radio"
                        aria-checked={rekapMode === REKAP_MODE_HARI}
                        onClick={() => setRekapMode(REKAP_MODE_HARI)}
                        className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                          rekapMode === REKAP_MODE_HARI
                            ? 'bg-white dark:bg-gray-600 text-teal-700 dark:text-teal-200 shadow-sm'
                            : 'text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
                        }`}
                      >
                        Per hari
                      </button>
                      <button
                        type="button"
                        role="radio"
                        aria-checked={rekapMode === REKAP_MODE_JAM}
                        onClick={() => setRekapMode(REKAP_MODE_JAM)}
                        className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                          rekapMode === REKAP_MODE_JAM
                            ? 'bg-white dark:bg-gray-600 text-teal-700 dark:text-teal-200 shadow-sm'
                            : 'text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
                        }`}
                      >
                        Per jam
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400">
                      Rentang tanggal & simulasi
                    </span>
                    <div className="flex flex-wrap items-end gap-3">
                  <div className="flex flex-col gap-1.5 min-w-[11rem] max-w-full flex-1 sm:flex-initial">
                    <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400">Dari</span>
                    <div
                      className="inline-flex rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-100/80 dark:bg-gray-700/50 p-0.5 gap-0.5"
                      role="radiogroup"
                      aria-label="Kalender tanggal mulai"
                    >
                      <button
                        type="button"
                        role="radio"
                        aria-checked={dariJenisKalender === KAL_HIJRI}
                        onClick={() => setDariJenisKalender(KAL_HIJRI)}
                        className={dariJenisKalender === KAL_HIJRI ? segBtnActive : segBtnNeutral}
                      >
                        Hijriyah
                      </button>
                      <button
                        type="button"
                        role="radio"
                        aria-checked={dariJenisKalender === KAL_MASEHI}
                        onClick={() => setDariJenisKalender(KAL_MASEHI)}
                        className={dariJenisKalender === KAL_MASEHI ? segBtnActive : segBtnNeutral}
                      >
                        Masehi
                      </button>
                    </div>
                    {dariJenisKalender === KAL_HIJRI ? (
                      <>
                        <PickDateHijri
                          value={dariHijri}
                          onChange={(ymd) => {
                            void onDariHijriChange(ymd)
                          }}
                          max={sampaiHijri || undefined}
                          showTodayButton
                          placeholder="Pilih tanggal"
                          inputClassName="!min-h-[36px] !py-1.5 !text-xs rounded-lg"
                        />
                        {dari ? (
                          <span className="text-[10px] text-gray-500 dark:text-gray-400 tabular-nums">
                            Setara Masehi {dari}
                          </span>
                        ) : null}
                      </>
                    ) : (
                      <>
                        <input
                          type="date"
                          value={dari}
                          max={sampai || undefined}
                          onChange={(e) => {
                            const v = e.target.value
                            if (!v) return
                            setDari(v)
                            if (sampai && v > sampai) setSampai(v)
                          }}
                          className={inputDateClass}
                        />
                        {dariHijri ? (
                          <span className="text-[10px] text-gray-500 dark:text-gray-400 tabular-nums">
                            ≈ Hijriyah {formatHijriDateDisplay(dariHijri)}
                          </span>
                        ) : null}
                      </>
                    )}
                  </div>
                  <div className="flex flex-col gap-1.5 min-w-[11rem] max-w-full flex-1 sm:flex-initial">
                    <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400">Sampai</span>
                    <div
                      className="inline-flex rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-100/80 dark:bg-gray-700/50 p-0.5 gap-0.5"
                      role="radiogroup"
                      aria-label="Kalender tanggal akhir"
                    >
                      <button
                        type="button"
                        role="radio"
                        aria-checked={sampaiJenisKalender === KAL_HIJRI}
                        onClick={() => setSampaiJenisKalender(KAL_HIJRI)}
                        className={sampaiJenisKalender === KAL_HIJRI ? segBtnActive : segBtnNeutral}
                      >
                        Hijriyah
                      </button>
                      <button
                        type="button"
                        role="radio"
                        aria-checked={sampaiJenisKalender === KAL_MASEHI}
                        onClick={() => setSampaiJenisKalender(KAL_MASEHI)}
                        className={sampaiJenisKalender === KAL_MASEHI ? segBtnActive : segBtnNeutral}
                      >
                        Masehi
                      </button>
                    </div>
                    {sampaiJenisKalender === KAL_HIJRI ? (
                      <>
                        <PickDateHijri
                          value={sampaiHijri}
                          onChange={(ymd) => {
                            void onSampaiHijriChange(ymd)
                          }}
                          min={dariHijri || undefined}
                          showTodayButton
                          placeholder="Pilih tanggal"
                          inputClassName="!min-h-[36px] !py-1.5 !text-xs rounded-lg"
                        />
                        {sampai ? (
                          <span className="text-[10px] text-gray-500 dark:text-gray-400 tabular-nums">
                            Setara Masehi {sampai}
                          </span>
                        ) : null}
                      </>
                    ) : (
                      <>
                        <input
                          type="date"
                          value={sampai}
                          min={dari || undefined}
                          onChange={(e) => {
                            const v = e.target.value
                            if (!v) return
                            setSampai(v)
                            if (dari && v < dari) setDari(v)
                          }}
                          className={inputDateClass}
                        />
                        {sampaiHijri ? (
                          <span className="text-[10px] text-gray-500 dark:text-gray-400 tabular-nums">
                            ≈ Hijriyah {formatHijriDateDisplay(sampaiHijri)}
                          </span>
                        ) : null}
                      </>
                    )}
                  </div>
                  <div className="flex flex-col gap-1 min-w-[8rem] max-w-full flex-1 sm:flex-initial">
                    <label className="text-[11px] font-medium text-gray-500 dark:text-gray-400">Nominal simulasi</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={nominalInput}
                      onChange={(e) => setNominalInput(e.target.value)}
                      placeholder="contoh 50000"
                      className={inputDateClass}
                      autoComplete="off"
                    />
                    <span className="text-[10px] text-gray-500 dark:text-gray-400 leading-snug">
                      Per sesi/hari: × jumlah. Per jam: × jam hadir (desimal).
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => loadRekap()}
                    disabled={loading || !dari || !sampai}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50 transition-colors shrink-0"
                  >
                    {loading ? 'Memuat…' : 'Terapkan'}
                  </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400">
                      Ringkasan & ekspor
                    </span>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs text-gray-600 dark:text-gray-300 min-w-0">
                    <span className="font-medium text-gray-800 dark:text-gray-100 block sm:inline break-words">
                      {rangeLabel}
                    </span>
                    <span className="hidden sm:inline mx-2 text-gray-300 dark:text-gray-600">·</span>
                    <span className="flex flex-wrap items-center gap-x-1 gap-y-0.5 mt-1 sm:mt-0 sm:inline-flex">
                      <span>
                        Σ hari efektif:{' '}
                        <span className="font-semibold tabular-nums text-teal-600 dark:text-teal-400">
                          {totalHariEfektifSemua}
                        </span>
                      </span>
                      {rekapMode === REKAP_MODE_SESI && (
                        <span className="text-gray-500 dark:text-gray-400">
                          · Sesi (kolom aktif):{' '}
                          <span className="font-semibold tabular-nums text-gray-700 dark:text-gray-200">
                            {totalSesiKolomAktif}
                          </span>
                        </span>
                      )}
                      {rekapMode === REKAP_MODE_JAM && (
                        <span className="text-gray-500 dark:text-gray-400">
                          · Σ durasi (kolom aktif):{' '}
                          <span className="font-semibold tabular-nums text-gray-800 dark:text-gray-100">
                            {formatDurasiHMS(totalDetikKolomAktif)}
                          </span>
                        </span>
                      )}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleExport}
                    disabled={!rows.length || !dates.length || loading}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50 transition-colors shrink-0"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Ekspor XLSX
                  </button>
                    </div>
                    {error ? <p className="text-xs text-red-600 dark:text-red-400">{error}</p> : null}
                  </div>

                  <div className="space-y-1.5 pt-1 border-t border-gray-200/80 dark:border-gray-700/80">
                    <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400">
                      Keterangan perhitungan
                    </span>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-snug">
                      Hanya absen <span className="font-medium">masuk</span> dihitung untuk sesi/hari; per jam memakai pasangan{' '}
                      <span className="font-medium">masuk–keluar</span> (urut waktu) seperti di riwayat — tanpa keluar = 1 jam default.
                      {rekapMode === REKAP_MODE_HARI ? (
                        <> Per hari: ada absen masuk di tanggal itu (berapa sesi pun) = <span className="font-medium">1</span>.</>
                      ) : rekapMode === REKAP_MODE_JAM ? (
                        <>
                          {' '}
                          Per jam: tiap sel = durasi di tanggal itu; Σ durasi = jam, menit, detik (kolom aktif).
                        </>
                      ) : (
                        <>
                          {' '}
                          Per sesi: satu hari sampai 3 slot (pagi 00–12, sore 12–18, malam 18–24). Banyak tap di slot yang sama = dihitung 1.
                        </>
                      )}{' '}
                      Kolom tanggal terang = dihitung; klik header kolom untuk menonaktifkan.
                      Hari efektif per pengurus = jumlah hari dengan nilai &gt; 0 pada kolom aktif (
                      <span className="tabular-nums font-medium">{ringkasanKolom.aktif}</span> dari{' '}
                      <span className="tabular-nums font-medium">{ringkasanKolom.total}</span> hari).
                    </p>
                  </div>
                </div>
              </motion.div>
            </div>

            <div className="flex-1 min-h-0 overflow-auto p-4">
              {loading && rows.length === 0 ? (
                <div className="flex justify-center py-16">
                  <div className="animate-spin rounded-full h-10 w-10 border-2 border-teal-500 border-t-transparent" />
                </div>
              ) : rows.length === 0 ? (
                <p className="text-sm text-center text-gray-500 dark:text-gray-400 py-12">
                  Tidak ada data pada rentang ini.
                </p>
              ) : (
                <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm overflow-hidden">
                  <div className="overflow-x-auto">
                    <table
                      className={`w-full text-xs border-collapse ${rekapMode === REKAP_MODE_JAM ? 'min-w-[880px]' : 'min-w-[720px]'}`}
                    >
                      <thead>
                        <tr className="bg-gray-50 dark:bg-gray-700/80 border-b border-gray-200 dark:border-gray-600">
                          <th className="sticky left-0 z-[1] bg-gray-50 dark:bg-gray-700/95 px-3 py-2 text-left font-semibold text-gray-700 dark:text-gray-200 border-r border-gray-200 dark:border-gray-600 min-w-[10rem]">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span>Pengurus</span>
                              <span
                                className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300 text-[10px] font-semibold tabular-nums"
                                title="Kolom tanggal aktif (dihitung untuk hari efektif) dibanding total hari rentang"
                              >
                                {ringkasanKolom.aktif}/{ringkasanKolom.total}
                              </span>
                            </div>
                          </th>
                          {dates.map((dt) => {
                            const aktif = enabledDates.has(dt)
                            return (
                              <th
                                key={dt}
                                className={`p-0.5 align-bottom ${rekapMode === REKAP_MODE_JAM ? 'min-w-[3.25rem]' : 'min-w-[2.25rem]'}`}
                              >
                                <button
                                  type="button"
                                  onClick={() => toggleKolomHari(dt)}
                                  title={
                                    aktif
                                      ? `${dt} — aktif (klik untuk menonaktifkan)`
                                      : `${dt} — tidak dihitung (klik untuk mengaktifkan)`
                                  }
                                  aria-pressed={aktif}
                                  className={`w-full rounded-lg px-1 py-2 text-center font-medium whitespace-nowrap transition-colors border ${
                                    aktif
                                      ? 'bg-teal-100 dark:bg-teal-900/45 text-teal-900 dark:text-teal-100 border-teal-200/90 dark:border-teal-700/80 shadow-sm'
                                      : 'bg-gray-200/70 dark:bg-gray-800/90 text-gray-500 dark:text-gray-500 border-transparent opacity-75 hover:opacity-100'
                                  }`}
                                >
                                  <div className="leading-tight">{labelHari(dt)}</div>
                                  <div
                                    className={`text-[10px] font-normal tabular-nums ${
                                      aktif
                                        ? 'text-teal-700/90 dark:text-teal-200/90'
                                        : 'text-gray-400 dark:text-gray-600'
                                    }`}
                                  >
                                    {dt.slice(8)}
                                  </div>
                                </button>
                              </th>
                            )
                          })}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r) => (
                          <tr
                            key={r.pengurus_id}
                            className="border-b border-gray-100 dark:border-gray-700/80 hover:bg-gray-50/80 dark:hover:bg-gray-700/30"
                          >
                            <td className="sticky left-0 z-[1] bg-white dark:bg-gray-800 px-3 py-2 align-top border-r border-gray-200 dark:border-gray-600 max-w-[14rem]">
                              <div className="font-medium text-gray-900 dark:text-gray-100 text-xs">
                                {r.nama || '–'}
                                <span
                                  className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded-md bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300 text-[10px] font-semibold tabular-nums"
                                  title="Hari efektif: jumlah hari dengan nilai &gt; 0 pada kolom tanggal yang aktif"
                                >
                                  {hitungHariEfektif(r, dates, enabledDates)}
                                </span>
                              </div>
                              {r.nip != null && r.nip !== '' && (
                                <div className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">NIP {r.nip}</div>
                              )}
                              {r.lembaga_label && (
                                <div className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">
                                  {r.lembaga_label}
                                </div>
                              )}
                              {rekapMode === REKAP_MODE_JAM && (
                                <div className="text-[10px] text-gray-600 dark:text-gray-400 mt-1 leading-snug">
                                  <span className="font-medium text-gray-700 dark:text-gray-200">Σ durasi:</span>{' '}
                                  {formatDurasiHMS(hitungTotalDetikKolomAktif(r, dates, enabledDates))}
                                </div>
                              )}
                              {nominalParsed > 0 && (
                                <div className="text-[10px] text-teal-700 dark:text-teal-300 mt-0.5 leading-snug">
                                  Simulasi:{' '}
                                  {formatRupiahPreview(
                                    nominalParsed * basisSimulasi(rekapMode, r, dates, enabledDates)
                                  )}
                                </div>
                              )}
                            </td>
                            {dates.map((dt) => {
                              const kolomAktif = enabledDates.has(dt)
                              const c = r.days?.[dt] ?? 0
                              const isJam = rekapMode === REKAP_MODE_JAM
                              return (
                                <td
                                  key={dt}
                                  className={`px-0.5 py-2 text-center align-middle transition-opacity ${
                                    kolomAktif ? '' : 'opacity-45'
                                  } ${isJam ? 'max-w-[4rem]' : ''}`}
                                >
                                  {c > 0 ? (
                                    <span
                                      className={`inline-flex min-w-[1.25rem] justify-center rounded-md font-semibold tabular-nums px-1 py-0.5 leading-tight text-[10px] sm:text-[11px] ${
                                        kolomAktif
                                          ? 'bg-teal-100 dark:bg-teal-900/35 text-teal-800 dark:text-teal-300'
                                          : 'bg-gray-200/80 dark:bg-gray-700/50 text-gray-600 dark:text-gray-400'
                                      }`}
                                      title={
                                        isJam
                                          ? formatDurasiHMS(c)
                                          : rekapMode === REKAP_MODE_HARI
                                            ? 'Hadir pada tanggal ini'
                                            : `${c} sesi masuk terisi (maks 3: pagi, sore, malam)`
                                      }
                                    >
                                      {isJam ? formatDurasiCell(c) : c}
                                    </span>
                                  ) : (
                                    <span
                                      className={`select-none ${kolomAktif ? 'text-gray-300 dark:text-gray-600' : 'text-gray-300/70 dark:text-gray-600/60'}`}
                                    >
                                      –
                                    </span>
                                  )}
                                </td>
                              )
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  )
}
