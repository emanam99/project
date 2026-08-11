export const PESANTREN_NAMA = 'Pesantren Salafiyah Al-Utsmani'
export const PESANTREN_ALAMAT = 'Beddian, Jambesari, Jambesari DS, Bodowoso 68263'

/** Baris alamat kop Desain 3 (mockup kartu) */
export const PESANTREN_KOP_LINES = [
  'PESANTREN SALAFIYAH AL - UTSMANI',
  'BEDDIAN JAMBESARI',
  'JAMBESARI DARUS SHOLAH',
  'BONDOWOSO',
]

export const MAHROM_CARD_DESIGN_STORAGE_KEY = 'cashless_mahrom_card_design'

export const MAHROM_CARD_DESIGNS = [
  { id: 'classic', label: 'Desain 1', hint: 'Kartu bank · header lengkap' },
  { id: 'premium', label: 'Desain 2', hint: 'Premium kompak · aksen emas' },
  { id: 'bg', label: 'Desain 3', hint: 'BG mahrom-depan / belakang' },
]

export function readMahromCardDesign() {
  try {
    const v = localStorage.getItem(MAHROM_CARD_DESIGN_STORAGE_KEY)
    if (v && MAHROM_CARD_DESIGNS.some((d) => d.id === v)) return v
  } catch {
    /* ignore */
  }
  return 'classic'
}

export function writeMahromCardDesign(designId) {
  try {
    localStorage.setItem(MAHROM_CARD_DESIGN_STORAGE_KEY, designId)
  } catch {
    /* ignore */
  }
}

function pickAddr(card, key) {
  const mahromKey = `mahrom_${key}`
  const v = card?.[mahromKey] ?? card?.[key]
  if (v == null) return ''
  return String(v).trim()
}

/** Format: Dusun RT 000 RW 000, Desa, Kec, Kab */
export function formatWaliAlamat(card) {
  if (!card) return ''
  const dusun = pickAddr(card, 'dusun')
  const rt = pickAddr(card, 'rt')
  const rw = pickAddr(card, 'rw')
  const desa = pickAddr(card, 'desa')
  const kec = pickAddr(card, 'kecamatan')
  const kab = pickAddr(card, 'kabupaten')

  const head = []
  if (dusun) head.push(dusun)
  if (rt) head.push(`RT ${rt}`)
  if (rw) head.push(`RW ${rw}`)

  const parts = []
  if (head.length) parts.push(head.join(' '))
  if (desa) parts.push(desa)
  if (kec) parts.push(kec)
  if (kab) parts.push(kab)
  return parts.join(', ')
}

/**
 * Baris alamat untuk Desain 3 (mockup): Desa / Kecamatan / Kabupaten.
 * @returns {string[]}
 */
export function formatWaliAlamatLines(card) {
  if (!card) return []
  const rows = [
    { key: 'desa', prefix: 'Desa' },
    { key: 'kecamatan', prefix: 'Kecamatan' },
    { key: 'kabupaten', prefix: 'Kabupaten' },
  ]
  const lines = []
  for (const { key, prefix } of rows) {
    const raw = pickAddr(card, key)
    if (!raw) continue
    const lower = raw.toLowerCase()
    if (lower.startsWith(prefix.toLowerCase())) {
      lines.push(raw)
    } else {
      lines.push(`${prefix} ${raw}`)
    }
  }
  return lines
}

export function mergeMahromAddressFields(target, source) {
  if (!source) return target
  const keys = ['dusun', 'rt', 'rw', 'desa', 'kecamatan', 'kabupaten', 'provinsi', 'kode_pos']
  const out = { ...target }
  keys.forEach((k) => {
    const mk = `mahrom_${k}`
    const val = source[mk] ?? source[k]
    if (val != null && String(val).trim() !== '') {
      out[mk] = String(val).trim()
    }
  })
  return out
}
