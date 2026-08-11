import {
  guruTugasRiwayatPjgtAPI,
  laporanPjgtMybeddianAPI,
  madrasahPjgtAPI,
} from './api'
import {
  gtRiwayatFingerprint,
  maxTanggalDibuat,
  readPjgtCache,
  writePjgtCache,
} from '../utils/pjgtCacheStorage'
import { usePjgtDataStore } from '../store/pjgtDataStore'

const inflight = new Map()

function once(key, fn) {
  if (inflight.has(key)) return inflight.get(key)
  const p = Promise.resolve()
    .then(fn)
    .finally(() => {
      inflight.delete(key)
    })
  inflight.set(key, p)
  return p
}

function konteksDayKey(data) {
  const d = data?.tanggal_masehi ?? data?.tanggalMasehi
  return d != null ? String(d).slice(0, 10) : ''
}

function profilUpdateKey(data) {
  return data?.tanggal_update != null ? String(data.tanggal_update) : ''
}

/**
 * Muat cache disk → store (sinkron).
 * @param {number} madrasahId
 */
export function hydratePjgtStore(madrasahId) {
  if (!madrasahId) return
  const cached = readPjgtCache(madrasahId)
  usePjgtDataStore.getState().applyHydration(madrasahId, cached)
}

/** Prefetch semua data tab PJGT (latar belakang, tidak memblokir UI). */
export function prefetchPjgtTabs(madrasahId) {
  if (!madrasahId) return
  hydratePjgtStore(madrasahId)
  void once(`prefetch:${madrasahId}`, async () => {
    await Promise.all([
      syncPjgtProfil(madrasahId, { background: true }),
      syncPjgtKonteks(madrasahId, { background: true }),
      syncPjgtGtRiwayat(madrasahId, { background: true }),
    ])
    const ta = usePjgtDataStore.getState().konteks?.id_tahun_ajaran
    if (ta != null && String(ta).trim() !== '') {
      await syncPjgtLaporan(madrasahId, String(ta).trim(), { background: true })
    }
    await syncPjgtLaporanAll(madrasahId, { background: true })
  })
}

/**
 * @param {number} madrasahId
 * @param {{ background?: boolean }} [opts]
 */
export async function syncPjgtProfil(madrasahId, opts = {}) {
  if (!madrasahId) return null
  const store = usePjgtDataStore.getState()
  if (store.madrasahId !== madrasahId) hydratePjgtStore(madrasahId)

  const hasCache = store.profil != null
  if (!hasCache && !opts.background) store.setProfilFetching(true)

  try {
    const res = await madrasahPjgtAPI.getProfil()
    if (!res?.success || !res.data || typeof res.data !== 'object') {
      if (!hasCache) store.setProfilError(res?.message || 'Gagal memuat profil madrasah.')
      return null
    }
    const prevKey = profilUpdateKey(store.profil)
    const nextKey = profilUpdateKey(res.data)
    if (!hasCache || prevKey !== nextKey || JSON.stringify(store.profil) !== JSON.stringify(res.data)) {
      store.setProfil(res.data)
      writePjgtCache(madrasahId, (c) => ({
        ...c,
        profil: { data: res.data, tanggalUpdate: nextKey, savedAt: Date.now() },
      }))
    }
    store.setProfilError('')
    return res.data
  } catch {
    if (!hasCache) store.setProfilError('Gagal memuat profil madrasah.')
    return null
  } finally {
    if (!opts.background) store.setProfilFetching(false)
  }
}

/**
 * @param {number} madrasahId
 * @param {{ background?: boolean }} [opts]
 */
export async function syncPjgtKonteks(madrasahId, opts = {}) {
  if (!madrasahId) return null
  const store = usePjgtDataStore.getState()
  if (store.madrasahId !== madrasahId) hydratePjgtStore(madrasahId)

  const hasCache = store.konteks != null
  if (!hasCache) store.setKonteksFetching(true)

  try {
    const res = await laporanPjgtMybeddianAPI.getKonteksSekarang()
    if (!res?.success || !res.data) {
      if (!hasCache) store.setKonteks(null, [])
      return null
    }
    const day = konteksDayKey(res.data)
    const prevDay = konteksDayKey(store.konteks)
    const changed =
      !hasCache ||
      day !== prevDay ||
      String(store.konteks?.id_tahun_ajaran ?? '') !== String(res.data.id_tahun_ajaran ?? '')
    if (changed) {
      store.setKonteks(res.data, Array.isArray(res.warnings) ? res.warnings : [])
      const warns = Array.isArray(res.warnings) ? res.warnings : []
      writePjgtCache(madrasahId, (c) => ({
        ...c,
        konteks: { data: res.data, tanggalMasehi: day, warnings: warns, savedAt: Date.now() },
      }))
    }
    return res.data
  } catch {
    return null
  } finally {
    store.setKonteksFetching(false)
    store.setKonteksSettled(true)
  }
}

/**
 * @param {number} madrasahId
 * @param {{ background?: boolean }} [opts]
 */
export async function syncPjgtGtRiwayat(madrasahId, opts = {}) {
  if (!madrasahId) return []
  const store = usePjgtDataStore.getState()
  if (store.madrasahId !== madrasahId) hydratePjgtStore(madrasahId)

  const hasCache = store.gtCached
  if (!hasCache && !opts.background) store.setGtFetching(true)

  try {
    const res = await guruTugasRiwayatPjgtAPI.getRiwayat()
    const rows = res?.success && Array.isArray(res.data) ? res.data : []
    const fp = gtRiwayatFingerprint(rows)
    if (!hasCache || store.gtFingerprint !== fp) {
      store.setGtRiwayat(rows, fp)
      writePjgtCache(madrasahId, (c) => ({
        ...c,
        gtRiwayat: { data: rows, fingerprint: fp, savedAt: Date.now() },
      }))
    }
    if (!res?.success && !hasCache) store.setGtError(res?.message || 'Gagal memuat riwayat')
    else store.setGtError('')
    return rows
  } catch (e) {
    if (!hasCache) {
      store.setGtRiwayat([], 'empty')
      store.setGtError(e?.response?.data?.message || e?.message || 'Gagal memuat riwayat')
    }
    return store.gtRiwayat
  } finally {
    if (!opts.background) store.setGtFetching(false)
  }
}

/**
 * @param {number} madrasahId
 * @param {string} tahunAjaran
 * @param {{ background?: boolean, force?: boolean }} [opts]
 */
export async function syncPjgtLaporan(madrasahId, tahunAjaran, opts = {}) {
  if (!madrasahId || !tahunAjaran) return []
  const ta = String(tahunAjaran).trim()
  const store = usePjgtDataStore.getState()
  if (store.madrasahId !== madrasahId) hydratePjgtStore(madrasahId)

  const cached = store.laporanByTa[ta]
  const hasCache = cached !== undefined && !opts.force
  if (!hasCache && !opts.background) store.setLaporanFetching(ta, true)

  try {
    const res = await laporanPjgtMybeddianAPI.getAll({ id_tahun_ajaran: ta })
    const rows = res?.success && Array.isArray(res.data) ? res.data : []
    const maxTd = maxTanggalDibuat(rows)
    const prevMax = store.laporanMetaByTa[ta]?.maxTanggalDibuat ?? ''
    if (!hasCache || maxTd !== prevMax || rows.length !== (cached?.length ?? -1)) {
      store.setLaporanForTa(ta, rows, maxTd)
      writePjgtCache(madrasahId, (c) => {
        const laporanByTa = { ...(c?.laporanByTa || {}) }
        laporanByTa[ta] = { data: rows, maxTanggalDibuat: maxTd, savedAt: Date.now() }
        return { ...c, laporanByTa }
      })
    }
    return rows
  } catch {
    return cached || []
  } finally {
    if (!opts.background) store.setLaporanFetching(ta, false)
  }
}

/** Daftar laporan tanpa filter TA (preview dashboard). */
export async function syncPjgtLaporanAll(madrasahId, opts = {}) {
  if (!madrasahId) return []
  const store = usePjgtDataStore.getState()
  if (store.madrasahId !== madrasahId) hydratePjgtStore(madrasahId)

  const hasCache = store.laporanAllCached
  if (!hasCache && !opts.background) store.setLaporanAllFetching(true)

  try {
    const res = await laporanPjgtMybeddianAPI.getAll({})
    const rows = res?.success && Array.isArray(res.data) ? res.data : []
    const maxTd = maxTanggalDibuat(rows)
    if (!hasCache || store.laporanAllMax !== maxTd) {
      store.setLaporanAll(rows, maxTd)
      writePjgtCache(madrasahId, (c) => ({
        ...c,
        laporanAll: { data: rows, maxTanggalDibuat: maxTd, savedAt: Date.now() },
      }))
    }
    return rows
  } catch {
    return store.laporanAll || []
  } finally {
    if (!opts.background) store.setLaporanAllFetching(false)
  }
}

/** Setelah create/update/delete laporan — paksa segarkan daftar TA aktif. */
export function refreshPjgtLaporanAfterMutation(madrasahId, tahunAjaran) {
  if (!madrasahId || !tahunAjaran) return
  void syncPjgtLaporan(madrasahId, tahunAjaran, { background: true, force: true })
  void syncPjgtLaporanAll(madrasahId, { background: true })
}
