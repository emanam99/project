/**
 * Utility functions for file operations
 */

/**
 * Format file size from bytes to human readable format
 */
export const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]
}

/**
 * Get file type label from MIME type or file extension
 */
export const getFileTypeLabel = (tipeFile, namaFile) => {
  if (tipeFile) {
    if (tipeFile.startsWith('image/')) {
      const ext = namaFile?.split('.').pop()?.toUpperCase() || 'IMAGE'
      return ext === 'JPG' ? 'JPEG' : ext
    }
    if (tipeFile === 'application/pdf') return 'PDF'
    return tipeFile.split('/')[1]?.toUpperCase() || 'FILE'
  }
  const ext = namaFile?.split('.').pop()?.toUpperCase() || 'FILE'
  return ext
}

/**
 * Data URL → Blob tanpa fetch(). Pemanggilan fetch(data:...) dikenai CSP connect-src;
 * img-src data: tidak membebaskan connect-src.
 * @param {string} dataUrl
 * @returns {Blob}
 */
export function dataUrlToBlob(dataUrl) {
  if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) {
    throw new TypeError('dataUrlToBlob: perlu string data URL')
  }
  const comma = dataUrl.indexOf(',')
  if (comma === -1) {
    throw new TypeError('dataUrlToBlob: format data URL tidak valid')
  }
  const header = dataUrl.slice(0, comma)
  const body = dataUrl.slice(comma + 1)
  const mimeMatch = header.match(/^data:([^;,]+)/)
  const mime = mimeMatch ? mimeMatch[1].trim() : 'application/octet-stream'
  const isBase64 = /;base64/i.test(header)
  const binary = isBase64 ? atob(body) : decodeURIComponent(body)
  const len = binary.length
  const bytes = new Uint8Array(len)
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return new Blob([bytes], { type: mime })
}
