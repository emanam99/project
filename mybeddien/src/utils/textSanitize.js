/**
 * Sanitasi teks input pengguna (selaras TextSanitizer::cleanText di API).
 * Mencegah font/PUA aneh dan byte invalid sebelum dikirim ke server.
 */

/**
 * @param {unknown} value
 * @returns {string}
 */
export function sanitizeUserText(value) {
  if (value == null || value === '') {
    return ''
  }
  let s = String(value)
  try {
    s = s.normalize('NFC')
  } catch {
    /* ignore */
  }
  s = s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
  s = s.replace(/\uFFFD/g, '')
  s = s.replace(/[\uE000-\uF8FF]/g, '')
  s = s.replace(/\s+/g, ' ').trim()
  return s
}

/**
 * @param {unknown} value
 * @param {number} [minLen]
 * @returns {string|null} null jika tidak lolos validasi dasar
 */
export function sanitizePersonName(value, minLen = 2) {
  const cleaned = sanitizeUserText(value)
  if (cleaned.length < minLen) {
    return null
  }
  if (!/\p{L}/u.test(cleaned)) {
    return null
  }
  const q = (cleaned.match(/\?/g) || []).length
  if (q > 0 && q >= Math.max(2, Math.ceil(cleaned.length * 0.15))) {
    return null
  }
  const compact = cleaned.replace(/\s/g, '')
  if (compact && /^\?+$/u.test(compact)) {
    return null
  }
  return cleaned.length > 255 ? cleaned.slice(0, 255) : cleaned
}
