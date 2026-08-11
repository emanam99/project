import { useState, useEffect, useRef, useCallback } from 'react'
import { madrasahAPI, ugtLaporanKoordinatorAPI } from '../../../services/api'
import { compressImage } from '../../../utils/imageCompression'
import { MAX_KOORDINATOR_FOTOS, parseKoordinatorFotoList } from '../../../utils/ugtKoordinatorFotos'

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

/**
 * Galeri foto laporan koordinator (maks. 5), unggah + hapus per item.
 * onChange(paths) dipanggil setiap daftar path server berubah.
 */
export default function LaporanKoordinatorFotoGallery({ isOpen, initialData, onChange, onNotify }) {
  const photoInputRef = useRef(null)
  const blobUrlsRef = useRef(new Set())
  const [items, setItems] = useState([])
  const [uploading, setUploading] = useState(false)

  const trackBlob = useCallback((url) => {
    if (url && String(url).startsWith('blob:')) blobUrlsRef.current.add(url)
  }, [])

  const revokeBlob = useCallback((url) => {
    if (url && String(url).startsWith('blob:')) {
      URL.revokeObjectURL(url)
      blobUrlsRef.current.delete(url)
    }
  }, [])

  const revokeAllBlobs = useCallback(() => {
    blobUrlsRef.current.forEach((url) => URL.revokeObjectURL(url))
    blobUrlsRef.current.clear()
  }, [])

  const emitPaths = useCallback(
    (nextItems) => {
      onChange?.(nextItems.map((x) => x.path).filter(Boolean))
    },
    [onChange]
  )

  useEffect(() => {
    if (!isOpen) {
      revokeAllBlobs()
      setItems([])
      setUploading(false)
      return
    }

    let cancelled = false
    const paths = parseKoordinatorFotoList(initialData)

    if (paths.length === 0) {
      setItems([])
      emitPaths([])
      return
    }

    void (async () => {
      const loaded = await Promise.all(
        paths.map(async (path) => {
          const url = await madrasahAPI.fetchFotoBlobUrl(path).catch(() => null)
          return { path, previewUrl: url || '' }
        })
      )
      if (cancelled) {
        loaded.forEach((x) => revokeBlob(x.previewUrl))
        return
      }
      loaded.forEach((x) => trackBlob(x.previewUrl))
      setItems(loaded)
      emitPaths(loaded)
    })()

    return () => {
      cancelled = true
    }
  }, [isOpen, initialData?.id, initialData?.foto, initialData?.foto_list])

  useEffect(() => {
    return () => revokeAllBlobs()
  }, [revokeAllBlobs])

  const removeAt = (index) => {
    setItems((prev) => {
      const next = [...prev]
      const removed = next.splice(index, 1)[0]
      if (removed?.previewUrl) revokeBlob(removed.previewUrl)
      emitPaths(next)
      return next
    })
  }

  const handlePhotoChange = async (e) => {
    const file = e.target?.files?.[0]
    if (!file) return
    if (items.length >= MAX_KOORDINATOR_FOTOS) {
      onNotify?.(`Maksimal ${MAX_KOORDINATOR_FOTOS} foto per laporan.`, 'warning')
      return
    }
    if (!isAllowedFotoFile(file)) {
      onNotify?.('Hanya gambar (JPEG, PNG, WebP, GIF). Periksa ekstensi file.', 'error')
      return
    }
    if (file.size > MAX_FOTO_RAW_BYTES) {
      onNotify?.(`Ukuran foto mentah maks. ${MAX_FOTO_RAW_BYTES / (1024 * 1024)} MB.`, 'error')
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
        onNotify?.('Gagal mengompresi gambar: ' + (err?.message || ''), 'error')
        return
      }
    }

    const blobUrl = URL.createObjectURL(fileToUpload)
    trackBlob(blobUrl)
    setUploading(true)
    try {
      const res = await ugtLaporanKoordinatorAPI.uploadFoto(fileToUpload)
      if (res?.success && res?.foto_path) {
        setItems((prev) => {
          const next = [...prev, { path: res.foto_path, previewUrl: blobUrl }]
          emitPaths(next)
          return next
        })
      } else {
        revokeBlob(blobUrl)
        onNotify?.(res?.message || 'Gagal mengunggah foto', 'error')
      }
    } catch (err) {
      revokeBlob(blobUrl)
      onNotify?.(err?.response?.data?.message || err?.message || 'Gagal mengunggah foto', 'error')
    } finally {
      setUploading(false)
      if (photoInputRef.current) photoInputRef.current.value = ''
    }
  }

  const canAdd = items.length < MAX_KOORDINATOR_FOTOS && !uploading

  return (
    <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
      <div className="flex items-center justify-between gap-2 mb-2">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
          Foto laporan ({items.length}/{MAX_KOORDINATOR_FOTOS})
        </label>
        <input
          ref={photoInputRef}
          type="file"
          accept="image/jpeg,image/jpg,image/png,image/webp,image/gif"
          onChange={handlePhotoChange}
          disabled={!canAdd}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => photoInputRef.current?.click()}
          disabled={!canAdd}
          className="text-sm text-teal-600 dark:text-teal-400 font-medium hover:underline disabled:opacity-50 disabled:no-underline"
        >
          {uploading ? 'Mengunggah...' : '+ Tambah foto'}
        </button>
      </div>

      {items.length === 0 ? (
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
          Opsional. JPEG/PNG/WebP/GIF, maks. 1 MB per foto setelah kompresi (mentah maks. 10 MB).
        </p>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
          {items.map((item, idx) => (
            <div
              key={item.path || `preview-${idx}`}
              className="relative aspect-square rounded-lg border border-gray-200 dark:border-gray-600 overflow-hidden bg-gray-50 dark:bg-gray-900/40"
            >
              {item.previewUrl ? (
                <img src={item.previewUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full animate-pulse bg-gray-200 dark:bg-gray-700" />
              )}
              <button
                type="button"
                onClick={() => removeAt(idx)}
                disabled={uploading}
                className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white text-xs flex items-center justify-center hover:bg-red-600 disabled:opacity-50"
                aria-label="Hapus foto"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
