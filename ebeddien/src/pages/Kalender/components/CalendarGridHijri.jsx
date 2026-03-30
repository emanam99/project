import { useMemo, useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { calculatePasaran } from '../utils/pasaran'
import { toArabicDigits } from '../utils/arabicDigits'
import { HIJRI_DAY_HEADERS } from '../utils/constants'
import { getGridClassName, getGridLineStyle } from '../utils/gridView'
import { getBulanName } from '../utils/bulanHijri'
import { INDONESIAN_MONTHS } from '../utils/dateRange'
import { matchesHariPentingHijriCalendar } from '../utils/hariPentingMatch'
import { formatJamRangeLabel } from '../utils/hariPentingJam'
import './CalendarGrid.css'

/**
 * monthData: { tahun, id_bulan, mulai, akhir }
 * showGregorian: tampilkan tanggal Masehi di bawah tanggal Hijriyah
 * showPasaran: tampilkan pasaran Jawa
 * gridViewSettings: { showDateBox, showHorizontalLines, showVerticalLines }
 * showHariPentingMarkers: tampilkan penanda hari penting di kotak tanggal
 * hariPentingByDay: { [day]: string[] } warna per tanggal
 * hariPentingList: array penuh untuk popup rincian
 */
export default function CalendarGridHijri({
  monthData,
  showGregorian = true,
  showPasaran = true,
  gridViewSettings,
  showHariPentingMarkers = false,
  hariPentingByDay = {},
  hariPentingList = [],
  onRequestTambahPribadi,
  canTambahPribadi = false
}) {
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
    if (!popup.open || popup.day == null || !monthData?.mulai) return []
    const day = Number(popup.day)
    const startDate = new Date(monthData.mulai)
    const popupGregorianDate = new Date(startDate)
    popupGregorianDate.setDate(startDate.getDate() + (day - 1))
    const gregDay = popupGregorianDate.getDate()
    const gregMonth = popupGregorianDate.getMonth() + 1
    const gregYear = popupGregorianDate.getFullYear()
    const hijriBulan = monthData.id_bulan != null ? Number(monthData.id_bulan) : null
    const hijriYear = monthData.tahun != null ? Number(monthData.tahun) : null
    return hariPentingList.filter((item) =>
      matchesHariPentingHijriCalendar(day, hijriBulan, hijriYear, gregDay, gregMonth, gregYear, item)
    )
  }, [popup.open, popup.day, hariPentingList, monthData])
  const { headers, emptyCount, days } = useMemo(() => {
    if (!monthData || !monthData.mulai || !monthData.akhir) {
      return { headers: HIJRI_DAY_HEADERS, emptyCount: 0, days: [] }
    }
    const startDate = new Date(monthData.mulai)
    const endDate = new Date(monthData.akhir)
    const daysInMonth = Math.floor((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1
    const startDay = startDate.getDay()
    const emptyCount = startDay

    const dayCells = []
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
    const hour = now.getHours()
    const minute = now.getMinutes()
    const afterMaghrib = hour > 17 || (hour === 17 && minute >= 30)
    const todayForHijri = new Date(today)
    if (afterMaghrib) todayForHijri.setDate(todayForHijri.getDate() + 1)

    for (let day = 1; day <= daysInMonth; day++) {
      const dayDate = new Date(startDate)
      dayDate.setDate(startDate.getDate() + (day - 1))
      const dayDateCompare = new Date(dayDate.getFullYear(), dayDate.getMonth(), dayDate.getDate(), 0, 0, 0, 0)
      const isToday = dayDateCompare.getTime() === todayForHijri.getTime()
      const pasaran = showPasaran ? calculatePasaran(dayDate) : null
      dayCells.push({
        day,
        dayDate,
        isToday,
        gregorianDate: dayDate.getDate(),
        pasaran
      })
    }

    return {
      headers: HIJRI_DAY_HEADERS,
      emptyCount,
      days: dayCells
    }
  }, [monthData, showPasaran])

  if (!monthData) return null

  const gridClassName = getGridClassName(gridViewSettings, 'kalender-grid kalender-grid--hijri')
  const gridLineStyle = gridViewSettings ? getGridLineStyle(gridViewSettings) : undefined

  const bulanName = getBulanName(monthData.id_bulan, 'hijriyah')

  const popupMasehiDate = useMemo(() => {
    if (!popup.open || popup.day == null || !monthData?.mulai) return null
    const start = new Date(monthData.mulai)
    const d = new Date(start)
    d.setDate(start.getDate() + (Number(popup.day) - 1))
    return d
  }, [popup.open, popup.day, monthData?.mulai])

  const popupPlacement = useMemo(() => {
    if (typeof window === 'undefined' || !popup.rect) return { showAbove: false, style: {}, initial: {}, exit: {} }
    const spaceBelow = window.innerHeight - popup.rect.bottom - 8
    const showAbove = spaceBelow < 220
    const left = Math.max(8, Math.min(popup.rect.left, window.innerWidth - 296))
    if (showAbove) {
      return {
        showAbove: true,
        style: {
          position: 'fixed',
          left,
          bottom: window.innerHeight - popup.rect.top + 6,
          zIndex: 9999,
          maxHeight: `${Math.max(160, popup.rect.top - 14)}px`
        },
        initial: { opacity: 0, scale: 0.92, y: -6 },
        exit: { opacity: 0, scale: 0.96, y: -4 }
      }
    }
    return {
      showAbove: false,
      style: {
        position: 'fixed',
        left,
        top: popup.rect.bottom + 6,
        zIndex: 9999,
        maxHeight: `${Math.max(160, window.innerHeight - popup.rect.bottom - 14)}px`
      },
      initial: { opacity: 0, scale: 0.92, y: 6 },
      exit: { opacity: 0, scale: 0.96, y: 4 }
    }
  }, [popup.rect])

  const popupEl = typeof document !== 'undefined' && (
    <AnimatePresence>
      {popup.open && popup.rect != null && (
        <motion.div
          key="hijri-day-popup"
          className="kalender-grid__day-popup"
          role="dialog"
          aria-modal="true"
          aria-labelledby="kalender-popup-title"
          style={popupPlacement.style}
          initial={popupPlacement.initial}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={popupPlacement.exit}
          transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="kalender-grid__day-popup-inner">
        <div className="kalender-grid__day-popup-header">
          <div className="kalender-grid__day-popup-header-text">
            <h3 id="kalender-popup-title" className="kalender-grid__day-popup-title">
              {popup.day} {bulanName} {monthData.tahun} H
            </h3>
            {popupMasehiDate && (
              <p className="kalender-grid__day-popup-subtitle">
                {popupMasehiDate.getDate()} {INDONESIAN_MONTHS[popupMasehiDate.getMonth()]} {popupMasehiDate.getFullYear()}
              </p>
            )}
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
              if (!onRequestTambahPribadi || !canTambahPribadi || popup.day == null || !monthData?.mulai) return
              const startDate = new Date(monthData.mulai)
              const popupGregorianDate = new Date(startDate)
              popupGregorianDate.setDate(startDate.getDate() + (Number(popup.day) - 1))
              const hijriBulan = monthData.id_bulan != null ? Number(monthData.id_bulan) : null
              const hijriYear = monthData.tahun != null ? Number(monthData.tahun) : null
              onRequestTambahPribadi({
                defaultKategori: 'hijriyah',
                hijri:
                  hijriBulan != null && hijriYear != null
                    ? { day: Number(popup.day), month: hijriBulan, year: hijriYear }
                    : null,
                gregorian: {
                  day: popupGregorianDate.getDate(),
                  month: popupGregorianDate.getMonth() + 1,
                  year: popupGregorianDate.getFullYear()
                }
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
      )}
    </AnimatePresence>
  )

  return (
    <>
      {popupEl && createPortal(popupEl, document.body)}
      <div className={gridClassName} style={gridLineStyle} dir="rtl">
      {headers.map((label) => (
        <div key={label} className="kalender-grid__header">
          {label}
        </div>
      ))}
      {Array.from({ length: emptyCount }).map((_, i) => (
        <div key={`empty-${i}`} className="kalender-grid__empty" />
      ))}
      {days.map((d, i) => {
        const markerColors = showHariPentingMarkers && hariPentingByDay[d.day] ? hariPentingByDay[d.day] : []
        const itemsOnDay = (() => {
          const day = d.day
          const gregDay = d.dayDate.getDate()
          const gregMonth = d.dayDate.getMonth() + 1
          const gregYear = d.dayDate.getFullYear()
          const hijriBulan = monthData.id_bulan != null ? Number(monthData.id_bulan) : null
          const hijriYear = monthData.tahun != null ? Number(monthData.tahun) : null
          return hariPentingList.filter((item) =>
            matchesHariPentingHijriCalendar(day, hijriBulan, hijriYear, gregDay, gregMonth, gregYear, item)
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
            data-hijri-date={`${d.day}-${monthData.id_bulan}-${monthData.tahun}`}
            data-greg-date={`${d.dayDate.getDate()}-${d.dayDate.getMonth() + 1}-${d.dayDate.getFullYear()}`}
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
            <div className="kalender-grid__day-row kalender-grid__day-row--hijri">
              {showGregorian && (
                <div className="kalender-grid__day-greg">{d.gregorianDate}</div>
              )}
              <div className="kalender-grid__day-hijri">{toArabicDigits(d.day)}</div>
            </div>
            {d.pasaran && (
              <div className="kalender-grid__day-pasaran">{d.pasaran}</div>
            )}
          </div>
        )
      })}
      </div>
    </>
  )
}
