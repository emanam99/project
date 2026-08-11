import { useState, useEffect, useMemo } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { kalenderAPI, hariPentingAPI } from '../../../services/api'
import { matchesHariPentingHijriCalendar } from '../utils/hariPentingMatch'
import { useKalenderYear } from '../hooks/useKalenderYear'
import CalendarGridHijri from './CalendarGridHijri'
import KalenderFontAccordion from './KalenderFontAccordion'
import { formatDateRange } from '../utils/dateRange'
import { getBulanName } from '../utils/bulanHijri'
import { loadShowGregorian, saveShowGregorian, loadShowPasaran, saveShowPasaran } from '../utils/kalenderStorage'
import { fontSettingsToStyle } from '../utils/fontSettings'
import './CalendarHijri.css'

export default function CalendarHijri({
  initialYear,
  initialMonth,
  todayHijriYear,
  todayHijriMonth,
  fontSettings,
  onFontSettingsChange,
  gridViewSettings,
  onGridViewSettingsChange,
  showHariPentingMarkers = true,
  onShowHariPentingMarkersChange,
  hariPentingRefreshKey = 0,
  onRequestTambahPribadi,
  canTambahPribadi = false
}) {
  const [year, setYear] = useState(initialYear ?? 1446)
  const [month, setMonth] = useState(initialMonth ?? 1)
  const [showPasaran, setShowPasaran] = useState(loadShowPasaran)
  const [showGregorian, setShowGregorian] = useState(loadShowGregorian)
  const [showPengaturan, setShowPengaturan] = useState(false)
  const [dateRangeText, setDateRangeText] = useState('')
  const [firstDate, setFirstDate] = useState(null)
  const [lastDate, setLastDate] = useState(null)
  const [hariPentingList, setHariPentingList] = useState([])

  const { yearData, loading, error, refetch } = useKalenderYear(year)

  useEffect(() => {
    let cancelled = false
    if (!showHariPentingMarkers) {
      setHariPentingList([])
      return
    }
    hariPentingAPI.getList({ tahun: year, bulan: month })
      .then((res) => {
        if (cancelled) return
        const arr = Array.isArray(res) ? res : (res && Array.isArray(res.data) ? res.data : [])
        setHariPentingList(arr)
      })
      .catch(() => { if (!cancelled) setHariPentingList([]) })
    return () => { cancelled = true }
  }, [year, month, showHariPentingMarkers, hariPentingRefreshKey])

  const monthData = useMemo(() => {
    if (!yearData || !yearData.length) return null
    const m = yearData.find(
      (item) => String(item.id_bulan) === String(month) || item.id_bulan === month
    )
    return m || null
  }, [yearData, month])

  const monthName = useMemo(() => getBulanName(month, 'hijriyah_ar'), [month])

  const hariPentingByDay = useMemo(() => {
    const map = {}
    if (!monthData?.mulai || !monthData?.akhir) return map
    const startDate = new Date(monthData.mulai)
    const endDate = new Date(monthData.akhir)
    const daysInMonth = Math.floor((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1
    const hijriYear = monthData.tahun != null ? Number(monthData.tahun) : null
    const hijriBulan = monthData.id_bulan != null ? Number(monthData.id_bulan) : month

    for (let day = 1; day <= daysInMonth; day++) {
      const dayDate = new Date(startDate)
      dayDate.setDate(startDate.getDate() + (day - 1))
      const gregDay = dayDate.getDate()
      const gregMonth = dayDate.getMonth() + 1
      const gregYear = dayDate.getFullYear()

      for (const item of hariPentingList) {
        const color = item.warna_label || '#0d9488'
        if (
          matchesHariPentingHijriCalendar(day, hijriBulan, hijriYear, gregDay, gregMonth, gregYear, item)
        ) {
          if (!map[day]) map[day] = []
          if (!map[day].includes(color)) map[day].push(color)
        }
      }
    }
    return map
  }, [hariPentingList, monthData, month])

  useEffect(() => {
    if (!monthData?.mulai || !monthData?.akhir) {
      setDateRangeText('')
      setFirstDate(null)
      setLastDate(null)
      return
    }
    const start = new Date(monthData.mulai)
    const end = new Date(monthData.akhir)
    setFirstDate(start)
    setLastDate(end)
    setDateRangeText(formatDateRange(start, end))
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
      const res = await kalenderAPI.get({ action: 'today', tanggal, waktu })
      if (res && res.hijriyah && res.hijriyah !== '0000-00-00') {
        const [y, m] = res.hijriyah.split('-').map(Number)
        setYear(y)
        setMonth(m)
      }
    } catch (e) {
      console.error('goToToday error', e)
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

  const fontStyle = fontSettings ? fontSettingsToStyle(fontSettings, 'hijri') : undefined
  const isViewingTodayMonth = todayHijriYear != null && todayHijriMonth != null && year === todayHijriYear && month === todayHijriMonth
  const showTodayButton = !isViewingTodayMonth

  return (
    <div className="kalender-hijri" style={fontStyle || undefined}>
      <div className="kalender-hijri__year">
        <button type="button" onClick={nextYear} className="kalender-hijri__nav" aria-label="Tahun berikutnya">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
          </svg>
        </button>
        <h3 className="kalender-hijri__year-value">{year}</h3>
        <button type="button" onClick={prevYear} className="kalender-hijri__nav" aria-label="Tahun sebelumnya">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      </div>

      <div className="kalender-hijri__month">
        <button type="button" onClick={nextMonth} className="kalender-hijri__nav" aria-label="Bulan berikutnya">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
          </svg>
        </button>
        <h4 className="kalender-hijri__month-value">{monthName}</h4>
        <button type="button" onClick={prevMonth} className="kalender-hijri__nav" aria-label="Bulan sebelumnya">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      </div>

      <div className="kalender-hijri__info-and-actions">
        <div className="kalender-hijri__info">
          {dateRangeText && (
            <div className="kalender-hijri__range-text">{dateRangeText}</div>
          )}
          <div className="kalender-hijri__toggles">
            <label className="kalender-hijri__toggle">
              <input
                type="checkbox"
                checked={showGregorian}
                onChange={(e) => setShowGregorian(e.target.checked)}
              />
              <span>Masehi</span>
            </label>
            <label className="kalender-hijri__toggle">
              <input
                type="checkbox"
                checked={showPasaran}
                onChange={(e) => setShowPasaran(e.target.checked)}
              />
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
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
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
            <motion.svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              animate={{ rotate: showPengaturan ? 90 : 0 }}
              transition={{ type: 'tween', duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] }}
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </motion.svg>
          </button>
        </div>
      </div>
      <AnimatePresence initial={false}>
        {showPengaturan && fontSettings && onFontSettingsChange && (
          <KalenderFontAccordion
            tab="hijri"
            fontSettings={fontSettings}
            onFontSettingsChange={onFontSettingsChange}
            gridViewSettings={gridViewSettings}
            onGridViewSettingsChange={onGridViewSettingsChange}
            showHariPentingMarkers={showHariPentingMarkers}
            onShowHariPentingMarkersChange={onShowHariPentingMarkersChange}
          />
        )}
      </AnimatePresence>

      {loading ? (
        <div className="kalender-hijri__loading">
          <div className="animate-spin rounded-full h-10 w-10 border-2 border-teal-600 border-t-transparent" />
          <p>Memuat data kalender...</p>
        </div>
      ) : monthData ? (
        <CalendarGridHijri
          monthData={monthData}
          showGregorian={showGregorian}
          showPasaran={showPasaran}
          gridViewSettings={gridViewSettings}
          showHariPentingMarkers={showHariPentingMarkers}
          hariPentingByDay={hariPentingByDay}
          hariPentingList={hariPentingList}
          onRequestTambahPribadi={onRequestTambahPribadi}
          canTambahPribadi={canTambahPribadi}
        />
      ) : (
        <div className="kalender-hijri__empty">
          <p>Data bulan ini belum tersedia.</p>
        </div>
      )}
    </div>
  )
}
