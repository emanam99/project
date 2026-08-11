import { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { kalenderGet } from '../../api/kalenderApi'
import { useKalenderYear } from '../../pages/Kalender/hooks/useKalenderYear'
import { getBulanName } from '../../pages/Kalender/utils/bulanHijri'
import { buildHijriMonthGrid, compareHijriYmd } from './buildMonthGrid'
import { INDONESIAN_MONTHS } from '../../pages/Kalender/utils/dateRange'
import MaterialIcon from '../MaterialIcon'

const WEEKDAYS_SHORT = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab']

export function formatHijriDateDisplay(ymd: string | null | undefined, bulanType: 'hijriyah' | 'hijriyah_ar' = 'hijriyah') {
  if (!ymd || typeof ymd !== 'string') return ''
  const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return ymd
  const y = Number(m[1])
  const month = Number(m[2])
  const d = Number(m[3])
  return `${d} ${getBulanName(month, bulanType)} ${y} H`
}

export function formatMasehiDateDisplay(ymd: string | null | undefined) {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return ''
  const [y, m, d] = ymd.split('-').map(Number)
  return `${d} ${INDONESIAN_MONTHS[m - 1]} ${y}`
}

type Props = {
  value: string | null
  onChange: (ymd: string | null) => void
  min?: string
  max?: string
  placeholder?: string
  disabled?: boolean
  className?: string
  id?: string
  showTodayButton?: boolean
}

export default function PickDateHijri({
  value,
  onChange,
  min,
  max,
  placeholder = 'Pilih tanggal Hijriyah',
  disabled = false,
  className = '',
  id,
  showTodayButton = true,
}: Props) {
  const [open, setOpen] = useState(false)
  const [viewYear, setViewYear] = useState(1446)
  const [viewMonth, setViewMonth] = useState(1)
  const [loadingToday, setLoadingToday] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const popRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  const { yearData, loading, error, refetch } = useKalenderYear(viewYear)

  const yearRange = useMemo(() => {
    let lo = 1435
    let hi = 1460
    if (min && min.length >= 4) {
      const y = parseInt(min.slice(0, 4), 10)
      if (!Number.isNaN(y)) lo = Math.max(lo, y)
    }
    if (max && max.length >= 4) {
      const y = parseInt(max.slice(0, 4), 10)
      if (!Number.isNaN(y)) hi = Math.min(hi, y)
    }
    const years: number[] = []
    for (let y = lo; y <= hi; y++) years.push(y)
    return { lo, hi, years }
  }, [min, max])

  const monthData = useMemo(() => {
    if (!yearData?.length) return null
    return (
      yearData.find((item) => String(item.id_bulan) === String(viewMonth) || Number(item.id_bulan) === viewMonth) ||
      null
    )
  }, [yearData, viewMonth])

  const { emptyCount, days } = useMemo(() => buildHijriMonthGrid(monthData), [monthData])

  const isDayDisabled = useCallback(
    (ymd: string) => {
      if (min && compareHijriYmd(ymd, min) < 0) return true
      if (max && compareHijriYmd(ymd, max) > 0) return true
      return false
    },
    [min, max]
  )

  useEffect(() => {
    setViewYear((y) => Math.min(Math.max(y, yearRange.lo), yearRange.hi))
  }, [yearRange.lo, yearRange.hi])

  useEffect(() => {
    if (!open) return
    if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const vy = parseInt(value.slice(0, 4), 10)
      const vm = parseInt(value.slice(5, 7), 10)
      if (!Number.isNaN(vy) && vy >= yearRange.lo && vy <= yearRange.hi) setViewYear(vy)
      if (!Number.isNaN(vm) && vm >= 1 && vm <= 12) setViewMonth(vm)
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const now = new Date()
        const res = (await kalenderGet({
          action: 'today',
          tanggal: now.toISOString().slice(0, 10),
          waktu: now.toTimeString().slice(0, 8),
        })) as { hijriyah?: string }
        const h = res?.hijriyah
        if (cancelled || !h || !/^\d{4}-\d{2}-\d{2}/.test(h) || h === '0000-00-00') return
        const vy = parseInt(h.slice(0, 4), 10)
        const vm = parseInt(h.slice(5, 7), 10)
        if (!Number.isNaN(vy)) setViewYear(Math.min(Math.max(vy, yearRange.lo), yearRange.hi))
        if (!Number.isNaN(vm) && vm >= 1 && vm <= 12) setViewMonth(vm)
      } catch {
        /* ignore */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, value, yearRange.lo, yearRange.hi])

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node
      if (wrapRef.current?.contains(t)) return
      if (popRef.current?.contains(t)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    if (open) {
      document.addEventListener('mousedown', onDoc)
      document.addEventListener('keydown', onKey)
    }
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const [popoverStyle, setPopoverStyle] = useState<CSSProperties>({})

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return
    const margin = 8
    const gap = 8
    const maxPanelH = 440
    const updatePosition = () => {
      const el = triggerRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const vh = window.innerHeight
      const vw = window.innerWidth
      const width = Math.min(vw - 2 * margin, 320)
      const left = Math.min(Math.max(margin, rect.left), vw - margin - width)
      const spaceBelow = vh - rect.bottom - margin
      const spaceAbove = rect.top - margin
      let top: number | undefined
      let bottom: number | undefined
      let maxHeight: number
      if (spaceBelow >= 260 || spaceBelow >= spaceAbove) {
        top = rect.bottom + gap
        maxHeight = Math.min(maxPanelH, vh - top - margin)
      } else {
        bottom = vh - rect.top + gap
        maxHeight = Math.min(maxPanelH, rect.top - margin - gap)
      }
      setPopoverStyle({
        position: 'fixed',
        left,
        top,
        bottom,
        width,
        maxHeight: Math.max(160, maxHeight),
        overflowY: 'auto',
        zIndex: 100020,
      })
    }
    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [open, viewYear, viewMonth])

  const goTodayHijri = useCallback(async () => {
    setLoadingToday(true)
    try {
      const now = new Date()
      const res = (await kalenderGet({
        action: 'today',
        tanggal: now.toISOString().slice(0, 10),
        waktu: now.toTimeString().slice(0, 8),
      })) as { hijriyah?: string }
      const h = res?.hijriyah
      if (h && /^\d{4}-\d{2}-\d{2}/.test(h) && h !== '0000-00-00') {
        const ymd = h.slice(0, 10)
        const vy = parseInt(ymd.slice(0, 4), 10)
        const vm = parseInt(ymd.slice(5, 7), 10)
        if (!Number.isNaN(vy)) setViewYear(Math.min(Math.max(vy, yearRange.lo), yearRange.hi))
        if (!Number.isNaN(vm)) setViewMonth(vm)
        if (!isDayDisabled(ymd)) {
          onChange(ymd)
          setOpen(false)
        }
      }
    } finally {
      setLoadingToday(false)
    }
  }, [onChange, isDayDisabled, yearRange.lo, yearRange.hi])

  const stepMonth = (delta: number) => {
    let y = viewYear
    let m = viewMonth + delta
    while (m < 1) {
      m += 12
      y -= 1
    }
    while (m > 12) {
      m -= 12
      y += 1
    }
    if (y < yearRange.lo || y > yearRange.hi) return
    setViewYear(y)
    setViewMonth(m)
  }

  const monthName = getBulanName(viewMonth, 'hijriyah')
  const displayText = value ? formatHijriDateDisplay(value) : ''

  const popover =
    open &&
    typeof document !== 'undefined' && (
      <AnimatePresence>
        <motion.div
          key="pickdate-hijri-panel"
          ref={popRef}
          role="dialog"
          aria-modal="true"
          aria-label="Kalender Hijriyah"
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.15 }}
          style={popoverStyle}
          className="rounded-2xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 shadow-2xl p-3"
        >
          <div className="flex items-center justify-between gap-2 mb-2 pb-2 border-b ui-divider">
            <button
              type="button"
              onClick={() => stepMonth(-1)}
              className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-blue-600 dark:text-blue-400"
              aria-label="Bulan sebelumnya"
            >
              ‹
            </button>
            <div className="flex flex-1 gap-1.5 min-w-0 justify-center">
              <select
                value={viewMonth}
                onChange={(e) => setViewMonth(Number(e.target.value))}
                className="ui-input text-sm font-semibold py-1 px-2 max-w-[52%]"
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={m}>
                    {getBulanName(m, 'hijriyah')}
                  </option>
                ))}
              </select>
              <select
                value={viewYear}
                onChange={(e) => setViewYear(Number(e.target.value))}
                className="ui-input text-sm font-semibold py-1 px-2 max-w-[46%]"
              >
                {yearRange.years.map((y) => (
                  <option key={y} value={y}>
                    {y} H
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={() => stepMonth(1)}
              className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-blue-600 dark:text-blue-400"
              aria-label="Bulan berikutnya"
            >
              ›
            </button>
          </div>

          {showTodayButton && (
            <div className="flex justify-end mb-2">
              <button
                type="button"
                onClick={goTodayHijri}
                disabled={loadingToday}
                className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-50"
              >
                {loadingToday ? '…' : 'Hari ini (Hijriyah)'}
              </button>
            </div>
          )}

          {loading && (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-500 border-t-transparent" />
            </div>
          )}
          {error && !loading && <p className="text-sm text-red-600 text-center py-4">{error}</p>}
          {!loading && !error && !monthData && (
            <p className="text-sm ui-text-muted text-center py-4">
              Tidak ada data kalender untuk {monthName} {viewYear} H.
            </p>
          )}
          {!loading && !error && monthData && (
            <>
              <div className="grid grid-cols-7 gap-0.5 text-center text-[10px] font-medium ui-text-muted mb-1">
                {WEEKDAYS_SHORT.map((w) => (
                  <div key={w} className="py-1">
                    {w}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-0.5">
                {Array.from({ length: emptyCount }).map((_, i) => (
                  <div key={`e-${i}`} className="aspect-square" />
                ))}
                {days.map(({ day, ymd }) => {
                  const selected = value === ymd
                  const dis = isDayDisabled(ymd)
                  return (
                    <button
                      key={ymd}
                      type="button"
                      disabled={dis}
                      onClick={() => {
                        if (dis) return
                        onChange(ymd)
                        setOpen(false)
                      }}
                      className={`aspect-square rounded-lg text-sm font-medium transition-colors ${
                        dis
                          ? 'text-slate-300 dark:text-slate-600 cursor-not-allowed'
                          : selected
                            ? 'bg-blue-600 text-white'
                            : 'hover:bg-blue-500/10 text-slate-800 dark:text-slate-100'
                      }`}
                    >
                      {day}
                    </button>
                  )
                })}
              </div>
            </>
          )}

          <div className="mt-3 pt-2 border-t ui-divider flex justify-between">
            <button
              type="button"
              onClick={() => {
                onChange(null)
                setOpen(false)
              }}
              className="text-xs ui-text-muted hover:text-slate-800 dark:hover:text-slate-200"
            >
              Kosongkan
            </button>
            <button type="button" onClick={() => refetch()} className="text-xs text-blue-600 dark:text-blue-400 hover:underline">
              Muat ulang
            </button>
          </div>
        </motion.div>
      </AnimatePresence>
    )

  return (
    <div ref={wrapRef} className={`relative ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        id={id}
        disabled={disabled}
        onClick={() => !disabled && setOpen((o) => !o)}
        className="ui-input-lg w-full flex items-center justify-between gap-2 text-left min-h-[44px] disabled:opacity-50"
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span className={displayText ? '' : 'ui-text-muted'}>{displayText || placeholder}</span>
        <MaterialIcon name="calendar_month" size={20} className="ui-text-muted" />
      </button>
      {typeof document !== 'undefined' && open && createPortal(popover, document.body)}
    </div>
  )
}
