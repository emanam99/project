/**
 * Image compression utility using HTML5 Canvas API
 * Compresses images to target file size while maintaining quality
 * 
 * Shared utility untuk digunakan di seluruh aplikasi
 */

/**
 * Compress image file to target size
 * @param {File} file - Image file to compress
 * @param {number} maxSizeMB - Maximum file size in MB (default: 0.5)
 * @param {number} maxWidth - Maximum width in pixels (default: 1920)
 * @param {number} maxHeight - Maximum height in pixels (default: 1920)
 * @returns {Promise<File>} Compressed file
 */
export const compressImage = (file, maxSizeMB = 0.5, maxWidth = 1920, maxHeight = 1920) => {
  return new Promise((resolve, reject) => {
    const maxSizeBytes = maxSizeMB * 1024 * 1024 // 500 KB
    
    // Jika file sudah kecil, tidak perlu kompresi
    if (file.size <= maxSizeBytes) {
      resolve(file)
      return
    }
    
    // Hanya kompres format yang didukung canvas (JPEG, PNG, WEBP)
    // GIF tidak didukung dengan baik oleh canvas.toBlob
    const supportedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
    const fileExtension = file.name.split('.').pop()?.toLowerCase()
    const supportedExtensions = ['jpg', 'jpeg', 'png', 'webp']
    
    if (!supportedTypes.includes(file.type) && !supportedExtensions.includes(fileExtension)) {
      // Format tidak didukung, return file asli
      resolve(file)
      return
    }
    
    const reader = new FileReader()
    
    reader.onload = (e) => {
      const img = new Image()
      img.onload = () => {
        // Hitung dimensi baru dengan mempertahankan aspect ratio
        let width = img.width
        let height = img.height
        
        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height)
          width = Math.round(width * ratio)
          height = Math.round(height * ratio)
        }
        
        // Buat canvas
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        
        // Set quality untuk gambar yang lebih baik
        ctx.imageSmoothingEnabled = true
        ctx.imageSmoothingQuality = 'high'
        
        // Draw image ke canvas
        ctx.drawImage(img, 0, 0, width, height)
        
        // Fungsi untuk mencoba kompres dengan quality tertentu
        const tryCompress = (quality) => {
          return new Promise((resolveTry) => {
            // Untuk PNG, gunakan 'image/jpeg' dengan quality untuk kompresi lebih baik
            // Tapi tetap pertahankan format asli jika user ingin
            const outputType = file.type === 'image/png' ? 'image/jpeg' : file.type
            canvas.toBlob((blob) => {
              resolveTry(blob)
            }, outputType, quality)
          })
        }
        
        // Binary search untuk menemukan quality optimal
        const findOptimalQuality = async (minQuality = 0.1, maxQuality = 1.0) => {
          let bestBlob = null
          let bestQuality = maxQuality
          const iterations = 12 // Maksimal 12 iterasi untuk presisi lebih baik
          
          for (let i = 0; i < iterations; i++) {
            const quality = (minQuality + maxQuality) / 2
            const blob = await tryCompress(quality)
            
            if (!blob) {
              minQuality = quality
              continue
            }
            
            if (blob.size <= maxSizeBytes) {
              // Ukuran sudah sesuai, coba quality lebih tinggi
              bestBlob = blob
              bestQuality = quality
              minQuality = quality
            } else {
              // Ukuran masih terlalu besar, kurangi quality
              maxQuality = quality
            }
            
            // Jika selisih quality sudah sangat kecil, stop
            if (maxQuality - minQuality < 0.01) {
              break
            }
          }
          
          // Jika masih belum dapat yang sesuai, coba quality lebih rendah
          if (!bestBlob || bestBlob.size > maxSizeBytes) {
            for (let quality = 0.1; quality <= 0.9; quality += 0.1) {
              const blob = await tryCompress(quality)
              if (blob && blob.size <= maxSizeBytes) {
                return blob
              }
            }
            // Jika semua quality masih terlalu besar, gunakan yang terkecil
            return await tryCompress(0.1)
          }
          
          return bestBlob
        }
        
        // Mulai kompresi
        findOptimalQuality()
          .then((compressedBlob) => {
            if (compressedBlob) {
              // Tentukan output type
              const outputType = file.type === 'image/png' ? 'image/jpeg' : file.type
              const outputExtension = file.type === 'image/png' ? 'jpg' : file.name.split('.').pop()
              const outputName = file.name.replace(/\.[^/.]+$/, '') + '.' + outputExtension
              
              // Buat File object baru
              const compressedFile = new File(
                [compressedBlob],
                outputName,
                {
                  type: outputType,
                  lastModified: Date.now()
                }
              )
              resolve(compressedFile)
            } else {
              reject(new Error('Gagal mengompresi gambar'))
            }
          })
          .catch(reject)
      }
      
      img.onerror = () => {
        reject(new Error('Gagal memuat gambar'))
      }
      
      img.src = e.target.result
    }
    
    reader.onerror = () => {
      reject(new Error('Gagal membaca file'))
    }
    
    reader.readAsDataURL(file)
  })
}

/**
 * Kompresi logo madrasah di klien sebelum upload: selalu mengecek dimensi (maks. sisi px) dan ukuran file.
 * PNG besar dioptimalkan (sering ke JPEG seperti compressImage untuk target ukuran).
 *
 * @param {File} file — image/jpeg, image/png
 * @param {number} maxSidePx — sisi terpanjang maksimum (default 512)
 * @param {number} maxSizeMB — target ukuran maksimum (default 0.45 MB)
 */
export function compressLogoBeforeUpload(file, maxSidePx = 512, maxSizeMB = 0.45) {
  return new Promise((resolve, reject) => {
    const types = ['image/jpeg', 'image/jpg', 'image/png']
    const ext = file.name.split('.').pop()?.toLowerCase()
    if (!types.includes(file.type) && !['jpg', 'jpeg', 'png'].includes(ext || '')) {
      reject(new Error('Hanya JPEG atau PNG'))
      return
    }

    const maxSizeBytes = maxSizeMB * 1024 * 1024
    const reader = new FileReader()

    reader.onload = (e) => {
      const img = new Image()
      img.onload = () => {
        let width = img.width
        let height = img.height
        if (width < 1 || height < 1) {
          reject(new Error('Ukuran gambar tidak valid'))
          return
        }

        if (width > maxSidePx || height > maxSidePx) {
          const ratio = Math.min(maxSidePx / width, maxSidePx / height)
          width = Math.round(width * ratio)
          height = Math.round(height * ratio)
        }

        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        ctx.imageSmoothingEnabled = true
        ctx.imageSmoothingQuality = 'high'
        ctx.drawImage(img, 0, 0, width, height)

        const tryCompress = (quality) => {
          return new Promise((resolveTry) => {
            const outputType = file.type === 'image/png' ? 'image/jpeg' : file.type
            canvas.toBlob((blob) => resolveTry(blob), outputType, quality)
          })
        }

        const findOptimalQuality = async (minQuality = 0.1, maxQuality = 1.0) => {
          let bestBlob = null
          for (let i = 0; i < 12; i++) {
            const quality = (minQuality + maxQuality) / 2
            const blob = await tryCompress(quality)
            if (!blob) {
              minQuality = quality
              continue
            }
            if (blob.size <= maxSizeBytes) {
              bestBlob = blob
              minQuality = quality
            } else {
              maxQuality = quality
            }
            if (maxQuality - minQuality < 0.01) break
          }
          if (!bestBlob || bestBlob.size > maxSizeBytes) {
            for (let quality = 0.1; quality <= 0.9; quality += 0.1) {
              const blob = await tryCompress(quality)
              if (blob && blob.size <= maxSizeBytes) return blob
            }
            return await tryCompress(0.1)
          }
          return bestBlob
        }

        findOptimalQuality()
          .then((compressedBlob) => {
            if (!compressedBlob) {
              reject(new Error('Gagal mengompresi logo'))
              return
            }
            const outputType = file.type === 'image/png' ? 'image/jpeg' : file.type
            const outputExt = file.type === 'image/png' ? 'jpg' : (file.name.split('.').pop() || 'jpg')
            const outputName = file.name.replace(/\.[^/.]+$/, '') + '.' + outputExt
            resolve(
              new File([compressedBlob], outputName, {
                type: outputType,
                lastModified: Date.now()
              })
            )
          })
          .catch(reject)
      }
      img.onerror = () => reject(new Error('Gagal memuat gambar'))
      img.src = e.target.result
    }
    reader.onerror = () => reject(new Error('Gagal membaca file'))
    reader.readAsDataURL(file)
  })
}

