/**
 * Cache biodata penuh + meta sinkron (id santri/registrasi, NIS, tanggal_update server).
 * Dipakai untuk tampil instan saat kembali ke tab Biodata dan bandingkan dengan API di latar belakang.
 */

export const BIODATA_FULL_CACHE_PREFIX = 'daftar_biodata_full_v2:'

/** @param {string} nik */
/** @param {string|null|undefined} idSantriPk */
export function getBiodataFullCacheKey(nik, idSantriPk) {
  const n = String(nik || '').trim() || 'anon'
  const id = idSantriPk != null && String(idSantriPk).trim() !== '' ? String(idSantriPk).trim() : 'new'
  return `${BIODATA_FULL_CACHE_PREFIX}${n}:${id}`
}

/**
 * @param {unknown} v
 * @returns {number} epoch ms; 0 jika tidak bisa di-parse
 */
export function parseServerTimestamp(v) {
  if (v == null || v === '') return 0
  const s = String(v).trim()
  if (!s) return 0
  const t = Date.parse(s.replace(' ', 'T'))
  return Number.isNaN(t) ? 0 : t
}

/**
 * @returns {{ v: number, form: object, meta: object }|null}
 */
export function readBiodataFullCache(storageKey) {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(storageKey)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || parsed.v !== 2 || typeof parsed.form !== 'object' || typeof parsed.meta !== 'object') {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

export function writeBiodataFullCache(storageKey, form, meta) {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(
      storageKey,
      JSON.stringify({
        v: 2,
        form,
        meta,
        client_saved_at: new Date().toISOString(),
      })
    )
  } catch {
    /* quota */
  }
}

/**
 * Cache cocok untuk user saat ini (hindari tampil data NIK/id lain).
 */
export function biodataCacheMatchesUser(meta, user, sessionNik) {
  if (!meta || typeof meta !== 'object') return false
  const nikUser = String(user?.nik || '').trim()
  const nikMeta = String(meta.nik_snapshot || '').trim()
  if (nikUser && nikMeta && nikUser !== nikMeta) return false
  const idUser = user?.id != null ? String(user.id).trim() : ''
  const idMeta = meta.id_santri != null ? String(meta.id_santri).trim() : ''
  if (idUser && idMeta && idUser !== idMeta) return false
  if (!idUser && sessionNik) {
    const sn = String(sessionNik).trim()
    if (nikMeta && sn && nikMeta !== sn) return false
  }
  return true
}
