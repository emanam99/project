import { useState, useEffect, useMemo } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { kalenderGet, type KalenderToday } from '../../../api/kalenderApi'
import { useKalenderYear } from '../hooks/useKalenderYear'
import CalendarGridHijri from './CalendarGridHijri'
import KalenderFontAccordion from './KalenderFontAccordion'
import { formatDateRange } from '../utils/dateRange'
import { getBulanName } from '../utils/bulanHijri'
import { loadShowGregorian, saveShowGregorian, loadShowPasaran, saveShowPasaran } from '../utils/kalenderStorage'
import { fontSettingsToStyle, type FontSettings } from '../utils/fontSettings'
import type { GridViewSettings } from '../utils/gridView'
import './CalendarHijri.css'
import MaterialIcon from '../../../components/MaterialIcon'
import { ContentSkeleton } from '../../../components/LazyFallback'

type Props = {
  initialYear?: number
  initialMonth?: number
  todayHijriYear?: number | null
  todayHijriMonth?: number | null
  fontSettings: FontSettings
  onFontSettingsChange: (fn: (prev: FontSettings) => FontSettings) => void
  gridViewSettings: GridViewSettings
  onGridViewSettingsChange: (fn: (prev: GridViewSettings) => GridViewSettings) => void
}

export default function CalendarHijri({
  initialYear,
  initialMonth,
  todayHijriYear,
  todayHijriMonth,
  fontSettings,
  onFontSettingsChange,
  gridViewSettings,
  onGridViewSettingsChange,
}: Props) {
  const [year, setYear] = useState(initialYear ?? 1446)
  const [month, setMonth] = useState(initialMonth ?? 1)
  const [showPasaran, setShowPasaran] = useState(loadShowPasaran)
  const [showGregorian, setShowGregorian] = useState(loadShowGregorian)
  const [showPengaturan, setShowPengaturan] = useState(false)
  const [dateRangeText, setDateRangeText] = useState('')

  const { yearData, loading, error, refetch } = useKalenderYear(year)

  const monthData = useMemo(() => {
    if (!yearData?.length) return null
    return (
      yearData.find((item) => String(item.id_bulan) === String(month) || Number(item.id_bulan) === month) ||
      null
    )
  }, [yearData, month])

  const monthName = useMemo(() => getBulanName(month, 'hijriyah_ar'), [month])

  useEffect(() => {
    if (!monthData?.mulai || !monthData?.akhir) {
      setDateRangeText('')
      return
    }
    setDateRangeText(formatDateRange(new Date(monthData.mulai), new Date(monthData.akhir)))
  }, [monthData])

  useEffect(() => {
    saveShowGregorian(showGregorian)
  }, [showGregorian])

  useEffect(() => {
    saveShowPasaran(showPasaran)
  }, [showPasaran])

  const goToToday = async () => {
    try {
      const now = new Date()
      const tanggal = now.toISOString().slice(0, 10)
      const waktu = now.toTimeString().slice(0, 8)
      const res = (await kalenderGet({ action: 'today', tanggal, waktu })) as KalenderToday
      if (res?.hijriyah && res.hijriyah !== '0000-00-00') {
        const [y, m] = res.hijriyah.split('-').map(Number)
        setYear(y)
        setMonth(m)
      }
    } catch {
      /* ignore */
    }
  }

  const prevYear = () => setYear((y) => y - 1)
  const nextYear = () => setYear((y) => y + 1)
  const prevMonth = () => {
    setMonth((m) => {
      if (m <= 1) {
        setYear((y) => y - 1)
        return 12
      }
      return m - 1
    })
  }
  const nextMonth = () => {
    setMonth((m) => {
      if (m >= 12) {
        setYear((y) => y + 1)
        return 1
      }
      return m + 1
    })
  }

  if (error) {
    return (
      <div className="kalender-hijri kalender-hijri--error">
        <p>{error}</p>
        <button type="button" onClick={() => refetch()} className="kalender-hijri__btn">
          Coba lagi
        </button>
      </div>
    )
  }

  const fontStyle = fontSettingsToStyle(fontSettings, 'hijri')
  const isViewingTodayMonth =
    todayHijriYear != null && todayHijriMonth != null && year === todayHijriYear && month === todayHijriMonth
  const showTodayButton = !isViewingTodayMonth

  return (
    <div className="kalender-hijri" style={fontStyle}>
      <div className="kalender-hijri__year">
        <button type="button" onClick={nextYear} className="kalender-hijri__nav" aria-label="Tahun berikutnya">
          <MaterialIcon name="chevron_right" size={20} />
        </button>
        <h3 className="kalender-hijri__year-value">{year}</h3>
        <button type="button" onClick={prevYear} className="kalender-hijri__nav" aria-label="Tahun sebelumnya">
          <MaterialIcon name="chevron_left" size={20} />
        </button>
      </div>

      <div className="kalender-hijri__month">
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
          {dateRangeText && <div className="kalender-hijri__range-text">{dateRangeText}</div>}
          <div className="kalender-hijri__toggles">
            <label className="kalender-hijri__toggle">
              <input type="checkbox" checked={showGregorian} onChange={(e) => setShowGregorian(e.target.checked)} />
              <span>Masehi</span>
            </label>
            <label className="kalender-hijri__toggle">
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
            tab="hijri"
            fontSettings={fontSettings}
            onFontSettingsChange={onFontSettingsChange}
            gridViewSettings={gridViewSettings}
            onGridViewSettingsChange={onGridViewSettingsChange}
          />
        )}
      </AnimatePresence>

      {loading ? (
        <div className="kalender-hijri__loading py-6">
          <ContentSkeleton rows={5} className="w-full max-w-lg" />
        </div>
      ) : monthData ? (
        <CalendarGridHijri
          monthData={monthData}
          showGregorian={showGregorian}
          showPasaran={showPasaran}
          gridViewSettings={gridViewSettings}
        />
      ) : (
        <div className="kalender-hijri__empty">
          <p>Data bulan ini belum tersedia.</p>
        </div>
      )}
    </div>
  )
}
