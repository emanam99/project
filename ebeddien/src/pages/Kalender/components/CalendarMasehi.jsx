import { useState, useMemo, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { calculatePasaran } from '../utils/pasaran'
import { INDONESIAN_MONTHS, formatDateRangeHijri } from '../utils/dateRange'
import { getBulanName } from '../utils/bulanHijri'
import { toArabicDigits } from '../utils/arabicDigits'
import { kalenderAPI, hariPentingAPI } from '../../../services/api'
import { matchesHariPentingMasehiCalendar } from '../utils/hariPentingMatch'
import { formatJamRangeLabel } from '../utils/hariPentingJam'
import { getConvertCache, setConvertCache } from '../utils/kalenderCache'
import KalenderFontAccordion from './KalenderFontAccordion'
import { loadShowHijriyah, saveShowHijriyah, loadShowPasaran, saveShowPasaran } from '../utils/kalenderStorage'
import { fontSettingsToStyle } from '../utils/fontSettings'
import { getGridClassName, getGridLineStyle } from '../utils/gridView'
import './CalendarGrid.css'

const GREG_DAY_HEADERS = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab']

export default function CalendarMasehi({
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
  const [year, setYear] = useState(() => new Date().getFullYear())
  const [month, setMonth] = useState(() => new Date().getMonth() + 1)
  const [showPasaran, setShowPasaran] = useState(loadShowPasaran)
  const [showHijriyah, setShowHijriyah] = useState(loadShowHijriyah)
  const [showPengaturan, setShowPengaturan] = useState(false)
  const [hijriMap, setHijriMap] = useState({})
  const [hariPentingList, setHariPentingList] = useState([])
  const [popup, setPopup] = useState({ open: false, day: null, rect: null })

  const closePopup = useCallback(() => setPopup((p) => ({ ...p, open: false })), [])

  useEffect(() => {
    if (!popup.open) return
    const onDocClick = (e) => {
      const el = e.target
      if (el && el.closest && el.closest('.kalender-grid__day-popup')) return
      closePopup()
    }
    const t = setTimeout(() => document.addEventListener('click', onDocClick), 0)
    return () => {
      clearTimeout(t)
      document.removeEventListener('click', onDocClick)
    }
  }, [popup.open, closePopup])

  const itemsForDay = useMemo(() => {
    if (!popup.open || popup.day == null) return []
    const day = Number(popup.day)
    const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    const hijriStr = hijriMap[iso]
    return hariPentingList.filter((item) =>
      matchesHariPentingMasehiCalendar(iso, hijriStr, day, month, year, item)
    )
  }, [popup.open, popup.day, hariPentingList, hijriMap, year, month])

  const { monthName, daysInMonth, firstDay, dayCells } = useMemo(() => {
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
        pasaran: showPasaran ? calculatePasaran(dayDate) : null
      })
    }
    return {
      monthName: INDONESIAN_MONTHS[month - 1] || '',
      daysInMonth,
      firstDay,
      dayCells: cells
    }
  }, [year, month, showPasaran])

  useEffect(() => {
    const last = new Date(year, month, 0)
    const daysInMonth = last.getDate()
    const tanggalAwal = `${year}-${String(month).padStart(2, '0')}-01`
    const tanggalAkhir = `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`

    const fromCache = {}
    for (let day = 1; day <= daysInMonth; day++) {
      const key = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      const hijriyah = getConvertCache(key)
      if (hijriyah) fromCache[key] = hijriyah
    }
    setHijriMap(fromCache)

    let cancelled = false
    kalenderAPI.get({ action: 'convert_range', tanggal_awal: tanggalAwal, tanggal_akhir: tanggalAkhir })
      .then((res) => {
        if (cancelled) return
        const data = res && res.data && typeof res.data === 'object' ? res.data : {}
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
    return () => { cancelled = true }
  }, [year, month])

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

  const hariPentingByDay = useMemo(() => {
    const map = {}
    const lastDay = new Date(year, month, 0).getDate()
    for (let day = 1; day <= lastDay; day++) {
      const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      const hijriStr = hijriMap[iso]
      for (const item of hariPentingList) {
        const color = item.warna_label || '#0d9488'
        if (matchesHariPentingMasehiCalendar(iso, hijriStr, day, month, year, item)) {
          if (!map[day]) map[day] = []
          if (!map[day].includes(color)) map[day].push(color)
        }
      }
    }
    return map
  }, [hariPentingList, hijriMap, year, month])

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

  const lastDayOfMonth = useMemo(() => new Date(year, month, 0).getDate(), [year, month])
  const firstKey = `${year}-${String(month).padStart(2, '0')}-01`
  const lastKey = `${year}-${String(month).padStart(2, '0')}-${String(lastDayOfMonth).padStart(2, '0')}`
  const hijriRangeText = hijriMap[firstKey] && hijriMap[lastKey]
    ? formatDateRangeHijri(hijriMap[firstKey], hijriMap[lastKey])
    : ''

  useEffect(() => {
    saveShowHijriyah(showHijriyah)
  }, [showHijriyah])

  useEffect(() => {
    saveShowPasaran(showPasaran)
  }, [showPasaran])

  const fontStyle = fontSettings ? fontSettingsToStyle(fontSettings, 'masehi') : undefined
  const now = new Date()
  const currentGregorianYear = now.getFullYear()
  const currentGregorianMonth = now.getMonth() + 1
  const isViewingTodayMonth = year === currentGregorianYear && month === currentGregorianMonth
  const showTodayButton = !isViewingTodayMonth

  return (
    <div className="kalender-masehi" style={fontStyle || undefined}>
      <div className="kalender-masehi__year">
        <button type="button" onClick={() => setYear((y) => y + 1)} className="kalender-hijri__nav" aria-label="Tahun berikutnya">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" /></svg>
        </button>
        <h3 className="kalender-hijri__year-value">{year}</h3>
        <button type="button" onClick={() => setYear((y) => y - 1)} className="kalender-hijri__nav" aria-label="Tahun sebelumnya">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" /></svg>
        </button>
      </div>
      <div className="kalender-masehi__month">
        <button type="button" onClick={nextMonth} className="kalender-hijri__nav" aria-label="Bulan berikutnya">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" /></svg>
        </button>
        <h4 className="kalender-hijri__month-value">{monthName}</h4>
        <button type="button" onClick={prevMonth} className="kalender-hijri__nav" aria-label="Bulan sebelumnya">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" /></svg>
        </button>
      </div>
      <div className="kalender-hijri__info-and-actions">
        <div className="kalender-hijri__info">
          {hijriRangeText && (
            <div className="kalender-hijri__range-text">{hijriRangeText}</div>
          )}
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
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
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
            tab="masehi"
            fontSettings={fontSettings}
            onFontSettingsChange={onFontSettingsChange}
            gridViewSettings={gridViewSettings}
            onGridViewSettingsChange={onGridViewSettingsChange}
            showHariPentingMarkers={showHariPentingMarkers}
            onShowHariPentingMarkersChange={onShowHariPentingMarkersChange}
          />
        )}
      </AnimatePresence>
      <div
        className={getGridClassName(gridViewSettings, 'kalender-grid kalender-grid--masehi')}
        style={gridViewSettings ? getGridLineStyle(gridViewSettings) : undefined}
        dir="ltr"
      >
        {GREG_DAY_HEADERS.map((label) => (
          <div key={label} className="kalender-grid__header">{label}</div>
        ))}
        {Array.from({ length: firstDay }).map((_, i) => (
          <div key={`e-${i}`} className="kalender-grid__empty" />
        ))}
        {dayCells.map((d, i) => {
          const iso = `${year}-${String(month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`
          const hijriStr = hijriMap[iso]
          const hijriDay = hijriStr ? hijriStr.split('-')[2] : null
          const markerColors = showHariPentingMarkers && hariPentingByDay[d.day] ? hariPentingByDay[d.day] : []
          const itemsOnDay = (() => {
            const day = d.day
            const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
            const hijriStr = hijriMap[iso]
            const isoDay = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
            return hariPentingList.filter((item) =>
              matchesHariPentingMasehiCalendar(isoDay, hijriStr, day, month, year, item)
            )
          })()
          const hasHariPenting = itemsOnDay.length > 0
          const handleDayClick = (e) => {
            e.stopPropagation()
            const rect = e.currentTarget.getBoundingClientRect()
            setPopup({ open: true, day: d.day, rect })
          }
          return (
            <div
              key={i}
              role="button"
              tabIndex={0}
              onClick={handleDayClick}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleDayClick(e); } }}
              className={`kalender-grid__day ${d.isToday ? 'kalender-grid__day--today' : ''} kalender-grid__day--clickable`}
              aria-label={hasHariPenting ? `Tanggal ${d.day}, ${itemsOnDay.length} hari penting` : `Tanggal ${d.day}`}
            >
              {markerColors.length > 0 && (
                <div className="kalender-grid__day-markers" aria-hidden>
                  {markerColors.slice(0, 3).map((color, j) => (
                    <span
                      key={j}
                      className="kalender-grid__day-marker"
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              )}
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
      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {popup.open && popup.rect != null && (() => {
            const spaceBelow = typeof window !== 'undefined' ? window.innerHeight - popup.rect.bottom - 8 : 300
            const showAbove = spaceBelow < 220
            const left = typeof window !== 'undefined' ? Math.max(8, Math.min(popup.rect.left, window.innerWidth - 296)) : popup.rect.left
            const popupStyle = showAbove
              ? { position: 'fixed', left, bottom: window.innerHeight - popup.rect.top + 6, zIndex: 9999, maxHeight: `${Math.max(160, popup.rect.top - 14)}px` }
              : { position: 'fixed', left, top: popup.rect.bottom + 6, zIndex: 9999, maxHeight: `${Math.max(160, window.innerHeight - popup.rect.bottom - 14)}px` }
            const initial = showAbove ? { opacity: 0, scale: 0.92, y: -6 } : { opacity: 0, scale: 0.92, y: 6 }
            const exit = showAbove ? { opacity: 0, scale: 0.96, y: -4 } : { opacity: 0, scale: 0.96, y: 4 }
            return (
            <motion.div
              key="masehi-day-popup"
              className="kalender-grid__day-popup"
              role="dialog"
              aria-modal="true"
              aria-labelledby="kalender-popup-title-masehi"
              style={popupStyle}
              initial={initial}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={exit}
              transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="kalender-grid__day-popup-inner">
                <div className="kalender-grid__day-popup-header">
                  <div className="kalender-grid__day-popup-header-text">
                    <h3 id="kalender-popup-title-masehi" className="kalender-grid__day-popup-title">
                      {popup.day} {monthName} {year}
                    </h3>
                    {(() => {
                      const iso = `${year}-${String(month).padStart(2, '0')}-${String(popup.day).padStart(2, '0')}`
                      const hijriStr = hijriMap[iso]
                      if (!hijriStr) return null
                      const [hy, hm, hd] = hijriStr.split('-')
                      const bulanHijri = getBulanName(Number(hm), 'hijriyah')
                      return (
                        <p className="kalender-grid__day-popup-subtitle">
                          {parseInt(hd, 10)} {bulanHijri} {hy} H
                        </p>
                      )
                    })()}
                  </div>
                  <button
                    type="button"
                    className="kalender-grid__day-popup-close"
                    onClick={closePopup}
                    aria-label="Tutup"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <div className="kalender-grid__day-popup-body">
                  {itemsForDay.length === 0 ? (
                    <p className="kalender-grid__day-popup-empty">Tidak ada hari penting pada tanggal ini.</p>
                  ) : (
                    <ul className="kalender-grid__day-popup-list">
                      {itemsForDay.map((item) => {
                        const jamStr = formatJamRangeLabel(item)
                        return (
                        <li key={item.id} className="kalender-grid__day-popup-item">
                          {item.warna_label && (
                            <span
                              className="kalender-grid__day-popup-dot"
                              style={{ backgroundColor: item.warna_label || '#0d9488' }}
                              aria-hidden
                            />
                          )}
                          <div className="kalender-grid__day-popup-item-body">
                            <div className="kalender-grid__day-popup-item-name">{item.nama_event}</div>
                            {jamStr && (
                              <div className="kalender-grid__day-popup-item-ket text-xs font-medium text-gray-600 dark:text-gray-300">
                                {jamStr}
                              </div>
                            )}
                            {item.keterangan && (
                              <div className="kalender-grid__day-popup-item-ket">{item.keterangan}</div>
                            )}
                          </div>
                        </li>
                        )
                      })}
                    </ul>
                  )}
                </div>
                <div className="kalender-grid__day-popup-footer">
                  <button
                    type="button"
                    className="kalender-grid__day-popup-tambah"
                    disabled={!canTambahPribadi}
                    title={
                      !canTambahPribadi
                        ? 'Login untuk menambah jadwal pribadi (hanya Anda yang melihatnya)'
                        : 'Tambah jadwal pribadi di tanggal ini'
                    }
                    onClick={(e) => {
                      e.stopPropagation()
                      if (!onRequestTambahPribadi || !canTambahPribadi) return
                      const d = Number(popup.day)
                      const iso = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
                      const hijriStr = hijriMap[iso]
                      let hijri = null
                      if (hijriStr && hijriStr !== '0000-00-00') {
                        const [hy, hm, hd] = hijriStr.split('-').map((x) => parseInt(x, 10))
                        hijri = { day: hd, month: hm, year: hy }
                      }
                      onRequestTambahPribadi({
                        defaultKategori: 'masehi',
                        gregorian: { day: d, month, year },
                        hijri
                      })
                      closePopup()
                    }}
                  >
                    <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                    </svg>
                    Tambah jadwal saya
                  </button>
                </div>
              </div>
            </motion.div>
            );
          })()}
        </AnimatePresence>,
        document.body
      )}
    </div>
  )
}
