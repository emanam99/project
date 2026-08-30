import { openDB } from 'idb'
import type { WiridBabMeta, WiridItem } from './types/wirid'
import { sortWiridRows } from './utils/groupByBab'

const DB_NAME = 'nailul-murod-db'
const STORE = 'entries'
const BAB_STORE = 'bab_meta'
const BAB_META_KEY = 'list'
const VERSION = 3
const API_BASE = (import.meta.env.VITE_API_BASE || '/api').replace(/\/$/, '')

async function db() {
  return openDB(DB_NAME, VERSION, {
    upgrade(database) {
      if (!database.objectStoreNames.contains(STORE)) {
        const store = database.createObjectStore(STORE, {
          keyPath: 'id',
          autoIncrement: true,
        })
        store.createIndex('by_bab', 'bab')
      }
      if (!database.objectStoreNames.contains(BAB_STORE)) {
        database.createObjectStore(BAB_STORE)
      }
    },
  })
}

function normalizeRow(raw: Record<string, unknown>): WiridItem {
  const judul = String(raw.judul ?? '')
  const judulId = raw.judul_id != null ? String(raw.judul_id) : judul
  const judulAr = raw.judul_ar != null ? String(raw.judul_ar) : judul
  return {
    id: Number(raw.id) || 0,
    bab: String(raw.bab ?? ''),
    judul,
    judul_id: judulId,
    judul_ar: judulAr,
    isi: String(raw.isi ?? ''),
    arti: String(raw.arti ?? ''),
    urutan: raw.urutan != null ? Number(raw.urutan) || 0 : 0,
  }
}

function normalizeBab(raw: Record<string, unknown>): WiridBabMeta {
  const nama = String(raw.nama ?? '')
  return {
    id: Number(raw.id) || 0,
    nama,
    nama_id: raw.nama_id != null ? String(raw.nama_id) : nama,
    nama_ar: raw.nama_ar != null ? String(raw.nama_ar) : nama,
    urutan: raw.urutan != null ? Number(raw.urutan) || 0 : 0,
    jumlah_entri: raw.jumlah_entri != null ? Number(raw.jumlah_entri) || 0 : 0,
  }
}

async function saveAllWirid(rows: WiridItem[]) {
  const database = await db()
  const tx = database.transaction(STORE, 'readwrite')
  await tx.store.clear()
  for (const row of rows) {
    await tx.store.put(row)
  }
  await tx.done
}

async function saveBabList(list: WiridBabMeta[]) {
  const database = await db()
  await database.put(BAB_STORE, list, BAB_META_KEY)
}

export async function getCachedWirid() {
  const database = await db()
  return (await database.getAll(STORE)) as WiridItem[]
}

export async function getCachedBabList(): Promise<WiridBabMeta[]> {
  const database = await db()
  const cached = await database.get(BAB_STORE, BAB_META_KEY)
  return Array.isArray(cached) ? (cached as WiridBabMeta[]) : []
}

export async function fetchWiridFromApi() {
  const res = await fetch(`${API_BASE}/wirid-nailul-murod`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  })
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`)
  }
  const payload = (await res.json()) as { success?: boolean; data?: unknown }
  if (!payload?.success || !Array.isArray(payload.data)) {
    throw new Error('Payload API wirid tidak valid')
  }
  return payload.data.map((row) => normalizeRow(row as Record<string, unknown>))
}

export async function fetchBabFromApi() {
  const res = await fetch(`${API_BASE}/wirid-nailul-murod/bab`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  })
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`)
  }
  const payload = (await res.json()) as { success?: boolean; data?: unknown }
  if (!payload?.success || !Array.isArray(payload.data)) {
    throw new Error('Payload API bab tidak valid')
  }
  return payload.data.map((row) => normalizeBab(row as Record<string, unknown>))
}

export async function loadWiridForReader() {
  try {
    const [rows, babList] = await Promise.all([fetchWiridFromApi(), fetchBabFromApi()])
    const sorted = sortWiridRows(rows, babList)
    await saveAllWirid(sorted)
    await saveBabList(babList)
    return { rows: sorted, babList, source: 'api' as const }
  } catch {
    const [rows, babList] = await Promise.all([getCachedWirid(), getCachedBabList()])
    const sorted = babList.length > 0 ? sortWiridRows(rows, babList) : rows
    return { rows: sorted, babList, source: 'cache' as const }
  }
}
