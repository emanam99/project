/** Kualitas JPEG saat capture still (0–1) */
export const JPEG_CAPTURE_QUALITY = 0.92

/** Sisi terpanjang foto still — max ImageCapture sering hang di Android Chrome. */
export const STILL_CAPTURE_MAX_DIM = 1920

export function withTimeout(promise, ms, message = 'Timeout') {
  let timer = null
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms)
  })
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer)
  })
}

/**
 * Hentikan semua track MediaStream (indikator kamera browser ikut mati).
 * @param {MediaStream|null|undefined} stream
 */
export function stopMediaStream(stream) {
  if (!stream || typeof stream.getTracks !== 'function') return
  try {
    stream.getTracks().forEach((track) => {
      try {
        track.stop()
        track.enabled = false
      } catch {
        /* ignore */
      }
    })
  } catch {
    /* ignore */
  }
}

/**
 * Lepas srcObject dari elemen video lalu hentikan stream-nya.
 * @param {HTMLVideoElement|null|undefined} videoEl
 * @param {MediaStream|null|undefined} [fallbackStream] — jika video sudah unmount
 */
export function releaseVideoStream(videoEl, fallbackStream = null) {
  const fromVideo = videoEl?.srcObject instanceof MediaStream ? videoEl.srcObject : null
  if (videoEl) {
    try {
      videoEl.pause?.()
    } catch {
      /* ignore */
    }
    try {
      videoEl.srcObject = null
    } catch {
      /* ignore */
    }
  }
  stopMediaStream(fromVideo)
  if (fallbackStream && fallbackStream !== fromVideo) {
    stopMediaStream(fallbackStream)
  }
}

const RESOLUTION_PRESETS = [
  { width: { ideal: 4096 }, height: { ideal: 3072 } },
  { width: { ideal: 3840 }, height: { ideal: 2160 } },
  { width: { ideal: 2560 }, height: { ideal: 1440 } },
  { width: { ideal: 1920, min: 1280 }, height: { ideal: 1080, min: 720 } }
]

/**
 * Terapkan resolusi maks & autofocus/eksposur jika didukung perangkat.
 */
export async function enhanceVideoTrack(track) {
  if (!track?.getCapabilities || !track.applyConstraints) return

  const caps = track.getCapabilities()
  const attempt = async (constraints) => {
    try {
      await track.applyConstraints(constraints)
      return true
    } catch {
      return false
    }
  }

  const advanced = []
  if (caps.focusMode?.includes('continuous')) advanced.push({ focusMode: 'continuous' })
  if (caps.exposureMode?.includes('continuous')) advanced.push({ exposureMode: 'continuous' })
  if (caps.whiteBalanceMode?.includes('continuous')) {
    advanced.push({ whiteBalanceMode: 'continuous' })
  }

  const withAdvanced = {}
  if (caps.width?.max && caps.height?.max) {
    withAdvanced.width = { ideal: caps.width.max }
    withAdvanced.height = { ideal: caps.height.max }
  }
  if (advanced.length) withAdvanced.advanced = advanced

  if (Object.keys(withAdvanced).length && (await attempt(withAdvanced))) return

  if (withAdvanced.width) {
    await attempt({ width: withAdvanced.width, height: withAdvanced.height })
  }
}

/**
 * Buka kamera dengan resolusi setinggi mungkin + optimasi track.
 * @param {string} [deviceId]
 * @param {{ facingMode?: string }} [options]
 */
export async function openMaxQualityCamera(deviceId, options = {}) {
  let lastError = null
  const facingMode = options.facingMode || null

  for (const size of RESOLUTION_PRESETS) {
    try {
      const video = {
        ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
        ...(facingMode && !deviceId ? { facingMode: { ideal: facingMode } } : {}),
        ...size,
        frameRate: { ideal: 30 }
      }
      const stream = await navigator.mediaDevices.getUserMedia({ video, audio: false })
      const track = stream.getVideoTracks()[0]
      if (track) await enhanceVideoTrack(track)
      return stream
    } catch (err) {
      lastError = err
      if (err.name !== 'OverconstrainedError') throw err
    }
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    video: deviceId
      ? { deviceId: { exact: deviceId } }
      : facingMode
        ? { facingMode: { ideal: facingMode } }
        : true,
    audio: false
  })
  const track = stream.getVideoTracks()[0]
  if (track) await enhanceVideoTrack(track)
  if (lastError) {
    /* fallback stream OK */
  }
  return stream
}

/**
 * Apakah track mendukung torch/flash.
 * @param {MediaStreamTrack|null|undefined} track
 */
export function trackSupportsTorch(track) {
  try {
    const caps = track?.getCapabilities?.()
    return Boolean(caps && 'torch' in caps && caps.torch)
  } catch {
    return false
  }
}

/**
 * Nyalakan/matikan torch kamera (HP yang mendukung).
 * @param {MediaStreamTrack|null|undefined} track
 * @param {boolean} enabled
 * @returns {Promise<boolean>} true jika berhasil diterapkan
 */
export async function setTrackTorch(track, enabled) {
  if (!trackSupportsTorch(track)) return false
  try {
    await track.applyConstraints({ advanced: [{ torch: Boolean(enabled) }] })
    return true
  } catch {
    try {
      await track.applyConstraints({ torch: Boolean(enabled) })
      return true
    } catch {
      return false
    }
  }
}

function drawScaledToCanvas(source, maxDim) {
  const srcW = source.videoWidth || source.naturalWidth || source.width || 1920
  const srcH = source.videoHeight || source.naturalHeight || source.height || 1080
  let w = srcW
  let h = srcH
  if (maxDim && Math.max(w, h) > maxDim) {
    const scale = maxDim / Math.max(w, h)
    w = Math.round(w * scale)
    h = Math.round(h * scale)
  }
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(source, 0, 0, w, h)
  return { canvas, w, h }
}

function canvasToJpegBlob(canvas, quality = JPEG_CAPTURE_QUALITY) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Gagal membuat blob dari canvas'))),
      'image/jpeg',
      quality
    )
  })
}

/**
 * Ambil foto still — ImageCapture (tanpa max foto) atau fallback canvas video.
 * Max resolusi dibatasi agar HP tidak hang di toBlob/OpenCV.
 */
export async function captureStillFrame(stream, videoEl) {
  const track = stream?.getVideoTracks?.()[0]

  if (track && typeof ImageCapture !== 'undefined') {
    try {
      const capturer = new ImageCapture(track)
      const blob = await withTimeout(capturer.takePhoto(), 2500, 'ImageCapture timeout')
      if (blob?.size) {
        return { blob, source: 'imageCapture' }
      }
    } catch (err) {
      console.warn('ImageCapture tidak tersedia, fallback canvas:', err)
    }
  }

  const { canvas, w, h } = drawScaledToCanvas(videoEl, STILL_CAPTURE_MAX_DIM)
  const blob = await withTimeout(canvasToJpegBlob(canvas), 4000, 'toBlob timeout')
  return { blob, canvas, w, h, source: 'canvas' }
}

/** Muat blob JPEG ke canvas, downscale jika lebih besar dari maxDim. */
export function blobToCaptureCanvas(blob, maxDim = STILL_CAPTURE_MAX_DIM) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(blob)
    const timer = setTimeout(() => {
      URL.revokeObjectURL(url)
      reject(new Error('Timeout memuat foto capture'))
    }, 6000)
    img.onload = () => {
      clearTimeout(timer)
      const { canvas, w, h } = drawScaledToCanvas(img, maxDim)
      URL.revokeObjectURL(url)
      resolve({ canvas, w, h })
    }
    img.onerror = () => {
      clearTimeout(timer)
      URL.revokeObjectURL(url)
      reject(new Error('Gagal memuat foto capture'))
    }
    img.src = url
  })
}
