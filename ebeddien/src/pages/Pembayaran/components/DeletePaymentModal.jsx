import { useState, useEffect } from 'react'
import Modal from '../../../components/Modal/Modal'

/**
 * Konfirmasi hapus pembayaran: hanya Batal / Hapus (tanpa input NIS/ID).
 * Gaya mengikuti Modal tema (light/dark).
 */
function DeletePaymentModal({
  isOpen,
  onClose,
  onConfirm,
  paymentAmount,
  title = 'Konfirmasi hapus pembayaran',
  subtitle,
  zIndex = 100000,
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (isOpen) {
      setError('')
      setLoading(false)
    }
  }, [isOpen])

  const handleConfirm = async () => {
    setError('')
    setLoading(true)
    try {
      await onConfirm()
      // Penutupan modal: parent yang set isOpen false setelah sukses (hindari race saat offcanvas ikut tertutup).
    } catch (err) {
      let errorMessage = 'Gagal menghapus pembayaran'
      if (err?.response?.data?.message) {
        errorMessage = err.response.data.message
      } else if (err?.message) {
        errorMessage = err.message
      } else if (typeof err === 'string') {
        errorMessage = err
      }
      setError(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      maxWidth="max-w-md"
      closeOnBackdropClick={!loading}
      preventClose={loading}
      zIndex={zIndex}
    >
      <div className="space-y-4">
        <div className="flex justify-center">
          <div
            className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/40"
            aria-hidden
          >
            <svg
              className="h-6 w-6 text-red-600 dark:text-red-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z"
              />
            </svg>
          </div>
        </div>

        <p className="text-center text-sm text-gray-600 dark:text-gray-300">
          {subtitle ?? 'Apakah Anda yakin ingin menghapus pembayaran ini?'}
        </p>

        {paymentAmount != null && Number(paymentAmount) > 0 && (
          <p className="text-center text-sm text-gray-700 dark:text-gray-200">
            Nominal:{' '}
            <strong className="text-red-600 dark:text-red-400">
              Rp {parseInt(String(paymentAmount).replace(/\D/g, '') || '0', 10).toLocaleString('id-ID')}
            </strong>
          </p>
        )}

        <p className="text-center text-xs text-gray-500 dark:text-gray-400">
          Tindakan ini tidak dapat dibatalkan.
        </p>

        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-center text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-3 border-t border-gray-200 pt-4 dark:border-gray-700">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded-lg bg-gray-200 px-4 py-2 text-sm font-medium text-gray-800 transition-colors hover:bg-gray-300 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-red-700 dark:hover:bg-red-600"
          >
            {loading ? (
              <>
                <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden>
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Menghapus…
              </>
            ) : (
              'Hapus'
            )}
          </button>
        </div>
      </div>
    </Modal>
  )
}

export default DeletePaymentModal
