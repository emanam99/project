/**
 * Format tampilan data madrasah UGT (selaras eBeddien / API terbaru).
 * Baca-only — untuk profil PJGT dan field tambahan yang disembunyikan.
 */

export const KEGIATAN_WAKTU_SLOTS = [
  { flag: 'kegiatan_pagi', mulai: 'kegiatan_pagi_mulai', sampai: 'kegiatan_pagi_sampai', label: 'Pagi' },
  { flag: 'kegiatan_sore', mulai: 'kegiatan_sore_mulai', sampai: 'kegiatan_sore_sampai', label: 'Siang' },
  { flag: 'kegiatan_malam', mulai: 'kegiatan_malam_mulai', sampai: 'kegiatan_malam_sampai', label: 'Malam' },
]

export const TINGKATAN_OPTIONS = [
  { slug: 'tpq', label: 'TPQ' },
  { slug: 'ula', label: 'Ula' },
  { slug: 'wustha', label: 'Wustha' },
  { slug: 'ulya', label: 'Ulya' },
  { slug: 'ma_had_ali', label: "Ma'had Ali" },
  { slug: 'ibtidayiyah', label: "Ibtida'iyah" },
  { slug: 'tsanawiyah', label: 'Tsanawiyah' },
  { slug: 'aliyah', label: 'Aliyah' },
]

const LEGACY_TINGKATAN_BOOL = ['tpq', 'ula', 'wustha', 'ulya', 'ma_had_ali']

/** Kolom mentah yang tidak ditampilkan terpisah di profil (digabung ke field virtual). */
export const MADRASAH_HIDDEN_DETAIL_KEYS = new Set([
  'foto_path',
  'logo_path',
  'kegiatan_pagi',
  'kegiatan_sore',
  'kegiatan_malam',
  'kegiatan_mulai',
  'kegiatan_sampai',
  'kegiatan_pagi_mulai',
  'kegiatan_pagi_sampai',
  'kegiatan_sore_mulai',
  'kegiatan_sore_sampai',
  'kegiatan_malam_mulai',
  'kegiatan_malam_sampai',
  'tingkatan_label',
  'tpq',
  'ula',
  'wustha',
  'ulya',
  'ma_had_ali',
])

export function formatTimeDisplay(v) {
  if (v == null || v === '') return ''
  const s = String(v).trim()
  const m = s.match(/^(\d{1,2}):(\d{2})/)
  if (m) return `${m[1].padStart(2, '0')}:${m[2]}`
  return s.length >= 5 ? s.slice(0, 5) : s
}

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
  for (const key of LEGACY_TINGKATAN_BOOL) {
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
 * @param {Record<string, unknown>|null|undefined} m
 */
export function tingkatanDisplayText(m) {
  if (!m) return null
  if (typeof m.tingkatan_label === 'string' && m.tingkatan_label.trim()) {
    return m.tingkatan_label.trim()
  }
  const slugs = tingkatanSlugsFromMadrasah(m)
  if (!slugs.length) return null
  return tingkatanLabelsFromSlugs(slugs)
}

/**
 * @param {Record<string, unknown>|null|undefined} m
 * @returns {{ label: string, jam: string }[]}
 */
export function buildKegiatanBelajarLines(m) {
  if (!m) return []
  const legacyMulai = formatTimeDisplay(m.kegiatan_mulai)
  const legacySampai = formatTimeDisplay(m.kegiatan_sampai)
  const lines = []
  for (const slot of KEGIATAN_WAKTU_SLOTS) {
    const on = m[slot.flag] === 1 || m[slot.flag] === true
    if (!on) continue
    let mulai = formatTimeDisplay(m[slot.mulai])
    let sampai = formatTimeDisplay(m[slot.sampai])
    if (!mulai && legacyMulai) mulai = legacyMulai
    if (!sampai && legacySampai) sampai = legacySampai
    const jam =
      mulai && sampai ? `${mulai} – ${sampai}` : mulai || sampai || '—'
    lines.push({ label: slot.label, jam })
  }
  return lines
}
