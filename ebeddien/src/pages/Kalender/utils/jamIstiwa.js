import { getTimes } from 'suncalc'

/** Default pondok Beddian — selaras KalenderIstiwa.php / absen___alamat */
export const ISTIWA_DEFAULT_LAT = -7.9955854
export const ISTIWA_DEFAULT_LNG = 113.8443946
export const ISTIWA_DEFAULT_LABEL =
  'Beddian RT 29 RW 06, Jambesari, Jambesari Darus Sholah, Bondowoso'

function jakartaYmd(d) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(d)
  const get = (t) => parts.find((p) => p.type === t)?.value || ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

function noonJakartaDate(d) {
  return new Date(`${jakartaYmd(d)}T12:00:00+07:00`)
}

/** 12 jam — hari Istiwa’ dimulai di zawal (siang), bukan tengah malam. */
const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000

/**
 * Offset matahari sejati (ms): 12:00 WIB minus solar noon.
 * Positif = Istiwa’ (setelah geser 12 jam) lebih maju daripada WIB.
 */
export function istiwaSolarOffsetMs(now, lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return 0
  const times = getTimes(now, lat, lng)
  const solarNoon = times?.solarNoon
  if (!(solarNoon instanceof Date) || Number.isNaN(solarNoon.getTime())) return 0
  return noonJakartaDate(now).getTime() - solarNoon.getTime()
}

/**
 * Offset ms dari WIB ke jam Istiwa’ (tampilan).
 * Waktu matahari sejati, lalu mundur 12 jam agar 00:00 di siang (zawal).
 */
export function istiwaOffsetMs(now, lat, lng) {
  return istiwaSolarOffsetMs(now, lat, lng) - TWELVE_HOURS_MS
}

/** Contoh: WIB ke Ist (+ 00.34) */
export function formatWibKeIstSelisih(solarOffsetMs) {
  const ms = Number.isFinite(solarOffsetMs) ? solarOffsetMs : 0
  const sign = ms >= 0 ? '+' : '-'
  let totalMin = Math.round(Math.abs(ms) / 60000)
  const hours = Math.floor(totalMin / 60)
  const minutes = totalMin % 60
  const hh = String(hours).padStart(2, '0')
  const mm = String(minutes).padStart(2, '0')
  return `WIB ke Ist (${sign} ${hh}.${mm})`
}

/** @param {Date} d @param {12|24} [hourCycle] 12 = jam 01–12, 24 = jam 00–23 */
export function formatHmsJakarta(d, hourCycle = 24) {
  const use12 = hourCycle === 12
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jakarta',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: use12,
    hourCycle: use12 ? 'h12' : 'h23'
  }).formatToParts(d)
  const get = (t) => parts.find((p) => p.type === t)?.value || '00'
  return `${get('hour')}:${get('minute')}:${get('second')}`
}

export function formatAlamatMarquee(data) {
  if (!data || typeof data !== 'object') return ''
  const dusun = String(data.dusun || '').trim()
  const rt = String(data.rt || '').trim()
  const rw = String(data.rw || '').trim()
  const desa = String(data.desa || '').trim()
  const kecamatan = String(data.kecamatan || '').trim()
  const kabupaten = String(data.kabupaten || data.kota || '').trim()
  const provinsi = String(data.provinsi || '').trim()
  const parts = []
  if (dusun) parts.push(dusun)
  if (rt || rw) {
    const rtRw = [rt ? `RT ${rt}` : '', rw ? `RW ${rw}` : ''].filter(Boolean).join(', ')
    if (rtRw) parts.push(rtRw)
  }
  if (desa) parts.push(desa)
  if (kecamatan) parts.push(kecamatan)
  if (kabupaten) parts.push(kabupaten)
  if (provinsi) parts.push(provinsi)
  if (parts.length) return parts.join(', ')
  return String(data.display_name || '').trim()
}
