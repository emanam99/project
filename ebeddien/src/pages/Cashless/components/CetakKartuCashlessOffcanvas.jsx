import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { createPortal } from 'react-dom'
import { QRCodeSVG } from 'qrcode.react'
import { cashlessAPI } from '../../../services/api'
import './CetakKartuCashlessOffcanvas.css'

const CARD_WIDTH_MM = 85.6
const CARD_HEIGHT_MM = 53.98

function CetakKartuCashlessOffcanvas({ isOpen, onClose, accountId }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [showPortal, setShowPortal] = useState(false)

  useEffect(() => {
    if (isOpen) setShowPortal(true)
  }, [isOpen])

  useEffect(() => {
    if (!isOpen || !accountId) {
      setData(null)
      setError(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    cashlessAPI.getAccountCard(accountId).then((res) => {
      if (cancelled) return
      if (res?.success && res.data) setData(res.data)
      else setError(res?.message || 'Gagal memuat data kartu')
    }).catch((err) => {
      if (!cancelled) setError(err.response?.data?.message || 'Gagal memuat data')
    }).finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => { cancelled = true }
  }, [isOpen, accountId])

  useEffect(() => {
    if (isOpen) document.body.classList.add('print-offcanvas-open')
    else document.body.classList.remove('print-offcanvas-open')
    return () => document.body.classList.remove('print-offcanvas-open')
  }, [isOpen])

  const handlePrint = () => window.print()

  const qrValue = data?.card_uid ? `${data.code}|${data.card_uid}` : (data?.code || '')

  const offcanvasContent = (
    <AnimatePresence onExitComplete={() => setShowPortal(false)}>
      {isOpen && (
        <>
          <motion.div
            key="cashless-print-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="no-print fixed inset-0 bg-black/50 z-40"
          />
          <motion.div
            key="cashless-print-panel"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'tween', ease: [0.25, 0.1, 0.25, 1], duration: 0.35 }}
            className="print-offcanvas-wrapper fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 rounded-t-2xl shadow-[0_-10px_25px_-5px_rgba(0,0,0,0.1)] z-50 overflow-hidden flex flex-col"
            style={{ maxHeight: '90vh' }}
          >
            <div className="no-print flex justify-between items-center p-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
              <h2 className="text-xl font-semibold text-teal-600 dark:text-teal-400">Cetak Kartu Cashless</h2>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handlePrint}
                  disabled={loading || !!error || !data}
                  className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                  </svg>
                  Print
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="p-2 text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                  aria-label="Tutup"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-auto p-4 flex flex-col items-center min-h-0 print-card-cashless-container">
              {loading && (
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                  <div className="w-10 h-10 border-2 border-teal-500/30 border-t-teal-500 rounded-full animate-spin" />
                  <p className="text-sm text-gray-500 dark:text-gray-400">Memuat data kartu...</p>
                </div>
              )}
              {error && !loading && (
                <div className="flex flex-col items-center justify-center py-16 gap-2">
                  <span className="flex items-center justify-center w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </span>
                  <p className="text-sm text-red-600 dark:text-red-400 text-center px-4">{error}</p>
                </div>
              )}
              {data && !loading && (
                <div
                  className="print-card-cashless bg-white rounded-lg shadow-lg border border-gray-300 overflow-hidden flex-shrink-0"
                  style={{ width: `${CARD_WIDTH_MM}mm`, height: `${CARD_HEIGHT_MM}mm`, minHeight: `${CARD_HEIGHT_MM}mm` }}
                >
                  <div className="h-full p-3 flex flex-col justify-between text-gray-900">
                    <div className="flex justify-between items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] text-gray-500 uppercase tracking-wider">No. Akun Cashless</p>
                        <p className="font-mono text-sm font-bold break-all leading-tight mt-0.5">{data.code}</p>
                        {data.entity_label && (
                          <p className="text-xs mt-1 truncate" title={data.entity_label}>{data.entity_label}</p>
                        )}
                      </div>
                      <div className="flex-shrink-0 w-14 h-14">
                        <QRCodeSVG value={qrValue} size={56} level="M" includeMargin={false} />
                      </div>
                    </div>
                    {data.card_uid && (
                      <div className="mt-2 pt-2 border-t border-gray-200">
                        <p className="text-[9px] text-gray-500 uppercase">UID Kartu</p>
                        <p className="font-mono text-[10px] break-all">{data.card_uid}</p>
                      </div>
                    )}
                  </div>
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

export default CetakKartuCashlessOffcanvas
