import { useCallback, useEffect, useState } from 'react'
import { pendaftaranAPI } from '../../../services/api'
import {
  formatFileSize,
  isImageMime,
  isPdfMime,
  preparePreviewFromBlob,
} from '../../../utils/filePreviewMedia'

/**
 * Pratinjau KK pengajuan NIS + tombol unduh (penting untuk PDF yang tidak bisa di-embed).
 */
export default function NisPengajuanKkPreview({ pengajuanId, fileName, mimeType }) {
  const [media, setMedia] = useState(null)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    if (!pengajuanId) {
      setMedia(null)
      return undefined
    }
    let cancelled = false
    let objectUrl = null
    setLoading(true)
    setLoadError(false)

    pendaftaranAPI
      .fetchNisPengajuanKkBlob(pengajuanId)
      .then(async (blob) => {
        if (cancelled) return
        if (!blob || blob.size < 1) {
          setLoadError(true)
          setMedia(null)
          return
        }
        const displayName = fileName || 'kartu-keluarga'
        const { url, mime, blob: typedBlob } = await preparePreviewFromBlob(blob, mimeType, displayName)
        objectUrl = url
        setMedia({
          url: objectUrl,
          blob: typedBlob,
          mime,
          fileName: displayName,
          isPdf: isPdfMime(mime, displayName),
          isImage: isImageMime(mime, displayName),
          sizeLabel: formatFileSize(blob.size),
        })
      })
      .catch(() => {
        if (!cancelled) {
          setLoadError(true)
          setMedia(null)
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [pengajuanId, mimeType, fileName])

  const handleDownload = useCallback(() => {
    if (!media?.url) return
    const a = document.createElement('a')
    a.href = media.url
    a.download = media.fileName || 'kartu-keluarga'
    if (media.isPdf) a.target = '_blank'
    a.rel = 'noopener noreferrer'
    document.body.appendChild(a)
    a.click()
    a.remove()
  }, [media])

  if (!pengajuanId) return null

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-3">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <p className="text-xs font-medium text-gray-600 dark:text-gray-400">Kartu Keluarga</p>
          {media?.fileName ? (
            <p className="text-[11px] text-gray-500 dark:text-gray-500 truncate" title={media.fileName}>
              {media.fileName}
              {media.sizeLabel ? ` · ${media.sizeLabel}` : ''}
            </p>
          ) : null}
        </div>
        {media?.url ? (
          <button
            type="button"
            onClick={handleDownload}
            className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-teal-600 text-white hover:bg-teal-700 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
              />
            </svg>
            Unduh
          </button>
        ) : null}
      </div>

      {loading ? (
        <div className="h-40 flex items-center justify-center text-sm text-gray-500">Memuat berkas…</div>
      ) : null}

      {!loading && loadError ? (
        <p className="text-sm text-amber-700 dark:text-amber-300 py-4 text-center">
          Pratinjau tidak dapat dimuat. Coba unduh jika tombol tersedia.
        </p>
      ) : null}

      {!loading && media?.isImage ? (
        <a href={media.url} target="_blank" rel="noreferrer" className="block">
          <img
            src={media.url}
            alt="KK"
            className="w-full max-h-64 object-contain rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900"
          />
        </a>
      ) : null}

      {!loading && media?.isPdf ? (
        <div className="space-y-2">
          <iframe
            title="Pratinjau PDF KK"
            src={media.url}
            className="w-full h-72 rounded-lg border border-gray-200 dark:border-gray-600 bg-white"
          />
          <p className="text-[11px] text-gray-500 dark:text-gray-400 text-center">
            Jika pratinjau kosong, gunakan tombol Unduh di atas atau{' '}
            <a
              href={media.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-teal-600 dark:text-teal-400 hover:underline"
            >
              buka di tab baru
            </a>
            .
          </p>
        </div>
      ) : null}

      {!loading && media && !media.isImage && !media.isPdf ? (
        <div className="py-6 text-center space-y-2">
          <p className="text-sm text-gray-600 dark:text-gray-400">Pratinjau tidak tersedia untuk format ini.</p>
          <button
            type="button"
            onClick={handleDownload}
            className="text-sm font-medium text-teal-600 dark:text-teal-400 hover:underline"
          >
            Unduh file
          </button>
        </div>
      ) : null}
    </div>
  )
}
