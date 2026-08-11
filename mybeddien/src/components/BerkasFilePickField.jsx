import { useRef } from 'react'

/**
 * Input file tersembunyi + tombol besar — lebih andal di HP/PWA daripada native file input
 * dengan styling pseudo `file:` (area tap sering terlalu kecil atau tidak merespons).
 */
export default function BerkasFilePickField({
  accept,
  disabled = false,
  loading = false,
  label = 'Pilih file',
  replaceLabel = 'Ganti file',
  hint,
  selectedName,
  onFileSelected,
}) {
  const inputRef = useRef(null)

  const handleChange = (e) => {
    const file = e.target.files?.[0] || null
    e.target.value = ''
    if (file) onFileSelected?.(file)
  }

  const openPicker = () => {
    if (disabled || loading) return
    inputRef.current?.click()
  }

  const buttonLabel = loading
    ? 'Memproses…'
    : selectedName
      ? `${replaceLabel} (${selectedName})`
      : label

  return (
    <div className="mt-1.5">
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        disabled={disabled || loading}
        className="sr-only"
        onChange={handleChange}
        aria-hidden="true"
        tabIndex={-1}
      />
      <button
        type="button"
        disabled={disabled || loading}
        onClick={openPicker}
        className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-white px-4 py-3 text-sm font-medium text-primary-700 transition-colors hover:border-primary-400 hover:bg-primary-50/60 active:bg-primary-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800 dark:text-primary-300 dark:hover:border-primary-600 dark:hover:bg-primary-950/30 dark:active:bg-primary-950/40"
      >
        <svg
          className="h-5 w-5 shrink-0 opacity-80"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
          />
        </svg>
        <span className="truncate text-center">{buttonLabel}</span>
      </button>
      {hint ? (
        <p className="mt-1.5 text-[11px] leading-snug text-slate-500 dark:text-slate-400">{hint}</p>
      ) : null}
    </div>
  )
}
