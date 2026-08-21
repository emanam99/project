import {
  getMybeddienBiodataUrl,
  getMybeddienShohifahUrl,
  getMybeddienIjinUrl,
  getMybeddienKwitansiQrUrl,
} from '../config/mybeddienAppUrl'

// Cache untuk QR code berdasarkan URL atau ID
const qrCodeCache = new Map()

/**
 * Generate QR code URL dengan caching
 * @param {string} data - Data untuk QR code (URL atau ID)
 * @param {number} size - Ukuran QR code (default: 100)
 * @param {string} type - Type cache key: 'id' untuk ID santri, 'url' untuk full URL (default: 'url')
 * @returns {string} QR code image URL
 */
export const getQrCodeUrl = (data, size = 100, type = 'url') => {
  if (!data) return ''

  const cacheKey = type === 'id' ? `id_${data}_${size}` : `url_${data}_${size}`

  if (qrCodeCache.has(cacheKey)) {
    return qrCodeCache.get(cacheKey)
  }

  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(data)}`
  qrCodeCache.set(cacheKey, qrCodeUrl)
  return qrCodeUrl
}

/**
 * URL tujuan QR santri (myBeddien), bukan /public/* eBeddien.
 * @param {string|number} santriId
 * @param {string} path - santri|shohifah|ijin|uwaba|khusus|tunggakan|pendaftaran
 */
export function resolveSantriQrTargetUrl(santriId, path = 'santri') {
  if (!santriId) return ''
  const identity = { id: santriId }
  switch (path) {
    case 'shohifah':
      return getMybeddienShohifahUrl(identity)
    case 'ijin':
      return getMybeddienIjinUrl(identity)
    case 'uwaba':
    case 'khusus':
    case 'tunggakan':
    case 'pendaftaran':
      return getMybeddienKwitansiQrUrl(path, identity)
    case 'santri':
    case 'biodata':
    default:
      return getMybeddienBiodataUrl(identity)
  }
}

/**
 * Generate QR code untuk santri berdasarkan ID → myBeddien.
 * @param {string|number} santriId - ID santri
 * @param {string} path - Tujuan: santri/biodata, shohifah, ijin, dll.
 * @param {number} size - Ukuran QR code (default: 100)
 */
export const getSantriQrCode = (santriId, path = 'santri', size = 100) => {
  if (!santriId) return ''
  const qrUrl = resolveSantriQrTargetUrl(santriId, path)
  return getQrCodeUrl(qrUrl, size, 'url')
}

export const clearQrCodeCache = () => {
  qrCodeCache.clear()
}

export const getCacheSize = () => {
  return qrCodeCache.size
}
