import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { createPortal } from 'react-dom'
import { useNotification } from '../../../../contexts/NotificationContext'
import { useAuthStore } from '../../../../store/authStore'
import PrintPengeluaran from '../print/PrintPengeluaran'
import '../../../Pembayaran/components/PrintOffcanvas.css'

function PrintPengeluaranOffcanvas({ isOpen, onClose, pengeluaranId }) {
  const [printUrl, setPrintUrl] = useState('')
  const { showNotification } = useNotification()
  const { user } = useAuthStore()

  // Set URL untuk print
  useEffect(() => {
    if (isOpen && pengeluaranId) {
      const baseUrl = window.location.origin
      let url = `${baseUrl}/print-pengeluaran?id=${pengeluaranId}`
      url += `&_t=${Date.now()}`
      setPrintUrl(url)
    }
  }, [isOpen, pengeluaranId, user])

  // Tambahkan class ke body ketika offcanvas terbuka untuk deteksi print
  useEffect(() => {
    if (isOpen) {
      document.body.classList.add('print-offcanvas-open')
    } else {
      document.body.classList.remove('print-offcanvas-open')
    }
    
    return () => {
      document.body.classList.remove('print-offcanvas-open')
    }
  }, [isOpen])

  const handleCopyUrl = () => {
    if (printUrl) {
      navigator.clipboard.writeText(printUrl)
        .then(() => {
          showNotification('Link berhasil disalin', 'success')
        })
        .catch(() => {
          showNotification('Gagal menyalin link', 'error')
        })
    }
  }

  const offcanvasContent = (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/50 z-[100002]"
            onClick={onClose}
          />

          {/* Offcanvas */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'tween', ease: [0.25, 0.1, 0.25, 1], duration: 0.35 }}
            className="print-offcanvas-wrapper fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 rounded-t-2xl shadow-[0_-10px_25px_-5px_rgba(0,0,0,0.1)] z-[100003] overflow-hidden flex flex-col"
            style={{ maxHeight: '90vh' }}
          >
            {/* Header */}
            <div className="no-print flex justify-between items-center p-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
              <h2 className="text-xl font-semibold text-teal-600 dark:text-teal-400">Print Laporan Pengeluaran</h2>
              <button
                onClick={onClose}
                className="text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                </svg>
              </button>
            </div>

            {/* URL Input Section */}
            <div className="no-print p-3 border-b border-gray-200 dark:border-gray-700 flex-shrink-0 bg-gray-50 dark:bg-gray-900/20">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={printUrl || ''}
                  readOnly
                  className="flex-1 px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-xs focus:outline-none focus:ring-2 focus:ring-teal-500"
                  placeholder="Link akan muncul di sini..."
                />
                <button
                  onClick={handleCopyUrl}
                  className="px-3 py-1.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors font-medium text-xs whitespace-nowrap"
                  title="Salin link"
                >
                  <svg className="w-4 h-4 inline-block mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  Salin
                </button>
                <button
                  onClick={() => window.print()}
                  className="px-3 py-1.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-medium text-xs whitespace-nowrap"
                  title="Print"
                >
                  <span className="flex items-center">
                    <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"></path>
                    </svg>
                    <span className="text-xs">Print</span>
                  </span>
                </button>
              </div>
            </div>

            {/* PrintPengeluaran Component Container */}
            <div className="flex-1 overflow-auto" style={{ position: 'relative' }}>
              {pengeluaranId ? (
                <div style={{ height: '100%', overflow: 'auto', position: 'relative' }}>
                  <PrintPengeluaran pengeluaranId={pengeluaranId} inOffcanvas={true} />
                </div>
              ) : (
                <div className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400">
                  <p>ID Pengeluaran tidak ditemukan</p>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )

  return createPortal(offcanvasContent, document.body)
}

export default PrintPengeluaranOffcanvas
