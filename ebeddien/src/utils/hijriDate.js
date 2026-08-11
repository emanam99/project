import { getSlimApiUrl, kalenderAPI } from '../services/api'
import { writeTodayMirror, idbPutToday } from '../services/hijriPenanggalanStorage'
import { setTodayCache } from '../pages/Kalender/utils/kalenderCache'

export { getBootPenanggalanPair, readTodayPenanggalanSync } from '../services/hijriPenanggalanStorage'

/**
 * Simpan hasil "hari ini" ke memori kalender + mirror + IndexedDB (tanpa throw).
 * @param {object} data - respons API `today` (bukan array)
 */
export function persistPenanggalanHariIni(data) {
  if (!data || Array.isArray(data)) return
  const tanggal = String(data.masehi || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) return
  const h = data.hijriyah
  if (!h || h === '0000-00-00' || h === '-') return
  try {
    setTodayCache(tanggal, data)
  } catch (_) {}
  writeTodayMirror({ masehi: tanggal, hijriyah: String(h).slice(0, 10) })
  void idbPutToday(tanggal, data)
}

/**
 * Mengambil tanggal Masehi dan Hijriyah dari API aplikasi (backend yang sama dengan kalender).
 * @param {string} [baseUrl] - Base URL API (opsional; default: getSlimApiUrl())
 * @returns {Promise<{masehi: string, hijriyah: string}>}
 */
export async function getTanggalFromAPI(baseUrl) {
  const now = new Date()
  const tanggalMasehi = now.toISOString().slice(0, 10)
  const fallback = { masehi: tanggalMasehi, hijriyah: '-' }

  const url = typeof baseUrl === 'string' ? baseUrl : (typeof getSlimApiUrl === 'function' ? getSlimApiUrl() : '')
  if (!url) {
    return fallback
  }
  try {
    const waktu = now.toTimeString().slice(0, 8)
    const apiUrl = `${url.replace(/\/$/, '')}/kalender?action=today&tanggal=${encodeURIComponent(tanggalMasehi)}&waktu=${encodeURIComponent(waktu)}`
    const response = await fetch(apiUrl)
    if (!response.ok) {
      return fallback
    }
    const data = await response.json()
    const out = {
      masehi: data.masehi || tanggalMasehi,
      hijriyah: (data.hijriyah && data.hijriyah !== '0000-00-00') ? data.hijriyah : '-'
    }
    if (out.hijriyah !== '-') {
      persistPenanggalanHariIni({ ...data, masehi: out.masehi, hijriyah: out.hijriyah })
    }
    return out
  } catch (_) {
    return fallback
  }
}

/**
 * Hijriyah Y-m-d → Masehi Y-m-d (sesuai `psa___kalender`; untuk simpan ke kolom DATE).
 */
export async function hijriYmdToMasehiYmd(hijriYmd) {
  if (!hijriYmd || !/^\d{4}-\d{2}-\d{2}$/.test(String(hijriYmd))) return null
  try {
    const res = await kalenderAPI.get({ action: 'to_masehi', tanggal: String(hijriYmd).slice(0, 10) })
    const m = res?.masehi
    if (m && /^\d{4}-\d{2}-\d{2}/.test(m)) return m.slice(0, 10)
  } catch (_) {}
  return null
}

/**
 * Masehi Y-m-d → Hijriyah Y-m-d (untuk tampilan PickDateHijri saat edit / switch kategori).
 */
export async function masehiYmdToHijriYmd(masehiYmd, waktu = '12:00:00') {
  if (!masehiYmd) return null
  const tanggal = String(masehiYmd).slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) return null
  try {
    const res = await kalenderAPI.get({ action: 'convert', tanggal, waktu })
    const h = res?.hijriyah
    if (h && /^\d{4}-\d{2}-\d{2}/.test(h) && h.slice(0, 10) !== '0000-00-00') return h.slice(0, 10)
  } catch (_) {}
  return null
}
