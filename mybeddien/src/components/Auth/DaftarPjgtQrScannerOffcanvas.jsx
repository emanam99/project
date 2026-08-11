import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { authAPI } from '../../services/api'
import { useOffcanvasBackClose } from '../../hooks/useOffcanvasBackClose'
import { viteDynamicImport } from '../../utils/viteDynamicImport'

function parseIdentitasFromQr(raw) {
  const text = String(raw || '').trim()
  if (!text) return ''
  if (/^https?:\/\//i.test(text)) {
    try {
      const url = new URL(text)
      const fromQuery = url.searchParams.get('identitas') || url.searchParams.get('id')
      if (fromQuery) return fromQuery.trim()
    } catch {
      /* pakai teks mentah */
    }
  }
  return text
}

function canUseCameraApi() {
  return Boolean(
    typeof navigator !== 'undefined' &&
      navigator.mediaDevices &&
      typeof navigator.mediaDevices.getUserMedia === 'function'
  )
}

function isCameraDeniedError(err) {
  const name = err?.name || ''
  return name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError'
}

function isDocumentCameraBlockedByPolicy() {
  try {
    if (typeof document !== 'undefined' && document.permissionsPolicy?.allowsFeature) {
      return !document.permissionsPolicy.allowsFeature('camera')
    }
  } catch {
    /* abaikan */
  }
  return false
}

async function loadBrowserQRCodeReader() {
  const mod = await viteDynamicImport(() => import('@zxing/browser'))
  return mod.BrowserQRCodeReader
}

/** Urutan constraint: coba kamera belakang dulu, lalu fallback umum (HP/browser tertentu). */
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
      if (isCameraDeniedError(e)) throw e
    }
  }
  throw lastErr || new Error('Gagal membuka kamera')
}

/**
 * Pemindai QR daftar PJGT — hanya kamera langsung (tanpa galeri), offcanvas bawah.
 * Chrome mobile: getUserMedia wajib dari ketukan user (bukan useEffect otomatis).
 */
export default function DaftarPjgtQrScannerOffcanvas({ isOpen, onClose, onSuccess }) {
  const handleClose = useOffcanvasBackClose(isOpen, onClose)
  const videoRef = useRef(null)
  const controlsRef = useRef(null)
  const handledRef = useRef(false)
  /** ready = tunggu ketukan user; starting | scanning | lookup | denied | error | insecure */
  const [phase, setPhase] = useState('ready')
  const [statusText, setStatusText] = useState('')

  const stopCamera = useCallback(async () => {
    try {
      controlsRef.current?.stop()
    } catch {
      /* ignore */
    }
    controlsRef.current = null
    const el = videoRef.current
    const stream = el?.srcObject
    if (stream && typeof stream.getTracks === 'function') {
      stream.getTracks().forEach((t) => t.stop())
    }
    if (el) el.srcObject = null
  }, [])

  const handleScanText = useCallback(
    async (raw) => {
      if (handledRef.current) return
      const identitas = parseIdentitasFromQr(raw)
      if (!identitas) {
        setStatusText('QR tidak berisi identitas madrasah.')
        setPhase('error')
        return
      }
      handledRef.current = true
      await stopCamera()
      setPhase('lookup')
      setStatusText('Memuat data madrasah…')
      try {
        const res = await authAPI.daftarLookupMadrasahPjgt(identitas)
        if (!res?.success) {
          handledRef.current = false
          setPhase('error')
          setStatusText(res?.message || 'Identitas tidak ditemukan.')
          return
        }
        onSuccess?.({
          identitas: res.identitas || identitas,
          nama: res.nama || '',
          alreadyRegistered: !!res.already_registered,
        })
        handleClose()
      } catch {
        handledRef.current = false
        setPhase('error')
        setStatusText('Gagal memuat data madrasah. Coba lagi.')
      }
    },
    [handleClose, onSuccess, stopCamera]
  )

  const startScanningFromStream = useCallback(
    async (videoEl) => {
      const BrowserQRCodeReader = await loadBrowserQRCodeReader()
      const reader = new BrowserQRCodeReader()
      const controls = await reader.decodeFromVideoElement(videoEl, (result, err) => {
        if (result) {
          handleScanText(result.getText())
          return
        }
        if (err && err.name !== 'NotFoundException') {
          /* belum ada QR di frame */
        }
      })
      controlsRef.current = controls
      setPhase('scanning')
      setStatusText('Arahkan kamera ke QR identitas madrasah.')
    },
    [handleScanText]
  )

  const handleCameraFailure = useCallback(
    (e) => {
      const msg = String(e?.message || '')
      if (msg.includes('Permissions policy') || msg.includes('permissions policy')) {
        setPhase('policy')
        setStatusText(
          'Situs memblokir kamera (header Permissions-Policy camera=()). Deploy ulang myBeddien 1.1.8+ (public/.htaccess & index.html), kosongkan cache, muat ulang halaman.'
        )
        return
      }
      if (isCameraDeniedError(e)) {
        setPhase('denied')
        setStatusText(
          'Akses kamera ditolak atau diblokir. Ketuk «Izinkan akses kamera» lagi, atau buka Pengaturan situs (ikon gembok) → Kamera → Izinkan, lalu muat ulang halaman.'
        )
        return
      }
      const name = e?.name || ''
      if (name === 'NotFoundError' || name === 'OverconstrainedError') {
        setPhase('error')
        setStatusText('Kamera tidak ditemukan. Pastikan tidak dipakai aplikasi lain.')
      } else {
        setPhase('error')
        const detail = e?.message ? ` (${e.message})` : ''
        setStatusText(`Tidak bisa membuka kamera${detail}. Ketuk tombol di bawah untuk coba lagi.`)
      }
    },
    []
  )

  /** Hanya dipanggil dari onClick — memenuhi syarat user gesture Chrome/Android. */
  const requestCameraPermission = useCallback(async () => {
    if (!videoRef.current) return

    if (!window.isSecureContext) {
      setPhase('insecure')
      setStatusText(
        'Kamera hanya tersedia di HTTPS atau localhost. Jika buka lewat IP LAN (http://192.168…), gunakan HTTPS production atau tunnel (ngrok) untuk uji di HP.'
      )
      return
    }

    if (!canUseCameraApi()) {
      setPhase('error')
      setStatusText('Browser tidak mendukung akses kamera di konteks ini.')
      return
    }

    if (isDocumentCameraBlockedByPolicy()) {
      setPhase('policy')
      setStatusText(
        'Kebijakan dokumen melarang kamera. Pastikan server mengirim Permissions-Policy: camera=(self), bukan camera=(). Setelah deploy, hard refresh (Ctrl+Shift+R).'
      )
      return
    }

    handledRef.current = false
    setPhase('starting')
    setStatusText('Meminta izin kamera…')
    await stopCamera()

    try {
      const stream = await openCameraStream()
      const videoEl = videoRef.current
      videoEl.srcObject = stream
      videoEl.setAttribute('playsinline', 'true')
      videoEl.setAttribute('webkit-playsinline', 'true')
      await videoEl.play()
      await startScanningFromStream(videoEl)
    } catch (e) {
      handleCameraFailure(e)
    }
  }, [handleCameraFailure, startScanningFromStream, stopCamera])

  useEffect(() => {
    if (!isOpen) {
      stopCamera()
      setPhase('ready')
      setStatusText('')
      handledRef.current = false
      return undefined
    }

    if (!window.isSecureContext) {
      setPhase('insecure')
      setStatusText(
        'Untuk scan di HP, buka myBeddien lewat HTTPS (bukan http://IP komputer). Di localhost/HTTPS, ketuk tombol di bawah untuk izin kamera.'
      )
      return undefined
    }

    if (!canUseCameraApi()) {
      setPhase('error')
      setStatusText('Perangkat/browser ini tidak menyediakan API kamera.')
      return undefined
    }

    if (isDocumentCameraBlockedByPolicy()) {
      setPhase('policy')
      setStatusText(
        'Kamera diblokir kebijakan situs (camera=()). Perlu deploy .htaccess terbaru; cek header index.html di tab Network DevTools.'
      )
      return undefined
    }

    setPhase('ready')
    setStatusText('Ketuk tombol di bawah — browser akan menanyakan izin akses kamera.')
    return () => {
      stopCamera()
    }
  }, [isOpen, stopCamera])

  if (!isOpen) return null

  const showActivateOverlay =
    phase === 'ready' || phase === 'insecure' || phase === 'denied' || phase === 'error' || phase === 'policy'
  const activateLabel =
    phase === 'ready' ? 'Izinkan akses kamera' : phase === 'insecure' ? 'Coba aktifkan kamera' : 'Izinkan akses kamera'

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="pjgt-qr-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 z-100"
        onClick={() => {
          if (phase !== 'lookup') handleClose()
        }}
      />
      <motion.div
        key="pjgt-qr-panel"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        className="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 rounded-t-2xl shadow-2xl z-101 flex flex-col max-h-[min(92vh,640px)]"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1 rounded-full bg-gray-300 dark:bg-gray-600 mx-auto mt-3 shrink-0" aria-hidden />
        <motion.div className="flex items-center justify-between px-4 pt-3 pb-2 shrink-0">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Scan QR Madrasah</h2>
          <button
            type="button"
            onClick={handleClose}
            disabled={phase === 'lookup'}
            className="p-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 disabled:opacity-40"
            aria-label="Tutup"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </motion.div>

        <div className="px-4 pb-4 flex-1 min-h-0 flex flex-col gap-3">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            QR berisi identitas madrasah saja. Setelah izin kamera diberikan, identitas dan nama terisi otomatis.
          </p>

          <div className="relative mx-auto w-full max-w-sm aspect-square rounded-2xl overflow-hidden bg-black shrink-0">
            <video
              ref={videoRef}
              className="absolute inset-0 w-full h-full object-cover"
              playsInline
              muted
              autoPlay
            />
            {(phase === 'starting' || phase === 'lookup') && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-20">
                <svg className="animate-spin h-10 w-10 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden>
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              </div>
            )}
            {phase === 'scanning' && (
              <div className="absolute inset-6 border-2 border-primary-400/90 rounded-xl pointer-events-none z-10" aria-hidden />
            )}
            {showActivateOverlay && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gray-900/92 p-4 text-center z-30">
                <svg className="w-12 h-12 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                  />
                </svg>
                {phase === 'insecure' ? (
                  <p className="text-xs text-amber-200 max-w-xs">
                    Koneksi tidak aman (bukan HTTPS). Chrome tidak menampilkan prompt kamera untuk http://IP-address.
                  </p>
                ) : null}
                <button
                  type="button"
                  onClick={requestCameraPermission}
                  className="px-5 py-3 rounded-xl font-semibold bg-primary-600 text-white hover:bg-primary-700 shadow-md text-sm"
                >
                  {activateLabel}
                </button>
              </div>
            )}
          </div>

          <p className="text-center text-sm text-gray-600 dark:text-gray-400 min-h-12">{statusText}</p>

          {showActivateOverlay ? (
            <button
              type="button"
              onClick={requestCameraPermission}
              className="w-full py-3 rounded-xl font-medium bg-primary-600 text-white hover:bg-primary-700"
            >
              {activateLabel}
            </button>
          ) : null}

          <button
            type="button"
            onClick={handleClose}
            disabled={phase === 'lookup'}
            className="w-full py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/80 disabled:opacity-40"
          >
            Batal
          </button>
        </div>
      </motion.div>
    </AnimatePresence>,
    document.body
  )
}
