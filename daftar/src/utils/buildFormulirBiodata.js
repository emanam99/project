/**
 * Gabung biodata santri + registrasi PSB untuk formulir print
 * (selaras PrintController::buildPendaftaranPrintSegment di eBeddien).
 */
export function buildFormulirBiodata(biodata, registrasi) {
  const b = { ...(biodata || {}) }
  if (!registrasi) return b

  const daftarDin = String(registrasi.daftar_diniyah ?? '').trim()
  const daftarFor = String(registrasi.daftar_formal ?? '').trim()
  if (daftarDin) b.diniyah = daftarDin
  if (daftarFor) {
    b.formal = daftarFor
    b.daftar_formal = daftarFor
  }

  const riwayatFields = [
    'sekolah',
    'nama_sekolah',
    'alamat_sekolah',
    'lulus_sekolah',
    'npsn',
    'nsm',
    'madrasah',
    'nama_madrasah',
    'alamat_madrasah',
    'lulus_madrasah'
  ]
  for (const field of riwayatFields) {
    const cur = b[field]
    const fromReg = registrasi[field]
    if ((!cur || String(cur).trim() === '') && fromReg != null && String(fromReg).trim() !== '') {
      b[field] = fromReg
    }
  }

  if (registrasi.status_santri && !b.status_santri) {
    b.status_santri = registrasi.status_santri
  }

  return b
}
