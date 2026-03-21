import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { createPortal } from 'react-dom'
import { useNotification } from '../../../contexts/NotificationContext'
import { useTahunAjaranStore } from '../../../store/tahunAjaranStore'
import PrintIjin from '../print/PrintIjin'
import { DEFAULT_PRINT_IJIN_MARGIN_MM, mergePageMarginMm } from '../print/printIjinMargin'
import '../print/PrintIjin.css'
import '../../Pembayaran/components/PrintOffcanvas.css'

function PrintIjinOffcanvas({ isOpen, onClose, santriId, ijinId }) {
  const { showNotification } = useNotification()
  const { tahunAjaran } = useTahunAjaranStore()
  const [printUrl, setPrintUrl] = useState('')
  /** Margin isi dari tepi lembar (mm) — sama pola dengan Print Absen (ribbon + opsi) */
  const [pageMarginMm, setPageMarginMm] = useState(() => ({ ...DEFAULT_PRINT_IJIN_MARGIN_MM }))
  const [ribbonExpanded, setRibbonExpanded] = useState(true)

  // Set URL untuk print
  useEffect(() => {
    if (isOpen && santriId && /^\d{7}$/.test(santriId)) {
      const baseUrl = window.location.origin
      let url = `${baseUrl}/print-ijin?id_santri=${santriId}`
      if (ijinId) {
        url += `&ijin_id=${ijinId}`
      }
      if (tahunAjaran) {
        url += `&tahun_ajaran=${encodeURIComponent(tahunAjaran)}`
      }
      url += `&_t=${Date.now()}`
      setPrintUrl(url)
    }
  }, [isOpen, santriId, ijinId, tahunAjaran])

  useEffect(() => {
    if (!isOpen) return
    setPageMarginMm({ ...DEFAULT_PRINT_IJIN_MARGIN_MM })
    setRibbonExpanded(true)
  }, [isOpen])

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

  const handlePrint = () => {
    setTimeout(() => window.print(), 200)
  }

  const marginSafe = mergePageMarginMm(pageMarginMm)

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
                  type="button"
                  onClick={handlePrint}
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

            {/* Ribbon bergaya Office: margin halaman seperti print absen / rombel */}
            <div className="no-print flex-shrink-0 border-b border-gray-300 dark:border-gray-600 bg-[#ececec] dark:bg-[#252526]">
              {ribbonExpanded ? (
                <>
                  <div className="flex items-stretch min-h-[34px]">
                    <div className="flex flex-1 items-end gap-0 px-1 pt-1 overflow-x-auto">
                      <button
                        type="button"
                        role="tab"
                        aria-selected
                        className="shrink-0 px-3 py-1.5 text-xs sm:text-sm font-medium rounded-t-md border border-b-0 transition-colors bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600 border-b-white dark:border-b-gray-800 relative z-[1] mb-[-1px] shadow-[0_-1px_0_0_rgba(255,255,255,1)] dark:shadow-[0_-1px_0_0_rgb(31,41,55)]"
                      >
                        Margin halaman
                      </button>
                    </div>
                    <div className="flex items-center border-l border-gray-300/80 dark:border-gray-600 pl-1 pr-1 shrink-0 bg-[#e4e4e4] dark:bg-[#2d2d30]">
                      <button
                        type="button"
                        onClick={() => setRibbonExpanded(false)}
                        className="flex items-center gap-1 px-2 py-1.5 rounded text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-300/60 dark:hover:bg-gray-600/50"
                        title="Sembunyikan opsi"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                        </svg>
                        <span className="hidden sm:inline max-w-[7rem] truncate">Sembunyikan</span>
                      </button>
                    </div>
                  </div>
                  <div className="bg-white dark:bg-gray-800 border-t border-gray-300 dark:border-gray-600 px-2 sm:px-3 py-2 min-h-[88px] overflow-x-auto">
                    <div className="flex flex-wrap gap-x-4 gap-y-2 items-end">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                          Atas (mm)
                        </span>
                        <input
                          type="number"
                          min={0}
                          max={40}
                          step={0.5}
                          value={pageMarginMm.top}
                          onChange={(e) =>
                            setPageMarginMm((p) => ({ ...p, top: parseFloat(e.target.value) || 0 }))
                          }
                          className="w-14 sm:w-16 h-8 text-center text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-teal-500"
                        />
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                          Bawah (mm)
                        </span>
                        <input
                          type="number"
                          min={0}
                          max={40}
                          step={0.5}
                          value={pageMarginMm.bottom}
                          onChange={(e) =>
                            setPageMarginMm((p) => ({ ...p, bottom: parseFloat(e.target.value) || 0 }))
                          }
                          className="w-14 sm:w-16 h-8 text-center text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-teal-500"
                        />
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                          Kiri (mm)
                        </span>
                        <input
                          type="number"
                          min={0}
                          max={40}
                          step={0.5}
                          value={pageMarginMm.left}
                          onChange={(e) =>
                            setPageMarginMm((p) => ({ ...p, left: parseFloat(e.target.value) || 0 }))
                          }
                          className="w-14 sm:w-16 h-8 text-center text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-teal-500"
                        />
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                          Kanan (mm)
                        </span>
                        <input
                          type="number"
                          min={0}
                          max={40}
                          step={0.5}
                          value={pageMarginMm.right}
                          onChange={(e) =>
                            setPageMarginMm((p) => ({ ...p, right: parseFloat(e.target.value) || 0 }))
                          }
                          className="w-14 sm:w-16 h-8 text-center text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-teal-500"
                        />
                      </div>
                      <div className="flex flex-col gap-0.5 pb-0.5 sm:ml-2">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-transparent select-none">
                          ·
                        </span>
                        <button
                          type="button"
                          onClick={() => setPageMarginMm({ ...DEFAULT_PRINT_IJIN_MARGIN_MM })}
                          className="px-2.5 py-1.5 text-xs rounded border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/80 text-gray-800 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600 whitespace-nowrap"
                        >
                          Standar (10 / 8)
                        </button>
                      </div>
                    </div>
                    <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-2 leading-snug">
                      Berlaku per salinan (kiri &amp; kanan): jarak isi dari tepi salinan itu — Kiri/Kanan mengikuti
                      tepi kertas vs garis tengah. Ringkasan: atas {marginSafe.top} · bawah {marginSafe.bottom} ·
                      kiri {marginSafe.left} · kanan {marginSafe.right} mm.
                    </p>
                  </div>
                </>
              ) : (
                <div className="flex items-center justify-between gap-2 px-2 py-1.5">
                  <p className="text-xs text-gray-600 dark:text-gray-400 truncate">
                    Margin: {marginSafe.top}/{marginSafe.bottom}/{marginSafe.left}/{marginSafe.right} mm
                  </p>
                  <button
                    type="button"
                    onClick={() => setRibbonExpanded(true)}
                    className="shrink-0 text-xs font-medium text-teal-700 dark:text-teal-400 hover:underline"
                  >
                    Pengaturan halaman
                  </button>
                </div>
              )}
            </div>

            {/* PrintIjin Component Container */}
            <div className="flex-1 overflow-auto" style={{ position: 'relative' }}>
              {santriId ? (
                <div style={{ height: '100%', overflow: 'auto', position: 'relative' }}>
                  <PrintIjin
                    santriId={santriId}
                    ijinId={ijinId}
                    inOffcanvas={true}
                    pageMarginMm={pageMarginMm}
                  />
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

  return createPortal(offcanvasContent, document.body)
}

export default PrintIjinOffcanvas
