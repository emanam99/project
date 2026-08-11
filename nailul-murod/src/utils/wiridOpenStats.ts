import type { WiridItem } from '../types/wirid'

const STORAGE_KEY = 'nm-wirid-open-stats-v1'
const MAX_ENTRIES = 200

export type WiridOpenStatRow = {
  id: number
  judul: string
  bab: string
  count: number
  lastOpenedAt: number
}

type PersistShape = {
  v: 1
  entries: Record<string, WiridOpenStatRow>
}

function loadRaw(): PersistShape {
  if (typeof window === 'undefined') return { v: 1, entries: {} }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return { v: 1, entries: {} }
    const parsed = JSON.parse(raw) as Partial<PersistShape>
    if (parsed?.v !== 1 || typeof parsed.entries !== 'object' || !parsed.entries) {
      return { v: 1, entries: {} }
    }
    return { v: 1, entries: parsed.entries as Record<string, WiridOpenStatRow> }
  } catch {
    return { v: 1, entries: {} }
  }
}

function saveRaw(data: PersistShape) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch {
    /* quota / private mode */
  }
  try {
    window.dispatchEvent(new CustomEvent('nm-wirid-opens-changed'))
  } catch {
    /* ignore */
  }
}

/** Hindari penghitungan ganda saat React StrictMode memanggil effect dua kali berurutan. */
let lastDedupe: { id: number; t: number } | null = null

export function recordWiridOpen(item: Pick<WiridItem, 'id' | 'judul' | 'bab'>) {
  if (typeof window === 'undefined' || !item?.id) return
  const now = Date.now()
  if (lastDedupe && lastDedupe.id === item.id && now - lastDedupe.t < 450) return
  lastDedupe = { id: item.id, t: now }

  const data = loadRaw()
  const key = String(item.id)
  const prev = data.entries[key]
  const nextRow: WiridOpenStatRow = {
    id: item.id,
    judul: item.judul,
    bab: item.bab,
    count: (prev?.count ?? 0) + 1,
    lastOpenedAt: now,
  }
  data.entries[key] = nextRow

  const keys = Object.keys(data.entries)
  if (keys.length > MAX_ENTRIES) {
    const sorted = keys
      .map((k) => data.entries[k])
      .sort((a, b) => a.count - b.count || a.lastOpenedAt - b.lastOpenedAt)
    const drop = sorted.slice(0, keys.length - MAX_ENTRIES)
    for (const row of drop) delete data.entries[String(row.id)]
  }

  saveRaw(data)
}

export function getTopWiridOpens(limit: number): WiridOpenStatRow[] {
  const { entries } = loadRaw()
  return Object.values(entries)
    .filter((e) => e && typeof e.id === 'number' && e.count > 0)
    .sort((a, b) => b.count - a.count || b.lastOpenedAt - a.lastOpenedAt)
    .slice(0, Math.max(0, limit))
}
