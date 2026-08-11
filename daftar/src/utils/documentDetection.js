/**
 * Utility untuk deteksi dan auto crop dokumen dari gambar
 */

/**
 * Deteksi kontur dokumen menggunakan edge detection
 * @param {HTMLCanvasElement} canvas - Canvas dengan gambar
 * @returns {Promise<Array>} - Array koordinat 4 titik sudut dokumen
 */
export const detectDocumentCorners = async (canvas) => {
  return new Promise((resolve, reject) => {
    try {
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      const width = canvas.width
      const height = canvas.height

      // Ambil image data
      const imageData = ctx.getImageData(0, 0, width, height)
      const data = imageData.data

      // Convert ke grayscale dan apply edge detection sederhana
      const grayData = new Uint8ClampedArray(width * height)
      
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i]
        const g = data[i + 1]
        const b = data[i + 2]
        const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b)
        grayData[i / 4] = gray
      }

      // Edge detection menggunakan Sobel operator sederhana
      const edges = detectEdges(grayData, width, height)
      
      // Cari kontur terbesar (kemungkinan dokumen)
      const contours = findContours(edges, width, height)
      
      if (contours.length === 0) {
        // Jika tidak ada kontur, return seluruh gambar
        resolve([
          { x: 0, y: 0 },
          { x: width, y: 0 },
          { x: width, y: height },
          { x: 0, y: height }
        ])
        return
      }

      // Pilih kontur terbesar
      const largestContour = contours.reduce((max, contour) => 
        contour.length > max.length ? contour : max
      )

      // Cari 4 sudut dari kontur (menggunakan convex hull sederhana)
      const corners = findCorners(largestContour, width, height)
      
      resolve(corners)
    } catch (error) {
      console.error('Error detecting document:', error)
      // Fallback ke seluruh gambar
      resolve([
        { x: 0, y: 0 },
        { x: canvas.width, y: 0 },
        { x: canvas.width, y: canvas.height },
        { x: 0, y: canvas.height }
      ])
    }
  })
}

/**
 * Deteksi edge menggunakan Sobel operator sederhana
 */
const detectEdges = (grayData, width, height) => {
  const edges = new Uint8ClampedArray(width * height)
  const threshold = 50

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x
      
      // Sobel X
      const sobelX = 
        -grayData[(y - 1) * width + (x - 1)] +
        grayData[(y - 1) * width + (x + 1)] +
        -2 * grayData[y * width + (x - 1)] +
        2 * grayData[y * width + (x + 1)] +
        -grayData[(y + 1) * width + (x - 1)] +
        grayData[(y + 1) * width + (x + 1)]
      
      // Sobel Y
      const sobelY = 
        -grayData[(y - 1) * width + (x - 1)] +
        -2 * grayData[(y - 1) * width + x] +
        -grayData[(y - 1) * width + (x + 1)] +
        grayData[(y + 1) * width + (x - 1)] +
        2 * grayData[(y + 1) * width + x] +
        grayData[(y + 1) * width + (x + 1)]
      
      const magnitude = Math.sqrt(sobelX * sobelX + sobelY * sobelY)
      edges[idx] = magnitude > threshold ? 255 : 0
    }
  }

  return edges
}

/**
 * Cari kontur dari edge image
 */
const findContours = (edges, width, height) => {
  const visited = new Array(width * height).fill(false)
  const contours = []

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x
      if (edges[idx] > 0 && !visited[idx]) {
        const contour = []
        const stack = [{ x, y }]
        
        while (stack.length > 0) {
          const { x: cx, y: cy } = stack.pop()
          const cidx = cy * width + cx
          
          if (cx < 0 || cx >= width || cy < 0 || cy >= height || visited[cidx]) {
            continue
          }
          
          if (edges[cidx] > 0) {
            visited[cidx] = true
            contour.push({ x: cx, y: cy })
            
            // Tambahkan tetangga
            stack.push(
              { x: cx + 1, y: cy },
              { x: cx - 1, y: cy },
              { x: cx, y: cy + 1 },
              { x: cx, y: cy - 1 }
            )
          }
        }
        
        if (contour.length > 100) { // Filter kontur kecil
          contours.push(contour)
        }
      }
    }
  }

  return contours
}

/**
 * Cari 4 sudut dari kontur
 */
const findCorners = (contour, width, height) => {
  if (contour.length < 4) {
    return [
      { x: 0, y: 0 },
      { x: width, y: 0 },
      { x: width, y: height },
      { x: 0, y: height }
    ]
  }

  // Cari titik terjauh di setiap kuadran
  const centerX = width / 2
  const centerY = height / 2

  let topLeft = { x: width, y: height, dist: Infinity }
  let topRight = { x: 0, y: height, dist: Infinity }
  let bottomRight = { x: 0, y: 0, dist: Infinity }
  let bottomLeft = { x: width, y: 0, dist: Infinity }

  contour.forEach(point => {
    const { x, y } = point
    const distToCenter = Math.sqrt((x - centerX) ** 2 + (y - centerY) ** 2)
    
    // Top Left
    if (x < centerX && y < centerY) {
      const dist = Math.sqrt(x ** 2 + y ** 2)
      if (dist < topLeft.dist) {
        topLeft = { x, y, dist }
      }
    }
    // Top Right
    else if (x >= centerX && y < centerY) {
      const dist = Math.sqrt((width - x) ** 2 + y ** 2)
      if (dist < topRight.dist) {
        topRight = { x, y, dist }
      }
    }
    // Bottom Right
    else if (x >= centerX && y >= centerY) {
      const dist = Math.sqrt((width - x) ** 2 + (height - y) ** 2)
      if (dist < bottomRight.dist) {
        bottomRight = { x, y, dist }
      }
    }
    // Bottom Left
    else {
      const dist = Math.sqrt(x ** 2 + (height - y) ** 2)
      if (dist < bottomLeft.dist) {
        bottomLeft = { x, y, dist }
      }
    }
  })

  return [
    { x: topLeft.x, y: topLeft.y },
    { x: topRight.x, y: topRight.y },
    { x: bottomRight.x, y: bottomRight.y },
    { x: bottomLeft.x, y: bottomLeft.y }
  ]
}

/**
 * Deteksi dokumen menggunakan OpenCV (lebih akurat)
 */
export const detectDocumentCornersOpenCV = async (canvas) => {
  try {
    const { loadOpenCV, isOpenCVLoaded } = await import('./opencvLoader')
    
    if (!isOpenCVLoaded()) {
      await loadOpenCV()
    }

    if (!window.cv || !window.cv.Mat) {
      throw new Error('OpenCV tidak tersedia')
    }

    const cv = window.cv
    const src = cv.imread(canvas)
    const gray = new cv.Mat()
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY)

    // Apply Gaussian blur
    const blurred = new cv.Mat()
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0)

    // Canny edge detection
    const edges = new cv.Mat()
    cv.Canny(blurred, edges, 50, 150)

    // Find contours
    const contours = new cv.MatVector()
    const hierarchy = new cv.Mat()
    cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE)

    let largestContour = null
    let maxArea = 0

    for (let i = 0; i < contours.size(); i++) {
      const contour = contours.get(i)
      const area = cv.contourArea(contour)
      if (area > maxArea && area > canvas.width * canvas.height * 0.1) {
        maxArea = area
        largestContour = contour
      }
    }

    if (!largestContour || maxArea === 0) {
      // Cleanup
      src.delete()
      gray.delete()
      blurred.delete()
      edges.delete()
      contours.delete()
      hierarchy.delete()
      
      return [
        { x: 0, y: 0 },
        { x: canvas.width, y: 0 },
        { x: canvas.width, y: canvas.height },
        { x: 0, y: canvas.height }
      ]
    }

    // Approximate contour to polygon
    const epsilon = 0.02 * cv.arcLength(largestContour, true)
    const approx = new cv.Mat()
    cv.approxPolyDP(largestContour, approx, epsilon, true)

    let corners = []
    if (approx.rows === 4) {
      // Sudah 4 titik
      for (let i = 0; i < 4; i++) {
        const point = approx.data32S
        corners.push({
          x: point[i * 2],
          y: point[i * 2 + 1]
        })
      }
    } else {
      // Cari 4 sudut dari bounding rect
      const rect = cv.boundingRect(largestContour)
      corners = [
        { x: rect.x, y: rect.y },
        { x: rect.x + rect.width, y: rect.y },
        { x: rect.x + rect.width, y: rect.y + rect.height },
        { x: rect.x, y: rect.y + rect.height }
      ]
    }

    // Cleanup
    src.delete()
    gray.delete()
    blurred.delete()
    edges.delete()
    contours.delete()
    hierarchy.delete()
    approx.delete()

    return corners
  } catch (error) {
    console.warn('OpenCV detection failed, using fallback:', error)
    return detectDocumentCorners(canvas)
  }
}

/**
 * Transform perspektif untuk crop dokumen menggunakan homography
 * @param {HTMLCanvasElement} sourceCanvas - Canvas sumber
 * @param {Array} corners - 4 titik sudut dokumen [topLeft, topRight, bottomRight, bottomLeft]
 * @returns {HTMLCanvasElement} - Canvas hasil crop
 */
export const perspectiveTransform = (sourceCanvas, corners) => {
  const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d', { willReadFrequently: true })

  // Hitung dimensi output (rata-rata dari kedua sisi)
  const width1 = Math.sqrt(
    Math.pow(corners[1].x - corners[0].x, 2) + 
    Math.pow(corners[1].y - corners[0].y, 2)
  )
  const width2 = Math.sqrt(
    Math.pow(corners[2].x - corners[3].x, 2) + 
    Math.pow(corners[2].y - corners[3].y, 2)
  )
  const height1 = Math.sqrt(
    Math.pow(corners[3].x - corners[0].x, 2) + 
    Math.pow(corners[3].y - corners[0].y, 2)
  )
  const height2 = Math.sqrt(
    Math.pow(corners[2].x - corners[1].x, 2) + 
    Math.pow(corners[2].y - corners[1].y, 2)
  )

  const outputWidth = Math.max(Math.round((width1 + width2) / 2), 100)
  const outputHeight = Math.max(Math.round((height1 + height2) / 2), 100)

  canvas.width = outputWidth
  canvas.height = outputHeight

  // Source points (corners dari gambar asli)
  const srcPoints = [
    { x: corners[0].x, y: corners[0].y },
    { x: corners[1].x, y: corners[1].y },
    { x: corners[2].x, y: corners[2].y },
    { x: corners[3].x, y: corners[3].y }
  ]

  // Destination points (sudut persegi output)
  const dstPoints = [
    { x: 0, y: 0 },
    { x: outputWidth, y: 0 },
    { x: outputWidth, y: outputHeight },
    { x: 0, y: outputHeight }
  ]

  // Hitung transform matrix menggunakan persamaan homography sederhana
  // Untuk perspektif transform, kita gunakan teknik inverse mapping
  // Ambil setiap pixel di output dan cari posisinya di source
  
  const imageData = ctx.createImageData(outputWidth, outputHeight)
  const sourceCtx = sourceCanvas.getContext('2d', { willReadFrequently: true })
  const sourceImageData = sourceCtx.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height)

  // Inverse mapping: untuk setiap pixel di output, cari posisi di source
  for (let y = 0; y < outputHeight; y++) {
    for (let x = 0; x < outputWidth; x++) {
      // Normalize coordinates (0-1)
      const u = x / outputWidth
      const v = y / outputHeight

      // Bilinear interpolation untuk mencari posisi di source
      // Interpolasi antara 4 sudut
      const topX = srcPoints[0].x + (srcPoints[1].x - srcPoints[0].x) * u
      const topY = srcPoints[0].y + (srcPoints[1].y - srcPoints[0].y) * u
      const bottomX = srcPoints[3].x + (srcPoints[2].x - srcPoints[3].x) * u
      const bottomY = srcPoints[3].y + (srcPoints[2].y - srcPoints[3].y) * u

      const srcX = topX + (bottomX - topX) * v
      const srcY = topY + (bottomY - topY) * v

      // Ambil pixel dari source dengan bilinear interpolation
      const x1 = Math.floor(srcX)
      const y1 = Math.floor(srcY)
      const x2 = Math.min(x1 + 1, sourceCanvas.width - 1)
      const y2 = Math.min(y1 + 1, sourceCanvas.height - 1)

      const fx = srcX - x1
      const fy = srcY - y1

      if (x1 >= 0 && x1 < sourceCanvas.width && y1 >= 0 && y1 < sourceCanvas.height) {
        const idx = (y * outputWidth + x) * 4
        const srcIdx1 = (y1 * sourceCanvas.width + x1) * 4
        const srcIdx2 = (y1 * sourceCanvas.width + x2) * 4
        const srcIdx3 = (y2 * sourceCanvas.width + x1) * 4
        const srcIdx4 = (y2 * sourceCanvas.width + x2) * 4

        // Bilinear interpolation
        for (let c = 0; c < 3; c++) {
          const val = 
            sourceImageData.data[srcIdx1 + c] * (1 - fx) * (1 - fy) +
            sourceImageData.data[srcIdx2 + c] * fx * (1 - fy) +
            sourceImageData.data[srcIdx3 + c] * (1 - fx) * fy +
            sourceImageData.data[srcIdx4 + c] * fx * fy
          imageData.data[idx + c] = Math.round(val)
        }
        imageData.data[idx + 3] = 255 // Alpha
      }
    }
  }

  ctx.putImageData(imageData, 0, 0)
  return canvas
}
