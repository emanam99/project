/**
 * Nilai aman untuk input tanggal HTML5 (type date): kosongkan placeholder MySQL dan tanggal tidak valid.
 * @param {unknown} v
 * @returns {string} '' atau 'yyyy-MM-dd'
 */
export function toHtmlDateInputValue(v) {
  if (v == null || v === '') return ''
  const s = String(v).trim().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return ''
  if (s.startsWith('0000-') || s.slice(5, 7) === '00' || s.slice(8, 10) === '00') return ''
  const y = Number(s.slice(0, 4))
  const m = Number(s.slice(5, 7))
  const d = Number(s.slice(8, 10))
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return ''
  if (y < 1000 || m < 1 || m > 12 || d < 1 || d > 31) return ''
  return s
}
