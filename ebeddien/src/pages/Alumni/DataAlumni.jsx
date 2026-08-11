import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { alumniAPI } from '../../services/api'
import { useOffcanvasBackClose } from '../../hooks/useOffcanvasBackClose'
import { useAlumniFiturAccess } from '../../hooks/useAlumniFiturAccess'
import { useNotification } from '../../contexts/NotificationContext'
import DetailAlumniOffcanvas from './components/DetailAlumniOffcanvas'
import EditAlumniOffcanvas from './components/EditAlumniOffcanvas'

const ALUMNI_DETAIL_STATE = Object.freeze({ ebOffcanvas: 'data_alumni_detail' })
const ALUMNI_EDIT_STATE = Object.freeze({ ebOffcanvas: 'data_alumni_edit' })

/** Preset sortir list alumni */
const SORT_OPTIONS = [
  { key: 'nama_asc', label: 'Sesuai nama (A–Z)', sort: 'nama', dir: 'asc' },
  { key: 'nama_desc', label: 'Sesuai nama (Z–A)', sort: 'nama', dir: 'desc' },
  { key: 'masuk_desc', label: 'Tanggal masuk (terbaru)', sort: 'tahun_masuk_masehi', dir: 'desc' },
  { key: 'masuk_asc', label: 'Tanggal masuk (terlama)', sort: 'tahun_masuk_masehi', dir: 'asc' },
  { key: 'boyong_desc', label: 'Tanggal boyong (terbaru)', sort: 'tahun_boyong_masehi', dir: 'desc' },
  { key: 'boyong_asc', label: 'Tanggal boyong (terlama)', sort: 'tahun_boyong_masehi', dir: 'asc' },
]

const VIEW_MODE_KEY = 'eb_alumni_list_view'

function readAlumniViewMode() {
  try {
    const v = localStorage.getItem(VIEW_MODE_KEY)
    return v === 'minimal' ? 'minimal' : 'full'
  } catch {
    return 'full'
  }
}

function genderShort(g) {
  if (g === 'L' || g === 'l' || String(g).toLowerCase() === 'laki-laki') return 'L'
  if (g === 'P' || g === 'p' || String(g).toLowerCase() === 'perempuan') return 'P'
  return g || '-'
}

function wilayahLine(row) {
  return [row.dusun, row.desa, row.kecamatan, row.kabupaten].filter(Boolean).join(' · ') || 'Alamat belum lengkap'
}

function DataAlumni() {
  const { showNotification } = useNotification()
  const { canView, canEdit, canDelete, canToggleStatus } = useAlumniFiturAccess()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [items, setItems] = useState([])
  const [kabupatenOptions, setKabupatenOptions] = useState([])
  const [kecamatanOptions, setKecamatanOptions] = useState([])
  const [desaOptions, setDesaOptions] = useState([])
  const [dusunOptions, setDusunOptions] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [kabupatenFilter, setKabupatenFilter] = useState('')
  const [kecamatanFilter, setKecamatanFilter] = useState('')
  const [desaFilter, setDesaFilter] = useState('')
  const [dusunFilter, setDusunFilter] = useState('')
  const [sortKey, setSortKey] = useState('nama_asc')
  const [viewMode, setViewMode] = useState(readAlumniViewMode)
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(40)
  const [pagination, setPagination] = useState({ page: 1, limit: 40, total: 0, total_pages: 1 })

  const [detailRow, setDetailRow] = useState(null)
  const [editRow, setEditRow] = useState(null)
  const [statusBusy, setStatusBusy] = useState(false)
  const [deleteBusy, setDeleteBusy] = useState(false)

  const sortPreset = SORT_OPTIONS.find((o) => o.key === sortKey) || SORT_OPTIONS[0]

  const closeDetail = useOffcanvasBackClose(!!detailRow && !editRow, () => setDetailRow(null), {
    state: ALUMNI_DETAIL_STATE,
  })
  const closeEdit = useOffcanvasBackClose(!!editRow, () => setEditRow(null), {
    state: ALUMNI_EDIT_STATE,
  })

  const loadData = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await alumniAPI.list({
        q: searchQuery || undefined,
        status: statusFilter || undefined,
        kabupaten: kabupatenFilter || undefined,
        kecamatan: kecamatanFilter || undefined,
        desa: desaFilter || undefined,
        dusun: dusunFilter || undefined,
        page,
        limit,
        sort: sortPreset.sort,
        dir: sortPreset.dir,
      })
      if (res?.success) {
        const data = res.data || {}
        setItems(Array.isArray(data.items) ? data.items : [])
        setPagination(data.pagination || { page: 1, limit, total: 0, total_pages: 1 })
        const filters = data.filters || {}
        setKabupatenOptions(Array.isArray(filters.kabupaten) ? filters.kabupaten : [])
        setKecamatanOptions(Array.isArray(filters.kecamatan) ? filters.kecamatan : [])
        setDesaOptions(Array.isArray(filters.desa) ? filters.desa : [])
        setDusunOptions(Array.isArray(filters.dusun) ? filters.dusun : [])
      } else {
        setError(res?.message || 'Gagal memuat data alumni')
        setItems([])
      }
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Gagal memuat data alumni')
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [
    searchQuery,
    statusFilter,
    kabupatenFilter,
    kecamatanFilter,
    desaFilter,
    dusunFilter,
    page,
    limit,
    sortPreset.sort,
    sortPreset.dir,
  ])

  useEffect(() => {
    if (!canView) return
    loadData()
  }, [canView, loadData])

  useEffect(() => {
    const t = setTimeout(() => {
      setSearchQuery(searchInput.trim())
      setPage(1)
    }, 350)
    return () => clearTimeout(t)
  }, [searchInput])

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_MODE_KEY, viewMode)
    } catch {
      /* ignore */
    }
  }, [viewMode])

  const activeFilterCount = [statusFilter, kabupatenFilter, kecamatanFilter, desaFilter, dusunFilter].filter(
    Boolean
  ).length

  const resetWilayahBelow = (level) => {
    if (level === 'kabupaten') {
      setKecamatanFilter('')
      setDesaFilter('')
      setDusunFilter('')
    } else if (level === 'kecamatan') {
      setDesaFilter('')
      setDusunFilter('')
    } else if (level === 'desa') {
      setDusunFilter('')
    }
  }

  const resetAllFilters = () => {
    setStatusFilter('')
    setKabupatenFilter('')
    setKecamatanFilter('')
    setDesaFilter('')
    setDusunFilter('')
    setPage(1)
  }

  const openDetail = (row) => setDetailRow(row)

  const patchLocalRow = (updated) => {
    if (!updated?.id) return
    setItems((prev) => prev.map((r) => (r.id === updated.id ? { ...r, ...updated } : r)))
    setDetailRow((prev) => (prev?.id === updated.id ? { ...prev, ...updated } : prev))
  }

  const handleToggleStatus = async (nextStatus) => {
    if (!detailRow?.id || !canToggleStatus) return
    setStatusBusy(true)
    try {
      const res = await alumniAPI.updateStatus(detailRow.id, nextStatus)
      if (res?.success) {
        showNotification(res.message || 'Status diperbarui', 'success')
        patchLocalRow(res.data)
      } else {
        showNotification(res?.message || 'Gagal mengubah status', 'error')
      }
    } catch (err) {
      showNotification(err?.response?.data?.message || 'Gagal mengubah status', 'error')
    } finally {
      setStatusBusy(false)
    }
  }

  const handleDelete = async () => {
    if (!detailRow?.id || !canDelete) return
    const ok = window.confirm(`Hapus alumni «${detailRow.nama || detailRow.id_alumni}»? Tindakan ini tidak dapat dibatalkan.`)
    if (!ok) return
    setDeleteBusy(true)
    try {
      const res = await alumniAPI.delete(detailRow.id)
      if (res?.success) {
        showNotification(res.message || 'Alumni dihapus', 'success')
        setDetailRow(null)
        loadData()
      } else {
        showNotification(res?.message || 'Gagal menghapus', 'error')
      }
    } catch (err) {
      showNotification(err?.response?.data?.message || 'Gagal menghapus', 'error')
    } finally {
      setDeleteBusy(false)
    }
  }

  const hasActiveFilter = activeFilterCount > 0
  const totalPages = Math.max(1, pagination.total_pages || 1)

  if (!canView) {
    return (
      <div className="p-6 text-center text-gray-500 dark:text-gray-400">
        Anda tidak memiliki akses ke Data Alumni.
      </div>
    )
  }

  return (
    <div className="h-full overflow-hidden" style={{ minHeight: 0 }}>
      <div className="h-full overflow-y-auto page-content-scroll" style={{ minHeight: 0 }}>
        <div className="max-w-7xl mx-auto px-3 sm:px-6 py-4 sm:py-6">
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
            {/* Search + filter */}
            <div className="sticky top-0 z-20 -mx-3 sm:mx-0 px-3 sm:px-0 py-2 bg-gray-50/95 dark:bg-gray-900/95 backdrop-blur supports-[backdrop-filter]:bg-gray-50/80 dark:supports-[backdrop-filter]:bg-gray-900/80">
              <div className="flex items-center gap-2">
                <div className="relative flex-1 min-w-0">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input
                    type="search"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    placeholder="Cari nama, NIK, ID, wilayah…"
                    className="w-full h-11 pl-10 pr-3 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-teal-500/40 focus:border-teal-500 outline-none"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setIsFilterOpen((o) => !o)}
                  className={`inline-flex items-center justify-center gap-1 h-11 px-3 rounded-2xl border text-sm font-medium transition-colors ${
                    isFilterOpen || hasActiveFilter
                      ? 'border-teal-500 bg-teal-50 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300 dark:border-teal-600'
                      : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300'
                  }`}
                  aria-expanded={isFilterOpen}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                  </svg>
                  <span className="hidden sm:inline">Filter</span>
                  {hasActiveFilter ? (
                    <span className="w-1.5 h-1.5 rounded-full bg-teal-500" />
                  ) : null}
                </button>
                <button
                  type="button"
                  onClick={() => loadData()}
                  className="inline-flex items-center justify-center h-11 w-11 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                  title="Segarkan"
                >
                  <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </button>
              </div>

              <AnimatePresence>
                {isFilterOpen && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="mt-2 p-3 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Status</label>
                        <select
                          value={statusFilter}
                          onChange={(e) => {
                            setStatusFilter(e.target.value)
                            setPage(1)
                          }}
                          className="w-full h-10 px-3 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm"
                        >
                          <option value="">Semua</option>
                          <option value="hidup">Hidup</option>
                          <option value="wafat">Wafat</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Kabupaten</label>
                        <select
                          value={kabupatenFilter}
                          onChange={(e) => {
                            setKabupatenFilter(e.target.value)
                            resetWilayahBelow('kabupaten')
                            setPage(1)
                          }}
                          className="w-full h-10 px-3 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm"
                        >
                          <option value="">Semua</option>
                          {kabupatenOptions.map((k) => {
                            const val = k.kabupaten || k.value
                            return (
                              <option key={val} value={val}>
                                {val} ({k.total})
                              </option>
                            )
                          })}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Kecamatan</label>
                        <select
                          value={kecamatanFilter}
                          onChange={(e) => {
                            setKecamatanFilter(e.target.value)
                            resetWilayahBelow('kecamatan')
                            setPage(1)
                          }}
                          className="w-full h-10 px-3 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm"
                        >
                          <option value="">Semua</option>
                          {kecamatanOptions.map((k) => {
                            const val = k.kecamatan || k.value
                            return (
                              <option key={val} value={val}>
                                {val} ({k.total})
                              </option>
                            )
                          })}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Desa</label>
                        <select
                          value={desaFilter}
                          onChange={(e) => {
                            setDesaFilter(e.target.value)
                            resetWilayahBelow('desa')
                            setPage(1)
                          }}
                          className="w-full h-10 px-3 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm"
                        >
                          <option value="">Semua</option>
                          {desaOptions.map((k) => {
                            const val = k.desa || k.value
                            return (
                              <option key={val} value={val}>
                                {val} ({k.total})
                              </option>
                            )
                          })}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Dusun</label>
                        <select
                          value={dusunFilter}
                          onChange={(e) => {
                            setDusunFilter(e.target.value)
                            setPage(1)
                          }}
                          className="w-full h-10 px-3 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm"
                        >
                          <option value="">Semua</option>
                          {dusunOptions.map((k) => {
                            const val = k.dusun || k.value
                            return (
                              <option key={val} value={val}>
                                {val} ({k.total})
                              </option>
                            )
                          })}
                        </select>
                      </div>
                      <div className="flex items-end">
                        <button
                          type="button"
                          onClick={resetAllFilters}
                          className="w-full h-10 rounded-xl text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                        >
                          Reset filter
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Meta bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 px-0.5">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                <span className="font-semibold text-gray-800 dark:text-gray-200">{pagination.total ?? 0}</span> alumni
              </p>
              <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                <div
                  className="inline-flex items-center rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-0.5"
                  role="group"
                  aria-label="Tampilan daftar"
                >
                  <button
                    type="button"
                    onClick={() => setViewMode('full')}
                    title="Tampilan lengkap"
                    aria-pressed={viewMode === 'full'}
                    className={`inline-flex items-center justify-center h-7 w-8 rounded-lg transition-colors ${
                      viewMode === 'full'
                        ? 'bg-teal-50 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300'
                        : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
                    }`}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('minimal')}
                    title="Tampilan minimalis"
                    aria-pressed={viewMode === 'minimal'}
                    className={`inline-flex items-center justify-center h-7 w-8 rounded-lg transition-colors ${
                      viewMode === 'minimal'
                        ? 'bg-teal-50 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300'
                        : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
                    }`}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
                    </svg>
                  </button>
                </div>
                <label className="inline-flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                  <span className="shrink-0">Sortir</span>
                  <select
                    value={sortKey}
                    onChange={(e) => {
                      setSortKey(e.target.value)
                      setPage(1)
                    }}
                    className="h-8 max-w-[11.5rem] sm:max-w-none text-xs rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 px-2 focus:ring-1 focus:ring-teal-500/40"
                    aria-label="Sortir daftar alumni"
                  >
                    {SORT_OPTIONS.map((o) => (
                      <option key={o.key} value={o.key}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
                <select
                  value={limit}
                  onChange={(e) => {
                    setLimit(Number(e.target.value) || 40)
                    setPage(1)
                  }}
                  className="h-8 text-xs bg-transparent border-none text-gray-600 dark:text-gray-400 focus:ring-0 cursor-pointer"
                  aria-label="Per halaman"
                >
                  <option value={20}>20 / halaman</option>
                  <option value={40}>40 / halaman</option>
                  <option value={80}>80 / halaman</option>
                  <option value={120}>120 / halaman</option>
                </select>
              </div>
            </div>

            {error ? (
              <div className="p-4 rounded-2xl bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-sm">{error}</div>
            ) : null}

            {loading && items.length === 0 ? (
              viewMode === 'minimal' ? (
                <div className="space-y-2">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="h-11 rounded-xl bg-gray-200/70 dark:bg-gray-800 animate-pulse" />
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="h-28 rounded-2xl bg-gray-200/70 dark:bg-gray-800 animate-pulse" />
                  ))}
                </div>
              )
            ) : items.length === 0 ? (
              <div className="py-16 text-center text-gray-500 dark:text-gray-400">
                <svg className="w-12 h-12 mx-auto mb-3 text-gray-300 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <p>Belum ada data alumni</p>
              </div>
            ) : viewMode === 'minimal' ? (
              <div className="rounded-2xl border border-gray-200/80 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden divide-y divide-gray-100 dark:divide-gray-700/80">
                {items.map((row, index) => {
                  const wafat = row.status === 'wafat'
                  return (
                    <motion.button
                      key={row.id}
                      type="button"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.15, delay: Math.min(index * 0.01, 0.12) }}
                      onClick={() => openDetail(row)}
                      className="w-full flex items-center gap-3 px-3.5 py-2.5 text-left hover:bg-teal-50/60 dark:hover:bg-teal-900/20 focus:outline-none focus-visible:bg-teal-50 dark:focus-visible:bg-teal-900/30 transition-colors"
                    >
                      <div
                        className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${
                          wafat
                            ? 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-200'
                            : 'bg-teal-50 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300'
                        }`}
                        title={wafat ? 'Wafat' : 'Hidup'}
                      >
                        {genderShort(row.gender)}
                      </div>
                      <span className="min-w-0 flex-1 text-sm font-medium text-gray-900 dark:text-white truncate">
                        {row.nama || '-'}
                      </span>
                      <span className="shrink-0 text-xs font-mono text-gray-500 dark:text-gray-400 tabular-nums">
                        {row.id_alumni || '-'}
                      </span>
                    </motion.button>
                  )
                })}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {items.map((row, index) => {
                  const wafat = row.status === 'wafat'
                  return (
                    <motion.button
                      key={row.id}
                      type="button"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2, delay: Math.min(index * 0.02, 0.2) }}
                      onClick={() => openDetail(row)}
                      className="group text-left rounded-2xl border border-gray-200/80 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 shadow-sm hover:shadow-md hover:border-teal-300/70 dark:hover:border-teal-700 transition-all focus:outline-none focus:ring-2 focus:ring-teal-500/40 active:scale-[0.99]"
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={`shrink-0 w-11 h-11 rounded-2xl flex items-center justify-center text-sm font-bold ${
                            wafat
                              ? 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-200'
                              : 'bg-teal-50 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300'
                          }`}
                        >
                          {genderShort(row.gender)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <h3 className="text-sm font-semibold text-gray-900 dark:text-white leading-snug line-clamp-2 group-hover:text-teal-700 dark:group-hover:text-teal-300">
                              {row.nama || '-'}
                            </h3>
                            <span
                              className={`shrink-0 inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${
                                wafat
                                  ? 'bg-slate-200 text-slate-700 dark:bg-slate-600 dark:text-slate-100'
                                  : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
                              }`}
                            >
                              {wafat ? 'Wafat' : 'Hidup'}
                            </span>
                          </div>
                          <p className="mt-1 text-xs font-mono text-gray-500 dark:text-gray-400">
                            {row.id_alumni || '-'}
                            {row.nik ? ` · ${row.nik}` : ''}
                          </p>
                          <p className="mt-1.5 text-xs text-gray-600 dark:text-gray-300 line-clamp-2">{wilayahLine(row)}</p>
                          {row.tahun_boyong_masehi || row.tahun_boyong_hijriyah ? (
                            <p className="mt-1.5 text-[11px] text-gray-400 dark:text-gray-500">
                              Boyong {row.tahun_boyong_masehi || '-'}
                              {row.tahun_boyong_hijriyah ? ` M / ${row.tahun_boyong_hijriyah} H` : ' M'}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </motion.button>
                  )
                })}
              </div>
            )}

            {pagination.total > 0 && totalPages > 1 ? (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 pb-16 sm:pb-4">
                <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                  Halaman {pagination.page} dari {totalPages}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-sm disabled:opacity-40 bg-white dark:bg-gray-800"
                  >
                    Sebelumnya
                  </button>
                  <button
                    type="button"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                    className="px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-sm disabled:opacity-40 bg-white dark:bg-gray-800"
                  >
                    Berikutnya
                  </button>
                </div>
              </div>
            ) : (
              <div className="h-16 sm:h-0" aria-hidden="true" />
            )}
          </motion.div>
        </div>
      </div>

      {createPortal(
        <DetailAlumniOffcanvas
          isOpen={!!detailRow}
          onClose={closeDetail}
          alumni={detailRow}
          canEdit={canEdit}
          canDelete={canDelete}
          canToggleStatus={canToggleStatus}
          statusBusy={statusBusy}
          deleteBusy={deleteBusy}
          onEdit={() => setEditRow(detailRow)}
          onDelete={handleDelete}
          onToggleStatus={handleToggleStatus}
        />,
        document.body
      )}
      {createPortal(
        <EditAlumniOffcanvas
          isOpen={!!editRow}
          onClose={closeEdit}
          alumni={editRow}
          onSaved={(data) => {
            patchLocalRow(data)
            setEditRow(null)
          }}
          stackBaseZIndex={10300}
        />,
        document.body
      )}
    </div>
  )
}

export default DataAlumni
