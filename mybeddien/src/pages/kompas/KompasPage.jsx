import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { kompasMybeddianAPI } from '../../services/api'
import { useMybeddienToast } from '../../hooks/useMybeddienToast'
import { useSantriBiodata } from '../../hooks/useSantriCachedResources'
import { useAuthStore } from '../../store/authStore'
import { ACCESS_MODE } from '../../config/accessMode'
import { isSantriGuruTugas } from '../../utils/santriGuruTugas'
import { useOffcanvasBackClose } from '../../hooks/useOffcanvasBackClose'
import FotoCrop3x4Modal from '../../components/FotoCrop3x4Modal'
import BerkasFilePickField from '../../components/BerkasFilePickField'
import RichTextView from '../../components/RichTextView'
import { isHeicFile, KK_MAX_IMAGE_MB, KK_MAX_PDF_MB, prepareKkFileForUpload } from '../../utils/kkUploadPrepare'
import KompasNikField, { KompasTanggalLahirField } from './KompasNikTanggalFields'
import { getGambarUrl } from '../../config/images'
import {
  BULAN_HIJRIYAH,
  fetchKalenderConvertMasehiToHijri,
  formatYmdKeNamaBulan,
} from '../../utils/hijriPenanggalan'

/** Logo KOMMPAS ringkas (~40 KB) — cocok mobile / retina kecil. */
const KOMMPAS_LOGO_URL = getGambarUrl('/kop/kommpas192.png')

/** Format Y-m-d Masehi → «Minggu, 26 Juli 2026» (dddd, dd mmmm yyyy). */
function formatBatasMasehi(raw) {
  if (raw == null || String(raw).trim() === '') return null
  const s = String(raw).trim().slice(0, 10)
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!m) return s
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  if (Number.isNaN(d.getTime())) return s
  return d.toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

const KK_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif,application/pdf,.pdf,image/*'
const FOTO_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif,image/*'

function emptyPeserta() {
  return {
    nama: '',
    nik: '',
    tempat_lahir: '',
    tanggal_lahir: '',
    path_kk: '',
    path_foto: '',
    nama_file_kk: '',
    nama_file_foto: '',
    preview_kk: '',
    preview_foto: '',
    uploadingKk: false,
    uploadingFoto: false,
    nama_ayah: '',
    nama_ibu: '',
  }
}

function isPdfBerkas(path, namaFile) {
  const s = `${path || ''} ${namaFile || ''}`.toLowerCase()
  return s.includes('.pdf')
}

function revokeLocalPreview(url) {
  if (!url || !String(url).startsWith('blob:')) return
  for (const cached of kompasMybeddianAPI._berkasBlobCache.values()) {
    if (cached === url) return
  }
  try {
    URL.revokeObjectURL(url)
  } catch {
    // abaikan
  }
}

function KompasBerkasPreview({ path, namaFile, previewUrl, label = 'Pratinjau', aspect = null }) {
  if (!path && !previewUrl) return null
  const pdf = isPdfBerkas(path, namaFile)
  const isFoto34 = aspect === '3/4'

  if (previewUrl && !pdf) {
    return (
      <a
        href={previewUrl}
        target="_blank"
        rel="noreferrer"
        className={`mt-1.5 block max-w-full ${isFoto34 ? 'w-28' : 'w-fit'}`}
        title="Buka pratinjau"
      >
        <img
          src={previewUrl}
          alt={label}
          className={
            isFoto34
              ? 'aspect-[3/4] w-full rounded-lg border border-slate-200 bg-slate-50 object-cover dark:border-slate-600 dark:bg-slate-900'
              : 'max-h-40 max-w-full rounded-lg border border-slate-200 bg-slate-50 object-contain dark:border-slate-600 dark:bg-slate-900'
          }
        />
      </a>
    )
  }

  if (previewUrl && pdf) {
    return (
      <div className="mt-1.5 space-y-1.5">
        <div className="flex h-28 w-full max-w-xs items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 text-xs text-slate-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-400">
          Berkas PDF
        </div>
        <a
          href={previewUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex text-xs font-medium text-primary-600 underline dark:text-primary-400"
        >
          Buka {namaFile || 'PDF'}
        </a>
      </div>
    )
  }

  return (
    <p className="mt-0.5 truncate text-[11px] text-primary-600 dark:text-primary-400">
      {namaFile || path}
    </p>
  )
}

function DetailSection({ title, children }) {
  return (
    <section className="rounded-xl border border-gray-200 bg-gray-50/80 p-3.5 dark:border-gray-700 dark:bg-gray-800/50">
      <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {title}
      </h3>
      <div className="text-sm leading-relaxed text-gray-800 dark:text-gray-100">{children}</div>
    </section>
  )
}

function LombaDetailBody({ lomba }) {
  if (!lomba) return null

  const kategoriLabel =
    lomba.kategori === 'grup'
      ? `Grup · ${lomba.anggota_per_kelompok || '—'} orang/kelompok`
      : 'Perorangan'

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-primary-200/80 bg-primary-50/70 px-3.5 py-3 dark:border-primary-800/60 dark:bg-primary-950/40">
        <p className="text-base font-semibold leading-snug text-gray-900 dark:text-white">{lomba.nama}</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <span className="inline-flex items-center rounded-full bg-white/90 px-2.5 py-0.5 text-[11px] font-medium text-gray-700 shadow-sm dark:bg-gray-800 dark:text-gray-200">
            {kategoriLabel}
          </span>
          <span className="inline-flex items-center rounded-full bg-white/90 px-2.5 py-0.5 text-[11px] font-medium text-gray-700 shadow-sm dark:bg-gray-800 dark:text-gray-200">
            Usia {lomba.usia_min}–{lomba.usia_max} tahun
          </span>
          {lomba.sudah_daftar ? (
            <span className="inline-flex items-center rounded-full bg-emerald-500 px-2.5 py-0.5 text-[11px] font-medium text-white">
              Sudah daftar
            </span>
          ) : null}
        </div>
      </div>

      {lomba.deskripsi ? (
        <DetailSection title="Deskripsi">
          <RichTextView html={lomba.deskripsi} />
        </DetailSection>
      ) : (
        <DetailSection title="Deskripsi">
          <span className="italic text-gray-400 dark:text-gray-500">Tidak ada deskripsi</span>
        </DetailSection>
      )}

      {lomba.aturan ? (
        <DetailSection title="Aturan">
          <RichTextView html={lomba.aturan} />
        </DetailSection>
      ) : (
        <DetailSection title="Aturan">
          <span className="italic text-gray-400 dark:text-gray-500">Tidak ada aturan tertulis</span>
        </DetailSection>
      )}

      <DetailSection title="Lokasi">
        {lomba.tempat_catatan || lomba.tempat_maps_url ? (
          <div className="space-y-2">
            {lomba.tempat_catatan ? <p>{lomba.tempat_catatan}</p> : null}
            {lomba.tempat_maps_url ? (
              <a
                href={lomba.tempat_maps_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3 py-2 text-xs font-medium text-white hover:bg-primary-700"
              >
                Buka Google Maps
                <span aria-hidden="true">↗</span>
              </a>
            ) : null}
          </div>
        ) : (
          <span className="italic text-gray-400 dark:text-gray-500">Lokasi belum diisi</span>
        )}
      </DetailSection>
    </div>
  )
}

/**
 * Workspace daftar/edit:
 * - Mobile: form full screen
 * - PC (lg+): form kiri + detail lomba kanan
 */
function KompasFormWorkspace({ lomba, existing, terbuka, tahunAjaran, onClose, onSaved }) {
  const { showToast } = useMybeddienToast()
  const n = lomba.kategori === 'grup' ? Number(lomba.anggota_per_kelompok) || 1 : 1
  const [peserta, setPeserta] = useState(() => Array.from({ length: n }, emptyPeserta))
  const [saving, setSaving] = useState(false)
  const [cropTarget, setCropTarget] = useState(null) // { idx, file }
  const handleClose = useOffcanvasBackClose(true, onClose)
  const usiaMin = Number(lomba.usia_min ?? 0)
  const usiaMax = Number(lomba.usia_max ?? 99)

  useEffect(() => {
    if (existing?.peserta?.length) {
      setPeserta(
        existing.peserta.map((p) => ({
          nama: p.nama || '',
          nik: p.nik || '',
          tempat_lahir: p.tempat_lahir || '',
          tanggal_lahir: p.tanggal_lahir ? String(p.tanggal_lahir).slice(0, 10) : '',
          path_kk: p.path_kk || '',
          path_foto: p.path_foto || '',
          nama_file_kk: p.nama_file_kk || '',
          nama_file_foto: p.nama_file_foto || '',
          preview_kk: '',
          preview_foto: '',
          uploadingKk: false,
          uploadingFoto: false,
          nama_ayah: p.nama_ayah || '',
          nama_ibu: p.nama_ibu || '',
        }))
      )
    } else {
      setPeserta(Array.from({ length: n }, emptyPeserta))
    }
  }, [existing, n, lomba.id])

  const update = (idx, patch) => {
    setPeserta((prev) => prev.map((p, i) => (i === idx ? { ...p, ...patch } : p)))
  }

  const pathKey = peserta.map((p) => `${p.path_kk}|${p.path_foto}`).join(';;')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      for (let idx = 0; idx < peserta.length; idx += 1) {
        const p = peserta[idx]
        if (p.path_kk && !p.preview_kk) {
          const url = await kompasMybeddianAPI.fetchBerkasBlobUrl(p.path_kk)
          if (!cancelled && url) update(idx, { preview_kk: url })
        }
        if (p.path_foto && !p.preview_foto) {
          const url = await kompasMybeddianAPI.fetchBerkasBlobUrl(p.path_foto)
          if (!cancelled && url) update(idx, { preview_foto: url })
        }
      }
    })()
    return () => {
      cancelled = true
    }
    // Hanya saat path server berubah (bukan saat preview local diisi)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathKey])

  const onKkSelect = async (idx, rawFile) => {
    if (!rawFile || !terbuka) return
    update(idx, { uploadingKk: true })
    try {
      const result = await prepareKkFileForUpload(rawFile)
      if (result.error) {
        showToast(result.error, 'error')
        update(idx, { uploadingKk: false })
        return
      }
      await upload(idx, result.file, 'kk', result.previewUrl)
    } catch {
      update(idx, { uploadingKk: false })
    }
  }

  const onFotoSelect = (idx, file) => {
    if (!file || !terbuka) return
    if (isHeicFile(file)) {
      showToast(
        'Format HEIC/HEIF (foto iPhone) belum didukung. Simpan sebagai JPG lalu pilih lagi.',
        'error'
      )
      return
    }
    if (!file.type?.startsWith('image/')) {
      showToast('Foto harus berupa gambar', 'error')
      return
    }
    setCropTarget({ idx, file })
  }

  const onCropConfirm = (blob) => {
    const idx = cropTarget?.idx
    setCropTarget(null)
    if (idx == null || !blob) return
    const file = new File([blob], `foto_kompas_${Date.now()}.jpg`, { type: blob.type || 'image/jpeg' })
    upload(idx, file, 'foto')
  }

  const upload = async (idx, file, jenis, previewUrlOverride = null) => {
    if (!file || !terbuka) return
    const localPreview = previewUrlOverride || URL.createObjectURL(file)
    const ownsPreview = previewUrlOverride == null
    const current = peserta[idx]
    if (jenis === 'kk') {
      revokeLocalPreview(current?.preview_kk)
      update(idx, { preview_kk: localPreview, uploadingKk: true })
    } else {
      revokeLocalPreview(current?.preview_foto)
      update(idx, { preview_foto: localPreview, uploadingFoto: true })
    }
    try {
      const res = await kompasMybeddianAPI.upload(file, jenis)
      if (res?.success && res.data?.path) {
        if (jenis === 'kk') {
          update(idx, {
            path_kk: res.data.path,
            nama_file_kk: res.data.nama_file || file.name,
            preview_kk: localPreview,
            uploadingKk: false,
          })
        } else {
          update(idx, {
            path_foto: res.data.path,
            nama_file_foto: res.data.nama_file || file.name,
            preview_foto: localPreview,
            uploadingFoto: false,
          })
        }
        showToast('Berkas terunggah', 'success')
      } else {
        if (ownsPreview) revokeLocalPreview(localPreview)
        update(idx, jenis === 'kk' ? { preview_kk: '', uploadingKk: false } : { preview_foto: '', uploadingFoto: false })
        showToast(res?.message || 'Gagal unggah', 'error')
      }
    } catch (err) {
      if (ownsPreview) revokeLocalPreview(localPreview)
      update(idx, jenis === 'kk' ? { preview_kk: '', uploadingKk: false } : { preview_foto: '', uploadingFoto: false })
      showToast(err?.response?.data?.message || 'Gagal unggah', 'error')
    }
  }

  const submit = async (e) => {
    e.preventDefault()
    if (!terbuka) return
    setSaving(true)
    try {
      const payload = {
        id_lomba: lomba.id,
        peserta: peserta.map((p) => ({
          nama: p.nama.trim(),
          nik: p.nik.trim(),
          tempat_lahir: p.tempat_lahir.trim(),
          tanggal_lahir: p.tanggal_lahir,
          path_kk: p.path_kk,
          path_foto: p.path_foto,
          nama_file_kk: p.nama_file_kk || null,
          nama_file_foto: p.nama_file_foto || null,
          nama_ayah: p.nama_ayah.trim() || null,
          nama_ibu: p.nama_ibu.trim() || null,
        })),
      }
      const res = existing?.id
        ? await kompasMybeddianAPI.updateDaftar(existing.id, payload)
        : await kompasMybeddianAPI.createDaftar(payload)
      if (res?.success) {
        showToast(res.message || 'Tersimpan', 'success')
        onSaved?.()
        onClose?.()
      } else {
        showToast(res?.message || 'Gagal menyimpan', 'error')
      }
    } catch (err) {
      showToast(err?.response?.data?.message || 'Gagal menyimpan', 'error')
    } finally {
      setSaving(false)
    }
  }

  const inputClass =
    'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500 disabled:opacity-60'
  const labelClass = 'mb-1 block text-xs text-slate-500 dark:text-slate-400'
  const title = existing ? 'Edit pendaftaran' : 'Daftar lomba'

  return createPortal(
    <>
    <div className="fixed inset-0 z-50 flex flex-col bg-white dark:bg-gray-900 dark:[color-scheme:dark] lg:flex-row">
      {/* Kiri (PC) / penuh (HP): form */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-700">
          <div className="min-w-0">
            <h2 className="font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
            <p className="truncate text-xs text-slate-500 dark:text-slate-400">{lomba.nama}</p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="shrink-0 rounded-lg px-2.5 py-1 text-sm text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-950/40"
          >
            Tutup
          </button>
        </header>

        <form
          onSubmit={submit}
          className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4 pb-[calc(7.5rem+env(safe-area-inset-bottom,0px))] lg:px-6 lg:pb-6"
        >
          {!terbuka ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
              Pendaftaran sudah ditutup. Data hanya bisa dilihat.
            </p>
          ) : null}

          {peserta.map((p, idx) => (
            <fieldset
              key={idx}
              className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/40 p-3 dark:border-slate-700 dark:bg-slate-800/40"
            >
              <legend className="px-1 text-xs font-semibold text-primary-700 dark:text-primary-300">
                Peserta {peserta.length > 1 ? `#${idx + 1}` : ''}
              </legend>
              <div>
                <label className={labelClass}>Nama *</label>
                <input
                  className={inputClass}
                  placeholder="Nama lengkap"
                  required
                  value={p.nama}
                  onChange={(e) => update(idx, { nama: e.target.value })}
                  disabled={!terbuka}
                />
              </div>
              <KompasNikField
                nik={p.nik}
                tahunAjaran={tahunAjaran || ''}
                excludeDaftarId={existing?.id || null}
                disabled={!terbuka}
                inputClass={inputClass}
                onNikChange={(nik) => update(idx, { nik })}
                onTanggalLahirFromNik={(ttl) => update(idx, { tanggal_lahir: ttl })}
              />
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div>
                  <label className={labelClass}>Tempat lahir *</label>
                  <input
                    className={inputClass}
                    placeholder="Tempat lahir *"
                    required
                    value={p.tempat_lahir}
                    onChange={(e) => update(idx, { tempat_lahir: e.target.value })}
                    disabled={!terbuka}
                  />
                </div>
                <KompasTanggalLahirField
                  tanggalLahir={p.tanggal_lahir}
                  usiaMin={usiaMin}
                  usiaMax={usiaMax}
                  disabled={!terbuka}
                  inputClass={inputClass}
                  onChange={(v) => update(idx, { tanggal_lahir: v })}
                />
              </div>
              <div>
                <label className="text-xs text-slate-500 dark:text-slate-400">
                  KK * {p.path_kk ? `· ${p.nama_file_kk || 'terunggah'}` : ''}
                </label>
                <p className="mt-0.5 text-[11px] leading-snug text-amber-700 dark:text-amber-300">
                  Pastikan foto KK rapi dan terbaca (semua data jelas, tidak buram/terpotong).
                </p>
                <BerkasFilePickField
                  accept={KK_ACCEPT}
                  disabled={!terbuka}
                  loading={p.uploadingKk}
                  label="Pilih file KK"
                  replaceLabel="Ganti KK"
                  selectedName={p.nama_file_kk || (p.path_kk ? 'terunggah' : '')}
                  hint={`JPG/PNG maks. ${KK_MAX_IMAGE_MB} MB · PDF maks. ${KK_MAX_PDF_MB} MB. iPhone: jika gagal, simpan foto sebagai JPG (bukan HEIC).`}
                  onFileSelected={(file) => onKkSelect(idx, file)}
                />
                {p.uploadingKk ? (
                  <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">Mengunggah KK…</p>
                ) : null}
                <KompasBerkasPreview
                  path={p.path_kk}
                  namaFile={p.nama_file_kk}
                  previewUrl={p.preview_kk}
                  label="Pratinjau KK"
                />
              </div>
              <div>
                <label className="text-xs text-slate-500 dark:text-slate-400">
                  Foto 3×4 * {p.path_foto ? `· ${p.nama_file_foto || 'terunggah'}` : ''}
                </label>
                <p className="mt-0.5 text-[11px] leading-snug text-slate-500 dark:text-slate-400">
                  Pas foto 3×4. Setelah pilih gambar, atur crop, zoom, dan rotasi.
                </p>
                <BerkasFilePickField
                  accept={FOTO_ACCEPT}
                  disabled={!terbuka || Boolean(cropTarget)}
                  loading={p.uploadingFoto}
                  label="Pilih foto 3×4"
                  replaceLabel="Ganti foto"
                  selectedName={p.nama_file_foto || (p.path_foto ? 'terunggah' : '')}
                  hint="Gunakan JPG atau PNG. iPhone: simpan sebagai JPG jika format HEIC tidak bisa dipilih."
                  onFileSelected={(file) => onFotoSelect(idx, file)}
                />
                {p.uploadingFoto ? (
                  <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">Mengunggah foto…</p>
                ) : null}
                <KompasBerkasPreview
                  path={p.path_foto}
                  namaFile={p.nama_file_foto}
                  previewUrl={p.preview_foto}
                  label="Pratinjau foto"
                  aspect="3/4"
                />
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <input
                  className={inputClass}
                  placeholder="Nama ayah"
                  value={p.nama_ayah}
                  onChange={(e) => update(idx, { nama_ayah: e.target.value })}
                  disabled={!terbuka}
                />
                <input
                  className={inputClass}
                  placeholder="Nama ibu"
                  value={p.nama_ibu}
                  onChange={(e) => update(idx, { nama_ibu: e.target.value })}
                  disabled={!terbuka}
                />
              </div>
            </fieldset>
          ))}

          {terbuka ? (
            <button
              type="submit"
              disabled={saving}
              className="w-full rounded-xl bg-primary-600 py-3 font-medium text-white disabled:opacity-50 lg:max-w-sm"
            >
              {saving ? 'Menyimpan…' : 'Simpan'}
            </button>
          ) : null}
        </form>
      </div>

      {/* Kanan PC: detail lomba */}
      <aside className="hidden min-h-0 w-full shrink-0 flex-col border-l border-slate-200 bg-slate-50/80 dark:border-slate-700 dark:bg-slate-950/40 lg:flex lg:w-[22rem] xl:w-96">
        <div className="shrink-0 border-b border-slate-200 px-4 py-3 dark:border-slate-700">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Detail lomba</h2>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Informasi yang perlu diperhatikan saat mendaftar</p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
          <LombaDetailBody lomba={lomba} />
        </div>
      </aside>
    </div>
    {cropTarget ? (
      <FotoCrop3x4Modal
        file={cropTarget.file}
        zBase={120}
        onConfirm={onCropConfirm}
        onCancel={() => setCropTarget(null)}
      />
    ) : null}
    </>,
    document.body
  )
}

function DetailOffcanvas({ isOpen, lomba, onClose }) {
  const handleClose = useOffcanvasBackClose(isOpen, onClose)
  if (!lomba && !isOpen) return null

  return createPortal(
    <AnimatePresence>
      {isOpen && lomba ? (
        <>
          <motion.button
            key="kompas-detail-backdrop"
            type="button"
            aria-label="Tutup"
            className="fixed inset-0 z-[80] bg-black/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
          />
          <motion.aside
            key="kompas-detail-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="kompas-detail-title"
            className="fixed inset-y-0 right-0 z-[90] flex w-full max-w-md flex-col bg-white shadow-xl dark:bg-gray-900"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
          >
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-gray-200 px-4 py-3 dark:border-gray-700">
              <h2 id="kompas-detail-title" className="text-base font-semibold text-gray-900 dark:text-white">
                Detail lomba
              </h2>
              <button
                type="button"
                onClick={handleClose}
                className="rounded-lg px-2.5 py-1 text-sm text-gray-500 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                Tutup
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
              <LombaDetailBody lomba={lomba} />
            </div>
          </motion.aside>
        </>
      ) : null}
    </AnimatePresence>,
    document.body
  )
}

/**
 * Halaman KOMMPAS bersama untuk mode PJGT dan santri Guru Tugas.
 */
export default function KompasPage() {
  const { showToast } = useMybeddienToast()
  const activeAccess = useAuthStore((s) => s.activeAccess)
  const isGtMode = activeAccess === ACCESS_MODE.santri
  const { biodata, loading: biodataLoading } = useSantriBiodata()
  const isGuruTugas = isGtMode && isSantriGuruTugas(biodata)

  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [detailLomba, setDetailLomba] = useState(null)
  const [formLomba, setFormLomba] = useState(null)
  const [formExisting, setFormExisting] = useState(null)
  const [batasHijriLabel, setBatasHijriLabel] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await kompasMybeddianAPI.overview()
      if (res?.success) setData(res.data)
      else {
        setData(null)
        showToast(res?.message || 'Gagal memuat KOMMPAS', 'error')
      }
    } catch (err) {
      setData(null)
      showToast(err?.response?.data?.message || 'Gagal memuat KOMMPAS', 'error')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    if (isGtMode && biodataLoading) return
    if (isGtMode && !isGuruTugas) return
    load()
  }, [load, isGtMode, isGuruTugas, biodataLoading])

  const terbuka = data?.pendaftaran_terbuka !== false
  const lombaList = useMemo(() => data?.lomba || [], [data])
  const batasMasehiLabel = useMemo(
    () => formatBatasMasehi(data?.batas_pendaftaran),
    [data?.batas_pendaftaran]
  )

  useEffect(() => {
    let cancelled = false
    const ymd = data?.batas_pendaftaran ? String(data.batas_pendaftaran).slice(0, 10) : ''
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
      setBatasHijriLabel(null)
      return undefined
    }
    setBatasHijriLabel(null)
    void fetchKalenderConvertMasehiToHijri(ymd).then((hijriYmd) => {
      if (cancelled) return
      const label = formatYmdKeNamaBulan(hijriYmd, BULAN_HIJRIYAH)
      setBatasHijriLabel(label)
    })
    return () => {
      cancelled = true
    }
  }, [data?.batas_pendaftaran])

  const batasLabel = useMemo(() => {
    if (!batasMasehiLabel) return null
    if (batasHijriLabel) return `${batasMasehiLabel} / ${batasHijriLabel} H`
    return batasMasehiLabel
  }, [batasMasehiLabel, batasHijriLabel])

  const openEdit = async (row) => {
    setDetailLomba(null)
    if (!row.id_daftar) {
      setFormLomba(row)
      setFormExisting(null)
      return
    }
    try {
      const res = await kompasMybeddianAPI.getDaftar(row.id_daftar)
      if (res?.success) {
        setFormLomba(row)
        setFormExisting(res.data)
      } else {
        showToast(res?.message || 'Gagal memuat pendaftaran', 'error')
      }
    } catch (err) {
      showToast(err?.response?.data?.message || 'Gagal memuat pendaftaran', 'error')
    }
  }

  if (isGtMode && !biodataLoading && !isGuruTugas) {
    return (
      <div className="p-4 text-sm text-slate-600 dark:text-slate-300">
        Halaman KOMMPAS hanya untuk Guru Tugas.{' '}
        <Link to="/" className="text-primary-600 underline dark:text-primary-400">
          Kembali
        </Link>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-lg space-y-4 px-4 py-4 pb-8">
      <div className="flex items-center gap-3">
        <img
          src={KOMMPAS_LOGO_URL}
          alt="Logo KOMMPAS"
          width={48}
          height={46}
          decoding="async"
          className="h-12 w-auto shrink-0 object-contain"
        />
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">KOMMPAS</h1>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            {data?.nama_madrasah || 'Madrasah'} · TA {data?.tahun_ajaran || '—'}
          </p>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">Memuat…</p>
      ) : (
        <>
          <div
            className={`rounded-xl border px-4 py-3 text-sm ${
              terbuka
                ? 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100'
                : 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100'
            }`}
          >
            {terbuka ? (
              <>
                Batas pendaftaran: <strong>{batasLabel || 'belum ditentukan'}</strong>
                {batasLabel ? ' (masih terbuka)' : ''}
              </>
            ) : (
              <>
                Pendaftaran sudah ditutup{batasLabel ? ` (batas ${batasLabel})` : ''}
                .
              </>
            )}
          </div>

          {lombaList.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">Belum ada lomba untuk tahun ini.</p>
          ) : (
            <ul className="space-y-3">
              {lombaList.map((row) => (
                <li
                  key={row.id}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-800/80"
                >
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{row.nama}</h3>
                        {row.sudah_daftar ? (
                          <span
                            className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-xs text-white"
                            title="Sudah daftar"
                          >
                            ✓
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                        {row.kategori === 'grup' ? `Grup · ${row.anggota_per_kelompok} orang` : 'Perorangan'} ·
                        Usia {row.usia_min}–{row.usia_max}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setDetailLomba(row)}
                      className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700/60"
                    >
                      Detail
                    </button>
                    {terbuka ? (
                      <button
                        type="button"
                        onClick={() => openEdit(row)}
                        className="rounded-lg bg-primary-600 px-3 py-1.5 text-xs text-white"
                      >
                        {row.sudah_daftar ? 'Edit' : 'Daftar'}
                      </button>
                    ) : row.sudah_daftar ? (
                      <button
                        type="button"
                        onClick={() => openEdit(row)}
                        className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700/60"
                      >
                        Lihat
                      </button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}

          {/* Ruang ekstra di atas bottom nav agar tombol Daftar/Edit tidak tertutup */}
          <div
            className="h-[calc(1.5rem+env(safe-area-inset-bottom,0px))] sm:hidden"
            aria-hidden
          />
        </>
      )}

      <DetailOffcanvas
        isOpen={Boolean(detailLomba) && !formLomba}
        lomba={detailLomba}
        onClose={() => setDetailLomba(null)}
      />
      {formLomba ? (
        <KompasFormWorkspace
          lomba={formLomba}
          existing={formExisting}
          terbuka={terbuka}
          tahunAjaran={data?.tahun_ajaran || ''}
          onClose={() => {
            setFormLomba(null)
            setFormExisting(null)
          }}
          onSaved={load}
        />
      ) : null}
    </div>
  )
}
