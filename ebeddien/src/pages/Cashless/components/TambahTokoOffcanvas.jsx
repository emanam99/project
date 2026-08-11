import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { cashlessAPI } from '../../../services/api'
import { useNotification } from '../../../contexts/NotificationContext'
import { compressImage } from '../../../utils/imageCompression'

const MAX_FOTO_BYTES = 1024 * 1024 // 1 MB

function PhotoUploadBlock({
  label,
  hint,
  previewUrl,
  existingUrl,
  onPick,
  onClear,
  uploading,
  inputRef,
  showClear,
}) {
  return (
    <div className="border-b border-gray-200 dark:border-gray-700 pb-4 last:border-b-0 last:pb-0">
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{label}</label>
      {hint && <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">{hint}</p>}
      <div className="flex flex-col sm:flex-row gap-3 items-start">
        <div className="w-full sm:w-40 h-32 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50 flex items-center justify-center overflow-hidden shrink-0">
          {(previewUrl || existingUrl) ? (
            <img src={previewUrl || existingUrl} alt={label} className="w-full h-full object-cover" />
          ) : (
            <span className="text-xs text-gray-500 dark:text-gray-400 text-center px-2">Opsional</span>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/jpg,image/png,image/webp,image/gif"
            onChange={onPick}
            disabled={uploading}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50"
          >
            {uploading ? 'Mengunggah...' : 'Pilih File'}
          </button>
          {showClear && (
            <button
              type="button"
              onClick={onClear}
              disabled={uploading}
              className="px-3 py-2 rounded-lg border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm hover:bg-red-50 dark:hover:bg-red-900/20"
            >
              Hapus
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function usePhotoField(showNotification) {
  const [previewUrl, setPreviewUrl] = useState(null)
  const [existingUrl, setExistingUrl] = useState(null)
  const [file, setFile] = useState(null)
  const inputRef = useRef(null)
  const blobUrlRef = useRef(null)

  const reset = useCallback(() => {
    setPreviewUrl(null)
    setFile(null)
    setExistingUrl(null)
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current)
      blobUrlRef.current = null
    }
    if (inputRef.current) inputRef.current.value = ''
  }, [])

  const loadExisting = useCallback((path) => {
    setExistingUrl(null)
    if (!path) return () => {}
    let cancelled = false
    cashlessAPI.fetchFotoBlobUrl(path).then((url) => {
      if (!cancelled) setExistingUrl(url || null)
    }).catch(() => { if (!cancelled) setExistingUrl(null) })
    return () => { cancelled = true }
  }, [])

  const handlePick = useCallback(async (e) => {
    const picked = e.target?.files?.[0]
    if (!picked) return
    const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']
    if (!allowed.includes(picked.type)) {
      showNotification('Hanya file gambar (JPEG, PNG, WebP, GIF) yang diizinkan', 'error')
      return
    }
    let fileToUse = picked
    if (picked.size > MAX_FOTO_BYTES) {
      try {
        let maxMB = 1
        for (let i = 0; i < 5; i++) {
          fileToUse = await compressImage(fileToUse, maxMB, 1600, 1600)
          if (fileToUse.size <= MAX_FOTO_BYTES) break
          maxMB -= 0.2
          if (maxMB < 0.2) maxMB = 0.2
        }
      } catch {
        showNotification('Gagal mengompresi gambar', 'error')
        return
      }
    }
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current)
      blobUrlRef.current = null
    }
    const blobUrl = URL.createObjectURL(fileToUse)
    blobUrlRef.current = blobUrl
    setPreviewUrl(blobUrl)
    setFile(fileToUse)
    if (inputRef.current) inputRef.current.value = ''
  }, [showNotification])

  const clear = useCallback(() => {
    setPreviewUrl(null)
    setFile(null)
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current)
      blobUrlRef.current = null
    }
    if (inputRef.current) inputRef.current.value = ''
  }, [])

  useEffect(() => () => {
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current)
    }
  }, [])

  return { previewUrl, existingUrl, file, inputRef, reset, loadExisting, handlePick, clear }
}

export default function TambahTokoOffcanvas({ isOpen, onClose, onSuccess, initialData }) {
  const isEdit = Boolean(initialData?.id)
  const { showNotification } = useNotification()
  const [form, setForm] = useState({
    nama_toko: '',
    kode_toko: '',
    penanggung_jawab_nama: '',
    penanggung_jawab_nik: '',
  })
  const [saving, setSaving] = useState(false)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)

  const tokoPhoto = usePhotoField(showNotification)
  const pjFoto = usePhotoField(showNotification)
  const pjKtp = usePhotoField(showNotification)

  useEffect(() => {
    if (!isOpen) return
    if (initialData?.id) {
      setForm({
        nama_toko: initialData.nama_toko || '',
        kode_toko: initialData.kode_toko || '',
        penanggung_jawab_nama: initialData.penanggung_jawab_nama || '',
        penanggung_jawab_nik: initialData.penanggung_jawab_nik || '',
      })
    } else {
      setForm({ nama_toko: '', kode_toko: '', penanggung_jawab_nama: '', penanggung_jawab_nik: '' })
    }
    tokoPhoto.reset()
    pjFoto.reset()
    pjKtp.reset()
  }, [isOpen, initialData?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isOpen || !isEdit) return undefined
    const cleanToko = tokoPhoto.loadExisting(initialData?.foto_path)
    const cleanPjFoto = pjFoto.loadExisting(initialData?.penanggung_jawab_foto_path)
    const cleanPjKtp = pjKtp.loadExisting(initialData?.penanggung_jawab_ktp_path)
    return () => {
      cleanToko?.()
      cleanPjFoto?.()
      cleanPjKtp?.()
    }
  }, [isOpen, isEdit, initialData?.foto_path, initialData?.penanggung_jawab_foto_path, initialData?.penanggung_jawab_ktp_path]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [isOpen])

  const uploadPendingFiles = async (pedagangId) => {
    const tasks = []
    if (tokoPhoto.file) tasks.push(['toko', tokoPhoto.file])
    if (pjFoto.file) tasks.push(['pj_foto', pjFoto.file])
    if (pjKtp.file) tasks.push(['pj_ktp', pjKtp.file])
    if (tasks.length === 0) return true

    setUploadingPhoto(true)
    let allOk = true
    try {
      for (const [type, file] of tasks) {
        const uploadRes = await cashlessAPI.uploadFoto(file, pedagangId, type)
        if (!uploadRes?.success) allOk = false
      }
    } catch {
      allOk = false
    } finally {
      setUploadingPhoto(false)
    }
    return allOk
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const nama_toko = (form.nama_toko || '').trim()
    if (!nama_toko) {
      showNotification('Nama toko wajib diisi', 'error')
      return
    }
    const pjNikDigits = (form.penanggung_jawab_nik || '').replace(/\D/g, '')
    if (pjNikDigits && pjNikDigits.length !== 16) {
      showNotification('NIK penanggung jawab harus 16 digit', 'error')
      return
    }

    const pjPayload = {
      penanggung_jawab_nama: (form.penanggung_jawab_nama || '').trim() || null,
      penanggung_jawab_nik: pjNikDigits || null,
    }

    setSaving(true)
    try {
      if (isEdit) {
        const res = await cashlessAPI.updateToko(initialData.id, { nama_toko, ...pjPayload })
        if (!res.success) {
          showNotification(res.message || 'Gagal memperbarui toko', 'error')
          setSaving(false)
          return
        }
        const uploadsOk = await uploadPendingFiles(initialData.id)
        if (!uploadsOk) {
          showNotification('Toko berhasil diperbarui, sebagian file gagal diunggah', 'warning')
        } else {
          showNotification('Toko berhasil diperbarui', 'success')
        }
      } else {
        const res = await cashlessAPI.createToko({ nama_toko, ...pjPayload })
        if (!res.success) {
          showNotification(res.message || 'Gagal menambahkan toko', 'error')
          setSaving(false)
          return
        }
        const newId = res.data?.id
        if (newId) {
          const uploadsOk = await uploadPendingFiles(newId)
          if (!uploadsOk) {
            showNotification('Toko berhasil ditambahkan, sebagian file gagal diunggah', 'warning')
          }
        }
        const kode = res.data?.kode_toko ? ` (${res.data.kode_toko})` : ''
        showNotification(`Toko berhasil ditambahkan${kode}`, 'success')
      }
      onSuccess?.()
      onClose()
    } catch (err) {
      showNotification(err.response?.data?.message || (isEdit ? 'Gagal memperbarui toko' : 'Gagal menambahkan toko'), 'error')
    } finally {
      setSaving(false)
    }
  }

  if (!isOpen) return null

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="tambah-toko-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 z-[9998]"
        onClick={onClose}
        aria-hidden="true"
      />
      <motion.div
        key="tambah-toko-panel"
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'tween', duration: 0.25 }}
        className="fixed top-0 right-0 bottom-0 w-full max-w-md bg-white dark:bg-gray-800 shadow-xl z-[9999] flex flex-col"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{isEdit ? 'Edit Toko' : 'Tambah Toko'}</h3>
          <button
            type="button"
            onClick={onClose}
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
            <PhotoUploadBlock
              label="Foto Toko"
              previewUrl={tokoPhoto.previewUrl}
              existingUrl={tokoPhoto.existingUrl}
              onPick={tokoPhoto.handlePick}
              onClear={tokoPhoto.clear}
              uploading={uploadingPhoto}
              inputRef={tokoPhoto.inputRef}
              showClear={Boolean(tokoPhoto.previewUrl)}
            />

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nama Toko *</label>
              <input
                type="text"
                value={form.nama_toko}
                onChange={(e) => setForm((prev) => ({ ...prev, nama_toko: e.target.value }))}
                placeholder="Contoh: Warung Bu Ani"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-teal-500 dark:bg-gray-700 dark:text-gray-100 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Kode Toko</label>
              {isEdit ? (
                <p className="px-3 py-2 bg-gray-100 dark:bg-gray-700 rounded-lg text-sm text-gray-700 dark:text-gray-200">{form.kode_toko || '-'}</p>
              ) : (
                <p className="text-xs text-gray-500 dark:text-gray-400">Otomatis (yymmdd + urutan, contoh: 26030101)</p>
              )}
            </div>

            <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
              <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-3">Penanggung Jawab</h4>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nama</label>
                  <input
                    type="text"
                    value={form.penanggung_jawab_nama}
                    onChange={(e) => setForm((prev) => ({ ...prev, penanggung_jawab_nama: e.target.value }))}
                    placeholder="Nama lengkap penanggung jawab"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-teal-500 dark:bg-gray-700 dark:text-gray-100 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">NIK</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={form.penanggung_jawab_nik}
                    onChange={(e) => setForm((prev) => ({ ...prev, penanggung_jawab_nik: e.target.value.replace(/\D/g, '').slice(0, 16) }))}
                    placeholder="16 digit"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-teal-500 dark:bg-gray-700 dark:text-gray-100 text-sm font-mono"
                  />
                </div>
                <PhotoUploadBlock
                  label="Foto Penanggung Jawab"
                  hint="Foto wajah / potret penanggung jawab. Maks. 1 MB."
                  previewUrl={pjFoto.previewUrl}
                  existingUrl={pjFoto.existingUrl}
                  onPick={pjFoto.handlePick}
                  onClear={pjFoto.clear}
                  uploading={uploadingPhoto}
                  inputRef={pjFoto.inputRef}
                  showClear={Boolean(pjFoto.previewUrl)}
                />
                <PhotoUploadBlock
                  label="Upload KTP"
                  hint="Scan atau foto KTP penanggung jawab. Maks. 1 MB."
                  previewUrl={pjKtp.previewUrl}
                  existingUrl={pjKtp.existingUrl}
                  onPick={pjKtp.handlePick}
                  onClear={pjKtp.clear}
                  uploading={uploadingPhoto}
                  inputRef={pjKtp.inputRef}
                  showClear={Boolean(pjKtp.previewUrl)}
                />
              </div>
            </div>
          </div>

          <div className="flex gap-2 p-4 border-t border-gray-200 dark:border-gray-700 flex-shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 text-sm font-medium"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={saving || uploadingPhoto || !form.nama_toko?.trim()}
              className="flex-1 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving || uploadingPhoto ? 'Menyimpan...' : 'Simpan'}
            </button>
          </div>
        </form>
      </motion.div>
    </AnimatePresence>,
    document.body
  )
}
