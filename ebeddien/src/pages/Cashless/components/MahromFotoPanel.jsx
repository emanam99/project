import { useState, useEffect, useRef, useCallback } from 'react'
import { mahromAPI } from '../../../services/api'
import { useNotification } from '../../../contexts/NotificationContext'
import { compressImage } from '../../../utils/imageCompression'

const MAX_FOTO_BYTES = 1024 * 1024

/**
 * Upload & preview foto mahrom (kartu CM & buku tamu).
 */
export default function MahromFotoPanel({ mahromId, fotoPath: initialFotoPath = null, onFotoChange }) {
  const { showNotification } = useNotification()
  const [fotoPath, setFotoPath] = useState(initialFotoPath)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [existingUrl, setExistingUrl] = useState(null)
  const [uploading, setUploading] = useState(false)
  const inputRef = useRef(null)
  const blobRef = useRef(null)

  useEffect(() => {
    setFotoPath(initialFotoPath)
  }, [initialFotoPath])

  useEffect(() => {
    if (!mahromId || !fotoPath) {
      setExistingUrl(null)
      return
    }
    let cancelled = false
    mahromAPI.fetchFotoBlobUrl(fotoPath).then((url) => {
      if (!cancelled) setExistingUrl(url || null)
    })
    return () => { cancelled = true }
  }, [mahromId, fotoPath])

  useEffect(() => {
    return () => {
      if (blobRef.current) {
        URL.revokeObjectURL(blobRef.current)
        blobRef.current = null
      }
    }
  }, [])

  const clearPreviewBlob = useCallback(() => {
    if (blobRef.current) {
      URL.revokeObjectURL(blobRef.current)
      blobRef.current = null
    }
    setPreviewUrl(null)
  }, [])

  const handleFile = async (file) => {
    if (!file || !mahromId) return
    if (!file.type.startsWith('image/')) {
      showNotification('Hanya file gambar yang diizinkan', 'error')
      return
    }
    let fileToUpload = file
    if (file.size > MAX_FOTO_BYTES) {
      try {
        fileToUpload = await compressImage(file, 1)
      } catch {
        showNotification('Gagal mengompresi gambar', 'error')
        return
      }
    }
    clearPreviewBlob()
    const blobUrl = URL.createObjectURL(fileToUpload)
    blobRef.current = blobUrl
    setPreviewUrl(blobUrl)
    setUploading(true)
    try {
      const res = await mahromAPI.uploadFoto(fileToUpload, mahromId)
      if (res?.success && res?.foto_path) {
        setFotoPath(res.foto_path)
        onFotoChange?.(res.foto_path)
        showNotification('Foto berhasil diunggah', 'success')
      } else {
        showNotification(res?.message || 'Gagal mengunggah foto', 'error')
        clearPreviewBlob()
      }
    } catch (err) {
      showNotification(err.response?.data?.message || 'Gagal mengunggah foto', 'error')
      clearPreviewBlob()
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  if (!mahromId) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 dark:border-gray-600 px-3 py-3 text-center">
        <p className="text-sm text-gray-600 dark:text-gray-300">
          Simpan mahrom terlebih dahulu untuk mengunggah foto.
        </p>
      </div>
    )
  }

  const displayUrl = previewUrl || existingUrl

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Foto mahrom</p>
      <p className="text-xs text-gray-500 dark:text-gray-400">
        Ditampilkan saat scan QR di buku tamu (bukan di kartu fisik). Maks. 1 MB.
      </p>
      <div className="flex items-start gap-4">
        <div className="w-24 h-28 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-100 dark:bg-gray-700 overflow-hidden flex-shrink-0">
          {displayUrl ? (
            <img src={displayUrl} alt="Foto mahrom" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs text-center px-2">
              Belum ada foto
            </div>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="px-3 py-2 text-sm rounded-lg bg-teal-600 hover:bg-teal-700 text-white disabled:opacity-50"
          >
            {uploading ? 'Mengunggah…' : displayUrl ? 'Ganti foto' : 'Unggah foto'}
          </button>
        </div>
      </div>
    </div>
  )
}
