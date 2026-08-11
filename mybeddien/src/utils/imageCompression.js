/**
 * Kompresi gambar via Canvas — selaras aplikasi daftar.
 */
export const compressImage = (file, maxSizeMB = 1, maxWidth = 1920, maxHeight = 1920) => {
  return new Promise((resolve, reject) => {
    const maxSizeBytes = maxSizeMB * 1024 * 1024

    if (file.size <= maxSizeBytes) {
      resolve(file)
      return
    }

    const supportedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
    const fileExtension = file.name.split('.').pop()?.toLowerCase()
    const supportedExtensions = ['jpg', 'jpeg', 'png', 'webp']

    if (!supportedTypes.includes(file.type) && !supportedExtensions.includes(fileExtension)) {
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
        const ctx = canvas.getContext('2d', { willReadFrequently: true })

        ctx.imageSmoothingEnabled = true
        ctx.imageSmoothingQuality = 'high'
        ctx.drawImage(img, 0, 0, width, height)

        const tryCompress = (quality) =>
          new Promise((resolveTry) => {
            const outputType = file.type === 'image/png' ? 'image/jpeg' : file.type || 'image/jpeg'
            canvas.toBlob((blob) => resolveTry(blob), outputType, quality)
          })

        const findOptimalQuality = async (minQuality = 0.1, maxQuality = 1.0) => {
          let bestBlob = null
          let bestQuality = maxQuality
          const iterations = 12

          for (let i = 0; i < iterations; i++) {
            const quality = (minQuality + maxQuality) / 2
            const blob = await tryCompress(quality)

            if (!blob) {
              minQuality = quality
              continue
            }

            if (blob.size <= maxSizeBytes) {
              bestBlob = blob
              bestQuality = quality
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
            const outputType =
              file.type === 'image/png' || !file.type ? 'image/jpeg' : file.type
            const outputExtension =
              file.type === 'image/png' || !file.name.match(/\.(jpe?g|webp)$/i) ? 'jpg' : file.name.split('.').pop()
            const outputName = file.name.replace(/\.[^/.]+$/, '') + '.' + outputExtension

            resolve(
              new File([compressedBlob], outputName, {
                type: outputType,
                lastModified: Date.now(),
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
