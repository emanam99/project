import { useState } from 'react'
import { getViaColor, formatCurrency } from '../../utils/riwayatPembayaran'

function rowKey(p, idx) {
  return p?.id ?? p?.id_bayar ?? `h-${idx}`
}

function ListBody({ items, formatDate }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3 py-2 border-b-2 border-gray-200 dark:border-gray-600 text-xs font-medium text-gray-500 dark:text-gray-400">
        <span className="flex-1">Via & Nominal</span>
        <span className="text-right">Tanggal</span>
      </div>
      {items.map((p, idx) => (
        <div
          key={rowKey(p, idx)}
          className="flex items-center gap-3 py-2 border-b border-gray-100 dark:border-gray-700/50 last:border-0"
        >
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span
              className="inline-block px-2 py-0.5 rounded text-white text-xs font-semibold shrink-0"
              style={{ backgroundColor: getViaColor(p.via || 'Cash') }}
            >
              {p.via || 'Cash'}
            </span>
            <span className="text-sm font-semibold text-primary-600 dark:text-primary-400">
              {formatCurrency(p.nominal)}
            </span>
          </div>
          <div className="text-right text-xs text-gray-600 dark:text-gray-400 shrink-0">
            {p.hijriyah || '-'}
            <br />
            {formatDate(p.masehi || p.tanggal_dibuat)}
          </div>
        </div>
      ))}
    </div>
  )
}

/**
 * @param {object} props
 * @param {boolean} [props.collapsible] — sub-accordion: default tertutup, isi rinci saat dibuka
 * @param {boolean} [props.defaultExpanded]
 * @param {string} [props.sectionTitle] — judul bar header saat collapsible
 */
export default function HistoryList({
  items,
  formatDateFunc,
  emptyMessage,
  collapsible = false,
  defaultExpanded = false,
  sectionTitle = 'Riwayat pembayaran',
}) {
  const formatDate = formatDateFunc || (() => '-')
  const list = Array.isArray(items) ? items : []

  if (list.length === 0) {
    if (collapsible) {
      return (
        <div className="rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50/60 dark:bg-gray-900/25 px-3 py-2.5">
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-0.5">{sectionTitle}</p>
          <p className="text-sm text-gray-500 dark:text-gray-400">{emptyMessage}</p>
        </div>
      )
    }
    return <p className="text-sm text-gray-500 dark:text-gray-400 py-2">{emptyMessage}</p>
  }

  if (!collapsible) {
    return <ListBody items={list} formatDate={formatDate} />
  }

  const [expanded, setExpanded] = useState(defaultExpanded)

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800/40 overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2 sm:gap-3 px-3 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-gray-700/35 transition-colors"
      >
        <svg
          className={`w-4 h-4 shrink-0 text-gray-500 dark:text-gray-400 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
        </svg>
        <span className="flex-1 text-xs font-semibold text-gray-600 dark:text-gray-300 min-w-0">{sectionTitle}</span>
        <span className="text-[11px] text-gray-500 dark:text-gray-400 shrink-0 tabular-nums">
          {list.length} transaksi
        </span>
      </button>
      {expanded ? (
        <div className="px-3 pb-3 pt-1 border-t border-gray-100 dark:border-gray-700/80">
          <ListBody items={list} formatDate={formatDate} />
        </div>
      ) : null}
    </div>
  )
}
