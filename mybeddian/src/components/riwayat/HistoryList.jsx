import { getViaColor, formatCurrency } from '../../utils/riwayatPembayaran'

export default function HistoryList({ items, formatDateFunc, emptyMessage }) {
  if (!items || items.length === 0) {
    return <p className="text-sm text-gray-500 dark:text-gray-400 py-2">{emptyMessage}</p>
  }
  const formatDate = formatDateFunc || (() => '-')
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3 py-2 border-b-2 border-gray-200 dark:border-gray-600 text-xs font-medium text-gray-500 dark:text-gray-400">
        <span className="flex-1">Via & Nominal</span>
        <span className="text-right">Tanggal</span>
      </div>
      {items.map((p) => (
        <div
          key={p.id}
          className="flex items-center gap-3 py-2 border-b border-gray-100 dark:border-gray-700/50 last:border-0"
        >
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span
              className="inline-block px-2 py-0.5 rounded text-white text-xs font-semibold shrink-0"
              style={{ backgroundColor: getViaColor(p.via || 'Cash') }}
            >
              {p.via || 'Cash'}
            </span>
            <span className="text-sm font-semibold text-teal-600 dark:text-teal-400">
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
