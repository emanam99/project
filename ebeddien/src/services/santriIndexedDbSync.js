/**
 * Sinkron indeks santri ke IndexedDB (tabel santriRows di offcanvasSearchCache).
 * Dipakai bersama oleh halaman Data Santri, SearchOffcanvas, dan LiveSocketSync — satu sumber data lokal.
 */
import { santriAPI } from './api'
import {
  applySantriSearchServerPayload,
  countSantriRows,
  getLocalSantriSinceWatermark,
} from './offcanvasSearchCache'
import { scheduleRefreshBiodataForSantriIds } from './santriBiodataLoad'

/** Selaras batas maksimum `SANTRI_LIST_MAX_LIMIT` di API. */
export const SANTRI_INDEX_CHUNK_SIZE = 1000

export async function fetchSantriDeltaQuiet() {
  try {
    const since = await getLocalSantriSinceWatermark()
    if (!since) return
    const result = await santriAPI.getChangedSince(since)
    if (result.success && Array.isArray(result.data) && result.data.length > 0) {
      await applySantriSearchServerPayload(result.data, true)
      const ids = result.data.map((r) => r.id).filter((x) => x != null)
      scheduleRefreshBiodataForSantriIds(ids)
    }
  } catch (e) {
    console.warn('Sinkron inkremental indeks santri (IndexedDB):', e)
  }
}

/** Total baris santri di server (meta dari GET /santri?limit=1). */
export async function getServerSantriTotalCount() {
  try {
    const res = await santriAPI.getAll({ limit: 1, offset: 0 })
    if (res?.success && typeof res.meta?.total === 'number') {
      return res.meta.total
    }
  } catch (e) {
    console.warn('getServerSantriTotalCount', e)
  }
  return null
}

/** Cache lokal dianggap lengkap bila jumlah baris ≥ total server. */
export async function isSantriIndexComplete() {
  const localCount = await countSantriRows()
  if (localCount === 0) return false
  const total = await getServerSantriTotalCount()
  if (total == null) return true
  return localCount >= total
}

/**
 * Muat seluruh GET /santri per chunk (tanpa limit API hanya ±500 baris).
 * API mengembalikan meta.total / has_more; jika meta hilang, lanjut selama chunk penuh
 * atau belum capai total dari halaman pertama.
 * @returns {Promise<object[]>}
 */
export async function fetchAllSantriRowsPaginated(opts = {}) {
  const { signal, onProgress } = opts
  const all = []
  let offset = 0
  let total = null

  for (;;) {
    if (signal?.aborted) break
    const res = await santriAPI
      .getAll({ limit: SANTRI_INDEX_CHUNK_SIZE, offset, ...(signal ? { signal } : {}) })
      .catch(() => null)
    if (!res?.success || !Array.isArray(res.data)) break

    const chunk = res.data
    if (chunk.length === 0) break

    all.push(...chunk)
    if (typeof res.meta?.total === 'number') total = res.meta.total
    onProgress?.(all.length, total ?? all.length)

    if (total != null && all.length >= total) break
    if (res.meta?.has_more === false) break
    if (chunk.length < SANTRI_INDEX_CHUNK_SIZE) break
    offset += chunk.length
  }

  return all
}

/**
 * Sinkron penuh indeks santri ke IndexedDB (ganti seluruh tabel, lalu merge chunk berikutnya).
 * @returns {Promise<object[]>}
 */
export async function fetchAndApplyFullSantriIndex(opts = {}) {
  const { signal, onProgress } = opts
  const all = []
  let offset = 0
  let total = null
  let isFirstChunk = true

  for (;;) {
    if (signal?.aborted) break
    const res = await santriAPI
      .getAll({ limit: SANTRI_INDEX_CHUNK_SIZE, offset, ...(signal ? { signal } : {}) })
      .catch(() => null)
    if (!res?.success || !Array.isArray(res.data)) break

    const chunk = res.data
    if (chunk.length === 0) break

    if (isFirstChunk) {
      await applySantriSearchServerPayload(chunk, false)
      isFirstChunk = false
    } else {
      await applySantriSearchServerPayload(chunk, true)
    }

    all.push(...chunk)
    if (typeof res.meta?.total === 'number') total = res.meta.total
    onProgress?.(all.length, total ?? all.length)

    if (total != null && all.length >= total) break
    if (res.meta?.has_more === false) break
    if (chunk.length < SANTRI_INDEX_CHUNK_SIZE) break
    offset += chunk.length
  }

  return all
}
