import Dexie, { liveQuery } from 'dexie'

function pickRegistrasiTs(p) {
  if (!p || typeof p !== 'object') return ''
  const u =
    p.tanggal_update != null && String(p.tanggal_update).trim() !== ''
      ? String(p.tanggal_update).trim()
      : ''
  if (u) return u
  const d =
    p.tanggal_dibuat != null && String(p.tanggal_dibuat).trim() !== ''
      ? String(p.tanggal_dibuat).trim()
      : ''
  return d
}

/** Kunci cache per pasangan filter tahun (selaras query API). */
export function makePendaftarScopeKey(tahunHijriyah, tahunMasehi, variant = '') {
  const h = String(tahunHijriyah ?? '').trim()
  const m = String(tahunMasehi ?? '').trim()
  const v = variant ? `:${String(variant).trim()}` : ''
  return `h:${h}:m:${m}${v}`
}

/** Cache list Tes Masuk terpisah (API tanpa filter lembaga untuk panitia tes). */
export function makeTesMasukPendaftarScopeKey(tahunHijriyah, tahunMasehi) {
  return makePendaftarScopeKey(tahunHijriyah, tahunMasehi, 'tes_masuk')
}

class PendaftarListCacheDB extends Dexie {
  constructor() {
    super('ebeddien_pendaftar_list')
    this.version(1).stores({
      rows: 'id_registrasi, scopeKey, tanggal_ref',
    })
  }
}

const db = new PendaftarListCacheDB()

export function normalizePendaftarCacheRow(payload, scopeKey) {
  if (!payload || typeof payload !== 'object') return null
  const id_registrasi = Number(payload.id_registrasi)
  if (!Number.isFinite(id_registrasi) || id_registrasi <= 0) return null
  const tanggal_ref = pickRegistrasiTs(payload) || null
  return {
    id_registrasi,
    scopeKey,
    tanggal_ref,
    payload: { ...payload },
  }
}

export async function getLocalPendaftarSinceWatermark(scopeKey) {
  try {
    const rows = await db.rows.where('scopeKey').equals(scopeKey).toArray()
    if (rows.length === 0) return null
    let max = ''
    for (const r of rows) {
      const t = r.tanggal_ref || pickRegistrasiTs(r.payload)
      if (t && t > max) max = t
    }
    return max || null
  } catch (e) {
    console.warn('pendaftarListCache getLocalPendaftarSinceWatermark', e)
    return null
  }
}

/** Field tes yang bisa dipatch lokal sebelum server join mengembalikan nilai. */
const TES_CACHE_PATCH_FIELDS = ['gelombang_tes', 'keputusan_masuk']

async function preserveTesPatchFieldsFromCache(scopeKey, rows) {
  if (!rows.length) return rows
  const out = []
  for (const newRow of rows) {
    let payload = { ...newRow.payload }
    try {
      const existing = await db.rows.get(newRow.id_registrasi)
      if (existing?.payload && existing.scopeKey === scopeKey) {
        for (const key of TES_CACHE_PATCH_FIELDS) {
          const fromServer = payload[key]
          const fromLocal = existing.payload[key]
          if ((fromServer == null || fromServer === '') && fromLocal != null && fromLocal !== '') {
            payload[key] = fromLocal
          }
        }
      }
    } catch (_) { /* abaikan */ }
    out.push({ ...newRow, payload })
  }
  return out
}

/**
 * @param {boolean} incremental — false = ganti seluruh baris scope; true = merge (delta dari API)
 */
export async function applyPendaftarServerPayload(scopeKey, data, incremental) {
  try {
    let rows = (Array.isArray(data) ? data : [])
      .map((p) => normalizePendaftarCacheRow(p, scopeKey))
      .filter(Boolean)
    rows = await preserveTesPatchFieldsFromCache(scopeKey, rows)
    if (!incremental) {
      await db.rows.where('scopeKey').equals(scopeKey).delete()
    }
    if (rows.length > 0) {
      await db.rows.bulkPut(rows)
    }
  } catch (e) {
    console.warn('pendaftarListCache applyPendaftarServerPayload', e)
  }
}

/** Urutan tampilan: id_registrasi DESC (selaras ORDER BY r.id DESC di API). */
export function toPendaftarDisplayList(rows) {
  const sorted = [...rows].sort((a, b) => (b.id_registrasi || 0) - (a.id_registrasi || 0))
  return sorted.map((r, index) => ({
    ...(r.payload && typeof r.payload === 'object' ? r.payload : {}),
    no: index + 1,
  }))
}

export async function getPendaftarListOrdered(scopeKey) {
  try {
    const rows = await db.rows.where('scopeKey').equals(scopeKey).toArray()
    return toPendaftarDisplayList(rows)
  } catch (e) {
    console.warn('pendaftarListCache getPendaftarListOrdered', e)
    return []
  }
}

export async function removePendaftarRowsByRegistrasiIds(ids) {
  try {
    const clean = (Array.isArray(ids) ? ids : [])
      .map((n) => parseInt(String(n), 10))
      .filter((n) => n > 0)
    if (clean.length === 0) return
    await db.rows.bulkDelete(clean)
  } catch (e) {
    console.warn('pendaftarListCache removePendaftarRowsByRegistrasiIds', e)
  }
}

/** Patch field payload baris cache (mis. gelombang_tes setelah simpan tes). */
export async function patchPendaftarRowFields(scopeKey, idRegistrasi, fields) {
  try {
    const id = Number(idRegistrasi)
    if (!Number.isFinite(id) || id <= 0 || !fields || typeof fields !== 'object') return
    const row = await db.rows.get(id)
    if (!row || row.scopeKey !== scopeKey || !row.payload) return
    await db.rows.put({
      ...row,
      payload: { ...row.payload, ...fields },
    })
  } catch (e) {
    console.warn('pendaftarListCache patchPendaftarRowFields', e)
  }
}

/**
 * Observable daftar pendaftar per scope — UI ikut berubah saat IndexedDB berubah.
 */
export function subscribePendaftarListForScope(scopeKey, callback) {
  const obs = liveQuery(async () => {
    const rows = await db.rows.where('scopeKey').equals(scopeKey).toArray()
    return toPendaftarDisplayList(rows)
  })
  return obs.subscribe({
    next: (list) => callback(Array.isArray(list) ? list : []),
    error: (e) => console.warn('pendaftarListCache liveQuery', e),
  })
}
