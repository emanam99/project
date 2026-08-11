/** @typedef {{ mulai: string, telat: string }} JadwalSesi */
/** @typedef {{ pagi: JadwalSesi, sore: JadwalSesi, malam: JadwalSesi }} JadwalTigaSesi */

export const SESI_LIST = [
  { key: 'pagi', label: 'Pagi', mulaiField: 'jam_mulai_pagi', telatField: 'jam_telat_pagi' },
  { key: 'sore', label: 'Sore', mulaiField: 'jam_mulai_sore', telatField: 'jam_telat_sore' },
  { key: 'malam', label: 'Malam', mulaiField: 'jam_mulai_malam', telatField: 'jam_telat_malam' }
]

/** Konversi waktu MySQL / string → "HH:MM" untuk input type="time" */
export function mysqlTimeToInput(v) {
  if (v == null || v === '') return ''
  const s = String(v).trim()
  const m = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?/)
  if (!m) return ''
  const h = String(Math.min(23, Math.max(0, parseInt(m[1], 10)))).padStart(2, '0')
  const min = String(Math.min(59, Math.max(0, parseInt(m[2], 10)))).padStart(2, '0')
  return `${h}:${min}`
}

/** @returns {JadwalTigaSesi} */
export function fallbackJadwalDefault() {
  return {
    pagi: { mulai: '06:00', telat: '06:00' },
    sore: { mulai: '15:00', telat: '15:00' },
    malam: { mulai: '19:00', telat: '19:00' }
  }
}

/** @param {unknown} raw */
export function normalizeJadwalDefault(raw) {
  const fb = fallbackJadwalDefault()
  if (!raw || typeof raw !== 'object') return fb
  /** @type {Record<string, unknown>} */
  const o = raw
  /** @param {string} k */
  const sesi = (k) => {
    const sub = o[k]
    const d = fb[k]
    if (!sub || typeof sub !== 'object') return d
    const m = /** @type {Record<string, unknown>} */ (sub)
    const mulai = typeof m.mulai === 'string' && m.mulai.trim() ? m.mulai.trim() : d.mulai
    const mulaiN = mysqlTimeToInput(mulai) || mulai
    const rawTelat = typeof m.telat === 'string' && m.telat.trim() ? m.telat.trim() : ''
    const telatN = rawTelat ? mysqlTimeToInput(rawTelat) || rawTelat : mulaiN
    return { mulai: mulaiN, telat: telatN }
  }
  return {
    pagi: sesi('pagi'),
    sore: sesi('sore'),
    malam: sesi('malam')
  }
}

/** @param {unknown} raw */
export function normalizeSidikDefault(raw) {
  const base = { ikut_jadwal_default: true, toleransi_telat_menit: 0 }
  if (!raw || typeof raw !== 'object') return base
  const o = /** @type {Record<string, unknown>} */ (raw)
  return {
    ikut_jadwal_default: o.ikut_jadwal_default !== false,
    toleransi_telat_menit: Math.max(0, Math.min(240, Number(o.toleransi_telat_menit) || 0))
  }
}

/**
 * Jam mulai efektif untuk satu sesi (titik kosong → default).
 * @param {Record<string, unknown>} row
 * @param {{ mulaiField: string, key: string }} sesi
 * @param {JadwalTigaSesi} def
 */
export function effectiveJadwalSesi(row, sesi, def) {
  const mulaiRow = row[sesi.mulaiField]
  const telatRow = row[sesi.telatField]
  const d = def[sesi.key]
  const mulai =
    mulaiRow != null && String(mulaiRow).trim() !== ''
      ? mysqlTimeToInput(mulaiRow)
      : mysqlTimeToInput(d.mulai)
  const mulaiEf = mulai || '—'
  const telatDariJadwalDefault = mysqlTimeToInput(d.telat) || mulaiEf
  const telat =
    telatRow != null && String(telatRow).trim() !== ''
      ? mysqlTimeToInput(telatRow)
      : telatDariJadwalDefault
  return {
    mulai: mulaiEf,
    telat: telat || '—',
    mulaiDariDefault: mulaiRow == null || String(mulaiRow).trim() === '',
    telatDariDefault: telatRow == null || String(telatRow).trim() === ''
  }
}
