import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'

/**
 * Offcanvas kanan tetapkan mualim — z-index di atas offcanvas santri LTTQ (201).
 */
export default function OffcanvasTetapkanMualimLttq({
  isOpen,
  onClose,
  tingkatanLabel,
  mualimTipe,
  setMualimTipe,
  mualimPengurusId,
  mualimPengurusNama,
  onOpenSearchPengurus,
  onOpenSearchSantri,
  onSavePengurus
}) {
  const content = (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            key="mualim-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/50 z-[212]"
            aria-hidden="true"
          />
          <motion.div
            key="mualim-panel"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'tween', duration: 0.2 }}
            className="fixed right-0 top-0 bottom-0 z-[213] flex h-full w-full max-w-md flex-col overflow-hidden bg-white shadow-xl dark:bg-gray-800"
            role="dialog"
            aria-modal="true"
            aria-labelledby="lttq-mualim-offcanvas-title"
          >
            <motion.div className="flex-shrink-0 border-b border-gray-200 p-4 dark:border-gray-700">
              <motion.div className="flex items-start justify-between gap-3">
                <motion.div className="min-w-0 flex-1">
                  <h3
                    id="lttq-mualim-offcanvas-title"
                    className="text-lg font-semibold text-gray-800 dark:text-gray-200"
                  >
                    Tetapkan Mualim
                  </h3>
                  {tingkatanLabel ? (
                    <p className="mt-1 truncate text-xs text-gray-500 dark:text-gray-400">{tingkatanLabel}</p>
                  ) : null}
                </motion.div>
                <button
                  type="button"
                  onClick={onClose}
                  className="shrink-0 rounded-lg p-2 text-gray-600 hover:bg-gray-200 dark:text-gray-400 dark:hover:bg-gray-700"
                  aria-label="Tutup"
                >
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </motion.div>
            </motion.div>

            <motion.div className="flex-1 overflow-y-auto p-4 space-y-4">
              <motion.div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setMualimTipe('pengurus')}
                  className={`flex-1 rounded-lg border py-2 text-sm dark:border-gray-600 ${
                    mualimTipe === 'pengurus'
                      ? 'border-teal-500 bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-200'
                      : 'text-gray-700 dark:text-gray-300'
                  }`}
                >
                  Pengurus
                </button>
                <button
                  type="button"
                  onClick={() => setMualimTipe('santri')}
                  className={`flex-1 rounded-lg border py-2 text-sm dark:border-gray-600 ${
                    mualimTipe === 'santri'
                      ? 'border-teal-500 bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-200'
                      : 'text-gray-700 dark:text-gray-300'
                  }`}
                >
                  Santri
                </button>
              </motion.div>

              {mualimTipe === 'pengurus' ? (
                <motion.div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Pengurus</label>
                  <button
                    type="button"
                    onClick={onOpenSearchPengurus}
                    className="w-full rounded-lg border border-gray-300 py-2.5 text-sm text-left hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-700/50"
                  >
                    {mualimPengurusNama ? mualimPengurusNama : 'Cari pengurus...'}
                  </button>
                  {mualimPengurusNama ? (
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Ketuk lagi untuk ganti pengurus</p>
                  ) : null}
                </motion.div>
              ) : (
                <motion.div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Santri sebagai mualim
                  </label>
                  <button
                    type="button"
                    onClick={onOpenSearchSantri}
                    className="w-full rounded-lg border border-gray-300 py-2.5 text-sm hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-700/50"
                  >
                    Cari santri...
                  </button>
                </motion.div>
              )}
            </motion.div>

            <motion.div className="flex flex-shrink-0 gap-2 border-t border-gray-200 p-4 dark:border-gray-700">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={mualimTipe === 'pengurus' && !mualimPengurusId}
                onClick={onSavePengurus}
                className="flex-1 rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Simpan
              </button>
            </motion.div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )

  return createPortal(content, document.body)
}
