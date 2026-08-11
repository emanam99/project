import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  getKelas,
  createKelas,
  updateKelas,
  deleteKelas,
  getPengurus,
  type KelasRow,
  type PengurusRow,
} from '../api/apiClient'

type FormData = {
  nama_kelas: string
  kel: string
  wali_kelas_id: string
}

const EMPTY_FORM: FormData = { nama_kelas: '', kel: '', wali_kelas_id: '' }

function formatKelasLabel(nama: string, kel?: string) {
  return kel ? `${nama} · ${kel}` : nama
}

function isAdminAkses(akses?: string) {
  return akses === 'super_admin' || akses === 'admin'
}

export default function KelasPage() {
  const navigate = useNavigate()
  const [kelasList, setKelasList] = useState<KelasRow[]>([])
  const [pengurusList, setPengurusList] = useState<PengurusRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [offcanvasOpen, setOffcanvasOpen] = useState(false)
  const [formMode, setFormMode] = useState<'add' | 'edit'>('add')
  const [editingId, setEditingId] = useState('')
  const [formData, setFormData] = useState<FormData>({ ...EMPTY_FORM })
  const [submitLoading, setSubmitLoading] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)

  const fetchData = async () => {
    setLoading(true)
    setError('')
    const [kelasRes, pengurusRes] = await Promise.all([getKelas(), getPengurus()])
    if (kelasRes.success) setKelasList(kelasRes.data)
    else setError(kelasRes.message || 'Gagal memuat data kelas')
    if (pengurusRes.success) setPengurusList(pengurusRes.data)
    setLoading(false)
  }

  useEffect(() => {
    try {
      const raw = localStorage.getItem('mdtwustha_user')
      if (!raw) {
        navigate('/', { replace: true })
        return
      }
      const user = JSON.parse(raw) as { akses?: string }
      if (!isAdminAkses(user.akses)) {
        navigate('/dashboard', { replace: true })
        return
      }
    } catch {
      navigate('/', { replace: true })
      return
    }
    fetchData()
  }, [navigate])

  const openAdd = () => {
    setFormMode('add')
    setEditingId('')
    setFormData({ ...EMPTY_FORM })
    setOffcanvasOpen(true)
  }

  const openEdit = (row: KelasRow) => {
    setFormMode('edit')
    setEditingId(row.id)
    setFormData({
      nama_kelas: row.nama_kelas || '',
      kel: row.kel || '',
      wali_kelas_id: row.wali_kelas_id ? String(row.wali_kelas_id) : '',
    })
    setOffcanvasOpen(true)
  }

  const closeOffcanvas = () => {
    setOffcanvasOpen(false)
    setFormData({ ...EMPTY_FORM })
    setEditingId('')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.nama_kelas.trim()) {
      alert('Nama kelas wajib diisi')
      return
    }

    setSubmitLoading(true)
    const payload = {
      nama_kelas: formData.nama_kelas.trim(),
      kel: formData.kel.trim(),
      wali_kelas_id: formData.wali_kelas_id || undefined,
    }

    const res =
      formMode === 'add'
        ? await createKelas(payload)
        : await updateKelas(editingId, payload)

    setSubmitLoading(false)

    if (res.success) {
      closeOffcanvas()
      fetchData()
    } else {
      alert(res.message || 'Gagal menyimpan kelas')
    }
  }

  const handleDelete = async () => {
    if (!editingId) return
    const row = kelasList.find((k) => k.id === editingId)
    const label = row ? formatKelasLabel(row.nama_kelas, row.kel) : 'kelas ini'
    if (!confirm(`Hapus ${label}?`)) return

    setDeleteLoading(true)
    const res = await deleteKelas(editingId)
    setDeleteLoading(false)

    if (res.success) {
      closeOffcanvas()
      fetchData()
    } else {
      alert(res.message || 'Gagal menghapus kelas')
    }
  }

  return (
    <>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="ui-title-lg">Data Kelas</h1>
            <p className="ui-subtitle mt-1">Kelola kelas dan wali kelas.</p>
          </div>
          <button
            type="button"
            onClick={openAdd}
            className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition shadow-lg shadow-blue-500/20 flex items-center gap-2"
          >
            <span>➕</span> Tambah Kelas
          </button>
        </div>

        {error && <div className="ui-error-box px-4 py-3 text-sm">{error}</div>}

        <div className="ui-table-wrap">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="ui-table-head">
                <tr>
                  <th className="px-6 py-4 font-medium">Nama Kelas</th>
                  <th className="px-6 py-4 font-medium">Kel</th>
                  <th className="px-6 py-4 font-medium">Wali Kelas</th>
                </tr>
              </thead>
              <tbody className="ui-table-body">
                {loading ? (
                  <tr>
                    <td colSpan={3} className="px-6 py-8 text-center ui-text-muted">
                      <div className="flex items-center justify-center gap-3">
                        <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                        Memuat data...
                      </div>
                    </td>
                  </tr>
                ) : kelasList.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-6 py-8 text-center ui-text-muted">
                      Belum ada data kelas
                    </td>
                  </tr>
                ) : (
                  kelasList.map((row) => (
                    <tr
                      key={row.id}
                      className="ui-table-row cursor-pointer"
                      onClick={() => openEdit(row)}
                      onKeyDown={(e) => e.key === 'Enter' && openEdit(row)}
                      tabIndex={0}
                      role="button"
                    >
                      <td className="px-6 py-4 font-medium text-slate-800 dark:text-slate-200">
                        {row.nama_kelas}
                      </td>
                      <td className="px-6 py-4 ui-text-muted">{row.kel || '–'}</td>
                      <td className="px-6 py-4 ui-text-muted">{row.wali_kelas_nama || '–'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {offcanvasOpen && (
          <>
            <motion.div
              className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[1000]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              onClick={closeOffcanvas}
              aria-hidden
            />
            <motion.aside
              className="ui-offcanvas z-[1001]"
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'tween', duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
              role="dialog"
              aria-modal="true"
              aria-label={formMode === 'add' ? 'Tambah kelas' : 'Edit kelas'}
            >
              <div className="flex-shrink-0 flex items-center justify-between px-5 py-4 border-b ui-divider">
                <h2 className="text-lg font-bold text-slate-800 dark:text-slate-50 m-0">
                  {formMode === 'add' ? 'Tambah Kelas' : 'Edit Kelas'}
                </h2>
                <button type="button" onClick={closeOffcanvas} aria-label="Tutup" className="ui-btn-close">
                  ✕
                </button>
              </div>

              <form className="flex-1 flex flex-col min-h-0" onSubmit={handleSubmit}>
                <div className="flex-1 overflow-y-auto px-5 py-4 pb-6 space-y-4">
                  <div>
                    <label htmlFor="kelas-nama" className="ui-label mb-1.5">
                      Nama Kelas
                    </label>
                    <input
                      id="kelas-nama"
                      type="text"
                      value={formData.nama_kelas}
                      onChange={(e) => setFormData((prev) => ({ ...prev, nama_kelas: e.target.value }))}
                      required
                      className="ui-input-lg"
                      placeholder="Cth: 1A, 2B"
                    />
                  </div>

                  <div>
                    <label htmlFor="kelas-kel" className="ui-label mb-1.5">
                      Kel (kelompok)
                    </label>
                    <input
                      id="kelas-kel"
                      type="text"
                      value={formData.kel}
                      onChange={(e) => setFormData((prev) => ({ ...prev, kel: e.target.value }))}
                      className="ui-input-lg"
                      placeholder="Cth: A, B, atau kosongkan"
                    />
                  </div>

                  <div>
                    <label htmlFor="kelas-wali" className="ui-label mb-1.5">
                      Wali Kelas
                    </label>
                    <select
                      id="kelas-wali"
                      value={formData.wali_kelas_id}
                      onChange={(e) => setFormData((prev) => ({ ...prev, wali_kelas_id: e.target.value }))}
                      className="ui-input-lg appearance-none"
                    >
                      <option value="">– Belum ditentukan –</option>
                      {pengurusList.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nama}
                          {p.jabatan ? ` (${p.jabatan})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex-shrink-0 flex flex-col gap-3 px-5 py-4 border-t ui-divider">
                  {formMode === 'edit' && (
                    <button
                      type="button"
                      onClick={handleDelete}
                      disabled={deleteLoading || submitLoading}
                      className="w-full py-2.5 px-4 text-sm font-medium rounded-lg text-red-600 dark:text-red-400 border border-red-500/30 hover:bg-red-500/10 transition disabled:opacity-50"
                    >
                      {deleteLoading ? 'Menghapus...' : 'Hapus Kelas'}
                    </button>
                  )}
                  <div className="flex gap-3">
                    <button type="button" onClick={closeOffcanvas} className="flex-1 py-2.5 px-4 ui-btn-secondary">
                      Batal
                    </button>
                    <button
                      type="submit"
                      disabled={submitLoading || deleteLoading}
                      className="flex-1 py-2.5 px-4 ui-btn-primary disabled:opacity-70 disabled:cursor-not-allowed"
                    >
                      {submitLoading ? 'Menyimpan...' : formMode === 'add' ? 'Simpan' : 'Perbarui'}
                    </button>
                  </div>
                </div>
              </form>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  )
}
