import Dexie from 'dexie'

const db = new Dexie('ebeddien_manage_data_snapshots')

db.version(1).stores({
  snapshots: 'id',
})

/**
 * Kunci stabil untuk snapshot IndexedDB (diselaraskan dengan filter tab).
 * @param {'uwaba'|'khusus'|'tunggakan'} dataset
 * @param {Record<string, unknown>} raw
 */
export function manageDataSnapshotKey(dataset, raw) {
  const cleaned = {}
  for (const [k, v] of Object.entries(raw)) {
    if (v === undefined || v === null || v === '') continue
    cleaned[k] = v
  }
  const keys = Object.keys(cleaned).sort()
  const stable = {}
  for (const k of keys) stable[k] = cleaned[k]
  return `${dataset}:${JSON.stringify(stable)}`
}

/** @returns {Promise<{ id: string, revision: string, rows: unknown[], total: number, savedAt: number } | undefined>} */
export async function getManageDataSnapshot(id) {
  try {
    return await db.snapshots.get(id)
  } catch {
    return undefined
  }
}

/** @param {string} id
 * @param {{ revision: string, rows: unknown[], total: number }} payload */
export async function putManageDataSnapshot(id, payload) {
  try {
    await db.snapshots.put({
      id,
      revision: payload.revision,
      rows: payload.rows,
      total: payload.total,
      savedAt: Date.now(),
    })
  } catch {
    /* offline / quota */
  }
}
