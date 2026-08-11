import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useOffcanvasBackClose } from '../../../hooks/useOffcanvasBackClose'
import DetailTokoPanel from './DetailTokoPanel'

/**
 * Offcanvas detail toko (mobile / tampilan sempit).
 */
export default function DetailTokoOffcanvas({ isOpen, onClose, tokoId, onEdit, onChanged, refreshKey = 0 }) {
  const handleClose = useOffcanvasBackClose(isOpen, onClose)

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  if (!isOpen) return null

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="detail-toko-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[9996] bg-black/50"
        onClick={handleClose}
        aria-hidden="true"
      />
      <motion.div
        key="detail-toko-panel"
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'tween', duration: 0.25 }}
        className="fixed inset-y-0 right-0 z-[9997] flex w-full max-w-md flex-col bg-white shadow-xl dark:bg-gray-800"
        role="dialog"
        aria-modal="true"
        aria-labelledby="detail-toko-title"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-700">
          <h3 id="detail-toko-title" className="text-lg font-semibold text-gray-900 dark:text-white">
            Detail Toko
          </h3>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
            aria-label="Tutup"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <DetailTokoPanel
          tokoId={tokoId}
          onEdit={onEdit}
          onChanged={onChanged}
          refreshKey={refreshKey}
        />
      </motion.div>
    </AnimatePresence>,
    document.body
  )
}
