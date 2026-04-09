/** Nomor WA admin (tanpa +), sama dengan tombol Hubungi Admin di halaman Pembayaran */
export const WA_ADMIN_PEMBAYARAN = '6282232999921'

/** Baris pembuka pesan WA — kendala nominal (total wajib 0, dll.) */
export const WA_OPENING_KENDALA_NOMINAL = 'Mengalami kendala di nominal pembayaran.'

/** Baris pembuka pesan WA — bantuan umum pembayaran di offcanvas */
export const WA_OPENING_BANTUAN_PEMBAYARAN = 'Bantuan Pembayaran.'

/**
 * @param {{ nama?: string|null, nik?: string|null, nis?: string|null, daftarFormal?: string|null, daftarDiniyah?: string|null }} biodata
 * @param {{ openingLine?: string }} [options]
 * @returns {string} URL wa.me dengan ?text=...
 */
export function buildWaAdminPembayaranUrl(biodata = {}, options = {}) {
  const str = (v) => (v != null && String(v).trim() !== '' ? String(v).trim() : '-')
  const opening =
    options.openingLine != null && String(options.openingLine).trim() !== ''
      ? String(options.openingLine).trim()
      : WA_OPENING_KENDALA_NOMINAL
  const text = [
    opening,
    '',
    `Nama: ${str(biodata.nama)}`,
    `NIK: ${str(biodata.nik)}`,
    `NIS: ${str(biodata.nis)}`,
    `Formal: ${str(biodata.daftarFormal)}`,
    `Diniyah: ${str(biodata.daftarDiniyah)}`,
  ].join('\n')
  return `https://wa.me/${WA_ADMIN_PEMBAYARAN}?text=${encodeURIComponent(text)}`
}
