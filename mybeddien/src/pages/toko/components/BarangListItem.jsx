export default function BarangListItem({ item, active, onSelect, formatRupiah }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(item)}
      className={`group w-full rounded-xl border px-3 py-3 text-left transition-all ${
        active
          ? 'border-primary-400 bg-primary-50/90 shadow-sm ring-1 ring-primary-500/25 dark:border-primary-500/50 dark:bg-primary-900/30 dark:ring-primary-400/20'
          : 'border-gray-200/90 bg-white hover:border-gray-300 hover:bg-gray-50/90 active:bg-gray-100 dark:border-gray-700 dark:bg-gray-800/60 dark:hover:border-gray-600 dark:hover:bg-gray-700/40'
      }`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
            active
              ? 'bg-primary-100 text-primary-600 dark:bg-primary-800/60 dark:text-primary-300'
              : 'bg-gray-100 text-gray-500 group-hover:bg-gray-200/80 dark:bg-gray-700/80 dark:text-gray-400'
          }`}
          aria-hidden
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
            />
          </svg>
        </div>

        <div className="flex min-w-0 flex-1 items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="line-clamp-2 text-sm font-semibold leading-snug text-gray-900 dark:text-white">
              {item.nama_barang}
            </p>
            {(item.kode_barang || item.aktif === 0) && (
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                {item.kode_barang ? (
                  <span className="rounded-md bg-gray-100 px-1.5 py-0.5 font-mono text-[11px] text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                    {item.kode_barang}
                  </span>
                ) : null}
                {item.aktif === 0 ? (
                  <span className="rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
                    Nonaktif
                  </span>
                ) : null}
              </div>
            )}
            {item.keterangan ? (
              <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                {item.keterangan}
              </p>
            ) : null}
          </div>

          <div className="flex shrink-0 flex-col items-end gap-1 self-start">
            <p className="text-sm font-semibold tabular-nums text-primary-600 dark:text-primary-400">
              {formatRupiah(item.harga)}
            </p>
            <span
              className={`rounded-md px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${
                (item.stok ?? 0) <= 0
                  ? 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400'
                  : (item.stok ?? 0) <= 5
                    ? 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400'
                    : 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400'
              }`}
            >
              Stok {item.stok ?? 0}
            </span>
          </div>
        </div>

        <svg
          className={`mt-1 h-4 w-4 shrink-0 text-gray-300 transition-transform group-hover:text-gray-400 dark:text-gray-600 lg:group-hover:translate-x-0.5 ${
            active ? 'text-primary-500 dark:text-primary-400' : ''
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </button>
  )
}
