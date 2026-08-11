/** Slot kegiatan belajar madrasah — flag + jam mulai/sampai (selaras kolom DB). */
export const KEGIATAN_WAKTU_SLOTS = [
  {
    flag: 'kegiatan_pagi',
    mulai: 'kegiatan_pagi_mulai',
    sampai: 'kegiatan_pagi_sampai',
    label: 'Pagi'
  },
  {
    flag: 'kegiatan_sore',
    mulai: 'kegiatan_sore_mulai',
    sampai: 'kegiatan_sore_sampai',
    label: 'Siang'
  },
  {
    flag: 'kegiatan_malam',
    mulai: 'kegiatan_malam_mulai',
    sampai: 'kegiatan_malam_sampai',
    label: 'Malam'
  }
]

export function formatTimeForInput(v) {
  if (v == null || v === '') return ''
  const s = String(v).trim()
  const m = s.match(/^(\d{1,2}):(\d{2})/)
  if (!m) return s.length >= 5 ? s.slice(0, 5) : s
  return `${m[1].padStart(2, '0')}:${m[2]}`
}

export function kegiatanJamFieldsFromMadrasah(m) {
  if (!m) return {}
  const legacyMulai = formatTimeForInput(m.kegiatan_mulai)
  const legacySampai = formatTimeForInput(m.kegiatan_sampai)
  const out = {}
  for (const slot of KEGIATAN_WAKTU_SLOTS) {
    const flagOn = !!(m[slot.flag] === 1 || m[slot.flag] === true)
    let mulai = formatTimeForInput(m[slot.mulai])
    let sampai = formatTimeForInput(m[slot.sampai])
    if (flagOn && !mulai && legacyMulai) mulai = legacyMulai
    if (flagOn && !sampai && legacySampai) sampai = legacySampai
    out[slot.mulai] = mulai
    out[slot.sampai] = sampai
  }
  return out
}
