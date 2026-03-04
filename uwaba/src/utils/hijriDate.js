import { getSlimApiUrl } from '../services/api'

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
    return {
      masehi: data.masehi || tanggalMasehi,
      hijriyah: (data.hijriyah && data.hijriyah !== '0000-00-00') ? data.hijriyah : '-'
    }
  } catch (_) {
    return fallback
  }
}

