import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { autoEnhanceImage, detectBrightness } from '../../utils/imageEnhancement'
import { detectDocumentCorners, perspectiveTransform, orderCornersToQuad } from '../../utils/documentDetection'

/**
 * Scanner kamera — disamakan dengan aplikasi daftar:
 * - Full layar di paling atas (render ke document.body via portal)
 * - Daftar kamera (pilih kamera depan/belakang atau perangkat)
 * - Monitoring kecerahan otomatis (deteksi gelap/terang)
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
  const brightnessCheckInterval = useRef(null)
  const documentDetectionInterval = useRef(null)
  const containerRef = useRef(null)
  const overlayCanvasRef = useRef(null)
  const tempCanvasRef = useRef(null)
  const smoothedCornersRef = useRef(null)
  const SMOOTH = 0.35

  useEffect(() => {
    const getCameras = async () => {
      try {
        let tempStream = null
        try {
          tempStream = await navigator.mediaDevices.getUserMedia({ video: true })
        } catch (permErr) {
          console.warn('Camera permission not granted:', permErr)
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
          label: device.label || `Kamera ${index + 1}`
        }))
        setAvailableCameras(cameras)
        if (cameras.length > 0 && !selectedCameraId) {
          setTimeout(() => setSelectedCameraId(cameras[0].deviceId), 100)
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

      const constraints = {
        video: {
          deviceId: selectedCameraId ? { exact: selectedCameraId } : undefined,
          width: { ideal: 1280, max: 1920 },
          height: { ideal: 720, max: 1080 }
        }
      }

      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      streamRef.current = stream

      if (videoRef.current) {
        if (videoRef.current.srcObject) {
          const prevStream = videoRef.current.srcObject
          if (prevStream instanceof MediaStream) {
            prevStream.getTracks().forEach((t) => t.stop())
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
      } else {
        setIsLoading(false)
      }
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
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => {
        t.stop()
        t.enabled = false
      })
      streamRef.current = null
    }
    if (videoRef.current) {
      if (videoRef.current.srcObject) {
        const s = videoRef.current.srcObject
        if (s instanceof MediaStream) {
          s.getTracks().forEach((t) => {
            t.stop()
            t.enabled = false
          })
        }
      }
      videoRef.current.srcObject = null
      videoRef.current.pause()
    }
    if (brightnessCheckInterval.current) {
      clearInterval(brightnessCheckInterval.current)
      brightnessCheckInterval.current = null
    }
    if (documentDetectionInterval.current) {
      clearInterval(documentDetectionInterval.current)
      documentDetectionInterval.current = null
    }
    setDetectedCorners(null)
    smoothedCornersRef.current = null
  }

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
        if (documentDetectionInterval.current) clearInterval(documentDetectionInterval.current)
        documentDetectionInterval.current = setInterval(async () => {
          try {
            const video = videoRef.current
            if (!video || video.readyState < 2) return
            const w = video.videoWidth || 640
            const h = video.videoHeight || 480
            if (w <= 0 || h <= 0) return
            let temp = tempCanvasRef.current
            if (!temp) {
              temp = document.createElement('canvas')
              tempCanvasRef.current = temp
            }
            temp.width = w
            temp.height = h
            const tctx = temp.getContext('2d', { willReadFrequently: true })
            tctx.drawImage(video, 0, 0, w, h)
            const corners = await detectDocumentCorners(temp)
            const raw = Array.isArray(corners) && corners.length >= 4 ? corners : null
            if (!raw) {
              smoothedCornersRef.current = null
              setDetectedCorners(null)
              return
            }
            const prev = smoothedCornersRef.current
            const smoothed = prev
              ? raw.map((p, i) => ({
                  x: prev[i].x * (1 - SMOOTH) + p.x * SMOOTH,
                  y: prev[i].y * (1 - SMOOTH) + p.y * SMOOTH
                }))
              : raw
            smoothedCornersRef.current = smoothed
            setDetectedCorners(smoothed)
          } catch (e) {
            setDetectedCorners(null)
          }
        }, 400)
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
        0.92
      )
    })

  const handleCapture = async () => {
    if (!videoRef.current || isCapturing) return
    setIsCapturing(true)
    setError(null)
    setCroppedFile(null)
    try {
      const video = videoRef.current
      const canvas = canvasRef.current
      if (video.readyState < 2) throw new Error('Video belum siap')
      const ctx = canvas.getContext('2d')
      const w = video.videoWidth || 1920
      const h = video.videoHeight || 1080
      if (w === 0 || h === 0) throw new Error('Ukuran video tidak valid')
      canvas.width = w
      canvas.height = h
      ctx.drawImage(video, 0, 0, w, h)

      const fullFile = await (async () => {
        const createFull = () =>
          new Promise((resolve, reject) => {
            canvas.toBlob(
              (blob) => {
                if (blob) resolve(new File([blob], `scan_${Date.now()}.jpg`, { type: 'image/jpeg', lastModified: Date.now() }))
                else reject(new Error('Gagal membuat blob'))
              },
              'image/jpeg',
              0.92
            )
          })
        if (autoEnhance) {
          try {
            let shouldUseOpenCV = false
            try {
              const { isOpenCVLoaded } = await import('../../utils/opencvLoader')
              shouldUseOpenCV = isOpenCVLoaded()
            } catch (_) {}
            const enhancePromise = autoEnhanceImage(video, shouldUseOpenCV)
            const timeoutPromise = new Promise((_, rej) => setTimeout(() => rej(new Error('Timeout')), 5000))
            return await Promise.race([enhancePromise, timeoutPromise])
          } catch {
            return await createFull()
          }
        }
        return await createFull()
      })()

      if (!fullFile?.size) throw new Error('Gagal membuat file dari gambar')
      setCapturedFile(fullFile)
      setPreviewImage(canvas.toDataURL('image/jpeg', 0.9))

      try {
        const corners = await detectDocumentCorners(canvas)
        const ordered = orderCornersToQuad(Array.isArray(corners) ? corners : [], w, h)
        if (ordered && ordered.length >= 4) {
          const warped = perspectiveTransform(canvas, ordered)
          setPreviewImage(warped.toDataURL('image/jpeg', 0.9))
          const cropped = await createFileFromCanvas(warped)
          if (cropped?.size) setCroppedFile(cropped)
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
    if (detectedCorners && detectedCorners.length >= 4) {
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
        <div className="flex-shrink-0 p-4 bg-gray-900 flex items-center justify-between gap-4">
          <h2 className="text-white text-lg font-semibold">Scan Dokumen</h2>
          <div className="flex items-center gap-3 flex-1 justify-end">
            {availableCameras.length > 0 && (
              <select
                value={selectedCameraId || ''}
                onChange={handleCameraChange}
                disabled={isLoading || isCapturing}
                className="px-3 py-2 bg-gray-800 text-white rounded-lg border border-gray-700 focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm disabled:opacity-50"
              >
                {availableCameras.map((c) => (
                  <option key={c.deviceId} value={c.deviceId}>{c.label}</option>
                ))}
              </select>
            )}
            <button type="button" onClick={onClose} className="text-white hover:text-gray-300 flex-shrink-0">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
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
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-[5]">
                <div className="border-2 border-white border-dashed rounded-lg w-4/5 max-w-md aspect-[3/4] shadow-lg">
                  <div className="absolute -top-8 left-0 right-0 text-center text-white text-sm">Posisikan dokumen dalam frame</div>
                </div>
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
