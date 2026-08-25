/**
 * Utility untuk deteksi dan auto crop dokumen dari gambar
 */

/** Resolusi maksimum sisi terpanjang untuk deteksi live (balance kecepatan/akurasi) */
export const LIVE_DETECTION_MAX_DIM = 720

/** Deteksi saat capture (bukan live) — jangan proses foto 12MP di thread UI. */
export const CAPTURE_DETECTION_MAX_DIM = 1280

/** Resolusi minimum area dokumen terhadap frame (8%) */
const MIN_DOC_AREA_RATIO = 0.08
/** Resolusi maksimum — tolak deteksi hampir full-frame */
const MAX_DOC_AREA_RATIO = 0.94

const quadArea = (pts) => {
  if (!pts || pts.length < 3) return 0
  let sum = 0
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length
    sum += pts[i].x * pts[j].y - pts[j].x * pts[i].y
  }
  return Math.abs(sum) / 2
}

/** Sudut valid: cukup besar, bukan seluruh frame */
export const isValidDocumentQuad = (corners, width, height) => {
  if (!corners || corners.length !== 4 || width <= 0 || height <= 0) return false
  const frameArea = width * height
  const area = quadArea(corners)
  if (area < frameArea * MIN_DOC_AREA_RATIO || area > frameArea * MAX_DOC_AREA_RATIO) {
    return false
  }
  const margin = Math.min(width, height) * 0.02
  let nearEdge = 0
  for (const p of corners) {
    if (p.x <= margin || p.y <= margin || p.x >= width - margin || p.y >= height - margin) {
      nearEdge++
    }
  }
  return nearEdge < 4
}

const extractCornersFromApprox = (approx, scale = 1) => {
  const inv = scale === 1 ? 1 : 1 / scale
  const corners = []
  for (let i = 0; i < approx.rows; i++) {
    corners.push({
      x: approx.data32S[i * 2] * inv,
      y: approx.data32S[i * 2 + 1] * inv
    })
  }
  return corners
}

/**
 * Gambar frame video ke canvas; opsional downscale untuk deteksi live.
 * @returns {{ srcWidth: number, srcHeight: number, scale: number }}
 */
export const drawVideoFrameToCanvas = (video, canvas, maxDim = null) => {
  const srcWidth = video.videoWidth || 640
  const srcHeight = video.videoHeight || 480
  let dw = srcWidth
  let dh = srcHeight
  let scale = 1
  if (maxDim && Math.max(srcWidth, srcHeight) > maxDim) {
    scale = maxDim / Math.max(srcWidth, srcHeight)
    dw = Math.round(srcWidth * scale)
    dh = Math.round(srcHeight * scale)
  }
  if (canvas._lastW !== dw || canvas._lastH !== dh) {
    canvas.width = dw
    canvas.height = dh
    canvas._lastW = dw
    canvas._lastH = dh
  }
  canvas.getContext('2d', { willReadFrequently: true }).drawImage(video, 0, 0, dw, dh)
  return { srcWidth, srcHeight, scale }
}

/** Skala ulang sudut deteksi dari canvas downscale ke resolusi video penuh */
export const scaleCornersFromDetection = (corners, scale) => {
  if (!corners || scale >= 1) return corners
  const inv = 1 / scale
  return corners.map((p) => ({ x: p.x * inv, y: p.y * inv }))
}

/**
 * Deteksi sudut dokumen — OpenCV Wasm jika diminta & tersedia, else fallback JS.
 * @param {object} options
 * @param {boolean} options.useOpenCV
 * @param {boolean} options.fast - pipeline ringan untuk live preview
 */
export const detectDocumentCornersBest = async (canvas, { useOpenCV = true, fast = false } = {}) => {
  if (useOpenCV && typeof window !== 'undefined' && window.cv?.Mat) {
    try {
      return detectDocumentCornersOpenCVSync(canvas, { fast })
    } catch (error) {
      console.warn('OpenCV detection unavailable, fallback JS:', error)
    }
  }
  const corners = await detectDocumentCorners(canvas)
  return isValidDocumentQuad(corners, canvas.width, canvas.height) ? corners : null
}

/**
 * Deteksi kontur dokumen menggunakan edge detection
 * @param {HTMLCanvasElement} canvas - Canvas dengan gambar
 * @returns {Promise<Array>} - Array koordinat 4 titik sudut dokumen
 */
export const detectDocumentCorners = async (canvas) => {
  return new Promise((resolve, reject) => {
    try {
      let work = canvas
      let scale = 1
      const srcW = canvas.width
      const srcH = canvas.height
      if (Math.max(srcW, srcH) > CAPTURE_DETECTION_MAX_DIM) {
        scale = CAPTURE_DETECTION_MAX_DIM / Math.max(srcW, srcH)
        work = document.createElement('canvas')
        work.width = Math.round(srcW * scale)
        work.height = Math.round(srcH * scale)
        work.getContext('2d', { willReadFrequently: true }).drawImage(canvas, 0, 0, work.width, work.height)
      }
      const ctx = work.getContext('2d', { willReadFrequently: true })
      const width = work.width
      const height = work.height

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
        resolve(orderCornersToQuad([
          { x: 0, y: 0 },
          { x: width, y: 0 },
          { x: width, y: height },
          { x: 0, y: height }
        ], width, height))
        return
      }

      // Pilih kontur terbesar
      const largestContour = contours.reduce((max, contour) => 
        contour.length > max.length ? contour : max
      )

      const corners = findCorners(largestContour, width, height)
      const inv = scale < 1 ? 1 / scale : 1
      const scaled = scale < 1
        ? corners.map((p) => ({ x: p.x * inv, y: p.y * inv }))
        : corners
      resolve(orderCornersToQuad(scaled, srcW, srcH))
    } catch (error) {
      console.error('Error detecting document:', error)
      resolve(orderCornersToQuad([
        { x: 0, y: 0 },
        { x: canvas.width, y: 0 },
        { x: canvas.width, y: canvas.height },
        { x: 0, y: canvas.height }
      ], canvas.width, canvas.height))
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
 * Urutkan 4 titik menjadi [TL, TR, BR, BL] dan pastikan tidak terlipat (convex)
 * Jika terdeteksi self-intersect / terlipat, kembalikan bounding box.
 */
export const orderCornersToQuad = (corners, width, height) => {
  if (!corners || corners.length !== 4) {
    const w = width || 640
    const h = height || 480
    return [
      { x: 0, y: 0 },
      { x: w, y: 0 },
      { x: w, y: h },
      { x: 0, y: h }
    ]
  }
  const cx = (corners[0].x + corners[1].x + corners[2].x + corners[3].x) / 4
  const cy = (corners[0].y + corners[1].y + corners[2].y + corners[3].y) / 4
  const withAngle = corners.map((p) => ({
    ...p,
    angle: Math.atan2(p.y - cy, p.x - cx)
  }))
  withAngle.sort((a, b) => a.angle - b.angle)
  const ordered = withAngle.map(({ x, y }) => ({ x, y }))

  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
  const c0 = cross(ordered[0], ordered[1], ordered[2])
  const c1 = cross(ordered[1], ordered[2], ordered[3])
  const c2 = cross(ordered[2], ordered[3], ordered[0])
  const c3 = cross(ordered[3], ordered[0], ordered[1])
  const convex = (c0 >= 0 && c1 >= 0 && c2 >= 0 && c3 >= 0) || (c0 <= 0 && c1 <= 0 && c2 <= 0 && c3 <= 0)
  if (convex) return ordered

  const w = (width != null && width > 0) ? width : 640
  const h = (height != null && height > 0) ? height : 480
  const minX = Math.max(0, Math.min(...corners.map((p) => p.x)))
  const minY = Math.max(0, Math.min(...corners.map((p) => p.y)))
  const maxX = Math.min(w, Math.max(...corners.map((p) => p.x)))
  const maxY = Math.min(h, Math.max(...corners.map((p) => p.y)))
  return [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY }
  ]
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

  const centerX = width / 2
  const centerY = height / 2

  let topLeft = { x: width, y: height, dist: Infinity }
  let topRight = { x: 0, y: height, dist: Infinity }
  let bottomRight = { x: 0, y: 0, dist: Infinity }
  let bottomLeft = { x: width, y: 0, dist: Infinity }

  contour.forEach(point => {
    const { x, y } = point
    if (x < centerX && y < centerY) {
      const dist = Math.sqrt(x ** 2 + y ** 2)
      if (dist < topLeft.dist) topLeft = { x, y, dist }
    } else if (x >= centerX && y < centerY) {
      const dist = Math.sqrt((width - x) ** 2 + y ** 2)
      if (dist < topRight.dist) topRight = { x, y, dist }
    } else if (x >= centerX && y >= centerY) {
      const dist = Math.sqrt((width - x) ** 2 + (height - y) ** 2)
      if (dist < bottomRight.dist) bottomRight = { x, y, dist }
    } else {
      const dist = Math.sqrt(x ** 2 + (height - y) ** 2)
      if (dist < bottomLeft.dist) bottomLeft = { x, y, dist }
    }
  })

  const raw = [
    { x: topLeft.x, y: topLeft.y },
    { x: topRight.x, y: topRight.y },
    { x: bottomRight.x, y: bottomRight.y },
    { x: bottomLeft.x, y: bottomLeft.y }
  ]
  return orderCornersToQuad(raw, width, height)
}

/**
 * Cari quadrilateral dokumen terbaik dari kontur OpenCV
 */
const findBestQuadFromContours = (cv, contours, imgW, imgH, scaleBack = 1) => {
  const outW = imgW / scaleBack
  const outH = imgH / scaleBack
  const frameArea = outW * outH
  const minArea = frameArea * MIN_DOC_AREA_RATIO

  const ranked = []
  for (let i = 0; i < contours.size(); i++) {
    const contour = contours.get(i)
    const area = cv.contourArea(contour)
    if (area >= minArea) ranked.push({ contour, area })
  }
  ranked.sort((a, b) => b.area - a.area)

  const tryContour = (contour) => {
    const epsFactors = [0.015, 0.02, 0.025, 0.03, 0.01, 0.035]
    for (const epsFactor of epsFactors) {
      const approx = new cv.Mat()
      try {
        const peri = cv.arcLength(contour, true)
        cv.approxPolyDP(contour, approx, epsFactor * peri, true)
        if (approx.rows === 4 && cv.isContourConvex(approx)) {
          const corners = extractCornersFromApprox(approx, scaleBack)
          const ordered = orderCornersToQuad(corners, outW, outH)
          if (isValidDocumentQuad(ordered, outW, outH)) return ordered
        }
      } finally {
        approx.delete()
      }
    }

    const hull = new cv.Mat()
    const approx = new cv.Mat()
    try {
      cv.convexHull(contour, hull, false, true)
      const peri = cv.arcLength(hull, true)
      cv.approxPolyDP(hull, approx, 0.02 * peri, true)
      if (approx.rows === 4 && cv.isContourConvex(approx)) {
        const corners = extractCornersFromApprox(approx, scaleBack)
        const ordered = orderCornersToQuad(corners, outW, outH)
        if (isValidDocumentQuad(ordered, outW, outH)) return ordered
      }
    } finally {
      hull.delete()
      approx.delete()
    }
    return null
  }

  for (const { contour } of ranked.slice(0, 10)) {
    const quad = tryContour(contour)
    if (quad) return quad
  }
  return null
}

/**
 * Deteksi dokumen OpenCV — sinkron (Wasm sudah dimuat)
 */
export const detectDocumentCornersOpenCVSync = (canvas, { fast = false } = {}) => {
  const cv = window.cv
  if (!cv?.Mat) throw new Error('OpenCV tidak tersedia')

  const src = cv.imread(canvas)
  let work = src
  let resized = null
  let scaleBack = 1
  const maxDim = fast ? LIVE_DETECTION_MAX_DIM : CAPTURE_DETECTION_MAX_DIM

  if (Math.max(canvas.width, canvas.height) > maxDim) {
    scaleBack = maxDim / Math.max(canvas.width, canvas.height)
    resized = new cv.Mat()
    cv.resize(
      src,
      resized,
      new cv.Size(Math.round(canvas.width * scaleBack), Math.round(canvas.height * scaleBack)),
      0,
      0,
      cv.INTER_AREA
    )
    work = resized
  }

  const imgW = work.cols
  const imgH = work.rows
  const gray = new cv.Mat()
  const blurred = new cv.Mat()
  const edges = new cv.Mat()
  const contours = new cv.MatVector()
  const hierarchy = new cv.Mat()
  let kernel = null

  try {
    cv.cvtColor(work, gray, cv.COLOR_RGBA2GRAY)
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0)

    const meanVal = cv.mean(blurred).val[0]
    const sigma = fast ? 0.4 : 0.33
    const lower = Math.max(0, Math.round((1 - sigma) * meanVal))
    const upper = Math.min(255, Math.round((1 + sigma) * meanVal))
    cv.Canny(blurred, edges, lower, upper)

    kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3))
    cv.dilate(edges, edges, kernel)

    cv.findContours(edges, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE)

    let quad = findBestQuadFromContours(cv, contours, imgW, imgH, scaleBack)

    if (!quad && !fast) {
      const thresh = new cv.Mat()
      const contours2 = new cv.MatVector()
      const hierarchy2 = new cv.Mat()
      try {
        cv.threshold(blurred, thresh, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU)
        cv.Canny(thresh, edges, 50, 150)
        cv.dilate(edges, edges, kernel)
        cv.findContours(edges, contours2, hierarchy2, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE)
        quad = findBestQuadFromContours(cv, contours2, imgW, imgH, scaleBack)
      } finally {
        thresh.delete()
        contours2.delete()
        hierarchy2.delete()
      }
    }

    return quad
  } finally {
    src.delete()
    if (resized) resized.delete()
    gray.delete()
    blurred.delete()
    edges.delete()
    contours.delete()
    hierarchy.delete()
    if (kernel) kernel.delete()
  }
}

/**
 * Deteksi dokumen menggunakan OpenCV (async wrapper — kompatibilitas ImageEditor)
 */
export const detectDocumentCornersOpenCV = async (canvas, options = {}) => {
  try {
    const { loadOpenCV, isOpenCVLoaded } = await import('./opencvLoader')
    if (!isOpenCVLoaded()) {
      await loadOpenCV()
    }
    if (!window.cv?.Mat) {
      throw new Error('OpenCV tidak tersedia')
    }
    const quad = detectDocumentCornersOpenCVSync(canvas, options)
    if (quad) return quad
    return detectDocumentCorners(canvas)
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
