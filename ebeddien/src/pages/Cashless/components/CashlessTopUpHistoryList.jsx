import { formatSaldo, formatWaktu, getHistoryBadge, resolveActorLabel } from '../TopUpCashlessFormat'

export default function CashlessTopUpHistoryList({
  items = [],
  loading = false,
  emptyText = 'Belum ada riwayat top-up.',
  maxHeightClass = 'max-h-48',
  title = 'Riwayat top-up',
}) {
  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-2 bg-gray-50/80 dark:bg-gray-900/40">
      <h3 className="text-[11px] font-semibold text-gray-600 dark:text-gray-300 mb-2">{title}</h3>
      <div className={`${maxHeightClass} overflow-y-auto space-y-2 pr-1`}>
        {loading ? (
          <p className="text-xs text-gray-500 text-center py-4">Memuat riwayat…</p>
        ) : items.length === 0 ? (
          <p className="text-xs text-gray-500 text-center py-4">{emptyText}</p>
        ) : (
          items.map((item) => {
            const badge = getHistoryBadge(item)
            const actorLabel = resolveActorLabel(item)
            return (
              <div
                key={item.id}
                className="p-2 bg-white dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700 text-xs"
              >
                <div className="flex items-start justify-between gap-2">
                  <span
                    className="inline-block min-w-[44px] text-center px-2 py-0.5 rounded text-white text-[10px] font-semibold shrink-0"
                    style={{ background: badge.color }}
                  >
                    {badge.label}
                  </span>
                  <span className="flex-1 text-center font-semibold text-teal-700 dark:text-teal-400 text-sm tabular-nums">
                    Rp {formatSaldo(item.nominal)}
                  </span>
                  <div className="text-right shrink-0 max-w-[104px] leading-snug">
                    <p className="text-[10px] text-gray-500 dark:text-gray-400">{formatWaktu(item.created_at)}</p>
                    {actorLabel ? (
                      <p
                        className="text-[10px] font-medium text-gray-700 dark:text-gray-300 truncate mt-0.5"
                        title={actorLabel}
                      >
                        {actorLabel}
                      </p>
                    ) : null}
                  </div>
                </div>
                {item.reference ? (
                  <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1 font-mono truncate" title={item.reference}>
                    {item.reference}
                  </p>
                ) : null}
                {item.referensi ? (
                  <p className="text-gray-500 dark:text-gray-400 mt-1 truncate" title={item.referensi}>
                    {item.referensi}
                  </p>
                ) : null}
                {item.source_account_name ? (
                  <p className="text-gray-500 dark:text-gray-400 mt-0.5 truncate" title={item.source_account_name}>
                    Dari: <span className="font-medium">{item.source_account_name}</span>
                  </p>
                ) : null}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
