import Dexie, { liveQuery } from 'dexie'

/** Satu cache lokal untuk semua UI daftar/cari santri (bukan ganda per halaman). */
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
    this.version(3).stores({
      lists: 'key',
      santriRows: 'id, tanggal_update, nama, nis',
      meta: 'key',
      santriBiodata: 'id, tanggal_update',
    }).upgrade(async (tx) => {
      const rows = await tx.table('santriRows').toArray()
      for (const r of rows) {
        if (r?.nis != null && String(r.nis).trim() !== '') {
          await tx.table('santriRows').put({ ...r, nis: String(r.nis).trim() })
        }
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
  const nis = s.nis != null && String(s.nis).trim() !== '' ? String(s.nis).trim() : ''
  return { ...s, id, nis, tanggal_update: ts || null }
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

/** Waktu server untuk baris biodata penuh (sama logika baris indeks). */
function pickBiodataTimestampFromRow(data) {
  if (!data || typeof data !== 'object') return ''
  const u = data.tanggal_update != null && String(data.tanggal_update).trim() !== '' ? String(data.tanggal_update).trim() : ''
  if (u) return u
  const d = data.tanggal_dibuat != null && String(data.tanggal_dibuat).trim() !== '' ? String(data.tanggal_dibuat).trim() : ''
  return d
}

/**
 * Simpan hasil GET /santri?id= (biodata penuh) ke cache lokal.
 * Primary key = santri.id (bukan NIS 7 digit).
 */
export async function putSantriBiodataFromApi(data) {
  try {
    if (!data || typeof data !== 'object') return
    const id = Number(data.id)
    if (!Number.isFinite(id) || id <= 0) return
    const ts = pickBiodataTimestampFromRow(data)
    await db.santriBiodata.put({
      id,
      data: { ...data },
      tanggal_update: ts || null,
      cachedAt: new Date().toISOString(),
    })
  } catch (e) {
    console.warn('offcanvasSearchCache putSantriBiodataFromApi', e)
  }
}

export async function getSantriBiodataByDbId(santriDbId) {
  try {
    const id = Number(santriDbId)
    if (!Number.isFinite(id) || id <= 0) return null
    const row = await db.santriBiodata.get(id)
    return row?.data && typeof row.data === 'object' ? row.data : null
  } catch (e) {
    console.warn('offcanvasSearchCache getSantriBiodataByDbId', e)
    return null
  }
}

/**
 * Cari cache biodata penuh lewat NIS 7 digit (bukan id DB).
 * Cocokkan ke indeks santriRows (id / nis) lalu baca santriBiodata.
 */
export async function findSantriBiodataByNis7(nis7) {
  try {
    const s = String(nis7 ?? '').trim()
    if (!/^\d{7}$/.test(s)) return null
    const n = parseInt(s, 10)
    const rowByNis = await db.santriRows.where('nis').equals(s).first()
    if (rowByNis?.id) {
      const row = await db.santriBiodata.get(rowByNis.id)
      if (row?.data) return { data: row.data, santriDbId: rowByNis.id }
    }
    const rowById = await db.santriRows.get(n)
    if (rowById?.id) {
      const row = await db.santriBiodata.get(rowById.id)
      if (row?.data) return { data: row.data, santriDbId: rowById.id }
    }
    return null
  } catch (e) {
    console.warn('offcanvasSearchCache findSantriBiodataByNis7', e)
    return null
  }
}

export async function removeSantriBiodataByIds(ids) {
  try {
    const clean = (Array.isArray(ids) ? ids : []).map((n) => parseInt(String(n), 10)).filter((n) => n > 0)
    if (clean.length === 0) return
    await db.santriBiodata.bulkDelete(clean)
  } catch (e) {
    console.warn('offcanvasSearchCache removeSantriBiodataByIds', e)
  }
}

/** Live update saat baris cache biodata diperbarui (sync socket / interval). */
export function subscribeSantriBiodataByDbId(santriDbId, callback) {
  const id = Number(santriDbId)
  if (!Number.isFinite(id) || id <= 0) {
    return { unsubscribe: () => {} }
  }
  const obs = liveQuery(() => db.santriBiodata.get(id))
  return obs.subscribe({
    next: (row) => {
      try {
        callback(row?.data && typeof row.data === 'object' ? row.data : null)
      } catch (e) {
        console.warn('subscribeSantriBiodataByDbId callback', e)
      }
    },
    error: (e) => console.warn('subscribeSantriBiodataByDbId liveQuery', e),
  })
}

/** Klien: daftar santri lokal per rombel (gantikan getByRombel bila offline). */
export function filterSantriRowsByRombelId(allRows, rombelId) {
  const r = parseInt(String(rombelId), 10)
  if (!Number.isFinite(r) || r <= 0) return []
  const byId = new Map()
  for (const s of allRows || []) {
    if (!s || s.id == null) continue
    const inD = Number(s.id_diniyah) === r
    const inF = Number(s.id_formal) === r
    if (!inD && !inF) continue
    const prev = byId.get(s.id)
    if (!prev) {
      byId.set(s.id, { ...s, role_rombel: inD && inF ? 'diniyah & formal' : inD ? 'diniyah' : 'formal' })
    } else {
      byId.set(s.id, { ...s, role_rombel: 'diniyah & formal' })
    }
  }
  return Array.from(byId.values())
}

export async function removeSantriRowsByIds(ids) {
  try {
    const clean = (Array.isArray(ids) ? ids : []).map((n) => parseInt(String(n), 10)).filter((n) => n > 0)
    if (clean.length === 0) return
    await db.santriRows.bulkDelete(clean)
    await removeSantriBiodataByIds(clean)
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
