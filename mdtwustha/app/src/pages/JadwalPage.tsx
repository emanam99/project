import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  createJadwal,
  deleteJadwal,
  getJadwal,
  getKelas,
  getMapel,
  getPengurus,
  updateJadwal,
  type JadwalRow,
  type KelasRow,
  type MapelRow,
  type PengurusRow,
} from '../api/apiClient'
import MaterialIcon from '../components/MaterialIcon'
import { formatMapelLabel } from '../utils/formatMapel'
import { getStoredUser } from '../utils/auth'

const HARI_OPTIONS = [
  { value: 'senin', label: 'Senin' },
  { value: 'selasa', label: 'Selasa' },
  { value: 'rabu', label: 'Rabu' },
  { value: 'kamis', label: 'Kamis' },
  { value: 'jumat', label: 'Jumat' },
  { value: 'sabtu', label: 'Sabtu' },
  { value: 'ahad', label: 'Ahad' },
] as const

const KET_JAM_OPTIONS = [1, 2, 3, 4, 5] as const

type FormState = {
  kelas_id: string
  mapel_id: string
  pengurus_id: string
  hari: string
  jam_dari: string
  jam_sampai: string
  ket_jam: string
  aktif: boolean
}

const EMPTY_FORM: FormState = {
  kelas_id: '',
  mapel_id: '',
  pengurus_id: '',
  hari: 'senin',
  jam_dari: '07:00',
  jam_sampai: '07:45',
  ket_jam: '1',
  aktif: true,
}

function isAdminAkses(akses?: string) {
  return akses === 'super_admin' || akses === 'admin'
}

function formatKelasLabel(nama?: string | null, kel?: string | null) {
  if (!nama) return '—'
  return kel ? `${nama} · ${kel}` : nama
}

function hariLabel(hari: string) {
  return HARI_OPTIONS.find((h) => h.value === hari)?.label || hari
}

function formatJam(dari: string, sampai: string) {
  return `${dari}–${sampai}`
}

export default function JadwalPage() {
  const navigate = useNavigate()
  const user = getStoredUser()
  const akses = user?.akses || ''
  const isAdmin = isAdminAkses(akses)

  const [kelasList, setKelasList] = useState<KelasRow[]>([])
  const [pengurusList, setPengurusList] = useState<PengurusRow[]>([])
  const [mapelAll, setMapelAll] = useState<MapelRow[]>([])
  const [mapelForm, setMapelForm] = useState<MapelRow[]>([])
  const [rows, setRows] = useState<JadwalRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [filterKelas, setFilterKelas] = useState('')
  const [filterMapel, setFilterMapel] = useState('')
  const [filterGuru, setFilterGuru] = useState('')
  const [filterHari, setFilterHari] = useState('')
  const [filterAktif, setFilterAktif] = useState<'all' | '1' | '0'>('1')

  const [offcanvasOpen, setOffcanvasOpen] = useState(false)
  const [formMode, setFormMode] = useState<'add' | 'edit'>('add')
  const [editingId, setEditingId] = useState('')
  const [form, setForm] = useState<FormState>({ ...EMPTY_FORM })
  const [formError, setFormError] = useState('')
  const [submitLoading, setSubmitLoading] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [mapelFormLoading, setMapelFormLoading] = useState(false)

  useEffect(() => {
    if (!user) {
      navigate('/login', { replace: true })
    }
  }, [user, navigate])

  useEffect(() => {
    const loadMeta = async () => {
      const [kelasRes, pengurusRes, mapelRes] = await Promise.all([getKelas(), getPengurus(), getMapel()])
      if (kelasRes.success) setKelasList(kelasRes.data)
      if (pengurusRes.success) setPengurusList(pengurusRes.data)
      if (mapelRes.success) setMapelAll(mapelRes.data)
    }
    void loadMeta()
  }, [])

  const fetchList = useCallback(async () => {
    if (!akses) return
    setLoading(true)
    setError('')
    const res = await getJadwal({
      akses,
      kelas_id: filterKelas || undefined,
      mapel_id: filterMapel || undefined,
      pengurus_id: filterGuru || undefined,
      hari: filterHari || undefined,
      aktif: isAdmin ? filterAktif : '1',
    })
    if (!res.success) {
      setRows([])
      setError(res.message || 'Gagal memuat jadwal')
    } else {
      setRows(res.data)
    }
    setLoading(false)
  }, [akses, filterKelas, filterMapel, filterGuru, filterHari, filterAktif, isAdmin])

  useEffect(() => {
    void fetchList()
  }, [fetchList])

  useEffect(() => {
    if (!offcanvasOpen || !form.kelas_id) {
      setMapelForm([])
      return
    }
    let cancelled = false
    const load = async () => {
      setMapelFormLoading(true)
      const res = await getMapel(form.kelas_id)
      if (cancelled) return
      setMapelForm(res.success ? res.data : [])
      setMapelFormLoading(false)
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [offcanvasOpen, form.kelas_id])

  const openAdd = () => {
    setFormMode('add')
    setEditingId('')
    setForm({ ...EMPTY_FORM })
    setFormError('')
    setOffcanvasOpen(true)
  }

  const openEdit = (row: JadwalRow) => {
    if (!isAdmin) return
    setFormMode('edit')
    setEditingId(row.id)
    setForm({
      kelas_id: row.kelas_id,
      mapel_id: row.mapel_id,
      pengurus_id: row.pengurus_id,
      hari: row.hari,
      jam_dari: row.jam_dari,
      jam_sampai: row.jam_sampai,
      ket_jam: String(row.ket_jam),
      aktif: row.aktif,
    })
    setFormError('')
    setOffcanvasOpen(true)
  }

  const closeOffcanvas = () => {
    setOffcanvasOpen(false)
    setFormError('')
    setEditingId('')
    setForm({ ...EMPTY_FORM })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.kelas_id || !form.mapel_id || !form.pengurus_id || !form.hari) {
      setFormError('Lengkapi kelas, pelajaran, guru, dan hari')
      return
    }
    if (!form.jam_dari || !form.jam_sampai) {
      setFormError('Jam dari & sampai wajib')
      return
    }
    const ket = Number(form.ket_jam)
    if (ket < 1 || ket > 5) {
      setFormError('Ket jam harus 1–5')
      return
    }

    setSubmitLoading(true)
    setFormError('')
    const payload = {
      kelas_id: form.kelas_id,
      mapel_id: form.mapel_id,
      pengurus_id: form.pengurus_id,
      hari: form.hari,
      jam_dari: form.jam_dari,
      jam_sampai: form.jam_sampai,
      ket_jam: ket,
      aktif: form.aktif,
      akses,
    }
    const res =
      formMode === 'add' ? await createJadwal(payload) : await updateJadwal(editingId, payload)
    setSubmitLoading(false)
    if (!res.success) {
      setFormError(res.message || 'Gagal menyimpan')
      return
    }
    closeOffcanvas()
    void fetchList()
  }

  const handleToggleAktif = async (row: JadwalRow) => {
    if (!isAdmin) return
    const res = await updateJadwal(row.id, { aktif: !row.aktif, akses })
    if (!res.success) {
      setError(res.message || 'Gagal mengubah status')
      return
    }
    void fetchList()
  }

  const handleDelete = async () => {
    if (!editingId || !isAdmin) return
    if (!window.confirm('Hapus jadwal ini secara permanen?')) return
    setDeleteLoading(true)
    const res = await deleteJadwal(editingId, akses)
    setDeleteLoading(false)
    if (!res.success) {
      setFormError(res.message || 'Gagal menghapus')
      return
    }
    closeOffcanvas()
    void fetchList()
  }

  const mapelFilterOptions = useMemo(() => {
    if (!filterKelas) return mapelAll
    // Tampilkan mapel yang muncul di list saat ini + semua (filter mapel global tetap dari semua)
    return mapelAll
  }, [mapelAll, filterKelas])

  const panel = (
    <AnimatePresence>
      {offcanvasOpen && (
        <>
          <motion.button
            type="button"
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[1000]"
            aria-label="Tutup"
            onClick={closeOffcanvas}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />
          <motion.aside
            className="ui-offcanvas z-[1001]"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'tween', duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
            role="dialog"
            aria-modal="true"
            aria-label={formMode === 'add' ? 'Tambah jadwal' : 'Edit jadwal'}
          >
            <div className="flex-shrink-0 flex items-center justify-between px-5 py-4 border-b ui-divider">
              <h2 className="text-lg font-bold text-slate-800 dark:text-slate-50 m-0">
                {formMode === 'add' ? 'Tambah Jadwal' : 'Edit Jadwal'}
              </h2>
              <button type="button" onClick={closeOffcanvas} aria-label="Tutup" className="ui-btn-close">
                <MaterialIcon name="close" size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
                <div>
                  <label className="ui-label mb-1.5 block">Kelas *</label>
                  <select
                    value={form.kelas_id}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, kelas_id: e.target.value, mapel_id: '' }))
                    }
                    className="ui-input w-full appearance-none"
                    required
                  >
                    <option value="">Pilih kelas</option>
                    {kelasList.map((k) => (
                      <option key={k.id} value={k.id}>
                        {formatKelasLabel(k.nama_kelas, k.kel)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="ui-label mb-1.5 block">Pelajaran *</label>
                  <select
                    value={form.mapel_id}
                    onChange={(e) => setForm((f) => ({ ...f, mapel_id: e.target.value }))}
                    className="ui-input w-full appearance-none"
                    required
                    disabled={!form.kelas_id || mapelFormLoading}
                  >
                    <option value="">
                      {!form.kelas_id
                        ? 'Pilih kelas dulu'
                        : mapelFormLoading
                          ? 'Memuat…'
                          : 'Pilih pelajaran'}
                    </option>
                    {mapelForm.map((m) => (
                      <option key={m.id} value={m.id}>
                        {formatMapelLabel({
                          fan: m.fan,
                          kitab_nama: m.kitab_nama,
                          dari: m.dari,
                          sampai: m.sampai,
                        })}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="ui-label mb-1.5 block">Guru *</label>
                  <select
                    value={form.pengurus_id}
                    onChange={(e) => setForm((f) => ({ ...f, pengurus_id: e.target.value }))}
                    className="ui-input w-full appearance-none"
                    required
                  >
                    <option value="">Pilih guru</option>
                    {pengurusList.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nama}
                        {p.nip ? ` (${p.nip})` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="ui-label mb-1.5 block">Hari *</label>
                  <select
                    value={form.hari}
                    onChange={(e) => setForm((f) => ({ ...f, hari: e.target.value }))}
                    className="ui-input w-full appearance-none"
                    required
                  >
                    {HARI_OPTIONS.map((h) => (
                      <option key={h.value} value={h.value}>
                        {h.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="ui-label mb-1.5 block">Jam dari *</label>
                    <input
                      type="time"
                      value={form.jam_dari}
                      onChange={(e) => setForm((f) => ({ ...f, jam_dari: e.target.value }))}
                      className="ui-input w-full"
                      required
                    />
                  </div>
                  <div>
                    <label className="ui-label mb-1.5 block">Jam sampai *</label>
                    <input
                      type="time"
                      value={form.jam_sampai}
                      onChange={(e) => setForm((f) => ({ ...f, jam_sampai: e.target.value }))}
                      className="ui-input w-full"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="ui-label mb-1.5 block">Ket jam *</label>
                  <select
                    value={form.ket_jam}
                    onChange={(e) => setForm((f) => ({ ...f, ket_jam: e.target.value }))}
                    className="ui-input w-full appearance-none"
                    required
                  >
                    {KET_JAM_OPTIONS.map((n) => (
                      <option key={n} value={n}>
                        Jam {n}
                      </option>
                    ))}
                  </select>
                  <p className="text-[11px] ui-text-muted mt-1">
                    Tidak boleh dobel: kelas+hari+ket jam, atau guru+hari+ket jam (yang aktif).
                  </p>
                </div>

                <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.aktif}
                    onChange={(e) => setForm((f) => ({ ...f, aktif: e.target.checked }))}
                    className="rounded border-slate-300"
                  />
                  Aktif (tampil untuk user)
                </label>

                {formError && <div className="ui-error-box px-3 py-2 text-sm">{formError}</div>}
              </div>

              <div className="flex-shrink-0 flex flex-wrap gap-2 px-5 py-4 border-t ui-divider">
                {formMode === 'edit' && (
                  <button
                    type="button"
                    onClick={() => void handleDelete()}
                    disabled={deleteLoading}
                    className="py-2.5 px-4 ui-btn-secondary text-red-600 dark:text-red-400 disabled:opacity-50"
                  >
                    {deleteLoading ? 'Menghapus…' : 'Hapus'}
                  </button>
                )}
                <button type="button" onClick={closeOffcanvas} className="flex-1 py-2.5 px-4 ui-btn-secondary">
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitLoading}
                  className="flex-1 py-2.5 px-4 ui-btn-primary disabled:opacity-60"
                >
                  {submitLoading ? 'Menyimpan…' : 'Simpan'}
                </button>
              </div>
            </form>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="ui-title-lg">Jadwal</h1>
          <p className="ui-subtitle mt-1">
            Jadwal pelajaran per kelas, hari, dan jam.
            {!isAdmin && ' Menampilkan jadwal aktif saja.'}
          </p>
        </div>
        {isAdmin && (
          <button
            type="button"
            onClick={openAdd}
            className="px-4 py-2.5 text-sm ui-btn-primary shrink-0 inline-flex items-center gap-1.5"
          >
            <MaterialIcon name="add" size={18} /> Tambah Jadwal
          </button>
        )}
      </div>

      <div className="ui-card p-4 sm:p-5 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <div>
            <label className="ui-label mb-1.5 block">Kelas</label>
            <select
              value={filterKelas}
              onChange={(e) => setFilterKelas(e.target.value)}
              className="ui-input w-full appearance-none"
            >
              <option value="">Semua kelas</option>
              {kelasList.map((k) => (
                <option key={k.id} value={k.id}>
                  {formatKelasLabel(k.nama_kelas, k.kel)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="ui-label mb-1.5 block">Pelajaran</label>
            <select
              value={filterMapel}
              onChange={(e) => setFilterMapel(e.target.value)}
              className="ui-input w-full appearance-none"
            >
              <option value="">Semua pelajaran</option>
              {mapelFilterOptions.map((m) => (
                <option key={m.id} value={m.id}>
                  {formatMapelLabel({
                    fan: m.fan,
                    kitab_nama: m.kitab_nama,
                    dari: m.dari,
                    sampai: m.sampai,
                  })}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="ui-label mb-1.5 block">Guru</label>
            <div className="flex gap-2">
              <select
                value={filterGuru}
                onChange={(e) => setFilterGuru(e.target.value)}
                className="ui-input w-full appearance-none min-w-0"
              >
                <option value="">Semua guru</option>
                {pengurusList.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nama}
                  </option>
                ))}
              </select>
              {user?.id && (
                <button
                  type="button"
                  onClick={() => setFilterGuru((prev) => (prev === user.id ? '' : user.id))}
                  className={`shrink-0 px-2.5 py-2 text-xs rounded-lg border transition whitespace-nowrap ${
                    filterGuru === user.id
                      ? 'border-blue-500/40 bg-blue-500/15 text-blue-700 dark:text-blue-300'
                      : 'ui-divider ui-text-muted hover:bg-slate-50 dark:hover:bg-white/5'
                  }`}
                  title="Filter jadwal milik saya"
                >
                  Jadwal saya
                </button>
              )}
            </div>
          </div>
          <div>
            <label className="ui-label mb-1.5 block">Hari</label>
            <select
              value={filterHari}
              onChange={(e) => setFilterHari(e.target.value)}
              className="ui-input w-full appearance-none"
            >
              <option value="">Semua hari</option>
              {HARI_OPTIONS.map((h) => (
                <option key={h.value} value={h.value}>
                  {h.label}
                </option>
              ))}
            </select>
          </div>
          {isAdmin && (
            <div>
              <label className="ui-label mb-1.5 block">Status</label>
              <select
                value={filterAktif}
                onChange={(e) => setFilterAktif(e.target.value as 'all' | '1' | '0')}
                className="ui-input w-full appearance-none"
              >
                <option value="all">Semua</option>
                <option value="1">Aktif</option>
                <option value="0">Nonaktif</option>
              </select>
            </div>
          )}
        </div>
        {(filterKelas || filterMapel || filterGuru || filterHari || (isAdmin && filterAktif !== '1')) && (
          <button
            type="button"
            onClick={() => {
              setFilterKelas('')
              setFilterMapel('')
              setFilterGuru('')
              setFilterHari('')
              setFilterAktif('1')
            }}
            className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
          >
            Reset filter
          </button>
        )}
      </div>

      {error && <div className="ui-error-box px-4 py-3 text-sm">{error}</div>}

      <div className="ui-table-wrap">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="ui-table-head">
              <tr>
                <th className="px-3 sm:px-4 py-3 font-medium">Hari</th>
                <th className="px-3 py-3 font-medium text-center">Ket</th>
                <th className="px-3 py-3 font-medium">Jam</th>
                <th className="px-3 py-3 font-medium">Kelas</th>
                <th className="px-3 py-3 font-medium">Pelajaran</th>
                <th className="px-3 py-3 font-medium">Guru</th>
                {isAdmin && <th className="px-3 py-3 font-medium text-center">Status</th>}
              </tr>
            </thead>
            <tbody className="ui-table-body">
              {loading ? (
                <tr>
                  <td colSpan={isAdmin ? 7 : 6} className="px-6 py-10 text-center ui-text-muted">
                    <div className="flex items-center justify-center gap-3">
                      <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                      Memuat jadwal...
                    </div>
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={isAdmin ? 7 : 6} className="px-6 py-10 text-center ui-text-muted">
                    Tidak ada jadwal
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr
                    key={row.id}
                    className={`ui-table-row ${isAdmin ? 'cursor-pointer' : ''} ${!row.aktif ? 'opacity-60' : ''}`}
                    onClick={() => openEdit(row)}
                    onKeyDown={(e) => e.key === 'Enter' && openEdit(row)}
                    tabIndex={isAdmin ? 0 : undefined}
                    role={isAdmin ? 'button' : undefined}
                  >
                    <td className="px-3 sm:px-4 py-3 font-medium text-slate-800 dark:text-slate-200">
                      {hariLabel(row.hari)}
                    </td>
                    <td className="px-3 py-3 text-center tabular-nums">{row.ket_jam}</td>
                    <td className="px-3 py-3 tabular-nums ui-text-muted">
                      {formatJam(row.jam_dari, row.jam_sampai)}
                    </td>
                    <td className="px-3 py-3">{formatKelasLabel(row.nama_kelas, row.kel)}</td>
                    <td className="px-3 py-3 max-w-[14rem] truncate">
                      {formatMapelLabel({
                        fan: row.mapel_fan || '',
                        kitab_nama: row.mapel_kitab || '',
                        dari: row.mapel_dari || '',
                        sampai: row.mapel_sampai || '',
                      })}
                    </td>
                    <td className="px-3 py-3">{row.pengurus_nama || '—'}</td>
                    {isAdmin && (
                      <td className="px-3 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => void handleToggleAktif(row)}
                          className={`text-xs px-2 py-1 rounded-full border transition ${
                            row.aktif
                              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200'
                              : 'border-slate-400/30 bg-slate-500/10 ui-text-muted'
                          }`}
                        >
                          {row.aktif ? 'Aktif' : 'Nonaktif'}
                        </button>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {typeof document !== 'undefined' && createPortal(panel, document.body)}
    </motion.div>
  )
}
