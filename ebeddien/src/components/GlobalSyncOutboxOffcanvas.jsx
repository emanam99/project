import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { liveQuery } from 'dexie'
import { ijinOutboxDb } from '../services/ijinOutbox/ijinOutboxDb'
import { drainSyncOutbox, isNavigatorOnline, resendOutboxItem } from '../services/ijinOutbox/ijinOutboxService'

const OP_LABEL = {
  create: 'Tambah',
  update: 'Ubah',
  delete: 'Hapus',
  markKembali: 'Kembali'
}

const ENTITY_LABEL = {
  ijin: 'Ijin',
  boyong: 'Boyong'
}

function labelEntity(entity) {
  if (!entity) return ''
  return ENTITY_LABEL[entity] || entity
}

/**
 * Panel antrean sinkron global: menampilkan semua jenis aksi terjadwal (modul apapun) ke server.
 */
export default function GlobalSyncOutboxOffcanvas({ isOpen, onClose }) {
  const [rows, setRows] = useState([])
  const [online, setOnline] = useState(() => isNavigatorOnline())

  const [resending, setResending] = useState(/** @type {number | null} */ (null))

  useEffect(() => {
    const sync = () => setOnline(isNavigatorOnline())
    globalThis.addEventListener?.('online', sync)
    globalThis.addEventListener?.('offline', sync)
    return () => {
      globalThis.removeEventListener?.('online', sync)
      globalThis.removeEventListener?.('offline', sync)
    }
  }, [])

  useEffect(() => {
    if (!isOpen) return
    const sub = liveQuery(() => ijinOutboxDb.outbox.orderBy('createdAt').reverse().toArray()).subscribe(
      {
        next: (list) => {
          setRows(Array.isArray(list) ? list : [])
        },
        error: () => setRows([])
      }
    )
    return () => {
      if (sub && typeof sub.unsubscribe === 'function') {
        sub.unsubscribe()
      }
    }
  }, [isOpen])

  const onResend = async (id) => {
    if (!online) return
    setResending(id)
    try {
      await resendOutboxItem(id)
    } finally {
      setResending(null)
    }
  }

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.button
            type="button"
            className="fixed inset-0 z-[140] bg-black/40 dark:bg-black/50 backdrop-blur-sm"
            aria-label="Tutup"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          />
          <motion.aside
            className="fixed z-[150] right-0 top-0 h-full w-full max-w-sm flex flex-col bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-700 shadow-2xl"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 32, stiffness: 360 }}
          >
            <div className="shrink-0 px-4 py-3 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between gap-2 bg-slate-50/90 dark:bg-slate-800/80">
              <div className="min-w-0 flex-1">
                <div className="flex items-center flex-wrap gap-2">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Antrean sinkron</h3>
                  <span
                    className={`shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                      online
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200'
                        : 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200'
                    }`}
                    title={online ? 'Terhubung ke jaringan' : 'Tidak terhubung; sinkron saat kembali online'}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${online ? 'bg-emerald-500 dark:bg-emerald-400' : 'bg-amber-500 dark:bg-amber-400'}`}
                      aria-hidden
                    />
                    {online ? 'Online' : 'Offline'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  {online
                    ? 'Belum tersinkron ke server — menampilkan semua modul'
                    : 'Akan dikirim saat koneksi tersedia'}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="p-2 rounded-lg text-slate-500 hover:bg-slate-200/80 dark:hover:bg-slate-600/50"
                aria-label="Tutup panel"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2">
              {rows.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-8">Tidak ada aksi menunggu.</p>
              ) : (
                rows.map((r) => (
                  <div
                    key={r.id}
                    className="rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800/50 p-3 text-left shadow-sm"
                  >
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center flex-wrap gap-1.5">
                          {r.entity && (
                            <span className="text-[10px] font-medium text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-700/60 px-1.5 py-0.5 rounded">
                              {labelEntity(r.entity)}
                            </span>
                          )}
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-900/30 px-1.5 py-0.5 rounded">
                            {OP_LABEL[r.op] || r.op}
                          </span>
                          {r.status === 'failed' && (
                            <span className="text-[10px] text-red-600 dark:text-red-400">Gagal</span>
                          )}
                        </div>
                        <p className="text-sm text-slate-800 dark:text-slate-200 mt-1 line-clamp-2">{r.label}</p>
                        {r.error && (
                          <p className="text-[11px] text-red-500 dark:text-red-400 mt-1 break-words">{r.error}</p>
                        )}
                      </div>
                      {r.status !== 'sending' && (r.status === 'pending' || r.status === 'failed') && (
                        <button
                          type="button"
                          onClick={() => onResend(r.id)}
                          disabled={!online || resending === r.id}
                          className="shrink-0 p-2 rounded-lg text-teal-600 hover:bg-teal-50 dark:hover:bg-teal-900/30 disabled:opacity-40"
                          title="Kirim ulang"
                        >
                          {resending === r.id ? (
                            <span className="block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth="2"
                                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                              />
                            </svg>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="shrink-0 p-3 border-t border-slate-200 dark:border-slate-700">
              <button
                type="button"
                disabled={!online}
                onClick={() => void drainSyncOutbox()}
                className="w-full py-2 rounded-lg text-sm font-medium bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50"
              >
                {online ? 'Coba kirim semua sekarang' : 'Tunggu sambil online...'}
              </button>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>,
    document.body
  )
}
