/**
 * Filter pencarian lokal daftar madrasah (nama, identitas, kategori, ID, alamat).
 * @param {object} m
 * @param {string} query
 * @param {(row: object) => string} [formatAlamat]
 */
export function matchMadrasahLocalSearch(m, query, formatAlamat) {
  const q = String(query || '').trim().toLowerCase()
  if (!q) return true
  const nama = String(m?.nama || '').toLowerCase()
  const identitas = String(m?.identitas || '').trim().toLowerCase()
  const kat = String(m?.kategori || '').toLowerCase()
  const idStr = String(m?.id ?? '')
  const alamat = formatAlamat ? String(formatAlamat(m) || '').toLowerCase() : ''
  return (
    nama.includes(q) ||
    identitas.includes(q) ||
    kat.includes(q) ||
    idStr.includes(q) ||
    alamat.includes(q)
  )
}
