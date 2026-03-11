import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { createPortal } from 'react-dom'
import { getSlimApiUrl } from '../../services/api'
import { useTahunAjaranStore } from '../../store/tahunAjaranStore'
import './PublicSantri.css'

function PaymentHistoryOffcanvas({ isOpen, onClose, idSantri, mode = 'uwaba' }) {
  const { tahunAjaran } = useTahunAjaranStore()
  const [paymentHistory, setPaymentHistory] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // Fetch payment history
  const fetchPaymentHistory = async () => {
    if (!idSantri) return

    setLoading(true)
    setError(null)
    try {
      const apiBaseUrl = getSlimApiUrl()
      const tahunAjaranParam = tahunAjaran || localStorage.getItem('tahun_ajaran') || new Date().getFullYear().toString()
      const url = `${apiBaseUrl}/public/pembayaran/${mode}/history?id_santri=${idSantri}&tahun_ajaran=${encodeURIComponent(tahunAjaranParam)}`
      
      const response = await fetch(url)
      const data = await response.json()
      
      if (data.success) {
        setPaymentHistory(data.data || [])
      } else {
        setPaymentHistory([])
        setError(data.message || 'Gagal mengambil riwayat pembayaran')
      }
    } catch (err) {
      console.error('Error fetching payment history:', err)
      setPaymentHistory([])
      setError(err.message || 'Gagal mengambil riwayat pembayaran')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (isOpen && idSantri) {
      fetchPaymentHistory()
    }
  }, [isOpen, idSantri, mode, tahunAjaran])

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0
    }).format(value || 0)
  }

  const formatDate = (dateString) => {
    if (!dateString) return '-'
    try {
      const date = new Date(dateString)
      return date.toLocaleDateString('id-ID', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      })
    } catch (e) {
      return dateString
    }
  }

  const getViaColor = (via) => {
    const colors = {
      'Cash': '#10b981',
      'Transfer': '#3b82f6',
      'QRIS': '#8b5cf6',
      'E-Wallet': '#f59e0b'
    }
    return colors[via] || '#6b7280'
  }

  const offcanvasTransition = { type: 'tween', duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="payment-history-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onClose}
          className="fixed inset-0 bg-black/50 z-[200]"
        />
      )}
      {isOpen && (
        <motion.div
          key="payment-history-panel"
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={offcanvasTransition}
          className="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 rounded-t-3xl shadow-2xl z-[201] max-h-[85vh] flex flex-col"
            style={{
              paddingBottom: 'env(safe-area-inset-bottom, 0)'
            }}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-bold text-gray-800 dark:text-gray-200">
                Riwayat Pembayaran
              </h2>
              <button
                onClick={onClose}
                className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                aria-label="Tutup"
              >
                <svg className="w-5 h-5 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4">
              {loading ? (
                <div className="flex flex-col items-center justify-center py-8">
                  <div className="w-8 h-8 border-4 border-teal-500 border-t-transparent rounded-full animate-spin mb-2"></div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Memuat riwayat pembayaran...</p>
                </div>
              ) : error ? (
                <div className="text-center py-8">
                  <p className="text-red-600 dark:text-red-400">{error}</p>
                </div>
              ) : paymentHistory.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-gray-500 dark:text-gray-400">Tidak ada riwayat pembayaran</p>
                </div>
              ) : (
                <div className="biodata-card">
                  <div className="biodata-card-content">
                    {/* Header Kolom */}
                    <div className="flex items-center gap-3 sm:gap-4 py-2 border-b-2 border-gray-300 dark:border-gray-600 mb-2">
                      <div className="flex-1 min-w-0">
                        <span className="field-label text-xs sm:text-sm">Via & Nominal</span>
                      </div>
                      <div className="flex-shrink-0 text-right">
                        <span className="field-label text-xs sm:text-sm">Tanggal</span>
                      </div>
                    </div>
                    
                    {/* List Pembayaran */}
                    {paymentHistory.map((payment) => {
                      const via = payment.via || 'Cash'
                      const viaColor = getViaColor(via)
                      
                      return (
                        <div
                          key={payment.id}
                          className="flex items-center gap-3 sm:gap-4 py-2 border-b border-gray-200 dark:border-gray-700 last:border-b-0"
                        >
                          {/* Via dan Nominal */}
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <span
                              className="inline-block px-2 py-1 rounded-md text-white text-xs font-semibold flex-shrink-0"
                              style={{ background: viaColor }}
                            >
                              {via}
                            </span>
                            <span className="field-value text-sm sm:text-base font-bold text-teal-600 dark:text-teal-400 break-words">
                              {formatCurrency(payment.nominal)}
                            </span>
                          </div>
                          
                          {/* Tanggal Hijriyah */}
                          <div className="flex-shrink-0 text-right">
                            <div className="field-value text-xs sm:text-sm text-gray-600 dark:text-gray-400">
                              {payment.hijriyah || '-'}
                            </div>
                            {payment.masehi || payment.tanggal_dibuat ? (
                              <div className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                                {formatDate(payment.masehi || payment.tanggal_dibuat)}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}

export default PaymentHistoryOffcanvas
