import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { releaseVideoStream, stopMediaStream } from '../../../utils/cameraStreamUtils'

let browserQrReaderPromise = null
function loadBrowserQRCodeReader() {
  if (!browserQrReaderPromise) {
    browserQrReaderPromise = import('@zxing/browser').then((mod) => mod.BrowserQRCodeReader)
  }
  return browserQrReaderPromise
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

/**
 * Kamera inline untuk scan QR kartu cashless.
 * Stream tetap hidup saat `disabled` (mis. API scan jalan) — hanya menolak baca QR baru.
 */
export default function BukuTamuQrInlineScanner({
  onScan,
  disabled = false,
  active = true,
  cooldownMs = 2500,
  compact = false,
  acceptPrefixes = ['CM'],
  hintText,
  collapsible = false,
  storageKey = null,
}) {
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const controlsRef = useRef(null)
  const sessionRef = useRef(0)
  const handledRef = useRef(false)
  const cooldownUntilRef = useRef(0)
  const mountedRef = useRef(true)
  const onScanRef = useRef(onScan)
  const [phase, setPhase] = useState('idle')
  const [statusText, setStatusText] = useState('')
  const [minimized, setMinimized] = useState(() => {
    if (!collapsible || !storageKey || typeof window === 'undefined') return false
    try {
      return window.localStorage.getItem(storageKey) === '1'
    } catch {
      return false
    }
  })

  onScanRef.current = onScan

  /** Hanya tutup kamera jika offcanvas ditutup / minimize — bukan saat API `disabled`. */
  const cameraShouldRun = Boolean(active && !minimized)
  const acceptScans = Boolean(cameraShouldRun && !disabled)

  const prefixes = useMemo(
    () => (Array.isArray(acceptPrefixes) && acceptPrefixes.length > 0 ? acceptPrefixes : ['CM']),
    [acceptPrefixes]
  )
  const defaultHint =
    hintText ||
    (prefixes.length === 1 && prefixes[0] === 'CM'
      ? 'Arahkan kamera ke QR kartu mahrom (CM).'
      : `Arahkan kamera ke QR kartu (${prefixes.join(' / ')}).`)
  const rejectHint =
    prefixes.length === 1 && prefixes[0] === 'CM'
      ? 'Bukan QR kartu mahrom (CM).'
      : `Bukan QR kartu ${prefixes.join(' / ')}.`

  const defaultHintRef = useRef(defaultHint)
  const rejectHintRef = useRef(rejectHint)
  const prefixesRef = useRef(prefixes)
  const cooldownMsRef = useRef(cooldownMs)
  const acceptScansRef = useRef(acceptScans)
  defaultHintRef.current = defaultHint
  rejectHintRef.current = rejectHint
  prefixesRef.current = prefixes
  cooldownMsRef.current = cooldownMs
  acceptScansRef.current = acceptScans

  const stopCamera = useCallback(() => {
    sessionRef.current += 1
    try {
      controlsRef.current?.stop()
    } catch {
      /* ignore */
    }
    controlsRef.current = null
    const held = streamRef.current
    streamRef.current = null
    releaseVideoStream(videoRef.current, held)
  }, [])

  const setMinimizedPersist = useCallback(
    (next) => {
      if (next) stopCamera()
      setMinimized(next)
      if (!storageKey || typeof window === 'undefined') return
      try {
        window.localStorage.setItem(storageKey, next ? '1' : '0')
      } catch {
        /* ignore */
      }
    },
    [storageKey, stopCamera]
  )

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      stopCamera()
    }
  }, [stopCamera])

  const handleScanText = useCallback((raw) => {
    if (!acceptScansRef.current || handledRef.current) return
    if (Date.now() < cooldownUntilRef.current) return
    const token = String(raw || '').trim()
    if (!token) return
    const ok = prefixesRef.current.some((p) => token.startsWith(p))
    if (!ok) {
      setStatusText(rejectHintRef.current)
      return
    }
    handledRef.current = true
    const cool = cooldownMsRef.current
    cooldownUntilRef.current = Date.now() + cool
    setPhase('detected')
    setStatusText('QR terbaca…')
    onScanRef.current?.(token)
    window.setTimeout(() => {
      if (!mountedRef.current) return
      handledRef.current = false
      // Kembalikan preview kamera — jangan biarkan overlay "detected" menempel
      if (sessionRef.current > 0 && streamRef.current) {
        setPhase('scanning')
        setStatusText(defaultHintRef.current)
      }
    }, Math.min(900, cool))
  }, [])

  const startScanningFromStream = useCallback(async (videoEl, sessionId) => {
    const BrowserQRCodeReader = await loadBrowserQRCodeReader()
    if (!mountedRef.current || sessionId !== sessionRef.current) return
    const reader = new BrowserQRCodeReader()
    const controls = await reader.decodeFromVideoElement(videoEl, (result) => {
      if (result) handleScanText(result.getText())
    })
    if (!mountedRef.current || sessionId !== sessionRef.current) {
      try {
        controls.stop()
      } catch {
        /* ignore */
      }
      return
    }
    controlsRef.current = controls
    setPhase('scanning')
    setStatusText(defaultHintRef.current)
  }, [handleScanText])

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
      /* ignore */
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
      try {
        await videoRef.current.play()
      } catch {
        /* BrowserQRCodeReader juga akan play */
      }
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
    if (!cameraShouldRun) {
      stopCamera()
      setPhase('idle')
      setStatusText('')
      return undefined
    }
    const streamAlive = Boolean(
      streamRef.current?.getTracks?.().some((t) => t.readyState === 'live') &&
        videoRef.current?.srcObject
    )
    if (streamAlive && controlsRef.current) {
      return undefined
    }
    const timer = window.setTimeout(() => {
      void requestCamera()
    }, 200)
    return () => {
      clearTimeout(timer)
    }
  }, [cameraShouldRun, requestCamera, stopCamera])

  if (collapsible && minimized) {
    return (
      <button
        type="button"
        onClick={() => setMinimizedPersist(false)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-left hover:bg-gray-50 dark:hover:bg-gray-700/60 transition-colors"
      >
        <span className="flex items-center gap-2 min-w-0">
          <svg className="w-5 h-5 text-teal-600 dark:text-teal-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
            />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <span className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">
            Tampilkan kamera scan
          </span>
        </span>
        <span className="text-xs text-teal-700 dark:text-teal-300 shrink-0">Buka</span>
      </button>
    )
  }

  return (
    <div className="relative rounded-xl overflow-hidden bg-black border border-gray-200 dark:border-gray-700">
      {collapsible && (
        <button
          type="button"
          onClick={() => setMinimizedPersist(true)}
          className="absolute top-2 right-2 z-30 inline-flex items-center gap-1 px-2 py-1 rounded-md bg-black/55 hover:bg-black/75 text-white text-[11px] font-medium backdrop-blur-sm"
          title="Sembunyikan kamera"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
          </svg>
          Minimize
        </button>
      )}
      <video
        ref={videoRef}
        className={`w-full object-cover ${compact ? 'h-32' : 'h-44 lg:h-52'}`}
        playsInline
        muted
        autoPlay
      />
      {(phase === 'starting' || phase === 'scanning') && (
        <div className="absolute inset-4 border-2 border-white/60 rounded-lg pointer-events-none" />
      )}
      {phase === 'detected' && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-gray-900/70 pointer-events-none">
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 320, damping: 22 }}
            className="w-14 h-14 rounded-full bg-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-500/30"
          >
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
            </svg>
          </motion.div>
          <p className="mt-2 text-sm font-medium text-white/95">QR terdeteksi</p>
        </div>
      )}
      {phase !== 'detected' && (
        <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/75 to-transparent px-3 py-2 z-20 pointer-events-none">
          <p className="text-xs text-white/90 truncate">
            {disabled && phase === 'scanning'
              ? 'Memproses… siap scan lagi sebentar.'
              : statusText || 'Membuka kamera…'}
          </p>
        </div>
      )}
      {phase === 'error' && cameraShouldRun && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/70 p-3 z-30">
          <button
            type="button"
            onClick={() => void requestCamera()}
            className="px-3 py-2 rounded-lg bg-white text-gray-900 text-xs font-medium"
          >
            Coba lagi
          </button>
        </div>
      )}
    </div>
  )
}
