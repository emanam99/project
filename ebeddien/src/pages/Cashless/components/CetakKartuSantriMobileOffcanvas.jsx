import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useOffcanvasBackClose } from '../../../hooks/useOffcanvasBackClose'
import CetakKartuSantriSidePanel from './CetakKartuSantriSidePanel'

/**
 * Offcanvas kanan (mobile): detail santri, foto, buat akun cashless.
 */
export default function CetakKartuSantriMobileOffcanvas({
  isOpen,
  onClose,
  account,
  santriDetail,
  loading,
  onCariSantri,
  onBuatAkun,
  createSaving,
  onAccountRefresh,
  cameraOpen = false,
  onToggleCamera,
}) {
  const handleClose = useOffcanvasBackClose(isOpen, onClose)

  return createPortal(
    <AnimatePresence>
      {isOpen ? (
        <motion.div
          key="cetak-kartu-santri-mobile-offcanvas"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22 }}
          className="fixed inset-0 z-[260] lg:hidden flex justify-end bg-black/50"
          onClick={handleClose}
        >
          <motion.aside
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'tween', duration: 0.22, ease: 'easeInOut' }}
            className="w-full max-w-sm h-full bg-white dark:bg-gray-900 shadow-xl flex flex-col overflow-hidden"
            style={{ paddingRight: 'env(safe-area-inset-right, 0px)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex-shrink-0 px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Detail santri</h2>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Biodata, foto, dan akun cashless</p>
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

            <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-4">
              <CetakKartuSantriSidePanel
                account={account}
                santriDetail={santriDetail}
                loading={loading}
                onCariSantri={onCariSantri}
                onBuatAkun={onBuatAkun}
                createSaving={createSaving}
                onAccountRefresh={onAccountRefresh}
                cameraOpen={cameraOpen}
                onToggleCamera={onToggleCamera}
              />
            </div>
          </motion.aside>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body
  )
}
