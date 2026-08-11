import { getBulanName } from './bulanHijri'

export const INDONESIAN_MONTHS = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
]

export function formatDateRange(start: Date, end: Date): string {
  if (!start || !end) return ''
  const s = new Date(start)
  const e = new Date(end)
  if (s.getFullYear() === e.getFullYear()) {
    if (s.getMonth() === e.getMonth()) {
      return `${s.getDate()} - ${e.getDate()} ${INDONESIAN_MONTHS[s.getMonth()]} ${s.getFullYear()}`
    }
    return `${s.getDate()} ${INDONESIAN_MONTHS[s.getMonth()]} - ${e.getDate()} ${INDONESIAN_MONTHS[e.getMonth()]} ${s.getFullYear()}`
  }
  return `${s.getDate()} ${INDONESIAN_MONTHS[s.getMonth()]} ${s.getFullYear()} - ${e.getDate()} ${INDONESIAN_MONTHS[e.getMonth()]} ${e.getFullYear()}`
}

export function formatDateRangeHijri(startYmd: string, endYmd: string): string {
  if (!startYmd || !endYmd || startYmd.length < 10 || endYmd.length < 10) return ''
  const [y1, m1, d1] = startYmd.slice(0, 10).split('-').map(Number)
  const [y2, m2, d2] = endYmd.slice(0, 10).split('-').map(Number)
  const bulan1 = getBulanName(m1, 'hijriyah')
  const bulan2 = getBulanName(m2, 'hijriyah')
  if (y1 === y2 && m1 === m2) return `${d1} - ${d2} ${bulan1} ${y1} H`
  if (y1 === y2) return `${d1} ${bulan1} - ${d2} ${bulan2} ${y1} H`
  return `${d1} ${bulan1} ${y1} - ${d2} ${bulan2} ${y2} H`
}
