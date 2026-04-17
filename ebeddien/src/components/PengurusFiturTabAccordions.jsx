import PengurusRoleAssignMatrixPanel from './PengurusRoleAssignMatrixPanel'

/**
 * Accordion khusus menu Pengurus di halaman Fitur: aksi dari DB + panel matriks penugasan role.
 */
export default function PengurusFiturTabAccordions({
  children,
  openKeys,
  onToggleKey,
  renderRow,
  className = ''
}) {
  const actionItems = Array.isArray(children) ? children : []
  const aksiCount = actionItems.length

  return (
    <div className={className}>
      <div className="border-t-0">
        <button
          type="button"
          aria-expanded={openKeys.has('aksi')}
          onClick={() => onToggleKey('aksi')}
          className="w-full flex items-center gap-2 pl-12 pr-3 py-2.5 text-left hover:bg-gray-100/70 dark:hover:bg-gray-800/50 transition-colors"
        >
          <svg
            className={`w-4 h-4 shrink-0 text-gray-500 dark:text-gray-400 transition-transform ${openKeys.has('aksi') ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
          </svg>
          <div className="flex-1 min-w-0">
            <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">Aksi halaman Pengurus</span>
            <span className="block text-[11px] text-gray-500 dark:text-gray-400 leading-snug">
              Filter lembaga, menugaskan semua role, dll. (satu baris = satu aksi di database)
            </span>
          </div>
          <span className="text-[10px] font-medium text-gray-400 dark:text-gray-500 tabular-nums shrink-0">
            {aksiCount} aksi
          </span>
        </button>
        {openKeys.has('aksi') ? (
          <div className="border-t border-gray-100/80 dark:border-gray-700/40 bg-gray-50/50 dark:bg-gray-900/25">
            {actionItems.length === 0 ? (
              <p className="text-xs text-gray-500 dark:text-gray-400 py-4 px-4 pl-12">Belum ada sub-fitur (aksi).</p>
            ) : (
              actionItems.map((item, rowIdx) => renderRow(item, 'aksi', rowIdx))
            )}
          </div>
        ) : null}
      </div>

      <div className="border-t border-gray-100 dark:border-gray-700/50">
        <button
          type="button"
          aria-expanded={openKeys.has('matriks')}
          onClick={() => onToggleKey('matriks')}
          className="w-full flex items-center gap-2 pl-12 pr-3 py-2.5 text-left hover:bg-gray-100/70 dark:hover:bg-gray-800/50 transition-colors"
        >
          <svg
            className={`w-4 h-4 shrink-0 text-gray-500 dark:text-gray-400 transition-transform ${openKeys.has('matriks') ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
          </svg>
          <div className="flex-1 min-w-0">
            <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">Matriks penugasan role</span>
            <span className="block text-[11px] text-gray-500 dark:text-gray-400 leading-snug">
              Atur role mana yang boleh menugaskan role mana ke pengurus lain (tabel role___boleh_assign_role)
            </span>
          </div>
        </button>
        {openKeys.has('matriks') ? <PengurusRoleAssignMatrixPanel /> : null}
      </div>
    </div>
  )
}
