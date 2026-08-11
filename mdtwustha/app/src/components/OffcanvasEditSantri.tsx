import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  createSantriFromSheet,
  updateSantriFromSheet,
  getKelas,
  getSantriKelasRiwayat,
  type SantriRow,
  type KelasRow,
  type SantriKelasRiwayatRow,
} from '../api/apiClient'
import { getStoredUser } from '../utils/auth'
import MaterialIcon from './MaterialIcon'

export type OffcanvasEditSantriProps = {
  open: boolean
  onClose: () => void
  mode: 'add' | 'edit'
  /** Data awal untuk mode edit */
  santri?: SantriRow | null
  /** Dipanggil setelah simpan sukses */
  onSaved?: (santri: SantriRow) => void
  zIndex?: number
}

type SantriFormData = SantriRow & { kelas_id: string }

const EMPTY_SANTRI: SantriFormData = {
  id: '',
  nomer_induk: '',
  nama: '',
  kelas_id: '',
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

const FORM_FIELDS: { key: keyof SantriFormData; label: string; type?: string }[] = [
  { key: 'nomer_induk', label: 'No. Induk' },
  { key: 'nama', label: 'Nama Lengkap' },
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

function formatKelasLabel(nama?: string, kel?: string) {
  if (!nama) return 'Belum ada kelas aktif'
  return kel ? `Kelas ${nama} · ${kel}` : `Kelas ${nama}`
}

function formatTanggal(tgl?: string | null) {
  if (!tgl) return 'sekarang'
  try {
    return new Date(tgl).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
  } catch {
    return tgl
  }
}

function rowToForm(row?: SantriRow | null): SantriFormData {
  if (!row) return { ...EMPTY_SANTRI }
  return {
    ...EMPTY_SANTRI,
    ...row,
    kelas_id: row.kelas_id ? String(row.kelas_id) : '',
  }
}

/**
 * Offcanvas kanan tambah/edit santri — bisa dipanggil dari halaman mana pun.
 */
export default function OffcanvasEditSantri({
  open,
  onClose,
  mode,
  santri = null,
  onSaved,
  zIndex = 1200,
}: OffcanvasEditSantriProps) {
  const [formData, setFormData] = useState<SantriFormData>({ ...EMPTY_SANTRI })
  const [kelasList, setKelasList] = useState<KelasRow[]>([])
  const [submitLoading, setSubmitLoading] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [kelasRiwayat, setKelasRiwayat] = useState<SantriKelasRiwayatRow[]>([])
  const [riwayatOpen, setRiwayatOpen] = useState(false)
  const [riwayatLoading, setRiwayatLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setFormData(rowToForm(mode === 'edit' ? santri : null))
    setSubmitError('')
    setRiwayatOpen(false)
    setKelasRiwayat([])
    ;(async () => {
      const kelasRes = await getKelas()
      if (cancelled) return
      if (kelasRes.success) setKelasList(kelasRes.data || [])
      if (mode === 'edit' && santri?.id) {
        setRiwayatLoading(true)
        const riwayatRes = await getSantriKelasRiwayat(santri.id)
        if (!cancelled) {
          setKelasRiwayat(riwayatRes.success ? riwayatRes.data : [])
          setRiwayatLoading(false)
        }
      }
    })()
    return () => {
      cancelled = true
    }
    // Hydrate sekali per buka / ganti santri — jangan ikut setiap render objek santri
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, santri?.id])

  const activeRiwayat = kelasRiwayat.find((r) => !r.tanggal_selesai)
  const activeKelasHeader = activeRiwayat
    ? formatKelasLabel(activeRiwayat.nama_kelas, activeRiwayat.kel)
    : formData.kelas_id
      ? formatKelasLabel(
          kelasList.find((k) => k.id === formData.kelas_id)?.nama_kelas,
          kelasList.find((k) => k.id === formData.kelas_id)?.kel
        )
      : 'Belum ada kelas aktif'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitError('')
    setSubmitLoading(true)
    try {
      const user = getStoredUser()
      const payload = { ...formData, idp: user?.id ?? '' }
      const res =
        mode === 'add' ? await createSantriFromSheet(payload) : await updateSantriFromSheet(payload)
      if (res.success) {
        const saved: SantriRow = {
          ...payload,
          id: mode === 'edit' ? payload.id : payload.id || santri?.id || '',
          nama_kelas: kelasList.find((k) => k.id === payload.kelas_id)?.nama_kelas || payload.nama_kelas,
          kelas_kel: kelasList.find((k) => k.id === payload.kelas_id)?.kel || payload.kelas_kel,
          kel: kelasList.find((k) => k.id === payload.kelas_id)?.kel || payload.kel,
        }
        onSaved?.(saved)
        onClose()
      } else {
        setSubmitError(res.message || (mode === 'add' ? 'Gagal menambah' : 'Gagal memperbarui'))
      }
    } catch {
      setSubmitError('Koneksi gagal')
    } finally {
      setSubmitLoading(false)
    }
  }

  const panel = (
    <AnimatePresence>
      {open && (
        <>
          <motion.button
            type="button"
            className="fixed inset-0 bg-black/50 backdrop-blur-sm"
            style={{ zIndex }}
            aria-label="Tutup"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
          />
          <motion.aside
            className="ui-offcanvas"
            style={{ zIndex: zIndex + 1 }}
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'tween', duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
            role="dialog"
            aria-modal="true"
            aria-label={mode === 'add' ? 'Tambah santri' : 'Edit santri'}
          >
            <div className="flex-shrink-0 flex items-center justify-between px-5 py-4 border-b ui-divider">
              <h2 className="text-lg font-bold text-slate-800 dark:text-slate-50 m-0">
                {mode === 'add' ? 'Tambah Santri' : 'Edit Santri'}
              </h2>
              <button type="button" onClick={onClose} aria-label="Tutup" className="ui-btn-close">
                <MaterialIcon name="close" size={20} />
              </button>
            </div>
            <form className="flex-1 flex flex-col min-h-0" onSubmit={handleSubmit}>
              <div className="flex-1 overflow-y-auto px-5 py-4 pb-6">
                {FORM_FIELDS.slice(0, 2).map(({ key, label, type }) => (
                  <div key={key} className="mb-4">
                    <label htmlFor={`oc-santri-${key}`} className="ui-label mb-1.5">
                      {label}
                    </label>
                    <input
                      id={`oc-santri-${key}`}
                      type={type || 'text'}
                      value={formData[key] ?? ''}
                      onChange={(e) => setFormData((prev) => ({ ...prev, [key]: e.target.value }))}
                      className="ui-input"
                    />
                  </div>
                ))}

                <div className="mb-4 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/80 dark:bg-white/5 p-4">
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-3">Kelas & Kel</p>
                  <label htmlFor="oc-santri-kelas_id" className="ui-label mb-1.5">
                    Pilih kelas
                  </label>
                  <select
                    id="oc-santri-kelas_id"
                    value={formData.kelas_id}
                    onChange={(e) => setFormData((prev) => ({ ...prev, kelas_id: e.target.value }))}
                    className="ui-input mb-3"
                  >
                    <option value="">– Pilih kelas –</option>
                    {kelasList.map((k) => (
                      <option key={k.id} value={k.id}>
                        {formatKelasLabel(k.nama_kelas, k.kel)}
                        {k.wali_kelas_nama ? ` · Wali: ${k.wali_kelas_nama}` : ''}
                      </option>
                    ))}
                  </select>
                  {kelasList.length === 0 && (
                    <p className="text-xs ui-text-muted mb-3">
                      Belum ada data kelas. Tambahkan di menu Kelas (admin).
                    </p>
                  )}

                  {mode === 'edit' && (
                    <div className="border-t border-slate-200 dark:border-white/10 pt-3">
                      <button
                        type="button"
                        onClick={() => setRiwayatOpen((v) => !v)}
                        className="w-full flex items-center justify-between gap-2 text-left py-2 px-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition"
                        aria-expanded={riwayatOpen}
                      >
                        <span className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">
                          {activeKelasHeader}
                          {!riwayatOpen && activeRiwayat ? (
                            <span className="ml-2 text-xs font-normal text-blue-600 dark:text-blue-400">
                              (aktif)
                            </span>
                          ) : null}
                        </span>
                        <MaterialIcon
                          name={riwayatOpen ? 'expand_less' : 'expand_more'}
                          size={18}
                          className="text-slate-500 flex-shrink-0"
                        />
                      </button>

                      {riwayatOpen && (
                        <div className="mt-2 space-y-2">
                          {riwayatLoading ? (
                            <p className="text-xs ui-text-muted py-2">Memuat riwayat...</p>
                          ) : kelasRiwayat.length === 0 ? (
                            <p className="text-xs ui-text-muted py-2">Belum ada riwayat kelas</p>
                          ) : (
                            kelasRiwayat.map((item) => {
                              const isActive = !item.tanggal_selesai
                              return (
                                <div
                                  key={item.id}
                                  className={`text-xs rounded-lg px-3 py-2 border ${
                                    isActive
                                      ? 'border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300'
                                      : 'border-slate-200 dark:border-white/10 ui-text-muted'
                                  }`}
                                >
                                  <p className="font-medium">
                                    {formatKelasLabel(item.nama_kelas, item.kel)}
                                    {isActive ? ' · aktif' : ''}
                                  </p>
                                  <p className="mt-0.5 opacity-90">
                                    {formatTanggal(item.tanggal_mulai)} – {formatTanggal(item.tanggal_selesai)}
                                  </p>
                                  {item.wali_kelas_nama ? (
                                    <p className="mt-0.5 opacity-80">Wali: {item.wali_kelas_nama}</p>
                                  ) : null}
                                </div>
                              )
                            })
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {FORM_FIELDS.slice(2).map(({ key, label, type }) => (
                  <div key={key} className="mb-4">
                    <label htmlFor={`oc-santri-${key}`} className="ui-label mb-1.5">
                      {label}
                    </label>
                    {key === 'jenis_kelamin' ? (
                      <select
                        id={`oc-santri-${key}`}
                        value={formData[key] ?? ''}
                        onChange={(e) => setFormData((prev) => ({ ...prev, [key]: e.target.value }))}
                        className="ui-input"
                      >
                        <option value="">– Pilih –</option>
                        <option value="L">Laki-laki</option>
                        <option value="P">Perempuan</option>
                      </select>
                    ) : (
                      <input
                        id={`oc-santri-${key}`}
                        type={type || 'text'}
                        value={formData[key] ?? ''}
                        onChange={(e) => setFormData((prev) => ({ ...prev, [key]: e.target.value }))}
                        className="ui-input"
                      />
                    )}
                  </div>
                ))}
              </div>
              {submitError && (
                <div className="flex-shrink-0 mx-5 mb-2 px-3 py-2 text-sm ui-error-box">{submitError}</div>
              )}
              <div className="flex-shrink-0 flex gap-3 px-5 py-4 border-t ui-divider">
                <button type="button" onClick={onClose} className="flex-1 py-2.5 px-4 ui-btn-secondary">
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitLoading}
                  className="flex-1 py-2.5 px-4 ui-btn-primary disabled:opacity-70 disabled:cursor-not-allowed"
                >
                  {submitLoading ? 'Menyimpan...' : mode === 'add' ? 'Simpan' : 'Perbarui'}
                </button>
              </div>
            </form>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )

  if (typeof document === 'undefined') return null
  return createPortal(panel, document.body)
}
