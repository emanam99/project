import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useOffcanvasBackClose } from '../../../hooks/useOffcanvasBackClose'
import RiwayatDetailContent from './RiwayatDetailContent'

/**
 * Offcanvas kanan (HP): detail transaksi penjualan.
 */
export default function RiwayatDetailOffcanvas({ isOpen, onClose, detail, loading, error }) {
  const handleClose = useOffcanvasBackClose(isOpen, onClose)

  return createPortal(
    <AnimatePresence>
      {isOpen ? (
        <>
          <motion.button
            key="riwayat-detail-backdrop"
            type="button"
            aria-label="Tutup"
            className="fixed inset-0 z-[80] bg-black/40 lg:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
          />
          <motion.div
            key="riwayat-detail-panel"
            role="dialog"
            aria-modal="true"
            className="fixed inset-y-0 right-0 z-[90] flex w-full max-w-md flex-col bg-white shadow-xl dark:bg-gray-900 lg:hidden"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
          >
            <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-700">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">Detail transaksi</h2>
              <button
                type="button"
                onClick={handleClose}
                className="rounded-lg px-2 py-1 text-sm text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                Tutup
              </button>
            </div>
            <RiwayatDetailContent detail={detail} loading={loading} error={error} />
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>,
    document.body
  )
}
