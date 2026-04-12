import { ABSEN_TAB_ACCORDIONS, groupAbsenFiturChildren } from '../config/absenFiturCodes'

/**
 * Mengelompokkan aksi fitur menu Absen ke accordion per tab (Riwayat / Absen / Ngabsen).
 */
export default function AbsenFiturTabAccordions({
  children,
  openKeys,
  onToggleKey,
  renderRow,
  className = ''
}) {
  const buckets = groupAbsenFiturChildren(children)
  const sections = ABSEN_TAB_ACCORDIONS.map((def) => ({
    ...def,
    items: buckets[def.key] || []
  })).filter((s) => s.items.length > 0)

  return (
    <div className={className}>
      {sections.map((section, idx) => {
        const isOpen = openKeys.has(section.key)
        return (
          <div
            key={section.key}
            className={`border-t border-gray-100 dark:border-gray-700/50 ${idx === 0 ? 'border-t-0' : ''}`}
          >
            <button
              type="button"
              aria-expanded={isOpen}
              onClick={() => onToggleKey(section.key)}
              className="w-full flex items-center gap-2 pl-12 pr-3 py-2.5 text-left hover:bg-gray-100/70 dark:hover:bg-gray-800/50 transition-colors"
            >
              <svg
                className={`w-4 h-4 shrink-0 text-gray-500 dark:text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
              </svg>
              <div className="flex-1 min-w-0">
                <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">{section.title}</span>
                <span className="block text-[11px] text-gray-500 dark:text-gray-400 leading-snug">{section.subtitle}</span>
              </div>
              <span className="text-[10px] font-medium text-gray-400 dark:text-gray-500 tabular-nums shrink-0">
                {section.items.length} aksi
              </span>
            </button>
            {isOpen ? (
              <div className="border-t border-gray-100/80 dark:border-gray-700/40 bg-gray-50/50 dark:bg-gray-900/25">
                {section.items.map((item, rowIdx) => renderRow(item, section.key, rowIdx))}
              </div>
            ) : null}
          </div>
        )
      })}
      {buckets.other.length > 0 ? (
        <div className="border-t border-gray-100 dark:border-gray-700/50">
          <div className="px-3 py-2 pl-12 bg-amber-50/50 dark:bg-amber-900/15">
            <p className="text-xs font-medium text-amber-900 dark:text-amber-200">Aksi lain (luar pembagian tab)</p>
          </div>
          {buckets.other.map((item, rowIdx) => renderRow(item, 'other', rowIdx))}
        </div>
      ) : null}
    </div>
  )
}
