import Dexie from 'dexie'

const SANTRI_CACHE_KEY = 'santri_all_v1'

class OffcanvasSearchCacheDB extends Dexie {
  constructor() {
    super('ebeddien_offcanvas_search')
    this.version(1).stores({
      lists: 'key',
    })
  }
}

const db = new OffcanvasSearchCacheDB()

/**
 * Cache daftar santri (GET /santri) untuk offcanvas Cari Santri.
 * @returns {Promise<object[]|null>}
 */
export async function getCachedSantriList() {
  try {
    const row = await db.lists.get(SANTRI_CACHE_KEY)
    if (!row || !Array.isArray(row.data)) return null
    return row.data
  } catch (e) {
    console.warn('offcanvasSearchCache getCachedSantriList', e)
    return null
  }
}

export async function saveCachedSantriList(data) {
  try {
    await db.lists.put({
      key: SANTRI_CACHE_KEY,
      data: Array.isArray(data) ? data : [],
      updatedAt: new Date().toISOString(),
    })
  } catch (e) {
    console.warn('offcanvasSearchCache saveCachedSantriList', e)
  }
}

export function buildPengurusCacheKey(roleKeys, lembagaId) {
  return `pengurus_v1:${String(roleKeys ?? '')}:${String(lembagaId ?? '')}`
}

/**
 * @param {string} cacheKey dari buildPengurusCacheKey
 * @returns {Promise<object[]|null>}
 */
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
