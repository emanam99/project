import {
  DateActorColumn,
  formatSaldo,
  getHistoryBadge,
  resolveActorLabel,
} from './CashlessFormat'

export default function CashlessTransactionList({
  items = [],
  loading = false,
  live = false,
  onSelect,
}) {
  return (
    <div className="flex flex-col rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <div className="shrink-0 border-b border-gray-100 px-4 py-3 dark:border-gray-700">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Riwayat transaksi</h3>
          {live ? (
            <span className="inline-flex shrink-0 items-center gap-1 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              Live
            </span>
          ) : null}
        </div>
        <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">
          Ketuk transaksi untuk melihat detail.
        </p>
      </div>
      <div className="p-3 sm:p-4">
        {loading ? (
          <p className="py-12 text-center text-sm text-gray-500">Memuat riwayat…</p>
        ) : items.length === 0 ? (
          <p className="py-12 text-center text-sm text-gray-500">Belum ada transaksi.</p>
        ) : (
          <ul className="space-y-2">
            {items.map((item) => {
              const badge = getHistoryBadge(item)
              const isOut = item.direction === 'out'
              const amount = Math.abs(Number(item.nominal) || 0)
              const actorLabel = resolveActorLabel(item)
              const key = `${item.journal_id}-${item.direction}-${item.created_at}`
              return (
                <li key={key}>
                  <button
                    type="button"
                    onClick={() => onSelect?.(item)}
                    className="w-full rounded-xl border border-gray-200 bg-gray-50/50 p-3 text-left transition-colors hover:border-primary-300 hover:bg-primary-50/40 dark:border-gray-700 dark:bg-gray-900/30 dark:hover:border-primary-700 dark:hover:bg-primary-900/20"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <span
                          className="inline-block rounded px-2 py-0.5 text-[10px] font-semibold text-white"
                          style={{ background: badge.bg }}
                        >
                          {badge.label}
                        </span>
                        <p className="mt-1 truncate text-sm font-medium text-gray-900 dark:text-white">
                          {item.label || item.description || item.journal_type || 'Transaksi'}
                        </p>
                        {item.referensi ? (
                          <p className="mt-0.5 truncate text-[11px] text-gray-400">{item.referensi}</p>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-0.5">
                        <p
                          className={`text-sm font-bold tabular-nums ${
                            isOut
                              ? 'text-orange-700 dark:text-orange-400'
                              : 'text-primary-700 dark:text-primary-400'
                          }`}
                        >
                          {isOut ? '−' : '+'} Rp {formatSaldo(amount)}
                        </p>
                        <DateActorColumn createdAt={item.created_at} actorLabel={actorLabel} />
                      </div>
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
