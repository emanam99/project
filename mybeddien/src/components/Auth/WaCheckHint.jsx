import { WA_MANUAL_CONFIRM_AFTER_RETRIES } from '../../hooks/useWaNumberProbe'

/**
 * Pesan status cek WA, tombol ulang, dan opsi centang manual setelah beberapa kali gagal.
 */
export function WaCheckHint({
  waHint,
  waChecking,
  waVerified,
  waCanRetry,
  onRetry,
  showManualConfirm = false,
  waManualConfirmed = false,
  onManualConfirmChange,
  manualRetryClickCount = 0,
}) {
  if (!waHint && !waCanRetry && !showManualConfirm) return null

  const hintClass = waVerified
    ? 'text-emerald-700 dark:text-emerald-400'
    : waManualConfirmed
      ? 'text-amber-800 dark:text-amber-300'
      : waChecking
        ? 'text-gray-600 dark:text-gray-400'
        : waCanRetry
          ? 'text-red-700 dark:text-red-400'
          : 'text-amber-800 dark:text-amber-300'

  const retriesLeft = Math.max(0, WA_MANUAL_CONFIRM_AFTER_RETRIES - manualRetryClickCount)

  return (
    <div className="mt-1.5 pl-1 space-y-2">
      {waHint ? (
        <p className={`text-xs flex items-start gap-1.5 ${hintClass}`}>
          {waChecking ? (
            <svg
              className="w-3.5 h-3.5 shrink-0 mt-0.5 animate-spin"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              aria-hidden
            >
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
          ) : null}
          <span>{waHint}</span>
        </p>
      ) : null}

      {waCanRetry && !waChecking && !waManualConfirmed ? (
        <div className="space-y-1">
          <button
            type="button"
            onClick={onRetry}
            className="text-xs font-semibold text-primary-600 dark:text-primary-400 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 rounded px-0.5"
          >
            Coba cek lagi
          </button>
          {manualRetryClickCount > 0 && retriesLeft > 0 ? (
            <p className="text-[11px] text-gray-500 dark:text-gray-400">
              Percobaan ulang {manualRetryClickCount}/{WA_MANUAL_CONFIRM_AFTER_RETRIES}
              {retriesLeft === 1 ? ' — setelah ini bisa konfirmasi manual.' : ''}
            </p>
          ) : null}
        </div>
      ) : null}

      {showManualConfirm ? (
        <label className="flex items-start gap-2.5 cursor-pointer text-xs text-gray-800 dark:text-gray-200 rounded-lg border border-amber-200 dark:border-amber-800/60 bg-amber-50/80 dark:bg-amber-950/30 px-3 py-2.5">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            checked={waManualConfirmed}
            onChange={(e) => onManualConfirmChange?.(e.target.checked)}
          />
          <span>
            Nomor WhatsApp yang saya masukkan sudah sesuai dan aktif.
            <span className="block mt-1 text-[11px] text-gray-600 dark:text-gray-400 font-normal">
              Centang ini hanya jika pengecekan otomatis gagal berulang kali; pastikan nomor benar agar pesan dari
              pesantren sampai.
            </span>
          </span>
        </label>
      ) : null}
    </div>
  )
}
