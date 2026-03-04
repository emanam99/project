/**
 * Utility functions untuk NIK (Nomor Induk Kependudukan)
 */

/**
 * Extract tempat lahir dari NIK berdasarkan kode wilayah
 * Format NIK: Minimal 4 digit
 * - Digit 1-4: kode wilayah kabupaten/kota
 * 
 * @param {string} nik - Nomor NIK (minimal 4 digit)
 * @returns {string|null} Tempat lahir atau null jika tidak valid
 */
export const extractTempatLahirFromNIK = (nik) => {
  if (!nik || typeof nik !== 'string') {
    return null
  }

  // Hapus karakter non-digit
  const cleanNik = nik.replace(/\D/g, '')

  // Minimal 4 digit untuk kode wilayah
  if (cleanNik.length < 4) {
    return null
  }

  try {
    // Ambil 4 digit pertama (kode wilayah kabupaten/kota)
    const kodeWilayah = cleanNik.substring(0, 4)

    // Mapping kode wilayah ke nama tempat
    const wilayahMap = {
      '3511': 'Bondowoso',
      '3509': 'Jember'
    }

    return wilayahMap[kodeWilayah] || null
  } catch (error) {
    console.error('Error extracting tempat lahir from NIK:', error)
    return null
  }
}

/**
 * Extract tanggal lahir dari NIK
 * Format NIK: Minimal 12 digit
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
 * @param {string} nik - Nomor NIK (minimal 12 digit)
 * @returns {string|null} Tanggal lahir dalam format YYYY-MM-DD atau null jika NIK tidak valid
 */
export const extractTanggalLahirFromNIK = (nik) => {
  if (!nik || typeof nik !== 'string') {
    return null
  }

  // Hapus karakter non-digit
  const cleanNik = nik.replace(/\D/g, '')

  // Minimal 12 digit untuk extract tanggal lahir
  if (cleanNik.length < 12) {
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
 * Format NIK: Minimal 8 digit
 * - Digit 7-8: tanggal lahir (01-31 untuk laki-laki, 41-71 untuk perempuan)
 * 
 * @param {string} nik - Nomor NIK (minimal 8 digit)
 * @returns {string|null} 'Laki-laki', 'Perempuan', atau null jika tidak valid
 */
export const extractGenderFromNIK = (nik) => {
  if (!nik || typeof nik !== 'string') {
    return null
  }

  const cleanNik = nik.replace(/\D/g, '')
  
  // Minimal 8 digit untuk extract gender (butuh digit 7-8)
  if (cleanNik.length < 8) {
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
