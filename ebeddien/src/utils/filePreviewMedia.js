/**
 * Util pratinjau berkas (gambar/PDF) — normalisasi MIME blob & deteksi tipe dari nama file.
 */

export function detectMime(blob, mimeHint, fileName) {
  const fromBlob =
    blob?.type && blob.type !== 'application/octet-stream' && !blob.type.includes('json')
      ? blob.type.split(';')[0].trim()
      : ''
  if (fromBlob) return fromBlob
  const hint =
    typeof mimeHint === 'string' && mimeHint && mimeHint !== 'application/octet-stream'
      ? mimeHint.split(';')[0].trim()
      : ''
  if (hint) return hint
  const ext = String(fileName || '')
    .split('.')
    .pop()
    ?.toLowerCase()
  if (ext === 'pdf') return 'application/pdf'
  if (['jpg', 'jpeg'].includes(ext)) return 'image/jpeg'
  if (ext === 'png') return 'image/png'
  if (ext === 'webp') return 'image/webp'
  if (ext === 'gif') return 'image/gif'
  return ''
}

export function isPdfMime(mime, fileName) {
  return mime === 'application/pdf' || /\.pdf$/i.test(String(fileName || ''))
}

export function formatFileSize(bytes) {
  if (!bytes || bytes < 1) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

export function isImageMime(mime, fileName) {
  if (typeof mime === 'string' && mime.startsWith('image/')) return true
  return /\.(jpe?g|png|gif|webp)$/i.test(String(fileName || ''))
}

/** Bungkus blob dengan MIME yang benar (tanpa object URL). */
export function ensureTypedBlob(blob, mimeHint, fileName) {
  if (!(blob instanceof Blob)) {
    return { blob: null, mime: '' }
  }
  const mime = detectMime(blob, mimeHint, fileName)
  const needsRetype =
    mime &&
    (!blob.type || blob.type === 'application/octet-stream' || blob.type !== mime)
  const typedBlob = needsRetype ? new Blob([blob], { type: mime }) : blob
  return { blob: typedBlob, mime: mime || typedBlob.type || '' }
}

/** Object URL untuk img/iframe — sinkron, tanpa cek respons JSON. */
export function createTypedObjectUrl(blob, mimeHint, fileName) {
  const { blob: typed, mime } = ensureTypedBlob(blob, mimeHint, fileName)
  if (!typed || typed.size < 1) return { url: null, mime: '', blob: null }
  return { url: URL.createObjectURL(typed), mime, blob: typed }
}

/**
 * Normalisasi blob unduhan API (termasuk respons error JSON yang ter-parse sebagai blob).
 * @returns {{ blob: Blob, mime: string, url: string }}
 */
export async function preparePreviewFromBlob(blob, mimeHint, fileName) {
  if (!(blob instanceof Blob)) {
    throw new Error('Berkas tidak valid')
  }

  if (blob.type.includes('json') || blob.type === 'application/json') {
    const text = await blob.text()
    let parsed = null
    try {
      parsed = JSON.parse(text)
    } catch {
      throw new Error('Gagal memuat berkas')
    }
    throw new Error(parsed?.message || 'Gagal memuat berkas')
  }

  const { blob: typedBlob, mime: resolvedMime } = ensureTypedBlob(blob, mimeHint, fileName)
  const url = URL.createObjectURL(typedBlob)
  return { blob: typedBlob, mime: resolvedMime, url }
}
