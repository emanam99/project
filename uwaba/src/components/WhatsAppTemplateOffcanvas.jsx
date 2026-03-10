import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { whatsappTemplateAPI } from '../services/api'
import { useAuthStore } from '../store/authStore'
import { useNotification } from '../contexts/NotificationContext'

const KATEGORI_OPTIONS = ['umum', 'pendaftaran', 'uwaba', 'keuangan', 'lainnya']

/**
 * Offcanvas kanan: kelola template WhatsApp (tambah, edit, hapus).
 * Hanya super_admin yang bisa tambah/edit/hapus; semua role yang bisa akses chat bisa buka untuk lihat (panggil dari Header hanya untuk super_admin).
 */
function WhatsAppTemplateOffcanvas({ isOpen, onClose }) {
  const { user } = useAuthStore()
  const { showNotification } = useNotification()
  const isSuperAdmin = user?.is_real_super_admin === true

  const [list, setList] = useState([])
  const [loading, setLoading] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState({ kategori: 'umum', nama: '', isi_pesan: '' })
  const [saving, setSaving] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(null)

  const fetchList = async () => {
    setLoading(true)
    try {
      const res = await whatsappTemplateAPI.list()
      const data = Array.isArray(res?.data) ? res.data : []
      setList(data)
    } catch (e) {
      console.error('Fetch template:', e)
      setList([])
      showNotification('Gagal memuat template', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (isOpen) fetchList()
    else {
      setFormOpen(false)
      setEditingId(null)
      setDeleteConfirm(null)
      setForm({ kategori: 'umum', nama: '', isi_pesan: '' })
    }
  }, [isOpen])

  const byCategory = list.reduce((acc, t) => {
    const k = t.kategori || 'umum'
    if (!acc[k]) acc[k] = []
    acc[k].push(t)
    return acc
  }, {})
  const categories = Object.keys(byCategory).sort()

  const openAdd = () => {
    setEditingId(null)
    setForm({ kategori: 'umum', nama: '', isi_pesan: '' })
    setFormOpen(true)
  }
  const openEdit = (row) => {
    setEditingId(row.id)
    setForm({
      kategori: row.kategori || 'umum',
      nama: row.nama || '',
      isi_pesan: row.isi_pesan || ''
    })
    setFormOpen(true)
  }
  const closeForm = () => {
    setFormOpen(false)
    setEditingId(null)
    setForm({ kategori: 'umum', nama: '', isi_pesan: '' })
  }

  const handleSave = async () => {
    const nama = (form.nama || '').trim()
    const isi_pesan = (form.isi_pesan || '').trim()
    if (!nama) {
      showNotification('Nama template wajib diisi', 'warning')
      return
    }
    if (!isi_pesan) {
      showNotification('Isi pesan wajib diisi', 'warning')
      return
    }
    setSaving(true)
    try {
      if (editingId) {
        const res = await whatsappTemplateAPI.update({
          id: editingId,
          kategori: form.kategori || 'umum',
          nama,
          isi_pesan
        })
        if (res?.success) {
          showNotification('Template berhasil diubah', 'success')
          closeForm()
          fetchList()
        } else {
          showNotification(res?.message || 'Gagal mengubah template', 'error')
        }
      } else {
        const res = await whatsappTemplateAPI.create({
          kategori: form.kategori || 'umum',
          nama,
          isi_pesan
        })
        if (res?.success) {
          showNotification('Template berhasil ditambah', 'success')
          closeForm()
          fetchList()
        } else {
          showNotification(res?.message || 'Gagal menambah template', 'error')
        }
      }
    } catch (e) {
      showNotification(e?.response?.data?.message || 'Gagal menyimpan', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id) => {
    if (!id) return
    setSaving(true)
    try {
      const res = await whatsappTemplateAPI.delete(id)
      if (res?.success) {
        showNotification('Template berhasil dihapus', 'success')
        setDeleteConfirm(null)
        fetchList()
      } else {
        showNotification(res?.message || 'Gagal menghapus', 'error')
      }
    } catch (e) {
      showNotification(e?.response?.data?.message || 'Gagal menghapus', 'error')
    } finally {
      setSaving(false)
    }
  }

  const content = (
    <>
      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              key="wa-template-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onClose}
              className="fixed inset-0 bg-black/40 z-[9998]"
            />
            <motion.div
              key="wa-template-panel"
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'tween', duration: 0.25 }}
              className="fixed top-0 right-0 bottom-0 w-full max-w-md bg-white dark:bg-gray-800 shadow-xl z-[9999] flex flex-col"
            >
              <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
                <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200">Template WhatsApp</h2>
                <div className="flex items-center gap-2">
                  {isSuperAdmin && (
                    <button
                      type="button"
                      onClick={openAdd}
                      className="px-3 py-1.5 text-sm font-medium text-white bg-teal-600 hover:bg-teal-700 rounded-lg transition-colors"
                    >
                      + Tambah
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={onClose}
                    className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300"
                    aria-label="Tutup"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4">
                {loading ? (
                  <div className="flex justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-2 border-teal-500 border-t-transparent" />
                  </div>
                ) : list.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">
                    Belum ada template. {isSuperAdmin && 'Klik "Tambah" untuk menambah template.'}
                  </p>
                ) : (
                  <div className="space-y-4">
                    {categories.map((kat) => (
                      <div key={kat} className="rounded-lg border border-gray-200 dark:border-gray-600 overflow-hidden">
                        <div className="px-3 py-2 bg-gray-50 dark:bg-gray-700/50 font-medium text-sm text-gray-700 dark:text-gray-200 capitalize">
                          {kat}
                        </div>
                        <ul className="divide-y divide-gray-200 dark:divide-gray-600">
                          {(byCategory[kat] || []).map((t) => (
                            <li key={t.id} className="px-3 py-2 flex items-start justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                <div className="font-medium text-sm text-gray-800 dark:text-gray-200">{t.nama}</div>
                                <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">
                                  {t.isi_pesan}
                                </div>
                              </div>
                              {isSuperAdmin && (
                                <div className="flex items-center gap-1 flex-shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => openEdit(t)}
                                    className="p-1.5 rounded text-teal-600 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-900/30"
                                    title="Edit"
                                  >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                    </svg>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setDeleteConfirm(t)}
                                    className="p-1.5 rounded text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30"
                                    title="Hapus"
                                  >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                  </button>
                                </div>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Form Tambah/Edit */}
      <AnimatePresence>
        {formOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeForm}
              className="fixed inset-0 bg-black/30 z-[10000]"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="fixed inset-x-4 top-[8%] sm:inset-x-auto sm:left-1/2 sm:top-1/2 sm:-translate-y-1/2 sm:-translate-x-1/2 w-auto sm:w-full sm:max-w-md bg-white dark:bg-gray-800 rounded-xl shadow-xl z-[10001] max-h-[84vh] sm:max-h-[90vh] flex flex-col"
            >
              <div className="px-4 pt-4 pb-2 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
                  {editingId ? 'Edit Template' : 'Tambah Template'}
                </h3>
                <button
                  type="button"
                  onClick={closeForm}
                  className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-300"
                  aria-label="Tutup"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="px-4 py-3 space-y-4 overflow-y-auto">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Kategori</label>
                  <select
                    value={form.kategori}
                    onChange={(e) => setForm((f) => ({ ...f, kategori: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200"
                  >
                    {KATEGORI_OPTIONS.map((k) => (
                      <option key={k} value={k}>{k}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nama template</label>
                  <input
                    type="text"
                    value={form.nama}
                    onChange={(e) => setForm((f) => ({ ...f, nama: e.target.value }))}
                    placeholder="Contoh: Konfirmasi pendaftaran"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Isi pesan</label>
                  <textarea
                    value={form.isi_pesan}
                    onChange={(e) => setForm((f) => ({ ...f, isi_pesan: e.target.value }))}
                    rows={4}
                    placeholder="Teks yang akan dikirim..."
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 resize-none"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 px-4 py-3 border-t border-gray-200 dark:border-gray-700">
                <button
                  type="button"
                  onClick={closeForm}
                  className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="px-4 py-2 text-sm font-medium text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-50 rounded-lg"
                >
                  {saving ? 'Menyimpan...' : (editingId ? 'Simpan' : 'Tambah')}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Konfirmasi hapus */}
      <AnimatePresence>
        {deleteConfirm && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDeleteConfirm(null)}
              className="fixed inset-0 bg-black/30 z-[10000]"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-sm bg-white dark:bg-gray-800 rounded-xl shadow-xl z-[10001] p-4"
            >
              <p className="text-gray-700 dark:text-gray-200 mb-4">
                Hapus template &quot;{deleteConfirm.nama}&quot;?
              </p>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setDeleteConfirm(null)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(deleteConfirm.id)}
                  disabled={saving}
                  className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded-lg"
                >
                  {saving ? 'Menghapus...' : 'Hapus'}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  )

  return createPortal(content, document.body)
}

export default WhatsAppTemplateOffcanvas
