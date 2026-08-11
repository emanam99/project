/** Opsi tingkatan madrasah — tambah entri di sini untuk opsi UI baru (slug harus ada di backend MadrasahTingkatanHelper). */
export const TINGKATAN_OPTIONS = [
  { slug: 'tpq', label: 'TPQ' },
  { slug: 'ula', label: 'Ula' },
  { slug: 'wustha', label: 'Wustha' },
  { slug: 'ulya', label: 'Ulya' },
  { slug: 'ma_had_ali', label: "Ma'had Ali" },
  { slug: 'ibtidayiyah', label: "Ibtida'iyah" },
  { slug: 'tsanawiyah', label: 'Tsanawiyah' },
  { slug: 'aliyah', label: 'Aliyah' }
]

const LEGACY_BOOL_KEYS = ['tpq', 'ula', 'wustha', 'ulya', 'ma_had_ali']

/**
 * @param {Record<string, unknown>|null|undefined} m
 * @returns {string[]}
 */
export function tingkatanSlugsFromMadrasah(m) {
  if (!m) return []
  if (Array.isArray(m.tingkatan)) {
    return m.tingkatan.filter((s) => typeof s === 'string' && s)
  }
  if (typeof m.tingkatan === 'string' && m.tingkatan.trim()) {
    try {
      const parsed = JSON.parse(m.tingkatan)
      if (Array.isArray(parsed)) return parsed.filter((s) => typeof s === 'string')
    } catch {
      return m.tingkatan.split(',').map((s) => s.trim()).filter(Boolean)
    }
  }
  const legacy = []
  for (const key of LEGACY_BOOL_KEYS) {
    if (m[key] === 1 || m[key] === true) legacy.push(key)
  }
  return legacy
}

/**
 * @param {string[]} slugs
 */
export function tingkatanLabelsFromSlugs(slugs) {
  const map = Object.fromEntries(TINGKATAN_OPTIONS.map((o) => [o.slug, o.label]))
  return (slugs || []).map((s) => map[s] || s).join(', ')
}

/**
 * @param {string[]} selected
 * @param {string} slug
 * @param {boolean} checked
 */
export function toggleTingkatanSlug(selected, slug, checked) {
  const set = new Set(selected || [])
  if (checked) set.add(slug)
  else set.delete(slug)
  return TINGKATAN_OPTIONS.map((o) => o.slug).filter((s) => set.has(s))
}
