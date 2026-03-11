import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import PrintDataTable from './PrintDataTable'
import './PrintDataTable.css'

function PrintDataOffcanvas({ isOpen, onClose, data = [], selectedColumns = [], filters = {} }) {
  const [fontSize, setFontSize] = useState(9) // Default 9px
  // Set @page CSS untuk landscape
  useEffect(() => {
    if (!isOpen) return

    // Hapus style tag lama jika ada
    const oldStyle = document.getElementById('dynamic-print-data-offcanvas-page')
    if (oldStyle) {
      oldStyle.remove()
    }

    // Buat style tag dinamis untuk @page landscape
    const style = document.createElement('style')
    style.id = 'dynamic-print-data-offcanvas-page'
    style.textContent = '@page { size: A4 landscape; margin: 10mm; }'
    
    document.head.appendChild(style)
    document.body.classList.add('print-data-active')

    return () => {
      document.body.classList.remove('print-data-active')
      const style = document.getElementById('dynamic-print-data-offcanvas-page')
      if (style) {
        style.remove()
      }
    }
  }, [isOpen])

  const handlePrint = () => {
    document.body.classList.add('print-offcanvas-open')
    
    // Wait for DOM update
    setTimeout(() => {
      window.print()
      // Reset after print
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
          key="print-data-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onClose}
          className="no-print fixed inset-0 bg-black bg-opacity-50"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 99998
          }}
        />
      )}
      {isOpen && (
        <motion.div
          key="print-data-panel"
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={offcanvasTransition}
          className="print-offcanvas-wrapper fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 rounded-t-2xl shadow-[0_-10px_25px_-5px_rgba(0,0,0,0.1)] overflow-hidden flex flex-col"
          style={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            maxHeight: '90vh',
            zIndex: 99999
          }}
        >
            {/* Header */}
            <div className="no-print flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 p-3 sm:p-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
              <div className="flex-1 min-w-0">
                <h2 className="text-lg sm:text-xl font-semibold text-teal-600 dark:text-teal-400 truncate">
                  Preview Print Data Ijin
                </h2>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {data.length} data | {selectedColumns.length} kolom terpilih
                </p>
              </div>
              <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                {/* Font Size Control */}
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <label className="text-xs text-gray-600 dark:text-gray-400 whitespace-nowrap hidden sm:inline">
                    Ukuran Font:
                  </label>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setFontSize(prev => Math.max(6, prev - 1))}
                      className="w-7 h-7 flex items-center justify-center text-xs bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded transition-colors"
                      title="Kurangi ukuran font"
                    >
                      −
                    </button>
                    <input
                      type="number"
                      min="6"
                      max="18"
                      value={fontSize}
                      onChange={(e) => {
                        const value = parseInt(e.target.value) || 9
                        setFontSize(Math.max(6, Math.min(18, value)))
                      }}
                      className="w-10 sm:w-12 h-7 text-center text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-teal-500 dark:focus:ring-teal-400"
                    />
                    <span className="text-xs text-gray-500 dark:text-gray-400">px</span>
                    <button
                      onClick={() => setFontSize(prev => Math.min(18, prev + 1))}
                      className="w-7 h-7 flex items-center justify-center text-xs bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded transition-colors"
                      title="Tambah ukuran font"
                    >
                      +
                    </button>
                  </div>
                </div>
                <button
                  onClick={handlePrint}
                  className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs bg-purple-600 hover:bg-purple-700 text-white rounded transition-colors whitespace-nowrap"
                  title="Print data"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                  </svg>
                  <span className="hidden sm:inline">Print</span>
                </button>
                <button
                  onClick={onClose}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors flex-shrink-0"
                >
                  <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Content Container */}
            <div className="flex-1 overflow-auto" style={{ position: 'relative', minHeight: 0 }}>
              <div style={{ padding: '10px', minHeight: '100%' }}>
                {!data || data.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400">
                    <p>Tidak ada data untuk di-print</p>
                  </div>
                ) : selectedColumns.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400">
                    <p>Tidak ada kolom yang dipilih</p>
                  </div>
                ) : (
                  <div style={{ width: '100%' }}>
                    <PrintDataTable
                      data={data}
                      selectedColumns={selectedColumns}
                      filters={filters}
                      fontSize={fontSize}
                    />
                  </div>
                )}
              </div>
            </div>
          </motion.div>
      )}
    </AnimatePresence>
  )

  return createPortal(offcanvasContent, document.body)
}

export default PrintDataOffcanvas
