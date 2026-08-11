import { AnimatePresence } from 'framer-motion'
import BarangDetailTabs from './BarangDetailTabs'
import BarangDetailSuccess from './BarangDetailSuccess'

function CameraToggleIcon({ active, className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
      />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
      {!active ? (
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4l16 16" />
      ) : null}
    </svg>
  )
}

function CloseIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
    </svg>
  )
}

/** Panel kanan desktop: scan sudah di atas, ini area form / placeholder. */
export default function BarangDetailPanel({
  formOpen,
  formModeLabel,
  formHeading,
  success,
  error,
  onClose,
  onTambah,
  formPanelProps,
  detailTab,
  onDetailTabChange,
  cameraOpen = true,
  onToggleCamera,
}) {
  const showCameraToggle = typeof onToggleCamera === 'function'

  const headerActions = (
    <div className="flex shrink-0 items-center gap-1">
      {showCameraToggle ? (
        <button
          type="button"
          onClick={onToggleCamera}
          className={`inline-flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
            cameraOpen
              ? 'bg-primary-50 text-primary-700 hover:bg-primary-100 dark:bg-primary-900/40 dark:text-primary-300 dark:hover:bg-primary-900/60'
              : 'text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700'
          }`}
          title={cameraOpen ? 'Sembunyikan kamera' : 'Tampilkan kamera'}
          aria-label={cameraOpen ? 'Sembunyikan kamera' : 'Tampilkan kamera'}
          aria-pressed={cameraOpen}
        >
          <CameraToggleIcon active={cameraOpen} className="h-4 w-4" />
        </button>
      ) : null}
      {formOpen ? (
        <button
          type="button"
          onClick={onClose}
          disabled={Boolean(success)}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-40 dark:text-gray-400 dark:hover:bg-gray-700"
          title="Tutup"
          aria-label="Tutup"
        >
          <CloseIcon className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  )

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800/95">
      {formOpen ? (
        <>
          <div className="mb-3 shrink-0 border-b border-gray-100 pb-3 dark:border-gray-700/80">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-primary-600 dark:text-primary-400">
                  {formModeLabel}
                </p>
                <h2 className="truncate text-base font-semibold text-gray-900 dark:text-white">{formHeading}</h2>
              </div>
              {headerActions}
            </div>
            {error ? (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
                {error}
              </div>
            ) : null}
          </div>
          <BarangDetailTabs
            editing={formPanelProps.editing}
            detailTab={detailTab}
            onDetailTabChange={onDetailTabChange}
            formPanelProps={formPanelProps}
            showCancel={false}
          />
          <AnimatePresence>{success ? <BarangDetailSuccess message={success} /> : null}</AnimatePresence>
        </>
      ) : (
        <div className="relative flex min-h-0 flex-1 flex-col">
          {showCameraToggle ? (
            <div className="absolute right-0 top-0 z-10">{headerActions}</div>
          ) : null}
          <div className="flex flex-1 flex-col items-center justify-center px-4 py-8 text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50 text-primary-600 dark:bg-primary-900/40 dark:text-primary-400">
              <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1.75"
                  d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
                />
              </svg>
            </div>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Pilih barang untuk diedit</p>
            <p className="mt-2 max-w-xs text-xs leading-relaxed text-gray-500 dark:text-gray-400">
              Klik salah satu barang di daftar kiri, atau scan QR/barcode di atas, atau tambah barang baru.
            </p>
            <button
              type="button"
              onClick={onTambah}
              className="mt-5 rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-700"
            >
              Tambah Barang
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
