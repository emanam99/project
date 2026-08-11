/** Nomor WA admin pembayaran (085123123399 → 62…) */
export const WA_ADMIN_PEMBAYARAN = '6285123123399'

export const WA_OPENING_KETIDAKSESUAIAN_TAGIHAN_UWABA =
  'Laporkan ketidaksesuaian data tagihan UWABA.'

export const WA_MSG_INFO_KARTU_SANTRI = 'Info lebih lanjut tentang kartu santri.'

/**
 * URL wa.me ke admin dengan teks bebas.
 * @param {string} text
 * @returns {string}
 */
export function buildWaAdminUrl(text) {
  const msg = text != null && String(text).trim() !== '' ? String(text).trim() : ''
  return `https://wa.me/${WA_ADMIN_PEMBAYARAN}?text=${encodeURIComponent(msg)}`
}

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
      : WA_OPENING_KETIDAKSESUAIAN_TAGIHAN_UWABA
  const text = [
    opening,
    '',
    `Nama: ${str(biodata.nama)}`,
    `NIK: ${str(biodata.nik)}`,
    `NIS: ${str(biodata.nis)}`,
    `Formal: ${str(biodata.daftarFormal)}`,
    `Diniyah: ${str(biodata.daftarDiniyah)}`,
  ].join('\n')
  return buildWaAdminUrl(text)
}
