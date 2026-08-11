import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { getPengurus, createPengurus, updatePengurus, resetPengurusPassword, type PengurusRow } from '../api/apiClient'

const EMPTY_FORM = { nip: '', nama: '', jabatan: '', akses: 'user' }

export default function PengurusPage() {
  const navigate = useNavigate()
  const [pengurus, setPengurus] = useState<PengurusRow[]>([])
  const [currentUserAkses, setCurrentUserAkses] = useState('user')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [offcanvasOpen, setOffcanvasOpen] = useState(false)
  const [formMode, setFormMode] = useState<'add' | 'edit'>('add')
  const [editingId, setEditingId] = useState('')
  const [formData, setFormData] = useState({ ...EMPTY_FORM })
  const [submitLoading, setSubmitLoading] = useState(false)
  const [resetLoading, setResetLoading] = useState(false)
  const [formError, setFormError] = useState('')

  const visiblePengurus = pengurus.filter(
    (p) => currentUserAkses === 'super_admin' || p.akses !== 'super_admin'
  )

  const fetchPengurus = async () => {
    setLoading(true)
    setError('')
    const res = await getPengurus()
    if (res.success) {
      setPengurus(res.data)
    } else {
      setError(res.message || 'Gagal memuat data pengurus')
    }
    setLoading(false)
  }

  useEffect(() => {
    try {
      const raw = localStorage.getItem('mdtwustha_user')
      if (raw) {
        const user = JSON.parse(raw) as { akses?: string }
        if (user.akses !== 'super_admin' && user.akses !== 'admin') {
          navigate('/dashboard', { replace: true })
          return
        }
        setCurrentUserAkses(user.akses || 'user')
      } else {
        navigate('/', { replace: true })
        return
      }
    } catch {
      navigate('/', { replace: true })
      return
    }

    fetchPengurus()
  }, [navigate])

  const openAdd = () => {
    setFormMode('add')
    setEditingId('')
    setFormData({ ...EMPTY_FORM })
    setFormError('')
    setOffcanvasOpen(true)
  }

  const openEdit = (row: PengurusRow) => {
    setFormMode('edit')
    setEditingId(row.id)
    setFormData({
      nip: row.nip || '',
      nama: row.nama || '',
      jabatan: row.jabatan || '',
      akses: row.akses || 'user',
    })
    setFormError('')
    setOffcanvasOpen(true)
  }

  const closeOffcanvas = () => {
    setOffcanvasOpen(false)
    setFormData({ ...EMPTY_FORM })
    setEditingId('')
    setFormError('')
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
    setFormError('')
  }

  const nipSudahAda = (nip: string) => pengurus.some((p) => p.nip === nip)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError('')

    const nip = formData.nip.trim()
    const nama = formData.nama.trim()

    if (!nip || !nama) {
      setFormError('NIP dan Nama wajib diisi')
      return
    }

    if (formMode === 'add' && nipSudahAda(nip)) {
      setFormError('NIP sudah terdaftar. Gunakan NIP lain.')
      return
    }

    setSubmitLoading(true)

    const res =
      formMode === 'add'
        ? await createPengurus({
            nip,
            nama,
            jabatan: formData.jabatan.trim(),
            akses: formData.akses,
          })
        : await updatePengurus(editingId, {
            nama,
            jabatan: formData.jabatan.trim(),
            akses: formData.akses,
          })

    setSubmitLoading(false)

    if (res.success) {
      if (formMode === 'add') {
        alert('Pengurus berhasil ditambahkan! Password dapat diisi saat login pertama kali.')
      }
      closeOffcanvas()
      fetchPengurus()
    } else {
      setFormError(res.message || 'Gagal menyimpan pengurus')
    }
  }

  const handleResetPassword = async () => {
    if (formMode !== 'edit' || !editingId) return
    const nama = formData.nama.trim() || 'pengurus ini'
    if (
      !confirm(
        `Reset password untuk "${nama}"?\n\nPassword akan dikosongkan. Saat login berikutnya, pengurus wajib mengisi password baru (sama seperti login pertama kali).`
      )
    ) {
      return
    }
    setResetLoading(true)
    setFormError('')
    const res = await resetPengurusPassword(editingId)
    setResetLoading(false)
    if (res.success) {
      alert(res.message || 'Password berhasil direset.')
    } else {
      setFormError(res.message || 'Gagal mereset password')
    }
  }

  return (
    <>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="ui-title-lg">Data Pengurus</h1>
            <p className="ui-subtitle mt-1">Kelola data pengurus dan hak akses sistem.</p>
          </div>
          <button
            type="button"
            onClick={openAdd}
            className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition shadow-lg shadow-blue-500/20 flex items-center gap-2"
          >
            <span>➕</span> Tambah Pengurus
          </button>
        </div>

        {error && <div className="ui-error-box px-4 py-3 text-sm">{error}</div>}

        <div className="ui-table-wrap">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="ui-table-head">
                <tr>
                  <th className="px-6 py-4 font-medium">NIP</th>
                  <th className="px-6 py-4 font-medium">Nama</th>
                  <th className="px-6 py-4 font-medium">Jabatan</th>
                  <th className="px-6 py-4 font-medium">Akses</th>
                </tr>
              </thead>
              <tbody className="ui-table-body">
                {loading ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-8 text-center ui-text-muted">
                      <div className="flex items-center justify-center gap-3">
                        <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                        Memuat data...
                      </div>
                    </td>
                  </tr>
                ) : visiblePengurus.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-8 text-center ui-text-muted">
                      Belum ada data pengurus
                    </td>
                  </tr>
                ) : (
                  visiblePengurus.map((p) => (
                    <tr
                      key={p.id}
                      className="ui-table-row cursor-pointer"
                      onClick={() => openEdit(p)}
                      onKeyDown={(e) => e.key === 'Enter' && openEdit(p)}
                      tabIndex={0}
                      role="button"
                    >
                      <td className="px-6 py-4">{p.nip}</td>
                      <td className="px-6 py-4 font-medium text-slate-800 dark:text-slate-200">{p.nama}</td>
                      <td className="px-6 py-4 ui-text-muted">{p.jabatan || '-'}</td>
                      <td className="px-6 py-4">
                        <span
                          className={`px-2.5 py-1 rounded-full text-xs font-medium border ${
                            p.akses === 'super_admin'
                              ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20'
                              : p.akses === 'admin'
                                ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20'
                                : 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20'
                          }`}
                        >
                          {p.akses}
                        </span>
                      </td>
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
              aria-label={formMode === 'add' ? 'Tambah pengurus' : 'Edit pengurus'}
            >
              <div className="flex-shrink-0 flex items-center justify-between px-5 py-4 border-b ui-divider">
                <h2 className="text-lg font-bold text-slate-800 dark:text-slate-50 m-0">
                  {formMode === 'add' ? 'Tambah Pengurus' : 'Edit Pengurus'}
                </h2>
                <button type="button" onClick={closeOffcanvas} aria-label="Tutup" className="ui-btn-close">
                  ✕
                </button>
              </div>

              <form className="flex-1 flex flex-col min-h-0" onSubmit={handleSubmit}>
                <div className="flex-1 overflow-y-auto px-5 py-4 pb-6 space-y-4">
                  <div>
                    <label htmlFor="pengurus-nip" className="ui-label mb-1.5">
                      NIP
                    </label>
                    <input
                      id="pengurus-nip"
                      type="text"
                      name="nip"
                      value={formData.nip}
                      onChange={handleInputChange}
                      required
                      readOnly={formMode === 'edit'}
                      disabled={formMode === 'edit'}
                      className={`ui-input-lg ${formMode === 'edit' ? 'opacity-70 cursor-not-allowed bg-slate-100 dark:bg-slate-900/40' : ''}`}
                      placeholder="Masukkan NIP"
                    />
                    {formMode === 'edit' && (
                      <p className="text-xs ui-text-muted mt-1.5">NIP tidak dapat diubah setelah dibuat.</p>
                    )}
                  </div>

                  <div>
                    <label htmlFor="pengurus-nama" className="ui-label mb-1.5">
                      Nama Lengkap
                    </label>
                    <input
                      id="pengurus-nama"
                      type="text"
                      name="nama"
                      value={formData.nama}
                      onChange={handleInputChange}
                      required
                      className="ui-input-lg"
                      placeholder="Masukkan Nama"
                    />
                  </div>

                  <div>
                    <label htmlFor="pengurus-jabatan" className="ui-label mb-1.5">
                      Jabatan (Opsional)
                    </label>
                    <input
                      id="pengurus-jabatan"
                      type="text"
                      name="jabatan"
                      value={formData.jabatan}
                      onChange={handleInputChange}
                      className="ui-input-lg"
                      placeholder="Cth: Bendahara"
                    />
                  </div>

                  <div>
                    <label htmlFor="pengurus-akses" className="ui-label mb-1.5">
                      Hak Akses
                    </label>
                    <select
                      id="pengurus-akses"
                      name="akses"
                      value={formData.akses}
                      onChange={handleInputChange}
                      className="ui-input-lg appearance-none"
                    >
                      <option value="user">User Biasa</option>
                      <option value="admin">Admin</option>
                      {currentUserAkses === 'super_admin' && (
                        <option value="super_admin">Super Admin</option>
                      )}
                    </select>
                  </div>

                  {formMode === 'edit' && (
                    <div className="pt-2 border-t ui-divider space-y-2">
                      <p className="ui-label">Password</p>
                      <p className="text-xs ui-text-muted">
                        Jika pengurus lupa password, reset di sini. Kolom password dikosongkan sehingga login
                        berikutnya dianggap pengisian password pertama.
                      </p>
                      <button
                        type="button"
                        onClick={handleResetPassword}
                        disabled={resetLoading || submitLoading}
                        className="w-full py-2.5 px-4 text-sm font-medium rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300 hover:bg-amber-500/20 transition disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {resetLoading ? 'Mereset…' : 'Reset Password'}
                      </button>
                    </div>
                  )}

                  {formError && (
                    <div className="px-3 py-2.5 text-sm ui-error-box">{formError}</div>
                  )}
                </div>

                <div className="flex-shrink-0 flex gap-3 px-5 py-4 border-t ui-divider">
                  <button type="button" onClick={closeOffcanvas} className="flex-1 py-2.5 px-4 ui-btn-secondary">
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={submitLoading}
                    className="flex-1 py-2.5 px-4 ui-btn-primary disabled:opacity-70 disabled:cursor-not-allowed"
                  >
                    {submitLoading ? 'Menyimpan...' : formMode === 'add' ? 'Simpan' : 'Perbarui'}
                  </button>
                </div>
              </form>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  )
}
