/** Pemisah internal value select pasangan tahun ajaran. */
export const TAHUN_AJARAN_PAIR_SEP = '\u001f'

export function encodeTahunAjaranPair(hijriyah, masehi) {
  const h = String(hijriyah ?? '').trim()
  const m = String(masehi ?? '').trim()
  if (!h && !m) return ''
  return `${h}${TAHUN_AJARAN_PAIR_SEP}${m}`
}

export function parseTahunAjaranPair(value) {
  const raw = String(value ?? '').trim()
  if (!raw) return { hijriyah: '', masehi: '' }
  const idx = raw.indexOf(TAHUN_AJARAN_PAIR_SEP)
  if (idx < 0) return { hijriyah: raw, masehi: '' }
  return {
    hijriyah: raw.slice(0, idx).trim(),
    masehi: raw.slice(idx + 1).trim()
  }
}

export function formatTahunAjaranPairLabel(hijriyah, masehi) {
  const h = String(hijriyah ?? '').trim()
  const m = String(masehi ?? '').trim()
  if (h && m) return `${h} / ${m}`
  return h || m || '–'
}

export function pairKey(hijriyah, masehi) {
  return encodeTahunAjaranPair(hijriyah, masehi)
}
