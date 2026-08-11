import { openDB } from 'idb'
import type { WiridItem } from './types/wirid'

const DB_NAME = 'nailul-murod-db'
const STORE = 'entries'
const VERSION = 1
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
    },
  })
}

function normalizeRow(raw: Record<string, unknown>): WiridItem {
  return {
    id: Number(raw.id) || 0,
    bab: String(raw.bab ?? ''),
    judul: String(raw.judul ?? ''),
    isi: String(raw.isi ?? ''),
    arti: String(raw.arti ?? ''),
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

export async function getCachedWirid() {
  const database = await db()
  return (await database.getAll(STORE)) as WiridItem[]
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
    throw new Error('Payload API tidak valid')
  }
  return payload.data.map((row) => normalizeRow(row as Record<string, unknown>))
}

export async function loadWiridForReader() {
  try {
    const rows = await fetchWiridFromApi()
    await saveAllWirid(rows)
    return { rows, source: 'api' as const }
  } catch {
    const rows = await getCachedWirid()
    return { rows, source: 'cache' as const }
  }
}
