import { useEffect, useMemo, useState } from 'react'
import { useActiveHijriyahTahunAjaran } from '../../../hooks/useActiveTahunAjaran'
import { uwabaAPI } from '../../../services/api'
import { mergeTahunAjaranValuesAsc } from '../../../utils/tahunAjaranSort'

const selectClass =
  'border rounded-md px-2 py-1 h-8 min-w-0 text-xs bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 focus:ring-1 focus:ring-teal-400 focus:outline-none flex-1 min-w-[12rem] max-w-full'

function formatKurangLabel(n) {
  return new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(Math.max(0, n || 0))
}

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

  const getOptionLabel = (ta) => {
    if (ta !== selectedHijriyah) return ta
    const kurang = kurangByYear[ta]
    if (kurang == null) {
      if (!hasSantri && manageAggregate && ta === selectedHijriyah) {
        const k = Math.max(0, Number(manageAggregate.totalKurang) || 0)
        if (k <= 0) return `${ta} [Lunas]`
        return `${ta} [kurang ${formatKurangLabel(k)}]`
      }
      return ta
    }
    if (kurang <= 0) return `${ta} [Lunas]`
    return `${ta} [kurang ${formatKurangLabel(kurang)}]`
  }

  const getOptionStyle = (ta) => {
    if (ta !== selectedHijriyah) return undefined
    const kurang = kurangByYear[ta]
    if (kurang == null) {
      if (!hasSantri && manageAggregate && ta === selectedHijriyah) {
        const k = Math.max(0, Number(manageAggregate.totalKurang) || 0)
        if (k <= 0) return { color: '#16a34a' }
        return { color: '#ca8a04' }
      }
      return undefined
    }
    if (kurang <= 0) return { color: '#16a34a' }
    return { color: '#ca8a04' }
  }

  return (
    <div
      className={`flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2 bg-gray-50 dark:bg-gray-700/40 border border-gray-200 dark:border-gray-600 rounded-lg ${className}`}
    >
      <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[14rem]">
        <select
          value={selectedHijriyah}
          onChange={(e) => onHijriyahChange?.(e.target.value)}
          className={selectClass}
          aria-label="Tahun ajaran hijriyah UWABA"
        >
          <option value="">Pilih tahun hijriyah</option>
          {tahunOptions.map((t) => (
            <option key={t} value={t} style={getOptionStyle(t)}>
              {getOptionLabel(t)}
            </option>
          ))}
        </select>
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
    </div>
  )
}

export default UwabaTahunAjaranBar
