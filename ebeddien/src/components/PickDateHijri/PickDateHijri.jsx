import { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { kalenderAPI } from '../../services/api'
import { useKalenderYear } from '../../pages/Kalender/hooks/useKalenderYear'
import { getBulanName } from '../../pages/Kalender/utils/bulanHijri'
import { buildHijriMonthGrid, compareHijriYmd } from './buildMonthGrid'

const WEEKDAYS_SHORT = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab']

/**
 * Format tampilan tanggal Hijriyah (Latin).
 * @param {string|null|undefined} ymd
 */
export function formatHijriDateDisplay(ymd, bulanType = 'hijriyah') {
  if (!ymd || typeof ymd !== 'string') return ''
  const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return ymd
  const y = Number(m[1])
  const month = Number(m[2])
  const d = Number(m[3])
  return `${d} ${getBulanName(month, bulanType)} ${y}`
}

/**
 * Date picker Hijriyah — data dari `psa___kalender` via API publik `/api/kalender`.
 *
 * Mirip input date HTML: nilai string `YYYY-MM-DD` (Hijriyah), popover grid bulan.
 *
 * @param {object} props
 * @param {string|null} props.value - Y-m-d Hijriyah atau null
 * @param {(ymd: string|null) => void} props.onChange
 * @param {string} [props.min] - batas bawah Y-m-d
 * @param {string} [props.max] - batas atas Y-m-d
 * @param {number} [props.yearFrom] - tahun Hijriyah minimal (dropdown), default dari min atau 1435
 * @param {number} [props.yearTo] - tahun Hijriyah maksimal, default dari max atau 1460
 * @param {string} [props.placeholder]
 * @param {boolean} [props.disabled]
 * @param {string} [props.className] - wrapper trigger
 * @param {string} [props.inputClassName] - kelas tambahan pada tombol tampilan
 * @param {string} [props.id]
 * @param {string} [props.name]
 * @param {boolean} [props.showTodayButton] - tombol "Hari ini" (Hijriyah)
 * @param {'hijriyah'|'hijriyah_ar'} [props.bulanNameType]
 */
export default function PickDateHijri({
  value,
  onChange,
  min,
  max,
  yearFrom: yearFromProp,
  yearTo: yearToProp,
  placeholder = 'Pilih tanggal Hijriyah',
  disabled = false,
  className = '',
  inputClassName = '',
  id,
  name,
  showTodayButton = true,
  bulanNameType = 'hijriyah'
}) {
  const [open, setOpen] = useState(false)
  const [viewYear, setViewYear] = useState(1446)
  const [viewMonth, setViewMonth] = useState(1)
  const [loadingToday, setLoadingToday] = useState(false)
  const wrapRef = useRef(null)
  const popRef = useRef(null)
  const triggerRef = useRef(null)

  const { yearData, loading, error, refetch } = useKalenderYear(viewYear)

  const yearRange = useMemo(() => {
    let lo = yearFromProp ?? 1435
    let hi = yearToProp ?? 1460
    if (min && min.length >= 4) {
      const y = parseInt(min.slice(0, 4), 10)
      if (!Number.isNaN(y)) lo = Math.max(lo, y)
    }
    if (max && max.length >= 4) {
      const y = parseInt(max.slice(0, 4), 10)
      if (!Number.isNaN(y)) hi = Math.min(hi, y)
    }
    if (lo > hi) [lo, hi] = [hi, lo]
    const years = []
    for (let y = lo; y <= hi; y++) years.push(y)
    return { lo, hi, years }
  }, [yearFromProp, yearToProp, min, max])

  const monthData = useMemo(() => {
    if (!yearData?.length) return null
    return (
      yearData.find((item) => String(item.id_bulan) === String(viewMonth) || item.id_bulan === viewMonth) ||
      null
    )
  }, [yearData, viewMonth])

  const { emptyCount, days } = useMemo(() => buildHijriMonthGrid(monthData), [monthData])

  const isDayDisabled = useCallback(
    (ymd) => {
      if (min && compareHijriYmd(ymd, min) < 0) return true
      if (max && compareHijriYmd(ymd, max) > 0) return true
      return false
    },
    [min, max]
  )

  /** Pastikan tahun tampilan dalam rentang dropdown */
  useEffect(() => {
    setViewYear((y) => {
      if (y < yearRange.lo) return yearRange.lo
      if (y > yearRange.hi) return yearRange.hi
      return y
    })
  }, [yearRange.lo, yearRange.hi])

  /** Sinkron view saat buka / nilai berubah; tanpa nilai → arahkan ke bulan “hari ini” Hijriyah */
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
        const res = await kalenderAPI.get({
          action: 'today',
          tanggal: now.toISOString().slice(0, 10),
          waktu: now.toTimeString().slice(0, 8)
        })
        const h = res?.hijriyah
        if (cancelled || !h || !/^\d{4}-\d{2}-\d{2}/.test(h) || h === '0000-00-00') return
        const vy = parseInt(h.slice(0, 4), 10)
        const vm = parseInt(h.slice(5, 7), 10)
        if (!Number.isNaN(vy)) {
          setViewYear(Math.min(Math.max(vy, yearRange.lo), yearRange.hi))
        }
        if (!Number.isNaN(vm) && vm >= 1 && vm <= 12) setViewMonth(vm)
      } catch (_) {
        /* abaikan */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, value, yearRange.lo, yearRange.hi])

  useEffect(() => {
    const onDoc = (e) => {
      const t = e.target
      if (wrapRef.current?.contains(t)) return
      if (popRef.current?.contains(t)) return
      setOpen(false)
    }
    const onKey = (e) => {
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

  const [popoverStyle, setPopoverStyle] = useState({})

  /** Popover di portal: pastikan panel tidak melampaui viewport (atas/bawah); scroll internal bila perlu */
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return

    const margin = 8
    const gap = 8
    const maxPanelH = 440
    const minPanelH = 160

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

      const placeBelow = () => {
        const t = rect.bottom + gap
        const mh = Math.min(maxPanelH, vh - t - margin)
        return { top: t, bottom: undefined, maxHeight: Math.max(minPanelH, mh) }
      }

      const placeAbove = () => {
        const cap = Math.max(0, rect.top - margin - gap)
        const mh = Math.min(maxPanelH, Math.max(120, cap))
        return { top: undefined, bottom: vh - rect.top + gap, maxHeight: mh }
      }

      let pos
      if (spaceBelow >= 260 || spaceBelow >= spaceAbove) {
        pos = placeBelow()
        if (pos.maxHeight < minPanelH + 40 && spaceAbove > spaceBelow) {
          pos = placeAbove()
        }
      } else {
        pos = placeAbove()
      }

      setPopoverStyle({
        position: 'fixed',
        left,
        top: pos.top,
        bottom: pos.bottom,
        width,
        maxHeight: pos.maxHeight,
        overflowY: 'auto',
        overscrollBehavior: 'contain',
        WebkitOverflowScrolling: 'touch',
        zIndex: 100020
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
      const tanggal = now.toISOString().slice(0, 10)
      const waktu = now.toTimeString().slice(0, 8)
      const res = await kalenderAPI.get({ action: 'today', tanggal, waktu })
      const h = res?.hijriyah
      if (h && /^\d{4}-\d{2}-\d{2}/.test(h) && h !== '0000-00-00') {
        const vy = parseInt(h.slice(0, 4), 10)
        const vm = parseInt(h.slice(5, 7), 10)
        if (!Number.isNaN(vy) && vy >= yearRange.lo && vy <= yearRange.hi) {
          setViewYear(vy)
          setViewMonth(vm)
        }
        if (!isDayDisabled(h.slice(0, 10))) {
          onChange?.(h.slice(0, 10))
          setOpen(false)
        }
      }
    } catch (e) {
      console.warn('PickDateHijri today:', e)
    } finally {
      setLoadingToday(false)
    }
  }, [onChange, isDayDisabled, yearRange.lo, yearRange.hi])

  const selectDay = (ymd) => {
    if (isDayDisabled(ymd)) return
    onChange?.(ymd)
    setOpen(false)
  }

  const monthName = getBulanName(viewMonth, bulanNameType)

  const canPrevMonth = useMemo(() => {
    let y = viewYear
    let m = viewMonth - 1
    if (m < 1) {
      m = 12
      y -= 1
    }
    if (y < yearRange.lo) return false
    if (y === yearRange.lo && min) {
      const minY = parseInt(min.slice(0, 4), 10)
      const minM = parseInt(min.slice(5, 7), 10)
      if (!Number.isNaN(minY) && y < minY) return false
      if (y === minY && !Number.isNaN(minM) && m < minM) return false
    }
    return true
  }, [viewYear, viewMonth, yearRange.lo, min])

  const canNextMonth = useMemo(() => {
    let y = viewYear
    let m = viewMonth + 1
    if (m > 12) {
      m = 1
      y += 1
    }
    if (y > yearRange.hi) return false
    if (y === yearRange.hi && max) {
      const maxY = parseInt(max.slice(0, 4), 10)
      const maxM = parseInt(max.slice(5, 7), 10)
      if (!Number.isNaN(maxY) && y > maxY) return false
      if (y === maxY && !Number.isNaN(maxM) && m > maxM) return false
    }
    return true
  }, [viewYear, viewMonth, yearRange.hi, max])

  const stepMonth = (delta) => {
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

  const displayText = value ? formatHijriDateDisplay(value, bulanNameType) : ''

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
          className="pickdate-hijri-popover rounded-2xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 shadow-2xl p-3 flex flex-col min-h-0"
        >
        <div className="sticky top-0 z-[1] -mx-0.5 px-0.5 pt-0.5 pb-2 mb-1 bg-white dark:bg-gray-800 flex items-center justify-between gap-2 shrink-0 border-b border-gray-100 dark:border-gray-700/80">
          <button
            type="button"
            disabled={!canPrevMonth}
            onClick={() => stepMonth(-1)}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 text-gray-700 dark:text-gray-200"
            aria-label="Bulan sebelumnya"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="flex flex-1 flex-wrap items-center justify-center gap-1.5 min-w-0">
            <select
              value={viewMonth}
              onChange={(e) => setViewMonth(Number(e.target.value))}
              className="text-sm font-semibold border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 max-w-[52%]"
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>
                  {getBulanName(m, bulanNameType)}
                </option>
              ))}
            </select>
            <select
              value={viewYear}
              onChange={(e) => setViewYear(Number(e.target.value))}
              className="text-sm font-semibold border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 max-w-[46%]"
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
            disabled={!canNextMonth}
            onClick={() => stepMonth(1)}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 text-gray-700 dark:text-gray-200"
            aria-label="Bulan berikutnya"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        {showTodayButton && (
          <div className="flex justify-end mb-2">
            <button
              type="button"
              onClick={goTodayHijri}
              disabled={loadingToday}
              className="text-xs font-medium text-teal-600 dark:text-teal-400 hover:underline disabled:opacity-50"
            >
              {loadingToday ? '…' : 'Hari ini (Hijriyah)'}
            </button>
          </div>
        )}

        {loading && (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-teal-500 border-t-transparent" />
          </div>
        )}
        {error && !loading && <p className="text-sm text-red-600 dark:text-red-400 text-center py-4">{error}</p>}
        {!loading && !error && !monthData && (
          <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">Tidak ada data kalender untuk {monthName} {viewYear} H.</p>
        )}
        {!loading && !error && monthData && (
          <>
            <div className="grid grid-cols-7 gap-0.5 text-center text-[10px] sm:text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
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
                    onClick={() => selectDay(ymd)}
                    className={[
                      'aspect-square rounded-lg text-sm font-medium transition-colors',
                      dis
                        ? 'text-gray-300 dark:text-gray-600 cursor-not-allowed'
                        : 'text-gray-900 dark:text-gray-100 hover:bg-teal-50 dark:hover:bg-teal-900/30',
                      selected && !dis ? 'bg-teal-600 text-white hover:bg-teal-700 dark:hover:bg-teal-600' : ''
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    {day}
                  </button>
                )
              })}
            </div>
          </>
        )}

        <div className="mt-3 pt-2 border-t border-gray-100 dark:border-gray-700 flex justify-between gap-2">
          <button
            type="button"
            onClick={() => {
              onChange?.(null)
              setOpen(false)
            }}
            className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
          >
            Kosongkan
          </button>
          <button
            type="button"
            onClick={() => refetch()}
            className="text-xs text-teal-600 dark:text-teal-400 hover:underline"
          >
            Muat ulang
          </button>
        </div>
        </motion.div>
      </AnimatePresence>
    )

  return (
    <div ref={wrapRef} className={`relative pickdate-hijri ${className}`}>
      <input type="hidden" name={name} id={id ? `${id}-value` : undefined} value={value || ''} readOnly />
      <button
        ref={triggerRef}
        type="button"
        id={id}
        disabled={disabled}
        onClick={() => !disabled && setOpen((o) => !o)}
        className={[
          'w-full flex items-center justify-between gap-2 rounded-xl border border-gray-300 dark:border-gray-600',
          'bg-white dark:bg-gray-800 text-left px-3 py-2.5 text-sm',
          'focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          'min-h-[44px] touch-manipulation',
          inputClassName
        ].join(' ')}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span className={displayText ? 'text-gray-900 dark:text-gray-100' : 'text-gray-400 dark:text-gray-500'}>
          {displayText || placeholder}
        </span>
        <svg className="w-5 h-5 shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
      </button>
      {typeof document !== 'undefined' && open && createPortal(popover, document.body)}
    </div>
  )
}
