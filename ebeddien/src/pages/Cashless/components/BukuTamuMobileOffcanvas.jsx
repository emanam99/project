import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useOffcanvasBackClose } from '../../../hooks/useOffcanvasBackClose'
import BukuTamuQrInlineScanner from './BukuTamuQrInlineScanner'

const MODE_TITLE = {
  scan: 'Scan kartu mahrom',
  result: 'Kunjungan tercatat',
  detail: 'Detail kunjungan',
}

function formatCountdownLabel(seconds) {
  const s = Math.max(0, Number(seconds) || 0)
  const m = Math.floor(s / 60)
  const r = s % 60
  if (m >= 1 && r === 0) return `${m} menit`
  if (m >= 1) return `${m}:${String(r).padStart(2, '0')}`
  return `${s} detik`
}

/**
 * Offcanvas kanan (HP): header → kamera di atas → biodata scroll.
 */
export default function BukuTamuMobileOffcanvas({
  isOpen,
  mode,
  onClose,
  onExitComplete,
  onScan,
  scanning,
  countdown,
  countdownActive,
  onKeepOpen,
  scanError = null,
  children,
}) {
  const handleClose = useOffcanvasBackClose(isOpen, onClose)
  const showScanner = mode === 'scan' || mode === 'result'
  const showBiodata = mode === 'result' || mode === 'detail' || Boolean(scanError?.message)
  const showCountdown = mode === 'result' && countdownActive && countdown > 0

  return createPortal(
    <AnimatePresence onExitComplete={onExitComplete}>
      {isOpen ? (
        <motion.div
          key="buku-tamu-mobile-offcanvas"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22 }}
          className="fixed inset-0 z-[280] lg:hidden flex justify-end bg-black/50"
          onClick={handleClose}
        >
          <motion.aside
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'tween', duration: 0.22, ease: 'easeInOut' }}
            className="w-full max-w-md h-full bg-white dark:bg-gray-900 shadow-xl flex flex-col overflow-hidden"
            style={{ paddingRight: 'env(safe-area-inset-right, 0px)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex-shrink-0 px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                  {MODE_TITLE[mode] || MODE_TITLE.scan}
                </h2>
                {showCountdown && (
                  <p className="text-xs text-teal-600 dark:text-teal-400 mt-1">
                    Menutup otomatis dalam {formatCountdownLabel(countdown)}…
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={handleClose}
                className="flex-shrink-0 p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
                aria-label="Tutup"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {showScanner && (
              <div className="flex-shrink-0 px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-950/50">
                <BukuTamuQrInlineScanner onScan={onScan} disabled={scanning} active={isOpen} compact />
              </div>
            )}

            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4">
              {showBiodata ? (
                <div className="min-w-0">{children}</div>
              ) : (
                <p className="text-sm text-center text-gray-500 dark:text-gray-400 py-6">
                  Arahkan kamera ke QR kartu CM di atas.
                </p>
              )}
            </div>

            {showCountdown && (
              <div
                className="flex-shrink-0 px-4 py-3 border-t border-gray-200 dark:border-gray-700 flex flex-wrap items-center gap-2"
                style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom, 0px))' }}
              >
                <button
                  type="button"
                  onClick={onKeepOpen}
                  className="flex-1 min-w-[8rem] px-3 py-2.5 rounded-xl text-sm font-medium bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 hover:bg-teal-100 dark:hover:bg-teal-900/50"
                >
                  Tetap buka
                </button>
                <button
                  type="button"
                  onClick={handleClose}
                  className="px-3 py-2.5 rounded-xl text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  Tutup
                </button>
              </div>
            )}
          </motion.aside>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body
  )
}
