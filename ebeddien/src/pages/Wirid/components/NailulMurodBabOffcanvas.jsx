import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { wiridNailulMurodAPI } from '../../../services/api'
import { useNotification } from '../../../contexts/NotificationContext'
import { useOffcanvasBackClose } from '../../../hooks/useOffcanvasBackClose'
import NailulMurodBabReorderList from './NailulMurodBabReorderList'
import { readEbeddienTitleLang } from '../utils/wiridTitle'

const WIRID_BAB_OFFCANVAS_STATE = Object.freeze({ ebOffcanvas: 'wirid_nailul_murod_bab' })

const ocBtnBase =
  'inline-flex items-center justify-center gap-1 text-xs font-medium rounded-lg transition-colors disabled:opacity-50'
const ocBtnGhost = `${ocBtnBase} px-2.5 py-1.5 border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 bg-white/80 dark:bg-gray-800/80 hover:bg-gray-50 dark:hover:bg-gray-700/80`
const ocBtnPrimary = `${ocBtnBase} px-2.5 py-1.5 bg-teal-600 text-white shadow-sm hover:bg-teal-700`

export default function NailulMurodBabOffcanvas({ isOpen, onClose, onChanged, onExitComplete, titleLang: titleLangProp }) {
  const { showNotification } = useNotification()
  const closeWithBack = useOffcanvasBackClose(isOpen, onClose, { state: WIRID_BAB_OFFCANVAS_STATE })
  const titleLang = titleLangProp ?? readEbeddienTitleLang()

  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [newNamaId, setNewNamaId] = useState('')
  const [newNamaAr, setNewNamaAr] = useState('')
  const [deletingId, setDeletingId] = useState(null)

  const loadRows = useCallback(async () => {
    setLoading(true)
    try {
      const res = await wiridNailulMurodAPI.getBabList()
      if (res?.success && Array.isArray(res.data)) {
        setRows(res.data)
      } else {
        setRows([])
      }
    } catch {
      setRows([])
      showNotification('Gagal memuat daftar bab', 'error')
    } finally {
      setLoading(false)
    }
  }, [showNotification])

  useEffect(() => {
    if (isOpen) {
      loadRows()
    }
  }, [isOpen, loadRows])

  const notifyChanged = useCallback(() => {
    onChanged?.()
  }, [onChanged])

  const handleAdd = useCallback(async () => {
    const namaId = String(newNamaId).trim()
    const namaAr = String(newNamaAr).trim()
    if (!namaId && !namaAr) {
      showNotification('Isi minimal satu nama bab (Indonesia atau Arab)', 'error')
      return
    }
    setBusy(true)
    try {
      const res = await wiridNailulMurodAPI.createBab({ nama_id: namaId, nama_ar: namaAr })
      if (res?.success) {
        setNewNamaId('')
        setNewNamaAr('')
        showNotification('Bab ditambahkan', 'success')
        await loadRows()
        notifyChanged()
      } else {
        showNotification(res?.message || 'Gagal menambah bab', 'error')
      }
    } catch (e) {
      showNotification(e?.response?.data?.message || 'Gagal menambah bab', 'error')
    } finally {
      setBusy(false)
    }
  }, [loadRows, newNamaAr, newNamaId, notifyChanged, showNotification])

  const handlePersistOrder = useCallback(
    async (ordered) => {
      const order = ordered.map((r) => r.id)
      setBusy(true)
      try {
        const res = await wiridNailulMurodAPI.reorderBab({ order })
        if (res?.success && Array.isArray(res.data)) {
          setRows(res.data)
          notifyChanged()
        } else {
          showNotification(res?.message || 'Gagal mengubah urutan', 'error')
          await loadRows()
        }
      } catch (e) {
        showNotification(e?.response?.data?.message || 'Gagal mengubah urutan', 'error')
        await loadRows()
      } finally {
        setBusy(false)
      }
    },
    [loadRows, notifyChanged, showNotification]
  )

  const handleRename = useCallback(
    async (id, fields) => {
      setBusy(true)
      try {
        const res = await wiridNailulMurodAPI.updateBab(id, fields)
        if (res?.success) {
          showNotification('Nama bab diperbarui', 'success')
          await loadRows()
          notifyChanged()
        } else {
          showNotification(res?.message || 'Gagal mengubah nama bab', 'error')
        }
      } catch (e) {
        showNotification(e?.response?.data?.message || 'Gagal mengubah nama bab', 'error')
      } finally {
        setBusy(false)
      }
    },
    [loadRows, notifyChanged, showNotification]
  )

  const handleDelete = useCallback(
    async (row) => {
      if ((row.jumlah_entri ?? 0) > 0) return
      if (!window.confirm(`Hapus bab "${row.nama}"?`)) return
      setDeletingId(row.id)
      try {
        const res = await wiridNailulMurodAPI.deleteBab(row.id)
        if (res?.success) {
          showNotification('Bab dihapus', 'success')
          await loadRows()
          notifyChanged()
        } else {
          showNotification(res?.message || 'Gagal menghapus bab', 'error')
        }
      } catch (e) {
        showNotification(e?.response?.data?.message || 'Gagal menghapus bab', 'error')
      } finally {
        setDeletingId(null)
      }
    },
    [loadRows, notifyChanged, showNotification]
  )

  if (typeof document === 'undefined') return null

  const t = { type: 'tween', duration: 0.28, ease: [0.32, 0.72, 0, 1] }

  return createPortal(
    <AnimatePresence mode="sync" onExitComplete={onExitComplete}>
      {isOpen && (
        <motion.div
          key="wirid-bab-offcanvas-layer"
          className="fixed inset-0 z-[10220] flex pointer-events-none"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22, ease: 'easeOut' }}
        >
          <button
            type="button"
            aria-label="Tutup"
            className="absolute inset-0 z-0 w-full h-full border-0 cursor-default bg-black/50 dark:bg-black/60 pointer-events-auto"
            onClick={closeWithBack}
          />
          <motion.aside
            className="relative z-10 flex h-full min-h-0 w-full max-w-md flex-col overflow-hidden bg-white dark:bg-gray-900 shadow-2xl pointer-events-auto sm:ml-auto"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={t}
            role="dialog"
            aria-modal="true"
            aria-label="Kelola bab"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="shrink-0 border-b border-gray-200/80 dark:border-gray-700/80 bg-gray-50/50 dark:bg-gray-900/30 px-3 py-2.5 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-gray-900 dark:text-white">Kelola bab</h2>
                <p className="text-[11px] text-gray-500 dark:text-gray-400">
                  Atur urutan, tambah, ubah nama, atau hapus bab kosong.
                </p>
              </div>
              <button
                type="button"
                onClick={closeWithBack}
                className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-200/80 dark:hover:bg-gray-800 shrink-0"
                aria-label="Tutup"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="shrink-0 px-3 py-3 border-b border-gray-200/80 dark:border-gray-700/80 space-y-2">
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
                Tambah bab baru
              </label>
              <input
                type="text"
                value={newNamaId}
                disabled={busy}
                onChange={(e) => setNewNamaId(e.target.value)}
                placeholder="Nama Indonesia"
                className="w-full px-2.5 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 dark:text-gray-100 focus:ring-1 focus:ring-teal-500 focus:outline-none disabled:opacity-50"
              />
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newNamaAr}
                  disabled={busy}
                  onChange={(e) => setNewNamaAr(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      handleAdd()
                    }
                  }}
                  placeholder="Nama Arab"
                  dir="rtl"
                  lang="ar"
                  className="flex-1 min-w-0 px-2.5 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 dark:text-gray-100 text-right focus:ring-1 focus:ring-teal-500 focus:outline-none disabled:opacity-50"
                />
                <button
                  type="button"
                  onClick={handleAdd}
                  disabled={busy || (!String(newNamaId).trim() && !String(newNamaAr).trim())}
                  className={ocBtnPrimary}
                  title="Tambah bab"
                  aria-label="Tambah bab"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3">
              {loading ? (
                <div className="flex justify-center py-10">
                  <div className="animate-spin rounded-full h-7 w-7 border-2 border-teal-500 border-t-transparent" />
                </div>
              ) : (
                <NailulMurodBabReorderList
                  rows={rows}
                  disabled={busy}
                  titleLang={titleLang}
                  onPersistOrder={handlePersistOrder}
                  onRename={handleRename}
                  onDelete={handleDelete}
                  deletingId={deletingId}
                />
              )}
            </div>

            <div className="shrink-0 border-t border-gray-200/80 dark:border-gray-700/80 bg-gray-50/80 dark:bg-gray-900/40 px-3 py-2.5 flex justify-end">
              <button type="button" onClick={closeWithBack} className={ocBtnGhost}>
                Tutup
              </button>
            </div>
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}
