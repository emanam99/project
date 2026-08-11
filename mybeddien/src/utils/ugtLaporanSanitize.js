import { sanitizeUserText } from './textSanitize'

/**
 * Sanitasi teks multiline (usulan, tugas, masalah) — pertahankan baris baru.
 * @param {unknown} value
 * @returns {string}
 */
export function sanitizeMultilineText(value) {
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
  s = s.replace(/\r\n?/g, '\n')
  const lines = s.split('\n').map((line) => line.replace(/[ \t]+/g, ' ').trim())
  s = lines.join('\n')
  s = s.replace(/\n{4,}/g, '\n\n\n').trim()

  return s
}

/**
 * @param {Array<{ masalah?: string, solusi?: string, saran?: string }>} items
 */
export function sanitizeUgtMasalahList(items) {
  if (!Array.isArray(items)) {
    return []
  }
  return items
    .map((x) => ({
      masalah: sanitizeMultilineText(x?.masalah),
      solusi: sanitizeMultilineText(x?.solusi),
      saran: sanitizeMultilineText(x?.saran),
    }))
    .filter((x) => x.masalah || x.solusi || x.saran)
}

const PJGT_RATING_KEYS = ['ubudiyah', 'murid', 'wali_murid', 'pjgt', 'kepala', 'guru', 'masyarakat']

/**
 * @param {Record<string, unknown>} payload
 * @param {'pjgt' | 'gt' | 'koordinator'} jenis
 */
export function sanitizeUgtLaporanPayload(payload, jenis) {
  if (!payload || typeof payload !== 'object') {
    return payload
  }
  const p = { ...payload }

  if (Array.isArray(p.masalah_list)) {
    p.masalah_list = sanitizeUgtMasalahList(p.masalah_list)
  }

  if (p.usulan != null) {
    const u = sanitizeMultilineText(p.usulan)
    p.usulan = u || null
  }

  if (jenis === 'gt') {
    for (const key of [
      'wali_kelas',
      'fan_kelas',
      'banin_banat',
      'muallim_quran',
      'waktu_muallim',
      'ngaji_kitab',
      'waktu_ngaji',
      'imam',
      'ket_imam',
    ]) {
      if (p[key] != null && typeof p[key] === 'string') {
        const t = sanitizeUserText(p[key])
        p[key] = t || null
      }
    }
    if (p.tugas_selanjutnya != null) {
      const t = sanitizeMultilineText(p.tugas_selanjutnya)
      p.tugas_selanjutnya = t || null
    }
  }

  if (jenis === 'pjgt') {
    for (const key of PJGT_RATING_KEYS) {
      if (p[key] != null && typeof p[key] === 'string') {
        const t = sanitizeUserText(p[key])
        p[key] = t || null
      }
    }
  }

  return p
}
