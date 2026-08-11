import { useState, useEffect, useRef, useCallback } from 'react'
import { pendaftaranAPI } from '../../../services/api'
import { useNotification } from '../../../contexts/NotificationContext'
import { createTypedObjectUrl } from '../../../utils/filePreviewMedia'
import CetakKartuSantriFotoCropModal from './CetakKartuSantriFotoCropModal'
import PortraitPhotoCamera from '../../../components/CameraScanner/PortraitPhotoCamera'

const JENIS_FOTO = 'foto_cashless'

function formatFotoDate(raw) {
  if (!raw) return '—'
  try {
    const d = new Date(String(raw).replace(' ', 'T'))
    return d.toLocaleString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return raw
  }
}

export default function CetakKartuSantriFotoPanel({ santriId, overlayZIndex = 210 }) {
  const { showNotification } = useNotification()
  const [fotos, setFotos] = useState([])
  const [previewUrls, setPreviewUrls] = useState({})
  const [activeId, setActiveId] = useState(null)
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [cropFile, setCropFile] = useState(null)
  const [showCamera, setShowCamera] = useState(false)
  const inputRef = useRef(null)
  const objectUrlsRef = useRef([])

  const revokeAllUrls = useCallback(() => {
    objectUrlsRef.current.forEach((url) => {
      if (url?.startsWith('blob:')) URL.revokeObjectURL(url)
    })
    objectUrlsRef.current = []
    setPreviewUrls({})
  }, [])

  const loadFotos = useCallback(async () => {
    if (!santriId) {
      setFotos([])
      setActiveId(null)
      revokeAllUrls()
      return
    }
    setLoading(true)
    try {
      const res = await pendaftaranAPI.getBerkasList(santriId, JENIS_FOTO)
      const list = res?.success && Array.isArray(res.data)
        ? [...res.data].filter((b) => !b.status_tidak_ada).sort((a, b) => Number(b.id) - Number(a.id))
        : []
      setFotos(list)
      setActiveId(list[0]?.id ?? null)

      revokeAllUrls()
      const nextUrls = {}
      await Promise.all(
        list.map(async (foto) => {
          try {
            const blob = await pendaftaranAPI.downloadBerkas(foto.id)
            const { url } = createTypedObjectUrl(blob, foto.tipe_file, foto.nama_file)
            objectUrlsRef.current.push(url)
            nextUrls[foto.id] = url
          } catch {
            /* abaikan thumbnail gagal */
          }
        })
      )
      setPreviewUrls(nextUrls)
    } catch {
      setFotos([])
      setActiveId(null)
      revokeAllUrls()
    } finally {
      setLoading(false)
    }
  }, [santriId, revokeAllUrls])

  useEffect(() => {
    loadFotos()
    return () => revokeAllUrls()
  }, [loadFotos, revokeAllUrls])

  const handleFileSelect = (file) => {
    if (!file || !santriId) return
    if (!file.type.startsWith('image/')) {
      showNotification('Hanya file gambar yang diizinkan', 'error')
      return
    }
    setCropFile(file)
    if (inputRef.current) inputRef.current.value = ''
  }

  const uploadCroppedBlob = async (blob) => {
    if (!blob || !santriId) return
    setUploading(true)
    try {
      const fileToUpload = new File([blob], `foto_cashless_${Date.now()}.jpg`, {
        type: blob.type || 'image/jpeg',
      })
      const res = await pendaftaranAPI.uploadBerkas(
        santriId,
        JENIS_FOTO,
        fileToUpload,
        'Foto kartu cashless'
      )
      if (res?.success) {
        showNotification('Foto berhasil diunggah', 'success')
        await loadFotos()
      } else {
        showNotification(res?.message || 'Gagal mengunggah foto', 'error')
      }
    } catch (err) {
      showNotification(err.response?.data?.message || 'Gagal mengunggah foto', 'error')
    } finally {
      setUploading(false)
    }
  }

  if (!santriId) return null

  const activePreview = activeId ? previewUrls[activeId] : null

  return (
    <div className="space-y-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Foto santri</p>
      <p className="text-[10px] text-gray-500 dark:text-gray-400 leading-snug">
        Pas foto 3×4. Bisa ambil langsung dari kamera (kotak 3×4) atau unggah galeri, lalu atur crop.
      </p>

      <div className="mx-auto h-44 w-auto aspect-[3/4] max-w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-100 dark:bg-gray-700 overflow-hidden">
        {loading ? (
          <div className="w-full h-full flex items-center justify-center text-xs text-gray-400">Memuat…</div>
        ) : activePreview ? (
          <img src={activePreview} alt="Foto santri" className="w-full h-full object-cover object-center" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-xs text-gray-400 text-center px-3">
            Belum ada foto
          </div>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={(e) => handleFileSelect(e.target.files?.[0])}
      />
      <div className="grid grid-cols-2 gap-1.5">
        <button
          type="button"
          onClick={() => setShowCamera(true)}
          disabled={uploading || !!cropFile}
          className="px-2 py-1.5 text-xs rounded-lg bg-teal-600 hover:bg-teal-700 text-white disabled:opacity-50"
        >
          Kamera
        </button>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading || !!cropFile}
          className="px-2 py-1.5 text-xs rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/50 disabled:opacity-50"
        >
          {uploading ? 'Mengunggah…' : 'Galeri'}
        </button>
      </div>

      {showCamera && (
        <PortraitPhotoCamera
          title="Pas foto 3×4"
          onClose={() => setShowCamera(false)}
          onCapture={(file) => {
            setShowCamera(false)
            handleFileSelect(file)
          }}
        />
      )}

      {cropFile && (
        <CetakKartuSantriFotoCropModal
          file={cropFile}
          zBase={overlayZIndex + 50}
          onConfirm={(blob) => {
            setCropFile(null)
            uploadCroppedBlob(blob)
          }}
          onCancel={() => setCropFile(null)}
        />
      )}

      {fotos.length > 1 && (
        <div className="space-y-1">
          <p className="text-[10px] text-gray-500">Riwayat ({fotos.length})</p>
          <ul className="max-h-24 overflow-y-auto space-y-1">
            {fotos.map((foto) => (
              <li key={foto.id}>
                <button
                  type="button"
                  onClick={() => setActiveId(foto.id)}
                  className={`w-full text-left px-2 py-1 rounded text-[10px] truncate ${
                    activeId === foto.id
                      ? 'bg-teal-50 dark:bg-teal-900/30 text-teal-800 dark:text-teal-200'
                      : 'hover:bg-gray-50 dark:hover:bg-gray-700/50 text-gray-600 dark:text-gray-400'
                  }`}
                >
                  {formatFotoDate(foto.tanggal_dibuat)}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
