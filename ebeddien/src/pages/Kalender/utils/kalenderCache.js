/**
 * Cache in-memory untuk data kalender agar buka lagi tidak selalu request ke server.
 * Today: TTL 10 menit per tanggal. Year: TTL 30 menit per tahun. Convert: TTL 24 jam per tanggal.
 */

const CACHE_TODAY_TTL_MS = 10 * 60 * 1000   // 10 menit
const CACHE_YEAR_TTL_MS = 30 * 60 * 1000   // 30 menit
const CACHE_CONVERT_TTL_MS = 24 * 60 * 60 * 1000  // 24 jam

let todayCache = { tanggal: null, data: null, ts: 0 }
const yearCache = new Map() // year -> { data, ts }
const convertCache = new Map() // isoDate -> { hijriyah, ts }

export function getTodayCache(tanggal) {
  if (!todayCache.data || todayCache.tanggal !== tanggal) return null
  if (Date.now() - todayCache.ts > CACHE_TODAY_TTL_MS) return null
  return todayCache.data
}

export function setTodayCache(tanggal, data) {
  todayCache = { tanggal, data, ts: Date.now() }
}

export function getYearCache(year) {
  const entry = yearCache.get(year)
  if (!entry || Date.now() - entry.ts > CACHE_YEAR_TTL_MS) return null
  return entry.data
}

export function setYearCache(year, data) {
  yearCache.set(year, { data, ts: Date.now() })
}

/** Cache hasil convert Masehi->Hijri per tanggal (agar tanggal hijri kecil di tab Masehi langsung muncul) */
export function getConvertCache(isoDate) {
  const entry = convertCache.get(isoDate)
  if (!entry || Date.now() - entry.ts > CACHE_CONVERT_TTL_MS) return null
  return entry.hijriyah
}

export function setConvertCache(isoDate, hijriyah) {
  if (hijriyah && hijriyah !== '0000-00-00') {
    convertCache.set(isoDate, { hijriyah, ts: Date.now() })
  }
}
