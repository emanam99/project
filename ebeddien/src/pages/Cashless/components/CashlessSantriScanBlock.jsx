import { useCallback, useState } from 'react'
import { useNotification } from '../../../contexts/NotificationContext'
import { ijinAPI } from '../../../services/api'
import BukuTamuQrInlineScanner from './BukuTamuQrInlineScanner'

function CameraToggleIcon({ active, className = 'h-4 w-4' }) {
  if (active) {
    return (
      <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
        />
      </svg>
    )
  }
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029M6.343 6.343A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411M3 3l18 18"
      />
    </svg>
  )
}

/**
 * Scan QR kartu santri (CS) / mahrom (CM) → pilih santri.
 * @param {{ onSantriResolved: (santri: object) => void | Promise<void>, compact?: boolean, storageKey?: string, className?: string }} props
 */
export default function CashlessSantriScanBlock({
  onSantriResolved,
  compact = false,
  storageKey = 'ebeddien_cashless_scan_camera',
  className = '',
}) {
  const { showNotification } = useNotification()
  const [scanning, setScanning] = useState(false)
  const [scanError, setScanError] = useState(null)
  const [cameraOpen, setCameraOpen] = useState(true)

  const handleScan = useCallback(
    async (token) => {
      setScanning(true)
      setScanError(null)
      try {
        const res = await ijinAPI.scanKartu(token)
        if (res?.success && res.data?.santri) {
          await onSantriResolved?.(res.data.santri, res.data)
          showNotification(
            res.data.card?.card_type === 'MAHROM'
              ? `Kartu mahrom: ${res.data.santri.nama}`
              : `Kartu santri: ${res.data.santri.nama}`,
            'success'
          )
          return true
        }
        const msg = res?.message || 'Gagal memindai kartu'
        setScanError({ code: res?.code, message: msg })
        showNotification(msg, 'error')
        return false
      } catch (e) {
        const msg = e?.response?.data?.message || 'Gagal memindai kartu'
        setScanError({ code: e?.response?.data?.code, message: msg })
        showNotification(msg, 'error')
        return false
      } finally {
        setScanning(false)
      }
    },
    [onSantriResolved, showNotification]
  )

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-gray-700 dark:text-gray-300">Scan kartu santri</p>
        <button
          type="button"
          onClick={() => setCameraOpen((v) => !v)}
          className={`inline-flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
            cameraOpen
              ? 'bg-teal-50 text-teal-700 hover:bg-teal-100 dark:bg-teal-900/40 dark:text-teal-300 dark:hover:bg-teal-900/60'
              : 'text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700'
          }`}
          title={cameraOpen ? 'Sembunyikan kamera' : 'Tampilkan kamera'}
          aria-label={cameraOpen ? 'Sembunyikan kamera' : 'Tampilkan kamera'}
          aria-pressed={cameraOpen}
        >
          <CameraToggleIcon active={cameraOpen} />
        </button>
      </div>

      {scanError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
          {scanError.message}
        </div>
      ) : null}

      {cameraOpen ? (
        <BukuTamuQrInlineScanner
          onScan={handleScan}
          disabled={scanning}
          active={cameraOpen}
          acceptPrefixes={['CS', 'CM']}
          hintText="Arahkan kamera ke QR kartu santri (CS) atau mahrom (CM)."
          collapsible
          storageKey={storageKey}
          compact={compact}
        />
      ) : (
        <button
          type="button"
          onClick={() => setCameraOpen(true)}
          className="flex w-full items-center justify-between gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-left transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700/60"
        >
          <span className="text-sm font-medium text-gray-800 dark:text-gray-100">Tampilkan kamera</span>
          <span className="text-xs text-teal-700 dark:text-teal-300">Buka</span>
        </button>
      )}
    </div>
  )
}
