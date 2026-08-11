import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import PrintIjinPulangan from '../print/PrintIjinPulangan'
import PrintShohifahSantri from '../print/PrintShofifahSantri'
import { getSantriQrCode } from '../../../utils/qrCodeCache'
import '../print/PrintShofifahSantri.css'
import '../print/PrintIjinPulangan.css'

// Komponen PrintShohifahSantri dengan cache QR
function PrintShohifahSantriWithCache({ santriId, inOffcanvas = false }) {
  // Pre-generate QR code untuk cache
  useEffect(() => {
    if (santriId) {
      getSantriQrCode(santriId, 'shohifah', 120)
    }
  }, [santriId])

  // Gunakan komponen PrintShohifahSantri yang sudah ada, dengan qrCodeOverride dari cache
  const qrCodeUrl = santriId ? getSantriQrCode(santriId, 'shohifah', 120) : null
  return <PrintShohifahSantri santriId={santriId} inOffcanvas={inOffcanvas} qrCodeOverride={qrCodeUrl} />
}

function PrintMultipleOffcanvas({ isOpen, onClose, selectedSantriList = [], printOptions = { pulangan: false, shohifah: false } }) {
  // Debug log
  useEffect(() => {
    if (isOpen) {
      console.log('PrintMultipleOffcanvas - isOpen:', isOpen)
      console.log('PrintMultipleOffcanvas - selectedSantriList:', selectedSantriList)
      console.log('PrintMultipleOffcanvas - printOptions:', printOptions)
    }
  }, [isOpen, selectedSantriList, printOptions])

  // Set @page CSS berdasarkan pilihan
  useEffect(() => {
    if (!isOpen) return

    // Hapus style tag lama jika ada
    const oldStyle = document.getElementById('dynamic-print-multiple-offcanvas-page')
    if (oldStyle) {
      oldStyle.remove()
    }

    // Buat style tag dinamis untuk @page
    const style = document.createElement('style')
    style.id = 'dynamic-print-multiple-offcanvas-page'
    
    if (printOptions.pulangan && printOptions.shohifah) {
      // Keduanya dicentang: gunakan named pages untuk orientasi konsisten
      // Portrait untuk pulangan, landscape untuk shohifah
      style.textContent = `
        @page portrait-page {
          size: A4 portrait;
          margin: 0;
          padding: 0;
        }
        @page landscape-page {
          size: A4 landscape;
          margin: 0;
          padding: 0;
        }
        @page {
          size: A4 portrait;
          margin: 0;
          padding: 0;
        }
      `
      document.body.classList.add('print-multiple-active')
      document.body.classList.add('print-ijin-pulangan-active')
      document.body.classList.add('print-shohifah-active')
    } else if (printOptions.pulangan) {
      // Hanya pulangan - semua portrait
      style.textContent = '@page { size: A4 portrait; margin: 0; padding: 0; }'
      document.body.classList.add('print-multiple-active')
      document.body.classList.add('print-ijin-pulangan-active')
      document.body.classList.remove('print-shohifah-active')
    } else if (printOptions.shohifah) {
      // Hanya shohifah - semua landscape
      style.textContent = '@page { size: A4 landscape; margin: 0; padding: 0; }'
      document.body.classList.add('print-multiple-active')
      document.body.classList.add('print-shohifah-active')
      document.body.classList.remove('print-ijin-pulangan-active')
    }
    
    document.head.appendChild(style)

    return () => {
      document.body.classList.remove('print-multiple-active')
      document.body.classList.remove('print-ijin-pulangan-active')
      document.body.classList.remove('print-shohifah-active')
      const style = document.getElementById('dynamic-print-multiple-offcanvas-page')
      if (style) {
        style.remove()
      }
    }
  }, [isOpen, printOptions])

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

  if (!isOpen) return null

  const offcanvasContent = (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
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

          {/* Offcanvas */}
          <motion.div
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
              <div>
                <h2 className="text-xl font-semibold text-teal-600 dark:text-teal-400">
                  Preview Print {selectedSantriList.length} Santri
                </h2>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {printOptions.pulangan && printOptions.shohifah && 'Pulangan + Shohifah'}
                  {printOptions.pulangan && !printOptions.shohifah && 'Pulangan'}
                  {!printOptions.pulangan && printOptions.shohifah && 'Shohifah'}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={handlePrint}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-purple-600 hover:bg-purple-700 text-white rounded transition-colors"
                  title="Print semua"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                  </svg>
                  Print
                </button>
                <button
                  onClick={onClose}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Content Container */}
            <div className="flex-1 overflow-auto" style={{ position: 'relative', minHeight: 0 }}>
              <div style={{ padding: '10px', minHeight: '100%' }}>
                {!selectedSantriList || selectedSantriList.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400">
                    <p>Tidak ada santri yang dipilih</p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    {selectedSantriList.map((santri, index) => (
                      <div key={santri.id || index} className="print-santri-item" style={{ width: '100%' }}>
                         {printOptions.pulangan && (
                           <div className="print-pulangan-item print-portrait-page" style={{ width: '100%' }}>
                             <PrintIjinPulangan santriId={santri.id} inOffcanvas={true} />
                             {printOptions.shohifah && <div className="page-break-between-docs"></div>}
                           </div>
                         )}
                         {printOptions.shohifah && (
                           <div className="print-shohifah-item print-landscape-page" style={{ width: '100%' }}>
                             <PrintShohifahSantriWithCache santriId={santri.id} inOffcanvas={true} />
                           </div>
                         )}
                        {index < selectedSantriList.length - 1 && <div className="page-break-between-santri"></div>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )

  return createPortal(offcanvasContent, document.body)
}

export default PrintMultipleOffcanvas
