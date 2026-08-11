import { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuthStore } from '../../../store/authStore'
import { useOffcanvasBackClose } from '../../../hooks/useOffcanvasBackClose'
import {
  countLocalBarang,
  subscribeBarangList,
  syncBarangCache,
} from '../../../services/barangIndexedDb'

const RESULT_LIMIT = 60

function formatRupiah(n) {
  if (n == null || Number.isNaN(Number(n))) return 'Rp 0'
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n)
}

/**
 * Offcanvas cari barang — data dari IndexedDB, sync API di latar tanpa spinner.
 */
export default function CariBarangOffcanvas({ isOpen, onClose, onSelect }) {
  const handleClose = useOffcanvasBackClose(isOpen, onClose)
  const tokoId = useAuthStore((s) => s.user?.toko_id)
  const pedagangId = Number(tokoId) > 0 ? Number(tokoId) : 0

  const [list, setList] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [bootstrapping, setBootstrapping] = useState(false)
  const [syncingQuiet, setSyncingQuiet] = useState(false)
  const [displayCount, setDisplayCount] = useState(RESULT_LIMIT)

  // Live subscribe IndexedDB
  useEffect(() => {
    if (!pedagangId) {
      setList([])
      return undefined
    }
    const sub = subscribeBarangList(pedagangId, setList)
    return () => sub.unsubscribe()
  }, [pedagangId])

  // Saat dibuka: tampil lokal; sync latar; spinner hanya jika cache kosong
  useEffect(() => {
    if (!isOpen || !pedagangId) return
    setSearchQuery('')
    setDisplayCount(RESULT_LIMIT)
    let cancelled = false

    ;(async () => {
      const n = await countLocalBarang(pedagangId)
      if (cancelled) return
      if (n === 0) setBootstrapping(true)
      setSyncingQuiet(true)
      await syncBarangCache(pedagangId)
      if (cancelled) return
      setBootstrapping(false)
      setSyncingQuiet(false)
    })()

    return () => {
      cancelled = true
    }
  }, [isOpen, pedagangId])

  useEffect(() => {
    if (!isOpen) return undefined
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  const filteredList = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return list
    return list.filter((b) => {
      const nama = String(b.nama_barang || '').toLowerCase()
      const kode = String(b.kode_barang || '').toLowerCase()
      return nama.includes(q) || kode.includes(q)
    })
  }, [list, searchQuery])

  const visibleList = useMemo(
    () => filteredList.slice(0, displayCount),
    [filteredList, displayCount]
  )

  const handleSearch = (e) => {
    e.preventDefault()
    // Filter lokal saja — tidak hit API
  }

  const handleSelect = (b) => {
    onSelect?.(b)
    handleClose()
  }

  return createPortal(
    <AnimatePresence>
      {isOpen ? (
        <>
          <motion.div
            key="cari-barang-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={handleClose}
            className="fixed inset-0 z-120 bg-black/50"
            aria-hidden="true"
          />
          <motion.div
            key="cari-barang-panel"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'tween', duration: 0.32, ease: [0.25, 0.1, 0.25, 1] }}
            className="fixed inset-y-0 left-4 right-4 z-130 mx-auto flex w-full max-w-md flex-col overflow-hidden rounded-l-2xl bg-white shadow-xl dark:bg-gray-900 dark:shadow-black/40 sm:left-auto sm:right-0 sm:mx-0 sm:w-[28rem]"
          >
            <div className="shrink-0 border-b border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900 sm:p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="text-base font-semibold text-primary-600 dark:text-primary-400">Cari Barang</h2>
                  {syncingQuiet && !bootstrapping ? (
                    <p className="text-[10px] text-gray-400 dark:text-gray-500">Memperbarui…</p>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={handleClose}
                  className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
                  aria-label="Tutup"
                >
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <form onSubmit={handleSearch} className="flex gap-2">
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value)
                    setDisplayCount(RESULT_LIMIT)
                  }}
                  placeholder="Nama atau kode / barcode…"
                  autoFocus
                  className="min-w-0 flex-1 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 outline-none placeholder:text-gray-400 focus:border-primary-400 focus:ring-2 focus:ring-primary-500/30 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:placeholder:text-gray-500 dark:focus:border-primary-500"
                />
              </form>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-white dark:bg-gray-900">
              {bootstrapping ? (
                <div className="flex justify-center py-12">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
                </div>
              ) : visibleList.length === 0 ? (
                <p className="px-4 py-10 text-center text-sm text-gray-500 dark:text-gray-400">
                  {searchQuery.trim() ? 'Tidak ada barang yang cocok.' : 'Belum ada barang.'}
                </p>
              ) : (
                <ul className="divide-y divide-gray-100 dark:divide-gray-700/80">
                  {visibleList.map((b) => {
                    const stok = Number(b.stok ?? 0)
                    const habis = stok <= 0
                    return (
                      <li key={b.id}>
                        <button
                          type="button"
                          disabled={habis}
                          onClick={() => handleSelect(b)}
                          className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-45 dark:hover:bg-gray-800/80"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
                              {b.nama_barang}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              {b.kode_barang || '—'} · Stok {stok}
                            </p>
                          </div>
                          <span className="shrink-0 text-sm font-semibold tabular-nums text-primary-700 dark:text-primary-300">
                            {formatRupiah(b.harga)}
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
              {!bootstrapping && filteredList.length > displayCount ? (
                <div className="border-t border-gray-100 p-3 dark:border-gray-700/80">
                  <button
                    type="button"
                    onClick={() => setDisplayCount((n) => n + RESULT_LIMIT)}
                    className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 text-sm text-gray-600 hover:bg-gray-100 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                  >
                    Tampilkan lebih banyak ({filteredList.length - displayCount} lagi)
                  </button>
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
