import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { releaseVideoStream, stopMediaStream } from '../../../utils/cameraStreamUtils'

async function loadBrowserQRCodeReader() {
  const mod = await import('@zxing/browser')
  return mod.BrowserQRCodeReader
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
 * Scan QR kartu cashless setelah cetak — cocokkan token lalu konfirmasi kondisi fisik.
 */
export default function KartuQrValidateScanner({
  isOpen,
  onClose,
  expectedToken = '',
  kartuLabel = 'Kartu',
  onValidate,
  validating = false,
  autoStart = true,
}) {
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const controlsRef = useRef(null)
  const handledRef = useRef(false)
  const mountedRef = useRef(true)
  const isOpenRef = useRef(isOpen)
  const [phase, setPhase] = useState('ready')
  const [statusText, setStatusText] = useState('')
  const [scannedToken, setScannedToken] = useState('')
  const [qrOk, setQrOk] = useState(true)
  const [fisikOk, setFisikOk] = useState(true)

  isOpenRef.current = isOpen

  const stopCamera = useCallback(() => {
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

  const resetState = useCallback(() => {
    handledRef.current = false
    setPhase('ready')
    setStatusText('')
    setScannedToken('')
    setQrOk(true)
    setFisikOk(true)
  }, [])

  const handleScanText = useCallback(
    (raw) => {
      if (handledRef.current) return
      const token = String(raw || '').trim()
      if (!token) {
        setStatusText('QR kosong. Coba lagi.')
        setPhase('error')
        return
      }
      handledRef.current = true
      stopCamera()
      setScannedToken(token)
      const trimmedExpected = String(expectedToken || '').trim()
      const crossDevice = !trimmedExpected
      const match = crossDevice ? true : token === trimmedExpected
      setQrOk(!!match)
      setPhase('confirm')
      setStatusText(
        crossDevice
          ? 'QR terbaca. Konfirmasi kondisi fisik kartu — server akan memverifikasi token.'
          : match
            ? 'QR cocok dengan kartu yang dicetak.'
            : 'QR tidak cocok dengan data cetak. Periksa kartu atau cetak ulang.'
      )
    },
    [expectedToken, stopCamera]
  )

  const startScanningFromStream = useCallback(
    async (videoEl) => {
      const BrowserQRCodeReader = await loadBrowserQRCodeReader()
      if (!mountedRef.current || !isOpenRef.current) return
      const reader = new BrowserQRCodeReader()
      const controls = await reader.decodeFromVideoElement(videoEl, (result) => {
        if (result) handleScanText(result.getText())
      })
      if (!mountedRef.current || !isOpenRef.current) {
        try {
          controls.stop()
        } catch {
          /* ignore */
        }
        return
      }
      controlsRef.current = controls
      setPhase('scanning')
      setStatusText('Arahkan kamera ke QR pada kartu yang baru dicetak.')
    },
    [handleScanText]
  )

  const requestCamera = useCallback(async () => {
    if (!isOpenRef.current) return
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
    handledRef.current = false
    setPhase('starting')
    setStatusText('Membuka kamera…')
    try {
      const stream = await openCameraStream()
      if (!mountedRef.current || !isOpenRef.current || !videoRef.current) {
        stopMediaStream(stream)
        return
      }
      streamRef.current = stream
      videoRef.current.srcObject = stream
      await videoRef.current.play()
      if (!mountedRef.current || !isOpenRef.current) {
        stopCamera()
        return
      }
      await startScanningFromStream(videoRef.current)
      if (!mountedRef.current || !isOpenRef.current) {
        stopCamera()
      }
    } catch (e) {
      if (!mountedRef.current) return
      setPhase('error')
      setStatusText(
        e?.name === 'NotAllowedError'
          ? 'Izinkan akses kamera di pengaturan browser.'
          : 'Gagal membuka kamera.'
      )
    }
  }, [startScanningFromStream, stopCamera])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      stopCamera()
    }
  }, [stopCamera])

  useEffect(() => {
    if (!isOpen) {
      stopCamera()
      resetState()
      return undefined
    }
    if (!autoStart) return undefined
    const timer = window.setTimeout(() => {
      void requestCamera()
    }, 350)
    return () => {
      clearTimeout(timer)
      stopCamera()
    }
  }, [isOpen, autoStart, stopCamera, resetState, requestCamera])

  const handleConfirm = () => {
    if (!scannedToken || !fisikOk) return
    if (!crossDeviceMode && !qrOk) return
    onValidate?.({ token: scannedToken, qrOk, fisikOk })
  }

  const handleRetry = () => {
    resetState()
    void requestCamera()
  }

  const handleClose = () => {
    stopCamera()
    onClose?.()
  }

  if (!isOpen) return null

  const crossDeviceMode = !String(expectedToken || '').trim()

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 z-[300]"
            onClick={handleClose}
          />
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            className="fixed bottom-0 left-0 right-0 z-[310] bg-white dark:bg-gray-900 rounded-t-2xl shadow-2xl max-h-[92vh] flex flex-col overflow-hidden"
          >
            <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Validasi kartu</h2>
                <p className="text-xs text-gray-500 dark:text-gray-400">{kartuLabel}</p>
                {crossDeviceMode && (
                  <p className="text-[11px] text-violet-600 dark:text-violet-400 mt-0.5">
                    Scan QR pada kartu fisik — bisa dari HP meski cetak di laptop
                  </p>
                )}
              </div>
              <button type="button" onClick={handleClose} className="p-2 text-gray-500 hover:text-gray-800 rounded-lg">
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <div
                className={`space-y-3 ${phase === 'confirm' ? 'hidden' : ''}`}
              >
                <div className="relative aspect-[4/3] max-h-64 mx-auto rounded-xl overflow-hidden bg-black">
                  <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
                  {(phase === 'starting' || phase === 'scanning') && (
                    <div className="absolute inset-6 border-2 border-white/70 rounded-lg pointer-events-none" />
                  )}
                </div>
                {phase === 'ready' && !autoStart && (
                  <div className="text-center">
                    <button
                      type="button"
                      onClick={requestCamera}
                      className="px-4 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium"
                    >
                      Buka kamera & scan QR
                    </button>
                  </div>
                )}
                {phase === 'ready' && autoStart && (
                  <p className="text-sm text-center text-gray-600 dark:text-gray-300">
                    Membuka kamera untuk scan kartu…
                  </p>
                )}
                {(phase === 'starting' || phase === 'scanning' || phase === 'error') && (
                  <>
                    <p className={`text-sm text-center ${phase === 'error' ? 'text-red-600' : 'text-gray-600 dark:text-gray-300'}`}>
                      {statusText}
                    </p>
                    {phase === 'error' && (
                      <button
                        type="button"
                        onClick={handleRetry}
                        className="w-full py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm"
                      >
                        Coba lagi
                      </button>
                    )}
                  </>
                )}
              </div>

              {phase === 'confirm' && (
                <div className="space-y-4">
                  <div
                    className={`rounded-xl border p-4 ${
                      qrOk
                        ? 'border-emerald-200 bg-emerald-50 dark:bg-emerald-900/20 dark:border-emerald-800'
                        : 'border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-800'
                    }`}
                  >
                    <p className={`text-sm font-medium ${qrOk ? 'text-emerald-800 dark:text-emerald-200' : 'text-red-800 dark:text-red-200'}`}>
                      {statusText}
                    </p>
                  </div>

                  <div className="space-y-2 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Cek kondisi fisik</p>
                    <label className="flex items-start gap-2 cursor-pointer">
                      <input type="checkbox" checked={qrOk} disabled className="mt-0.5" />
                      <span className="text-sm text-gray-700 dark:text-gray-300">
                        {crossDeviceMode
                          ? 'QR terbaca dari kartu fisik'
                          : 'QR terbaca dan sesuai data cetak'}
                      </span>
                    </label>
                    <label className="flex items-start gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={fisikOk}
                        onChange={(e) => setFisikOk(e.target.checked)}
                        className="mt-0.5"
                      />
                      <span className="text-sm text-gray-700 dark:text-gray-300">
                        Kartu tidak lecet / rusak; nama & NIM terbaca jelas
                      </span>
                    </label>
                  </div>

                  <div className="flex gap-2">
                    <button type="button" onClick={handleRetry} className="flex-1 py-2.5 rounded-xl border text-sm">
                      Scan ulang
                    </button>
                    <button
                      type="button"
                      disabled={(!crossDeviceMode && !qrOk) || !fisikOk || validating}
                      onClick={handleConfirm}
                      className="flex-1 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-sm font-medium"
                    >
                      {validating ? 'Memvalidasi…' : 'Aktifkan kartu'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  )
}
