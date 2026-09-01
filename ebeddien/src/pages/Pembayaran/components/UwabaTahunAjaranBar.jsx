import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useActiveHijriyahTahunAjaran } from '../../../hooks/useActiveTahunAjaran'
import { uwabaAPI } from '../../../services/api'
import { mergeTahunAjaranValuesAsc } from '../../../utils/tahunAjaranSort'

const offcanvasTransition = { type: 'tween', duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }

function formatRp(n) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(
    Math.max(0, n || 0)
  )
}

function buildKurangMap(summaryByTahun) {
  const map = {}
  for (const row of summaryByTahun || []) {
    const ta = String(row.tahun_ajaran ?? '').trim()
    if (!ta) continue
    map[ta] = Math.max(0, parseInt(row.kurang, 10) || 0)
  }
  return map
}

function GreenCheck() {
  return (
    <svg className="w-5 h-5 text-green-600 dark:text-green-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
    </svg>
  )
}

function UwabaTahunAjaranBar({
  santriId,
  selectedHijriyah = '',
  onHijriyahChange,
  hijriyahOptions = [],
  refreshKey = 0,
  className = '',
  manageAggregate = null,
}) {
  const activeTahunAjaran = useActiveHijriyahTahunAjaran()
  const [summaryByTahun, setSummaryByTahun] = useState([])
  const [loadingSummary, setLoadingSummary] = useState(false)
  const [open, setOpen] = useState(false)
  const hasSantri = santriId && /^\d{7}$/.test(String(santriId))

  useEffect(() => {
    if (!hasSantri) {
      setSummaryByTahun([])
      return
    }
    let cancelled = false
    setLoadingSummary(true)
    uwabaAPI
      .getAllRowsForSantri(santriId)
      .then((res) => {
        if (cancelled) return
        setSummaryByTahun(Array.isArray(res?.summary_by_tahun) ? res.summary_by_tahun : [])
      })
      .catch(() => {
        if (!cancelled) setSummaryByTahun([])
      })
      .finally(() => {
        if (!cancelled) setLoadingSummary(false)
      })
    return () => {
      cancelled = true
    }
  }, [hasSantri, santriId, refreshKey])

  const kurangByYear = useMemo(() => {
    if (!hasSantri && manageAggregate?.kurangByYear) {
      return manageAggregate.kurangByYear
    }
    return buildKurangMap(summaryByTahun)
  }, [hasSantri, manageAggregate, summaryByTahun])

  const summaryMap = useMemo(() => {
    const map = {}
    for (const row of summaryByTahun || []) {
      const ta = String(row.tahun_ajaran ?? '').trim()
      if (!ta) continue
      map[ta] = row
    }
    return map
  }, [summaryByTahun])

  const tahunOptions = useMemo(() => {
    const fromSummary = summaryByTahun.map((s) => String(s.tahun_ajaran ?? '').trim()).filter(Boolean)
    return mergeTahunAjaranValuesAsc([hijriyahOptions, fromSummary], selectedHijriyah)
  }, [hijriyahOptions, summaryByTahun, selectedHijriyah])

  const totalKurangAll = useMemo(() => {
    if (!hasSantri && manageAggregate) {
      return Math.max(0, Number(manageAggregate.totalKurang) || 0)
    }
    return Object.values(kurangByYear).reduce((sum, v) => sum + v, 0)
  }, [hasSantri, manageAggregate, kurangByYear])

  const debtIndicator = useMemo(() => {
    if (totalKurangAll <= 0) return { kind: 'lunas', bullet: null }

    const yearsWithKurang = Object.entries(kurangByYear)
      .filter(([, v]) => v > 0)
      .map(([ta]) => ta)
    const otherYearsWithKurang = yearsWithKurang.filter((ta) => ta !== activeTahunAjaran)
    const activeHasKurang = (kurangByYear[activeTahunAjaran] || 0) > 0

    if (otherYearsWithKurang.length > 0) {
      return { kind: 'multi', bullet: 'red' }
    }
    if (activeHasKurang) {
      return { kind: 'active-only', bullet: 'green' }
    }
    return { kind: 'other-only', bullet: 'red' }
  }, [kurangByYear, totalKurangAll, activeTahunAjaran])

  const getKurang = (ta) => {
    if (kurangByYear[ta] != null) return kurangByYear[ta]
    if (!hasSantri && manageAggregate && ta === selectedHijriyah) {
      return Math.max(0, Number(manageAggregate.totalKurang) || 0)
    }
    return null
  }

  const selectedKurang = selectedHijriyah ? getKurang(selectedHijriyah) : null
  const triggerLabel = selectedHijriyah
    ? selectedKurang == null
      ? selectedHijriyah
      : selectedKurang <= 0
        ? `${selectedHijriyah} · Lunas`
        : `${selectedHijriyah} · kurang ${formatRp(selectedKurang)}`
    : 'Pilih tahun hijriyah'

  const pickYear = (ta) => {
    onHijriyahChange?.(ta)
    setOpen(false)
  }

  return (
    <div
      className={`flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2 bg-gray-50 dark:bg-gray-700/40 border border-gray-200 dark:border-gray-600 rounded-lg ${className}`}
    >
      <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[14rem]">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="border rounded-md px-2 py-1 h-8 text-xs text-left bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 hover:border-teal-400 focus:ring-1 focus:ring-teal-400 focus:outline-none flex-1 min-w-[12rem] max-w-full flex items-center justify-between gap-2"
          aria-label="Tahun ajaran hijriyah UWABA"
          aria-expanded={open}
        >
          <span className="truncate">{triggerLabel}</span>
          <svg className="w-3.5 h-3.5 shrink-0 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      <div className="flex items-center gap-2 text-xs shrink-0">
        {debtIndicator.bullet === 'green' ? (
          <span
            className="inline-block w-2.5 h-2.5 rounded-full bg-green-500 shrink-0"
            title="Hanya tahun ajaran aktif yang masih kurang"
            aria-hidden
          />
        ) : null}
        {debtIndicator.bullet === 'red' ? (
          <span
            className="inline-block w-2.5 h-2.5 rounded-full bg-red-500 shrink-0"
            title="Ada tahun ajaran lain yang masih kurang"
            aria-hidden
          />
        ) : null}
        {totalKurangAll <= 0 ? (
          <span className="text-green-700 dark:text-green-400 font-medium whitespace-nowrap">Semua lunas</span>
        ) : (
          <span className="text-amber-800 dark:text-amber-300 whitespace-nowrap">
            Total kurang: <span className="font-semibold">{formatRp(totalKurangAll)}</span>
          </span>
        )}
        {loadingSummary ? (
          <span className="text-gray-400 dark:text-gray-500 text-[10px]">…</span>
        ) : null}
      </div>

      <AnimatePresence>
        {open ? (
          <motion.div
            key="uwaba-ta-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => setOpen(false)}
            className="fixed inset-0 bg-black bg-opacity-40 z-[60]"
          />
        ) : null}
        {open ? (
          <motion.div
            key="uwaba-ta-panel"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={offcanvasTransition}
            className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-white dark:bg-gray-800 shadow-xl z-[60] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
              <div className="flex justify-between items-start gap-2">
                <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100 pr-2">
                  Tahun ajaran
                </h2>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-2xl leading-none shrink-0"
                  aria-label="Tutup"
                >
                  ×
                </button>
              </div>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Setiap tahun menampilkan kurang wajib − bayar tahun itu.
              </p>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {tahunOptions.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">Tidak ada tahun ajaran.</p>
              ) : (
                tahunOptions.map((ta) => {
                  const selected = ta === selectedHijriyah
                  const kurang = getKurang(ta)
                  const row = summaryMap[ta]
                  const wajib = row ? Math.max(0, parseInt(row.total_wajib, 10) || 0) : null
                  const bayar = row ? Math.max(0, parseInt(row.total_bayar, 10) || 0) : null
                  const status =
                    kurang == null
                      ? 'Belum ada data'
                      : kurang <= 0
                        ? 'Lunas'
                        : `Kurang ${formatRp(kurang)}`
                  const statusClass =
                    kurang == null
                      ? 'text-gray-500 dark:text-gray-400'
                      : kurang <= 0
                        ? 'text-green-700 dark:text-green-400'
                        : 'text-amber-700 dark:text-amber-300'

                  return (
                    <label
                      key={ta}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border cursor-pointer ${
                        selected
                          ? 'border-green-500 bg-green-50 dark:bg-green-900/20 dark:border-green-600'
                          : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
                      }`}
                    >
                      <input
                        type="radio"
                        name="uwaba-tahun-ajaran"
                        value={ta}
                        checked={selected}
                        onChange={() => pickYear(ta)}
                        className="w-4 h-4 accent-green-600 shrink-0"
                      />
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-semibold text-gray-900 dark:text-gray-100">{ta}</span>
                        {wajib != null ? (
                          <span className="block text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                            Wajib {formatRp(wajib)} · Bayar {formatRp(bayar || 0)}
                          </span>
                        ) : null}
                        <span className={`block text-xs font-medium mt-0.5 ${statusClass}`}>{status}</span>
                      </span>
                      {selected ? <GreenCheck /> : <span className="w-5 h-5 shrink-0" />}
                    </label>
                  )
                })
              )}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}

export default UwabaTahunAjaranBar
