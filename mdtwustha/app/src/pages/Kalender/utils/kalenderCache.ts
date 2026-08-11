import type { KalenderMonthRow, KalenderToday } from '../../../api/kalenderApi'

const CACHE_TODAY_TTL_MS = 10 * 60 * 1000
const CACHE_YEAR_TTL_MS = 30 * 60 * 1000
const CACHE_CONVERT_TTL_MS = 24 * 60 * 60 * 1000

let todayCache: { tanggal: string | null; data: KalenderToday | null; ts: number } = {
  tanggal: null,
  data: null,
  ts: 0,
}
const yearCache = new Map<number, { data: KalenderMonthRow[]; ts: number }>()
const convertCache = new Map<string, { hijriyah: string; ts: number }>()

export function getTodayCache(tanggal: string): KalenderToday | null {
  if (!todayCache.data || todayCache.tanggal !== tanggal) return null
  if (Date.now() - todayCache.ts > CACHE_TODAY_TTL_MS) return null
  return todayCache.data
}

export function setTodayCache(tanggal: string, data: KalenderToday) {
  todayCache = { tanggal, data, ts: Date.now() }
}

export function getYearCache(year: number): KalenderMonthRow[] | null {
  const entry = yearCache.get(year)
  if (!entry || Date.now() - entry.ts > CACHE_YEAR_TTL_MS) return null
  return entry.data
}

export function setYearCache(year: number, data: KalenderMonthRow[]) {
  yearCache.set(year, { data, ts: Date.now() })
}

export function getConvertCache(isoDate: string): string | null {
  const entry = convertCache.get(isoDate)
  if (!entry || Date.now() - entry.ts > CACHE_CONVERT_TTL_MS) return null
  return entry.hijriyah
}

export function setConvertCache(isoDate: string, hijriyah: string) {
  if (hijriyah && hijriyah !== '0000-00-00') {
    convertCache.set(isoDate, { hijriyah, ts: Date.now() })
  }
}
