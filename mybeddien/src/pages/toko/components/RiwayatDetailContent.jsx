function formatRupiah(n) {
  if (n == null || Number.isNaN(Number(n))) return 'Rp 0'
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  }).format(Number(n))
}

function formatWaktu(raw) {
  if (!raw) return '—'
  const d = new Date(String(raw).replace(' ', 'T'))
  if (Number.isNaN(d.getTime())) return String(raw)
  return d.toLocaleString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * Isi detail transaksi (items) — dipakai panel desktop & offcanvas HP.
 */
export default function RiwayatDetailContent({ detail, loading, error }) {
  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center py-16">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4">
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
          {error}
        </p>
      </div>
    )
  }

  if (!detail) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-4 py-12 text-center">
        <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50 text-primary-600 dark:bg-primary-900/40 dark:text-primary-400">
          <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.75"
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
            />
          </svg>
        </div>
        <p className="text-sm font-medium text-gray-800 dark:text-gray-200">Pilih transaksi</p>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          Klik baris di kiri untuk melihat barang yang dibeli.
        </p>
      </div>
    )
  }

  const items = Array.isArray(detail.items) ? detail.items : []

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="shrink-0 space-y-1 border-b border-gray-100 px-4 py-3 dark:border-gray-700/80">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-primary-600 dark:text-primary-400">
          Detail pembelian
        </p>
        <h2 className="text-base font-semibold text-gray-900 dark:text-white">
          {detail.santri_nama || 'Pembeli'}
        </h2>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          NIS {detail.santri_nis || '—'} · {formatWaktu(detail.transaksi_at)}
        </p>
        <p className="pt-1 text-lg font-bold tabular-nums text-primary-600 dark:text-primary-400">
          {formatRupiah(detail.nominal)}
        </p>
        {detail.keterangan ? (
          <p className="text-[11px] text-gray-500 dark:text-gray-400">{detail.keterangan}</p>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 sm:p-4">
        {items.length === 0 ? (
          <p className="rounded-xl border border-dashed border-gray-300 px-3 py-6 text-center text-xs text-gray-500 dark:border-gray-600 dark:text-gray-400">
            Tidak ada rincian item (transaksi lama tanpa snapshot barang).
          </p>
        ) : (
          <ul className="space-y-2">
            {items.map((it) => (
              <li
                key={it.id}
                className="flex items-start justify-between gap-3 rounded-xl border border-gray-100 bg-gray-50/80 px-3 py-2.5 dark:border-gray-700 dark:bg-gray-900/40"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-gray-900 dark:text-white">
                    {it.nama_barang || '—'}
                  </p>
                  <p className="font-mono text-[11px] text-gray-500 dark:text-gray-400">
                    {it.kode_barang || '—'} · {formatRupiah(it.harga_satuan)} × {it.qty}
                  </p>
                </div>
                <p className="shrink-0 text-sm font-semibold tabular-nums text-gray-900 dark:text-white">
                  {formatRupiah(it.subtotal)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

export { formatRupiah, formatWaktu }
