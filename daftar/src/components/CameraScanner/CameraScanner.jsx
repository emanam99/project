import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { autoEnhanceImage, detectBrightness } from '../../utils/imageEnhancement'
import { loadOpenCV } from '../../utils/opencvLoader'

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
  const [useOpenCV, setUseOpenCV] = useState(false) // Default false untuk menghindari freeze
  const [availableCameras, setAvailableCameras] = useState([])
  const [selectedCameraId, setSelectedCameraId] = useState(null)
  const brightnessCheckInterval = useRef(null)

  // Get available cameras
  useEffect(() => {
    const getCameras = async () => {
      try {
        // Request permission first to get camera labels
        let tempStream = null
        try {
          tempStream = await navigator.mediaDevices.getUserMedia({ video: true })
        } catch (permErr) {
          // Permission might be denied, but we can still try to enumerate
          console.warn('Camera permission not granted:', permErr)
        }
        
        const devices = await navigator.mediaDevices.enumerateDevices()
        const videoDevices = devices.filter(device => device.kind === 'videoinput')
        
        // Stop temporary stream if it exists - do this BEFORE setting state
        if (tempStream) {
          tempStream.getTracks().forEach(track => {
            track.stop()
            track.enabled = false
          })
          // Wait a bit longer to ensure stream is fully stopped before starting real camera
          await new Promise(resolve => setTimeout(resolve, 500))
        }
        
        const cameras = videoDevices.map((device, index) => ({
          deviceId: device.deviceId,
          label: device.label || `Kamera ${index + 1}`
        }))
        
        setAvailableCameras(cameras)
        
        // Set default camera (first one) - this will trigger the camera start useEffect
        // But we've already stopped the temp stream, so it should be safe
        if (cameras.length > 0 && !selectedCameraId) {
          // Add a small delay before setting to ensure temp stream is fully released
          setTimeout(() => {
            setSelectedCameraId(cameras[0].deviceId)
          }, 100)
        }
      } catch (err) {
        console.error('Error getting cameras:', err)
      }
    }
    
    getCameras()
  }, [])

  useEffect(() => {
    // Start camera terlebih dahulu, jangan blok dengan OpenCV
    if (selectedCameraId) {
      // Stop camera first to ensure no conflicts
      stopCamera()
      
      // Wait a bit before starting new camera to ensure previous stream is fully stopped
      const timer = setTimeout(() => {
        startCamera()
      }, 300) // Increased delay to ensure stream is fully stopped

      // OpenCV dimatikan secara default untuk menghindari freeze
      // Hanya akan dimuat saat diperlukan (saat capture dengan auto-enhance)
      // Ini mencegah freeze saat membuka scanner

      return () => {
        clearTimeout(timer)
        stopCamera()
        // Wait a bit more to ensure cleanup is complete
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
  }, [selectedCameraId]) // Restart camera saat selectedCameraId berubah

  const startCamera = async () => {
    try {
      setIsLoading(true)
      setError(null)

      // Request camera dengan konfigurasi yang lebih ringan untuk menghindari freeze
      const constraints = {
        video: {
          deviceId: selectedCameraId ? { exact: selectedCameraId } : undefined,
          width: { ideal: 1280, max: 1920 }, // Kurangi resolusi ideal
          height: { ideal: 720, max: 1080 }
        }
      }

      const stream = await navigator.mediaDevices.getUserMedia(constraints)

      streamRef.current = stream
      if (videoRef.current) {
        // Clear previous srcObject first
        if (videoRef.current.srcObject) {
          const prevStream = videoRef.current.srcObject
          if (prevStream instanceof MediaStream) {
            prevStream.getTracks().forEach(track => track.stop())
          }
        }
        
        videoRef.current.srcObject = stream
        
        // Gunakan event listener untuk mengetahui kapan video siap
        const handleLoadedMetadata = () => {
          console.log('Video metadata loaded:', {
            videoWidth: videoRef.current?.videoWidth,
            videoHeight: videoRef.current?.videoHeight,
            readyState: videoRef.current?.readyState,
            srcObject: !!videoRef.current?.srcObject
          })
          setIsLoading(false)
          // Mulai monitoring kecerahan setelah video siap
          setTimeout(() => {
            startBrightnessMonitoring()
          }, 200)
        }

        const handleLoadedData = () => {
          console.log('Video data loaded')
          setIsLoading(false)
        }

        const handlePlaying = () => {
          console.log('Video is playing', {
            videoWidth: videoRef.current?.videoWidth,
            videoHeight: videoRef.current?.videoHeight,
            paused: videoRef.current?.paused
          })
          setIsLoading(false)
        }

        const handleError = (e) => {
          console.error('Video error:', e)
          setError('Gagal memuat video. Silakan coba lagi.')
          setIsLoading(false)
        }

        // Remove old listeners if any
        videoRef.current.removeEventListener('loadedmetadata', handleLoadedMetadata)
        videoRef.current.removeEventListener('loadeddata', handleLoadedData)
        videoRef.current.removeEventListener('playing', handlePlaying)
        videoRef.current.removeEventListener('error', handleError)
        
        // Add new listeners
        videoRef.current.addEventListener('loadedmetadata', handleLoadedMetadata, { once: true })
        videoRef.current.addEventListener('loadeddata', handleLoadedData, { once: true })
        videoRef.current.addEventListener('playing', handlePlaying, { once: true })
        videoRef.current.addEventListener('error', handleError, { once: true })
        
        // Force play video with retry
        const playVideo = async () => {
          try {
            await videoRef.current.play()
            console.log('Video play() resolved')
            setIsLoading(false)
          } catch (playError) {
            console.error('Error playing video:', playError)
            // Retry once after a short delay
            setTimeout(async () => {
              try {
                if (videoRef.current && videoRef.current.srcObject) {
                  await videoRef.current.play()
                  console.log('Video play() retry successful')
                  setIsLoading(false)
                }
              } catch (retryError) {
                console.error('Video play() retry failed:', retryError)
                setError('Gagal memutar video. Silakan coba lagi.')
                setIsLoading(false)
              }
            }, 500)
          }
        }
        
        playVideo()
      } else {
        console.warn('videoRef.current is null')
        setIsLoading(false)
      }
    } catch (err) {
      console.error('Error accessing camera:', err)
      let errorMessage = 'Tidak dapat mengakses kamera.'
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        errorMessage = 'Izin kamera ditolak. Silakan berikan izin kamera di pengaturan browser.'
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        errorMessage = 'Kamera tidak ditemukan. Pastikan perangkat memiliki kamera.'
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        errorMessage = 'Kamera sedang digunakan oleh aplikasi lain.'
      }
      setError(errorMessage)
      setIsLoading(false)
    }
  }

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        track.stop()
        track.enabled = false
      })
      streamRef.current = null
    }
    if (videoRef.current) {
      // Clear srcObject and pause video
      if (videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject
        if (stream instanceof MediaStream) {
          stream.getTracks().forEach(track => {
            track.stop()
            track.enabled = false
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
  }

  const startBrightnessMonitoring = () => {
    if (brightnessCheckInterval.current) {
      clearInterval(brightnessCheckInterval.current)
    }

    // Tunggu video siap sebelum mulai monitoring
    const checkVideoReady = () => {
      if (videoRef.current && videoRef.current.readyState >= 2) {
        brightnessCheckInterval.current = setInterval(() => {
          try {
            if (videoRef.current && canvasRef.current) {
              const video = videoRef.current
              const canvas = canvasRef.current
              
              // Pastikan video sudah siap
              if (video.readyState < 2) return
              
              const ctx = canvas.getContext('2d')
              const width = video.videoWidth || 640
              const height = video.videoHeight || 480

              if (width > 0 && height > 0) {
                canvas.width = width
                canvas.height = height

                ctx.drawImage(video, 0, 0, width, height)
                const imageData = ctx.getImageData(0, 0, width, height)
                const info = detectBrightness(imageData)
                setBrightnessInfo(info)
              }
            }
          } catch (err) {
            console.warn('Error checking brightness:', err)
          }
        }, 500) // Check setiap 500ms
      } else {
        // Retry setelah 100ms jika video belum siap
        setTimeout(checkVideoReady, 100)
      }
    }

    checkVideoReady()
  }

  const handleCapture = async () => {
    if (!videoRef.current || isCapturing) return

    setIsCapturing(true)
    setError(null)
    
    try {
      const video = videoRef.current
      const canvas = canvasRef.current
      
      // Pastikan video sudah siap
      if (video.readyState < 2) {
        throw new Error('Video belum siap')
      }

      const ctx = canvas.getContext('2d')
      const width = video.videoWidth || 1920
      const height = video.videoHeight || 1080

      if (width === 0 || height === 0) {
        throw new Error('Ukuran video tidak valid')
      }

      canvas.width = width
      canvas.height = height

      ctx.drawImage(video, 0, 0, width, height)

      // Buat preview
      const previewUrl = canvas.toDataURL('image/jpeg', 0.9)
      setPreviewImage(previewUrl)

      // Buat file dari canvas terlebih dahulu (fallback)
      const createFileFromCanvas = () => {
        return new Promise((resolve, reject) => {
          canvas.toBlob((blob) => {
            if (blob) {
              const file = new File(
                [blob],
                `scan_${Date.now()}.jpg`,
                { type: 'image/jpeg', lastModified: Date.now() }
              )
              console.log('File created from canvas:', file.name, file.size, 'bytes')
              resolve(file)
            } else {
              reject(new Error('Gagal membuat blob dari canvas'))
            }
          }, 'image/jpeg', 0.92)
        })
      }

      // Jika auto enhance aktif, coba proses gambar
      let fileToUse = null
      if (autoEnhance) {
        try {
          // Coba load OpenCV hanya saat diperlukan (saat capture)
          // Default gunakan Canvas API yang lebih ringan
          let shouldUseOpenCV = false
          try {
            // Cek apakah OpenCV sudah tersedia, jika belum jangan tunggu
            const { isOpenCVLoaded } = await import('../../utils/opencvLoader')
            shouldUseOpenCV = isOpenCVLoaded()
            console.log('OpenCV available:', shouldUseOpenCV)
          } catch (err) {
            console.warn('Tidak dapat memeriksa status OpenCV:', err)
          }

          // Gunakan Promise.race untuk timeout jika proses terlalu lama
          const enhancePromise = autoEnhanceImage(video, shouldUseOpenCV)
          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Proses enhancement timeout')), 5000)
          )
          
          try {
            fileToUse = await Promise.race([enhancePromise, timeoutPromise])
            console.log('Enhanced file created:', fileToUse?.name, fileToUse?.size, 'bytes')
          } catch (enhanceError) {
            console.warn('Enhancement gagal, gunakan gambar asli:', enhanceError)
            // Fallback ke gambar tanpa enhancement
            fileToUse = await createFileFromCanvas()
          }
        } catch (err) {
          console.error('Error in auto enhance, using fallback:', err)
          // Fallback ke gambar tanpa enhancement
          fileToUse = await createFileFromCanvas()
        }
      } else {
        // Convert canvas ke file tanpa enhancement
        fileToUse = await createFileFromCanvas()
      }

      if (fileToUse && fileToUse.size > 0) {
        console.log('File ready:', fileToUse.name, fileToUse.size, 'bytes')
        setCapturedFile(fileToUse)
        setShowPreview(true)
      } else {
        throw new Error('Gagal membuat file dari gambar (file kosong atau tidak valid)')
      }
    } catch (err) {
      console.error('Error capturing image:', err)
      setError(err.message || 'Gagal mengambil gambar. Silakan coba lagi.')
    } finally {
      setIsCapturing(false)
    }
  }

  const handleRetake = () => {
    setShowPreview(false)
    setPreviewImage(null)
    setCapturedFile(null)
  }

  const handleConfirm = () => {
    console.log('Confirm clicked, capturedFile:', capturedFile)
    if (capturedFile) {
      if (onCapture) {
        console.log('Calling onCapture with file:', capturedFile.name, capturedFile.size)
        try {
          onCapture(capturedFile)
          console.log('onCapture called successfully')
        } catch (err) {
          console.error('Error in onCapture callback:', err)
          setError('Gagal mengirim file. Silakan coba lagi.')
          return
        }
      } else {
        console.warn('onCapture callback tidak tersedia')
      }
    } else {
      console.error('Tidak ada file yang di-capture')
      setError('Tidak ada file yang di-capture. Silakan ambil foto lagi.')
      return
    }
    
    // Tutup scanner setelah file terkirim
    if (onClose) {
      onClose()
    }
  }

  const handleCameraChange = (event) => {
    const newCameraId = event.target.value
    setSelectedCameraId(newCameraId)
  }

  const getBrightnessIndicator = () => {
    if (!brightnessInfo) return null

    const { isDark, isTooBright, brightness, needsCorrection } = brightnessInfo

    let status = 'normal'
    let message = 'Cahaya cukup'
    let color = 'bg-green-500'

    if (isDark) {
      status = 'dark'
      message = 'Cahaya terlalu gelap'
      color = 'bg-red-500'
    } else if (isTooBright) {
      status = 'bright'
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
          {needsCorrection && autoEnhance && (
            <div className="text-xs bg-white bg-opacity-20 px-2 py-1 rounded">
              Auto-enhance aktif
            </div>
          )}
        </div>
      </div>
    )
  }

  const scannerContent = showPreview && previewImage ? (
    <div 
      className="fixed inset-0 min-h-screen min-w-full bg-black flex flex-col z-[99999]"
      style={{ isolation: 'isolate' }}
    >
        {/* Header */}
        <div className="flex-shrink-0 p-4 bg-gray-900 flex items-center justify-between">
          <h2 className="text-white text-lg font-semibold">Preview</h2>
          <button
            onClick={handleRetake}
            className="text-white hover:text-gray-300"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
            </svg>
          </button>
        </div>

        {/* Info Banner */}
        {jenisBerkas && (
          <div className="flex-shrink-0 bg-teal-600 bg-opacity-80 backdrop-blur-sm px-4 py-2">
            <div className="flex items-center gap-2 text-white">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
              </svg>
              <span className="text-sm font-medium">
                Sedang upload: <span className="font-semibold">{jenisBerkas}</span>
              </span>
            </div>
          </div>
        )}

        {/* Scrollable Image Container */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden">
          <div className="min-h-full flex items-center justify-center p-4">
            <img
              src={previewImage}
              alt="Preview"
              className="max-w-full h-auto object-contain"
            />
          </div>
        </div>

        {/* Fixed Bottom Buttons */}
        <div className="flex-shrink-0 p-4 bg-gray-900 flex gap-4 border-t border-gray-700">
          <button
            onClick={handleRetake}
            className="flex-1 px-4 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors font-semibold"
          >
            Ambil Ulang
          </button>
          <button
            onClick={handleConfirm}
            className="flex-1 px-4 py-3 bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition-colors font-semibold"
          >
            Gunakan Gambar Ini
          </button>
        </div>
      </div>
  ) : (
    <div 
      className="fixed inset-0 min-h-screen min-w-full bg-black flex flex-col z-[99999]"
      style={{ isolation: 'isolate' }}
    >
      {/* Header */}
      <div className="flex-shrink-0 p-4 bg-gray-900 flex items-center justify-between gap-4">
        <h2 className="text-white text-lg font-semibold">Scan Dokumen</h2>
        <div className="flex items-center gap-3 flex-1 justify-end">
          {availableCameras.length > 0 && (
            <select
              value={selectedCameraId || ''}
              onChange={handleCameraChange}
              disabled={isLoading || isCapturing}
              className="px-3 py-2 bg-gray-800 text-white rounded-lg border border-gray-700 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {availableCameras.map((camera) => (
                <option key={camera.deviceId} value={camera.deviceId}>
                  {camera.label}
                </option>
              ))}
            </select>
          )}
          <button
            onClick={onClose}
            className="text-white hover:text-gray-300 flex-shrink-0"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
            </svg>
          </button>
        </div>
      </div>

      {/* Info Banner */}
      {jenisBerkas && (
        <div className="flex-shrink-0 bg-teal-600 bg-opacity-80 backdrop-blur-sm px-4 py-2">
          <div className="flex items-center gap-2 text-white">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
            </svg>
            <span className="text-sm font-medium">
              Sedang upload: <span className="font-semibold">{jenisBerkas}</span>
            </span>
          </div>
        </div>
      )}

      {/* Video Preview */}
      <div className="flex-1 relative flex items-center justify-center overflow-hidden bg-black min-h-0">
        {/* Video element - always render, but control visibility */}
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
        
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black z-20">
            <div className="text-white text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
              <p>Memuat kamera...</p>
            </div>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-black p-4 z-20">
            <div className="text-white text-center">
              <p className="mb-4">{error}</p>
              <button
                onClick={startCamera}
                className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg"
              >
                Coba Lagi
              </button>
            </div>
          </div>
        )}

        {!isLoading && !error && (
          <>
            {getBrightnessIndicator()}
            
            {/* Overlay guide untuk scan dokumen */}
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-5">
              <div className="border-2 border-white border-dashed rounded-lg w-4/5 max-w-md aspect-[3/4] shadow-lg">
                <div className="absolute -top-8 left-0 right-0 text-center text-white text-sm">
                  Posisikan dokumen dalam frame
                </div>
              </div>
            </div>
          </>
        )}
        
        {/* Debug indicator - remove in production */}
        {!isLoading && !error && videoRef.current && (
          <div className="absolute top-20 left-4 bg-black bg-opacity-70 text-white text-xs p-2 rounded z-30">
            <div>Video: {videoRef.current.videoWidth}x{videoRef.current.videoHeight}</div>
            <div>Playing: {!videoRef.current.paused ? 'Yes' : 'No'}</div>
            <div>Ready: {videoRef.current.readyState}</div>
            <div>Stream: {videoRef.current.srcObject ? 'Yes' : 'No'}</div>
          </div>
        )}

        {/* Hidden canvas untuk processing */}
        <canvas ref={canvasRef} className="hidden" />
      </div>

      {/* Controls */}
      {!isLoading && !error && (
        <div className="flex-shrink-0 p-6 bg-gray-900 border-t border-gray-700">
          <button
            onClick={handleCapture}
            disabled={isCapturing}
            className="w-full px-6 py-4 bg-teal-600 hover:bg-teal-700 disabled:bg-gray-600 text-white rounded-full transition-colors flex items-center justify-center gap-2 font-semibold"
          >
            {isCapturing ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                <span>Memproses...</span>
              </>
            ) : (
              <>
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"></path>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"></path>
                </svg>
                <span>Ambil Foto</span>
              </>
            )}
          </button>
          
          {autoEnhance && (
            <div className="mt-2 flex items-center justify-center">
              <p className="text-gray-400 text-xs">
                Auto-enhance cahaya aktif
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )

  // Render menggunakan portal ke document.body untuk memastikan berada di atas semua elemen
  return typeof document !== 'undefined' 
    ? createPortal(scannerContent, document.body)
    : scannerContent
}

export default CameraScanner
