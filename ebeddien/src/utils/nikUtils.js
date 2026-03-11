/**
 * Utility functions untuk NIK (Nomor Induk Kependudukan)
 */

/**
 * Normalisasi input NIK: hanya digit, maksimal 16 karakter.
 * Untuk dipakai di field input (agar rapi dan konsisten).
 *
 * @param {string} value - Nilai dari input
 * @returns {string} Hanya digit, max 16 karakter
 */
export const normalizeNikInput = (value) => {
  if (value == null || typeof value !== 'string') return ''
  const digits = value.replace(/\D/g, '').slice(0, 16)
  return digits
}

/**
 * Cek apakah NIK valid: 16 digit dan menghasilkan tanggal lahir yang valid.
 * Dipakai untuk validasi ketat (cegah NIK acak). Tidak mengungkap detail kesalahan.
 *
 * @param {string} nik - Nomor NIK
 * @returns {boolean} true jika valid
 */
export const isNikValid = (nik) => {
  return extractTanggalLahirFromNIK(nik) !== null
}

/**
 * Extract tanggal lahir dari NIK
 * Format NIK: 16 digit
 * - Digit 7-8: tanggal lahir (01-31 untuk laki-laki, 41-71 untuk perempuan)
 * - Digit 9-10: bulan lahir (01-12)
 * - Digit 11-12: 2 digit terakhir tahun lahir
 * 
 * Untuk perempuan, tanggal ditambah 40. Jadi:
 * - Jika tanggal di NIK adalah 15, berarti laki-laki lahir tanggal 15
 * - Jika tanggal di NIK adalah 55, berarti perempuan lahir tanggal 15 (55 - 40 = 15)
 * 
 * Tahun: 
 * - Jika 2 digit terakhir < 40, berarti tahun 2000-an (20XX)
 * - Jika >= 40, berarti tahun 1900-an (19XX)
 * 
 * @param {string} nik - Nomor NIK (16 digit)
 * @returns {string|null} Tanggal lahir dalam format YYYY-MM-DD atau null jika NIK tidak valid
 */
export const extractTanggalLahirFromNIK = (nik) => {
  if (!nik || typeof nik !== 'string') {
    return null
  }

  // Hapus karakter non-digit
  const cleanNik = nik.replace(/\D/g, '')

  // Validasi panjang NIK harus 16 digit
  if (cleanNik.length !== 16) {
    return null
  }

  try {
    // Extract tanggal, bulan, dan tahun dari NIK
    const tanggalStr = cleanNik.substring(6, 8) // Digit 7-8 (0-indexed: 6-8)
    const bulanStr = cleanNik.substring(8, 10)   // Digit 9-10 (0-indexed: 8-10)
    const tahunStr = cleanNik.substring(10, 12)  // Digit 11-12 (0-indexed: 10-12)

    // Parse ke integer
    let tanggal = parseInt(tanggalStr, 10)
    const bulan = parseInt(bulanStr, 10)
    const tahun2Digit = parseInt(tahunStr, 10)

    // Validasi bulan (1-12)
    if (bulan < 1 || bulan > 12) {
      return null
    }

    // Tentukan jenis kelamin dan tanggal sebenarnya
    // Jika tanggal >= 41, berarti perempuan (tanggal asli = tanggal - 40)
    let isPerempuan = false
    if (tanggal >= 41 && tanggal <= 71) {
      isPerempuan = true
      tanggal = tanggal - 40
    }

    // Validasi tanggal (1-31)
    if (tanggal < 1 || tanggal > 31) {
      return null
    }

    // Tentukan tahun lengkap
    // Jika tahun 2 digit < 40, berarti tahun 2000-an
    // Jika >= 40, berarti tahun 1900-an
    let tahunLengkap
    if (tahun2Digit < 40) {
      tahunLengkap = 2000 + tahun2Digit
    } else {
      tahunLengkap = 1900 + tahun2Digit
    }

    // Validasi tanggal sesuai bulan (misal: 31 Februari tidak valid)
    const daysInMonth = new Date(tahunLengkap, bulan, 0).getDate()
    if (tanggal > daysInMonth) {
      return null
    }

    // Format tanggal ke YYYY-MM-DD
    const tanggalFormatted = String(tanggal).padStart(2, '0')
    const bulanFormatted = String(bulan).padStart(2, '0')
    const tanggalLahir = `${tahunLengkap}-${bulanFormatted}-${tanggalFormatted}`

    // Validasi final: pastikan tanggal valid
    const dateObj = new Date(tanggalLahir)
    if (dateObj.getFullYear() !== tahunLengkap || 
        dateObj.getMonth() + 1 !== bulan || 
        dateObj.getDate() !== tanggal) {
      return null
    }

    return tanggalLahir
  } catch (error) {
    console.error('Error extracting tanggal lahir from NIK:', error)
    return null
  }
}

/**
 * Extract jenis kelamin dari NIK
 * 
 * @param {string} nik - Nomor NIK (16 digit)
 * @returns {string|null} 'Laki-laki', 'Perempuan', atau null jika tidak valid
 */
export const extractGenderFromNIK = (nik) => {
  if (!nik || typeof nik !== 'string') {
    return null
  }

  const cleanNik = nik.replace(/\D/g, '')
  if (cleanNik.length !== 16) {
    return null
  }

  try {
    const tanggalStr = cleanNik.substring(6, 8)
    const tanggal = parseInt(tanggalStr, 10)

    // Jika tanggal >= 41, berarti perempuan
    if (tanggal >= 41 && tanggal <= 71) {
      return 'Perempuan'
    } else if (tanggal >= 1 && tanggal <= 31) {
      return 'Laki-laki'
    }

    return null
  } catch (error) {
    console.error('Error extracting gender from NIK:', error)
    return null
  }
}

