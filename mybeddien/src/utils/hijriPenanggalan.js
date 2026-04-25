import { getApiBaseUrl } from '../services/api'

const LS_MIRROR_KEY = 'mybeddien_penanggalan_today_mirror_v1'

/** Kunci tanggal Masehi (Y-m-d) UTC — selaras pemanggilan API kalender */
export function getMasehiKeyHariIni() {
  return new Date().toISOString().slice(0, 10)
}

export function readTodayPenanggalanSync() {
  try {
    if (typeof window === 'undefined') return null
    const key = getMasehiKeyHariIni()
    const raw = localStorage.getItem(LS_MIRROR_KEY)
    if (!raw) return null
    const o = JSON.parse(raw)
    if (!o || o.tanggalMasehi !== key) return null
    const h = o.hijriyah
    if (!h || h === '-' || h === '0000-00-00') return null
    return { masehi: (o.masehi || key).slice(0, 10), hijriyah: String(h).slice(0, 10) }
  } catch {
    return null
  }
}

export function writeTodayMirror(record) {
  try {
    if (typeof window === 'undefined' || !record) return
    const tanggal = String(record.masehi || record.tanggalMasehi || '').slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) return
    const h = record.hijriyah
    if (!h || h === '-' || h === '0000-00-00') return
    localStorage.setItem(
      LS_MIRROR_KEY,
      JSON.stringify({
        tanggalMasehi: tanggal,
        masehi: tanggal,
        hijriyah: String(h).slice(0, 10),
        savedAt: Date.now(),
      })
    )
  } catch {
    /* quota / private mode */
  }
}

/** Boot: mirror hari ini atau Masehi saja (hijriyah null) */
export function getBootPenanggalanPair() {
  const masehi = getMasehiKeyHariIni()
  const s = readTodayPenanggalanSync()
  if (s?.hijriyah) return { masehi: s.masehi, hijriyah: s.hijriyah }
  return { masehi, hijriyah: null }
}

/**
 * Tanggal hari ini dari API kalender publik (sama kontrak dengan eBeddien).
 * @returns {Promise<{ masehi: string, hijriyah: string }>}
 */
export async function fetchKalenderToday() {
  const now = new Date()
  const tanggalMasehi = now.toISOString().slice(0, 10)
  const waktu = now.toTimeString().slice(0, 8)
  const fallback = { masehi: tanggalMasehi, hijriyah: '-' }

  const base = typeof getApiBaseUrl === 'function' ? String(getApiBaseUrl()).replace(/\/$/, '') : ''
  if (!base) return fallback

  try {
    const apiUrl = `${base}/kalender?action=today&tanggal=${encodeURIComponent(tanggalMasehi)}&waktu=${encodeURIComponent(waktu)}`
    const response = await fetch(apiUrl, { credentials: 'include' })
    if (!response.ok) return fallback
    const data = await response.json()
    const out = {
      masehi: data.masehi || tanggalMasehi,
      hijriyah: data.hijriyah && data.hijriyah !== '0000-00-00' ? String(data.hijriyah).slice(0, 10) : '-',
    }
    if (out.hijriyah !== '-') {
      writeTodayMirror({ masehi: out.masehi, hijriyah: out.hijriyah })
    }
    return out
  } catch {
    return fallback
  }
}

/** Format Y-m-d → "dd NamaBulan yyyy" */
export function formatYmdKeNamaBulan(ymd, monthList) {
  if (!ymd || ymd === '0000-00-00') return null
  const parts = String(ymd).trim().split('-')
  if (parts.length !== 3) return null
  const [y, m, d] = parts
  const monthIndex = parseInt(m, 10) - 1
  const monthName = monthList[monthIndex] || m
  const day = parseInt(d, 10)
  return `${day} ${monthName} ${y}`
}

export const BULAN_HIJRIYAH = [
  'Muharram',
  'Safar',
  'Rabiul Awal',
  'Rabiul Akhir',
  'Jumadil Awal',
  'Jumadil Akhir',
  'Rajab',
  "Sya'ban",
  'Ramadhan',
  'Syawal',
  "Dzulqa'dah",
  'Dzulhijjah',
]

let hijriFetchPromise = null

/** Satu request bersama untuk Beranda + header */
export function ensureHijriTodayFetched() {
  const sync = readTodayPenanggalanSync()
  if (sync?.hijriyah) return Promise.resolve(sync)
  if (!hijriFetchPromise) {
    hijriFetchPromise = fetchKalenderToday()
      .then((r) => ({ masehi: r.masehi, hijriyah: r.hijriyah !== '-' ? r.hijriyah : null }))
      .finally(() => {
        hijriFetchPromise = null
      })
  }
  return hijriFetchPromise
}

/** GET /version di stack publik yang sama (base …/api/public/api + /version) */
export async function fetchApiVersionString() {
  const base = typeof getApiBaseUrl === 'function' ? String(getApiBaseUrl()).replace(/\/$/, '') : ''
  if (!base) return null
  try {
    const r = await fetch(`${base}/version`, { credentials: 'include' })
    if (!r.ok) return null
    const data = await r.json()
    const v = data?.version
    return typeof v === 'string' && v.trim() ? v.trim() : null
  } catch {
    return null
  }
}
