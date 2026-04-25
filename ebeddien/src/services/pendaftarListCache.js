import Dexie, { liveQuery } from 'dexie'

function pickRegistrasiTs(p) {
  if (!p || typeof p !== 'object') return ''
  const u =
    p.tanggal_update != null && String(p.tanggal_update).trim() !== ''
      ? String(p.tanggal_update).trim()
      : ''
  if (u) return u
  const d =
    p.tanggal_dibuat != null && String(p.tanggal_dibuat).trim() !== ''
      ? String(p.tanggal_dibuat).trim()
      : ''
  return d
}

/** Kunci cache per pasangan filter tahun (selaras query API). */
export function makePendaftarScopeKey(tahunHijriyah, tahunMasehi) {
  const h = String(tahunHijriyah ?? '').trim()
  const m = String(tahunMasehi ?? '').trim()
  return `h:${h}:m:${m}`
}

class PendaftarListCacheDB extends Dexie {
  constructor() {
    super('ebeddien_pendaftar_list')
    this.version(1).stores({
      rows: 'id_registrasi, scopeKey, tanggal_ref',
    })
  }
}

const db = new PendaftarListCacheDB()

export function normalizePendaftarCacheRow(payload, scopeKey) {
  if (!payload || typeof payload !== 'object') return null
  const id_registrasi = Number(payload.id_registrasi)
  if (!Number.isFinite(id_registrasi) || id_registrasi <= 0) return null
  const tanggal_ref = pickRegistrasiTs(payload) || null
  return {
    id_registrasi,
    scopeKey,
    tanggal_ref,
    payload: { ...payload },
  }
}

export async function getLocalPendaftarSinceWatermark(scopeKey) {
  try {
    const rows = await db.rows.where('scopeKey').equals(scopeKey).toArray()
    if (rows.length === 0) return null
    let max = ''
    for (const r of rows) {
      const t = r.tanggal_ref || pickRegistrasiTs(r.payload)
      if (t && t > max) max = t
    }
    return max || null
  } catch (e) {
    console.warn('pendaftarListCache getLocalPendaftarSinceWatermark', e)
    return null
  }
}

/**
 * @param {boolean} incremental — false = ganti seluruh baris scope; true = merge (delta dari API)
 */
export async function applyPendaftarServerPayload(scopeKey, data, incremental) {
  try {
    const rows = (Array.isArray(data) ? data : [])
      .map((p) => normalizePendaftarCacheRow(p, scopeKey))
      .filter(Boolean)
    if (!incremental) {
      await db.rows.where('scopeKey').equals(scopeKey).delete()
    }
    if (rows.length > 0) {
      await db.rows.bulkPut(rows)
    }
  } catch (e) {
    console.warn('pendaftarListCache applyPendaftarServerPayload', e)
  }
}

/** Urutan tampilan: id_registrasi DESC (selaras ORDER BY r.id DESC di API). */
export function toPendaftarDisplayList(rows) {
  const sorted = [...rows].sort((a, b) => (b.id_registrasi || 0) - (a.id_registrasi || 0))
  return sorted.map((r, index) => ({
    ...(r.payload && typeof r.payload === 'object' ? r.payload : {}),
    no: index + 1,
  }))
}

export async function getPendaftarListOrdered(scopeKey) {
  try {
    const rows = await db.rows.where('scopeKey').equals(scopeKey).toArray()
    return toPendaftarDisplayList(rows)
  } catch (e) {
    console.warn('pendaftarListCache getPendaftarListOrdered', e)
    return []
  }
}

/** Hapus baris cache pendaftar (semua scope) jika id_registrasi dihapus di server. */
export async function removePendaftarRowsByRegistrasiIds(ids) {
  try {
    const clean = (Array.isArray(ids) ? ids : [])
      .map((n) => parseInt(String(n), 10))
      .filter((n) => n > 0)
    if (clean.length === 0) return
    await db.rows.bulkDelete(clean)
  } catch (e) {
    console.warn('pendaftarListCache removePendaftarRowsByRegistrasiIds', e)
  }
}

/**
 * Observable daftar pendaftar per scope — UI ikut berubah saat IndexedDB berubah.
 */
export function subscribePendaftarListForScope(scopeKey, callback) {
  const obs = liveQuery(async () => {
    const rows = await db.rows.where('scopeKey').equals(scopeKey).toArray()
    return toPendaftarDisplayList(rows)
  })
  return obs.subscribe({
    next: (list) => callback(Array.isArray(list) ? list : []),
    error: (e) => console.warn('pendaftarListCache liveQuery', e),
  })
}
