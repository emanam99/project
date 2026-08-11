/**
 * Utility functions for file operations
 */

/**
 * Format file size from bytes to human readable format
 * @param {number} bytes - File size in bytes
 * @returns {string} Formatted file size (e.g., "1.5 MB")
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
 * @param {string} tipeFile - MIME type (e.g., "image/jpeg")
 * @param {string} namaFile - File name (e.g., "document.pdf")
 * @returns {string} File type label (e.g., "JPEG", "PDF")
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

