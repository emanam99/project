import { CalculationMethod, Coordinates, Madhab, PrayerTimes } from 'adhan'

export const IMSAK_OFFSET_MINUTES = 10

export const PRAYER_SLOTS = [
  { key: 'imsak', label: 'Imsak' },
  { key: 'fajr', label: 'Subuh' },
  { key: 'thulu', label: 'Thulu’' },
  { key: 'sunrise', label: 'Terbit' },
  { key: 'dhuhr', label: 'Dzuhur' },
  { key: 'asr', label: 'Ashar' },
  { key: 'maghrib', label: 'Maghrib' },
  { key: 'isha', label: 'Isya' },
]

/** Menit ditambahkan ke hasil hisab. Thulu’ negatif (lebih awal dari terbit). */
export const DEFAULT_IKHTIYATH = {
  imsak: 3,
  fajr: 3,
  thulu: -2,
  sunrise: 3,
  dhuhr: 3,
  asr: 3,
  maghrib: 3,
  isha: 3,
}

export const IKHTIYATH_OPTIONS = [1, 2, 3, 4, 5]
export const THULU_IKHTIYATH_OPTIONS = [-1, -2, -3, -4, -5]

function jakartaYmd(d) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d)
  const get = (t) => parts.find((p) => p.type === t)?.value || ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

/** Tanggal sipil yang Y/M/D-nya sama dengan hari WIB (untuk konstruktor adhan). */
export function civilDateForJakartaDay(ref) {
  const [y, m, d] = jakartaYmd(ref).split('-').map(Number)
  return new Date(y, m - 1, d, 12, 0, 0)
}

function addJakartaDays(ref, days) {
  const [y, m, d] = jakartaYmd(ref).split('-').map(Number)
  return new Date(y, m - 1, d + days, 12, 0, 0)
}

function kemenagParams() {
  const params = CalculationMethod.Other()
  params.fajrAngle = 20
  params.ishaAngle = 18
  params.madhab = Madhab.Shafi
  return params
}

export function computePrayerTimesForDay(lat, lng, refDate) {
  const coordinates = new Coordinates(Number(lat), Number(lng))
  const date = civilDateForJakartaDay(refDate)
  const pt = new PrayerTimes(coordinates, date, kemenagParams())
  return {
    imsak: new Date(pt.fajr.getTime() - IMSAK_OFFSET_MINUTES * 60 * 1000),
    fajr: pt.fajr,
    thulu: pt.sunrise,
    sunrise: pt.sunrise,
    dhuhr: pt.dhuhr,
    asr: pt.asr,
    maghrib: pt.maghrib,
    isha: pt.isha,
  }
}

function addMinutes(d, mins) {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return d
  const n = Number(mins)
  if (!Number.isFinite(n) || n === 0) return d
  return new Date(d.getTime() + n * 60 * 1000)
}

export function normalizeIkhtiyath(raw) {
  const src = raw && typeof raw === 'object' ? raw : {}
  const out = { ...DEFAULT_IKHTIYATH }
  for (const slot of PRAYER_SLOTS) {
    const n = Number(src[slot.key])
    if (slot.key === 'thulu') {
      if (THULU_IKHTIYATH_OPTIONS.includes(n)) out.thulu = n
    } else if (IKHTIYATH_OPTIONS.includes(n)) {
      out[slot.key] = n
    }
  }
  return out
}

export function applyIkhtiyath(times, ikhtiyath) {
  const adj = normalizeIkhtiyath(ikhtiyath)
  const out = {}
  for (const [key, at] of Object.entries(times || {})) {
    out[key] = addMinutes(at, adj[key] ?? 0)
  }
  return out
}

export function buildTodaySchedule(lat, lng, now = new Date(), ikhtiyath = DEFAULT_IKHTIYATH) {
  const times = applyIkhtiyath(computePrayerTimesForDay(lat, lng, now), ikhtiyath)
  return PRAYER_SLOTS.map((slot) => ({
    key: slot.key,
    label: slot.label,
    at: times[slot.key],
  }))
}

/** Sholat/imsak berikutnya; setelah Isya → Imsak besok. */
export function findNextPrayer(lat, lng, now = new Date(), ikhtiyath = DEFAULT_IKHTIYATH) {
  const today = buildTodaySchedule(lat, lng, now, ikhtiyath)
  const upcoming = today
    .filter((row) => row.at instanceof Date && row.at.getTime() > now.getTime())
    .sort((a, b) => a.at.getTime() - b.at.getTime())[0]
  if (upcoming) return upcoming
  const tomorrow = applyIkhtiyath(computePrayerTimesForDay(lat, lng, addJakartaDays(now, 1)), ikhtiyath)
  return { key: 'imsak', label: 'Imsak', at: tomorrow.imsak }
}

/** Sisa waktu `jj:mm:dd` (jam:menit:detik). */
export function formatRemainHms(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return '00:00:00'
  const totalSec = Math.floor(ms / 1000)
  const hh = Math.floor(totalSec / 3600)
  const mm = Math.floor((totalSec % 3600) / 60)
  const ss = totalSec % 60
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
}

export function formatPrayerClock(d, hourCycle = 24) {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return '—'
  const use12 = hourCycle === 12
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jakarta',
    hour: '2-digit',
    minute: '2-digit',
    hour12: use12,
    hourCycle: use12 ? 'h12' : 'h23',
  }).formatToParts(d)
  const get = (t) => parts.find((p) => p.type === t)?.value || '00'
  if (use12) {
    const period = (parts.find((p) => p.type === 'dayPeriod')?.value || '').toLowerCase()
    return `${get('hour')}:${get('minute')} ${period}`
  }
  return `${get('hour')}:${get('minute')}`
}

export function formatJakartaDateLong(d) {
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(d)
}
