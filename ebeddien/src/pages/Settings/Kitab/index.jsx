import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { kitabAPI } from '../../../services/api'
import Modal from '../../../components/Modal/Modal'
import { useNotification } from '../../../contexts/NotificationContext'
import KitabFormOffcanvas from './components/KitabFormOffcanvas'

function Kitab() {
  const { showNotification } = useNotification()
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [searchInput, setSearchInput] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [fanFilter, setFanFilter] = useState('')
  const [fanOptions, setFanOptions] = useState([])
  const [isInputFocused, setIsInputFocused] = useState(false)

  const [formOpen, setFormOpen] = useState(false)
  const [editingKitab, setEditingKitab] = useState(null)

  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deletingKitab, setDeletingKitab] = useState(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState('')
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchInput), 350)
    return () => clearTimeout(t)
  }, [searchInput])

  const loadList = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await kitabAPI.getList({
        search: debouncedSearch.trim(),
        fan: fanFilter
      })
      if (res?.success) {
        setList(Array.isArray(res.data) ? res.data : [])
      } else {
        setError(res?.message || 'Gagal memuat daftar kitab')
        setList([])
      }
    } catch (err) {
      console.error(err)
      setError('Terjadi kesalahan saat memuat data')
      setList([])
    } finally {
      setLoading(false)
    }
  }, [debouncedSearch, fanFilter])

  useEffect(() => {
    loadList()
  }, [loadList])

  useEffect(() => {
    let cancelled = false
    kitabAPI.getFanOptions().then((r) => {
      if (cancelled) return
      if (r?.success && Array.isArray(r.data)) setFanOptions(r.data)
      else setFanOptions([])
    }).catch(() => {
      if (!cancelled) setFanOptions([])
    })
    return () => {
      cancelled = true
    }
  }, [])

  const openTambah = () => {
    setEditingKitab(null)
    setFormOpen(true)
  }

  const openEdit = (row) => {
    setEditingKitab(row)
    setFormOpen(true)
  }

  const closeForm = () => {
    setFormOpen(false)
    setEditingKitab(null)
  }

  const onFormSuccess = () => {
    showNotification(editingKitab ? 'Kitab diperbarui' : 'Kitab ditambahkan', 'success')
    loadList()
    kitabAPI.getFanOptions().then((r) => {
      if (r?.success && Array.isArray(r.data)) setFanOptions(r.data)
    })
  }

  const handleDeleteClick = (e, row) => {
    e.stopPropagation()
    setDeletingKitab(row)
    setDeleteConfirmId('')
    setShowDeleteModal(true)
  }

  const handleConfirmDelete = async () => {
    if (!deletingKitab) return
    if (deleteConfirmId.trim() !== String(deletingKitab.id)) {
      showNotification('ID yang dimasukkan tidak sesuai', 'error')
      return
    }
    setDeleting(true)
    try {
      const res = await kitabAPI.delete(deletingKitab.id)
      if (res?.success) {
        showNotification('Kitab dihapus', 'success')
        setShowDeleteModal(false)
        setDeletingKitab(null)
        setDeleteConfirmId('')
        loadList()
      } else {
        showNotification(res?.message || 'Gagal menghapus', 'error')
      }
    } catch (err) {
      console.error(err)
      showNotification(err.response?.data?.message || 'Gagal menghapus', 'error')
    } finally {
      setDeleting(false)
    }
  }

  if (loading && list.length === 0 && !error) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600" />
      </div>
    )
  }

  return (
    <div className="h-full overflow-hidden" style={{ minHeight: 0 }}>
      <div className="h-full overflow-y-auto page-content-scroll" style={{ minHeight: 0 }}>
        <div className="container mx-auto px-4 py-6 max-w-7xl">
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-4">
              <p className="text-red-800 dark:text-red-200">{error}</p>
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
                className="w-full p-2 pr-4 focus:outline-none bg-transparent dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400"
                placeholder="Cari judul, penulis, penerbit, ISBN, fan…"
              />
              <div className="absolute left-0 right-0 bottom-0 h-0.5 bg-gray-300 dark:bg-gray-600" />
              <div
                className={`absolute left-0 right-0 bottom-0 h-0.5 bg-teal-500 transition-opacity ${isInputFocused ? 'opacity-100' : 'opacity-0'}`}
              />
            </div>
            <div className="px-4 py-2 border-t border-gray-200 dark:border-gray-700 flex flex-wrap items-center gap-2 justify-between">
              <select
                value={fanFilter}
                onChange={(e) => setFanFilter(e.target.value)}
                className="border rounded-lg px-2 py-1.5 text-sm bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 focus:ring-2 focus:ring-teal-500 min-w-[10rem]"
              >
                <option value="">Semua fan</option>
                {fanOptions.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => loadList()}
                  className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  Refresh
                </button>
                <button
                  type="button"
                  onClick={openTambah}
                  className="px-3 py-1.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors flex items-center gap-1.5 text-sm"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                  </svg>
                  Tambah Kitab
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            <AnimatePresence>
              {list.map((row, index) => (
                <motion.div
                  key={row.id}
                  layout
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ delay: index * 0.02 }}
                  className="bg-white dark:bg-gray-800 rounded-lg shadow-md border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col"
                >
                  <button
                    type="button"
                    onClick={() => openEdit(row)}
                    className="text-left p-4 flex-1 hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors"
                  >
                    <div className="flex justify-between items-start gap-2 mb-2">
                      <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 line-clamp-2">
                        {row.nama_indo}
                      </h3>
                      <span className="text-xs text-gray-400 shrink-0">#{row.id}</span>
                    </div>
                    {row.fan && (
                      <span className="inline-block mb-2 px-2 py-0.5 rounded-md text-xs font-medium bg-teal-50 dark:bg-teal-900/40 text-teal-800 dark:text-teal-200">
                        {row.fan}
                      </span>
                    )}
                    {row.nama_arab && (
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-1 line-clamp-2 text-right" dir="rtl">
                        {row.nama_arab}
                      </p>
                    )}
                    {(row.penulis || row.penerbit) && (
                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                        {[row.penulis, row.penerbit].filter(Boolean).join(' · ')}
                      </p>
                    )}
                    {(row.tahun || row.isbn) && (
                      <p className="text-xs text-gray-500 dark:text-gray-500 mt-2">
                        {[row.tahun ? `Terbit ${row.tahun}` : null, row.isbn ? `ISBN ${row.isbn}` : null]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    )}
                  </button>
                  <div className="px-4 py-2 border-t border-gray-100 dark:border-gray-700 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={(e) => handleDeleteClick(e, row)}
                      className="text-xs px-2 py-1 rounded text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                    >
                      Hapus
                    </button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          {!loading && list.length === 0 && (
            <div className="text-center py-12">
              <p className="text-gray-500 dark:text-gray-400">
                {debouncedSearch || fanFilter ? 'Tidak ada kitab yang cocok' : 'Belum ada data kitab'}
              </p>
            </div>
          )}

          <div className="h-20 sm:h-0" aria-hidden="true" />
        </div>
      </div>

      <KitabFormOffcanvas
        isOpen={formOpen}
        onClose={closeForm}
        kitab={editingKitab}
        onSuccess={onFormSuccess}
      />

      <Modal
        isOpen={showDeleteModal}
        onClose={() => {
          if (!deleting) {
            setShowDeleteModal(false)
            setDeletingKitab(null)
            setDeleteConfirmId('')
          }
        }}
        title="Konfirmasi hapus kitab"
        maxWidth="max-w-md"
        closeOnBackdropClick={!deleting}
      >
        <div className="p-6">
          <p className="text-gray-700 dark:text-gray-300 mb-2">
            Hapus kitab <strong className="break-words">{deletingKitab?.nama_indo}</strong>{' '}
            <span className="text-gray-500">(ID {deletingKitab?.id})</span>?
          </p>
          <p className="text-sm text-red-600 dark:text-red-400 mb-4 font-medium">Tindakan ini tidak dapat dibatalkan.</p>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
            Ketik ID kitab untuk mengonfirmasi:
          </p>
          <input
            type="text"
            value={deleteConfirmId}
            onChange={(e) => setDeleteConfirmId(e.target.value)}
            placeholder={deletingKitab ? `Mis. ${deletingKitab.id}` : ''}
            disabled={deleting}
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-red-500 dark:bg-gray-700 dark:text-gray-200 disabled:opacity-50"
            autoFocus
          />
          <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
            <button
              type="button"
              onClick={() => {
                setShowDeleteModal(false)
                setDeletingKitab(null)
                setDeleteConfirmId('')
              }}
              disabled={deleting}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm disabled:opacity-50"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={handleConfirmDelete}
              disabled={deleting || deleteConfirmId.trim() !== String(deletingKitab?.id)}
              className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {deleting ? (
                <>
                  <span className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent inline-block" />
                  Menghapus…
                </>
              ) : (
                'Hapus'
              )}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

export default Kitab
