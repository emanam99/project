/**
 * Mengambil tanggal Masehi dan Hijriyah dari API
 * Menggunakan API yang sama dengan versi sebelumnya
 */

const KALENDER_API_URL = 'https://alutsmani.id/psa/kalender/api/kalender.php?action=today'

/**
 * Mengambil tanggal Masehi dan Hijriyah dari API
 * @returns {Promise<{masehi: string, hijriyah: string}>}
 */
export async function getTanggalFromAPI() {
  try {
    const response = await fetch(KALENDER_API_URL)
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
