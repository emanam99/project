import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { tarbiyahDomisiliSantriAPI } from '../../../services/api'
import { useOffcanvasBackClose } from '../../../hooks/useOffcanvasBackClose'
import { useDomisiliPelanggaranFiturAccess } from '../../../hooks/useDomisiliPelanggaranFiturAccess'
import PelanggaranMasterFormOffcanvas, {
  PELANGGARAN_KATEGORI_OPTIONS,
  badgeClassKategoriPelanggaran,
  labelKategoriPelanggaran,
} from './PelanggaranMasterFormOffcanvas'

/**
 * Offcanvas pilih jenis pelanggaran (cari + filter kategori), mirip SearchOffcanvas.
 * @param {{ isOpen: boolean, onClose: () => void, onSelect: (item: object) => void, zIndex?: number }} props
 */
export default function PelanggaranJenisOffcanvas({ isOpen, onClose, onSelect, zIndex = 210 }) {
  const { canCreate } = useDomisiliPelanggaranFiturAccess()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [kategoriFilter, setKategoriFilter] = useState('')
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [masterFormOpen, setMasterFormOpen] = useState(false)

  const handleClose = useOffcanvasBackClose(isOpen, () => {
    if (masterFormOpen) return
    onClose?.()
  })

  const loadRows = useCallback(async () => {
    try {
      setLoading(true)
      setError('')
      const res = await tarbiyahDomisiliSantriAPI.getPelanggaranMaster(
        kategoriFilter ? { kategori: kategoriFilter } : {}
      )
      if (res?.success) {
        setRows(Array.isArray(res.data) ? res.data : [])
      } else {
        setRows([])
        setError(res?.message || 'Gagal memuat jenis pelanggaran')
      }
    } catch (err) {
      setRows([])
      setError(err?.response?.data?.message || 'Gagal memuat jenis pelanggaran')
    } finally {
      setLoading(false)
    }
  }, [kategoriFilter])

  useEffect(() => {
    if (!isOpen) return
    setSearchQuery('')
    loadRows()
  }, [isOpen, loadRows])

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return rows.filter((r) => {
      if (kategoriFilter && String(r?.kategori || '') !== kategoriFilter) return false
      if (!q) return true
      return (
        String(r?.nama || '').toLowerCase().includes(q) ||
        String(r?.keterangan || '').toLowerCase().includes(q) ||
        String(r?.kategori || '').toLowerCase().includes(q)
      )
    })
  }, [rows, searchQuery, kategoriFilter])

  const handlePick = (item) => {
    onSelect?.(item)
    onClose?.()
  }

  if (typeof document === 'undefined') return null

  return (
    <>
      {createPortal(
        <AnimatePresence>
          {isOpen && (
            <>
              <motion.div
                key="pelanggaran-jenis-backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => handleClose()}
                className="fixed inset-0 bg-black/50"
                style={{ zIndex }}
              />
              <motion.div
                key="pelanggaran-jenis-panel"
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'tween', duration: 0.2 }}
                className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-white dark:bg-gray-800 shadow-xl flex flex-col"
                style={{ zIndex: zIndex + 1 }}
              >
                <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between gap-2">
                  <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">Pilih pelanggaran</h3>
                  <button
                    type="button"
                    onClick={() => handleClose()}
                    className="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                <div className="px-4 pt-3 pb-2 border-b border-gray-100 dark:border-gray-700/80 space-y-2">
                  <div className="relative">
                    <input
                      type="search"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Cari nama pelanggaran…"
                      className="w-full p-2 pr-20 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm dark:text-gray-100"
                    />
                    <div className="absolute right-1 top-1 bottom-1 flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setIsFilterOpen((v) => !v)}
                        className="p-1.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300"
                        title="Filter"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
                          />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={() => loadRows()}
                        className="p-1.5 rounded bg-blue-100 dark:bg-blue-800 text-blue-700 dark:text-blue-200"
                        title="Refresh"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                          />
                        </svg>
                      </button>
                    </div>
                  </div>
                  <AnimatePresence>
                    {isFilterOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                      >
                        <select
                          value={kategoriFilter}
                          onChange={(e) => setKategoriFilter(e.target.value)}
                          className="w-full border rounded-lg p-2 text-xs bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600"
                        >
                          <option value="">Semua kategori</option>
                          {PELANGGARAN_KATEGORI_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </motion.div>
                    )}
                  </AnimatePresence>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {filtered.length} jenis
                    </span>
                    {canCreate ? (
                      <button
                        type="button"
                        onClick={() => setMasterFormOpen(true)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-teal-600 text-white hover:bg-teal-700"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                        </svg>
                        Tambah pelanggaran baru
                      </button>
                    ) : null}
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto">
                  {loading ? (
                    <div className="flex justify-center py-12">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600" />
                    </div>
                  ) : error ? (
                    <p className="p-4 text-sm text-red-600 dark:text-red-400">{error}</p>
                  ) : filtered.length === 0 ? (
                    <div className="p-6 text-center space-y-3">
                      <p className="text-sm text-gray-500 dark:text-gray-400">Tidak ada jenis pelanggaran.</p>
                      {canCreate ? (
                        <button
                          type="button"
                          onClick={() => setMasterFormOpen(true)}
                          className="px-3 py-2 text-sm rounded-lg bg-teal-600 text-white hover:bg-teal-700"
                        >
                          Tambah pelanggaran baru
                        </button>
                      ) : null}
                    </div>
                  ) : (
                    <ul className="divide-y divide-gray-100 dark:divide-gray-700/80">
                      {filtered.map((row) => (
                        <li key={row.id}>
                          <button
                            type="button"
                            onClick={() => handlePick(row)}
                            className="w-full text-left px-4 py-3 hover:bg-teal-50 dark:hover:bg-teal-900/20 transition-colors"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{row.nama}</p>
                                {row.keterangan ? (
                                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
                                    {String(row.keterangan).replace(/\s*<!--ppsa-seed-->\s*/g, '').trim()}
                                  </p>
                                ) : null}
                              </div>
                              <span
                                className={`shrink-0 px-2 py-0.5 rounded-md text-[11px] font-medium ${badgeClassKategoriPelanggaran(row.kategori)}`}
                              >
                                {labelKategoriPelanggaran(row.kategori)}
                              </span>
                            </div>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>,
        document.body
      )}

      <PelanggaranMasterFormOffcanvas
        isOpen={masterFormOpen}
        onClose={() => setMasterFormOpen(false)}
        editingRow={null}
        zIndex={zIndex + 20}
        onSaved={() => {
          setMasterFormOpen(false)
          loadRows()
        }}
      />
    </>
  )
}
