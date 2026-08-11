import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  openMaxQualityCamera,
  captureStillFrame,
  JPEG_CAPTURE_QUALITY,
  releaseVideoStream,
  stopMediaStream,
  trackSupportsTorch,
  setTrackTorch,
} from '../../utils/cameraStreamUtils'
import PortraitGuideSilhouette from './PortraitGuideSilhouette'

/**
 * Kamera fullscreen untuk pas foto 3×4 (cetak kartu).
 * — Preview full layar, panduan kotak 3×4 lebar (hampir full) + siluet kepala/bahu
 * — Resolusi HD+ via openMaxQualityCamera
 * — Tombol flash/torch jika perangkat mendukung
 */
export default function PortraitPhotoCamera({ onCapture, onClose, title = 'Pas foto 3×4' }) {
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const mountedRef = useRef(true)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)
  const [isCapturing, setIsCapturing] = useState(false)
  const [torchSupported, setTorchSupported] = useState(false)
  const [torchOn, setTorchOn] = useState(false)
  const [facingMode, setFacingMode] = useState('user')

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const stopCamera = useCallback(() => {
    const held = streamRef.current
    streamRef.current = null
    setTorchOn(false)
    setTorchSupported(false)
    releaseVideoStream(videoRef.current, held)
  }, [])

  const startCamera = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)
      stopCamera()

      const stream = await openMaxQualityCamera(undefined, { facingMode })
      if (!mountedRef.current) {
        stopMediaStream(stream)
        return
      }
      streamRef.current = stream
      const track = stream.getVideoTracks()[0]
      setTorchSupported(trackSupportsTorch(track))
      setTorchOn(false)

      if (videoRef.current) {
        videoRef.current.srcObject = stream
        try {
          await videoRef.current.play()
        } catch {
          /* autoplay race — metadata handler will retry */
        }
      }
      setIsLoading(false)
    } catch (err) {
      console.error('PortraitPhotoCamera:', err)
      let msg = 'Tidak dapat mengakses kamera.'
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        msg = 'Izin kamera ditolak. Berikan izin di pengaturan browser/HP.'
      } else if (err.name === 'NotFoundError') {
        msg = 'Kamera tidak ditemukan.'
      } else if (err.name === 'NotReadableError') {
        msg = 'Kamera sedang dipakai aplikasi lain.'
      }
      setError(msg)
      setIsLoading(false)
    }
  }, [facingMode, stopCamera])

  useEffect(() => {
    startCamera()
    return () => stopCamera()
  }, [startCamera, stopCamera])

  const handleToggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks?.()[0]
    if (!trackSupportsTorch(track)) return
    const next = !torchOn
    const ok = await setTrackTorch(track, next)
    if (ok) setTorchOn(next)
  }

  const handleFlip = () => {
    setFacingMode((m) => (m === 'user' ? 'environment' : 'user'))
  }

  const handleCapture = async () => {
    if (isCapturing || !streamRef.current || !videoRef.current) return
    setIsCapturing(true)
    try {
      const { blob } = await captureStillFrame(streamRef.current, videoRef.current)
      let out = blob
      if (!out) {
        const canvas = document.createElement('canvas')
        const v = videoRef.current
        canvas.width = v.videoWidth || 1920
        canvas.height = v.videoHeight || 1080
        canvas.getContext('2d').drawImage(v, 0, 0)
        out = await new Promise((resolve, reject) => {
          canvas.toBlob(
            (b) => (b ? resolve(b) : reject(new Error('blob'))),
            'image/jpeg',
            JPEG_CAPTURE_QUALITY
          )
        })
      }
      const file = new File([out], `pasfoto_${Date.now()}.jpg`, { type: 'image/jpeg' })
      stopCamera()
      onCapture?.(file)
    } catch (err) {
      console.error(err)
      setError('Gagal mengambil foto. Coba lagi.')
    } finally {
      if (mountedRef.current) setIsCapturing(false)
    }
  }

  const handleClose = () => {
    stopCamera()
    onClose?.()
  }

  const ui = (
    <div
      className="fixed inset-0 min-h-screen min-w-full bg-black flex flex-col z-[99999]"
      style={{ isolation: 'isolate' }}
    >
      <div className="flex-shrink-0 px-3 py-2 bg-black/80 flex items-center justify-between gap-2">
        <p className="text-white text-sm font-medium truncate">{title}</p>
        <button
          type="button"
          onClick={handleClose}
          className="text-white p-1.5 rounded-lg hover:bg-white/10"
          aria-label="Tutup kamera"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="flex-1 relative flex items-center justify-center overflow-hidden bg-black min-h-0">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="absolute inset-0 w-full h-full object-cover bg-black"
          style={{ display: isLoading || error ? 'none' : 'block' }}
        />

        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center z-20">
            <div className="text-white text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-3" />
              <p className="text-sm">Memuat kamera HD…</p>
            </div>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex items-center justify-center p-4 z-20">
            <div className="text-white text-center max-w-sm">
              <p className="mb-4 text-sm">{error}</p>
              <button
                type="button"
                onClick={startCamera}
                className="px-4 py-2 bg-teal-600 rounded-lg text-sm font-medium"
              >
                Coba lagi
              </button>
            </div>
          </div>
        )}

        {!isLoading && !error && (
          <div className="absolute inset-0 pointer-events-none z-[5] flex items-center justify-center overflow-hidden px-[4vw] py-2">
            <div
              className="relative aspect-[3/4] rounded-xl border-2 border-white shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]"
              style={{
                /* Hampir full lebar; tetap 3×4 dan tidak overflow tinggi area preview */
                width: 'min(92vw, calc((100dvh - 11rem) * 3 / 4))',
                maxHeight: 'calc(100dvh - 11rem)',
              }}
            >
              <div className="absolute -top-8 left-0 right-0 text-center text-white text-xs font-medium drop-shadow px-2">
                Sejajarkan wajah dengan siluet · kotak 3×4
              </div>
              <PortraitGuideSilhouette strokeClassName="stroke-white/75" />
              <span className="absolute top-0 left-0 w-6 h-6 border-t-[3px] border-l-[3px] border-teal-400 rounded-tl-md" />
              <span className="absolute top-0 right-0 w-6 h-6 border-t-[3px] border-r-[3px] border-teal-400 rounded-tr-md" />
              <span className="absolute bottom-0 left-0 w-6 h-6 border-b-[3px] border-l-[3px] border-teal-400 rounded-bl-md" />
              <span className="absolute bottom-0 right-0 w-6 h-6 border-b-[3px] border-r-[3px] border-teal-400 rounded-br-md" />
            </div>
          </div>
        )}
      </div>

      {!isLoading && !error && (
        <div className="flex-shrink-0 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] bg-gray-950 border-t border-gray-800">
          <div className="flex items-center justify-around gap-2 max-w-md mx-auto">
            <button
              type="button"
              onClick={handleFlip}
              className="flex flex-col items-center gap-1 text-white/90 px-3 py-2 min-w-[4.5rem]"
              aria-label="Ganti kamera"
            >
              <span className="w-11 h-11 rounded-full bg-gray-800 flex items-center justify-center">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
              </span>
              <span className="text-[10px]">Balik</span>
            </button>

            <button
              type="button"
              onClick={handleCapture}
              disabled={isCapturing}
              className="flex flex-col items-center gap-1 text-white px-3 py-2"
              aria-label="Ambil foto"
            >
              <span
                className={`w-16 h-16 rounded-full border-4 border-white flex items-center justify-center ${
                  isCapturing ? 'bg-teal-800' : 'bg-teal-600 active:scale-95'
                }`}
              >
                {isCapturing ? (
                  <span className="animate-spin rounded-full h-6 w-6 border-2 border-white border-t-transparent" />
                ) : (
                  <span className="w-12 h-12 rounded-full bg-white" />
                )}
              </span>
              <span className="text-[10px] font-medium">{isCapturing ? 'Memproses…' : 'Ambil'}</span>
            </button>

            <button
              type="button"
              onClick={handleToggleTorch}
              disabled={!torchSupported}
              className={`flex flex-col items-center gap-1 px-3 py-2 min-w-[4.5rem] ${
                torchSupported ? 'text-white/90' : 'text-white/30'
              }`}
              aria-label={torchOn ? 'Matikan flash' : 'Nyalakan flash'}
              title={torchSupported ? (torchOn ? 'Flash menyala' : 'Flash') : 'Flash tidak didukung'}
            >
              <span
                className={`w-11 h-11 rounded-full flex items-center justify-center ${
                  torchOn ? 'bg-amber-500 text-black' : 'bg-gray-800'
                }`}
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M7 2v11h3v9l7-12h-4l4-8z" />
                </svg>
              </span>
              <span className="text-[10px]">{torchSupported ? (torchOn ? 'Flash on' : 'Flash') : 'No flash'}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )

  return typeof document !== 'undefined' ? createPortal(ui, document.body) : ui
}
