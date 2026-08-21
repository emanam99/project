import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { pelanggaranAdminAPI } from '../../services/api'
import { useNotification } from '../../contexts/NotificationContext'
import { useDomisiliPelanggaranFiturAccess } from '../../hooks/useDomisiliPelanggaranFiturAccess'
import PelanggaranMasterFormOffcanvas, {
  badgeClassKategoriPelanggaran,
  labelKategoriPelanggaran,
} from './components/PelanggaranMasterFormOffcanvas'

const normalizeStatus = (s) => {
  const t = String(s || '').trim().toLowerCase()
  if (t === '1' || t === 'aktif' || t === 'true') return 'aktif'
  return 'nonaktif'
}

/** Halaman master jenis pelanggaran — `/domisili/pelanggaran/master`. */
function PelanggaranMaster() {
  const { showNotification } = useNotification()
  const { fiturReady, canLoadMasterList, canCreate, canEdit, canSetStatus } = useDomisiliPelanggaranFiturAccess()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [kategoriFilter, setKategoriFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('aktif')
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [isInputFocused, setIsInputFocused] = useState(false)
  const [offcanvasOpen, setOffcanvasOpen] = useState(false)
  const [editingRow, setEditingRow] = useState(null)

  const loadRows = useCallback(async () => {
    if (!canLoadMasterList) {
      setRows([])
      setLoading(false)
      return
    }
    try {
      setLoading(true)
      setError('')
      const res = await pelanggaranAdminAPI.getAll()
      if (res?.success) {
        setRows(Array.isArray(res.data) ? res.data : [])
      } else {
        setError(res?.message || 'Gagal memuat data')
        setRows([])
      }
    } catch (err) {
      setError(err?.response?.data?.message || 'Gagal memuat data')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [canLoadMasterList])

  useEffect(() => {
    if (!fiturReady) return
    loadRows()
  }, [fiturReady, loadRows])

  const kategoriOptions = useMemo(() => {
    const map = {}
    rows.forEach((r) => {
      const k = String(r?.kategori || '').trim()
      if (!k) return
      map[k] = (map[k] || 0) + 1
    })
    return Object.entries(map)
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => a.value.localeCompare(b.value, 'id', { sensitivity: 'base' }))
  }, [rows])

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return rows.filter((r) => {
      if (kategoriFilter && String(r?.kategori || '') !== kategoriFilter) return false
      if (statusFilter) {
        const st = normalizeStatus(r?.aktif) === 'aktif' ? 'aktif' : 'nonaktif'
        if (st !== statusFilter) return false
      }
      if (!q) return true
      return (
        String(r?.nama || '').toLowerCase().includes(q) ||
        String(r?.keterangan || '').toLowerCase().includes(q) ||
        String(r?.kategori || '').toLowerCase().includes(q)
      )
    })
  }, [rows, searchQuery, kategoriFilter, statusFilter])

  const openAdd = () => {
    if (!canCreate) return
    setEditingRow(null)
    setError('')
    setOffcanvasOpen(true)
  }

  const openEdit = (row) => {
    if (!canEdit) return
    setEditingRow(row)
    setError('')
    setOffcanvasOpen(true)
  }

  const handleToggleStatus = async (row) => {
    if (!canSetStatus) return
    const next = normalizeStatus(row?.aktif) === 'aktif' ? 0 : 1
    try {
      const res = await pelanggaranAdminAPI.setStatus(row.id, next === 1)
      if (res?.success) {
        showNotification(res?.message || 'Status diubah', 'success')
        await loadRows()
      } else {
        showNotification(res?.message || 'Gagal mengubah status', 'error')
      }
    } catch (_) {
      showNotification('Gagal mengubah status', 'error')
    }
  }

  if (!fiturReady) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600" />
      </div>
    )
  }

  if (!canLoadMasterList) {
    return (
      <div className="container mx-auto px-4 py-10 max-w-2xl">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-amber-900 dark:border-amber-800 dark:bg-amber-900/25 dark:text-amber-100">
          <h1 className="text-lg font-semibold">Master pelanggaran</h1>
          <p className="mt-2 text-sm">
            Anda tidak memiliki akses ke halaman ini. Minta administrator untuk menugaskan menu Domisili → Pelanggaran
            atau aksi «Pelanggaran · Akses halaman» pada peran Anda (Pengaturan → Fitur).
          </p>
          <Link to="/domisili/pelanggaran" className="inline-block mt-4 text-sm text-teal-700 dark:text-teal-300 underline">
            ← Kembali ke catatan pelanggaran
          </Link>
        </div>
      </div>
    )
  }

  if (loading && rows.length === 0) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600" />
      </div>
    )
  }

  return (
    <div className="h-full overflow-hidden flex flex-col">
      <div className="container mx-auto px-4 py-4 max-w-7xl flex-shrink-0">
        <div className="mb-3">
          <Link
            to="/domisili/pelanggaran"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-teal-300 dark:border-teal-700 text-teal-800 dark:text-teal-200 bg-teal-50 dark:bg-teal-900/30 hover:bg-teal-100"
          >
            ← Catatan pelanggaran
          </Link>
        </div>
        {error && !offcanvasOpen && (
          <div className="mb-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 mb-4">
          <div className="relative pb-2 px-4 pt-3">
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => setIsInputFocused(true)}
                onBlur={() => setIsInputFocused(false)}
                className="w-full p-2 pr-24 focus:outline-none bg-transparent dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400"
                placeholder="Cari nama, keterangan, atau kategori..."
              />
              <div className="absolute right-0 top-0 bottom-0 flex items-center gap-1 pr-1 pointer-events-none">
                <button
                  type="button"
                  onClick={() => setIsFilterOpen(!isFilterOpen)}
                  className="bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 p-1.5 rounded text-xs flex items-center gap-1 transition-colors pointer-events-auto"
                  title={isFilterOpen ? 'Sembunyikan filter' : 'Filter'}
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
                  className="bg-blue-100 hover:bg-blue-200 dark:bg-blue-700 dark:hover:bg-blue-600 text-blue-700 dark:text-blue-300 p-1.5 rounded text-xs transition-colors pointer-events-auto"
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
            <div className="absolute left-0 right-0 bottom-0 h-0.5 bg-gray-300 dark:bg-gray-600" />
            <div
              className={`absolute left-0 right-0 bottom-0 h-0.5 bg-teal-500 transition-opacity ${
                isInputFocused ? 'opacity-100' : 'opacity-0'
              }`}
            />
          </div>

          <AnimatePresence>
            {isFilterOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden border-t bg-gray-50 dark:bg-gray-700/50"
              >
                <div className="px-4 py-2 flex flex-wrap gap-2">
                  <select
                    value={kategoriFilter}
                    onChange={(e) => setKategoriFilter(e.target.value)}
                    className="border rounded p-1.5 h-8 text-xs bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600"
                  >
                    <option value="">Semua kategori</option>
                    {kategoriOptions.map((o) => (
                      <option key={o.value} value={o.value}>
                        {labelKategoriPelanggaran(o.value)} ({o.count})
                      </option>
                    ))}
                  </select>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="border rounded p-1.5 h-8 text-xs bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600"
                  >
                    <option value="">Semua status</option>
                    <option value="aktif">Aktif</option>
                    <option value="nonaktif">Nonaktif</option>
                  </select>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="px-4 py-2 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
            <span className="text-sm text-gray-600 dark:text-gray-400">
              Total: <span className="font-semibold text-gray-800 dark:text-gray-200">{filteredRows.length}</span>
            </span>
            {canCreate ? (
              <button
                type="button"
                onClick={openAdd}
                className="px-3 py-1.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors flex items-center gap-1.5 text-sm"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                </svg>
                Tambah
              </button>
            ) : (
              <span className="text-xs text-gray-500 dark:text-gray-400">Tanpa akses tambah</span>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="container mx-auto px-4 pb-6 max-w-7xl">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
            {filteredRows.length === 0 ? (
              <div className="p-8 text-center text-gray-500 dark:text-gray-400">Tidak ada data yang cocok</div>
            ) : (
              <div className="divide-y divide-gray-200 dark:divide-gray-700">
                {filteredRows.map((row, index) => (
                  <motion.div
                    key={row.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2, delay: index * 0.02 }}
                    className="p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <button
                        type="button"
                        disabled={!canEdit}
                        onClick={() => openEdit(row)}
                        className={`text-left flex-1 min-w-0 ${canEdit ? 'hover:opacity-80' : 'cursor-default opacity-70'}`}
                      >
                        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{row.nama}</h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                          urutan {row.urutan ?? 0}
                        </p>
                        {row.keterangan ? (
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
                            {String(row.keterangan).replace(/\s*<!--ppsa-seed-->\s*/g, '').trim()}
                          </p>
                        ) : null}
                      </button>
                      <div className="flex flex-col items-end gap-2 shrink-0">
                        <span
                          className={`px-2.5 py-1 rounded-md text-xs font-medium ${badgeClassKategoriPelanggaran(row.kategori)}`}
                        >
                          {labelKategoriPelanggaran(row.kategori)}
                        </span>
                        {canSetStatus ? (
                          <button
                            type="button"
                            onClick={() => handleToggleStatus(row)}
                            className="px-2.5 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
                          >
                            {normalizeStatus(row.aktif) === 'aktif' ? 'Nonaktifkan' : 'Aktifkan'}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
          <div className="h-20 sm:h-0" aria-hidden="true" />
        </div>
      </div>

      <PelanggaranMasterFormOffcanvas
        isOpen={offcanvasOpen}
        onClose={() => {
          setOffcanvasOpen(false)
          setEditingRow(null)
        }}
        editingRow={editingRow}
        onSaved={() => loadRows()}
      />
    </div>
  )
}

export default PelanggaranMaster
