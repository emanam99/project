/**
 * Pemuatan biodata santri: cache IndexedDB dulu, lalu network (stale-while-revalidate).
 * Setelah GET sukses, isi tabel santriBiodata agar mode offline + sync realtime.
 */
import { santriAPI } from './api'
import { findSantriBiodataByNis7, putSantriBiodataFromApi } from './offcanvasSearchCache'

const isOnline = () => typeof navigator === 'undefined' || navigator.onLine !== false

/**
 * @param {string} nis7
 * @param {{ onCache?: (data: object) => void }} [opts]
 * @returns {Promise<{ success: boolean, data?: object, message?: string, fromCache?: boolean, offline?: boolean, revalidated?: boolean, santriDbId?: number }>}
 */
export async function loadSantriBiodataWithCache(nis7, opts = {}) {
  const s = String(nis7 ?? '').trim()
  if (!/^\d{7}$/.test(s)) {
    return { success: false, message: 'NIS 7 digit tidak valid' }
  }

  const cached = await findSantriBiodataByNis7(s)
  if (cached?.data && typeof opts.onCache === 'function') {
    try {
      opts.onCache(cached.data)
    } catch (e) {
      console.warn('santriBiodataLoad onCache', e)
    }
  }

  if (!isOnline()) {
    if (cached?.data) {
      return {
        success: true,
        data: cached.data,
        fromCache: true,
        offline: true,
        santriDbId: cached.santriDbId,
      }
    }
    return { success: false, message: 'Tidak ada koneksi dan belum ada biodata tersimpan lokal untuk NIS ini', offline: true }
  }

  try {
    const result = await santriAPI.getById(s)
    if (result.success && result.data) {
      await putSantriBiodataFromApi(result.data)
      const dbId = Number(result.data.id)
      return {
        success: true,
        data: result.data,
        fromCache: false,
        offline: false,
        revalidated: !!cached,
        santriDbId: Number.isFinite(dbId) ? dbId : cached?.santriDbId,
      }
    }
    if (cached?.data) {
      return {
        success: true,
        data: cached.data,
        fromCache: true,
        offline: false,
        message: result.message,
        santriDbId: cached.santriDbId,
      }
    }
    return { success: false, message: result.message || 'Data santri tidak ditemukan' }
  } catch (err) {
    console.error('loadSantriBiodataWithCache', err)
    if (cached?.data) {
      return {
        success: true,
        data: cached.data,
        fromCache: true,
        offline: false,
        message: err?.message,
        santriDbId: cached.santriDbId,
      }
    }
    return { success: false, message: err?.message || 'Gagal mengambil data santri' }
  }
}

const BATCH = 4
let biodataQueue = Promise.resolve()

/**
 * Setelah indeks inkremental terbarui, isi/refresh cache biodata penuh (GET by id) dengan antrian ringan.
 */
export function scheduleRefreshBiodataForSantriIds(ids) {
  const clean = (Array.isArray(ids) ? ids : [])
    .map((n) => parseInt(String(n), 10))
    .filter((n) => n > 0)
  if (clean.length === 0) return
  if (!isOnline()) return
  biodataQueue = biodataQueue
    .then(() => runRefreshBiodataBatched(clean))
    .catch((e) => console.warn('scheduleRefreshBiodataForSantriIds', e))
}

async function runRefreshBiodataBatched(ids) {
  for (let i = 0; i < ids.length; i += BATCH) {
    const chunk = ids.slice(i, i + BATCH)
    await Promise.all(
      chunk.map((dbId) =>
        santriAPI
          .getById(String(dbId))
          .then((r) => {
            if (r?.success && r.data) return putSantriBiodataFromApi(r.data)
          })
          .catch(() => {})
      )
    )
  }
}
