/** Judul singkat error scan QR buku tamu (selaras kode backend). */
export function bukuTamuScanErrorTitle(code) {
  switch (code) {
    case 'not_activated':
      return 'Kartu belum diaktivasi'
    case 'expired':
      return 'Kartu kadaluarsa'
    case 'invalid_format':
      return 'QR tidak valid'
    case 'wrong_card_type':
      return 'Bukan kartu mahrom'
    case 'not_registered':
      return 'QR tidak terdaftar'
    case 'empty':
      return 'QR kosong'
    case 'maintenance':
      return 'Pemeliharaan server'
    default:
      return 'Scan gagal'
  }
}
