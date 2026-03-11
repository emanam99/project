/**
 * Kompresi gambar ke bawah 500 KB (max 500 * 1024 bytes).
 * Menggunakan canvas toBlob dengan quality menurun sampai ukuran memenuhi.
 * @param {HTMLCanvasElement} canvas
 * @param {string} mimeType - 'image/jpeg' | 'image/png' | 'image/webp'
 * @param {number} maxBytes - default 500 * 1024
 * @returns {Promise<Blob>}
 */
export function compressImageUnderMaxBytes(canvas, mimeType = 'image/jpeg', maxBytes = 500 * 1024) {
  return new Promise((resolve, reject) => {
    let quality = 0.92
    const tryBlob = () => {
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('Gagal membuat blob'))
            return
          }
          if (blob.size <= maxBytes || quality <= 0.1) {
            resolve(blob)
            return
          }
          quality -= 0.12
          if (quality < 0.1) quality = 0.1
          tryBlob()
        },
        mimeType,
        quality
      )
    }
    tryBlob()
  })
}
