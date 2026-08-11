/**
 * Tanggal Masehi & Hijriyah — GET publik di backend Slim (sama logika psa___kalender + maghrib).
 * Wajib memakai base API (VITE_API_BASE_URL / getSlimApiUrl) agar tidak kena CORS dari subdomain daftar.
 */
import { getSlimApiUrl } from '../services/api'

function kalenderTodayUrl() {
  return `${getSlimApiUrl()}/kalender?action=today`
}

/**
 * Mengambil tanggal Masehi dan Hijriyah dari API
 * @returns {Promise<{masehi: string, hijriyah: string}>}
 */
export async function getTanggalFromAPI() {
  try {
    const response = await fetch(kalenderTodayUrl())
    if (!response.ok) {
      throw new Error('Gagal fetch kalender')
    }
    const data = await response.json()
    return {
      masehi: data.masehi || '-',
      hijriyah: data.hijriyah || '-'
    }
  } catch (error) {
    console.error('Error fetching tanggal from API:', error)
    return {
      masehi: '-',
      hijriyah: '-'
    }
  }
}
