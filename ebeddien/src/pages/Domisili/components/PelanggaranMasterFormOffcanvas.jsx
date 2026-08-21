import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { pelanggaranAdminAPI } from '../../../services/api'
import { useNotification } from '../../../contexts/NotificationContext'
import { useOffcanvasBackClose } from '../../../hooks/useOffcanvasBackClose'

export const PELANGGARAN_KATEGORI_OPTIONS = [
  { value: 'ringan', label: 'Ringan' },
  { value: 'sedang', label: 'Sedang' },
  { value: 'berat', label: 'Berat' },
  { value: 'buku_hitam', label: 'Buku Hitam' },
]

export function labelKategoriPelanggaran(v) {
  const row = PELANGGARAN_KATEGORI_OPTIONS.find((x) => x.value === v)
  return row ? row.label : v != null ? String(v) : '–'
}

/** Kelas warna badge kategori pelanggaran. */
export function badgeClassKategoriPelanggaran(v) {
  const k = String(v || '').toLowerCase()
  if (k === 'berat') return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
  if (k === 'sedang') return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300'
  if (k === 'ringan') return 'bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300'
  if (k === 'buku_hitam') return 'bg-gray-800 text-gray-100 dark:bg-gray-900 dark:text-gray-200'
  return 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
}

/**
 * Offcanvas form buat/ubah jenis pelanggaran (master).
 * @param {{ isOpen: boolean, onClose: () => void, editingRow?: object|null, onSaved?: (row?: object) => void, zIndex?: number }} props
 */
export default function PelanggaranMasterFormOffcanvas({
  isOpen,
  onClose,
  editingRow = null,
  onSaved,
  zIndex = 220,
}) {
  const { showNotification } = useNotification()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [formData, setFormData] = useState({
    kategori: 'ringan',
    nama: '',
    keterangan: '',
    urutan: 0,
    aktif: true,
  })

  useEffect(() => {
    if (!isOpen) return
    const stripSeedMarker = (v) => String(v || '').replace(/\s*<!--ppsa-seed-->\s*/g, '').trim()
    if (editingRow) {
      setFormData({
        kategori: String(editingRow?.kategori || 'ringan'),
        nama: editingRow?.nama || '',
        keterangan: stripSeedMarker(editingRow?.keterangan),
        urutan: editingRow?.urutan != null ? Number(editingRow.urutan) : 0,
        aktif: Number(editingRow?.aktif) === 1 || editingRow?.aktif === true || editingRow?.aktif === '1',
      })
    } else {
      setFormData({ kategori: 'ringan', nama: '', keterangan: '', urutan: 0, aktif: true })
    }
    setError('')
  }, [isOpen, editingRow])

  const handleClose = useOffcanvasBackClose(isOpen, () => {
    if (saving) return
    onClose?.()
  })

  const handleSubmit = async (e) => {
    e.preventDefault()
    const nama = String(formData.nama || '').trim()
    if (!nama) {
      showNotification('Nama pelanggaran wajib diisi', 'error')
      return
    }
    const payload = {
      kategori: formData.kategori,
      nama,
      keterangan: String(formData.keterangan || '').trim(),
      urutan: Number(formData.urutan) || 0,
      aktif: formData.aktif ? 1 : 0,
    }
    try {
      setSaving(true)
      setError('')
      const res = editingRow
        ? await pelanggaranAdminAPI.update(editingRow.id, payload)
        : await pelanggaranAdminAPI.create(payload)
      if (res?.success) {
        showNotification(editingRow ? 'Data diperbarui' : 'Jenis pelanggaran ditambahkan', 'success')
        onSaved?.(res?.data || { ...payload, id: res?.data?.id })
        onClose?.()
        return
      }
      setError(res?.message || 'Gagal menyimpan')
    } catch (err) {
      setError(err?.response?.data?.message || 'Gagal menyimpan')
    } finally {
      setSaving(false)
    }
  }

  if (typeof document === 'undefined') return null

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            key="pelanggaran-master-form-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => !saving && handleClose()}
            className="fixed inset-0 bg-black/50"
            style={{ zIndex }}
          />
          <motion.div
            key="pelanggaran-master-form-panel"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'tween', duration: 0.2 }}
            className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-white dark:bg-gray-800 shadow-xl flex flex-col"
            style={{ zIndex: zIndex + 1 }}
          >
            <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
                {editingRow ? 'Ubah pelanggaran' : 'Tambah pelanggaran'}
              </h3>
              <button
                type="button"
                onClick={() => !saving && handleClose()}
                className="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Kategori *</label>
                  <select
                    value={formData.kategori}
                    onChange={(e) => setFormData((prev) => ({ ...prev, kategori: e.target.value }))}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-gray-100"
                  >
                    {PELANGGARAN_KATEGORI_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Nama *</label>
                  <input
                    type="text"
                    value={formData.nama}
                    onChange={(e) => setFormData((prev) => ({ ...prev, nama: e.target.value }))}
                    required
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-gray-100"
                    placeholder="Judul singkat"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Keterangan</label>
                  <textarea
                    value={formData.keterangan}
                    onChange={(e) => setFormData((prev) => ({ ...prev, keterangan: e.target.value }))}
                    rows={4}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-gray-100"
                    placeholder="Uraian lengkap (opsional)"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Urutan</label>
                  <input
                    type="number"
                    value={formData.urutan}
                    onChange={(e) => setFormData((prev) => ({ ...prev, urutan: parseInt(e.target.value, 10) || 0 }))}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-gray-100"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Status</label>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      {formData.aktif ? 'Aktif' : 'Tidak aktif'}
                    </span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={formData.aktif}
                      onClick={() => setFormData((prev) => ({ ...prev, aktif: !prev.aktif }))}
                      className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                        formData.aktif ? 'bg-teal-600' : 'bg-gray-300 dark:bg-gray-600'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
                          formData.aktif ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                </div>
                {error && (
                  <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg text-sm">
                    {error}
                  </div>
                )}
              </div>
              <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => !saving && handleClose()}
                  className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 text-sm"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 text-sm"
                >
                  {saving ? 'Menyimpan…' : editingRow ? 'Simpan' : 'Tambah'}
                </button>
              </div>
            </form>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  )
}
