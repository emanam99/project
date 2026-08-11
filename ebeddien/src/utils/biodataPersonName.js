/**
 * Ambil nama orang (ayah/ibu/wali) sebagai string scalar.
 * Hindari object/array yang di-backend bisa tersimpan sebagai "Array".
 */
export function biodataPersonName(value) {
  if (value == null) return ''
  if (typeof value === 'object') {
    const nested = value.nama ?? value.name ?? ''
    return nested == null ? '' : String(nested).trim()
  }
  const s = String(value).trim()
  if (!s || /^array$/i.test(s)) return ''
  return s
}
