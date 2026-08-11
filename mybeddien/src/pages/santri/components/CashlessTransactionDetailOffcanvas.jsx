import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useOffcanvasBackClose } from '../../../hooks/useOffcanvasBackClose'
import {
  formatSaldo,
  formatWaktu,
  getHistoryBadge,
  resolveActorLabel,
} from './CashlessFormat'

/**
 * Offcanvas kanan: detail transaksi cashless (top-up / belanja / dll).
 */
export default function CashlessTransactionDetailOffcanvas({
  isOpen,
  onClose,
  detail,
  loading,
  error,
}) {
  const handleClose = useOffcanvasBackClose(isOpen, onClose)

  const badge = detail ? getHistoryBadge(detail) : null
  const isOut = detail?.direction === 'out'
  const amount = Math.abs(Number(detail?.nominal) || 0)
  const purchase = detail?.purchase
  const items = Array.isArray(purchase?.items) ? purchase.items : []
  const actorLabel = detail ? resolveActorLabel(detail) : null

  return createPortal(
    <AnimatePresence>
      {isOpen ? (
        <>
          <motion.button
            key="cashless-tx-backdrop"
            type="button"
            aria-label="Tutup"
            className="fixed inset-0 z-[80] bg-black/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
          />
          <motion.div
            key="cashless-tx-panel"
            role="dialog"
            aria-modal="true"
            className="fixed inset-y-0 right-0 z-[90] flex w-full max-w-md flex-col bg-white shadow-xl dark:bg-gray-900"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
          >
            <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-700">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">Detail transaksi</h2>
              <button
                type="button"
                onClick={handleClose}
                className="rounded-lg px-2 py-1 text-sm text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                Tutup
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
              {loading ? (
                <div className="flex justify-center py-16">
                  <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
                </div>
              ) : error ? (
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
                  {error}
                </p>
              ) : detail ? (
                <div className="space-y-4">
                  <div className="rounded-xl border border-gray-200 bg-gray-50/80 p-3 dark:border-gray-700 dark:bg-gray-800/60">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        {badge ? (
                          <span
                            className="inline-block rounded px-2 py-0.5 text-[10px] font-semibold text-white"
                            style={{ background: badge.bg }}
                          >
                            {badge.label}
                          </span>
                        ) : null}
                        <p className="mt-1.5 text-sm font-semibold text-gray-900 dark:text-white">
                          {detail.label || detail.journal_type || 'Transaksi'}
                        </p>
                        <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">
                          {formatWaktu(detail.created_at)}
                        </p>
                      </div>
                      <p
                        className={`shrink-0 text-lg font-bold tabular-nums ${
                          isOut
                            ? 'text-orange-700 dark:text-orange-400'
                            : 'text-primary-700 dark:text-primary-400'
                        }`}
                      >
                        {isOut ? '−' : '+'} Rp {formatSaldo(amount)}
                      </p>
                    </div>
                    {detail.description ? (
                      <p className="mt-2 text-xs text-gray-600 dark:text-gray-300">{detail.description}</p>
                    ) : null}
                  </div>

                  {detail.journal_type === 'PURCHASE' || purchase ? (
                    <div className="space-y-3">
                      <div className="rounded-xl border border-gray-200 p-3 dark:border-gray-700">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                          Warung / toko
                        </p>
                        <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">
                          {purchase?.toko_nama || '—'}
                        </p>
                        {purchase?.toko_kode ? (
                          <p className="font-mono text-[11px] text-gray-500">Kode {purchase.toko_kode}</p>
                        ) : null}
                        {purchase?.keterangan ? (
                          <p className="mt-1 text-xs text-gray-500">{purchase.keterangan}</p>
                        ) : null}
                      </div>

                      <div>
                        <p className="mb-2 text-sm font-semibold text-gray-900 dark:text-white">
                          Barang dibeli
                        </p>
                        {items.length === 0 ? (
                          <p className="rounded-lg border border-dashed border-gray-300 px-3 py-4 text-center text-xs text-gray-500 dark:border-gray-600">
                            Rincian barang tidak tersedia.
                          </p>
                        ) : (
                          <ul className="space-y-2">
                            {items.map((it) => (
                              <li
                                key={it.id}
                                className="flex items-start justify-between gap-3 rounded-xl border border-gray-100 bg-gray-50/80 px-3 py-2.5 dark:border-gray-700 dark:bg-gray-800/50"
                              >
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-medium text-gray-900 dark:text-white">
                                    {it.nama_barang || '—'}
                                  </p>
                                  <p className="font-mono text-[11px] text-gray-500">
                                    {it.kode_barang || '—'} · Rp {formatSaldo(it.harga_satuan)} × {it.qty}
                                  </p>
                                </div>
                                <p className="shrink-0 text-sm font-semibold tabular-nums text-gray-900 dark:text-white">
                                  Rp {formatSaldo(it.subtotal)}
                                </p>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  ) : null}

                  {detail.journal_type === 'TOPUP' || detail.channel === 'gateway' ? (
                    <div className="rounded-xl border border-gray-200 p-3 dark:border-gray-700 space-y-2">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                        Detail top-up
                      </p>
                      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
                        <dt className="text-gray-500">Metode</dt>
                        <dd className="text-right font-medium text-gray-900 dark:text-white">
                          {detail.metode_label ||
                            (detail.channel === 'gateway' ? 'iPayMu' : detail.metode || '—')}
                        </dd>
                        <dt className="text-gray-500">Channel</dt>
                        <dd className="text-right font-medium text-gray-900 dark:text-white">
                          {detail.channel || '—'}
                        </dd>
                        {actorLabel ? (
                          <>
                            <dt className="text-gray-500">Oleh</dt>
                            <dd className="text-right font-medium text-gray-900 dark:text-white">
                              {actorLabel}
                            </dd>
                          </>
                        ) : null}
                        {detail.referensi ? (
                          <>
                            <dt className="text-gray-500">Catatan</dt>
                            <dd className="text-right text-gray-900 dark:text-white">{detail.referensi}</dd>
                          </>
                        ) : null}
                      </dl>
                    </div>
                  ) : null}

                  <div className="rounded-xl border border-gray-100 bg-gray-50/50 p-3 dark:border-gray-700 dark:bg-gray-800/40">
                    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-[11px]">
                      {detail.reference ? (
                        <>
                          <dt className="text-gray-500">Referensi</dt>
                          <dd className="break-all text-right font-mono text-gray-700 dark:text-gray-300">
                            {detail.reference}
                          </dd>
                        </>
                      ) : null}
                      <dt className="text-gray-500">ID jurnal</dt>
                      <dd className="text-right font-mono text-gray-700 dark:text-gray-300">
                        #{detail.journal_id}
                      </dd>
                    </dl>
                  </div>
                </div>
              ) : null}
            </div>
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>,
    document.body
  )
}
