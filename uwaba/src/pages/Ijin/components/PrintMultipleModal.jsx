import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useNotification } from '../../../contexts/NotificationContext'

function PrintMultipleModal({ isOpen, onClose, selectedSantriList, printOptions, onPrintOptionsChange, onConfirm }) {
  const { showNotification } = useNotification()

  const handleConfirm = () => {
    if (!printOptions.pulangan && !printOptions.shohifah) {
      showNotification('Pilih minimal satu jenis print (Pulangan atau Shohifah)', 'error')
      return
    }

    // Panggil callback untuk membuka offcanvas
    if (onConfirm) {
      onConfirm()
    }
    // Tutup modal
    onClose()
  }

  if (!isOpen) return null

  const modalContent = (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="no-print fixed inset-0 bg-black bg-opacity-50 z-[99998]"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="no-print fixed inset-0 z-[99999] flex items-center justify-center p-4"
            onClick={(e) => {
              if (e.target === e.currentTarget) onClose()
            }}
          >
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                  Print {selectedSantriList.length} Santri
                </h2>
                <button
                  onClick={onClose}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="space-y-4 mb-6">
                <div>
                  <label className="flex items-center gap-3 p-3 border border-gray-300 dark:border-gray-600 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                    <input
                      type="checkbox"
                      checked={printOptions.pulangan}
                      onChange={(e) => onPrintOptionsChange({ ...printOptions, pulangan: e.target.checked })}
                      className="w-4 h-4 text-teal-600 border-gray-300 rounded focus:ring-teal-500"
                    />
                    <div className="flex-1">
                      <span className="font-medium text-gray-900 dark:text-gray-100">Ijin Pulangan</span>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Print surat ijin pulangan (Portrait)</p>
                    </div>
                  </label>
                </div>

                <div>
                  <label className="flex items-center gap-3 p-3 border border-gray-300 dark:border-gray-600 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                    <input
                      type="checkbox"
                      checked={printOptions.shohifah}
                      onChange={(e) => onPrintOptionsChange({ ...printOptions, shohifah: e.target.checked })}
                      className="w-4 h-4 text-teal-600 border-gray-300 rounded focus:ring-teal-500"
                    />
                    <div className="flex-1">
                      <span className="font-medium text-gray-900 dark:text-gray-100">Shohifah</span>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Print shohifah santri (Landscape)</p>
                    </div>
                  </label>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={onClose}
                  className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
                >
                  Batal
                </button>
                <button
                  onClick={handleConfirm}
                  disabled={!printOptions.pulangan && !printOptions.shohifah}
                  className="flex-1 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                  </svg>
                  <span>Lanjutkan</span>
                </button>
              </div>
            </div>
          </motion.div>

        </>
      )}
    </AnimatePresence>
  )

  return createPortal(modalContent, document.body)
}

export default PrintMultipleModal
