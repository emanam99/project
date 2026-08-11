import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import * as XLSX from 'xlsx'
import { madrasahAPI, ugtKompasAPI } from '../../../services/api'
import { useNotification } from '../../../contexts/NotificationContext'
import { useOffcanvasBackClose } from '../../../hooks/useOffcanvasBackClose'
import CetakKartuSantriFotoCropModal from '../../Cashless/components/CetakKartuSantriFotoCropModal'
import KompasNikField, { KompasTanggalLahirField, calcAgeYears } from './KompasNikTanggalFields'
import KompasAbsenPesertaOffcanvas from './KompasAbsenPesertaOffcanvas'

function tipeLombaLabel(kategori, anggotaPerKelompok) {
  const k = String(kategori || '').toLowerCase()
  if (k === 'grup') {
    const n = Number(anggotaPerKelompok)
    return Number.isFinite(n) && n > 0 ? `Grup (${n} orang)` : 'Grup'
  }
  if (k === 'perorangan') return 'Perorangan'
  return kategori || '—'
}

function buildKompasExportRows(rows) {
  return (rows || []).map((r, idx) => {
    const usia =
      r.usia != null && r.usia !== '' && !Number.isNaN(Number(r.usia))
        ? Number(r.usia)
        : calcAgeYears(String(r.tanggal_lahir || '').slice(0, 10))
    return {
      No: idx + 1,
      'Tahun ajaran': r.tahun_ajaran || '',
      Lomba: r.nama_lomba || '',
      'Tipe lomba': tipeLombaLabel(r.kategori, r.anggota_per_kelompok),
      Madrasah: r.nama_madrasah || '',
      'Identitas madrasah': r.identitas_madrasah || '',
      Koordinator: r.koordinator_nama || '',
      Alamat: r.alamat_madrasah || '',
      GT: r.guru_tugas_nama || '',
      'Urutan peserta': r.urutan != null ? Number(r.urutan) : '',
      'Nama peserta': r.nama_peserta || '',
      NIK: r.nik || '',
      'Tempat lahir': r.tempat_lahir || '',
      'Tanggal lahir': r.tanggal_lahir || '',
      Usia: usia != null ? usia : '',
      'Nama ayah': r.nama_ayah || '',
      'Nama ibu': r.nama_ibu || '',
      'Tanggal daftar': r.tanggal_daftar || '',
    }
  })
}

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
    nama_ayah: '',
    nama_ibu: '',
    uploadingKk: false,
    uploadingFoto: false,
  }
}

function isPdfBerkas(path, namaFile) {
  const s = `${path || ''} ${namaFile || ''}`.toLowerCase()
  return s.includes('.pdf')
}

function revokeLocalPreview(url) {
  if (!url || !String(url).startsWith('blob:')) return
  for (const cached of ugtKompasAPI._berkasBlobCache.values()) {
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
              ? 'aspect-[3/4] w-full rounded-lg border border-gray-200 bg-gray-50 object-cover dark:border-gray-600 dark:bg-gray-900'
              : 'max-h-40 max-w-full rounded-lg border border-gray-200 bg-gray-50 object-contain dark:border-gray-600 dark:bg-gray-900'
          }
        />
      </a>
    )
  }

  if (previewUrl && pdf) {
    return (
      <div className="mt-1.5 space-y-1.5">
        <div className="flex h-28 w-full max-w-xs items-center justify-center rounded-lg border border-dashed border-gray-300 bg-gray-50 text-xs text-gray-500 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-400">
          Berkas PDF
        </div>
        <a
          href={previewUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex text-xs font-medium text-teal-600 underline dark:text-teal-400"
        >
          Buka {namaFile || 'PDF'}
        </a>
      </div>
    )
  }

  return (
    <p className="mt-0.5 truncate text-[11px] text-teal-600 dark:text-teal-400">
      {namaFile || path}
    </p>
  )
}

function KompasBerkasThumb({ path, namaFile, label, aspect = null }) {
  const [url, setUrl] = useState('')
  useEffect(() => {
    let cancelled = false
    setUrl('')
    if (!path) return undefined
    ;(async () => {
      const blobUrl = await ugtKompasAPI.fetchBerkasBlobUrl(path)
      if (!cancelled && blobUrl) setUrl(blobUrl)
    })()
    return () => {
      cancelled = true
    }
  }, [path])
  return (
    <KompasBerkasPreview
      path={path}
      namaFile={namaFile}
      previewUrl={url}
      label={label}
      aspect={aspect}
    />
  )
}

function DaftarFormOffcanvas({ isOpen, onClose, tahunAjaran, lombaList, madrasahList, onSaved }) {
  const { showNotification } = useNotification()
  const handleClose = useOffcanvasBackClose(isOpen, onClose)
  const [idLomba, setIdLomba] = useState('')
  const [idMadrasah, setIdMadrasah] = useState('')
  const [peserta, setPeserta] = useState([emptyPeserta()])
  const [saving, setSaving] = useState(false)
  const [madrasahSearch, setMadrasahSearch] = useState('')
  const [cropTarget, setCropTarget] = useState(null) // { idx, file }

  const lomba = useMemo(
    () => lombaList.find((l) => String(l.id) === String(idLomba)) || null,
    [lombaList, idLomba]
  )

  const expectedCount = lomba
    ? lomba.kategori === 'grup'
      ? Number(lomba.anggota_per_kelompok) || 0
      : 1
    : 1

  useEffect(() => {
    if (!isOpen) return
    setIdLomba('')
    setIdMadrasah('')
    setMadrasahSearch('')
    setPeserta([emptyPeserta()])
  }, [isOpen])

  useEffect(() => {
    if (!lomba) return
    const n = expectedCount > 0 ? expectedCount : 1
    setPeserta((prev) => {
      const next = []
      for (let i = 0; i < n; i += 1) {
        next.push(prev[i] ? { ...prev[i] } : emptyPeserta())
      }
      return next
    })
  }, [lomba?.id, expectedCount])

  const filteredMadrasah = useMemo(() => {
    const q = madrasahSearch.trim().toLowerCase()
    if (!q) return madrasahList
    return madrasahList.filter((m) => {
      const nama = String(m.nama || '').toLowerCase()
      const idt = String(m.identitas || '').toLowerCase()
      return nama.includes(q) || idt.includes(q)
    })
  }, [madrasahList, madrasahSearch])

  const updatePeserta = (idx, patch) => {
    setPeserta((prev) => prev.map((p, i) => (i === idx ? { ...p, ...patch } : p)))
  }

  const onFotoSelect = (idx, file) => {
    if (!file) return
    if (!file.type?.startsWith('image/')) {
      showNotification('Foto harus berupa gambar', 'error')
      return
    }
    setCropTarget({ idx, file })
  }

  const onCropConfirm = (blob) => {
    const idx = cropTarget?.idx
    setCropTarget(null)
    if (idx == null || !blob) return
    const file = new File([blob], `foto_kompas_${Date.now()}.jpg`, { type: blob.type || 'image/jpeg' })
    uploadFile(idx, file, 'foto')
  }

  const uploadFile = async (idx, file, jenis) => {
    if (!file) return
    const localPreview = URL.createObjectURL(file)
    const current = peserta[idx]
    if (jenis === 'kk') {
      revokeLocalPreview(current?.preview_kk)
      updatePeserta(idx, { uploadingKk: true, preview_kk: localPreview })
    } else {
      revokeLocalPreview(current?.preview_foto)
      updatePeserta(idx, { uploadingFoto: true, preview_foto: localPreview })
    }
    try {
      const res = await ugtKompasAPI.upload(file, jenis)
      if (res?.success && res.data?.path) {
        if (jenis === 'kk') {
          updatePeserta(idx, {
            path_kk: res.data.path,
            nama_file_kk: res.data.nama_file || file.name,
            preview_kk: localPreview,
            uploadingKk: false
          })
        } else {
          updatePeserta(idx, {
            path_foto: res.data.path,
            nama_file_foto: res.data.nama_file || file.name,
            preview_foto: localPreview,
            uploadingFoto: false
          })
        }
        showNotification('Berkas terunggah', 'success')
      } else {
        revokeLocalPreview(localPreview)
        updatePeserta(
          idx,
          jenis === 'kk'
            ? { uploadingKk: false, preview_kk: '' }
            : { uploadingFoto: false, preview_foto: '' }
        )
        showNotification(res?.message || 'Gagal unggah', 'error')
      }
    } catch (err) {
      revokeLocalPreview(localPreview)
      updatePeserta(
        idx,
        jenis === 'kk'
          ? { uploadingKk: false, preview_kk: '' }
          : { uploadingFoto: false, preview_foto: '' }
      )
      showNotification(err?.response?.data?.message || 'Gagal unggah', 'error')
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!idLomba || !idMadrasah) {
      showNotification('Pilih lomba dan madrasah', 'error')
      return
    }
    const usiaMin = Number(lomba?.usia_min ?? 0)
    const usiaMax = Number(lomba?.usia_max ?? 99)
    for (let i = 0; i < peserta.length; i += 1) {
      const p = peserta[i]
      if (!p.nama.trim() || !p.nik.trim() || !p.tempat_lahir.trim() || !p.tanggal_lahir || !p.path_kk || !p.path_foto) {
        showNotification(`Peserta #${i + 1}: nama, NIK, tempat/tanggal lahir, KK, dan foto wajib`, 'error')
        return
      }
      const age = calcAgeYears(p.tanggal_lahir)
      if (age === null || age < usiaMin || age > usiaMax) {
        showNotification(
          `Usia peserta ${p.nama.trim() || '#' + (i + 1)} ${age ?? '?'} tahun (di luar rentang ${usiaMin}–${usiaMax})`,
          'error'
        )
        return
      }
    }
    setSaving(true)
    try {
      const payload = {
        id_lomba: Number(idLomba),
        id_madrasah: Number(idMadrasah),
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
          nama_ibu: p.nama_ibu.trim() || null
        }))
      }
      const res = await ugtKompasAPI.createDaftar(payload)
      if (res?.success) {
        showNotification(res.message || 'Pendaftaran berhasil', 'success')
        onSaved?.()
        handleClose()
      } else {
        showNotification(res?.message || 'Gagal mendaftar', 'error')
      }
    } catch (err) {
      showNotification(err?.response?.data?.message || err?.message || 'Gagal mendaftar', 'error')
    } finally {
      setSaving(false)
    }
  }

  const inputClass =
    'w-full border rounded-md px-3 py-2 text-sm bg-white text-gray-900 placeholder:text-gray-400 dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 dark:placeholder:text-gray-500 focus:ring-1 focus:ring-teal-400 focus:outline-none disabled:opacity-60'
  const labelClass = 'block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1'

  return (
    <>
      {createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            key="kompas-daftar-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-[9998]"
            onClick={handleClose}
          />
          <motion.aside
            key="kompas-daftar-panel"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'tween', duration: 0.22 }}
            className="fixed inset-y-0 right-0 w-full max-w-lg bg-white dark:bg-gray-800 shadow-xl z-[9999] flex flex-col"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Daftar lomba</h2>
              <button type="button" onClick={handleClose} className="text-sm text-gray-500 dark:text-gray-300 hover:text-gray-800 dark:hover:text-gray-200">
                Tutup
              </button>
            </div>
            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
              <div>
                <label className={labelClass}>Lomba *</label>
                <select
                  className={inputClass}
                  value={idLomba}
                  onChange={(e) => setIdLomba(e.target.value)}
                  required
                >
                  <option value="">Pilih lomba</option>
                  {lombaList.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.nama} ({l.kategori === 'grup' ? `grup ${l.anggota_per_kelompok}` : 'perorangan'})
                    </option>
                  ))}
                </select>
                {lomba ? (
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">
                    Usia {lomba.usia_min}–{lomba.usia_max} th · isi {expectedCount} peserta
                  </p>
                ) : null}
              </div>
              <div>
                <label className={labelClass}>Madrasah *</label>
                <input
                  className={`${inputClass} mb-1`}
                  placeholder="Cari nama / identitas…"
                  value={madrasahSearch}
                  onChange={(e) => setMadrasahSearch(e.target.value)}
                />
                <select
                  className={inputClass}
                  value={idMadrasah}
                  onChange={(e) => setIdMadrasah(e.target.value)}
                  required
                >
                  <option value="">Pilih madrasah</option>
                  {filteredMadrasah.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nama}
                      {m.identitas ? ` (${m.identitas})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {peserta.map((p, idx) => (
                <fieldset
                  key={idx}
                  className="rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50/50 dark:bg-gray-900/30 p-3 space-y-2"
                >
                  <legend className="text-xs font-semibold text-teal-700 dark:text-teal-300 px-1">
                    Peserta {peserta.length > 1 ? `#${idx + 1}` : ''}
                  </legend>
                  <div>
                    <label className={labelClass}>Nama *</label>
                    <input
                      className={inputClass}
                      value={p.nama}
                      onChange={(e) => updatePeserta(idx, { nama: e.target.value })}
                      required
                    />
                  </div>
                  <KompasNikField
                    nik={p.nik}
                    tahunAjaran={tahunAjaran}
                    disabled={false}
                    labelClass={labelClass}
                    inputClass={inputClass}
                    onNikChange={(nik) => updatePeserta(idx, { nik })}
                    onTanggalLahirFromNik={(ttl) => updatePeserta(idx, { tanggal_lahir: ttl })}
                  />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <label className={labelClass}>Tempat lahir *</label>
                      <input
                        className={inputClass}
                        value={p.tempat_lahir}
                        onChange={(e) => updatePeserta(idx, { tempat_lahir: e.target.value })}
                        required
                      />
                    </div>
                    {lomba ? (
                      <KompasTanggalLahirField
                        tanggalLahir={p.tanggal_lahir}
                        usiaMin={Number(lomba.usia_min ?? 0)}
                        usiaMax={Number(lomba.usia_max ?? 99)}
                        labelClass={labelClass}
                        inputClass={inputClass}
                        onChange={(v) => updatePeserta(idx, { tanggal_lahir: v })}
                      />
                    ) : (
                      <div>
                        <label className={labelClass}>Tanggal lahir *</label>
                        <input
                          type="date"
                          className={inputClass}
                          value={p.tanggal_lahir}
                          onChange={(e) => updatePeserta(idx, { tanggal_lahir: e.target.value })}
                          required
                        />
                        <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">Pilih lomba dulu untuk melihat batas usia</p>
                      </div>
                    )}
                  </div>
                  <div>
                    <label className={labelClass}>Upload KK * (gambar/PDF ≤5 MB)</label>
                    <p className="mb-1 text-[11px] leading-snug text-amber-700 dark:text-amber-300">
                      Pastikan foto KK rapi dan terbaca (semua data jelas, tidak buram/terpotong).
                    </p>
                    <input
                      type="file"
                      accept="image/*,.pdf,application/pdf"
                      className="block w-full text-xs text-gray-600 dark:text-gray-300"
                      onChange={(e) => {
                        uploadFile(idx, e.target.files?.[0], 'kk')
                        e.target.value = ''
                      }}
                      disabled={p.uploadingKk}
                    />
                    {p.uploadingKk ? (
                      <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">Mengunggah…</p>
                    ) : null}
                    <KompasBerkasPreview
                      path={p.path_kk}
                      namaFile={p.nama_file_kk}
                      previewUrl={p.preview_kk}
                      label="Pratinjau KK"
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Upload foto * (pas foto 3×4, ≤1 MB)</label>
                    <p className="mb-1 text-[11px] leading-snug text-gray-500 dark:text-gray-400">
                      Pas foto 3×4. Setelah pilih gambar, atur crop, zoom, dan rotasi.
                    </p>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      className="block w-full text-xs text-gray-600 dark:text-gray-300"
                      onChange={(e) => {
                        onFotoSelect(idx, e.target.files?.[0])
                        e.target.value = ''
                      }}
                      disabled={p.uploadingFoto || Boolean(cropTarget)}
                    />
                    {p.uploadingFoto ? (
                      <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">Mengunggah…</p>
                    ) : null}
                    <KompasBerkasPreview
                      path={p.path_foto}
                      namaFile={p.nama_file_foto}
                      previewUrl={p.preview_foto}
                      label="Pratinjau foto"
                      aspect="3/4"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <label className={labelClass}>Nama ayah (opsional)</label>
                      <input
                        className={inputClass}
                        value={p.nama_ayah}
                        onChange={(e) => updatePeserta(idx, { nama_ayah: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Nama ibu (opsional)</label>
                      <input
                        className={inputClass}
                        value={p.nama_ibu}
                        onChange={(e) => updatePeserta(idx, { nama_ibu: e.target.value })}
                      />
                    </div>
                  </div>
                </fieldset>
              ))}

              <button
                type="submit"
                disabled={saving || !lomba}
                className="w-full py-2.5 rounded-md bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium disabled:opacity-50"
              >
                {saving ? 'Menyimpan…' : 'Simpan pendaftaran'}
              </button>
            </form>
          </motion.aside>
        </>
      )}
    </AnimatePresence>,
    document.body
      )}
      {cropTarget ? (
        <CetakKartuSantriFotoCropModal
          key="kompas-foto-crop"
          file={cropTarget.file}
          zBase={10050}
          onConfirm={onCropConfirm}
          onCancel={() => setCropTarget(null)}
        />
      ) : null}
    </>
  )
}

function DetailOffcanvas({ isOpen, onClose, detail }) {
  const handleClose = useOffcanvasBackClose(isOpen, onClose)
  if (!detail) return null
  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-[9998]"
            onClick={handleClose}
          />
          <motion.aside
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'tween', duration: 0.22 }}
            className="fixed inset-y-0 right-0 w-full max-w-md bg-white dark:bg-gray-800 shadow-xl z-[9999] flex flex-col"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Detail pendaftaran</h2>
              <button type="button" onClick={handleClose} className="text-sm text-gray-500 dark:text-gray-300">
                Tutup
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 text-sm">
              <div>
                <p className="font-medium text-gray-900 dark:text-gray-100">{detail.nama_lomba}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{detail.nama_madrasah}</p>
              </div>
              {(detail.peserta || []).map((p) => (
                <div
                  key={p.id}
                  className="space-y-2 rounded border border-gray-200 px-3 py-2 dark:border-gray-600"
                >
                  <p className="font-medium text-gray-800 dark:text-gray-100">
                    {p.urutan}. {p.nama}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">NIK {p.nik}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {p.tempat_lahir}, {p.tanggal_lahir}
                    {` · Usia ${
                      p.usia != null
                        ? p.usia
                        : calcAgeYears(String(p.tanggal_lahir || '').slice(0, 10)) ?? '—'
                    } tahun`}
                  </p>
                  {(p.nama_ayah || p.nama_ibu) && (
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Ayah: {p.nama_ayah || '—'} · Ibu: {p.nama_ibu || '—'}
                    </p>
                  )}
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <div>
                      <p className="mb-0.5 text-[11px] font-medium text-gray-500 dark:text-gray-400">KK</p>
                      <KompasBerkasThumb path={p.path_kk} namaFile={p.nama_file_kk} label="KK" />
                    </div>
                    <div>
                      <p className="mb-0.5 text-[11px] font-medium text-gray-500 dark:text-gray-400">Foto</p>
                      <KompasBerkasThumb
                        path={p.path_foto}
                        namaFile={p.nama_file_foto}
                        label="Foto"
                        aspect="3/4"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>,
    document.body
  )
}

export default function KompasDaftarTab({ tahunAjaran, fitur = {} }) {
  const { showNotification } = useNotification()
  const [list, setList] = useState([])
  const [lombaList, setLombaList] = useState([])
  const [madrasahList, setMadrasahList] = useState([])
  const [filterLomba, setFilterLomba] = useState('')
  const [loading, setLoading] = useState(true)
  const [formOpen, setFormOpen] = useState(false)
  const [detail, setDetail] = useState(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [pendaftaranTerbuka, setPendaftaranTerbuka] = useState(true)
  const [batasPendaftaran, setBatasPendaftaran] = useState('')
  const [exporting, setExporting] = useState(false)
  const [absenPrintOpen, setAbsenPrintOpen] = useState(false)
  const canTambah = fitur.daftarTambah !== false
  const canHapus = fitur.daftarHapus !== false

  const filterLombaNama = useMemo(() => {
    if (!filterLomba) return null
    const hit = lombaList.find((l) => String(l.id) === String(filterLomba))
    return hit?.nama || null
  }, [filterLomba, lombaList])

  const load = useCallback(async () => {
    if (!tahunAjaran) return
    setLoading(true)
    try {
      const [resDaftar, resLomba, resMad] = await Promise.all([
        ugtKompasAPI.listDaftar({
          tahun_ajaran: tahunAjaran,
          id_lomba: filterLomba || undefined
        }),
        ugtKompasAPI.listLomba(tahunAjaran),
        madrasahAPI.getAll()
      ])
      if (resDaftar?.success) setList(resDaftar.data || [])
      else setList([])
      if (resDaftar?.meta) {
        setPendaftaranTerbuka(resDaftar.meta.pendaftaran_terbuka !== false)
        setBatasPendaftaran(resDaftar.meta.batas_pendaftaran || '')
      }
      if (resLomba?.success) setLombaList(resLomba.data || [])
      setMadrasahList(resMad?.success && Array.isArray(resMad.data) ? resMad.data : [])
    } catch (err) {
      showNotification(err?.response?.data?.message || 'Gagal memuat data', 'error')
    } finally {
      setLoading(false)
    }
  }, [tahunAjaran, filterLomba, showNotification])

  useEffect(() => {
    load()
  }, [load])

  const openDetail = async (id) => {
    try {
      const res = await ugtKompasAPI.getDaftar(id)
      if (res?.success) {
        setDetail(res.data)
        setDetailOpen(true)
      } else {
        showNotification(res?.message || 'Gagal memuat detail', 'error')
      }
    } catch (err) {
      showNotification(err?.response?.data?.message || 'Gagal memuat detail', 'error')
    }
  }

  const handleDelete = async (row) => {
    if (!window.confirm(`Hapus pendaftaran ${row.nama_madrasah} di «${row.nama_lomba}»?`)) return
    try {
      const res = await ugtKompasAPI.deleteDaftar(row.id)
      if (res?.success) {
        showNotification(res.message || 'Terhapus', 'success')
        load()
      } else {
        showNotification(res?.message || 'Gagal menghapus', 'error')
      }
    } catch (err) {
      showNotification(err?.response?.data?.message || 'Gagal menghapus', 'error')
    }
  }

  const handleExportExcel = async () => {
    if (!tahunAjaran || exporting) return
    setExporting(true)
    try {
      const res = await ugtKompasAPI.exportDaftar({
        tahun_ajaran: tahunAjaran,
        id_lomba: filterLomba || undefined,
      })
      if (!res?.success) {
        showNotification(res?.message || 'Gagal mengekspor', 'error')
        return
      }
      const rows = buildKompasExportRows(res.data || [])
      if (rows.length === 0) {
        showNotification('Tidak ada data pendaftar untuk diekspor (sesuai filter lomba)', 'error')
        return
      }
      const ws = XLSX.utils.json_to_sheet(rows)
      ws['!cols'] = [
        { wch: 5 },
        { wch: 14 },
        { wch: 28 },
        { wch: 18 },
        { wch: 28 },
        { wch: 16 },
        { wch: 24 },
        { wch: 36 },
        { wch: 28 },
        { wch: 12 },
        { wch: 26 },
        { wch: 18 },
        { wch: 16 },
        { wch: 14 },
        { wch: 8 },
        { wch: 20 },
        { wch: 20 },
        { wch: 18 },
      ]
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Pendaftar')
      const lombaTag = (filterLombaNama || 'Semua_Lomba')
        .replace(/[^\w\-]+/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '')
        .slice(0, 48) || 'Semua_Lomba'
      const filename = `${lombaTag}_${tahunAjaran}_${new Date().toISOString().slice(0, 10)}.xlsx`
      XLSX.writeFile(wb, filename)
      showNotification(
        `Excel terunduh · ${rows.length} peserta` +
          (filterLombaNama ? ` · filter «${filterLombaNama}»` : ' · semua lomba'),
        'success'
      )
    } catch (err) {
      showNotification(err?.response?.data?.message || 'Gagal mengekspor Excel', 'error')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div>
      {!pendaftaranTerbuka ? (
        <div className="mb-4 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
          Pendaftaran sudah ditutup{batasPendaftaran ? ` (batas ${batasPendaftaran})` : ''}. Data hanya bisa dilihat —
          tidak bisa menambah, mengubah, atau menghapus.
        </div>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs text-gray-600 dark:text-gray-400">Filter lomba</label>
          <select
            value={filterLomba}
            onChange={(e) => setFilterLomba(e.target.value)}
            className="border rounded-md px-2 py-1.5 text-sm bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600"
          >
            <option value="">Semua</option>
            {lombaList.map((l) => (
              <option key={l.id} value={l.id}>
                {l.nama}
                {l.kategori === 'grup'
                  ? ` · Grup ${l.anggota_per_kelompok || ''}`
                  : ' · Perorangan'}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setAbsenPrintOpen(true)}
            disabled={loading || lombaList.length === 0}
            className="px-3 py-1.5 rounded-md border border-gray-300 text-gray-700 dark:border-gray-600 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/50 text-sm font-medium disabled:opacity-50 inline-flex items-center gap-1.5"
            title={
              filterLombaNama
                ? `Cetak absen peserta lomba «${filterLombaNama}»`
                : 'Cetak absen peserta semua lomba'
            }
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"
              />
            </svg>
            Print
          </button>
          <button
            type="button"
            onClick={handleExportExcel}
            disabled={exporting || loading || lombaList.length === 0}
            className="px-3 py-1.5 rounded-md border border-emerald-600 text-emerald-700 dark:border-emerald-500 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 text-sm font-medium disabled:opacity-50 inline-flex items-center gap-1.5"
            title={
              filterLombaNama
                ? `Eksport peserta lomba «${filterLombaNama}»`
                : 'Eksport peserta semua lomba'
            }
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
              />
            </svg>
            {exporting ? 'Mengekspor…' : 'Eksport'}
          </button>
          {pendaftaranTerbuka && canTambah ? (
            <button
              type="button"
              onClick={() => setFormOpen(true)}
              disabled={lombaList.length === 0}
              className="px-3 py-1.5 rounded-md bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium disabled:opacity-50"
            >
              + Daftar
            </button>
          ) : null}
        </div>
      </div>

      {lombaList.length === 0 && !loading ? (
        <p className="text-sm text-amber-700 dark:text-amber-300 mb-3">
          Belum ada lomba di tahun ini. Buat lomba di tab Lomba terlebih dahulu.
        </p>
      ) : null}

      {loading ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">Memuat…</p>
      ) : list.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">Belum ada pendaftaran.</p>
      ) : (
        <ul className="space-y-2">
          {list.map((row) => (
            <li
              key={row.id}
              className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3 flex flex-wrap items-center justify-between gap-2"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{row.nama_madrasah}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {row.nama_lomba} · {row.jumlah_peserta} peserta ·{' '}
                  {tipeLombaLabel(row.kategori, row.anggota_per_kelompok)}
                  {row.usia_peserta_label ? ` · Usia ${row.usia_peserta_label}` : ''}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => openDetail(row.id)}
                  className="px-2.5 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  Detail
                </button>
                {pendaftaranTerbuka && canHapus ? (
                  <button
                    type="button"
                    onClick={() => handleDelete(row)}
                    className="px-2.5 py-1 text-xs rounded border border-red-300 text-red-700 dark:border-red-700 dark:text-red-300"
                  >
                    Hapus
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      <DaftarFormOffcanvas
        isOpen={formOpen}
        onClose={() => setFormOpen(false)}
        tahunAjaran={tahunAjaran}
        lombaList={lombaList}
        madrasahList={madrasahList}
        onSaved={load}
      />
      <DetailOffcanvas
        isOpen={detailOpen}
        onClose={() => {
          setDetailOpen(false)
          setDetail(null)
        }}
        detail={detail}
      />
      <KompasAbsenPesertaOffcanvas
        isOpen={absenPrintOpen}
        onClose={() => setAbsenPrintOpen(false)}
        tahunAjaran={tahunAjaran}
        filterLomba={filterLomba}
        filterLombaNama={filterLombaNama}
      />
    </div>
  )
}
