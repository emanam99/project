/**
 * Nilai TIME dari API (mis. "08:30:00") → "08:30" untuk input type="time".
 */
export function apiTimeToTimeInput(v) {
  if (v == null || v === '') return ''
  const s = String(v)
  const m = s.match(/^(\d{1,2}):(\d{2})/)
  if (!m) return ''
  const h = String(Math.min(23, Math.max(0, parseInt(m[1], 10)))).padStart(2, '0')
  const min = String(Math.min(59, Math.max(0, parseInt(m[2], 10)))).padStart(2, '0')
  return `${h}:${min}`
}

/** @returns {'wib'|'istiwa'} */
export function normalizeJamJenis(v) {
  return v === 'istiwa' ? 'istiwa' : 'wib'
}

/** Label singkat untuk daftar / popup, mis. "08:00–10:00 WIB" */
export function formatJamRangeLabel(item) {
  if (!item) return ''
  const a = apiTimeToTimeInput(item.jam_mulai)
  const b = apiTimeToTimeInput(item.jam_selesai)
  if (!a && !b) return ''
  const range = a && b ? `${a}–${b}` : (a || b)
  const suffix = normalizeJamJenis(item.jam_jenis) === 'istiwa' ? ' Ist' : ' WIB'
  return `${range}${suffix}`
}
