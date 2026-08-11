import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { createPortal } from 'react-dom'
import { tahunAjaranAPI, ugtGuruTugasTugasanAPI } from '../../../services/api'
import { useNotification } from '../../../contexts/NotificationContext'
import { useAuthStore } from '../../../store/authStore'
import { userCanTambahGtTugasan } from '../../../utils/ugtGuruTugasanAccess'

const BULK_ACTIONS = [
  { key: 'tahun_ajaran', label: 'Ubah tahun ajaran penugasan' },
  { key: 'nonaktif', label: 'Nonaktifkan penugasan' },
]

export default function BulkEditGuruTugasOffcanvas({
  isOpen,
  onClose,
  selectedRows,
  currentTahunAjaran,
  onSuccess,
}) {
  const { showNotification } = useNotification()
  const fiturMenuCodes = useAuthStore((s) => s.fiturMenuCodes)
  const user = useAuthStore((s) => s.user)
  const canEdit = userCanTambahGtTugasan(fiturMenuCodes, user, true)

  const [loading, setLoading] = useState(false)
  const [action, setAction] = useState('')
  const [tahunAjaranOptions, setTahunAjaranOptions] = useState([])
  const [newTahunAjaran, setNewTahunAjaran] = useState('')

  const rows = Array.isArray(selectedRows) ? selectedRows : []
  const withTugasan = rows.filter((r) => r?.id_tugasan != null && Number(r.id_tugasan) > 0)

  useEffect(() => {
    if (!isOpen) return
    setAction('')
    setNewTahunAjaran('')
    let cancelled = false
    tahunAjaranAPI.getAll({ kategori: 'hijriyah' }).then((res) => {
      if (cancelled) return
      const list = (res?.success && Array.isArray(res.data) ? res.data : [])
        .map((t) => String(t.tahun_ajaran || t.id || '').trim())
        .filter(Boolean)
      setTahunAjaranOptions(list)
      if (list.length && !newTahunAjaran) {
        const pref = String(currentTahunAjaran || '').trim()
        setNewTahunAjaran(list.includes(pref) ? pref : list[0])
      }
    }).catch(() => {
      if (!cancelled) setTahunAjaranOptions([])
    })
    return () => { cancelled = true }
  }, [isOpen, currentTahunAjaran])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!canEdit) {
      showNotification('Anda tidak memiliki izin mengubah penugasan Guru Tugas', 'error')
      return
    }
    if (!action) {
      showNotification('Pilih aksi ubah massal', 'error')
      return
    }
    if (withTugasan.length === 0) {
      showNotification('Tidak ada penugasan (id tugasan) pada baris terpilih', 'error')
      return
    }
    if (action === 'tahun_ajaran') {
      const ta = String(newTahunAjaran || '').trim()
      if (!ta) {
        showNotification('Pilih tahun ajaran tujuan', 'error')
        return
      }
    }

    setLoading(true)
    let ok = 0
    let fail = 0
    for (const row of withTugasan) {
      const id = Number(row.id_tugasan)
      try {
        let res
        if (action === 'nonaktif') {
          res = await ugtGuruTugasTugasanAPI.patch(id, { is_aktif: 0 })
        } else {
          res = await ugtGuruTugasTugasanAPI.patch(id, {
            id_tahun_ajaran: String(newTahunAjaran).trim(),
          })
        }
        if (res?.success) ok++
        else fail++
      } catch {
        fail++
      }
    }
    setLoading(false)
    showNotification(
      `Ubah massal selesai: ${ok} berhasil, ${fail} gagal`,
      ok > 0 ? 'success' : 'warning'
    )
    if (ok > 0) {
      onSuccess?.()
      onClose()
    }
  }

  if (!isOpen) return null

  const content = (
    <AnimatePresence>
      <motion.div
        key="bulk-gt-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 z-[100010]"
        onClick={onClose}
        aria-hidden="true"
      />
      <motion.div
        key="bulk-gt-panel"
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'tween', duration: 0.25 }}
        className="fixed top-0 right-0 bottom-0 w-full max-w-md bg-white dark:bg-gray-800 shadow-xl z-[100011] flex flex-col"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Ubah Massal Guru Tugas</h3>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
            aria-label="Tutup"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              <strong>{rows.length}</strong> santri terpilih
              {withTugasan.length !== rows.length && (
                <span className="text-amber-700 dark:text-amber-300">
                  {' '}
                  ({withTugasan.length} punya penugasan pada TA {currentTahunAjaran || '—'})
                </span>
              )}
            </p>
            {!canEdit && (
              <p className="text-sm text-amber-700 dark:text-amber-300 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-3 py-2">
                Anda tidak memiliki izin mengubah penugasan (aksi tambah penugasan).
              </p>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Aksi</label>
              <select
                value={action}
                onChange={(e) => setAction(e.target.value)}
                disabled={!canEdit}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 disabled:opacity-50"
              >
                <option value="">-- Pilih aksi --</option>
                {BULK_ACTIONS.map((a) => (
                  <option key={a.key} value={a.key}>{a.label}</option>
                ))}
              </select>
            </div>
            {action === 'tahun_ajaran' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Tahun ajaran baru
                </label>
                <select
                  value={newTahunAjaran}
                  onChange={(e) => setNewTahunAjaran(e.target.value)}
                  disabled={!canEdit}
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 disabled:opacity-50"
                >
                  <option value="">-- Pilih --</option>
                  {tahunAjaranOptions.map((ta) => (
                    <option key={ta} value={ta}>{ta}</option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Memindahkan penugasan terpilih ke tahun ajaran lain (satu madrasah per kombinasi santri+TA).
                </p>
              </div>
            )}
            {action === 'nonaktif' && (
              <p className="text-sm text-gray-600 dark:text-gray-400 rounded-lg border border-gray-200 dark:border-gray-600 px-3 py-2">
                Semua penugasan terpilih akan ditandai nonaktif. Santri tidak hilang dari daftar historis; penugasan nonaktif tidak dipakai laporan PJGT.
              </p>
            )}
          </div>
          <div className="p-4 border-t border-gray-200 dark:border-gray-700">
            <button
              type="submit"
              disabled={!canEdit || !action || loading || withTugasan.length === 0}
              className="w-full px-4 py-2.5 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white font-medium rounded-lg"
            >
              {loading ? 'Menerapkan...' : `Terapkan ke ${withTugasan.length} penugasan`}
            </button>
          </div>
        </form>
      </motion.div>
    </AnimatePresence>
  )

  return createPortal(content, document.body)
}
