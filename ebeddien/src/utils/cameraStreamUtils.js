/** Kualitas JPEG saat capture still (0–1) */
export const JPEG_CAPTURE_QUALITY = 0.96

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

/**
 * Ambil foto still — ImageCapture (resolusi foto penuh) atau fallback canvas video frame.
 */
export async function captureStillFrame(stream, videoEl) {
  const track = stream?.getVideoTracks?.()[0]

  if (track && typeof ImageCapture !== 'undefined') {
    try {
      const capturer = new ImageCapture(track)
      const photoSettings = {}

      if (capturer.getPhotoCapabilities) {
        const photoCaps = await capturer.getPhotoCapabilities()
        if (photoCaps.imageWidth?.max) photoSettings.imageWidth = photoCaps.imageWidth.max
        if (photoCaps.imageHeight?.max) photoSettings.imageHeight = photoCaps.imageHeight.max
      }

      const blob = await capturer.takePhoto(
        Object.keys(photoSettings).length ? photoSettings : undefined
      )
      if (blob?.size) {
        return { blob, source: 'imageCapture' }
      }
    } catch (err) {
      console.warn('ImageCapture tidak tersedia, fallback canvas:', err)
    }
  }

  const w = videoEl?.videoWidth || 1920
  const h = videoEl?.videoHeight || 1080
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(videoEl, 0, 0, w, h)

  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Gagal membuat blob dari canvas'))),
      'image/jpeg',
      JPEG_CAPTURE_QUALITY
    )
  })

  return { blob, canvas, w, h, source: 'canvas' }
}

/** Muat blob JPEG ke canvas resolusi penuh */
export function blobToCaptureCanvas(blob) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(blob)
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      ctx.imageSmoothingEnabled = false
      ctx.drawImage(img, 0, 0)
      URL.revokeObjectURL(url)
      resolve({ canvas, w: canvas.width, h: canvas.height })
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Gagal memuat foto capture'))
    }
    img.src = url
  })
}
