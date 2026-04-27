const LS_MIRROR_KEY = 'nailul_murod_penanggalan_today_v1'
const API_BASE = (import.meta.env.VITE_API_BASE || '/api').replace(/\/$/, '')

export const BULAN_MASEHI = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
]

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

export const HARI_INDONESIA = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']

export function getMasehiKeyHariIni() {
  return new Date().toISOString().slice(0, 10)
}

export function getHariIndonesia(date = new Date()) {
  return HARI_INDONESIA[date.getDay()] || ''
}

export function formatJamDetik(date = new Date()) {
  const h = String(date.getHours()).padStart(2, '0')
  const m = String(date.getMinutes()).padStart(2, '0')
  const s = String(date.getSeconds()).padStart(2, '0')
  return `${h}:${m}:${s}`
}

export function formatDDMMMMYYYY(ymd: string | null | undefined, monthList: string[]) {
  if (!ymd || ymd === '0000-00-00') return null
  const parts = String(ymd).trim().split('-')
  if (parts.length !== 3) return null
  const [y, m, d] = parts
  const monthIndex = Number(m) - 1
  const monthName = monthList[monthIndex] || m
  const day = Number(d)
  return `${day} ${monthName} ${y}`
}

export function readTodayPenanggalanSync() {
  try {
    if (typeof window === 'undefined') return null
    const key = getMasehiKeyHariIni()
    const raw = localStorage.getItem(LS_MIRROR_KEY)
    if (!raw) return null
    const o = JSON.parse(raw) as { tanggalMasehi?: string; masehi?: string; hijriyah?: string } | null
    if (!o || o.tanggalMasehi !== key) return null
    if (!o.hijriyah || o.hijriyah === '-' || o.hijriyah === '0000-00-00') return null
    return { masehi: (o.masehi || key).slice(0, 10), hijriyah: String(o.hijriyah).slice(0, 10) }
  } catch {
    return null
  }
}

function writeTodayMirror(record: { masehi: string; hijriyah: string }) {
  try {
    if (typeof window === 'undefined') return
    const tanggal = String(record.masehi || '').slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) return
    if (!record.hijriyah || record.hijriyah === '-' || record.hijriyah === '0000-00-00') return
    localStorage.setItem(
      LS_MIRROR_KEY,
      JSON.stringify({
        tanggalMasehi: tanggal,
        masehi: tanggal,
        hijriyah: String(record.hijriyah).slice(0, 10),
        savedAt: Date.now(),
      })
    )
  } catch {
    // ignore quota/private mode errors
  }
}

export function getBootPenanggalanPair() {
  const masehi = getMasehiKeyHariIni()
  const sync = readTodayPenanggalanSync()
  if (sync?.hijriyah) return { masehi: sync.masehi, hijriyah: sync.hijriyah }
  return { masehi, hijriyah: '' }
}

export async function getTanggalFromAPI() {
  const now = new Date()
  const tanggalMasehi = now.toISOString().slice(0, 10)
  const waktu = now.toTimeString().slice(0, 8)
  const fallback = { masehi: tanggalMasehi, hijriyah: '-' }

  if (!API_BASE) return fallback
  try {
    const apiUrl = `${API_BASE}/kalender?action=today&tanggal=${encodeURIComponent(tanggalMasehi)}&waktu=${encodeURIComponent(waktu)}`
    const response = await fetch(apiUrl, { method: 'GET', headers: { Accept: 'application/json' } })
    if (!response.ok) return fallback
    const data = (await response.json()) as { masehi?: string; hijriyah?: string }
    const out = {
      masehi: (data.masehi || tanggalMasehi).slice(0, 10),
      hijriyah:
        data.hijriyah && data.hijriyah !== '-' && data.hijriyah !== '0000-00-00'
          ? data.hijriyah.slice(0, 10)
          : '-',
    }
    if (out.hijriyah !== '-') {
      writeTodayMirror({ masehi: out.masehi, hijriyah: out.hijriyah })
    }
    return out
  } catch {
    return fallback
  }
}

export function getTimeGreeting() {
  const h = new Date().getHours()
  if (h >= 4 && h < 11) return 'Pagi'
  if (h >= 11 && h < 15) return 'Siang'
  if (h >= 15 && h < 18) return 'Sore'
  return 'Malam'
}
