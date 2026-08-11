/**
 * Selaras arah WebsiteHelper::slugify (PHP): huruf/angka, sisanya jadi "-", maks 200.
 */
export function slugifyJudul(raw) {
  if (!raw || typeof raw !== 'string') return ''
  try {
    return raw
      .toLowerCase()
      .trim()
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 200)
  } catch {
    return raw
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/gi, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 200)
  }
}
