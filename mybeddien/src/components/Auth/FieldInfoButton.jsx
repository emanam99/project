/** Tombol Info field — selaras aplikasi daftar (amber badge). */
export default function FieldInfoButton({ onClick, title = 'Info' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1 px-1.5 py-0.5 bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 transition-colors rounded text-[10px] font-bold tracking-wider uppercase border border-amber-100 dark:border-amber-800 shrink-0"
      title={title}
    >
      <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <span className="whitespace-nowrap">Info</span>
    </button>
  )
}
