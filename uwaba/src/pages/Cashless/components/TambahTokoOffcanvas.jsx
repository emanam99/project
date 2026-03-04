import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { cashlessAPI } from '../../../services/api'
import { useNotification } from '../../../contexts/NotificationContext'
import { compressImage } from '../../../utils/imageCompression'

const MAX_FOTO_BYTES = 1024 * 1024 // 1 MB

export default function TambahTokoOffcanvas({ isOpen, onClose, onSuccess, initialData }) {
  const isEdit = Boolean(initialData?.id)
  const { showNotification } = useNotification()
  const [form, setForm] = useState({ nama_toko: '', kode_toko: '' })
  const [saving, setSaving] = useState(false)
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState(null)
  const [existingFotoUrl, setExistingFotoUrl] = useState(null)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [fotoFile, setFotoFile] = useState(null)
  const photoInputRef = useRef(null)
  const photoBlobUrlRef = useRef(null)

  useEffect(() => {
    if (isOpen) {
      if (initialData?.id) {
        setForm({ nama_toko: initialData.nama_toko || '', kode_toko: initialData.kode_toko || '' })
      } else {
        setForm({ nama_toko: '', kode_toko: '' })
      }
      setPhotoPreviewUrl(null)
      setFotoFile(null)
      setExistingFotoUrl(null)
      if (photoBlobUrlRef.current) {
        URL.revokeObjectURL(photoBlobUrlRef.current)
        photoBlobUrlRef.current = null
      }
    }
  }, [isOpen, initialData?.id])

  useEffect(() => {
    if (!isOpen || !isEdit || !initialData?.foto_path) {
      setExistingFotoUrl(null)
      return
    }
    let cancelled = false
    cashlessAPI.fetchFotoBlobUrl(initialData.foto_path).then((url) => {
      if (!cancelled) setExistingFotoUrl(url || null)
    }).catch(() => { if (!cancelled) setExistingFotoUrl(null) })
    return () => { cancelled = true }
  }, [isOpen, isEdit, initialData?.foto_path])

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [isOpen])

  const handlePhotoChange = async (e) => {
    const file = e.target?.files?.[0]
    if (!file) return
    const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']
    if (!allowed.includes(file.type)) {
      showNotification('Hanya file gambar (JPEG, PNG, WebP, GIF) yang diizinkan', 'error')
      return
    }
    let fileToUse = file
    if (file.size > MAX_FOTO_BYTES) {
      try {
        let maxMB = 1
        for (let i = 0; i < 5; i++) {
          fileToUse = await compressImage(fileToUse, maxMB, 1600, 1600)
          if (fileToUse.size <= MAX_FOTO_BYTES) break
          maxMB -= 0.2
          if (maxMB < 0.2) maxMB = 0.2
        }
      } catch (err) {
        showNotification('Gagal mengompresi gambar', 'error')
        return
      }
    }
    if (photoBlobUrlRef.current) {
      URL.revokeObjectURL(photoBlobUrlRef.current)
      photoBlobUrlRef.current = null
    }
    const blobUrl = URL.createObjectURL(fileToUse)
    photoBlobUrlRef.current = blobUrl
    setPhotoPreviewUrl(blobUrl)
    setFotoFile(fileToUse)
    if (photoInputRef.current) photoInputRef.current.value = ''
  }

  const clearPhoto = () => {
    setPhotoPreviewUrl(null)
    setFotoFile(null)
    if (photoBlobUrlRef.current) {
      URL.revokeObjectURL(photoBlobUrlRef.current)
      photoBlobUrlRef.current = null
    }
    if (photoInputRef.current) photoInputRef.current.value = ''
  }

  useEffect(() => {
    return () => {
      if (photoBlobUrlRef.current) {
        URL.revokeObjectURL(photoBlobUrlRef.current)
        photoBlobUrlRef.current = null
      }
    }
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    const nama_toko = (form.nama_toko || '').trim()
    if (!nama_toko) {
      showNotification('Nama toko wajib diisi', 'error')
      return
    }
    setSaving(true)
    try {
      if (isEdit) {
        const res = await cashlessAPI.updateToko(initialData.id, { nama_toko })
        if (!res.success) {
          showNotification(res.message || 'Gagal memperbarui toko', 'error')
          setSaving(false)
          return
        }
        if (fotoFile) {
          setUploadingPhoto(true)
          try {
            const uploadRes = await cashlessAPI.uploadFoto(fotoFile, initialData.id)
            if (!uploadRes?.success) {
              showNotification(uploadRes?.message || 'Toko berhasil diperbarui, foto gagal diunggah', 'warning')
            }
          } catch (_) {
            showNotification('Toko berhasil diperbarui, foto gagal diunggah', 'warning')
          } finally {
            setUploadingPhoto(false)
          }
        }
        showNotification('Toko berhasil diperbarui', 'success')
      } else {
        const res = await cashlessAPI.createToko({ nama_toko })
        if (!res.success) {
          showNotification(res.message || 'Gagal menambahkan toko', 'error')
          setSaving(false)
          return
        }
        const newId = res.data?.id
        if (fotoFile && newId) {
          setUploadingPhoto(true)
          try {
            const uploadRes = await cashlessAPI.uploadFoto(fotoFile, newId)
            if (!uploadRes?.success) {
              showNotification(uploadRes?.message || 'Toko berhasil ditambahkan, foto gagal diunggah', 'warning')
            }
          } catch (_) {
            showNotification('Toko berhasil ditambahkan, foto gagal diunggah', 'warning')
          } finally {
            setUploadingPhoto(false)
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
            <div className="border-b border-gray-200 dark:border-gray-700 pb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Foto Toko</label>
              <div className="flex flex-col sm:flex-row gap-3 items-start">
                <div className="w-full sm:w-40 h-32 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50 flex items-center justify-center overflow-hidden shrink-0">
                  {(photoPreviewUrl || existingFotoUrl) ? (
                    <img src={photoPreviewUrl || existingFotoUrl} alt="Preview foto toko" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-xs text-gray-500 dark:text-gray-400 text-center px-2">Opsional</span>
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
                  {photoPreviewUrl && (
                    <button
                      type="button"
                      onClick={clearPhoto}
                      disabled={uploadingPhoto}
                      className="px-3 py-2 rounded-lg border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm hover:bg-red-50 dark:hover:bg-red-900/20"
                    >
                      Hapus Foto
                    </button>
                  )}
                </div>
              </div>
            </div>

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
              disabled={saving || !form.nama_toko?.trim()}
              className="flex-1 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Menyimpan...' : 'Simpan'}
            </button>
          </div>
        </form>
      </motion.div>
    </AnimatePresence>,
    document.body
  )
}
