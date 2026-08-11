import Modal from '../../../components/Modal/Modal'

/**
 * Konfirmasi cetak ulang kartu yang sudah aktif — kartu lama tetap dipakai sampai kartu baru discan.
 */
export default function KartuCetakUlangModal({
  isOpen,
  onClose,
  onConfirm,
  cardLabel = 'Kartu',
  santriNama = '',
  loading = false,
  variant = 'single',
  printedLabels = [],
  keepOthersValid = true,
}) {
  const isBatch = variant === 'batch' && printedLabels.length > 0
  const isBundleAll = variant === 'bundle-all'

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Cetak ulang kartu?"
      maxWidth="max-w-md"
      preventClose={loading}
      zIndex={100000}
    >
      <div className="space-y-4">
        <div className="flex gap-3 p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/60">
          <span className="flex-shrink-0 w-9 h-9 rounded-full bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center text-amber-700 dark:text-amber-300">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </span>
          <div className="min-w-0 text-sm text-amber-900 dark:text-amber-100">
            {isBundleAll ? (
              <>
                <p className="font-medium">
                  Terbitkan ulang 3 kartu sekaligus{santriNama ? ` untuk ${santriNama}` : ''}.
                </p>
                <p className="mt-1 text-amber-800/90 dark:text-amber-200/90">
                  Semua kartu yang dipilih akan dicetak dengan QR baru.{' '}
                  <strong>Kartu fisik lama tetap aktif</strong> sampai masing-masing kartu baru discan & divalidasi.
                </p>
              </>
            ) : isBatch ? (
              <>
                <p className="font-medium">
                  {printedLabels.length} kartu sudah pernah dicetak
                  {santriNama ? ` untuk ${santriNama}` : ''}.
                </p>
                <p className="mt-1 text-amber-800/90 dark:text-amber-200/90">
                  {printedLabels.join(', ')} — QR baru akan dicetak.{' '}
                  <strong>Kartu fisik lama tetap aktif</strong> sampai kartu baru discan & divalidasi.
                </p>
              </>
            ) : (
              <>
                <p className="font-medium">
                  {cardLabel} sudah pernah dicetak{santriNama ? ` untuk ${santriNama}` : ''}.
                </p>
                <p className="mt-1 text-amber-800/90 dark:text-amber-200/90">
                  QR baru akan dicetak. <strong>Kartu fisik lama tetap aktif</strong> sampai kartu baru discan &
                  divalidasi (QR cocok, kondisi fisik baik).
                </p>
              </>
            )}
          </div>
        </div>

        {keepOthersValid && !isBundleAll && (
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Kartu lain yang tidak dicetak ulang tidak terpengaruh. Setelah cetak, scan QR pada kartu fisik untuk mengaktifkan.
          </p>
        )}

        <div className="flex gap-3 justify-end pt-1">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 rounded-xl border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700/50 disabled:opacity-50"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium disabled:opacity-50 flex items-center gap-2"
          >
            {loading && (
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            )}
            {loading ? 'Menerbitkan...' : 'Ya, cetak ulang'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
