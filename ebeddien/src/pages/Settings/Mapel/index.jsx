import { useState, useEffect, useCallback, useRef, useMemo, memo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { mapelAPI, rombelAPI, kitabAPI, lembagaAPI } from '../../../services/api'
import Modal from '../../../components/Modal/Modal'
import { useNotification } from '../../../contexts/NotificationContext'
import MapelFormOffcanvas from './components/MapelFormOffcanvas'
import { useLembagaFilterAccess } from '../../../hooks/useLembagaFilterAccess'
import { LEMBAGA_FILTER_ACTION_CODES } from '../../../config/lembagaFilterFiturCodes'

function kitabNama(row) {
  const indo = String(row?.kitab_nama ?? '').trim()
  const arab = String(row?.kitab_nama_arab ?? '').trim()
  return indo || arab || '—'
}

function kelasLabel(row) {
  const parts = [row?.kelas, row?.kel].filter((x) => x != null && String(x).trim() !== '')
  return parts.length ? parts.join(' · ') : '—'
}

function rombelChipLabel(r) {
  if (!r) return ''
  const parts = [r.kelas, r.kel].filter((x) => x != null && String(x).trim() !== '')
  return parts.length ? parts.join(' · ') : `Rombel #${r.id}`
}

function isRombelAktif(r) {
  const s = String(r?.status ?? '').toLowerCase().trim()
  return s === 'aktif' || s === 'active'
}

const MapelListItem = memo(({ row, index, onClick, kelasColStyle }) => {
  const fan = String(row?.kitab_fan ?? '').trim()
  const kitab = kitabNama(row)
  const kelas = kelasLabel(row)
  return (
    <motion.button
      type="button"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: Math.min(index, 20) * 0.01 }}
      onClick={() => onClick(row)}
      className="w-full flex md:grid items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors"
      style={kelasColStyle}
    >
      <div className="md:hidden min-w-0 flex-1">
        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
          {fan || '—'}
        </p>
        <div className="mt-0.5 flex items-center gap-2 min-w-0">
          <span className="min-w-0 flex-1 text-xs text-gray-600 dark:text-gray-300 truncate">{kitab}</span>
          <span className="shrink-0 text-xs font-medium text-gray-800 dark:text-gray-100 tabular-nums">
            {kelas}
          </span>
        </div>
      </div>
      <span className="hidden md:block min-w-0 text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
        {fan || '—'}
      </span>
      <span className="hidden md:block min-w-0 text-sm text-gray-700 dark:text-gray-200 truncate text-center">
        {kitab}
      </span>
      <span className="hidden md:block min-w-0 text-sm font-medium text-gray-800 dark:text-gray-100 truncate text-right tabular-nums">
        {kelas}
      </span>
    </motion.button>
  )
})
MapelListItem.displayName = 'MapelListItem'

function Mapel({ embedded = false }) {
  const { showNotification } = useNotification()
  const lembagaAccess = useLembagaFilterAccess(LEMBAGA_FILTER_ACTION_CODES.mapelSemua)
  const [list, setList] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [hasBooted, setHasBooted] = useState(false)
  const [error, setError] = useState('')
  const loadSeqRef = useRef(0)
  const [searchInput, setSearchInput] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [lembagaFilter, setLembagaFilter] = useState('')
  const [rombelFilter, setRombelFilter] = useState('')
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
    setCurrentPage((p) => (p === 1 ? p : 1))
  }, [debouncedSearch])

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
    if (lembagaFilter !== allowed[0]) {
      setLembagaFilter(allowed[0])
      setRombelFilter('')
      setCurrentPage(1)
    }
  }, [lembagaAccess.allowedLembagaIds, lembagaFilter])

  const loadMapel = useCallback(async () => {
    const seq = ++loadSeqRef.current
    try {
      setLoading(true)
      setError('')
      const res = await mapelAPI.getList({
        search: debouncedSearch.trim(),
        lembaga_id: lembagaFilter,
        lembaga_ids: lembagaAccess.allowedLembagaIds?.length ? lembagaAccess.allowedLembagaIds.join(',') : undefined,
        id_rombel: rombelFilter,
        status: statusFilter,
        page: currentPage,
        limit: itemsPerPage
      })
      if (seq !== loadSeqRef.current) return
      if (res?.success) {
        setList(Array.isArray(res.data) ? res.data : [])
        setTotal(typeof res.total === 'number' ? res.total : 0)
      } else {
        setError(res?.message || 'Gagal memuat mapel')
        setList([])
        setTotal(0)
      }
    } catch (err) {
      if (seq !== loadSeqRef.current) return
      console.error(err)
      setError(err.response?.data?.message || 'Terjadi kesalahan saat memuat data')
      setList([])
      setTotal(0)
    } finally {
      if (seq === loadSeqRef.current) {
        setLoading(false)
        setHasBooted(true)
      }
    }
  }, [debouncedSearch, lembagaFilter, rombelFilter, statusFilter, currentPage, itemsPerPage, lembagaAccess.allowedLembagaIds])

  useEffect(() => {
    loadMapel()
  }, [loadMapel])

  const rombelOptions = useMemo(() => {
    if (!lembagaFilter) return []
    const arr = rombelList.filter(
      (r) => String(r.lembaga_id) === String(lembagaFilter) && isRombelAktif(r)
    )
    return [...arr].sort((a, b) => rombelChipLabel(a).localeCompare(rombelChipLabel(b), 'id'))
  }, [rombelList, lembagaFilter])

  useEffect(() => {
    if (!rombelFilter) return
    if (!rombelOptions.some((r) => String(r.id) === String(rombelFilter))) {
      setRombelFilter('')
    }
  }, [rombelFilter, rombelOptions])

  const kelasColStyle = useMemo(() => {
    let max = 4
    list.forEach((row) => {
      const n = kelasLabel(row).length
      if (n > max) max = n
    })
    const rem = Math.min(10, Math.max(4.5, max * 0.52 + 1.2))
    return { gridTemplateColumns: `minmax(0,1fr) minmax(0,1fr) ${rem}rem` }
  }, [list])

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

  const onFormSuccess = (result) => {
    if (result?.mode === 'edit') {
      if (result.created > 0) {
        const msg =
          result.failed > 0
            ? `Mapel diperbarui dan ${result.created} rombel ditambah (${result.failed} gagal)`
            : `Mapel diperbarui dan ditambah ke ${result.created} rombel`
        showNotification(msg, result.failed > 0 ? 'warning' : 'success')
      } else {
        showNotification('Mapel diperbarui', 'success')
      }
    } else if (result?.mode === 'create' && result.count > 1) {
      const msg =
        result.failed > 0
          ? `${result.count} mapel ditambahkan (${result.failed} gagal)`
          : `${result.count} mapel ditambahkan`
      showNotification(msg, result.failed > 0 ? 'warning' : 'success')
    } else {
      showNotification('Mapel ditambahkan', 'success')
    }
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
        closeForm()
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
    setRombelFilter('')
    setStatusFilter('')
    setCurrentPage(1)
  }

  const body = (
    <>
          <div>
            {error && (
              <div className="mb-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg">
                {error}
              </div>
            )}

            <div className={`${embedded ? '' : 'sticky top-0 z-10 '}bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 mb-4`}>
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
                        onChange={(e) => {
                          setLembagaFilter(e.target.value)
                          setRombelFilter('')
                          setCurrentPage(1)
                        }}
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
                        onChange={(e) => {
                          setStatusFilter(e.target.value)
                          setCurrentPage(1)
                        }}
                        className="border rounded-lg px-2 py-1.5 text-xs bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600"
                      >
                        <option value="">Semua status</option>
                        <option value="aktif">Aktif</option>
                        <option value="nonaktif">Nonaktif</option>
                      </select>
                      <select
                        value={itemsPerPage}
                        onChange={(e) => {
                          setItemsPerPage(Number(e.target.value))
                          setCurrentPage(1)
                        }}
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
              {lembagaFilter ? (
                <div className="px-4 pt-2 pb-1 border-t border-gray-200 dark:border-gray-700">
                  <div
                    className="overflow-x-auto pb-1 -mx-4 px-4 scrollbar-hide"
                    style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                  >
                    <div className="flex gap-2 min-w-max">
                      <button
                        type="button"
                        onClick={() => {
                          setRombelFilter('')
                          setCurrentPage(1)
                        }}
                        className={`flex-shrink-0 px-2 py-1 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                          rombelFilter === ''
                            ? 'bg-teal-600 text-white shadow-md'
                            : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
                        }`}
                      >
                        Semua
                      </button>
                      {rombelOptions.map((r) => {
                        const id = String(r.id)
                        const isActive = rombelFilter === id
                        return (
                          <button
                            key={r.id}
                            type="button"
                            onClick={() => {
                              setRombelFilter(isActive ? '' : id)
                              setCurrentPage(1)
                            }}
                            className={`flex-shrink-0 px-2 py-1 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                              isActive
                                ? 'bg-teal-600 text-white shadow-md'
                                : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
                            }`}
                          >
                            {rombelChipLabel(r)}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            <div className={`bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden ${loading && hasBooted ? 'opacity-60' : ''}`}>
              {!hasBooted && loading ? (
                <div className="p-8 flex justify-center">
                  <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-teal-600" />
                </div>
              ) : list.length === 0 ? (
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
                        kelasColStyle={kelasColStyle}
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
          </div>

      <MapelFormOffcanvas
        isOpen={formOpen}
        onClose={closeForm}
        record={editing}
        lembagaList={lembagaList}
        rombelList={rombelList}
        kitabList={kitabList}
        onSuccess={onFormSuccess}
        onDelete={onDeleteClick}
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
    </>
  )

  if (embedded) {
    return body
  }

  return (
    <div className="h-full overflow-hidden" style={{ minHeight: 0 }}>
      <div className="h-full overflow-y-auto page-content-scroll" style={{ minHeight: 0 }}>
        <div className="p-4 sm:p-6 lg:p-8">{body}</div>
      </div>
    </div>
  )
}

export default Mapel
