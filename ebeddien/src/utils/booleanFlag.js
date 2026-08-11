/** Nilai truthy umum: checkbox Bisyaroh, flag pengurus (mengajar), rumus true/false. */
const TRUTHY = new Set(['1', 'true', 'ya', 'yes', 'on', 'y', 'iya'])
const FALSY = new Set(['0', 'false', 'tidak', 'no', 'off', 'n'])

/** @returns {boolean} */
export function isBooleanTruthy(value) {
  if (value === true || value === 1) return true
  if (value === false || value === 0) return false
  if (value === null || value === undefined) return false
  const s = String(value).trim().toLowerCase()
  if (s === '') return false
  if (FALSY.has(s)) return false
  if (TRUTHY.has(s)) return true
  const n = Number(s)
  if (Number.isFinite(n)) return n !== 0
  return false
}

/** @returns {'1'|'0'} */
export function booleanToStoredFlag(value) {
  return isBooleanTruthy(value) ? '1' : '0'
}

/** @returns {string} */
export function formatBooleanLabel(value) {
  return isBooleanTruthy(value) ? 'Ya' : 'Tidak'
}
