/** Tanggal 1–31 untuk tipe per bulan (bisa lebih dari satu, CSV). */

export const TANGGAL_BULAN_OPTIONS = Array.from({ length: 31 }, (_, i) => {
  const n = i + 1
  return { value: n, label: String(n) }
})

/**
 * @param {unknown} v - int, CSV "1,15,31", atau array
 * @returns {number[]}
 */
export function parseTanggalBulan(v) {
  if (v == null || v === '') return []
  let raw = []
  if (Array.isArray(v)) {
    raw = v
  } else if (typeof v === 'number' && Number.isFinite(v)) {
    raw = [v]
  } else {
    const s = String(v).trim()
    if (!s) return []
    raw = s.split(/[,;\s]+/)
  }
  const set = new Set()
  for (const x of raw) {
    const n = Number(x)
    if (Number.isInteger(n) && n >= 1 && n <= 31) set.add(n)
  }
  return [...set].sort((a, b) => a - b)
}

/** @returns {string|null} */
export function serializeTanggalBulan(v) {
  const ids = parseTanggalBulan(v)
  return ids.length ? ids.join(',') : null
}

export function labelTanggalBulan(v) {
  const ids = parseTanggalBulan(v)
  if (!ids.length) return null
  return ids.join(', ')
}

export function matchesTanggalBulanItem(item, day) {
  const days = parseTanggalBulan(item?.tanggal)
  if (!days.length) return false
  return days.includes(Number(day))
}
