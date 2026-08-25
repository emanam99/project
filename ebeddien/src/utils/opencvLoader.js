/**
 * Utility untuk memuat OpenCV.js secara dinamis
 */
let cvLoaded = false
let cvLoading = false
let cvLoadPromise = null

export const loadOpenCV = () => {
  if (cvLoaded) {
    return Promise.resolve(window.cv)
  }

  if (cvLoading) {
    return cvLoadPromise
  }

  cvLoading = true
  cvLoadPromise = new Promise((resolve, reject) => {
    if (window.cv) {
      cvLoaded = true
      cvLoading = false
      resolve(window.cv)
      return
    }

    // Load OpenCV.js dari CDN
    const script = document.createElement('script')
    // Gunakan CDN yang lebih cepat - fallback ke beberapa CDN
    script.src = 'https://docs.opencv.org/4.10.0/opencv.js'
    script.async = true
    script.defer = true
    script.crossOrigin = 'anonymous'
    script.onload = () => {
      const started = Date.now()
      const checkOpenCV = setInterval(() => {
        if (window.cv && window.cv.Mat) {
          clearInterval(checkOpenCV)
          cvLoaded = true
          cvLoading = false
          resolve(window.cv)
          return
        }
        if (Date.now() - started > 8000) {
          clearInterval(checkOpenCV)
          cvLoading = false
          reject(new Error('OpenCV gagal siap dalam waktu 8 detik'))
        }
      }, 100)
    }
    script.onerror = () => {
      cvLoading = false
      reject(new Error('Gagal memuat OpenCV.js'))
    }
    document.head.appendChild(script)
  })

  return cvLoadPromise
}

export const isOpenCVLoaded = () => cvLoaded
