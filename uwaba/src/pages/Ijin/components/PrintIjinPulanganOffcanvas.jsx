import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { createPortal } from 'react-dom'
import { useNotification } from '../../../contexts/NotificationContext'
import { useTahunAjaranStore } from '../../../store/tahunAjaranStore'
import PrintIjinPulangan from '../print/PrintIjinPulangan'
import PrintShohifahSantri from '../print/PrintShofifahSantri'
// Import PrintShohifahSantri.css dulu (landscape), lalu PrintIjinPulangan.css (portrait) akan override
import '../print/PrintShofifahSantri.css'
import '../print/PrintIjinPulangan.css'
import '../../Pembayaran/components/PrintOffcanvas.css'

function PrintIjinPulanganOffcanvas({ isOpen, onClose, santriId }) {
  const { showNotification } = useNotification()
  const { tahunAjaran } = useTahunAjaranStore()
  const [printUrl, setPrintUrl] = useState('')
  const [activeTab, setActiveTab] = useState('pulangan') // 'pulangan', 'shohifah', atau 'semua'
  const [showPortal, setShowPortal] = useState(false)

  useEffect(() => {
    if (isOpen) setShowPortal(true)
  }, [isOpen])

  // Set URL untuk print
  useEffect(() => {
    if (isOpen && santriId && /^\d{7}$/.test(santriId)) {
      const baseUrl = window.location.origin
      let url = `${baseUrl}/print-ijin-pulangan?id_santri=${santriId}`
      if (tahunAjaran) {
        url += `&tahun_ajaran=${encodeURIComponent(tahunAjaran)}`
      }
      url += `&_t=${Date.now()}`
      setPrintUrl(url)
    }
  }, [isOpen, santriId, tahunAjaran])

  // Tambahkan class ke body dan style untuk @page ketika offcanvas terbuka
  useEffect(() => {
    // Hapus style tag lama jika ada
    const oldStyle = document.getElementById('dynamic-page-orientation')
    if (oldStyle) {
      oldStyle.remove()
    }

    if (isOpen) {
      document.body.classList.add('print-offcanvas-open')
      
      // Buat style tag dinamis untuk @page berdasarkan tab aktif atau print all
      const style = document.createElement('style')
      style.id = 'dynamic-page-orientation'
      
      if (activeTab === 'semua') {
        // Untuk tab semua: portrait untuk halaman pertama (pulangan), landscape untuk halaman kedua (shohifah)
        style.textContent = `
          @page:first {
            size: A4 portrait;
            margin: 0;
            padding: 0;
          }
          @page {
            size: A4 landscape;
            margin: 0;
          }
        `
        document.body.classList.add('print-ijin-pulangan-active')
        document.body.classList.add('print-shohifah-active')
        document.body.classList.add('print-all-active')
      } else if (activeTab === 'pulangan') {
        // Portrait untuk Ijin Pulangan
        style.textContent = '@page { size: A4 portrait; margin: 0; padding: 0; }'
        document.body.classList.add('print-ijin-pulangan-active')
        document.body.classList.remove('print-shohifah-active')
        document.body.classList.remove('print-all-active')
      } else if (activeTab === 'shohifah') {
        // Landscape untuk Shohifah Santri
        style.textContent = '@page { size: A4 landscape; margin: 0; }'
        document.body.classList.add('print-shohifah-active')
        document.body.classList.remove('print-ijin-pulangan-active')
        document.body.classList.remove('print-all-active')
      }
      
      document.head.appendChild(style)
    } else {
      document.body.classList.remove('print-offcanvas-open')
      document.body.classList.remove('print-ijin-pulangan-active')
      document.body.classList.remove('print-shohifah-active')
      document.body.classList.remove('print-all-active')
    }
    
    return () => {
      document.body.classList.remove('print-offcanvas-open')
      document.body.classList.remove('print-ijin-pulangan-active')
      document.body.classList.remove('print-shohifah-active')
      document.body.classList.remove('print-all-active')
      const style = document.getElementById('dynamic-page-orientation')
      if (style) {
        style.remove()
      }
    }
  }, [isOpen, activeTab])

  const handleCopyUrl = () => {
    if (printUrl) {
      navigator.clipboard.writeText(printUrl).then(() => {
        showNotification('Link berhasil disalin!', 'success')
      }).catch(err => {
        console.error('Failed to copy URL:', err)
        showNotification('Gagal menyalin link', 'error')
      })
    }
  }

  const offcanvasContent = (
    <AnimatePresence onExitComplete={() => setShowPortal(false)}>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            key="ijin-pulangan-backdrop"
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

          {/* Offcanvas - tertutup ke bawah saat X atau klik luar */}
          <motion.div
            key="ijin-pulangan-panel"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'tween', ease: [0.25, 0.1, 0.25, 1], duration: 0.35 }}
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
            <div className="no-print flex justify-between items-center p-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
              <h2 className="text-xl font-semibold text-teal-600 dark:text-teal-400">Print Surat Ijin</h2>
              <button
                onClick={onClose}
                className="text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                </svg>
              </button>
            </div>

            {/* Tabs */}
            <div className="no-print flex border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
              <button
                onClick={() => setActiveTab('pulangan')}
                className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                  activeTab === 'pulangan'
                    ? 'text-teal-600 dark:text-teal-400 border-b-2 border-teal-600 dark:border-teal-400'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                Pulangan
              </button>
              <button
                onClick={() => setActiveTab('shohifah')}
                className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                  activeTab === 'shohifah'
                    ? 'text-teal-600 dark:text-teal-400 border-b-2 border-teal-600 dark:border-teal-400'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                Shohifah
              </button>
              <button
                onClick={() => setActiveTab('semua')}
                className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                  activeTab === 'semua'
                    ? 'text-teal-600 dark:text-teal-400 border-b-2 border-teal-600 dark:border-teal-400'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                Semua
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

            {/* Content Container */}
            <div className="flex-1 overflow-auto" style={{ position: 'relative' }}>
              {santriId ? (
                <div style={{ height: '100%', overflow: 'auto', position: 'relative' }}>
                  {activeTab === 'semua' ? (
                    <>
                      {/* Tab Semua: Show both contents */}
                      <div className="print-all-content">
                        <div className="print-all-pulangan">
                          <PrintIjinPulangan santriId={santriId} inOffcanvas={true} />
                        </div>
                        <div className="print-all-shohifah">
                          <PrintShohifahSantri santriId={santriId} inOffcanvas={true} />
                        </div>
                      </div>
                    </>
                  ) : activeTab === 'pulangan' ? (
                    <>
                      <div className="print-ijin-pulangan-active" style={{ display: 'none' }}></div>
                      <PrintIjinPulangan santriId={santriId} inOffcanvas={true} />
                    </>
                  ) : (
                    <PrintShohifahSantri santriId={santriId} inOffcanvas={true} />
                  )}
                </div>
              ) : (
                <div className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400">
                  <p>NIS tidak ditemukan</p>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )

  if (!showPortal) return null
  return createPortal(offcanvasContent, document.body)
}

export default PrintIjinPulanganOffcanvas
