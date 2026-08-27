/** Hari dalam pekan, selaras Date.getDay() / PHP date('w'): 0=Minggu … 6=Sabtu. Urutan tampil Senin–Minggu. */
export const HARI_PEKAN_OPTIONS = [
  { value: 1, label: 'Senin' },
  { value: 2, label: 'Selasa' },
  { value: 3, label: 'Rabu' },
  { value: 4, label: 'Kamis' },
  { value: 5, label: 'Jumat' },
  { value: 6, label: 'Sabtu' },
  { value: 0, label: 'Minggu' }
]

const LABEL_BY_VALUE = Object.fromEntries(HARI_PEKAN_OPTIONS.map((o) => [o.value, o.label]))

function sortHariPekan(a, b) {
  const oa = a === 0 ? 7 : a
  const ob = b === 0 ? 7 : b
  return oa - ob
}

/**
 * @param {unknown} v - int, CSV "1,3,5", atau array
 * @returns {number[]}
 */
export function parseHariPekan(v) {
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
    if (Number.isInteger(n) && n >= 0 && n <= 6) set.add(n)
  }
  return [...set].sort(sortHariPekan)
}

/** @returns {string|null} CSV unik terurut, atau null jika kosong */
export function serializeHariPekan(v) {
  const ids = parseHariPekan(v)
  return ids.length ? ids.join(',') : null
}

export function labelHariPekan(v) {
  const ids = parseHariPekan(v)
  if (!ids.length) return null
  return ids.map((id) => LABEL_BY_VALUE[id] ?? String(id)).join(', ')
}

/** @param {number} gregMonth 1–12 */
export function weekdayFromGregorian(gregYear, gregMonth, gregDay) {
  const d = new Date(gregYear, gregMonth - 1, gregDay)
  return d.getDay()
}

export function matchesHariPekanItem(item, gregYear, gregMonth, gregDay) {
  const days = parseHariPekan(item?.hari_pekan)
  if (!days.length) return false
  return days.includes(weekdayFromGregorian(gregYear, gregMonth, gregDay))
}
