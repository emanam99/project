import { useState, useMemo, useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { calculatePasaran } from '../utils/pasaran'
import { INDONESIAN_MONTHS, formatDateRangeHijri } from '../utils/dateRange'
import { toArabicDigits } from '../utils/arabicDigits'
import { kalenderConvertRange } from '../../../api/kalenderApi'
import { getConvertCache, setConvertCache } from '../utils/kalenderCache'
import KalenderFontAccordion from './KalenderFontAccordion'
import { loadShowHijriyah, saveShowHijriyah, loadShowPasaran, saveShowPasaran } from '../utils/kalenderStorage'
import { fontSettingsToStyle, type FontSettings } from '../utils/fontSettings'
import { getGridClassName, getGridLineStyle, type GridViewSettings } from '../utils/gridView'
import './CalendarGrid.css'
import MaterialIcon from '../../../components/MaterialIcon'

const GREG_DAY_HEADERS = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab']

type Props = {
  fontSettings: FontSettings
  onFontSettingsChange: (fn: (prev: FontSettings) => FontSettings) => void
  gridViewSettings: GridViewSettings
  onGridViewSettingsChange: (fn: (prev: GridViewSettings) => GridViewSettings) => void
}

export default function CalendarMasehi({
  fontSettings,
  onFontSettingsChange,
  gridViewSettings,
  onGridViewSettingsChange,
}: Props) {
  const [year, setYear] = useState(() => new Date().getFullYear())
  const [month, setMonth] = useState(() => new Date().getMonth() + 1)
  const [showPasaran, setShowPasaran] = useState(loadShowPasaran)
  const [showHijriyah, setShowHijriyah] = useState(loadShowHijriyah)
  const [showPengaturan, setShowPengaturan] = useState(false)
  const [hijriMap, setHijriMap] = useState<Record<string, string>>({})

  const { monthName, firstDay, dayCells } = useMemo(() => {
    const d = new Date(year, month - 1, 1)
    const last = new Date(year, month, 0)
    const daysInMonth = last.getDate()
    const firstDay = d.getDay()
    const cells = []
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    for (let day = 1; day <= daysInMonth; day++) {
      const dayDate = new Date(year, month - 1, day)
      const dayDateCompare = new Date(dayDate)
      dayDateCompare.setHours(0, 0, 0, 0)
      cells.push({
        day,
        dayDate,
        isToday: dayDateCompare.getTime() === today.getTime(),
        pasaran: showPasaran ? calculatePasaran(dayDate) : null,
      })
    }
    return {
      monthName: INDONESIAN_MONTHS[month - 1] || '',
      firstDay,
      dayCells: cells,
    }
  }, [year, month, showPasaran])

  useEffect(() => {
    const last = new Date(year, month, 0)
    const daysInMonth = last.getDate()
    const tanggalAwal = `${year}-${String(month).padStart(2, '0')}-01`
    const tanggalAkhir = `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`

    const fromCache: Record<string, string> = {}
    for (let day = 1; day <= daysInMonth; day++) {
      const key = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      const hijriyah = getConvertCache(key)
      if (hijriyah) fromCache[key] = hijriyah
    }
    setHijriMap(fromCache)

    let cancelled = false
    kalenderConvertRange(tanggalAwal, tanggalAkhir)
      .then((data) => {
        if (cancelled) return
        const next = { ...fromCache }
        Object.keys(data).forEach((tanggal) => {
          const hijriyah = data[tanggal]
          if (hijriyah && hijriyah !== '0000-00-00') {
            setConvertCache(tanggal, hijriyah)
            next[tanggal] = hijriyah
          }
        })
        setHijriMap(next)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [year, month])

  const lastDayOfMonth = useMemo(() => new Date(year, month, 0).getDate(), [year, month])
  const firstKey = `${year}-${String(month).padStart(2, '0')}-01`
  const lastKey = `${year}-${String(month).padStart(2, '0')}-${String(lastDayOfMonth).padStart(2, '0')}`
  const hijriRangeText =
    hijriMap[firstKey] && hijriMap[lastKey] ? formatDateRangeHijri(hijriMap[firstKey], hijriMap[lastKey]) : ''

  useEffect(() => {
    saveShowHijriyah(showHijriyah)
  }, [showHijriyah])

  useEffect(() => {
    saveShowPasaran(showPasaran)
  }, [showPasaran])

  const goToToday = () => {
    const now = new Date()
    setYear(now.getFullYear())
    setMonth(now.getMonth() + 1)
  }

  const prevMonth = () => {
    if (month <= 1) {
      setYear((y) => y - 1)
      setMonth(12)
    } else {
      setMonth((m) => m - 1)
    }
  }
  const nextMonth = () => {
    if (month >= 12) {
      setYear((y) => y + 1)
      setMonth(1)
    } else {
      setMonth((m) => m + 1)
    }
  }

  const fontStyle = fontSettingsToStyle(fontSettings, 'masehi')
  const now = new Date()
  const isViewingTodayMonth = year === now.getFullYear() && month === now.getMonth() + 1
  const showTodayButton = !isViewingTodayMonth

  return (
    <div className="kalender-masehi" style={fontStyle}>
      <div className="kalender-masehi__year">
        <button type="button" onClick={() => setYear((y) => y + 1)} className="kalender-hijri__nav" aria-label="Tahun berikutnya">
          <MaterialIcon name="chevron_right" size={20} />
        </button>
        <h3 className="kalender-hijri__year-value">{year}</h3>
        <button type="button" onClick={() => setYear((y) => y - 1)} className="kalender-hijri__nav" aria-label="Tahun sebelumnya">
          <MaterialIcon name="chevron_left" size={20} />
        </button>
      </div>

      <div className="kalender-masehi__month">
        <button type="button" onClick={nextMonth} className="kalender-hijri__nav" aria-label="Bulan berikutnya">
          <MaterialIcon name="chevron_right" size={20} />
        </button>
        <h4 className="kalender-hijri__month-value">{monthName}</h4>
        <button type="button" onClick={prevMonth} className="kalender-hijri__nav" aria-label="Bulan sebelumnya">
          <MaterialIcon name="chevron_left" size={20} />
        </button>
      </div>

      <div className="kalender-hijri__info-and-actions">
        <div className="kalender-hijri__info">
          {hijriRangeText && <div className="kalender-hijri__range-text">{hijriRangeText}</div>}
          <div className="kalender-hijri__toggles kalender-masehi__toggles">
            <label className="kalender-hijri__toggle kalender-masehi__toggle">
              <input type="checkbox" checked={showHijriyah} onChange={(e) => setShowHijriyah(e.target.checked)} />
              <span>Hijriyah</span>
            </label>
            <label className="kalender-hijri__toggle kalender-masehi__toggle">
              <input type="checkbox" checked={showPasaran} onChange={(e) => setShowPasaran(e.target.checked)} />
              <span>Pasaran</span>
            </label>
          </div>
        </div>
        <div className="kalender-hijri__row-actions">
          <AnimatePresence initial={false}>
            {showTodayButton && (
              <motion.div
                key="today-btn"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                className="kalender-hijri__today-btn-wrap"
              >
                <button type="button" onClick={goToToday} className="kalender-hijri__today-btn" aria-label="Hari ini">
                  <MaterialIcon name="today" size={20} />
                </button>
              </motion.div>
            )}
          </AnimatePresence>
          <button
            type="button"
            className="kalender-hijri__pengaturan-btn"
            onClick={() => setShowPengaturan((v) => !v)}
            aria-expanded={showPengaturan}
            aria-label="Pengaturan"
          >
                        <motion.span
              className="inline-flex"
              animate={{ rotate: showPengaturan ? 90 : 0 }}
              transition={{ type: 'tween', duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] }}
            >
              <MaterialIcon name="settings" size={20} />
            </motion.span>
          </button>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {showPengaturan && (
          <KalenderFontAccordion
            tab="masehi"
            fontSettings={fontSettings}
            onFontSettingsChange={onFontSettingsChange}
            gridViewSettings={gridViewSettings}
            onGridViewSettingsChange={onGridViewSettingsChange}
          />
        )}
      </AnimatePresence>

      <div
        className={getGridClassName(gridViewSettings, 'kalender-grid kalender-grid--masehi')}
        style={gridViewSettings ? getGridLineStyle(gridViewSettings) : undefined}
        dir="ltr"
      >
        {GREG_DAY_HEADERS.map((label) => (
          <div key={label} className="kalender-grid__header">
            {label}
          </div>
        ))}
        {Array.from({ length: firstDay }).map((_, i) => (
          <div key={`e-${i}`} className="kalender-grid__empty" />
        ))}
        {dayCells.map((d, i) => {
          const iso = `${year}-${String(month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`
          const hijriStr = hijriMap[iso]
          const hijriDay = hijriStr ? hijriStr.split('-')[2] : null
          return (
            <div key={i} className={`kalender-grid__day ${d.isToday ? 'kalender-grid__day--today' : ''}`}>
              <div className="kalender-grid__day-row kalender-grid__day-row--masehi">
                {showHijriyah && hijriDay && (
                  <div className="kalender-grid__day-hijri-small" dir="rtl">
                    {toArabicDigits(parseInt(hijriDay, 10))}
                  </div>
                )}
                <div className="kalender-grid__day-masehi">{d.day}</div>
              </div>
              {d.pasaran && <div className="kalender-grid__day-pasaran">{d.pasaran}</div>}
            </div>
          )
        })}
      </div>
    </div>
  )
}
