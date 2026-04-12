import Dexie, { liveQuery } from 'dexie'

const SANTRI_LEGACY_LIST_KEY = 'santri_all_v1'

class OffcanvasSearchCacheDB extends Dexie {
  constructor() {
    super('ebeddien_offcanvas_search')
    this.version(1).stores({
      lists: 'key',
    })
    this.version(2).stores({
      lists: 'key',
      santriRows: 'id, tanggal_update, nama',
      meta: 'key',
    }).upgrade(async (tx) => {
      const row = await tx.table('lists').get(SANTRI_LEGACY_LIST_KEY)
      if (row?.data?.length) {
        const normalized = row.data.map(normalizeSantriRow).filter(Boolean)
        if (normalized.length) await tx.table('santriRows').bulkPut(normalized)
      }
    })
  }
}

const db = new OffcanvasSearchCacheDB()

/** Kolom waktu untuk watermark sinkron (API mengembalikan tanggal_update + tanggal_dibuat). */
function pickRowTimestamp(row) {
  if (!row || typeof row !== 'object') return ''
  const u = row.tanggal_update != null && String(row.tanggal_update).trim() !== '' ? String(row.tanggal_update).trim() : ''
  if (u) return u
  const d = row.tanggal_dibuat != null && String(row.tanggal_dibuat).trim() !== '' ? String(row.tanggal_dibuat).trim() : ''
  return d
}

export function normalizeSantriRow(s) {
  if (!s || typeof s !== 'object') return null
  const id = Number(s.id)
  if (!Number.isFinite(id) || id <= 0) return null
  const ts = pickRowTimestamp({ ...s, tanggal_update: s.tanggal_update, tanggal_dibuat: s.tanggal_dibuat })
  return { ...s, id, tanggal_update: ts || null }
}

/**
 * Observable daftar santri terurut nama — pakai Dexie liveQuery (UI ikut berubah saat IndexedDB berubah).
 */
export function subscribeSantriRowsOrdered(callback) {
  const obs = liveQuery(() => db.santriRows.orderBy('nama').toArray())
  return obs.subscribe({
    next: (list) => callback(Array.isArray(list) ? list : []),
    error: (e) => console.warn('offcanvasSearchCache liveQuery', e),
  })
}

/** Nilai tertinggi tanggal_update|tanggal_dibuat di lokal untuk query ?since= (inkremental). */
export async function getLocalSantriSinceWatermark() {
  try {
    const rows = await db.santriRows.toArray()
    if (rows.length === 0) return null
    let max = ''
    for (const r of rows) {
      const t = pickRowTimestamp(r)
      if (t && t > max) max = t
    }
    return max || null
  } catch (e) {
    console.warn('offcanvasSearchCache getLocalSantriSinceWatermark', e)
    return null
  }
}

/**
 * @param {object[]} data baris dari GET /santri
 * @param {boolean} incremental true = merge (bulkPut); false = ganti seluruh tabel
 */
export async function applySantriSearchServerPayload(data, incremental) {
  try {
    const rows = (Array.isArray(data) ? data : []).map(normalizeSantriRow).filter(Boolean)
    if (!incremental) {
      await db.santriRows.clear()
    }
    if (rows.length > 0) {
      await db.santriRows.bulkPut(rows)
    }
  } catch (e) {
    console.warn('offcanvasSearchCache applySantriSearchServerPayload', e)
  }
}

export async function removeSantriRowsByIds(ids) {
  try {
    const clean = (Array.isArray(ids) ? ids : []).map((n) => parseInt(String(n), 10)).filter((n) => n > 0)
    if (clean.length === 0) return
    await db.santriRows.bulkDelete(clean)
  } catch (e) {
    console.warn('offcanvasSearchCache removeSantriRowsByIds', e)
  }
}

export async function countSantriRows() {
  try {
    return await db.santriRows.count()
  } catch {
    return 0
  }
}

/** @deprecated pakai subscribeSantriRowsOrdered + IndexedDB v2 */
export async function getCachedSantriList() {
  try {
    const rows = await db.santriRows.orderBy('nama').toArray()
    if (rows.length > 0) return rows
    const row = await db.lists.get(SANTRI_LEGACY_LIST_KEY)
    if (!row || !Array.isArray(row.data)) return null
    return row.data
  } catch (e) {
    console.warn('offcanvasSearchCache getCachedSantriList', e)
    return null
  }
}

/** @deprecated pakai applySantriSearchServerPayload */
export async function saveCachedSantriList(data) {
  await applySantriSearchServerPayload(data, false)
  try {
    await db.lists.put({
      key: SANTRI_LEGACY_LIST_KEY,
      data: Array.isArray(data) ? data : [],
      updatedAt: new Date().toISOString(),
    })
  } catch (e) {
    console.warn('offcanvasSearchCache saveCachedSantriList lists mirror', e)
  }
}

export function buildPengurusCacheKey(roleKeys, lembagaId) {
  return `pengurus_v1:${String(roleKeys ?? '')}:${String(lembagaId ?? '')}`
}

export async function getCachedPengurusList(cacheKey) {
  try {
    const row = await db.lists.get(cacheKey)
    if (!row || !Array.isArray(row.data)) return null
    return row.data
  } catch (e) {
    console.warn('offcanvasSearchCache getCachedPengurusList', e)
    return null
  }
}

export async function saveCachedPengurusList(cacheKey, data) {
  try {
    await db.lists.put({
      key: cacheKey,
      data: Array.isArray(data) ? data : [],
      updatedAt: new Date().toISOString(),
    })
  } catch (e) {
    console.warn('offcanvasSearchCache saveCachedPengurusList', e)
  }
}
