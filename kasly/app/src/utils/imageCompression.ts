/**
 * Kompresi gambar di klien (pola eBeddien).
 * Target default 0.5 MB; untuk belanja pakai compressImage(file, 1) → ≤ 1 MB.
 */
export function compressImage(
  file: File,
  maxSizeMB = 0.5,
  maxWidth = 1920,
  maxHeight = 1920,
): Promise<File> {
  return new Promise((resolve, reject) => {
    const maxSizeBytes = maxSizeMB * 1024 * 1024

    if (file.size <= maxSizeBytes) {
      resolve(file)
      return
    }

    const supportedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
    const fileExtension = file.name.split('.').pop()?.toLowerCase()
    const supportedExtensions = ['jpg', 'jpeg', 'png', 'webp']

    if (!supportedTypes.includes(file.type) && !supportedExtensions.includes(fileExtension || '')) {
      resolve(file)
      return
    }

    const reader = new FileReader()

    reader.onload = (e) => {
      const img = new Image()
      img.onload = () => {
        let width = img.width
        let height = img.height

        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height)
          width = Math.round(width * ratio)
          height = Math.round(height * ratio)
        }

        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new Error('Canvas tidak tersedia'))
          return
        }
        ctx.imageSmoothingEnabled = true
        ctx.imageSmoothingQuality = 'high'
        ctx.drawImage(img, 0, 0, width, height)

        const outputType = file.type === 'image/png' ? 'image/jpeg' : file.type || 'image/jpeg'

        const tryCompress = (quality: number) =>
          new Promise<Blob | null>((resolveTry) => {
            canvas.toBlob((blob) => resolveTry(blob), outputType, quality)
          })

        const findOptimalQuality = async (minQuality = 0.1, maxQuality = 1.0) => {
          let bestBlob: Blob | null = null
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
              reject(new Error('Gagal mengompresi gambar'))
              return
            }
            const outputExtension = file.type === 'image/png' ? 'jpg' : file.name.split('.').pop() || 'jpg'
            const outputName = file.name.replace(/\.[^/.]+$/, '') + '.' + outputExtension
            resolve(
              new File([compressedBlob], outputName, {
                type: outputType,
                lastModified: Date.now(),
              }),
            )
          })
          .catch(reject)
      }

      img.onerror = () => reject(new Error('Gagal memuat gambar'))
      img.src = String(e.target?.result || '')
    }

    reader.onerror = () => reject(new Error('Gagal membaca file'))
    reader.readAsDataURL(file)
  })
}
