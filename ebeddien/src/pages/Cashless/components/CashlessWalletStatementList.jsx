import {
  formatSaldo,
  formatWaktu,
  getStatementBadge,
  getStatementKeterangan,
  resolveActorLabel,
} from '../TopUpCashlessFormat'

export default function CashlessWalletStatementList({
  items = [],
  loading = false,
  emptyText = 'Belum ada riwayat transaksi.',
  maxHeightClass = 'max-h-none',
  title = 'Riwayat transaksi',
  className = '',
}) {
  return (
    <div
      className={`flex min-h-0 flex-col rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800 ${className}`}
    >
      <div className="shrink-0 border-b border-gray-100 px-4 py-3 dark:border-gray-700">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{title}</h3>
        <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">
          Top-up, tarik tunai, belanja, dan transfer wallet.
        </p>
      </div>
      <div className={`min-h-0 flex-1 overflow-y-auto p-3 sm:p-4 ${maxHeightClass}`}>
        {loading ? (
          <p className="py-12 text-center text-sm text-gray-500">Memuat riwayat…</p>
        ) : items.length === 0 ? (
          <p className="py-12 text-center text-sm text-gray-500">{emptyText}</p>
        ) : (
          <ul className="space-y-2">
            {items.map((item) => {
              const badge = getStatementBadge(item)
              const keterangan = getStatementKeterangan(item)
              const isOut = item.direction === 'out'
              const amount = Math.abs(Number(item.nominal) || 0)
              const actorLabel = resolveActorLabel(item)
              const key = `${item.journal_id || item.id}-${item.direction}-${item.created_at}`
              const showToko = Boolean(item.toko_nama) && keterangan !== item.toko_nama
              return (
                <li
                  key={key}
                  className="rounded-xl border border-gray-200 bg-gray-50/50 p-3 dark:border-gray-700 dark:bg-gray-900/30"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <span
                        className="inline-block rounded px-2 py-0.5 text-[10px] font-semibold text-white"
                        style={{ background: badge.color }}
                      >
                        {badge.label}
                      </span>
                      {keterangan ? (
                        <p className="mt-1 truncate text-sm font-medium text-gray-900 dark:text-white">
                          {keterangan}
                        </p>
                      ) : null}
                      {showToko ? (
                        <p className="mt-0.5 truncate text-[11px] text-gray-500 dark:text-gray-400">
                          {item.toko_nama}
                        </p>
                      ) : null}
                      {item.referensi ? (
                        <p className="mt-0.5 truncate text-[11px] text-gray-400">{item.referensi}</p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-0.5">
                      <p
                        className={`text-sm font-bold tabular-nums ${
                          isOut
                            ? 'text-orange-700 dark:text-orange-400'
                            : 'text-teal-700 dark:text-teal-400'
                        }`}
                      >
                        {isOut ? '−' : '+'} Rp {formatSaldo(amount)}
                      </p>
                      <p className="text-[10px] text-gray-500 dark:text-gray-400">{formatWaktu(item.created_at)}</p>
                      {actorLabel ? (
                        <p className="max-w-[104px] truncate text-[10px] font-medium text-gray-700 dark:text-gray-300">
                          {actorLabel}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
