import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { madrasahAPI, madrasahEditPengajuanAPI } from '../../../services/api'
import { useNotification } from '../../../contexts/NotificationContext'

const FIELD_LABELS = {
  nama: 'Nama',
  identitas: 'Identitas',
  kategori: 'Kategori',
  id_alamat: 'ID alamat',
  dusun: 'Dusun',
  rt: 'RT',
  rw: 'RW',
  desa: 'Desa',
  kecamatan: 'Kecamatan',
  kabupaten: 'Kabupaten',
  provinsi: 'Provinsi',
  kode_pos: 'Kode pos',
  nama_pengasuh: 'Nama pengasuh',
  no_pengasuh: 'No. pengasuh',
  nama_pjgt: 'Nama PJGT',
  no_pjgt: 'No. PJGT',
  kepala: 'Kepala',
  sekretaris: 'Sekretaris',
  bendahara: 'Bendahara',
  tingkatan: 'Tingkatan',
  kelas_tertinggi: 'Kelas tertinggi',
  kurikulum: 'Kurikulum',
  jumlah_murid: 'Jumlah murid',
  kegiatan_pagi: 'Kegiatan pagi',
  kegiatan_sore: 'Kegiatan siang',
  kegiatan_malam: 'Kegiatan malam',
  kegiatan_mulai: 'Jam mulai (legacy)',
  kegiatan_sampai: 'Jam sampai (legacy)',
  kegiatan_pagi_mulai: 'Pagi mulai',
  kegiatan_pagi_sampai: 'Pagi sampai',
  kegiatan_sore_mulai: 'Siang mulai',
  kegiatan_sore_sampai: 'Siang sampai',
  kegiatan_malam_mulai: 'Malam mulai',
  kegiatan_malam_sampai: 'Malam sampai',
  tempat: 'Tempat',
  berdiri_tahun: 'Berdiri tahun',
  keterangan: 'Keterangan',
  banin_banat: 'Banin/Banat',
  seragam: 'Seragam',
  syahriah: 'Syahriah',
  pengelola: 'Pengelola',
  gedung_madrasah: 'Gedung',
  kantor: 'Kantor',
  bangku: 'Bangku',
  kamar_mandi_murid: 'KM murid',
  kamar_gt: 'Kamar GT',
  kamar_mandi_gt: 'KM GT',
  km_bersifat: 'KM bersifat',
  konsumsi: 'Konsumsi',
  kamar_gt_jarak: 'Jarak kamar GT',
  masyarakat: 'Masyarakat',
  alumni: 'Alumni',
  jarak_md_lain: 'Jarak MD lain',
}

function displayVal(v) {
  if (v == null || v === '') return '—'
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

function valsDiffer(a, b) {
  return displayVal(a) !== displayVal(b)
}

function MadrasahPathImg({ path, className }) {
  const [url, setUrl] = useState(null)
  useEffect(() => {
    let cancelled = false
    if (!path) {
      setUrl(null)
      return
    }
    madrasahAPI.fetchFotoBlobUrl(path).then((u) => {
      if (!cancelled) setUrl(u)
    }).catch(() => {
      if (!cancelled) setUrl(null)
    })
    return () => { cancelled = true }
  }, [path])
  if (!path) return <div className={`bg-gray-100 dark:bg-gray-800 ${className}`} />
  if (!url) return <div className={`animate-pulse bg-gray-200 dark:bg-gray-700 ${className}`} />
  return <img src={url} alt="" className={`object-cover ${className}`} />
}

/**
 * Offcanvas banding data lama vs baru + Setujui / Tolak.
 * Desktop: 2 kolom; HP: tab Data lama / Data baru.
 */
export default function MadrasahEditPengajuanOffcanvas({
  isOpen,
  onClose,
  pengajuanId,
  onSuccess,
}) {
  const { showNotification } = useNotification()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [detail, setDetail] = useState(null)
  const [draft, setDraft] = useState({})
  const [fotoPathBaru, setFotoPathBaru] = useState(null)
  const [logoPathBaru, setLogoPathBaru] = useState(null)
  const [catatan, setCatatan] = useState('')
  const [mobileTab, setMobileTab] = useState('baru') // lama | baru
  const fotoInputRef = useRef(null)
  const logoInputRef = useRef(null)

  const load = async (id) => {
    setLoading(true)
    try {
      const res = await madrasahEditPengajuanAPI.getById(id)
      if (!res?.success) {
        showNotification(res?.message || 'Gagal memuat pengajuan', 'error')
        return
      }
      setDetail(res.data)
      const p = res.data?.pengajuan
      setDraft({ ...(p?.data_baru || {}) })
      setFotoPathBaru(p?.foto_path_baru || null)
      setLogoPathBaru(p?.logo_path_baru || null)
      setCatatan(p?.catatan_reviewer || '')
    } catch (e) {
      showNotification(e?.response?.data?.message || e?.message || 'Gagal memuat', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!isOpen || !pengajuanId) {
      setDetail(null)
      return
    }
    load(pengajuanId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, pengajuanId])

  const dataLama = detail?.pengajuan?.data_lama || {}
  const fieldKeys = useMemo(() => Object.keys(FIELD_LABELS), [])

  const setField = (key, value) => setDraft((prev) => ({ ...prev, [key]: value }))

  const buildBody = () => ({
    ...draft,
    foto_path_baru: fotoPathBaru,
    logo_path_baru: logoPathBaru,
    catatan_reviewer: catatan || null,
  })

  const onSaveDraft = async () => {
    if (!pengajuanId) return
    setSaving(true)
    try {
      const res = await madrasahEditPengajuanAPI.update(pengajuanId, buildBody())
      if (!res?.success) {
        showNotification(res?.message || 'Gagal menyimpan draft', 'error')
        return
      }
      showNotification('Draft disimpan', 'success')
      await load(pengajuanId)
    } catch (e) {
      showNotification(e?.response?.data?.message || e?.message || 'Gagal menyimpan', 'error')
    } finally {
      setSaving(false)
    }
  }

  const onApprove = async () => {
    if (!pengajuanId) return
    if (!window.confirm('Setujui pengajuan dan tulis ke data madrasah resmi?')) return
    setSaving(true)
    try {
      const res = await madrasahEditPengajuanAPI.approve(pengajuanId, buildBody())
      if (!res?.success) {
        showNotification(res?.message || 'Gagal menyetujui', 'error')
        return
      }
      showNotification('Pengajuan disetujui', 'success')
      onSuccess?.()
      onClose?.()
    } catch (e) {
      showNotification(e?.response?.data?.message || e?.message || 'Gagal menyetujui', 'error')
    } finally {
      setSaving(false)
    }
  }

  const onReject = async () => {
    if (!pengajuanId) return
    if (!window.confirm('Tolak pengajuan ini?')) return
    setSaving(true)
    try {
      const res = await madrasahEditPengajuanAPI.reject(pengajuanId, {
        catatan_reviewer: catatan || null,
      })
      if (!res?.success) {
        showNotification(res?.message || 'Gagal menolak', 'error')
        return
      }
      showNotification('Pengajuan ditolak', 'success')
      onSuccess?.()
      onClose?.()
    } catch (e) {
      showNotification(e?.response?.data?.message || e?.message || 'Gagal menolak', 'error')
    } finally {
      setSaving(false)
    }
  }

  const onUpload = async (file, kind) => {
    if (!file) return
    try {
      const res = kind === 'logo'
        ? await madrasahAPI.uploadLogo(file)
        : await madrasahAPI.uploadFoto(file)
      if (!res?.success) {
        showNotification(res?.message || 'Upload gagal', 'error')
        return
      }
      const path = res.foto_path || res.logo_path
      if (kind === 'logo') setLogoPathBaru(path)
      else setFotoPathBaru(path)
    } catch (e) {
      showNotification(e?.response?.data?.message || e?.message || 'Upload gagal', 'error')
    }
  }

  if (typeof document === 'undefined') return null

  const lamaMedia = {
    foto: detail?.madrasah?.foto_path,
    logo: detail?.madrasah?.logo_path,
  }

  const renderLamaCol = () => (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Data lama</h3>
      <div className="grid grid-cols-2 gap-2">
        <MadrasahPathImg path={lamaMedia.foto} className="h-24 w-full rounded-lg" />
        <MadrasahPathImg path={lamaMedia.logo} className="h-24 w-full rounded-lg object-contain bg-white" />
      </div>
      <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
        {fieldKeys.map((key) => {
          const changed = valsDiffer(dataLama[key], draft[key])
          return (
            <div
              key={key}
              className={`rounded-lg border px-2.5 py-1.5 text-xs ${
                changed
                  ? 'border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30'
                  : 'border-gray-100 dark:border-gray-800'
              }`}
            >
              <div className="font-medium text-gray-500 dark:text-gray-400">{FIELD_LABELS[key]}</div>
              <div className="text-gray-900 dark:text-gray-100 break-words">{displayVal(dataLama[key])}</div>
            </div>
          )
        })}
      </div>
    </div>
  )

  const renderBaruCol = () => (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Data baru (bisa diedit)</h3>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <MadrasahPathImg path={fotoPathBaru || lamaMedia.foto} className="h-24 w-full rounded-lg" />
          <input
            ref={fotoInputRef}
            type="file"
            accept="image/jpeg,image/jpg,image/png,image/webp,image/gif"
            className="hidden"
            onChange={(e) => {
              onUpload(e.target.files?.[0], 'foto')
              e.target.value = ''
            }}
          />
          <button
            type="button"
            onClick={() => fotoInputRef.current?.click()}
            disabled={saving || loading}
            className="w-full rounded-lg border border-teal-500/50 bg-teal-50 px-2.5 py-1.5 text-[11px] font-semibold text-teal-700 hover:bg-teal-100 disabled:opacity-50 dark:border-teal-600/60 dark:bg-teal-950/40 dark:text-teal-300 dark:hover:bg-teal-900/50"
          >
            Pilih foto
          </button>
        </div>
        <div className="space-y-1.5">
          <MadrasahPathImg path={logoPathBaru || lamaMedia.logo} className="h-24 w-full rounded-lg object-contain bg-white dark:bg-gray-800" />
          <input
            ref={logoInputRef}
            type="file"
            accept="image/png,image/jpeg,image/jpg"
            className="hidden"
            onChange={(e) => {
              onUpload(e.target.files?.[0], 'logo')
              e.target.value = ''
            }}
          />
          <button
            type="button"
            onClick={() => logoInputRef.current?.click()}
            disabled={saving || loading}
            className="w-full rounded-lg border border-teal-500/50 bg-teal-50 px-2.5 py-1.5 text-[11px] font-semibold text-teal-700 hover:bg-teal-100 disabled:opacity-50 dark:border-teal-600/60 dark:bg-teal-950/40 dark:text-teal-300 dark:hover:bg-teal-900/50"
          >
            Pilih logo
          </button>
        </div>
      </div>
      <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
        {fieldKeys.map((key) => {
          const changed = valsDiffer(dataLama[key], draft[key])
          return (
            <label
              key={key}
              className={`block rounded-lg border px-2.5 py-1.5 text-xs ${
                changed
                  ? 'border-teal-300 bg-teal-50/80 dark:border-teal-700 dark:bg-teal-950/30'
                  : 'border-gray-100 dark:border-gray-800'
              }`}
            >
              <span className="font-medium text-gray-500 dark:text-gray-400">{FIELD_LABELS[key]}</span>
              <input
                className="mt-0.5 w-full rounded border border-gray-200 bg-white px-2 py-1 text-xs text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                value={draft[key] == null ? '' : String(draft[key])}
                onChange={(e) => setField(key, e.target.value)}
              />
            </label>
          )
        })}
      </div>
    </div>
  )

  return createPortal(
    <AnimatePresence>
      {isOpen ? (
        <>
          <motion.div
            className="fixed inset-0 z-[80] bg-black/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.aside
            className="fixed inset-y-0 right-0 z-[81] flex w-full max-w-4xl flex-col bg-white shadow-2xl dark:bg-gray-900"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
          >
            <div className="flex items-start justify-between gap-3 border-b border-gray-200 px-4 py-3 dark:border-gray-700">
              <div>
                <h2 className="text-base font-semibold text-gray-900 dark:text-white">Pengajuan edit madrasah</h2>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {detail?.pengajuan?.madrasah_nama || '—'}
                  {detail?.pengajuan?.catatan_pengaju ? ` · Catatan PJGT: ${detail.pengajuan.catatan_pengaju}` : ''}
                </p>
              </div>
              <button type="button" onClick={onClose} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800" aria-label="Tutup">
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {loading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-16 animate-pulse rounded-xl bg-gray-100 dark:bg-gray-800" />
                  ))}
                </div>
              ) : (
                <>
                  <div className="mb-3 flex gap-2 md:hidden">
                    <button
                      type="button"
                      onClick={() => setMobileTab('lama')}
                      className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold ${mobileTab === 'lama' ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900' : 'bg-gray-100 dark:bg-gray-800'}`}
                    >
                      Data lama
                    </button>
                    <button
                      type="button"
                      onClick={() => setMobileTab('baru')}
                      className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold ${mobileTab === 'baru' ? 'bg-teal-600 text-white' : 'bg-gray-100 dark:bg-gray-800'}`}
                    >
                      Data baru
                    </button>
                  </div>

                  <div className="hidden md:grid md:grid-cols-2 md:gap-4">
                    {renderLamaCol()}
                    {renderBaruCol()}
                  </div>
                  <div className="md:hidden">
                    {mobileTab === 'lama' ? renderLamaCol() : renderBaruCol()}
                  </div>

                  <div className="mt-4">
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">Catatan reviewer</label>
                    <textarea
                      rows={2}
                      className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950"
                      value={catatan}
                      onChange={(e) => setCatatan(e.target.value)}
                    />
                  </div>
                </>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 border-t border-gray-200 px-4 py-3 dark:border-gray-700">
              <button
                type="button"
                disabled={saving || loading}
                onClick={onSaveDraft}
                className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
              >
                Simpan draft
              </button>
              <div className="flex-1" />
              <button
                type="button"
                disabled={saving || loading}
                onClick={onReject}
                className="rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-60"
              >
                Tolak
              </button>
              <button
                type="button"
                disabled={saving || loading}
                onClick={onApprove}
                className="rounded-lg bg-teal-600 px-3 py-2 text-xs font-semibold text-white hover:bg-teal-700 disabled:opacity-60"
              >
                Setujui
              </button>
            </div>
          </motion.aside>
        </>
      ) : null}
    </AnimatePresence>,
    document.body
  )
}
