/**
 * Penanggalan (hari ini + data tahun hijriyah): IndexedDB + mirror localStorage.
 * Mirror sinkron untuk first paint cepat; IndexedDB untuk persistensi besar & tahan reload.
 */

const LS_MIRROR_KEY = 'ebeddien_penanggalan_today_mirror_v1'
const DB_NAME = 'ebeddien_penanggalan'
const DB_VERSION = 1
const STORE_TODAY = 'today'
const STORE_YEAR = 'year'

/** Kunci tanggal Masehi (Y-m-d) — selaras dengan pemanggilan API (UTC ISO date). */
export function getMasehiKeyHariIni() {
  return new Date().toISOString().slice(0, 10)
}

let dbPromise = null

function openDb() {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null)
  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION)
      req.onerror = () => {
        resolve(null)
        dbPromise = null
      }
      req.onsuccess = () => resolve(req.result)
      req.onupgradeneeded = (e) => {
        const db = e.target.result
        if (!db.objectStoreNames.contains(STORE_TODAY)) {
          db.createObjectStore(STORE_TODAY, { keyPath: 'masehiYmd' })
        }
        if (!db.objectStoreNames.contains(STORE_YEAR)) {
          db.createObjectStore(STORE_YEAR, { keyPath: 'hijriYear' })
        }
      }
    })
  }
  return dbPromise
}

/** Baca cache hari ini dari localStorage (sinkron) jika cocok dengan kunci hari ini. */
export function readTodayPenanggalanSync() {
  try {
    if (typeof window === 'undefined') return null
    const key = getMasehiKeyHariIni()
    const raw = localStorage.getItem(LS_MIRROR_KEY)
    if (!raw) return null
    const o = JSON.parse(raw)
    if (!o || o.tanggalMasehi !== key) return null
    const h = o.hijriyah
    if (!h || h === '-' || h === '0000-00-00') return null
    return { masehi: (o.masehi || key).slice(0, 10), hijriyah: String(h).slice(0, 10) }
  } catch {
    return null
  }
}

export function writeTodayMirror(record) {
  try {
    if (typeof window === 'undefined' || !record) return
    const tanggal = String(record.masehi || record.tanggalMasehi || '').slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) return
    const h = record.hijriyah
    if (!h || h === '-' || h === '0000-00-00') return
    localStorage.setItem(
      LS_MIRROR_KEY,
      JSON.stringify({
        tanggalMasehi: tanggal,
        masehi: tanggal,
        hijriyah: String(h).slice(0, 10),
        savedAt: Date.now()
      })
    )
  } catch {
    /* quota / private mode */
  }
}

export async function idbGetToday(masehiYmd) {
  const db = await openDb()
  if (!db) return null
  const key = String(masehiYmd || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return null
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_TODAY, 'readonly')
      const req = tx.objectStore(STORE_TODAY).get(key)
      req.onsuccess = () => resolve(req.result || null)
      req.onerror = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

export async function idbPutToday(masehiYmd, apiPayload) {
  const db = await openDb()
  if (!db || !apiPayload) return
  const key = String(masehiYmd || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_TODAY, 'readwrite')
      tx.objectStore(STORE_TODAY).put({
        masehiYmd: key,
        payload: apiPayload,
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

export async function idbGetYear(hijriYear) {
  const db = await openDb()
  if (!db) return null
  const y = Number(hijriYear)
  if (!Number.isFinite(y)) return null
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_YEAR, 'readonly')
      const req = tx.objectStore(STORE_YEAR).get(y)
      req.onsuccess = () => {
        const row = req.result
        const data = row && Array.isArray(row.months) ? row.months : null
        resolve(data && data.length ? data : null)
      }
      req.onerror = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

export async function idbPutYear(hijriYear, monthsArray) {
  const db = await openDb()
  if (!db || !Array.isArray(monthsArray) || monthsArray.length === 0) return
  const y = Number(hijriYear)
  if (!Number.isFinite(y)) return
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_YEAR, 'readwrite')
      tx.objectStore(STORE_YEAR).put({
        hijriYear: y,
        months: monthsArray,
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

/**
 * Pasangan awal untuk state React (satu panggilan).
 * @returns {{ masehi: string, hijriyah: string }}
 */
export function getBootPenanggalanPair() {
  const iso = getMasehiKeyHariIni()
  const sync = readTodayPenanggalanSync()
  if (sync && String(sync.masehi).slice(0, 10) === iso && sync.hijriyah) {
    return { masehi: sync.masehi.slice(0, 10), hijriyah: sync.hijriyah }
  }
  return { masehi: iso, hijriyah: '' }
}
