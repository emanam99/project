import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

function DeletePaymentModal({ isOpen, onClose, onConfirm, paymentAmount, santriId }) {
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

  // Handle submit
  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    // Normalisasi input (trim whitespace)
    const normalizedPassword = password.trim()
    
    // Validasi password tidak kosong
    if (!normalizedPassword || normalizedPassword === '') {
      setError('NIS wajib diisi')
      return
    }

    // Validasi format NIS (7 digit) dulu
    if (!/^\d{7}$/.test(normalizedPassword)) {
      setError('NIS harus 7 digit angka')
      return
    }

    // Normalisasi santriId (pastikan string, trim, dan pad dengan leading zeros jika perlu)
    let normalizedSantriId = String(santriId || '').trim()
    
    // Pastikan santriId adalah 7 digit (pad dengan leading zeros jika perlu)
    if (normalizedSantriId.length < 7 && /^\d+$/.test(normalizedSantriId)) {
      normalizedSantriId = normalizedSantriId.padStart(7, '0')
    }

    // Debug log (bisa dihapus di production)
    console.log('Validasi NIS:', {
      password: normalizedPassword,
      santriId: normalizedSantriId,
      match: normalizedPassword === normalizedSantriId
    })

    // Validasi password harus sama dengan NIS
    if (normalizedPassword !== normalizedSantriId) {
      setError('NIS salah!')
      return
    }

    setLoading(true)
    try {
      await onConfirm()
      // Jika berhasil, modal akan ditutup oleh parent component
      // Tidak perlu onClose() di sini karena onConfirm sudah menangani penutupan modal
    } catch (err) {
      // Extract error message dari berbagai sumber
      let errorMessage = 'Gagal menghapus pembayaran'
      if (err.response?.data?.message) {
        errorMessage = err.response.data.message
      } else if (err.message) {
        errorMessage = err.message
      } else if (typeof err === 'string') {
        errorMessage = err
      }
      setError(errorMessage)
      // Jangan tutup modal jika ada error, biarkan user melihat error message
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
            className="fixed inset-0 bg-black bg-opacity-50"
            style={{ zIndex: 9998 }}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed inset-0 flex items-center justify-center p-4"
            style={{ zIndex: 9999 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
              {/* Header */}
              <div className="p-6 border-b">
                <div className="flex items-center justify-center mb-4">
                  <div className="flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-red-100">
                    <svg className="h-6 w-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
                    </svg>
                  </div>
                </div>
                <h3 className="text-lg font-semibold text-gray-900 text-center mb-2">
                  Konfirmasi Hapus Pembayaran
                </h3>
                <p className="text-sm text-gray-600 text-center">
                  Anda yakin ingin menghapus pembayaran sebesar{' '}
                  <strong className="text-red-600">Rp {parseInt(paymentAmount || 0).toLocaleString()}</strong>?
                </p>
                <p className="text-xs text-gray-500 text-center mt-2">
                  Tindakan ini tidak dapat dibatalkan.
                </p>
              </div>

              {/* Form */}
              <form onSubmit={handleSubmit} className="p-6">
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Masukkan NIS untuk konfirmasi:
                  </label>
                  <input
                    ref={inputRef}
                    type="text"
                    value={password}
                    onChange={(e) => {
                      // Hanya allow angka
                      const value = e.target.value.replace(/\D/g, '')
                      setPassword(value)
                      setError('')
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        handleClose()
                      }
                    }}
                    className={`w-full p-3 border-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 ${
                      error ? 'border-red-500' : 'border-gray-300'
                    }`}
                    placeholder="Masukkan NIS (7 digit)"
                    maxLength="7"
                    autoComplete="off"
                    disabled={loading}
                  />
                  {error && (
                    <p className="mt-2 text-sm text-red-600">{error}</p>
                  )}
                </div>

                {/* Buttons */}
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={handleClose}
                    disabled={loading}
                    className="flex-1 px-4 py-2 text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300 transition-colors disabled:opacity-50"
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

export default DeletePaymentModal

