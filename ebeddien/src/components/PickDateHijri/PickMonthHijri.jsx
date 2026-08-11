import { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { kalenderAPI } from '../../services/api'
import { useKalenderYear } from '../../pages/Kalender/hooks/useKalenderYear'
import { getBulanName } from '../../pages/Kalender/utils/bulanHijri'

/**
 * Format tampilan bulan Hijriyah (tanpa tanggal).
 * @param {string|null|undefined} ym - YYYY-MM Hijriyah
 * @param {'hijriyah'|'hijriyah_ar'} [bulanNameType]
 */
export function formatHijriMonthDisplay(ym, bulanNameType = 'hijriyah') {
  if (!ym || typeof ym !== 'string' || !/^\d{4}-\d{2}$/.test(ym)) return ''
  const y = Number(ym.slice(0, 4))
  const m = Number(ym.slice(5, 7))
  if (Number.isNaN(y) || Number.isNaN(m) || m < 1 || m > 12) return ym
  return `${getBulanName(m, bulanNameType)} ${y} H`
}

/**
 * Pemilih bulan Hijriyah (YYYY-MM) — tanpa grid tanggal; tahun & bulan dari data kalender.
 *
 * @param {object} props
 * @param {string|null} props.value - YYYY-MM Hijriyah
 * @param {(ym: string|null) => void} props.onChange
 * @param {number} [props.yearFrom]
 * @param {number} [props.yearTo]
 * @param {string} [props.placeholder]
 * @param {boolean} [props.disabled]
 * @param {string} [props.className]
 * @param {string} [props.inputClassName]
 * @param {string} [props.id]
 * @param {'hijriyah'|'hijriyah_ar'} [props.bulanNameType]
 */
export default function PickMonthHijri({
  value,
  onChange,
  yearFrom: yearFromProp,
  yearTo: yearToProp,
  placeholder = 'Pilih bulan Hijriyah',
  disabled = false,
  className = '',
  inputClassName = '',
  id,
  bulanNameType = 'hijriyah'
}) {
  const [open, setOpen] = useState(false)
  const [viewYear, setViewYear] = useState(1446)
  const [viewMonth, setViewMonth] = useState(1)
  const [loadingBulanIni, setLoadingBulanIni] = useState(false)
  const wrapRef = useRef(null)
  const popRef = useRef(null)
  const triggerRef = useRef(null)

  const { yearData, loading, error, refetch } = useKalenderYear(viewYear)

  const yearRange = useMemo(() => {
    let lo = yearFromProp ?? 1435
    let hi = yearToProp ?? 1460
    if (lo > hi) [lo, hi] = [hi, lo]
    const years = []
    for (let y = lo; y <= hi; y++) years.push(y)
    return { lo, hi, years }
  }, [yearFromProp, yearToProp])

  const monthExistsInData = useMemo(() => {
    if (!yearData?.length) return false
    return yearData.some((item) => String(item.id_bulan) === String(viewMonth) || item.id_bulan === viewMonth)
  }, [yearData, viewMonth])

  useEffect(() => {
    setViewYear((y) => {
      if (y < yearRange.lo) return yearRange.lo
      if (y > yearRange.hi) return yearRange.hi
      return y
    })
  }, [yearRange.lo, yearRange.hi])

  useEffect(() => {
    if (!open) return
    if (value && /^\d{4}-\d{2}$/.test(value)) {
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
        if (cancelled || !h || !/^\d{4}-\d{2}/.test(h) || h === '0000-00-00') return
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

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return

    const margin = 8
    const gap = 8
    const maxPanelH = 360
    const minPanelH = 120

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

      let pos = spaceBelow >= 200 || spaceBelow >= spaceAbove ? placeBelow() : placeAbove()
      if (pos.maxHeight < minPanelH + 40 && spaceAbove > spaceBelow) {
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

  const applyMonth = useCallback(() => {
    const ym = `${viewYear}-${String(viewMonth).padStart(2, '0')}`
    onChange?.(ym)
    setOpen(false)
  }, [viewYear, viewMonth, onChange])

  const goBulanIni = useCallback(async () => {
    setLoadingBulanIni(true)
    try {
      const now = new Date()
      const res = await kalenderAPI.get({
        action: 'today',
        tanggal: now.toISOString().slice(0, 10),
        waktu: now.toTimeString().slice(0, 8)
      })
      const h = res?.hijriyah
      if (h && /^\d{4}-\d{2}/.test(h) && h !== '0000-00-00') {
        const vy = parseInt(h.slice(0, 4), 10)
        const vm = parseInt(h.slice(5, 7), 10)
        if (!Number.isNaN(vy) && vy >= yearRange.lo && vy <= yearRange.hi) {
          setViewYear(vy)
        }
        if (!Number.isNaN(vm) && vm >= 1 && vm <= 12) {
          setViewMonth(vm)
        }
        const ym = `${h.slice(0, 4)}-${h.slice(5, 7)}`
        onChange?.(ym)
        setOpen(false)
      }
    } catch (e) {
      console.warn('PickMonthHijri bulan ini:', e)
    } finally {
      setLoadingBulanIni(false)
    }
  }, [onChange, yearRange.lo, yearRange.hi])

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

  const canPrevMonth = viewYear > yearRange.lo || (viewYear === yearRange.lo && viewMonth > 1)
  const canNextMonth = viewYear < yearRange.hi || (viewYear === yearRange.hi && viewMonth < 12)

  const displayText = value ? formatHijriMonthDisplay(value, bulanNameType) : ''

  const popover =
    open &&
    typeof document !== 'undefined' && (
      <AnimatePresence>
        <motion.div
          key="pickmonth-hijri-panel"
          ref={popRef}
          role="dialog"
          aria-modal="true"
          aria-label="Pilih bulan Hijriyah"
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.15 }}
          style={popoverStyle}
          className="pickmonth-hijri-popover rounded-2xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 shadow-2xl p-3 flex flex-col gap-3 min-h-0"
        >
          <div className="flex items-center justify-between gap-2 shrink-0 border-b border-gray-100 dark:border-gray-700/80 pb-2">
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

          {loading && (
            <div className="flex justify-center py-6">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-teal-500 border-t-transparent" />
            </div>
          )}
          {error && !loading && <p className="text-sm text-red-600 dark:text-red-400 text-center py-2">{error}</p>}
          {!loading && !error && !monthExistsInData && (
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-2">
              Tidak ada data kalender untuk {getBulanName(viewMonth, bulanNameType)} {viewYear} H.
            </p>
          )}

          <div className="flex flex-col gap-2 pt-1">
            <button
              type="button"
              disabled={loading}
              onClick={applyMonth}
              className="w-full py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium disabled:opacity-50"
            >
              Gunakan bulan ini
            </button>
            <button
              type="button"
              onClick={goBulanIni}
              disabled={loadingBulanIni}
              className="w-full py-2 rounded-xl border border-gray-200 dark:border-gray-600 text-sm text-teal-700 dark:text-teal-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 disabled:opacity-50"
            >
              {loadingBulanIni ? '…' : 'Lompat ke bulan Hijriyah saat ini'}
            </button>
          </div>

          <div className="flex justify-between gap-2 pt-1 border-t border-gray-100 dark:border-gray-700">
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
            <button type="button" onClick={() => refetch()} className="text-xs text-teal-600 dark:text-teal-400 hover:underline">
              Muat ulang
            </button>
          </div>
        </motion.div>
      </AnimatePresence>
    )

  return (
    <div ref={wrapRef} className={`relative pickmonth-hijri ${className}`}>
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
