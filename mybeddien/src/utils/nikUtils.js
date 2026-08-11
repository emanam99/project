/**
 * Utility functions untuk NIK (Nomor Induk Kependudukan)
 */

export const normalizeNikInput = (value) => {
  if (value == null || typeof value !== 'string') return ''
  return value.replace(/\D/g, '').slice(0, 16)
}

export const isNikValid = (nik) => extractTanggalLahirFromNIK(nik) !== null

/** Extract tanggal lahir (YYYY-MM-DD) dari NIK 16 digit, atau null jika tidak valid. */
export function extractTanggalLahirFromNIK(nik) {
  if (!nik || typeof nik !== 'string') return null
  const cleanNik = nik.replace(/\D/g, '')
  if (cleanNik.length !== 16) return null
  try {
    let tanggal = parseInt(cleanNik.substring(6, 8), 10)
    const bulan = parseInt(cleanNik.substring(8, 10), 10)
    const tahun2Digit = parseInt(cleanNik.substring(10, 12), 10)
    if (bulan < 1 || bulan > 12) return null
    if (tanggal >= 41 && tanggal <= 71) tanggal = tanggal - 40
    if (tanggal < 1 || tanggal > 31) return null
    const tahunLengkap = tahun2Digit < 40 ? 2000 + tahun2Digit : 1900 + tahun2Digit
    const daysInMonth = new Date(tahunLengkap, bulan, 0).getDate()
    if (tanggal > daysInMonth) return null
    const tanggalFormatted = String(tanggal).padStart(2, '0')
    const bulanFormatted = String(bulan).padStart(2, '0')
    const tanggalLahir = `${tahunLengkap}-${bulanFormatted}-${tanggalFormatted}`
    const dateObj = new Date(tanggalLahir)
    if (dateObj.getFullYear() !== tahunLengkap || dateObj.getMonth() + 1 !== bulan || dateObj.getDate() !== tanggal) return null
    return tanggalLahir
  } catch {
    return null
  }
}

/** NIS santri: hanya digit, maksimal 7 karakter */
export const normalizeNisInput = (value) => {
  if (value == null || typeof value !== 'string') return ''
  return value.replace(/\D/g, '').slice(0, 7)
}

/** NIS 7 digit untuk tampilan (dari API check lupa-NIS atau id santri). */
export const formatNisDisplay = (nisValue, idSantri = null) => {
  if (nisValue != null && String(nisValue).trim() !== '') {
    const digits = String(nisValue).replace(/\D/g, '')
    if (digits !== '' && digits !== '0') {
      return digits.length >= 7 ? digits.slice(-7) : digits.padStart(7, '0')
    }
  }
  const id = Number(idSantri)
  if (!Number.isNaN(id) && id > 0) {
    return String(id).replace(/\D/g, '').padStart(7, '0')
  }
  return ''
}

/** Status pengajuan tertunda dari respons cek (belum cocok data pusat). */
export const parseNisPengajuanCheckPending = (res) => {
  if (!res || typeof res !== 'object' || res.matched) return null
  if (res.pending_review) {
    return {
      kind: 'review',
      message: String(res.message || '').trim(),
    }
  }
  if (res.pending_wa_verify && res.data && typeof res.data === 'object') {
    const id = Number(res.data.id) || 0
    if (id < 1) return null
    return {
      kind: 'wa_verify',
      id,
      nama: String(res.data.nama || '').trim(),
      nik: String(res.data.nik || '').replace(/\D/g, '').slice(0, 16),
      tanggal_lahir: String(res.data.tanggal_lahir || '').trim(),
      no_wa: String(res.data.no_wa || '').trim(),
      message: String(res.message || '').trim(),
    }
  }
  if (res.pending_kk_upload && res.data && typeof res.data === 'object') {
    const id = Number(res.data.id) || 0
    if (id < 1) return null
    return {
      kind: 'kk_upload',
      id,
      nama: String(res.data.nama || '').trim(),
      nik: String(res.data.nik || '').replace(/\D/g, '').slice(0, 16),
      tanggal_lahir: String(res.data.tanggal_lahir || '').trim(),
      no_wa: String(res.data.no_wa || '').trim(),
      message: String(res.message || '').trim(),
    }
  }
  return null
}

/** Ambil hasil cek lupa-NIS dari respons API (root atau nested di data). */
export const parseNisPengajuanCheckResponse = (res) => {
  if (!res || typeof res !== 'object') return null
  const nested = res.data && typeof res.data === 'object' ? res.data : {}
  const matched = !!(res.matched ?? nested.matched)
  if (!matched) return null

  const idSantri = nested.id_santri ?? res.id_santri ?? nested.santri_id ?? res.santri_id ?? null
  const rawNis =
    nested.nis_display ??
    res.nis_display ??
    nested.nis ??
    res.nis ??
    nested.nis_santri ??
    res.nis_santri

  const nis = formatNisDisplay(rawNis, idSantri)
  const nama = String(nested.nama ?? res.nama ?? '').trim()
  const alreadyRegistered = !!(nested.already_registered ?? res.already_registered)

  return {
    nis,
    nama,
    already_registered: alreadyRegistered,
    id_santri: idSantri,
    message: String(res.message ?? nested.message ?? '').trim(),
  }
}
