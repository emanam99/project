import { useState, useEffect, useCallback, useRef, useMemo, memo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { mapelAPI, rombelAPI, kitabAPI, lembagaAPI } from '../../../services/api'
import Modal from '../../../components/Modal/Modal'
import { useNotification } from '../../../contexts/NotificationContext'
import MapelFormOffcanvas from './components/MapelFormOffcanvas'
import { useLembagaFilterAccess } from '../../../hooks/useLembagaFilterAccess'
import { LEMBAGA_FILTER_ACTION_CODES } from '../../../config/lembagaFilterFiturCodes'

const MapelListItem = memo(({ row, index, onClick, onDelete, statusBadge }) => (
  <motion.div
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.2, delay: index * 0.02 }}
    className="p-4 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-all duration-200 group"
  >
    <button type="button" onClick={() => onClick(row)} className="w-full text-left">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-0.5 group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors line-clamp-2">
            {row.kitab_nama || '—'}
          </h3>
          <p className="text-xs text-gray-600 dark:text-gray-400">
            {row.lembaga_nama || row.lembaga_id || '—'}
            {row.kelas != null && row.kelas !== '' ? ` · Kelas ${row.kelas}` : ''}
            {row.kel != null && row.kel !== '' ? ` ${row.kel}` : ''}
          </p>
          {row.kitab_fan && (
            <span className="inline-block mt-1.5 px-2 py-0.5 rounded text-xs font-medium bg-teal-50 dark:bg-teal-900/30 text-teal-800 dark:text-teal-300">
              {row.kitab_fan}
            </span>
          )}
          {(row.dari || row.sampai) && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5">
              Pelajaran: {[row.dari, row.sampai].filter(Boolean).join(' — ')}
            </p>
          )}
          {row.keterangan && (
            <p className="text-xs text-gray-500 dark:text-gray-500 mt-1 line-clamp-2">{row.keterangan}</p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          {statusBadge(row.status)}
          <span className="text-[10px] text-gray-400 tabular-nums">#{row.id}</span>
          <svg
            className="w-5 h-5 text-gray-400 group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </div>
    </button>
    <div className="mt-2 flex justify-end">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onDelete(row)
        }}
        className="text-xs text-red-600 dark:text-red-400 hover:underline px-1 py-0.5"
      >
        Hapus
      </button>
    </div>
  </motion.div>
))
MapelListItem.displayName = 'MapelListItem'

function Mapel() {
  const { showNotification } = useNotification()
  const lembagaAccess = useLembagaFilterAccess(LEMBAGA_FILTER_ACTION_CODES.mapelSemua)
  const [list, setList] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [lembagaFilter, setLembagaFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [isInputFocused, setIsInputFocused] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(25)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)

  const [lembagaList, setLembagaList] = useState([])
  const [rombelList, setRombelList] = useState([])
  const [kitabList, setKitabList] = useState([])

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState(null)

  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deletingRow, setDeletingRow] = useState(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState('')
  const [deleting, setDeleting] = useState(false)

  const allowedLembagaSet = useMemo(
    () => (lembagaAccess.allowedLembagaIds?.length ? new Set(lembagaAccess.allowedLembagaIds.map(String)) : null),
    [lembagaAccess.allowedLembagaIds]
  )

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchInput), 350)
    return () => clearTimeout(t)
  }, [searchInput])

  useEffect(() => {
    const onDoc = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false)
    }
    if (menuOpen) document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [menuOpen])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const [lr, kr, le] = await Promise.all([
          rombelAPI.getAll({ limit: 500, page: 1 }),
          kitabAPI.getList(),
          lembagaAPI.getAll()
        ])
        if (cancelled) return
        if (lr?.success) setRombelList(Array.isArray(lr.data) ? lr.data : [])
        if (kr?.success) setKitabList(Array.isArray(kr.data) ? kr.data : [])
        if (le?.success) {
          const rows = Array.isArray(le.data) ? le.data : []
          setLembagaList(!allowedLembagaSet ? rows : rows.filter((l) => allowedLembagaSet.has(String(l.id))))
        }
      } catch (e) {
        console.error(e)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [allowedLembagaSet])

  useEffect(() => {
    const allowed = lembagaAccess.allowedLembagaIds
    if (!allowed || allowed.length !== 1) return
    if (lembagaFilter !== allowed[0]) setLembagaFilter(allowed[0])
  }, [lembagaAccess.allowedLembagaIds, lembagaFilter])

  const loadMapel = useCallback(async () => {
    try {
      setLoading(true)
      setError('')
      const res = await mapelAPI.getList({
        search: debouncedSearch.trim(),
        lembaga_id: lembagaFilter,
        lembaga_ids: lembagaAccess.allowedLembagaIds?.length ? lembagaAccess.allowedLembagaIds.join(',') : undefined,
        status: statusFilter,
        page: currentPage,
        limit: itemsPerPage
      })
      if (res?.success) {
        setList(Array.isArray(res.data) ? res.data : [])
        setTotal(typeof res.total === 'number' ? res.total : 0)
      } else {
        setError(res?.message || 'Gagal memuat mapel')
        setList([])
        setTotal(0)
      }
    } catch (err) {
      console.error(err)
      setError(err.response?.data?.message || 'Terjadi kesalahan saat memuat data')
      setList([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [debouncedSearch, lembagaFilter, statusFilter, currentPage, itemsPerPage, lembagaAccess.allowedLembagaIds])

  useEffect(() => {
    loadMapel()
  }, [loadMapel])

  useEffect(() => {
    setCurrentPage(1)
  }, [debouncedSearch, lembagaFilter, statusFilter, itemsPerPage])

  const statusBadge = useCallback((s) => {
    const t = String(s || '').toLowerCase()
    const isAktif = t === 'aktif' || t === 'active'
    const cls = isAktif
      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
      : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
    const label = isAktif ? 'Aktif' : 'Nonaktif'
    return <span className={`px-2.5 py-1 rounded-md text-xs font-medium ${cls}`}>{label}</span>
  }, [])

  const openTambah = () => {
    setMenuOpen(false)
    setEditing(null)
    setFormOpen(true)
  }

  const openEdit = (row) => {
    setEditing(row)
    setFormOpen(true)
  }

  const closeForm = () => {
    setFormOpen(false)
    setEditing(null)
  }

  const onFormSuccess = () => {
    showNotification(editing ? 'Mapel diperbarui' : 'Mapel ditambahkan', 'success')
    loadMapel()
  }

  const onDeleteClick = (row) => {
    setDeletingRow(row)
    setDeleteConfirmId('')
    setShowDeleteModal(true)
  }

  const confirmDelete = async () => {
    if (!deletingRow) return
    if (deleteConfirmId.trim() !== String(deletingRow.id)) {
      showNotification('ID tidak sesuai', 'error')
      return
    }
    setDeleting(true)
    try {
      const res = await mapelAPI.delete(deletingRow.id)
      if (res?.success) {
        showNotification('Mapel dihapus', 'success')
        setShowDeleteModal(false)
        setDeletingRow(null)
        setDeleteConfirmId('')
        loadMapel()
      } else {
        showNotification(res?.message || 'Gagal menghapus', 'error')
      }
    } catch (err) {
      showNotification(err.response?.data?.message || 'Gagal menghapus', 'error')
    } finally {
      setDeleting(false)
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / itemsPerPage) || 1)

  const handlePageChange = (p) => {
    if (p < 1 || p > totalPages) return
    setCurrentPage(p)
  }

  const resetFilter = () => {
    setSearchInput('')
    setLembagaFilter(lembagaAccess.allowedLembagaIds?.length === 1 ? lembagaAccess.allowedLembagaIds[0] : '')
    setStatusFilter('')
    setCurrentPage(1)
  }

  if (loading && list.length === 0 && !error) {
    return (
      <div className="h-full overflow-hidden" style={{ minHeight: 0 }}>
        <div className="h-full overflow-y-auto page-content-scroll flex items-center justify-center" style={{ minHeight: 0 }}>
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600" />
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-hidden" style={{ minHeight: 0 }}>
      <div className="h-full overflow-y-auto page-content-scroll" style={{ minHeight: 0 }}>
        <div className="p-4 sm:p-6 lg:p-8">
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
            {error && (
              <div className="mb-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg">
                {error}
              </div>
            )}

            <div className="sticky top-0 z-10 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 mb-4">
              <div className="relative pb-2 px-4 pt-3">
                <input
                  type="text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onFocus={() => setIsInputFocused(true)}
                  onBlur={() => setIsInputFocused(false)}
                  className="w-full p-2 pr-36 focus:outline-none bg-transparent dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400"
                  placeholder="Cari kitab, kelas, keterangan, lembaga…"
                />
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                  <div ref={menuRef} className="relative">
                    <button
                      type="button"
                      onClick={() => setMenuOpen((v) => !v)}
                      className="bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 p-1.5 rounded text-xs flex items-center gap-1"
                    >
                      Menu
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
                      </svg>
                    </button>
                    <AnimatePresence>
                      {menuOpen && (
                        <motion.div
                          initial={{ opacity: 0, y: -4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -4 }}
                          className="absolute right-0 top-full mt-1 py-1 w-44 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-600 z-50"
                        >
                          <button
                            type="button"
                            onClick={openTambah}
                            className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                            </svg>
                            Tambah mapel
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setMenuOpen(false)
                              loadMapel()
                            }}
                            className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                            Refresh
                          </button>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsFilterOpen((p) => !p)}
                    className="bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 p-1.5 rounded text-xs flex items-center gap-1"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                    </svg>
                    Filter
                  </button>
                </div>
                <div className="absolute left-0 right-0 bottom-0 h-0.5 bg-gray-300 dark:bg-gray-600" />
                <div
                  className={`absolute left-0 right-0 bottom-0 h-0.5 bg-teal-500 transition-opacity ${isInputFocused ? 'opacity-100' : 'opacity-0'}`}
                />
              </div>

              <AnimatePresence>
                {isFilterOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden border-t bg-gray-50 dark:bg-gray-700/50"
                  >
                    <div className="px-4 py-3 flex flex-wrap gap-2 items-center">
                      <select
                        value={lembagaFilter}
                        onChange={(e) => setLembagaFilter(e.target.value)}
                        className="border rounded-lg px-2 py-1.5 text-xs bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 min-w-[10rem]"
                        disabled={lembagaAccess.lembagaFilterLocked && (lembagaAccess.allowedLembagaIds?.length === 1)}
                      >
                        <option value="">{lembagaAccess.canFilterAllLembaga ? 'Semua lembaga' : 'Lembaga'}</option>
                        {lembagaList.map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.nama || l.id}
                          </option>
                        ))}
                      </select>
                      <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="border rounded-lg px-2 py-1.5 text-xs bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600"
                      >
                        <option value="">Semua status</option>
                        <option value="aktif">Aktif</option>
                        <option value="nonaktif">Nonaktif</option>
                      </select>
                      <select
                        value={itemsPerPage}
                        onChange={(e) => setItemsPerPage(Number(e.target.value))}
                        className="border rounded-lg px-2 py-1.5 text-xs bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600"
                      >
                        <option value={10}>10 / hal</option>
                        <option value={25}>25 / hal</option>
                        <option value={50}>50 / hal</option>
                        <option value={100}>100 / hal</option>
                      </select>
                      <button
                        type="button"
                        onClick={resetFilter}
                        className="text-xs px-2 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-white dark:hover:bg-gray-600"
                      >
                        Reset filter
                      </button>
                      <span className="text-xs text-gray-600 dark:text-gray-400 ml-auto tabular-nums">{total} data</span>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
              {list.length === 0 ? (
                <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                  {loading ? 'Memuat…' : 'Tidak ada mapel'}
                </div>
              ) : (
                <>
                  <div className="divide-y divide-gray-100 dark:divide-gray-700/50">
                    {list.map((row, index) => (
                      <MapelListItem
                        key={row.id}
                        row={row}
                        index={index}
                        onClick={openEdit}
                        onDelete={onDeleteClick}
                        statusBadge={statusBadge}
                      />
                    ))}
                  </div>
                  {totalPages > 1 && (
                    <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 flex flex-wrap items-center justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => handlePageChange(currentPage - 1)}
                        disabled={currentPage <= 1}
                        className="px-2 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 text-sm disabled:opacity-50"
                      >
                        ‹
                      </button>
                      <span className="text-sm text-gray-600 dark:text-gray-400">
                        {currentPage} / {totalPages}
                      </span>
                      <button
                        type="button"
                        onClick={() => handlePageChange(currentPage + 1)}
                        disabled={currentPage >= totalPages}
                        className="px-2 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 text-sm disabled:opacity-50"
                      >
                        ›
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="h-20 sm:h-0" aria-hidden="true" />
          </motion.div>
        </div>
      </div>

      <MapelFormOffcanvas
        isOpen={formOpen}
        onClose={closeForm}
        record={editing}
        lembagaList={lembagaList}
        rombelList={rombelList}
        kitabList={kitabList}
        onSuccess={onFormSuccess}
      />

      <Modal
        isOpen={showDeleteModal}
        onClose={() => {
          if (!deleting) {
            setShowDeleteModal(false)
            setDeletingRow(null)
            setDeleteConfirmId('')
          }
        }}
        title="Hapus mapel"
        maxWidth="max-w-md"
        closeOnBackdropClick={!deleting}
      >
        <div className="p-6">
          <p className="text-gray-700 dark:text-gray-300 mb-2">
            Hapus pemetaan <strong>{deletingRow?.kitab_nama}</strong> untuk rombel ini?
          </p>
          <p className="text-sm text-gray-500 mb-3">Ketik ID untuk konfirmasi: {deletingRow?.id}</p>
          <input
            type="text"
            value={deleteConfirmId}
            onChange={(e) => setDeleteConfirmId(e.target.value)}
            className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
            disabled={deleting}
          />
          <div className="flex justify-end gap-2 mt-4">
            <button
              type="button"
              onClick={() => {
                setShowDeleteModal(false)
                setDeletingRow(null)
                setDeleteConfirmId('')
              }}
              disabled={deleting}
              className="px-4 py-2 border rounded-lg text-sm"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={confirmDelete}
              disabled={deleting || deleteConfirmId.trim() !== String(deletingRow?.id)}
              className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm disabled:opacity-50"
            >
              {deleting ? 'Menghapus…' : 'Hapus'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

export default Mapel
