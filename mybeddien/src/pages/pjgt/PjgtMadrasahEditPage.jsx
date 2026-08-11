import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { madrasahPjgtAPI } from '../../services/api'
import { usePjgtMadrasahId, usePjgtProfil } from '../../hooks/usePjgtCachedResources'
import { syncPjgtProfil } from '../../services/pjgtDataService'
import { compressImage } from '../../utils/imageCompression'
import BerkasFilePickField from '../../components/BerkasFilePickField'
import {
  KEGIATAN_WAKTU_SLOTS,
  TINGKATAN_OPTIONS,
  tingkatanSlugsFromMadrasah,
} from '../../utils/madrasahDisplayConfig'

const KATEGORI_OPTIONS = ['Madrasah', 'Pesantren', 'Yayasan', 'Sekolah', 'Lainnya']
const KURIKULUM_OPTIONS = ['Depag', 'Diniyah (Mandiri)']

const SARANA_KEYS = [
  ['banin_banat', 'Banin / Banat'],
  ['seragam', 'Seragam'],
  ['syahriah', 'Syahriah'],
  ['pengelola', 'Pengelola'],
  ['gedung_madrasah', 'Gedung madrasah'],
  ['kantor', 'Kantor'],
  ['bangku', 'Bangku'],
  ['kamar_mandi_murid', 'KM murid'],
  ['kamar_gt', 'Kamar GT'],
  ['kamar_mandi_gt', 'KM GT'],
  ['km_bersifat', 'KM bersifat'],
  ['konsumsi', 'Konsumsi'],
  ['kamar_gt_jarak', 'Jarak kamar GT'],
  ['masyarakat', 'Masyarakat'],
  ['alumni', 'Alumni'],
  ['jarak_md_lain', 'Jarak MD lain'],
]

function emptyForm() {
  return {
    nama: '',
    identitas: '',
    kategori: '',
    dusun: '',
    rt: '',
    rw: '',
    desa: '',
    kecamatan: '',
    kabupaten: '',
    provinsi: '',
    kode_pos: '',
    nama_pengasuh: '',
    no_pengasuh: '',
    nama_pjgt: '',
    no_pjgt: '',
    kepala: '',
    sekretaris: '',
    bendahara: '',
    kelas_tertinggi: '',
    kurikulum: '',
    jumlah_murid: '',
    tempat: '',
    berdiri_tahun: '',
    keterangan: '',
    kegiatan_pagi: false,
    kegiatan_sore: false,
    kegiatan_malam: false,
    kegiatan_pagi_mulai: '',
    kegiatan_pagi_sampai: '',
    kegiatan_sore_mulai: '',
    kegiatan_sore_sampai: '',
    kegiatan_malam_mulai: '',
    kegiatan_malam_sampai: '',
    banin_banat: '',
    seragam: '',
    syahriah: '',
    pengelola: '',
    gedung_madrasah: '',
    kantor: '',
    bangku: '',
    kamar_mandi_murid: '',
    kamar_gt: '',
    kamar_mandi_gt: '',
    km_bersifat: '',
    konsumsi: '',
    kamar_gt_jarak: '',
    masyarakat: '',
    alumni: '',
    jarak_md_lain: '',
  }
}

function formFromRow(row, draft) {
  const src = draft && typeof draft === 'object' ? { ...row, ...draft } : row
  const f = emptyForm()
  if (!src) return f
  for (const k of Object.keys(f)) {
    if (k.startsWith('kegiatan_') && (k.endsWith('_mulai') || k.endsWith('_sampai'))) {
      const v = src[k]
      f[k] = v != null ? String(v).slice(0, 5) : ''
    } else if (k === 'kegiatan_pagi' || k === 'kegiatan_sore' || k === 'kegiatan_malam') {
      f[k] = !!(src[k] === 1 || src[k] === true)
    } else if (src[k] != null) {
      f[k] = String(src[k])
    }
  }
  return f
}

function Field({ label, children }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-gray-600 dark:text-gray-400">{label}</span>
      {children}
    </label>
  )
}

const inputClass =
  'w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100'

export default function PjgtMadrasahEditPage() {
  const navigate = useNavigate()
  const madrasahId = usePjgtMadrasahId()
  const { data: profil } = usePjgtProfil()
  const [form, setForm] = useState(emptyForm)
  const [tingkatan, setTingkatan] = useState([])
  const [catatan, setCatatan] = useState('')
  const [fotoPathBaru, setFotoPathBaru] = useState(null)
  const [logoPathBaru, setLogoPathBaru] = useState(null)
  const [fotoPreview, setFotoPreview] = useState(null)
  const [logoPreview, setLogoPreview] = useState(null)
  const [fotoName, setFotoName] = useState('')
  const [logoName, setLogoName] = useState('')
  const [uploadingFoto, setUploadingFoto] = useState(false)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [okMsg, setOkMsg] = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError('')
      try {
        const [profilRes, pengajuanRes] = await Promise.all([
          madrasahPjgtAPI.getProfil(),
          madrasahPjgtAPI.getPengajuan(),
        ])
        if (cancelled) return
        const row = profilRes?.data || null
        const aktif = pengajuanRes?.data?.aktif || null
        const draft = aktif?.data_baru || null
        setForm(formFromRow(row, draft))
        setTingkatan(tingkatanSlugsFromMadrasah(draft || row))
        setCatatan(aktif?.catatan_pengaju || '')
        setFotoPathBaru(aktif?.foto_path_baru || null)
        setLogoPathBaru(aktif?.logo_path_baru || null)
        const fotoShow = aktif?.foto_path_baru || row?.foto_path
        const logoShow = aktif?.logo_path_baru || row?.logo_path
        if (fotoShow) {
          const u = await madrasahPjgtAPI.fetchAssetBlobUrl(fotoShow)
          if (!cancelled) setFotoPreview(u)
        }
        if (logoShow) {
          const u = await madrasahPjgtAPI.fetchAssetBlobUrl(logoShow)
          if (!cancelled) setLogoPreview(u)
        }
      } catch (e) {
        if (!cancelled) setError(e?.response?.data?.message || e?.message || 'Gagal memuat data')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    if (madrasahId) load()
    return () => {
      cancelled = true
    }
  }, [madrasahId])

  useEffect(() => {
    return () => {
      if (fotoPreview) URL.revokeObjectURL(fotoPreview)
      if (logoPreview) URL.revokeObjectURL(logoPreview)
    }
  }, [fotoPreview, logoPreview])

  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }))

  const toggleTingkatan = (slug, checked) => {
    setTingkatan((prev) => {
      const setSlugs = new Set(prev)
      if (checked) setSlugs.add(slug)
      else setSlugs.delete(slug)
      return TINGKATAN_OPTIONS.map((o) => o.slug).filter((s) => setSlugs.has(s))
    })
  }

  const onPickMedia = async (file, kind) => {
    if (!file) return
    setError('')
    if (kind === 'logo') setUploadingLogo(true)
    else setUploadingFoto(true)
    try {
      const compressed = await compressImage(file, 1, kind === 'logo' ? 800 : 1920, kind === 'logo' ? 800 : 1920)
      const res = await madrasahPjgtAPI.uploadPengajuanMedia(compressed, kind)
      if (!res?.success) {
        setError(res?.message || 'Upload gagal')
        return
      }
      const path = res.path || res.foto_path || res.logo_path
      const preview = URL.createObjectURL(compressed)
      if (kind === 'logo') {
        setLogoPathBaru(path)
        setLogoName(file.name || 'logo')
        if (logoPreview) URL.revokeObjectURL(logoPreview)
        setLogoPreview(preview)
      } else {
        setFotoPathBaru(path)
        setFotoName(file.name || 'foto')
        if (fotoPreview) URL.revokeObjectURL(fotoPreview)
        setFotoPreview(preview)
      }
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Upload gagal')
    } finally {
      if (kind === 'logo') setUploadingLogo(false)
      else setUploadingFoto(false)
    }
  }

  const payload = useMemo(() => {
    const p = {
      ...form,
      tingkatan,
      jumlah_murid: form.jumlah_murid === '' ? null : Number(form.jumlah_murid),
      berdiri_tahun: form.berdiri_tahun === '' ? null : Number(form.berdiri_tahun),
      kegiatan_pagi: form.kegiatan_pagi ? 1 : 0,
      kegiatan_sore: form.kegiatan_sore ? 1 : 0,
      kegiatan_malam: form.kegiatan_malam ? 1 : 0,
      catatan_pengaju: catatan || null,
      foto_path_baru: fotoPathBaru,
      logo_path_baru: logoPathBaru,
    }
    return p
  }, [form, tingkatan, catatan, fotoPathBaru, logoPathBaru])

  const onSubmit = async (e) => {
    e.preventDefault()
    if (!String(form.nama || '').trim()) {
      setError('Nama madrasah wajib diisi')
      return
    }
    setSaving(true)
    setError('')
    setOkMsg('')
    try {
      const res = await madrasahPjgtAPI.postPengajuan(payload)
      if (!res?.success) {
        setError(res?.message || 'Gagal mengirim pengajuan')
        return
      }
      setOkMsg('Pengajuan terkirim. Menunggu tinjauan UGT.')
      await syncPjgtProfil(madrasahId)
      setTimeout(() => navigate('/pjgt/madrasah'), 800)
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Gagal mengirim pengajuan')
    } finally {
      setSaving(false)
    }
  }

  if (!madrasahId) {
    return (
      <div className="p-4 sm:p-6 max-w-3xl mx-auto">
        <p className="text-sm text-gray-600 dark:text-gray-400">Akun PJGT belum terhubung ke data madrasah.</p>
      </div>
    )
  }

  return (
    <div className="min-h-[60vh] p-4 sm:p-6 max-w-3xl mx-auto space-y-5 pb-24">
      <div className="flex items-center justify-between gap-3">
        <Link
          to="/pjgt/madrasah"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-600 dark:text-primary-400 hover:underline"
        >
          ← Profil madrasah
        </Link>
      </div>

      <div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">Ajukan edit profil</h1>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Perubahan ditinjau UGT sebelum masuk ke data resmi. Status, sektor, dan penugasan koordinator tidak dapat diubah di sini.
        </p>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100">
          {error}
        </div>
      ) : null}
      {okMsg ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
          {okMsg}
        </div>
      ) : null}

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-gray-100 dark:bg-gray-800" />
          ))}
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-6">
          <section className="rounded-2xl border border-gray-200 bg-white p-4 space-y-3 dark:border-gray-700 dark:bg-gray-900/60">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Foto & logo</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                {fotoPreview ? (
                  <img src={fotoPreview} alt="Foto" className="h-32 w-full rounded-xl object-cover bg-gray-100 dark:bg-gray-800" />
                ) : (
                  <div className="flex h-32 items-center justify-center rounded-xl bg-gray-100 text-xs text-gray-500 dark:bg-gray-800 dark:text-gray-400">Belum ada foto</div>
                )}
                <BerkasFilePickField
                  accept="image/jpeg,image/jpg,image/png,image/webp,image/gif"
                  label="Pilih foto"
                  replaceLabel="Ganti foto"
                  selectedName={fotoName}
                  loading={uploadingFoto}
                  disabled={saving}
                  onFileSelected={(file) => onPickMedia(file, 'foto')}
                  hint="JPEG, PNG, WebP, atau GIF — maks. 1 MB setelah kompresi"
                />
              </div>
              <div className="space-y-2">
                {logoPreview ? (
                  <img src={logoPreview} alt="Logo" className="h-32 w-full rounded-xl object-contain bg-white p-2 border border-gray-100 dark:border-gray-700 dark:bg-gray-900" />
                ) : (
                  <div className="flex h-32 items-center justify-center rounded-xl bg-gray-100 text-xs text-gray-500 dark:bg-gray-800 dark:text-gray-400">Belum ada logo</div>
                )}
                <BerkasFilePickField
                  accept="image/png,image/jpeg,image/jpg"
                  label="Pilih logo"
                  replaceLabel="Ganti logo"
                  selectedName={logoName}
                  loading={uploadingLogo}
                  disabled={saving}
                  onFileSelected={(file) => onPickMedia(file, 'logo')}
                  hint="Hanya PNG atau JPEG — maks. 1 MB setelah kompresi"
                />
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-gray-200 bg-white p-4 space-y-3 dark:border-gray-700 dark:bg-gray-900/60">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Identitas</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Nama *">
                <input className={inputClass} value={form.nama} onChange={(e) => set('nama', e.target.value)} required />
              </Field>
              <Field label="Identitas">
                <input className={inputClass} value={form.identitas} onChange={(e) => set('identitas', e.target.value)} />
              </Field>
              <Field label="Kategori">
                <select className={inputClass} value={form.kategori} onChange={(e) => set('kategori', e.target.value)}>
                  <option value="">—</option>
                  {KATEGORI_OPTIONS.map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
              </Field>
            </div>
          </section>

          <section className="rounded-2xl border border-gray-200 bg-white p-4 space-y-3 dark:border-gray-700 dark:bg-gray-900/60">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Alamat</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {['dusun', 'rt', 'rw', 'desa', 'kecamatan', 'kabupaten', 'provinsi', 'kode_pos'].map((k) => (
                <Field key={k} label={k.replace('_', ' ')}>
                  <input className={inputClass} value={form[k]} onChange={(e) => set(k, e.target.value)} />
                </Field>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-gray-200 bg-white p-4 space-y-3 dark:border-gray-700 dark:bg-gray-900/60">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Kontak & struktur</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                ['nama_pengasuh', 'Nama pengasuh'],
                ['no_pengasuh', 'No. pengasuh'],
                ['nama_pjgt', 'Nama PJGT'],
                ['no_pjgt', 'No. PJGT'],
                ['kepala', 'Kepala'],
                ['sekretaris', 'Sekretaris'],
                ['bendahara', 'Bendahara'],
              ].map(([k, label]) => (
                <Field key={k} label={label}>
                  <input className={inputClass} value={form[k]} onChange={(e) => set(k, e.target.value)} />
                </Field>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-gray-200 bg-white p-4 space-y-3 dark:border-gray-700 dark:bg-gray-900/60">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Tingkatan & kurikulum</h2>
            <div className="flex flex-wrap gap-2">
              {TINGKATAN_OPTIONS.map((o) => (
                <label key={o.slug} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs dark:border-gray-700">
                  <input
                    type="checkbox"
                    checked={tingkatan.includes(o.slug)}
                    onChange={(e) => toggleTingkatan(o.slug, e.target.checked)}
                  />
                  {o.label}
                </label>
              ))}
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Kelas tertinggi">
                <input className={inputClass} value={form.kelas_tertinggi} onChange={(e) => set('kelas_tertinggi', e.target.value)} />
              </Field>
              <Field label="Kurikulum">
                <select className={inputClass} value={form.kurikulum} onChange={(e) => set('kurikulum', e.target.value)}>
                  <option value="">—</option>
                  {KURIKULUM_OPTIONS.map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
              </Field>
              <Field label="Jumlah murid">
                <input type="number" min="0" className={inputClass} value={form.jumlah_murid} onChange={(e) => set('jumlah_murid', e.target.value)} />
              </Field>
            </div>
          </section>

          <section className="rounded-2xl border border-gray-200 bg-white p-4 space-y-3 dark:border-gray-700 dark:bg-gray-900/60">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Kegiatan belajar</h2>
            <div className="space-y-3">
              {KEGIATAN_WAKTU_SLOTS.map((slot) => (
                <div key={slot.flag} className="rounded-xl border border-gray-100 p-3 dark:border-gray-800">
                  <label className="inline-flex items-center gap-2 text-sm font-medium">
                    <input
                      type="checkbox"
                      checked={!!form[slot.flag]}
                      onChange={(e) => set(slot.flag, e.target.checked)}
                    />
                    {slot.label}
                  </label>
                  {form[slot.flag] ? (
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <Field label="Mulai">
                        <input type="time" className={inputClass} value={form[slot.mulai]} onChange={(e) => set(slot.mulai, e.target.value)} />
                      </Field>
                      <Field label="Sampai">
                        <input type="time" className={inputClass} value={form[slot.sampai]} onChange={(e) => set(slot.sampai, e.target.value)} />
                      </Field>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Tempat">
                <input className={inputClass} value={form.tempat} onChange={(e) => set('tempat', e.target.value)} />
              </Field>
              <Field label="Berdiri tahun">
                <input type="number" className={inputClass} value={form.berdiri_tahun} onChange={(e) => set('berdiri_tahun', e.target.value)} />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Keterangan">
                  <textarea rows={3} className={inputClass} value={form.keterangan} onChange={(e) => set('keterangan', e.target.value)} />
                </Field>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-gray-200 bg-white p-4 space-y-3 dark:border-gray-700 dark:bg-gray-900/60">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Sarana</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {SARANA_KEYS.map(([k, label]) => (
                <Field key={k} label={label}>
                  <input className={inputClass} value={form[k]} onChange={(e) => set(k, e.target.value)} />
                </Field>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-gray-200 bg-white p-4 space-y-2 dark:border-gray-700 dark:bg-gray-900/60">
            <Field label="Catatan untuk reviewer (opsional)">
              <textarea rows={2} className={inputClass} value={catatan} onChange={(e) => setCatatan(e.target.value)} placeholder="Mis. foto diperbarui, alamat baru…" />
            </Field>
          </section>

          <div className="sticky bottom-16 z-10 -mx-4 border-t border-gray-200 bg-white/95 px-4 py-3 backdrop-blur dark:border-gray-700 dark:bg-gray-950/95 sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
            <button
              type="submit"
              disabled={saving || !profil}
              className="w-full rounded-xl bg-primary-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-primary-700 disabled:opacity-60 sm:w-auto"
            >
              {saving ? 'Mengirim…' : 'Kirim pengajuan'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
