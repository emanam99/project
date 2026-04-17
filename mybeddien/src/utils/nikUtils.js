/**
 * Utility functions untuk NIK (Nomor Induk Kependudukan)
 */

export const normalizeNikInput = (value) => {
  if (value == null || typeof value !== 'string') return ''
  return value.replace(/\D/g, '').slice(0, 16)
}

export const isNikValid = (nik) => extractTanggalLahirFromNIK(nik) !== null

function extractTanggalLahirFromNIK(nik) {
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
