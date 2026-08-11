import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { PrinterIcon } from '@heroicons/react/24/outline'
import LaporanPrintPreview from './LaporanPrintPreview'
import './LaporanPrint.css'
import './PrintOffcanvas.css'

function LaporanPrintOffcanvas({ isOpen, onClose, jenisLabel, printInfo, totals, filteredData }) {
  const [fontSize, setFontSize] = useState(9)

  useEffect(() => {
    if (!isOpen) return

    const old = document.getElementById('dynamic-print-laporan-page')
    if (old) old.remove()

    const style = document.createElement('style')
    style.id = 'dynamic-print-laporan-page'
    style.textContent = '@page { size: A4; margin: 10mm; }'
    document.head.appendChild(style)

    return () => {
      const s = document.getElementById('dynamic-print-laporan-page')
      if (s) s.remove()
    }
  }, [isOpen])

  const handlePrint = () => {
    document.body.classList.add('print-offcanvas-open')
    setTimeout(() => {
      window.print()
      setTimeout(() => {
        document.body.classList.remove('print-offcanvas-open')
      }, 1000)
    }, 200)
  }

  const offcanvasTransition = { type: 'tween', duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }

  const offcanvasContent = (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="laporan-print-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onClose}
          className="no-print fixed inset-0 bg-black/50 z-[99998]"
          aria-hidden
        />
      )}
      {isOpen && (
        <motion.div
          key="laporan-print-panel"
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={offcanvasTransition}
          className="print-offcanvas-wrapper fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 rounded-t-2xl shadow-[0_-10px_25px_-5px_rgba(0,0,0,0.15)] overflow-hidden flex flex-col z-[99999]"
          style={{ maxHeight: '90vh' }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="laporan-print-title"
        >
          <div className="no-print flex flex-col gap-3 p-3 sm:p-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
              <div className="min-w-0 flex-1">
                <h2
                  id="laporan-print-title"
                  className="text-lg sm:text-xl font-semibold text-teal-600 dark:text-teal-400 truncate"
                >
                  Preview cetak laporan
                </h2>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {filteredData?.length ?? 0} baris · area putih di bawah = tampilan cetak
                </p>
              </div>
              <div className="flex items-center gap-2 sm:gap-3 flex-wrap justify-end">
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <label
                    htmlFor="laporan-print-font-size"
                    className="text-xs text-gray-600 dark:text-gray-400 whitespace-nowrap hidden sm:inline"
                  >
                    Ukuran font:
                  </label>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setFontSize((prev) => Math.max(6, prev - 1))}
                      className="w-7 h-7 flex items-center justify-center text-xs bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded transition-colors"
                      title="Kurangi ukuran font"
                    >
                      −
                    </button>
                    <input
                      id="laporan-print-font-size"
                      type="number"
                      min={6}
                      max={18}
                      value={fontSize}
                      onChange={(e) => {
                        const value = parseInt(e.target.value, 10) || 9
                        setFontSize(Math.max(6, Math.min(18, value)))
                      }}
                      className="w-10 sm:w-12 h-7 text-center text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-teal-500 dark:focus:ring-teal-400"
                    />
                    <span className="text-xs text-gray-500 dark:text-gray-400">px</span>
                    <button
                      type="button"
                      onClick={() => setFontSize((prev) => Math.min(18, prev + 1))}
                      className="w-7 h-7 flex items-center justify-center text-xs bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded transition-colors"
                      title="Tambah ukuran font"
                    >
                      +
                    </button>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handlePrint}
                  className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium bg-teal-600 dark:bg-teal-500 hover:bg-teal-700 dark:hover:bg-teal-600 text-white rounded-lg transition-colors"
                >
                  <PrinterIcon className="w-5 h-5" />
                  Print
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="p-2 rounded-lg text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
                  aria-label="Tutup"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-auto min-h-0 bg-gray-100 dark:bg-gray-900/40">
            <div className="p-3 sm:p-4 max-w-5xl mx-auto">
              <LaporanPrintPreview
                jenisLabel={jenisLabel}
                printInfo={printInfo}
                totals={totals}
                filteredData={filteredData || []}
                fontSize={fontSize}
              />
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )

  return createPortal(offcanvasContent, document.body)
}

export default LaporanPrintOffcanvas
