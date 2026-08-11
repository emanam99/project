import Dexie, { liveQuery } from 'dexie'
import { barangAPI } from './api'

/**
 * Cache lokal daftar barang toko (kasir / cari barang).
 * Sinkron latar: tampil dari IndexedDB dulu, API update tanpa spinner.
 */
class BarangCacheDB extends Dexie {
  constructor() {
    super('mybeddien_barang_cache')
    this.version(1).stores({
      barang: 'id, pedagang_id, nama_barang, kode_barang, tanggal_update',
      meta: 'key',
    })
  }
}

const db = new BarangCacheDB()

function pickTs(row) {
  if (!row || typeof row !== 'object') return ''
  const u = row.tanggal_update != null ? String(row.tanggal_update).trim() : ''
  if (u) return u
  return row.tanggal_dibuat != null ? String(row.tanggal_dibuat).trim() : ''
}

export function normalizeBarangRow(row, pedagangId) {
  if (!row || typeof row !== 'object') return null
  const id = Number(row.id)
  if (!Number.isFinite(id) || id <= 0) return null
  const pid = Number(row.pedagang_id ?? pedagangId)
  if (!Number.isFinite(pid) || pid <= 0) return null
  return {
    id,
    pedagang_id: pid,
    kode_barang: row.kode_barang != null ? String(row.kode_barang) : '',
    nama_barang: row.nama_barang != null ? String(row.nama_barang) : '',
    harga: Number(row.harga) || 0,
    stok: Number(row.stok ?? 0) || 0,
    keterangan: row.keterangan ?? null,
    urutan: Number(row.urutan ?? 0) || 0,
    aktif: Number(row.aktif ?? 1) || 0,
    tanggal_dibuat: row.tanggal_dibuat ?? null,
    tanggal_update: pickTs(row) || null,
  }
}

function rowFingerprint(r) {
  return [
    r.kode_barang,
    r.nama_barang,
    String(r.harga),
    String(r.stok),
    String(r.aktif),
    String(r.urutan),
    r.keterangan ?? '',
    r.tanggal_update ?? '',
  ].join('\u0001')
}

async function metaKey(pedagangId) {
  return `toko:${pedagangId}`
}

export async function getBarangWatermark(pedagangId) {
  try {
    const m = await db.meta.get(await metaKey(pedagangId))
    return m?.since || null
  } catch {
    return null
  }
}

async function setBarangWatermark(pedagangId, since) {
  await db.meta.put({ key: await metaKey(pedagangId), since: since || null, synced_at: Date.now() })
}

export async function countLocalBarang(pedagangId) {
  try {
    return await db.barang.where('pedagang_id').equals(pedagangId).count()
  } catch {
    return 0
  }
}

export async function getLocalBarangList(pedagangId) {
  try {
    const rows = await db.barang.where('pedagang_id').equals(pedagangId).toArray()
    rows.sort((a, b) => {
      const u = (a.urutan || 0) - (b.urutan || 0)
      if (u !== 0) return u
      return String(a.nama_barang || '').localeCompare(String(b.nama_barang || ''), 'id')
    })
    return rows.filter((r) => Number(r.aktif) !== 0)
  } catch (e) {
    console.warn('getLocalBarangList', e)
    return []
  }
}

/**
 * Subscribe daftar barang aktif per toko — UI ikut berubah saat IndexedDB berubah.
 */
export function subscribeBarangList(pedagangId, callback) {
  if (!pedagangId) {
    callback([])
    return { unsubscribe: () => {} }
  }
  const obs = liveQuery(async () => {
    const rows = await db.barang.where('pedagang_id').equals(pedagangId).toArray()
    rows.sort((a, b) => {
      const u = (a.urutan || 0) - (b.urutan || 0)
      if (u !== 0) return u
      return String(a.nama_barang || '').localeCompare(String(b.nama_barang || ''), 'id')
    })
    return rows.filter((r) => Number(r.aktif) !== 0)
  })
  return obs.subscribe({
    next: (list) => callback(Array.isArray(list) ? list : []),
    error: (e) => console.warn('subscribeBarangList', e),
  })
}

/**
 * Merge payload server: hanya tulis baris yang berubah; opsional hapus orphan (full sync).
 * @returns {{ put: number, removed: number }}
 */
export async function applyBarangServerPayload(pedagangId, data, { fullReplace = false } = {}) {
  const incoming = (Array.isArray(data) ? data : [])
    .map((r) => normalizeBarangRow(r, pedagangId))
    .filter(Boolean)

  const existing = await db.barang.where('pedagang_id').equals(pedagangId).toArray()
  const byId = new Map(existing.map((r) => [r.id, r]))

  const toPut = []
  let maxTs = (await getBarangWatermark(pedagangId)) || ''

  for (const row of incoming) {
    const prev = byId.get(row.id)
    if (!prev || rowFingerprint(prev) !== rowFingerprint(row)) {
      toPut.push(row)
    }
    const t = pickTs(row)
    if (t && t > maxTs) maxTs = t
  }

  if (toPut.length) {
    await db.barang.bulkPut(toPut)
  }

  let removed = 0
  if (fullReplace) {
    const keep = new Set(incoming.map((r) => r.id))
    const orphanIds = existing.filter((r) => !keep.has(r.id)).map((r) => r.id)
    if (orphanIds.length) {
      await db.barang.bulkDelete(orphanIds)
      removed = orphanIds.length
    }
  }

  if (maxTs) await setBarangWatermark(pedagangId, maxTs)
  return { put: toPut.length, removed }
}

export async function upsertLocalBarang(row, pedagangId) {
  const n = normalizeBarangRow(row, pedagangId)
  if (!n) return
  await db.barang.put(n)
  const t = pickTs(n)
  if (t) {
    const cur = await getBarangWatermark(pedagangId)
    if (!cur || t > cur) await setBarangWatermark(pedagangId, t)
  }
}

export async function removeLocalBarang(id) {
  const n = Number(id)
  if (!Number.isFinite(n) || n <= 0) return
  await db.barang.delete(n)
}

let syncInFlight = new Map()

/**
 * Sinkron latar belakang: GET penuh, lalu hanya tulis baris yang berubah + hapus orphan.
 * Tidak menampilkan loading di UI.
 */
export async function syncBarangCache(pedagangId) {
  if (!pedagangId) return { ok: false }
  if (syncInFlight.get(pedagangId)) return syncInFlight.get(pedagangId)

  const run = (async () => {
    try {
      const full = await barangAPI.getList({})
      if (full?.success && Array.isArray(full.data)) {
        const stats = await applyBarangServerPayload(pedagangId, full.data, { fullReplace: true })
        return { ok: true, ...stats }
      }
      return { ok: false }
    } catch (e) {
      console.warn('syncBarangCache', e)
      return { ok: false, error: e }
    } finally {
      syncInFlight.delete(pedagangId)
    }
  })()

  syncInFlight.set(pedagangId, run)
  return run
}
