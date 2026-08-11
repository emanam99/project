/** Tombol buka scanner QR/barcode — dipakai saat kotak kamera disembunyikan. */
export default function BarangQrScanButton({ onClick, className = '', size = 'md' }) {
  const dim = size === 'sm' ? 'h-8 w-8' : 'h-9 w-9'
  const icon = size === 'sm' ? 'h-4 w-4' : 'h-[1.125rem] w-[1.125rem]'

  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-600 ring-1 ring-primary-500/20 transition-colors hover:bg-primary-100 dark:bg-primary-900/40 dark:text-primary-300 dark:ring-primary-400/25 dark:hover:bg-primary-900/60 ${dim} ${className}`}
      aria-label="Buka scan QR"
      title="Scan QR / barcode"
    >
      <svg className={icon} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h2m10 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"
        />
      </svg>
    </button>
  )
}
