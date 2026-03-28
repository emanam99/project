import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { ugtLaporanKoordinatorAPI, madrasahAPI } from '../../../services/api'
import { useNotification } from '../../../contexts/NotificationContext'
import { useOffcanvasBackClose } from '../../../hooks/useOffcanvasBackClose'
import { compressImage } from '../../../utils/imageCompression'
import { useTahunAjaranStore } from '../../../store/tahunAjaranStore'
import { getBulanName } from '../../Kalender/utils/bulanHijri'

const MAX_FOTO_BYTES = 1024 * 1024
const MAX_FOTO_RAW_BYTES = 10 * 1024 * 1024

function fileExtensionLower(name) {
  if (!name || typeof name !== 'string') return ''
  const i = name.lastIndexOf('.')
  return i >= 0 ? name.slice(i + 1).toLowerCase() : ''
}

function isAllowedFotoFile(file) {
  const mimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']
  if (file.type && mimes.includes(file.type)) return true
  return ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(fileExtensionLower(file.name))
}

function emptyForm(defaultTa) {
  return {
    id_madrasah: '',
    id_santri: '',
    santriSearch: '',
    santriLabel: '',
    id_tahun_ajaran: defaultTa || '',
    bulan: 1,
    usulan: '',
    foto: ''
  }
}

function rowToForm(row) {
  return {
    id_madrasah: String(row.id_madrasah ?? ''),
    id_santri: String(row.id_santri ?? ''),
    santriSearch: '',
    santriLabel: [row.santri_nama, row.santri_nis].filter(Boolean).join(' — ') || `ID ${row.id_santri}`,
    id_tahun_ajaran: row.id_tahun_ajaran ?? '',
    bulan: Number(row.bulan) || 1,
    usulan: row.usulan ?? '',
    foto: row.foto ?? ''
  }
}

function emptyMasalahRow() {
  return { masalah: '', solusi: '', saran: '' }
}

function mapApiMasalahToItems(list) {
  if (!Array.isArray(list) || list.length === 0) return [emptyMasalahRow()]
  return list.map((x) => ({
    masalah: x.masalah ?? '',
    solusi: x.solusi ?? '',
    saran: x.saran ?? ''
  }))
}

/**
 * Offcanvas kanan: tambah/edit laporan koordinator UGT (foto + kompresi, mirip form madrasah).
 */
export default function LaporanKoordinatorOffcanvas({
  isOpen,
  onClose,
  initialData,
  madrasahList,
  onSuccess
}) {
  const { showNotification } = useNotification()
  const tahunAjaranGlobal = useTahunAjaranStore((s) => s.tahunAjaran)
  const taOptions = useTahunAjaranStore((s) => s.options)

  const handleClose = useOffcanvasBackClose(isOpen, onClose, { urlManaged: true })

  const [form, setForm] = useState(() => emptyForm(tahunAjaranGlobal))
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [santriOptions, setSantriOptions] = useState([])
  const [santriOpen, setSantriOpen] = useState(false)
  const [santriLoading, setSantriLoading] = useState(false)
  const searchTimerRef = useRef(null)
  const photoInputRef = useRef(null)
  const photoBlobUrlRef = useRef(null)
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState(null)
  const [existingFotoBlobUrl, setExistingFotoBlobUrl] = useState(null)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const existingBlobUrlRef = useRef(null)
  const [masalahItems, setMasalahItems] = useState(() => [emptyMasalahRow()])

  const isEdit = Boolean(initialData?.id)

  useEffect(() => {
    if (!isOpen) return
    if (initialData?.id) {
      setForm(rowToForm(initialData))
    } else {
      setForm(emptyForm(tahunAjaranGlobal))
    }
    setSantriOptions([])
    setSantriOpen(false)
    setPhotoPreviewUrl(null)
    if (photoBlobUrlRef.current) {
      URL.revokeObjectURL(photoBlobUrlRef.current)
      photoBlobUrlRef.current = null
    }
  }, [isOpen, initialData?.id, tahunAjaranGlobal])

  useEffect(() => {
    if (!isOpen) return
    if (!initialData?.id) {
      setMasalahItems([emptyMasalahRow()])
      return
    }
    if (Array.isArray(initialData.masalah)) {
      setMasalahItems(mapApiMasalahToItems(initialData.masalah))
      return
    }
    let cancelled = false
    ugtLaporanKoordinatorAPI.getById(initialData.id)
      .then((res) => {
        if (cancelled || !res?.success || !res.data) return
        setMasalahItems(mapApiMasalahToItems(res.data.masalah))
      })
      .catch(() => {
        if (!cancelled) setMasalahItems([emptyMasalahRow()])
      })
    return () => { cancelled = true }
  }, [isOpen, initialData?.id, initialData?.masalah])

  useEffect(() => {
    if (!isOpen || !form.foto) {
      existingBlobUrlRef.current = null
      setExistingFotoBlobUrl(null)
      return
    }
    let cancelled = false
    madrasahAPI.fetchFotoBlobUrl(form.foto).then((url) => {
      if (!cancelled) {
        existingBlobUrlRef.current = url || null
        setExistingFotoBlobUrl(url || null)
      }
    }).catch(() => {
      if (!cancelled) setExistingFotoBlobUrl(null)
    })
    return () => { cancelled = true }
  }, [isOpen, form.foto])

  useEffect(() => {
    return () => {
      if (photoBlobUrlRef.current) {
        URL.revokeObjectURL(photoBlobUrlRef.current)
        photoBlobUrlRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (isOpen) document.body.style.overflow = 'hidden'
  }, [isOpen])

  useEffect(() => {
    return () => {
      document.body.style.overflow = ''
    }
  }, [])

  const fetchSantri = useCallback((q) => {
    setSantriLoading(true)
    ugtLaporanKoordinatorAPI.getSantriOptions({ search: q, limit: 50 })
      .then((res) => {
        if (res?.success && Array.isArray(res.data)) setSantriOptions(res.data)
        else setSantriOptions([])
      })
      .catch(() => setSantriOptions([]))
      .finally(() => setSantriLoading(false))
  }, [])

  const onSantriSearchChange = (value) => {
    setForm((prev) => ({ ...prev, santriSearch: value, santriLabel: value ? prev.santriLabel : '' }))
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    if ((value || '').trim().length < 1) {
      setSantriOptions([])
      return
    }
    searchTimerRef.current = setTimeout(() => fetchSantri(value.trim()), 300)
  }

  const pickSantri = (s) => {
    setForm((prev) => ({
      ...prev,
      id_santri: String(s.id),
      santriLabel: `${s.nama || ''}${s.nis ? ` — NIS ${s.nis}` : ''}`.trim(),
      santriSearch: ''
    }))
    setSantriOpen(false)
    setSantriOptions([])
  }

  const handlePhotoChange = async (e) => {
    const file = e.target?.files?.[0]
    if (!file) return
    if (!isAllowedFotoFile(file)) {
      showNotification('Hanya gambar (JPEG, PNG, WebP, GIF). Periksa ekstensi file.', 'error')
      return
    }
    if (file.size > MAX_FOTO_RAW_BYTES) {
      showNotification(`Ukuran foto mentah maks. ${MAX_FOTO_RAW_BYTES / (1024 * 1024)} MB.`, 'error')
      return
    }
    let fileToUpload = file
    if (file.size > MAX_FOTO_BYTES) {
      try {
        let maxMB = 1
        for (let i = 0; i < 5; i++) {
          fileToUpload = await compressImage(fileToUpload, maxMB, 1600, 1600)
          if (fileToUpload.size <= MAX_FOTO_BYTES) break
          maxMB -= 0.2
          if (maxMB < 0.2) maxMB = 0.2
        }
      } catch (err) {
        showNotification('Gagal mengompresi gambar: ' + (err?.message || ''), 'error')
        return
      }
    }
    setUploadingPhoto(true)
    if (photoBlobUrlRef.current) {
      URL.revokeObjectURL(photoBlobUrlRef.current)
      photoBlobUrlRef.current = null
    }
    const blobUrl = URL.createObjectURL(fileToUpload)
    photoBlobUrlRef.current = blobUrl
    setPhotoPreviewUrl(blobUrl)
    try {
      const res = await ugtLaporanKoordinatorAPI.uploadFoto(fileToUpload)
      if (res?.success && res?.foto_path) {
        setForm((prev) => ({ ...prev, foto: res.foto_path }))
        existingBlobUrlRef.current = null
        setExistingFotoBlobUrl(null)
      } else {
        showNotification(res?.message || 'Gagal mengunggah foto', 'error')
      }
    } catch (err) {
      showNotification(err?.response?.data?.message || err?.message || 'Gagal mengunggah foto', 'error')
    } finally {
      setUploadingPhoto(false)
      if (photoInputRef.current) photoInputRef.current.value = ''
    }
  }

  const clearPhoto = () => {
    setForm((prev) => ({ ...prev, foto: '' }))
    if (photoBlobUrlRef.current) {
      URL.revokeObjectURL(photoBlobUrlRef.current)
      photoBlobUrlRef.current = null
    }
    setPhotoPreviewUrl(null)
    existingBlobUrlRef.current = null
    setExistingFotoBlobUrl(null)
    if (photoInputRef.current) photoInputRef.current.value = ''
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const idM = parseInt(form.id_madrasah, 10)
    const idS = parseInt(form.id_santri, 10)
    const ta = (form.id_tahun_ajaran || '').trim()
    const bulan = Number(form.bulan)
    if (!idM || !idS || !ta || bulan < 1 || bulan > 12) {
      showNotification('Lengkapi madrasah, santri, tahun ajaran, dan bulan (1–12).', 'error')
      return
    }
    setSaving(true)
    try {
      const masalah_list = masalahItems
        .map((x) => ({
          masalah: (x.masalah || '').trim(),
          solusi: (x.solusi || '').trim(),
          saran: (x.saran || '').trim()
        }))
        .filter((x) => x.masalah || x.solusi || x.saran)

      const payload = {
        id_madrasah: idM,
        id_santri: idS,
        id_tahun_ajaran: ta,
        bulan,
        usulan: (form.usulan || '').trim() || null,
        foto: form.foto ? form.foto.trim() : null,
        masalah_list
      }
      let res
      if (isEdit) {
        res = await ugtLaporanKoordinatorAPI.update(initialData.id, payload)
      } else {
        res = await ugtLaporanKoordinatorAPI.create(payload)
      }
      if (res?.success) {
        showNotification(res.message || 'Tersimpan', 'success')
        onSuccess?.()
        handleClose()
      } else {
        showNotification(res?.message || 'Gagal menyimpan', 'error')
      }
    } catch (err) {
      showNotification(err?.response?.data?.message || err?.message || 'Gagal menyimpan', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!isEdit || !initialData?.id) return
    if (!window.confirm('Hapus laporan ini? Tindakan tidak dapat dibatalkan.')) return
    setDeleting(true)
    try {
      const res = await ugtLaporanKoordinatorAPI.remove(initialData.id)
      if (res?.success) {
        showNotification(res.message || 'Terhapus', 'success')
        onSuccess?.()
        handleClose()
      } else {
        showNotification(res?.message || 'Gagal menghapus', 'error')
      }
    } catch (err) {
      showNotification(err?.response?.data?.message || err?.message || 'Gagal menghapus', 'error')
    } finally {
      setDeleting(false)
    }
  }

  const bulanOptions = Array.from({ length: 12 }, (_, i) => {
    const n = i + 1
    return { value: n, label: `${n} — ${getBulanName(n, 'hijriyah')}` }
  })

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            key="lap-koord-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ type: 'tween', duration: 0.25 }}
            className="fixed inset-0 bg-black/50 z-[9998]"
            onClick={handleClose}
            aria-hidden="true"
          />
          <motion.div
            key="lap-koord-panel"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'tween', duration: 0.25 }}
            className="fixed top-0 right-0 bottom-0 w-full max-w-xl bg-white dark:bg-gray-800 shadow-xl z-[9999] flex flex-col"
          >
            <div className="flex items-center gap-2 px-3 py-3 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
              <button
                type="button"
                onClick={handleClose}
                className="p-2 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                aria-label="Kembali"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex-1">
                {isEdit ? 'Edit Laporan Koordinator' : 'Tambah Laporan Koordinator'}
              </h3>
              <button
                type="button"
                onClick={handleClose}
                className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-gray-400"
                aria-label="Tutup"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {isEdit && (initialData?.pembuat_nama || initialData?.id_pembuat) ? (
                  <p className="text-xs text-gray-500 dark:text-gray-400 -mt-1">
                    Dibuat oleh:{' '}
                    <span className="font-medium text-gray-700 dark:text-gray-300">
                      {(initialData.pembuat_nama || '').trim() || `Pengurus #${initialData.id_pembuat}`}
                    </span>
                  </p>
                ) : null}

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Madrasah</label>
                  <select
                    value={form.id_madrasah}
                    onChange={(e) => setForm((p) => ({ ...p, id_madrasah: e.target.value }))}
                    required
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
                  >
                    <option value="">— Pilih madrasah —</option>
                    {(madrasahList || []).map((m) => (
                      <option key={m.id} value={String(m.id)}>{m.nama || `ID ${m.id}`}</option>
                    ))}
                  </select>
                </div>

                <div className="relative">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Santri</label>
                  {form.id_santri ? (
                    <div className="flex items-center gap-2">
                      <span className="flex-1 text-sm text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 bg-gray-50 dark:bg-gray-900/40">
                        {form.santriLabel || `ID ${form.id_santri}`}
                      </span>
                      <button
                        type="button"
                        className="text-sm text-teal-600 dark:text-teal-400 shrink-0"
                        onClick={() => setForm((p) => ({ ...p, id_santri: '', santriLabel: '', santriSearch: '' }))}
                      >
                        Ubah
                      </button>
                    </div>
                  ) : (
                    <>
                      <input
                        type="text"
                        value={form.santriSearch}
                        onChange={(e) => onSantriSearchChange(e.target.value)}
                        onFocus={() => setSantriOpen(true)}
                        placeholder="Cari nama atau NIS..."
                        className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
                        autoComplete="off"
                      />
                      {santriOpen && (form.santriSearch.trim().length > 0 || santriOptions.length > 0) && (
                        <div className="absolute left-0 right-0 mt-1 max-h-48 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 shadow-lg z-10">
                          {santriLoading && (
                            <div className="px-3 py-2 text-xs text-gray-500">Mencari...</div>
                          )}
                          {!santriLoading && santriOptions.length === 0 && form.santriSearch.trim().length > 0 && (
                            <div className="px-3 py-2 text-xs text-gray-500">Tidak ada hasil</div>
                          )}
                          {santriOptions.map((s) => (
                            <button
                              key={s.id}
                              type="button"
                              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-900 dark:text-gray-100"
                              onClick={() => pickSantri(s)}
                            >
                              {s.nama || '—'} {s.nis != null && s.nis !== '' ? <span className="text-gray-500">(NIS {s.nis})</span> : null}
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tahun ajaran (Hijriyah)</label>
                  <select
                    value={form.id_tahun_ajaran}
                    onChange={(e) => setForm((p) => ({ ...p, id_tahun_ajaran: e.target.value }))}
                    required
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
                  >
                    <option value="">— Pilih —</option>
                    {taOptions.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Bulan (Hijriyah)</label>
                  <select
                    value={form.bulan}
                    onChange={(e) => setForm((p) => ({ ...p, bulan: Number(e.target.value) }))}
                    required
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
                  >
                    {bulanOptions.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Usulan</label>
                  <textarea
                    value={form.usulan}
                    onChange={(e) => setForm((p) => ({ ...p, usulan: e.target.value }))}
                    rows={4}
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
                    placeholder="Catatan / usulan koordinator..."
                  />
                </div>

                <div className="border-t border-gray-200 dark:border-gray-700 pt-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Masalah</label>
                    <button
                      type="button"
                      onClick={() => setMasalahItems((prev) => [...prev, emptyMasalahRow()])}
                      className="text-sm text-teal-600 dark:text-teal-400 font-medium hover:underline"
                    >
                      + Tambah masalah
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Ikut tersimpan bersama laporan; bisa lebih dari satu entri.
                  </p>
                  {masalahItems.map((item, idx) => (
                    <div
                      key={idx}
                      className="rounded-lg border border-gray-200 dark:border-gray-600 p-3 space-y-2 bg-gray-50/50 dark:bg-gray-900/20"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium text-gray-600 dark:text-gray-400">#{idx + 1}</span>
                        {masalahItems.length > 1 ? (
                          <button
                            type="button"
                            onClick={() => setMasalahItems((prev) => prev.filter((_, i) => i !== idx))}
                            className="text-xs text-red-600 dark:text-red-400 hover:underline"
                          >
                            Hapus
                          </button>
                        ) : null}
                      </div>
                      <textarea
                        value={item.masalah}
                        onChange={(e) => setMasalahItems((prev) => {
                          const next = [...prev]
                          next[idx] = { ...next[idx], masalah: e.target.value }
                          return next
                        })}
                        rows={2}
                        placeholder="Masalah yang ditemukan"
                        className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
                      />
                      <textarea
                        value={item.solusi}
                        onChange={(e) => setMasalahItems((prev) => {
                          const next = [...prev]
                          next[idx] = { ...next[idx], solusi: e.target.value }
                          return next
                        })}
                        rows={2}
                        placeholder="Solusi yang sudah dilakukan"
                        className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
                      />
                      <textarea
                        value={item.saran}
                        onChange={(e) => setMasalahItems((prev) => {
                          const next = [...prev]
                          next[idx] = { ...next[idx], saran: e.target.value }
                          return next
                        })}
                        rows={2}
                        placeholder="Saran tindak lanjut bagi pengurus UGB"
                        className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
                      />
                    </div>
                  ))}
                </div>

                <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Foto laporan</label>
                  <div className="flex flex-col sm:flex-row gap-3 items-start">
                    <div className="w-full sm:w-40 h-32 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50 flex items-center justify-center overflow-hidden shrink-0">
                      {(photoPreviewUrl || existingFotoBlobUrl) ? (
                        <img
                          src={photoPreviewUrl || existingFotoBlobUrl}
                          alt="Preview"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span className="text-xs text-gray-500 dark:text-gray-400 text-center px-2">Belum ada foto</span>
                      )}
                    </div>
                    <div className="flex flex-col gap-2">
                      <input
                        ref={photoInputRef}
                        type="file"
                        accept="image/jpeg,image/jpg,image/png,image/webp,image/gif"
                        onChange={handlePhotoChange}
                        disabled={uploadingPhoto}
                        className="hidden"
                      />
                      <button
                        type="button"
                        onClick={() => photoInputRef.current?.click()}
                        disabled={uploadingPhoto}
                        className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50"
                      >
                        {uploadingPhoto ? 'Mengunggah...' : 'Pilih Foto'}
                      </button>
                      {(form.foto || photoPreviewUrl) && (
                        <button
                          type="button"
                          onClick={clearPhoto}
                          disabled={uploadingPhoto}
                          className="px-3 py-2 rounded-lg border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm hover:bg-red-50 dark:hover:bg-red-900/20"
                        >
                          Hapus Foto
                        </button>
                      )}
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Gambar JPEG/PNG/WebP/GIF. Mentah maks. 10 MB; unggah maks. 1 MB (kompresi di perangkat).
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex flex-col gap-2 flex-shrink-0">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleClose}
                    className="flex-1 px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={saving || deleting}
                    className="flex-1 px-4 py-2.5 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white font-medium rounded-lg transition-colors"
                  >
                    {saving ? 'Menyimpan...' : isEdit ? 'Simpan' : 'Simpan'}
                  </button>
                </div>
                {isEdit && (
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={saving || deleting}
                    className="w-full px-4 py-2 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 rounded-lg text-sm hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50"
                  >
                    {deleting ? 'Menghapus...' : 'Hapus laporan'}
                  </button>
                )}
              </div>
            </form>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  )
}
