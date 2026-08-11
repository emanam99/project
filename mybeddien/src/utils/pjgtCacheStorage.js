const LS_KEY = 'mybeddien_pjgt_cache_v1'

/** @typedef {{ data: unknown, savedAt: number, [key: string]: unknown }} PjgtCacheSlice */

/**
 * @param {number} madrasahId
 * @returns {Record<string, unknown> | null}
 */
export function readPjgtCache(madrasahId) {
  if (!madrasahId || typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return null
    const o = JSON.parse(raw)
    if (!o || Number(o.madrasahId) !== Number(madrasahId)) return null
    return o
  } catch {
    return null
  }
}

/**
 * @param {number} madrasahId
 * @param {(prev: Record<string, unknown> | null) => Record<string, unknown>} updater
 */
export function writePjgtCache(madrasahId, updater) {
  if (!madrasahId || typeof window === 'undefined') return
  try {
    const prev = readPjgtCache(madrasahId) || { madrasahId: Number(madrasahId) }
    const next = updater({ ...prev, madrasahId: Number(madrasahId) })
    localStorage.setItem(LS_KEY, JSON.stringify(next))
  } catch {
    /* quota / private mode */
  }
}

export function clearPjgtCache() {
  try {
    if (typeof window !== 'undefined') localStorage.removeItem(LS_KEY)
  } catch {
    /* ignore */
  }
}

/** @param {unknown[]} rows */
export function maxTanggalDibuat(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return ''
  let max = ''
  for (const r of rows) {
    const t = r?.tanggal_dibuat != null ? String(r.tanggal_dibuat) : ''
    if (t > max) max = t
  }
  return max
}

/** @param {unknown[]} rows */
export function gtRiwayatFingerprint(rows) {
  if (!Array.isArray(rows)) return ''
  return rows
    .map((r) => `${r?.id ?? ''}:${r?.is_aktif ?? ''}:${r?.tanggal_dibuat ?? ''}`)
    .join('|')
}
