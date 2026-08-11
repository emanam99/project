/**
 * Cache daftar daerah + kamar + santri (GET /santri) untuk halaman Domisili.
 * Satu snapshot per browser; diperbarui dari API dan event socket.
 */

const DB_NAME = 'ebeddien_domisili'
const DB_VERSION = 1
const STORE = 'snapshot'
const KEY = 'lists_v1'

let dbPromise = null

/** Satu baris per id santri (pertama menang) — cegah duplikat dari API/join lama atau cache korup. */
export function dedupeDomisiliSantriById(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return rows
  const byKey = new Map()
  for (const s of rows) {
    if (!s || s.id == null || s.id === '') continue
    const key = String(s.id)
    if (!byKey.has(key)) byKey.set(key, s)
  }
  return Array.from(byKey.values())
}

function openDb() {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null)
  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION)
      req.onerror = () => {
        dbPromise = null
        resolve(null)
      }
      req.onsuccess = () => resolve(req.result)
      req.onupgradeneeded = (e) => {
        const db = e.target.result
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'key' })
        }
      }
    })
  }
  return dbPromise
}

/**
 * @returns {Promise<{ daerah: object[], kamar: object[], santri: object[], updatedAt: number } | null>}
 */
export async function getDomisiliSnapshot() {
  const db = await openDb()
  if (!db) return null
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readonly')
      const req = tx.objectStore(STORE).get(KEY)
      req.onsuccess = () => {
        const row = req.result
        if (!row || typeof row !== 'object') {
          resolve(null)
          return
        }
        resolve({
          daerah: Array.isArray(row.daerah) ? row.daerah : [],
          kamar: Array.isArray(row.kamar) ? row.kamar : [],
          santri: dedupeDomisiliSantriById(Array.isArray(row.santri) ? row.santri : []),
          updatedAt: Number(row.updatedAt) || 0
        })
      }
      req.onerror = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

export async function putDomisiliSnapshot({ daerah, kamar, santri }) {
  const db = await openDb()
  if (!db) return
  const d = Array.isArray(daerah) ? daerah : []
  const k = Array.isArray(kamar) ? kamar : []
  const s = dedupeDomisiliSantriById(Array.isArray(santri) ? santri : [])
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put({
        key: KEY,
        daerah: d,
        kamar: k,
        santri: s,
        updatedAt: Date.now()
      })
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
      tx.onabort = () => resolve()
    } catch {
      resolve()
    }
  })
}
