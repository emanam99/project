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
  
  // Generate cache key berdasarkan type
  const cacheKey = type === 'id' 
    ? `id_${data}_${size}` 
    : `url_${data}_${size}`
  
  // Cek cache dulu
  if (qrCodeCache.has(cacheKey)) {
    return qrCodeCache.get(cacheKey)
  }
  
  // Generate QR code URL
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(data)}`
  
  // Simpan ke cache
  qrCodeCache.set(cacheKey, qrCodeUrl)
  
  return qrCodeUrl
}

/**
 * Generate QR code untuk santri berdasarkan ID
 * @param {string|number} santriId - ID santri
 * @param {string} path - Path setelah /public/ (default: 'santri')
 * @param {number} size - Ukuran QR code (default: 100)
 * @returns {string} QR code image URL
 */
export const getSantriQrCode = (santriId, path = 'santri', size = 100) => {
  if (!santriId) return ''
  
  const qrUrl = `${window.location.origin}/public/${path}?id=${santriId}`
  return getQrCodeUrl(qrUrl, size, 'url')
}

/**
 * Clear cache (optional, untuk memory management)
 */
export const clearQrCodeCache = () => {
  qrCodeCache.clear()
}

/**
 * Get cache size (untuk debugging)
 */
export const getCacheSize = () => {
  return qrCodeCache.size
}
