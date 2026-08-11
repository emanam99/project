import { compressImage } from './imageCompression'

export const KK_MAX_IMAGE_MB = 1
export const KK_MAX_PDF_MB = 5

const IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']
const IMAGE_EXT = ['jpg', 'jpeg', 'png', 'webp', 'gif']
const HEIC_EXT = ['heic', 'heif']
const HEIC_TYPES = ['image/heic', 'image/heif']

export function formatFileSize(bytes) {
  if (!bytes || bytes < 1) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

function getExtension(name) {
  return String(name || '')
    .split('.')
    .pop()
    ?.toLowerCase() || ''
}

export function isKkPdfFile(file) {
  if (!file) return false
  const ext = getExtension(file.name)
  return file.type === 'application/pdf' || ext === 'pdf'
}

export function isKkImageFile(file) {
  if (!file) return false
  const ext = getExtension(file.name)
  return IMAGE_TYPES.includes(file.type) || IMAGE_EXT.includes(ext)
}

/**
 * Siapkan file KK sebelum upload: gambar dikompres ≤1 MB, PDF maks. 5 MB.
 * @returns {Promise<{ file?: File, error?: string, previewUrl?: string | null }>}
 */
export function isHeicFile(file) {
  if (!file) return false
  const ext = getExtension(file.name)
  return HEIC_TYPES.includes(file.type) || HEIC_EXT.includes(ext)
}

export async function prepareKkFileForUpload(file) {
  if (!file) {
    return { error: 'Pilih file terlebih dahulu.' }
  }

  if (isHeicFile(file)) {
    return {
      error:
        'Format HEIC/HEIF (foto iPhone) belum didukung. Di pengaturan kamera pilih «Most Compatible», atau simpan ulang sebagai JPG lalu unggah.',
    }
  }

  const maxPdfBytes = KK_MAX_PDF_MB * 1024 * 1024
  const maxImageBytes = KK_MAX_IMAGE_MB * 1024 * 1024

  if (isKkPdfFile(file)) {
    if (file.size > maxPdfBytes) {
      return {
        error: `PDF terlalu besar (${formatFileSize(file.size)}). Maksimal ${KK_MAX_PDF_MB} MB.`,
      }
    }
    return { file, previewUrl: null }
  }

  if (isKkImageFile(file)) {
    let prepared = file
    const compressible =
      ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'].includes(file.type) ||
      ['jpg', 'jpeg', 'png', 'webp'].includes(getExtension(file.name))

    if (compressible && file.size > maxImageBytes) {
      try {
        prepared = await compressImage(file, KK_MAX_IMAGE_MB)
      } catch {
        return {
          error: 'Gagal mengompresi gambar. Coba foto lain atau kurangi resolusi.',
        }
      }
    }

    if (prepared.size > maxImageBytes) {
      return {
        error: `Gambar masih terlalu besar (${formatFileSize(prepared.size)}). Maksimal ${KK_MAX_IMAGE_MB} MB.`,
      }
    }

    const previewUrl = URL.createObjectURL(prepared)
    return { file: prepared, previewUrl }
  }

  return {
    error:
      'Format tidak didukung. Gunakan foto JPG atau PNG (disarankan), PDF hasil scan, atau ambil foto langsung dari kamera.',
  }
}
