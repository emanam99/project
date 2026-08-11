import { useMemo } from 'react'
import type { KalenderMonthRow } from '../../../api/kalenderApi'
import { calculatePasaran } from '../utils/pasaran'
import { toArabicDigits } from '../utils/arabicDigits'
import { HIJRI_DAY_HEADERS } from '../utils/constants'
import { getGridClassName, getGridLineStyle, type GridViewSettings } from '../utils/gridView'
import './CalendarGrid.css'

type Props = {
  monthData: KalenderMonthRow
  showGregorian?: boolean
  showPasaran?: boolean
  gridViewSettings?: GridViewSettings | null
}

export default function CalendarGridHijri({
  monthData,
  showGregorian = true,
  showPasaran = true,
  gridViewSettings,
}: Props) {
  const { emptyCount, days } = useMemo(() => {
    if (!monthData?.mulai || !monthData?.akhir) {
      return { emptyCount: 0, days: [] as Array<{
        day: number
        dayDate: Date
        isToday: boolean
        gregorianDate: number
        pasaran: string | null
      }> }
    }

    const startDate = new Date(monthData.mulai)
    const endDate = new Date(monthData.akhir)
    const daysInMonth = Math.floor((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1
    const emptyCount = startDate.getDay()

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
        pasaran,
      })
    }

    return { emptyCount, days: dayCells }
  }, [monthData, showPasaran])

  if (!monthData) return null

  const gridClassName = getGridClassName(gridViewSettings, 'kalender-grid kalender-grid--hijri')
  const gridLineStyle = gridViewSettings ? getGridLineStyle(gridViewSettings) : undefined

  return (
    <div className={gridClassName} style={gridLineStyle} dir="rtl">
      {HIJRI_DAY_HEADERS.map((label) => (
        <div key={label} className="kalender-grid__header">
          {label}
        </div>
      ))}
      {Array.from({ length: emptyCount }).map((_, i) => (
        <div key={`empty-${i}`} className="kalender-grid__empty" />
      ))}
      {days.map((d, i) => (
        <div
          key={i}
          className={`kalender-grid__day ${d.isToday ? 'kalender-grid__day--today' : ''}`}
          data-hijri-date={`${d.day}-${monthData.id_bulan}-${monthData.tahun}`}
          data-greg-date={`${d.dayDate.getDate()}-${d.dayDate.getMonth() + 1}-${d.dayDate.getFullYear()}`}
        >
          <div className="kalender-grid__day-row kalender-grid__day-row--hijri">
            {showGregorian && <div className="kalender-grid__day-greg">{d.gregorianDate}</div>}
            <div className="kalender-grid__day-hijri">{toArabicDigits(d.day)}</div>
          </div>
          {d.pasaran && <div className="kalender-grid__day-pasaran">{d.pasaran}</div>}
        </div>
      ))}
    </div>
  )
}
