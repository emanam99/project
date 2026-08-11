function formatRupiah(n) {
  if (n == null || Number.isNaN(Number(n))) return 'Rp 0'
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n)
}

function SearchIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  )
}

function CameraIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
      />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  )
}

function BayarIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
      />
    </svg>
  )
}

export default function PenjualanCart({
  items,
  onQtyChange,
  onRemove,
  total,
  onBayar,
  onCariBarang,
  onScanKamera,
  disabled,
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800/95">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-gray-100 px-3 py-3 dark:border-gray-700 sm:px-4">
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold text-gray-900 dark:text-white">Penjualan</h1>
          <p className="text-xs text-gray-500 dark:text-gray-400">{items.length} item</p>
        </div>
        {typeof onCariBarang === 'function' ? (
          <button
            type="button"
            onClick={onCariBarang}
            className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-600 transition-colors hover:border-primary-300 hover:bg-primary-50 hover:text-primary-700 lg:inline-flex dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:border-primary-700 dark:hover:bg-primary-900/30 dark:hover:text-primary-300"
            title="Cari barang"
            aria-label="Cari barang"
          >
            <SearchIcon className="h-5 w-5" />
          </button>
        ) : (
          <span className="shrink-0 rounded-lg bg-gray-100 px-2 py-0.5 text-xs font-medium tabular-nums text-gray-600 dark:bg-gray-700 dark:text-gray-300">
            {items.length} item
          </span>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2 sm:p-3">
        {items.length === 0 ? (
          <div className="flex h-full min-h-40 flex-col items-center justify-center px-4 text-center">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Keranjang kosong</p>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Scan QR/barcode batang, atau ketuk ikon cari untuk pilih barang.
            </p>
            {typeof onCariBarang === 'function' ? (
              <button
                type="button"
                onClick={onCariBarang}
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
              >
                <SearchIcon className="h-4 w-4" />
                Cari barang
              </button>
            ) : null}
          </div>
        ) : (
          <ul className="space-y-2">
            {items.map((line) => (
              <li
                key={line.id}
                className="flex items-start gap-2 rounded-xl border border-gray-100 bg-gray-50/80 p-3 dark:border-gray-700 dark:bg-gray-900/40"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">{line.nama_barang}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {line.kode_barang || '—'} · {formatRupiah(line.harga)}
                  </p>
                  <p className="mt-1 text-sm font-semibold tabular-nums text-primary-700 dark:text-primary-300">
                    {formatRupiah(line.harga * line.qty)}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => onQtyChange(line.id, line.qty - 1)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-lg font-medium text-gray-700 ring-1 ring-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:ring-gray-600"
                      aria-label="Kurangi"
                    >
                      −
                    </button>
                    <span className="w-8 text-center text-sm font-semibold tabular-nums text-gray-900 dark:text-white">
                      {line.qty}
                    </span>
                    <button
                      type="button"
                      onClick={() => onQtyChange(line.id, line.qty + 1)}
                      disabled={line.stok != null && line.qty >= line.stok}
                      className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-lg font-medium text-gray-700 ring-1 ring-gray-200 disabled:opacity-40 dark:bg-gray-800 dark:text-gray-200 dark:ring-gray-600"
                      aria-label="Tambah"
                    >
                      +
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => onRemove(line.id)}
                    className="text-xs font-medium text-red-600 hover:underline dark:text-red-400"
                  >
                    Hapus
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="shrink-0 border-t border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800 sm:p-4">
        <div className="mb-3 flex items-baseline justify-between gap-2">
          <span className="text-sm text-gray-600 dark:text-gray-400">Total</span>
          <span className="text-xl font-bold tabular-nums text-gray-900 dark:text-white">{formatRupiah(total)}</span>
        </div>
        <div className="flex items-stretch gap-2">
          <button
            type="button"
            disabled={disabled || items.length === 0 || total <= 0}
            onClick={onBayar}
            className="inline-flex h-12 min-w-0 flex-1 items-center justify-center gap-2 rounded-xl bg-primary-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-primary-700 disabled:opacity-50"
          >
            <BayarIcon className="h-5 w-5 shrink-0" />
            <span className="truncate">Bayar (scan kartu)</span>
          </button>
          {typeof onScanKamera === 'function' ? (
            <button
              type="button"
              onClick={onScanKamera}
              className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-gray-300 bg-white text-gray-700 shadow-sm hover:border-primary-300 hover:bg-primary-50 hover:text-primary-700 lg:hidden dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200 dark:hover:border-primary-700 dark:hover:bg-primary-900/30"
              aria-label="Scan kamera"
              title="Scan kamera"
            >
              <CameraIcon className="h-5 w-5" />
            </button>
          ) : null}
          {typeof onCariBarang === 'function' ? (
            <button
              type="button"
              onClick={onCariBarang}
              className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-gray-300 bg-white text-gray-700 shadow-sm hover:border-primary-300 hover:bg-primary-50 hover:text-primary-700 lg:hidden dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200 dark:hover:border-primary-700 dark:hover:bg-primary-900/30"
              aria-label="Cari barang"
              title="Cari barang"
            >
              <SearchIcon className="h-5 w-5" />
            </button>
          ) : null}
        </div>
        {total > 0 && total < 10000 && (
          <p className="mt-2 text-center text-[11px] text-gray-500 dark:text-gray-400">
            Di bawah Rp 10.000 — tanpa PIN
          </p>
        )}
        {total >= 10000 && (
          <p className="mt-2 text-center text-[11px] text-amber-700 dark:text-amber-300">
            ≥ Rp 10.000 — wajib PIN 6 digit
          </p>
        )}
      </div>
    </div>
  )
}
