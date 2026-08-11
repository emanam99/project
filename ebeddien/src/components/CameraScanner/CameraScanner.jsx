import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { autoEnhanceImage, detectBrightness } from '../../utils/imageEnhancement'
import {
  detectDocumentCornersBest,
  drawVideoFrameToCanvas,
  scaleCornersFromDetection,
  isValidDocumentQuad,
  LIVE_DETECTION_MAX_DIM,
  perspectiveTransform,
  orderCornersToQuad
} from '../../utils/documentDetection'
import { loadOpenCV } from '../../utils/opencvLoader'
import {
  openMaxQualityCamera,
  captureStillFrame,
  blobToCaptureCanvas,
  JPEG_CAPTURE_QUALITY,
  releaseVideoStream,
  stopMediaStream,
  trackSupportsTorch,
  setTrackTorch,
} from '../../utils/cameraStreamUtils'

const DETECTION_MIN_INTERVAL_MS = 120

/** Frame panduan sesuai jenis berkas (kamera tetap portrait; kotak bisa landscape untuk KTP/KK). */
function getGuideFrame(jenisBerkas) {
  const j = String(jenisBerkas || '')
  if (/KTP/i.test(j)) {
    return {
      boxClass: 'w-[92%] max-w-md aspect-[1.586] rounded-lg',
      hint: 'Posisikan KTP horizontal di dalam kotak',
    }
  }
  if (/KK/i.test(j)) {
    return {
      boxClass: 'w-[92%] max-w-lg aspect-[1.414] rounded-lg',
      hint: 'Posisikan KK horizontal di dalam kotak',
    }
  }
  return {
    boxClass: 'w-4/5 max-w-md aspect-[3/4] rounded-lg',
    hint: 'Posisikan dokumen dalam frame',
  }
}

/** Pilih kamera belakang untuk scan dokumen (label atau indeks 0). */
const pickDefaultBackCameraId = (cameras, preferredDeviceId = null) => {
  if (!cameras?.length) return null
  if (preferredDeviceId && cameras.some((c) => c.deviceId === preferredDeviceId)) {
    return preferredDeviceId
  }
  if (cameras.length === 1) return cameras[0].deviceId

  const backPattern = /back|rear|environment|belakang|world|wide/i
  const frontPattern = /front|user|selfie|depan|face|facetime/i

  const backLabeled = cameras.find((c) => backPattern.test(c.label))
  if (backLabeled) return backLabeled.deviceId

  const nonFront = cameras.find((c) => !frontPattern.test(c.label))
  if (nonFront) return nonFront.deviceId

  return cameras[0].deviceId
}

/**
 * Scanner kamera — disamakan dengan aplikasi daftar:
 * - Full layar di paling atas (render ke document.body via portal)
 * - Daftar kamera (pilih kamera depan/belakang atau perangkat)
 * - Monitoring kecerahan otomatis (deteksi gelap/terang)
 * - Deteksi kertas live via OpenCV.js Wasm (fallback JS Sobel)
 * - Auto-enhance saat capture
 * - Overlay panduan "Posisikan dokumen dalam frame"
 */
function CameraScanner({ onCapture, onClose, autoEnhance = true, jenisBerkas = null }) {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)
  const [isCapturing, setIsCapturing] = useState(false)
  const [brightnessInfo, setBrightnessInfo] = useState(null)
  const [showPreview, setShowPreview] = useState(false)
  const [previewImage, setPreviewImage] = useState(null)
  const [capturedFile, setCapturedFile] = useState(null)
  const [croppedFile, setCroppedFile] = useState(null)
  const [availableCameras, setAvailableCameras] = useState([])
  const [selectedCameraId, setSelectedCameraId] = useState(null)
  const [detectedCorners, setDetectedCorners] = useState(null)
  const [opencvReady, setOpenCVReady] = useState(false)
  const [opencvLoading, setOpenCVLoading] = useState(true)
  const [autoDetectEnabled, setAutoDetectEnabled] = useState(true)
  const [torchSupported, setTorchSupported] = useState(false)
  const [torchOn, setTorchOn] = useState(false)
  const brightnessCheckInterval = useRef(null)
  const documentDetectionRafRef = useRef(null)
  const lastDetectionTimeRef = useRef(0)
  const detectionMissRef = useRef(0)
  const showPreviewRef = useRef(false)
  const containerRef = useRef(null)
  const overlayCanvasRef = useRef(null)
  const tempCanvasRef = useRef(null)
  const smoothedCornersRef = useRef(null)
  const opencvReadyRef = useRef(false)
  const autoDetectEnabledRef = useRef(true)
  const detectionBusyRef = useRef(false)
  const mountedRef = useRef(true)
  const SMOOTH = 0.58

  const smoothCorners = useCallback((raw, prev) => {
    if (!prev) return raw
    return raw.map((p, i) => ({
      x: prev[i].x * (1 - SMOOTH) + p.x * SMOOTH,
      y: prev[i].y * (1 - SMOOTH) + p.y * SMOOTH
    }))
  }, [])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    setOpenCVLoading(true)
    loadOpenCV()
      .then(() => {
        if (cancelled) return
        opencvReadyRef.current = true
        setOpenCVReady(true)
      })
      .catch((err) => {
        console.warn('OpenCV gagal dimuat, deteksi memakai fallback JS:', err)
        if (!cancelled) {
          opencvReadyRef.current = false
          setOpenCVReady(false)
        }
      })
      .finally(() => {
        if (!cancelled) setOpenCVLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const detectCornersFromVideo = useCallback(async (video, maxDim = null, fast = false) => {
    let temp = tempCanvasRef.current
    if (!temp) {
      temp = document.createElement('canvas')
      tempCanvasRef.current = temp
    }
    const { scale, srcWidth, srcHeight } = drawVideoFrameToCanvas(video, temp, maxDim)
    const corners = await detectDocumentCornersBest(temp, { useOpenCV: opencvReadyRef.current, fast })
    const scaled = scaleCornersFromDetection(corners, scale)
    if (!scaled || !isValidDocumentQuad(scaled, srcWidth, srcHeight)) return null
    return orderCornersToQuad(scaled, srcWidth, srcHeight)
  }, [])

  useEffect(() => {
    const getCameras = async () => {
      try {
        let tempStream = null
        let preferredDeviceId = null
        try {
          tempStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: 'environment' } }
          })
          preferredDeviceId = tempStream.getVideoTracks()[0]?.getSettings()?.deviceId || null
        } catch (permErr) {
          console.warn('Kamera belakang tidak tersedia, coba kamera default:', permErr)
          try {
            tempStream = await navigator.mediaDevices.getUserMedia({ video: true })
            preferredDeviceId = tempStream.getVideoTracks()[0]?.getSettings()?.deviceId || null
          } catch (fallbackErr) {
            console.warn('Camera permission not granted:', fallbackErr)
          }
        }

        const devices = await navigator.mediaDevices.enumerateDevices()
        const videoDevices = devices.filter((d) => d.kind === 'videoinput')

        if (tempStream) {
          tempStream.getTracks().forEach((track) => {
            track.stop()
            track.enabled = false
          })
          await new Promise((r) => setTimeout(r, 500))
        }

        const cameras = videoDevices.map((device, index) => ({
          deviceId: device.deviceId,
          label: device.label || `Kamera ${index}`,
          index
        }))
        setAvailableCameras(cameras)
        if (cameras.length > 0 && !selectedCameraId) {
          const defaultId = pickDefaultBackCameraId(cameras, preferredDeviceId)
          setTimeout(() => setSelectedCameraId(defaultId), 100)
        }
      } catch (err) {
        console.error('Error getting cameras:', err)
      }
    }
    getCameras()
  }, [])

  useEffect(() => {
    if (selectedCameraId) {
      stopCamera()
      const timer = setTimeout(() => startCamera(), 300)
      return () => {
        clearTimeout(timer)
        stopCamera()
        setTimeout(() => {
          if (brightnessCheckInterval.current) {
            clearInterval(brightnessCheckInterval.current)
            brightnessCheckInterval.current = null
          }
        }, 100)
      }
    } else {
      return () => {
        stopCamera()
        if (brightnessCheckInterval.current) {
          clearInterval(brightnessCheckInterval.current)
          brightnessCheckInterval.current = null
        }
      }
    }
  }, [selectedCameraId])

  const startCamera = async () => {
    try {
      setIsLoading(true)
      setError(null)

      const stream = await openMaxQualityCamera(selectedCameraId || undefined, {
        facingMode: selectedCameraId ? undefined : 'environment',
      })
      if (!mountedRef.current || !videoRef.current) {
        stopMediaStream(stream)
        return
      }
      streamRef.current = stream
      const track = stream.getVideoTracks()[0]
      setTorchSupported(trackSupportsTorch(track))
      setTorchOn(false)

      if (videoRef.current.srcObject) {
        const prevStream = videoRef.current.srcObject
        if (prevStream instanceof MediaStream && prevStream !== stream) {
          stopMediaStream(prevStream)
        }
      }
      videoRef.current.srcObject = stream

      const handleLoadedMetadata = () => {
        setIsLoading(false)
        setTimeout(() => startBrightnessMonitoring(), 200)
      }
      const handleLoadedData = () => setIsLoading(false)
      const handlePlaying = () => setIsLoading(false)
      const handleError = (e) => {
        console.error('Video error:', e)
        setError('Gagal memuat video. Silakan coba lagi.')
        setIsLoading(false)
      }

      videoRef.current.removeEventListener('loadedmetadata', handleLoadedMetadata)
      videoRef.current.removeEventListener('loadeddata', handleLoadedData)
      videoRef.current.removeEventListener('playing', handlePlaying)
      videoRef.current.removeEventListener('error', handleError)
      videoRef.current.addEventListener('loadedmetadata', handleLoadedMetadata, { once: true })
      videoRef.current.addEventListener('loadeddata', handleLoadedData, { once: true })
      videoRef.current.addEventListener('playing', handlePlaying, { once: true })
      videoRef.current.addEventListener('error', handleError, { once: true })

      const playVideo = async () => {
        try {
          await videoRef.current.play()
          setIsLoading(false)
        } catch (playError) {
          setTimeout(async () => {
            try {
              if (videoRef.current?.srcObject) {
                await videoRef.current.play()
                setIsLoading(false)
              }
            } catch {
              setError('Gagal memutar video. Silakan coba lagi.')
              setIsLoading(false)
            }
          }, 500)
        }
      }
      playVideo()
    } catch (err) {
      console.error('Error accessing camera:', err)
      let msg = 'Tidak dapat mengakses kamera.'
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        msg = 'Izin kamera ditolak. Silakan berikan izin kamera di pengaturan browser.'
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        msg = 'Kamera tidak ditemukan. Pastikan perangkat memiliki kamera.'
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        msg = 'Kamera sedang digunakan oleh aplikasi lain.'
      }
      setError(msg)
      setIsLoading(false)
    }
  }

  const stopCamera = () => {
    const held = streamRef.current
    streamRef.current = null
    setTorchOn(false)
    setTorchSupported(false)
    releaseVideoStream(videoRef.current, held)
    if (brightnessCheckInterval.current) {
      clearInterval(brightnessCheckInterval.current)
      brightnessCheckInterval.current = null
    }
    if (documentDetectionRafRef.current) {
      cancelAnimationFrame(documentDetectionRafRef.current)
      documentDetectionRafRef.current = null
    }
    setDetectedCorners(null)
    smoothedCornersRef.current = null
    detectionMissRef.current = 0
  }

  const stopDocumentDetectionLoop = () => {
    if (documentDetectionRafRef.current) {
      cancelAnimationFrame(documentDetectionRafRef.current)
      documentDetectionRafRef.current = null
    }
  }

  const startDocumentDetectionLoop = useCallback(() => {
    stopDocumentDetectionLoop()
    lastDetectionTimeRef.current = 0

    const tick = () => {
      documentDetectionRafRef.current = requestAnimationFrame(async () => {
        const video = videoRef.current
        const now = performance.now()
        const due = now - lastDetectionTimeRef.current >= DETECTION_MIN_INTERVAL_MS

        if (video && video.readyState >= 2 && due && !detectionBusyRef.current && autoDetectEnabledRef.current) {
          lastDetectionTimeRef.current = now
          detectionBusyRef.current = true
          try {
            const raw = await detectCornersFromVideo(video, LIVE_DETECTION_MAX_DIM, true)
            if (raw) {
              detectionMissRef.current = 0
              const smoothed = smoothCorners(raw, smoothedCornersRef.current)
              smoothedCornersRef.current = smoothed
              setDetectedCorners(smoothed)
            } else {
              detectionMissRef.current += 1
              if (detectionMissRef.current > 4) {
                smoothedCornersRef.current = null
                setDetectedCorners(null)
              }
            }
          } catch {
            detectionMissRef.current += 1
          } finally {
            detectionBusyRef.current = false
          }
        }

        if (videoRef.current && !showPreviewRef.current) {
          tick()
        }
      })
    }
    tick()
  }, [detectCornersFromVideo, smoothCorners])

  useEffect(() => {
    showPreviewRef.current = showPreview
    autoDetectEnabledRef.current = autoDetectEnabled
    if (!showPreview && autoDetectEnabled && videoRef.current?.readyState >= 2 && selectedCameraId) {
      startDocumentDetectionLoop()
    } else if (showPreview || !autoDetectEnabled) {
      stopDocumentDetectionLoop()
      if (!autoDetectEnabled) {
        smoothedCornersRef.current = null
        setDetectedCorners(null)
        detectionMissRef.current = 0
      }
    }
  }, [showPreview, autoDetectEnabled, selectedCameraId, startDocumentDetectionLoop])

  const handleToggleAutoDetect = () => {
    setAutoDetectEnabled((prev) => !prev)
  }

  const selectedCameraIndex = availableCameras.findIndex((c) => c.deviceId === selectedCameraId)
  const selectedCameraLabel = selectedCameraIndex >= 0 ? availableCameras[selectedCameraIndex]?.label : ''

  const startBrightnessMonitoring = () => {
    if (brightnessCheckInterval.current) clearInterval(brightnessCheckInterval.current)
    const checkVideoReady = () => {
      if (videoRef.current?.readyState >= 2) {
        brightnessCheckInterval.current = setInterval(() => {
          try {
            if (videoRef.current && canvasRef.current) {
              const video = videoRef.current
              const canvas = canvasRef.current
              if (video.readyState < 2) return
              const ctx = canvas.getContext('2d')
              const w = video.videoWidth || 640
              const h = video.videoHeight || 480
              if (w > 0 && h > 0) {
                canvas.width = w
                canvas.height = h
                ctx.drawImage(video, 0, 0, w, h)
                const imageData = ctx.getImageData(0, 0, w, h)
                setBrightnessInfo(detectBrightness(imageData))
              }
            }
          } catch (e) {
            console.warn('Error checking brightness:', e)
          }
        }, 500)
        if (autoDetectEnabledRef.current) {
          startDocumentDetectionLoop()
        }
      } else {
        setTimeout(checkVideoReady, 100)
      }
    }
    checkVideoReady()
  }

  const createFileFromCanvas = (sourceCanvas) =>
    new Promise((resolve, reject) => {
      sourceCanvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(new File([blob], `scan_${Date.now()}.jpg`, { type: 'image/jpeg', lastModified: Date.now() }))
          } else reject(new Error('Gagal membuat blob dari canvas'))
        },
        'image/jpeg',
        JPEG_CAPTURE_QUALITY
      )
    })

  const syncHiddenCanvas = (sourceCanvas, w, h) => {
    const canvas = canvasRef.current
    if (!canvas) return sourceCanvas
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(sourceCanvas, 0, 0, w, h)
    return canvas
  }

  const handleCapture = async () => {
    if (!videoRef.current || isCapturing) return
    setIsCapturing(true)
    setError(null)
    setCroppedFile(null)
    try {
      const video = videoRef.current
      if (video.readyState < 2) throw new Error('Video belum siap')

      const still = await captureStillFrame(streamRef.current, video)
      const { canvas: captureCanvas, w, h } = await blobToCaptureCanvas(still.blob)
      if (!w || !h) throw new Error('Ukuran foto tidak valid')

      syncHiddenCanvas(captureCanvas, w, h)
      const videoW = video.videoWidth || w
      const videoH = video.videoHeight || h
      const cornerScaleX = w / videoW
      const cornerScaleY = h / videoH

      const scaleCornersToCapture = (corners) => {
        if (!corners || cornerScaleX === 1 && cornerScaleY === 1) return corners
        return corners.map((p) => ({
          x: p.x * cornerScaleX,
          y: p.y * cornerScaleY
        }))
      }

      const fullFile = await (async () => {
        const blobFile = new File([still.blob], `scan_${Date.now()}.jpg`, {
          type: 'image/jpeg',
          lastModified: Date.now()
        })
        if (autoEnhance) {
          try {
            const enhancePromise = autoEnhanceImage(captureCanvas, opencvReadyRef.current)
            const timeoutPromise = new Promise((_, rej) => setTimeout(() => rej(new Error('Timeout')), 8000))
            return await Promise.race([enhancePromise, timeoutPromise])
          } catch {
            return blobFile
          }
        }
        return blobFile
      })()

      if (!fullFile?.size) throw new Error('Gagal membuat file dari gambar')
      setCapturedFile(fullFile)
      setPreviewImage(captureCanvas.toDataURL('image/jpeg', JPEG_CAPTURE_QUALITY))

      try {
        if (autoDetectEnabled) {
          let corners = scaleCornersToCapture(smoothedCornersRef.current)
          if (!corners || !isValidDocumentQuad(corners, w, h)) {
            corners = await detectDocumentCornersBest(captureCanvas, {
              useOpenCV: opencvReadyRef.current,
              fast: false
            })
          }
          const ordered = corners ? orderCornersToQuad(corners, w, h) : null
          if (ordered && isValidDocumentQuad(ordered, w, h)) {
            const warped = perspectiveTransform(captureCanvas, ordered)
            setPreviewImage(warped.toDataURL('image/jpeg', JPEG_CAPTURE_QUALITY))
            const cropped = await createFileFromCanvas(warped)
            if (cropped?.size) setCroppedFile(cropped)
          }
        }
      } catch (_) {}

      setShowPreview(true)
    } catch (err) {
      setError(err.message || 'Gagal mengambil gambar. Silakan coba lagi.')
    } finally {
      setIsCapturing(false)
    }
  }

  const handleRetake = () => {
    setShowPreview(false)
    setPreviewImage(null)
    setCapturedFile(null)
    setCroppedFile(null)
  }

  const handleConfirmCrop = () => {
    const fileToUse = croppedFile && croppedFile.size > 0 ? croppedFile : capturedFile
    if (fileToUse) {
      try {
        onCapture?.(fileToUse)
      } catch (err) {
        setError('Gagal mengirim file. Silakan coba lagi.')
        return
      }
    }
    stopCamera()
    onClose?.()
  }

  const handleConfirmNoCrop = () => {
    if (capturedFile) {
      try {
        onCapture?.(capturedFile)
      } catch (err) {
        setError('Gagal mengirim file. Silakan coba lagi.')
        return
      }
    }
    stopCamera()
    onClose?.()
  }

  const handleCloseScanner = () => {
    stopCamera()
    onClose?.()
  }

  const handleCameraChange = (e) => setSelectedCameraId(e.target.value || null)

  const drawOverlay = useCallback(() => {
    const container = containerRef.current
    const video = videoRef.current
    const overlay = overlayCanvasRef.current
    if (!container || !video || !overlay) return
    const containerRect = container.getBoundingClientRect()
    const videoRect = video.getBoundingClientRect()
    const vw = video.videoWidth || 1
    const vh = video.videoHeight || 1
    const scaleX = videoRect.width / vw
    const scaleY = videoRect.height / vh
    overlay.width = videoRect.width
    overlay.height = videoRect.height
    overlay.style.position = 'absolute'
    overlay.style.left = `${videoRect.left - containerRect.left}px`
    overlay.style.top = `${videoRect.top - containerRect.top}px`
    overlay.style.width = `${videoRect.width}px`
    overlay.style.height = `${videoRect.height}px`
    overlay.style.pointerEvents = 'none'
    overlay.style.zIndex = 6
    const ctx = overlay.getContext('2d')
    ctx.clearRect(0, 0, overlay.width, overlay.height)
    if (detectedCorners && detectedCorners.length >= 4 && autoDetectEnabledRef.current) {
      ctx.strokeStyle = 'rgba(0, 255, 120, 0.9)'
      ctx.fillStyle = 'rgba(0, 255, 120, 0.12)'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(detectedCorners[0].x * scaleX, detectedCorners[0].y * scaleY)
      for (let i = 1; i < detectedCorners.length; i++) {
        ctx.lineTo(detectedCorners[i].x * scaleX, detectedCorners[i].y * scaleY)
      }
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
    }
  }, [detectedCorners])

  useEffect(() => {
    if (showPreview || isLoading || error) return
    drawOverlay()
    const container = containerRef.current
    if (!container) return
    const ro = new ResizeObserver(() => drawOverlay())
    ro.observe(container)
    return () => ro.disconnect()
  }, [showPreview, isLoading, error, detectedCorners, drawOverlay])

  const getBrightnessIndicator = () => {
    if (!brightnessInfo) return null
    const { isDark, isTooBright, brightness } = brightnessInfo
    let message = 'Cahaya cukup'
    let color = 'bg-green-500'
    if (isDark) {
      message = 'Cahaya terlalu gelap'
      color = 'bg-red-500'
    } else if (isTooBright) {
      message = 'Cahaya terlalu terang'
      color = 'bg-yellow-500'
    }
    return (
      <div className="absolute top-4 left-4 right-4 z-10">
        <div className={`${color} text-white px-4 py-2 rounded-lg shadow-lg flex items-center gap-2`}>
          <div className="flex-1">
            <div className="text-sm font-medium">{message}</div>
            <div className="text-xs opacity-90">Kecerahan: {Math.round(brightness)}</div>
          </div>
          {brightnessInfo.needsCorrection && autoEnhance && (
            <div className="text-xs bg-white/20 px-2 py-1 rounded">Auto-enhance aktif</div>
          )}
        </div>
      </div>
    )
  }

  const scannerContent =
    showPreview && previewImage ? (
      <div className="fixed inset-0 min-h-screen min-w-full bg-black flex flex-col z-[99999]" style={{ isolation: 'isolate' }}>
        <div className="flex-shrink-0 p-4 bg-gray-900 flex items-center justify-between">
          <h2 className="text-white text-lg font-semibold">Preview</h2>
          <button type="button" onClick={handleRetake} className="text-white hover:text-gray-300">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        {jenisBerkas && (
          <div className="flex-shrink-0 bg-teal-600/80 backdrop-blur-sm px-4 py-2">
            <div className="flex items-center gap-2 text-white">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span className="text-sm font-medium">Sedang upload: <span className="font-semibold">{jenisBerkas}</span></span>
            </div>
          </div>
        )}
        <div className="flex-1 overflow-y-auto overflow-x-hidden">
          <div className="min-h-full flex items-center justify-center p-4">
            <img src={previewImage} alt="Preview" className="max-w-full h-auto object-contain" />
          </div>
        </div>
        <div className="flex-shrink-0 p-4 bg-gray-900 border-t border-gray-700 space-y-2">
          <div className="flex gap-2">
            <button type="button" onClick={handleRetake} className="flex-1 px-4 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-semibold">
              Ambil Ulang
            </button>
            <button type="button" onClick={handleConfirmCrop} className="flex-1 px-4 py-3 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-semibold">
              Crop
            </button>
            <button type="button" onClick={handleConfirmNoCrop} className="flex-1 px-4 py-3 bg-gray-600 hover:bg-gray-500 text-white rounded-lg font-semibold">
              Tanpa Crop
            </button>
          </div>
          <p className="text-center text-gray-400 text-xs">Lalu diarahkan ke halaman edit gambar</p>
        </div>
      </div>
    ) : (
      <div className="fixed inset-0 min-h-screen min-w-full bg-black flex flex-col z-[99999]" style={{ isolation: 'isolate' }}>
        <div className="flex-shrink-0 px-3 py-2 bg-gray-900 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={async () => {
              const track = streamRef.current?.getVideoTracks?.()[0]
              if (!trackSupportsTorch(track)) return
              const next = !torchOn
              const ok = await setTrackTorch(track, next)
              if (ok) setTorchOn(next)
            }}
            disabled={isLoading || isCapturing || !torchSupported}
            title={
              torchSupported
                ? torchOn
                  ? 'Matikan flash'
                  : 'Nyalakan flash'
                : 'Flash tidak didukung perangkat ini'
            }
            aria-label={torchOn ? 'Matikan flash' : 'Nyalakan flash'}
            aria-pressed={torchOn}
            className={`p-2 rounded-lg border flex-shrink-0 disabled:opacity-40 ${
              torchOn
                ? 'bg-amber-500 border-amber-400 text-black'
                : 'bg-gray-800 border-gray-700 text-gray-300'
            }`}
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M7 2v11h3v9l7-12h-4l4-8z" />
            </svg>
          </button>
          <button
            type="button"
            onClick={handleToggleAutoDetect}
            disabled={isLoading || isCapturing}
            title={autoDetectEnabled ? 'Matikan deteksi otomatis' : 'Nyalakan deteksi otomatis'}
            aria-label={
              autoDetectEnabled ? 'Matikan deteksi otomatis kertas' : 'Nyalakan deteksi otomatis kertas'
            }
            aria-pressed={autoDetectEnabled}
            className={`p-2 rounded-lg border flex-shrink-0 disabled:opacity-40 ${
              autoDetectEnabled
                ? 'bg-teal-600 border-teal-500 text-white'
                : 'bg-gray-800 border-gray-700 text-gray-400'
            }`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zM14 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z"
              />
            </svg>
          </button>
          {availableCameras.length > 0 && (
            <select
              value={selectedCameraId || ''}
              onChange={handleCameraChange}
              disabled={isLoading || isCapturing}
              title={selectedCameraLabel}
              aria-label={`Kamera ${selectedCameraIndex >= 0 ? selectedCameraIndex : ''}`}
              className="w-10 min-w-[2.5rem] max-w-[2.5rem] px-0 py-2 bg-gray-800 text-white rounded-lg border border-gray-700 focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm text-center disabled:opacity-50 appearance-none"
            >
              {availableCameras.map((c) => (
                <option key={c.deviceId} value={c.deviceId}>
                  {c.index}
                </option>
              ))}
            </select>
          )}
          <button type="button" onClick={handleCloseScanner} className="text-white hover:text-gray-300 flex-shrink-0 p-1" aria-label="Tutup scanner">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        {jenisBerkas && (
          <div className="flex-shrink-0 bg-teal-600/80 backdrop-blur-sm px-4 py-2">
            <div className="flex items-center gap-2 text-white">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span className="text-sm font-medium">Sedang upload: <span className="font-semibold">{jenisBerkas}</span></span>
            </div>
          </div>
        )}
        <div ref={containerRef} className="flex-1 relative flex items-center justify-center overflow-hidden bg-black min-h-0">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="absolute inset-0 w-full h-full object-contain bg-black"
            style={{
              zIndex: 1,
              display: isLoading || error ? 'none' : 'block',
              minWidth: '100%',
              minHeight: '100%',
              width: '100%',
              height: '100%'
            }}
          />
          <canvas ref={overlayCanvasRef} aria-hidden="true" />
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-black z-20">
              <div className="text-white text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4" />
                <p>Memuat kamera...</p>
                {opencvLoading && (
                  <p className="text-gray-400 text-sm mt-2">Memuat deteksi dokumen (OpenCV)...</p>
                )}
              </div>
            </div>
          )}
          {error && (
            <div className="absolute inset-0 flex items-center justify-center bg-black p-4 z-20">
              <div className="text-white text-center">
                <p className="mb-4">{error}</p>
                <button type="button" onClick={startCamera} className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg">
                  Coba Lagi
                </button>
              </div>
            </div>
          )}
          {!isLoading && !error && (
            <>
              {getBrightnessIndicator()}
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-[5] overflow-hidden">
                {(() => {
                  const guide = getGuideFrame(jenisBerkas)
                  return (
                    <div
                      className={`relative border-2 border-white border-dashed shadow-[0_0_0_9999px_rgba(0,0,0,0.4)] ${guide.boxClass}`}
                    >
                      <div className="absolute -top-8 left-0 right-0 text-center text-white text-sm drop-shadow">
                        {guide.hint}
                      </div>
                    </div>
                  )
                })()}
              </div>
            </>
          )}
          <canvas ref={canvasRef} className="hidden" />
        </div>
        {!isLoading && !error && (
          <div className="flex-shrink-0 p-6 bg-gray-900 border-t border-gray-700">
            <button
              type="button"
              onClick={handleCapture}
              disabled={isCapturing}
              className="w-full px-6 py-4 bg-teal-600 hover:bg-teal-700 disabled:bg-gray-600 text-white rounded-full flex items-center justify-center gap-2 font-semibold"
            >
              {isCapturing ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
                  <span>Memproses...</span>
                </>
              ) : (
                <>
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <span>Ambil Foto</span>
                </>
              )}
            </button>
            {autoEnhance && (
              <p className="mt-2 text-center text-gray-400 text-xs">Auto-enhance cahaya aktif</p>
            )}
          </div>
        )}
      </div>
    )

  return typeof document !== 'undefined' ? createPortal(scannerContent, document.body) : scannerContent
}

export default CameraScanner
