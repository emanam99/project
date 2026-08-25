import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useOffcanvasBackClose } from '../../../hooks/useOffcanvasBackClose'
import BarangScannerSection from './BarangScannerSection'
import BarangQrScanButton from './BarangQrScanButton'

/**
 * Offcanvas HP: kanan (form barang) atau atas (scan penjualan).
 * Kamera dimatikan segera saat tutup (sebelum panel hilang).
 */
export default function BarangMobileOffcanvas({
  isOpen,
  title,
  modeLabel,
  onClose,
  onScan,
  closeDisabled = false,
  scannerRef,
  scannerExpanded = true,
  showQrButton = false,
  onOpenQrScanner,
  children,
  placement = 'right',
}) {
  const handleBackClose = useOffcanvasBackClose(isOpen && !closeDisabled, onClose)
  const fromTop = placement === 'top'

  const handleClose = () => {
    scannerRef?.current?.stop()
    handleBackClose()
  }

  return createPortal(
    <AnimatePresence>
      {isOpen ? (
        <motion.div
          key="barang-mobile-offcanvas"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22 }}
          className={`fixed inset-0 z-9998 flex bg-black/50 lg:hidden ${
            fromTop ? 'items-start justify-center' : 'justify-end'
          }`}
          onClick={closeDisabled ? undefined : handleClose}
        >
          <motion.aside
            initial={fromTop ? { y: '-100%' } : { x: '100%' }}
            animate={fromTop ? { y: 0 } : { x: 0 }}
            exit={fromTop ? { y: '-100%' } : { x: '100%' }}
            transition={{ type: 'tween', duration: 0.22, ease: 'easeInOut' }}
            className={`flex w-full flex-col overflow-hidden bg-white shadow-xl dark:bg-gray-900 ${
              fromTop
                ? 'max-h-[92vh] max-w-lg rounded-b-2xl'
                : 'h-full max-w-md'
            }`}
            style={
              fromTop
                ? { paddingTop: 'max(0.75rem, env(safe-area-inset-top, 0px))' }
                : { paddingRight: 'env(safe-area-inset-right, 0px)' }
            }
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-gray-200 px-4 py-3 dark:border-gray-700">
              <div className="min-w-0">
                {modeLabel ? (
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-primary-600 dark:text-primary-400">
                    {modeLabel}
                  </p>
                ) : null}
                <h2 className="min-w-0 truncate text-base font-semibold text-gray-900 dark:text-gray-100">
                  {title}
                </h2>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <AnimatePresence initial={false}>
                  {showQrButton ? (
                    <motion.div
                      key="qr-btn-mobile"
                      initial={{ opacity: 0, scale: 0.85 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.85 }}
                      transition={{ duration: 0.2, ease: [0.32, 0.72, 0, 1] }}
                    >
                      <BarangQrScanButton onClick={onOpenQrScanner} size="sm" />
                    </motion.div>
                  ) : null}
                </AnimatePresence>
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={closeDisabled}
                  className="shrink-0 rounded-lg p-2 text-gray-500 hover:bg-gray-100 disabled:opacity-40 dark:hover:bg-gray-800"
                  aria-label="Tutup"
                >
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div
              className={`shrink-0 overflow-hidden ${
                scannerExpanded
                  ? 'border-b border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-700 dark:bg-gray-950/50'
                  : ''
              }`}
            >
              <BarangScannerSection
                expanded={scannerExpanded}
                onScan={onScan}
                scannerRef={scannerRef}
                pageActive={isOpen && scannerExpanded}
                compact
              />
            </div>

            <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-4">{children}</div>
          </motion.aside>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body
  )
}
