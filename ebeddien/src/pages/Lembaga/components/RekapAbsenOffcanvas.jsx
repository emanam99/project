import { useState, useEffect, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import * as XLSX from 'xlsx'
import { absenPengurusAPI } from '../../../services/api'
import { useOffcanvasBackClose } from '../../../hooks/useOffcanvasBackClose'

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

export default function RekapAbsenOffcanvas({ isOpen, onClose, lembagaId = '' }) {
  const handleClose = useOffcanvasBackClose(isOpen, onClose, { urlManaged: true })

  const [dari, setDari] = useState('')
  const [sampai, setSampai] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [dates, setDates] = useState([])
  const [rows, setRows] = useState([])
  const [totalSesi, setTotalSesi] = useState(0)

  useEffect(() => {
    if (!isOpen) return
    const { from, to } = defaultRange()
    setDari(from)
    setSampai(to)
    setError('')
  }, [isOpen])

  const loadRekap = useCallback(async () => {
    if (!dari || !sampai) return
    setLoading(true)
    setError('')
    try {
      const res = await absenPengurusAPI.getRekap({
        from: dari,
        to: sampai,
        lembaga_id: lembagaId || undefined
      })
      if (!res?.success) {
        setError(res?.message || 'Gagal memuat rekap')
        setRows([])
        setDates([])
        setTotalSesi(0)
        return
      }
      setDates(Array.isArray(res.dates) ? res.dates : [])
      setRows(Array.isArray(res.rows) ? res.rows : [])
      const ts =
        typeof res.total_sesi_masuk === 'number'
          ? res.total_sesi_masuk
          : typeof res.total_taps_in_period === 'number'
            ? res.total_taps_in_period
            : 0
      setTotalSesi(ts)
    } catch (e) {
      setError(e?.response?.data?.message || 'Gagal memuat rekap')
      setRows([])
      setDates([])
      setTotalSesi(0)
    } finally {
      setLoading(false)
    }
  }, [dari, sampai, lembagaId])

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

  const handleExport = useCallback(() => {
    if (!rows.length || !dates.length) return
    const headerDates = dates.map((d) => `${d} (${labelHari(d)})`)
    const header = ['Nama', 'NIP', 'Total sesi masuk', 'Lembaga', ...headerDates]
    const data = [header]
    for (const r of rows) {
      const nip = r.nip != null ? String(r.nip) : ''
      const dayVals = dates.map((dt) => {
        const c = r.days?.[dt] ?? 0
        return c > 0 ? c : ''
      })
      data.push([
        r.nama || '',
        nip,
        r.total ?? 0,
        r.lembaga_label || '',
        ...dayVals
      ])
    }
    const ws = XLSX.utils.aoa_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Rekap absen')
    const fname = `rekap-absen_${dari}_${sampai}.xlsx`
    XLSX.writeFile(wb, fname)
  }, [rows, dates, dari, sampai])

  const rangeLabel = useMemo(() => {
    if (!dari || !sampai) return '—'
    return `${dari} → ${sampai}`
  }, [dari, sampai])

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

            <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 space-y-3 shrink-0">
              <div className="flex flex-wrap items-end gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-medium text-gray-500 dark:text-gray-400">Dari</label>
                  <input
                    type="date"
                    value={dari}
                    onChange={(e) => setDari(e.target.value)}
                    className={inputDateClass}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-medium text-gray-500 dark:text-gray-400">Sampai</label>
                  <input
                    type="date"
                    value={sampai}
                    onChange={(e) => setSampai(e.target.value)}
                    className={inputDateClass}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => loadRekap()}
                  disabled={loading || !dari || !sampai}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50 transition-colors"
                >
                  {loading ? 'Memuat…' : 'Terapkan'}
                </button>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs text-gray-600 dark:text-gray-300">
                  <span className="font-medium text-gray-800 dark:text-gray-100">{rangeLabel}</span>
                  <span className="mx-2 text-gray-300 dark:text-gray-600">·</span>
                  <span>
                    Total sesi masuk:{' '}
                    <span className="font-semibold tabular-nums text-teal-600 dark:text-teal-400">{totalSesi}</span>
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleExport}
                  disabled={!rows.length || !dates.length || loading}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Ekspor XLSX
                </button>
              </div>
              {error && (
                <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
              )}
              <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-snug">
                Hanya absen <span className="font-medium">masuk</span>. Satu hari = 3 sesi (pagi 00–12, sore 12–18, malam 18–24). Banyak tap di sesi yang sama = dihitung 1.
              </p>
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
                    <table className="w-full text-xs border-collapse min-w-[720px]">
                      <thead>
                        <tr className="bg-gray-50 dark:bg-gray-700/80 border-b border-gray-200 dark:border-gray-600">
                          <th className="sticky left-0 z-[1] bg-gray-50 dark:bg-gray-700/95 px-3 py-2 text-left font-semibold text-gray-700 dark:text-gray-200 border-r border-gray-200 dark:border-gray-600 min-w-[10rem]">
                            Pengurus
                          </th>
                          {dates.map((dt) => (
                            <th
                              key={dt}
                              className="px-1 py-2 text-center font-medium text-gray-600 dark:text-gray-300 whitespace-nowrap min-w-[2.25rem]"
                              title={dt}
                            >
                              <div className="leading-tight">{labelHari(dt)}</div>
                              <div className="text-[10px] text-gray-400 dark:text-gray-500 font-normal tabular-nums">
                                {dt.slice(8)}
                              </div>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r) => (
                          <tr
                            key={r.pengurus_id}
                            className="border-b border-gray-100 dark:border-gray-700/80 hover:bg-gray-50/80 dark:hover:bg-gray-700/30"
                          >
                            <td className="sticky left-0 z-[1] bg-white dark:bg-gray-800 px-3 py-2 align-top border-r border-gray-200 dark:border-gray-600">
                              <div className="font-medium text-gray-900 dark:text-gray-100 text-xs">
                                {r.nama || '–'}
                                <span
                                  className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded-md bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300 text-[10px] font-semibold tabular-nums"
                                  title="Jumlah sesi masuk unik (pagi/sore/malam) dalam periode"
                                >
                                  {r.total ?? 0}
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
                            </td>
                            {dates.map((dt) => {
                              const c = r.days?.[dt] ?? 0
                              return (
                                <td key={dt} className="px-0.5 py-2 text-center align-middle">
                                  {c > 0 ? (
                                    <span
                                      className="inline-flex min-w-[1.25rem] justify-center rounded-md bg-teal-100 dark:bg-teal-900/35 text-teal-800 dark:text-teal-300 font-semibold tabular-nums px-1 py-0.5"
                                      title={`${c} sesi masuk terisi (maks 3: pagi, sore, malam)`}
                                    >
                                      {c}
                                    </span>
                                  ) : (
                                    <span className="text-gray-300 dark:text-gray-600 select-none">–</span>
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
