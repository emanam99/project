/**
 * Utility untuk auto deteksi dan koreksi cahaya menggunakan OpenCV
 */

/**
 * Deteksi kecerahan gambar dan tentukan apakah perlu koreksi
 * @param {ImageData} imageData - Data gambar dari canvas
 * @returns {Object} - {isDark: boolean, brightness: number, needsCorrection: boolean}
 */
export const detectBrightness = (imageData) => {
  const data = imageData.data
  let totalBrightness = 0
  let pixelCount = 0

  // Hitung rata-rata kecerahan
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    // Gunakan formula luminance
    const brightness = (0.299 * r + 0.587 * g + 0.114 * b)
    totalBrightness += brightness
    pixelCount++
  }

  const avgBrightness = totalBrightness / pixelCount
  const isDark = avgBrightness < 100 // Threshold untuk gambar gelap
  const isTooBright = avgBrightness > 200 // Threshold untuk gambar terlalu terang
  const needsCorrection = isDark || isTooBright

  return {
    isDark,
    isTooBright,
    brightness: avgBrightness,
    needsCorrection
  }
}

/**
 * Koreksi cahaya menggunakan Canvas API (tanpa OpenCV)
 * @param {HTMLImageElement|HTMLCanvasElement} image - Gambar yang akan dikoreksi
 * @param {Object} options - Opsi koreksi
 * @returns {Promise<File>} - File gambar yang sudah dikoreksi
 */
export const enhanceImageWithCanvas = async (image, options = {}) => {
  const {
    brightness = 0,
    contrast = 1,
    autoEnhance = true
  } = options

  return new Promise((resolve, reject) => {
    try {
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      
      const width = image.width || image.videoWidth || image.naturalWidth
      const height = image.height || image.videoHeight || image.naturalHeight

      if (!width || !height || width === 0 || height === 0) {
        reject(new Error('Ukuran gambar tidak valid'))
        return
      }

      canvas.width = width
      canvas.height = height

      // Deteksi kecerahan jika auto enhance
      let brightnessAdjust = brightness
      let contrastAdjust = contrast

      if (autoEnhance) {
        ctx.drawImage(image, 0, 0, width, height)
        const imageData = ctx.getImageData(0, 0, width, height)
        const brightnessInfo = detectBrightness(imageData)
        console.log('Brightness info:', brightnessInfo)

        if (brightnessInfo.isDark) {
          // Gambar terlalu gelap, tingkatkan kecerahan
          brightnessAdjust = Math.min(50, (100 - brightnessInfo.brightness) * 0.5)
          contrastAdjust = 1.2
        } else if (brightnessInfo.isTooBright) {
          // Gambar terlalu terang, kurangi kecerahan
          brightnessAdjust = Math.max(-30, (200 - brightnessInfo.brightness) * 0.3)
          contrastAdjust = 0.9
        } else {
          // Gambar sudah cukup baik, sedikit enhancement
          brightnessAdjust = (128 - brightnessInfo.brightness) * 0.1
          contrastAdjust = 1.1
        }
      }

      // Clear canvas
      ctx.clearRect(0, 0, width, height)

      // Apply brightness and contrast filter
      ctx.filter = `brightness(${100 + brightnessAdjust}%) contrast(${contrastAdjust * 100}%)`
      ctx.drawImage(image, 0, 0, width, height)

      // Convert to blob
      canvas.toBlob((blob) => {
        if (blob && blob.size > 0) {
          const file = new File(
            [blob],
            `enhanced_${Date.now()}.jpg`,
            { type: 'image/jpeg', lastModified: Date.now() }
          )
          console.log('Enhanced file created:', file.name, file.size, 'bytes')
          resolve(file)
        } else {
          console.error('Failed to create blob from canvas')
          reject(new Error('Gagal membuat blob dari canvas'))
        }
      }, 'image/jpeg', 0.92)
    } catch (error) {
      reject(error)
    }
  })
}

/**
 * Koreksi cahaya menggunakan OpenCV (lebih advanced)
 * @param {HTMLImageElement|HTMLCanvasElement} image - Gambar yang akan dikoreksi
 * @param {Object} options - Opsi koreksi
 * @returns {Promise<File>} - File gambar yang sudah dikoreksi
 */
export const enhanceImageWithOpenCV = async (image, options = {}) => {
  const { loadOpenCV } = await import('./opencvLoader')
  const cv = await loadOpenCV()

  return new Promise((resolve, reject) => {
    try {
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      
      canvas.width = image.width || image.videoWidth || image.naturalWidth
      canvas.height = image.height || image.videoHeight || image.naturalHeight

      ctx.drawImage(image, 0, 0, canvas.width, canvas.height)

      // Convert canvas ke Mat OpenCV
      const src = cv.imread(canvas)
      const dst = new cv.Mat()

      // Deteksi kecerahan
      const gray = new cv.Mat()
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY)
      const mean = cv.mean(gray)
      const brightness = mean[0]

      // Auto koreksi berdasarkan kecerahan
      if (brightness < 100) {
        // Gambar terlalu gelap - gunakan CLAHE (Contrast Limited Adaptive Histogram Equalization)
        const lab = new cv.Mat()
        cv.cvtColor(src, lab, cv.COLOR_RGBA2BGR)
        cv.cvtColor(lab, lab, cv.COLOR_BGR2LAB)
        
        const labChannels = new cv.MatVector()
        cv.split(lab, labChannels)
        
        const clahe = new cv.CLAHE(2.0, new cv.Size(8, 8))
        clahe.apply(labChannels.get(0), labChannels.get(0))
        
        cv.merge(labChannels, lab)
        cv.cvtColor(lab, dst, cv.COLOR_LAB2BGR)
        cv.cvtColor(dst, dst, cv.COLOR_BGR2RGBA)
        
        lab.delete()
        labChannels.delete()
        clahe.delete()
      } else if (brightness > 200) {
        // Gambar terlalu terang - kurangi kecerahan
        src.convertTo(dst, -1, 0.8, -20) // alpha=0.8 (contrast), beta=-20 (brightness)
      } else {
        // Gambar normal - sedikit enhancement dengan gamma correction
        const gamma = 1.1
        const invGamma = 1.0 / gamma
        const lookupTable = new cv.Mat(256, 1, cv.CV_8U)
        const data = lookupTable.data
        for (let i = 0; i < 256; i++) {
          data[i] = Math.pow(i / 255.0, invGamma) * 255.0
        }
        
        const channels = new cv.MatVector()
        cv.split(src, channels)
        for (let i = 0; i < channels.size(); i++) {
          cv.LUT(channels.get(i), lookupTable, channels.get(i))
        }
        cv.merge(channels, dst)
        
        channels.delete()
        lookupTable.delete()
      }

      gray.delete()

      // Convert Mat kembali ke canvas
      cv.imshow(canvas, dst)
      
      // Cleanup
      src.delete()
      dst.delete()

      // Convert to blob
      canvas.toBlob((blob) => {
        if (blob) {
          const file = new File(
            [blob],
            `enhanced_${Date.now()}.jpg`,
            { type: 'image/jpeg', lastModified: Date.now() }
          )
          resolve(file)
        } else {
          reject(new Error('Gagal membuat blob dari canvas'))
        }
      }, 'image/jpeg', 0.92)
    } catch (error) {
      reject(error)
    }
  })
}

/**
 * Auto enhance image dengan deteksi otomatis metode terbaik
 * @param {HTMLImageElement|HTMLCanvasElement} image - Gambar yang akan dikoreksi
 * @param {boolean} useOpenCV - Gunakan OpenCV jika tersedia
 * @returns {Promise<File>} - File gambar yang sudah dikoreksi
 */
export const autoEnhanceImage = async (image, useOpenCV = false) => {
  console.log('autoEnhanceImage called, useOpenCV:', useOpenCV)
  
  // Default gunakan Canvas API (lebih ringan dan reliable)
  if (!useOpenCV) {
    console.log('Using Canvas API for enhancement')
    try {
      return await enhanceImageWithCanvas(image, { autoEnhance: true })
    } catch (error) {
      console.error('Error in Canvas enhancement:', error)
      throw error
    }
  }

  // Coba OpenCV jika diminta
  try {
    const { isOpenCVLoaded, loadOpenCV } = await import('./opencvLoader')
    if (!isOpenCVLoaded()) {
      console.log('OpenCV not loaded, loading...')
      await loadOpenCV()
    }
    
    if (isOpenCVLoaded() || window.cv) {
      console.log('Using OpenCV for enhancement')
      return await enhanceImageWithOpenCV(image, { autoEnhance: true })
    } else {
      throw new Error('OpenCV tidak tersedia setelah loading')
    }
  } catch (error) {
    console.warn('OpenCV tidak tersedia, menggunakan metode Canvas:', error)
    // Fallback ke Canvas API
    return await enhanceImageWithCanvas(image, { autoEnhance: true })
  }
}
