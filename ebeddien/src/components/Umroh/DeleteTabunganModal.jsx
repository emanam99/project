import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

function DeleteTabunganModal({ isOpen, onClose, onConfirm, tabunganData, jamaahId }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const inputRef = useRef(null)

  // Focus input saat modal dibuka
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setPassword('')
      setError('')
      setTimeout(() => {
        inputRef.current?.focus()
      }, 100)
    }
  }, [isOpen])

  // Format currency
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0
    }).format(amount || 0)
  }

  // Handle submit
  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    // Normalisasi input (trim whitespace)
    const normalizedPassword = password.trim()
    
    // Validasi password tidak kosong
    if (!normalizedPassword || normalizedPassword === '') {
      setError('ID Jamaah wajib diisi')
      return
    }

    // Normalisasi jamaahId (bisa berupa ID atau kode_jamaah)
    let normalizedJamaahId = String(jamaahId || '').trim()
    
    // Validasi password harus sama dengan ID Jamaah atau kode_jamaah
    if (normalizedPassword !== normalizedJamaahId && normalizedPassword !== String(tabunganData?.jamaah_id || '')) {
      setError('ID/Kode Jamaah salah!')
      return
    }

    setLoading(true)
    try {
      await onConfirm()
      onClose()
    } catch (err) {
      setError(err.message || 'Gagal menghapus tabungan')
    } finally {
      setLoading(false)
    }
  }

  // Handle close
  const handleClose = () => {
    setPassword('')
    setError('')
    onClose()
  }

  const jenisLabel = tabunganData?.jenis === 'Setoran' ? 'Setoran' : 
                     tabunganData?.jenis === 'Penarikan' ? 'Penarikan' : 
                     tabunganData?.jenis || 'Transaksi'

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="fixed inset-0 bg-black bg-opacity-50 z-50"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed inset-0 flex items-center justify-center p-4 z-50"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full">
              {/* Header */}
              <div className="p-6 border-b border-gray-200 dark:border-gray-700">
                <div className="flex items-center justify-center mb-4">
                  <div className="flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-red-100 dark:bg-red-900/20">
                    <svg className="h-6 w-6 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
                    </svg>
                  </div>
                </div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white text-center mb-2">
                  Konfirmasi Hapus {jenisLabel}
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 text-center">
                  Anda yakin ingin menghapus {jenisLabel.toLowerCase()} sebesar{' '}
                  <strong className="text-red-600 dark:text-red-400">
                    {formatCurrency(tabunganData?.nominal || 0)}
                  </strong>?
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-500 text-center mt-2">
                  Tindakan ini tidak dapat dibatalkan dan akan mempengaruhi saldo jamaah.
                </p>
              </div>

              {/* Form */}
              <form onSubmit={handleSubmit} className="p-6">
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Masukkan ID/Kode Jamaah untuk konfirmasi:
                  </label>
                  <input
                    ref={inputRef}
                    type="text"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value)
                      setError('')
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        handleClose()
                      }
                    }}
                    className={`w-full p-3 border-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 dark:bg-gray-700 dark:text-white dark:border-gray-600 ${
                      error ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'
                    }`}
                    placeholder="Masukkan ID/Kode Jamaah"
                    autoComplete="off"
                    disabled={loading}
                  />
                  {error && (
                    <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>
                  )}
                </div>

                {/* Buttons */}
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={handleClose}
                    disabled={loading}
                    className="flex-1 px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-200 dark:bg-gray-600 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors disabled:opacity-50"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {loading ? (
                      <>
                        <svg className="animate-spin h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Menghapus...
                      </>
                    ) : (
                      'Hapus'
                    )}
                  </button>
                </div>
              </form>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

export default DeleteTabunganModal

