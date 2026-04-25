import { useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import EditRencana from '../../Keuangan/EditRencana'
import { usePengeluaranFiturAccess } from '../../../hooks/usePengeluaranFiturAccess'

/**
 * Offcanvas setor PSB: memakai komponen yang sama dengan halaman buat rencana (EditRencana),
 * agar hak akses tombol/filter mengikuti pengeluaranFitur yang sama.
 */
function ItemSetorOffcanvas({ isOpen, onClose, selectedRekapRows, onSubmitted }) {
  const pengeluaranFitur = usePengeluaranFiturAccess()

  const psbFormKey = useMemo(
    () => (Array.isArray(selectedRekapRows) ? selectedRekapRows.map((r) => r.id).join('-') : ''),
    [selectedRekapRows]
  )

  useEffect(() => {
    if (!isOpen) return
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [isOpen])

  if (!pengeluaranFitur.rencanaBuat) {
    return null
  }

  return createPortal(
    <AnimatePresence mode="wait">
      {isOpen ? (
        <>
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 bg-black bg-opacity-50 z-40"
            style={{ willChange: 'opacity' }}
          />
          <motion.div
            key="panel"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{
              type: 'tween',
              duration: 0.35,
              ease: [0.25, 0.1, 0.25, 1]
            }}
            className="fixed inset-y-0 right-0 w-full sm:max-w-3xl bg-white dark:bg-gray-800 shadow-xl z-50 flex flex-col"
            style={{ willChange: 'transform', backfaceVisibility: 'hidden' }}
          >
            <div className="flex-shrink-0 p-3 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center gap-2">
              <h2 className="text-base font-semibold text-teal-600 dark:text-teal-400 truncate pr-2">
                Setor ke rencana pengeluaran
              </h2>
              <button
                type="button"
                onClick={onClose}
                className="flex-shrink-0 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 p-1"
                aria-label="Tutup"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
              <EditRencana
                key={psbFormKey}
                embedded
                embeddedPsbRows={selectedRekapRows}
                onEmbeddedClose={onClose}
                onEmbeddedSubmitted={onSubmitted}
              />
            </div>
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>,
    document.body
  )
}

export default ItemSetorOffcanvas
