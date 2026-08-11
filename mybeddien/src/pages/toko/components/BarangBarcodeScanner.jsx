import { useCallback, useEffect, useImperativeHandle, useRef, useState, forwardRef } from 'react'
import { motion } from 'framer-motion'
import { viteDynamicImport } from '../../../utils/viteDynamicImport'

async function loadMultiFormatReader() {
  const [browserMod, libraryMod] = await Promise.all([
    viteDynamicImport(() => import('@zxing/browser')),
    viteDynamicImport(() => import('@zxing/library')),
  ])
  return {
    BrowserMultiFormatReader: browserMod.BrowserMultiFormatReader,
    BarcodeFormat: browserMod.BarcodeFormat,
    DecodeHintType: libraryMod.DecodeHintType,
  }
}

/** Format umum untuk kode barang toko: QR + barcode batang. */
function buildBarcodeHints(BarcodeFormat, DecodeHintType) {
  const hints = new Map()
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [
    BarcodeFormat.QR_CODE,
    BarcodeFormat.DATA_MATRIX,
    BarcodeFormat.EAN_13,
    BarcodeFormat.EAN_8,
    BarcodeFormat.UPC_A,
    BarcodeFormat.UPC_E,
    BarcodeFormat.CODE_128,
    BarcodeFormat.CODE_39,
    BarcodeFormat.CODE_93,
    BarcodeFormat.ITF,
    BarcodeFormat.CODABAR,
  ])
  // Membantu baca barcode 1D dari kamera HP
  hints.set(DecodeHintType.TRY_HARDER, true)
  return hints
}

function canUseCameraApi() {
  return Boolean(
    typeof navigator !== 'undefined' &&
      navigator.mediaDevices &&
      typeof navigator.mediaDevices.getUserMedia === 'function'
  )
}

const VIDEO_CONSTRAINTS_ATTEMPTS = [
  { video: { facingMode: { ideal: 'environment' } }, audio: false },
  { video: { facingMode: 'environment' }, audio: false },
  { video: true, audio: false },
]

async function openCameraStream() {
  let lastErr = null
  for (const constraints of VIDEO_CONSTRAINTS_ATTEMPTS) {
    try {
      return await navigator.mediaDevices.getUserMedia(constraints)
    } catch (e) {
      lastErr = e
      if (e?.name === 'NotAllowedError' || e?.name === 'PermissionDeniedError') throw e
    }
  }
  throw lastErr || new Error('Gagal membuka kamera')
}

function stopMediaStream(stream) {
  if (!stream?.getTracks) return
  stream.getTracks().forEach((t) => {
    try {
      t.stop()
    } catch {
      /* abaikan */
    }
  })
}

/** Kamera inline untuk scan QR / barcode kode barang. */
const BarangBarcodeScanner = forwardRef(function BarangBarcodeScanner(
  {
    onScan,
    disabled = false,
    active = true,
    compact = false,
    cooldownMs = 2000,
  },
  ref
) {
  const videoRef = useRef(null)
  const controlsRef = useRef(null)
  const streamRef = useRef(null)
  const sessionRef = useRef(0)
  const handledRef = useRef(false)
  const cooldownUntilRef = useRef(0)
  const mountedRef = useRef(true)
  const [phase, setPhase] = useState('idle')
  const [statusText, setStatusText] = useState('')
  const cameraPaused = disabled || !active

  const stopCamera = useCallback(() => {
    // Batalkan sesi async (getUserMedia / decode) yang masih jalan
    sessionRef.current += 1
    try {
      controlsRef.current?.stop()
    } catch {
      /* abaikan */
    }
    controlsRef.current = null

    const fromRef = streamRef.current
    streamRef.current = null
    stopMediaStream(fromRef)

    const el = videoRef.current
    const fromVideo = el?.srcObject
    if (fromVideo && fromVideo !== fromRef) {
      stopMediaStream(fromVideo)
    }
    if (el) {
      try {
        el.pause()
      } catch {
        /* abaikan */
      }
      el.srcObject = null
    }
    setPhase('idle')
    setStatusText('')
  }, [])

  useImperativeHandle(ref, () => ({ stop: () => stopCamera() }), [stopCamera])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      stopCamera()
    }
  }, [stopCamera])

  const handleScanText = useCallback(
    (raw) => {
      if (handledRef.current || cameraPaused) return
      if (Date.now() < cooldownUntilRef.current) return
      const code = String(raw || '').trim()
      if (!code) return
      handledRef.current = true
      cooldownUntilRef.current = Date.now() + cooldownMs
      setPhase('detected')
      setStatusText('Kode terbaca.')
      onScan?.(code)
      window.setTimeout(() => {
        handledRef.current = false
        setPhase('scanning')
      setStatusText('Arahkan kamera ke QR atau barcode batang.')
      }, cooldownMs)
    },
    [onScan, cameraPaused, cooldownMs]
  )

  const startScanningFromStream = useCallback(
    async (videoEl, sessionId) => {
      const { BrowserMultiFormatReader, BarcodeFormat, DecodeHintType } = await loadMultiFormatReader()
      if (!mountedRef.current || sessionId !== sessionRef.current) return
      const hints = buildBarcodeHints(BarcodeFormat, DecodeHintType)
      const reader = new BrowserMultiFormatReader(hints)
      const controls = await reader.decodeFromVideoElement(videoEl, (result) => {
        if (result) handleScanText(result.getText())
      })
      if (!mountedRef.current || sessionId !== sessionRef.current) {
        try {
          controls.stop()
        } catch {
          /* abaikan */
        }
        return
      }
      controlsRef.current = controls
      setPhase('scanning')
      setStatusText('Arahkan kamera ke QR atau barcode batang.')
    },
    [handleScanText]
  )

  const requestCamera = useCallback(async () => {
    if (!videoRef.current) return
    if (!window.isSecureContext) {
      setPhase('error')
      setStatusText('Kamera membutuhkan HTTPS atau localhost.')
      return
    }
    if (!canUseCameraApi()) {
      setPhase('error')
      setStatusText('Browser tidak mendukung kamera.')
      return
    }

    try {
      controlsRef.current?.stop()
    } catch {
      /* abaikan */
    }
    controlsRef.current = null
    stopMediaStream(streamRef.current)
    streamRef.current = null
    if (videoRef.current?.srcObject) {
      stopMediaStream(videoRef.current.srcObject)
      videoRef.current.srcObject = null
    }

    const sessionId = ++sessionRef.current
    setPhase('starting')
    setStatusText('Membuka kamera…')
    try {
      const stream = await openCameraStream()
      if (!mountedRef.current || sessionId !== sessionRef.current || !videoRef.current) {
        stopMediaStream(stream)
        return
      }
      streamRef.current = stream
      videoRef.current.srcObject = stream
      await videoRef.current.play()
      if (!mountedRef.current || sessionId !== sessionRef.current) {
        stopMediaStream(stream)
        streamRef.current = null
        if (videoRef.current) videoRef.current.srcObject = null
        return
      }
      await startScanningFromStream(videoRef.current, sessionId)
    } catch (e) {
      if (!mountedRef.current || sessionId !== sessionRef.current) return
      setPhase('error')
      setStatusText(
        e?.name === 'NotAllowedError'
          ? 'Izinkan akses kamera di pengaturan browser.'
          : 'Gagal membuka kamera.'
      )
    }
  }, [startScanningFromStream])

  useEffect(() => {
    if (cameraPaused) {
      stopCamera()
      return undefined
    }
    const timer = window.setTimeout(() => {
      void requestCamera()
    }, 300)
    return () => {
      clearTimeout(timer)
      stopCamera()
    }
  }, [cameraPaused, requestCamera, stopCamera])

  return (
    <div className="relative overflow-hidden rounded-xl border border-gray-200 bg-black dark:border-gray-700">
      <video
        ref={videoRef}
        className={`w-full object-cover ${compact ? 'h-32' : 'h-44 lg:h-52'}`}
        playsInline
        muted
      />
      {(phase === 'starting' || phase === 'scanning') && (
        <>
          <div className="pointer-events-none absolute inset-4 rounded-lg border-2 border-white/45" />
          <div className="pointer-events-none absolute inset-x-5 top-1/2 flex h-16 -translate-y-1/2 items-center justify-center">
            <div className="h-full w-full rounded-md border-2 border-emerald-400/85" />
            <div className="absolute inset-x-3 h-px bg-emerald-300/90" />
          </div>
        </>
      )}
      {phase === 'detected' && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-gray-900/92">
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 320, damping: 22 }}
            className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500 shadow-lg shadow-emerald-500/30"
          >
            <svg className="h-8 w-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
            </svg>
          </motion.div>
          <p className="mt-2 text-sm font-medium text-white/95">Kode terdeteksi</p>
        </div>
      )}
      {phase !== 'detected' && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 bg-linear-to-t from-black/75 to-transparent px-3 py-2">
          <p className="truncate text-xs text-white/90">{statusText || 'Membuka kamera…'}</p>
        </div>
      )}
      {phase === 'error' && !cameraPaused && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/70 p-3">
          <button
            type="button"
            onClick={() => void requestCamera()}
            className="rounded-lg bg-white px-3 py-2 text-xs font-medium text-gray-900"
          >
            Coba lagi
          </button>
        </div>
      )}
    </div>
  )
})

export default BarangBarcodeScanner
