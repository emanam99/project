import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { getSantriFromSheet, createSantriFromSheet, updateSantriFromSheet, type SantriRow } from '../api/appScript'

const EMPTY_SANTRI: SantriRow = {
  id: '',
  nomer_induk: '',
  nama: '',
  kelas: '',
  kamar: '',
  no_kk: '',
  nik: '',
  tempat_lahir: '',
  tanggal_lahir: '',
  jenis_kelamin: '',
  dusun: '',
  rt: '',
  rw: '',
  desa: '',
  kecamatan: '',
  kabupaten: '',
  provinsi: '',
  ayah: '',
  ibu: '',
  saudara_di_pesantren: '',
}

const FORM_FIELDS: { key: keyof SantriRow; label: string; type?: string }[] = [
  { key: 'nomer_induk', label: 'No. Induk' },
  { key: 'nama', label: 'Nama Lengkap' },
  { key: 'kelas', label: 'Kelas' },
  { key: 'kamar', label: 'Kamar' },
  { key: 'no_kk', label: 'No. KK' },
  { key: 'nik', label: 'NIK' },
  { key: 'tempat_lahir', label: 'Tempat Lahir' },
  { key: 'tanggal_lahir', label: 'Tanggal Lahir', type: 'date' },
  { key: 'jenis_kelamin', label: 'Jenis Kelamin' },
  { key: 'dusun', label: 'Dusun' },
  { key: 'rt', label: 'RT' },
  { key: 'rw', label: 'RW' },
  { key: 'desa', label: 'Desa' },
  { key: 'kecamatan', label: 'Kecamatan' },
  { key: 'kabupaten', label: 'Kabupaten' },
  { key: 'provinsi', label: 'Provinsi' },
  { key: 'ayah', label: 'Nama Ayah' },
  { key: 'ibu', label: 'Nama Ibu' },
  { key: 'saudara_di_pesantren', label: 'Saudara di Pesantren' },
]

function getInitial(nama: string) {
  const parts = (nama || '').trim().split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  return ((nama || '')[0] || '?').toUpperCase()
}

export default function DataSantriPage() {
  const [data, setData] = useState<SantriRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [offcanvasOpen, setOffcanvasOpen] = useState(false)
  const [formMode, setFormMode] = useState<'add' | 'edit'>('add')
  const [formData, setFormData] = useState<SantriRow>({ ...EMPTY_SANTRI })
  const [submitLoading, setSubmitLoading] = useState(false)
  const [submitError, setSubmitError] = useState('')

  const loadData = () => {
    getSantriFromSheet().then((res) => {
      if (res.success) setData(res.data)
      else setError(res.message || 'Gagal memuat data')
      setLoading(false)
    })
  }

  useEffect(() => {
    let cancelled = false
    getSantriFromSheet().then((res) => {
      if (cancelled) return
      if (res.success) setData(res.data)
      else setError(res.message || 'Gagal memuat data')
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [])

  const filtered = search.trim()
    ? data.filter(
        (row) =>
          (row.nama || '').toLowerCase().includes(search.toLowerCase()) ||
          (row.nomer_induk || '').toLowerCase().includes(search.toLowerCase())
      )
    : data

  const openAdd = () => {
    setFormMode('add')
    setFormData({ ...EMPTY_SANTRI })
    setSubmitError('')
    setOffcanvasOpen(true)
  }

  const openEdit = (row: SantriRow) => {
    setFormMode('edit')
    setFormData({ ...EMPTY_SANTRI, ...row })
    setSubmitError('')
    setOffcanvasOpen(true)
  }

  const closeOffcanvas = () => {
    setOffcanvasOpen(false)
    setSubmitError('')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitError('')
    setSubmitLoading(true)
    try {
      let idp = ''
      try {
        const raw = localStorage.getItem('mdtwustha_user')
        if (raw) {
          const user = JSON.parse(raw) as { id?: string }
          idp = user?.id ?? ''
        }
      } catch (_) {}
      const payload = { ...formData, idp }
      if (formMode === 'add') {
        const res = await createSantriFromSheet(payload)
        if (res.success) {
          loadData()
          closeOffcanvas()
        } else setSubmitError(res.message || 'Gagal menambah')
      } else {
        const res = await updateSantriFromSheet(payload)
        if (res.success) {
          loadData()
          closeOffcanvas()
        } else setSubmitError(res.message || 'Gagal memperbarui')
      }
    } catch {
      setSubmitError('Koneksi gagal')
    } finally {
      setSubmitLoading(false)
    }
  }

  return (
    <>
      <div className="w-full max-w-[480px] sm:max-w-2xl md:max-w-3xl lg:max-w-4xl xl:max-w-5xl mx-auto">
        <div className="flex items-center justify-between gap-3 mb-3">
          <h1 className="text-xl font-bold text-slate-50 tracking-tight">Data Santri</h1>
          <button
            type="button"
            onClick={openAdd}
            className="px-3.5 py-2 text-sm font-semibold text-white rounded-lg bg-gradient-to-r from-blue-500 to-blue-600 hover:shadow-md hover:shadow-blue-500/40 active:scale-[0.98] transition"
          >
            + Tambah
          </button>
        </div>
        <input
          type="search"
          placeholder="Cari nama atau no. induk..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-11 pr-4 py-3 rounded-xl text-slate-100 bg-slate-800/70 border border-white/10 placeholder-slate-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition bg-[length:1.1rem] bg-[position:0.85rem_center] bg-no-repeat mb-4"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='11' cy='11' r='8'/%3E%3Cpath d='m21 21-4.35-4.35'/%3E%3C/svg%3E")`,
          }}
        />

        <div className="bg-slate-800/50 backdrop-blur-xl border border-white/5 rounded-2xl overflow-hidden shadow-xl">
        {loading && (
          <motion.div
            className="flex items-center justify-center gap-3 py-8 text-slate-400"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <motion.span
              className="w-5 h-5 border-2 border-slate-500/30 border-t-slate-400 rounded-full"
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 0.8, ease: 'linear' }}
            />
            Memuat data...
          </motion.div>
        )}
        {error && (
          <motion.div
            className="px-6 py-5 text-center text-red-300 bg-red-500/10"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            {error}
          </motion.div>
        )}
        {!loading && !error && (
          <motion.div
            className="p-2"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
          >
            {filtered.length === 0 ? (
              <div className="py-10 px-4 text-center text-slate-500">
                <span className="text-4xl block mb-2 opacity-70">📋</span>
                <p className="text-slate-400">Tidak ada data santri</p>
                {search.trim() ? <p className="text-sm mt-1.5 text-slate-500">Coba kata kunci lain</p> : null}
              </div>
            ) : (
              <ul className="flex flex-col gap-2 list-none m-0 p-0 sm:grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 sm:gap-3">
                <AnimatePresence mode="popLayout">
                  {filtered.map((row, index) => (
                    <motion.li
                      key={row.id || row.nomer_induk || index}
                      className="flex items-center gap-3 px-4 py-3.5 rounded-xl bg-white/5 border border-white/5 hover:bg-white/[0.07] hover:border-white/10 active:scale-[0.99] cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 transition"
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      transition={{ duration: 0.25 }}
                      layout
                      onClick={() => openEdit(row)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => e.key === 'Enter' && openEdit(row)}
                    >
                      <span className="flex-shrink-0 w-7 h-7 flex items-center justify-center text-xs font-semibold text-slate-500 bg-white/10 rounded">
                        {index + 1}
                      </span>
                      <span
                        className="flex-shrink-0 w-10 h-10 flex items-center justify-center text-sm font-bold text-blue-400 bg-blue-500/20 rounded-full"
                        aria-hidden
                      >
                        {getInitial(row.nama || '')}
                      </span>
                      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                        <span className="text-slate-100 font-semibold leading-tight">{row.nama || '–'}</span>
                        <span className="text-sm text-slate-400">No. Induk {row.nomer_induk || '–'}</span>
                      </div>
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            )}
          </motion.div>
        )}
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
              className="fixed top-0 right-0 bottom-0 w-full max-w-[420px] bg-gradient-to-b from-slate-800 to-slate-900 shadow-2xl z-[1001] flex flex-col"
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'tween', duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
              role="dialog"
              aria-modal="true"
              aria-label={formMode === 'add' ? 'Tambah santri' : 'Edit santri'}
            >
              <div className="flex-shrink-0 flex items-center justify-between px-5 py-4 border-b border-white/10">
                <h2 className="text-lg font-bold text-slate-50 m-0">
                  {formMode === 'add' ? 'Tambah Santri' : 'Edit Santri'}
                </h2>
                <button
                  type="button"
                  onClick={closeOffcanvas}
                  aria-label="Tutup"
                  className="w-9 h-9 flex items-center justify-center text-slate-400 border border-white/10 rounded-lg hover:text-slate-100 hover:bg-white/10 transition"
                >
                  ✕
                </button>
              </div>
              <form className="flex-1 flex flex-col min-h-0" onSubmit={handleSubmit}>
                <div className="flex-1 overflow-y-auto px-5 py-4 pb-6">
                  {FORM_FIELDS.map(({ key, label, type }) => (
                    <div key={key} className="mb-4">
                      <label htmlFor={`santri-${key}`} className="block text-sm font-medium text-slate-400 mb-1.5">
                        {label}
                      </label>
                      {key === 'jenis_kelamin' ? (
                        <select
                          id={`santri-${key}`}
                          value={formData[key]}
                          onChange={(e) => setFormData((prev) => ({ ...prev, [key]: e.target.value }))}
                          className="w-full px-3 py-2.5 text-slate-100 bg-slate-900/60 border border-white/10 rounded-lg focus:border-blue-500 outline-none transition"
                        >
                          <option value="">– Pilih –</option>
                          <option value="L">Laki-laki</option>
                          <option value="P">Perempuan</option>
                        </select>
                      ) : (
                        <input
                          id={`santri-${key}`}
                          type={type || 'text'}
                          value={formData[key]}
                          onChange={(e) => setFormData((prev) => ({ ...prev, [key]: e.target.value }))}
                          className="w-full px-3 py-2.5 text-slate-100 bg-slate-900/60 border border-white/10 rounded-lg placeholder-slate-500 focus:border-blue-500 outline-none transition"
                        />
                      )}
                    </div>
                  ))}
                </div>
                {submitError && (
                  <div className="flex-shrink-0 mx-5 mb-2 px-3 py-2 text-sm text-red-300 bg-red-500/15 rounded-lg">
                    {submitError}
                  </div>
                )}
                <div className="flex-shrink-0 flex gap-3 px-5 py-4 border-t border-white/10">
                  <button
                    type="button"
                    onClick={closeOffcanvas}
                    className="flex-1 py-2.5 px-4 font-medium text-slate-400 bg-white/10 border border-white/10 rounded-lg hover:bg-white/15 hover:text-slate-100 transition"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={submitLoading}
                    className="flex-1 py-2.5 px-4 font-semibold text-white rounded-lg bg-gradient-to-r from-blue-500 to-blue-600 hover:opacity-95 disabled:opacity-70 disabled:cursor-not-allowed transition"
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
