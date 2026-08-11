import { daerahAPI, daerahKamarAPI, santriAPI } from './api'
import { fetchAllSantriRowsPaginated } from './santriIndexedDbSync'
import { getDomisiliSnapshot, putDomisiliSnapshot, dedupeDomisiliSantriById } from './domisiliIndexedDb'

export const DOMISILI_CACHE_EVENT = 'ebeddien-domisili-cache-updated'

function dispatchDomisiliUpdated() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(DOMISILI_CACHE_EVENT, { detail: { ts: Date.now() } }))
}

/**
 * Ambil semua halaman GET /santri (tanpa `limit` API hanya mengembalikan ±500 baris).
 * @returns {Promise<object[]>}
 */
export async function fetchAllSantriForDomisiliCache() {
  const all = await fetchAllSantriRowsPaginated()
  return dedupeDomisiliSantriById(all)
}

/**
 * Perbarui id_kamar satu santri di snapshot lokal (langsung terlihat di UI) lalu opsional refresh penuh.
 * @param {{ idSantri: number|string, idKamar: number|string|null, kamarRow?: object, notify?: boolean }} params
 */
export async function patchDomisiliSantriKamar({ idSantri, idKamar, kamarRow, notify = true }) {
  const prev = await getDomisiliSnapshot()
  if (!prev) return
  const idStr = String(idSantri)
  const patch = {
    id_kamar: idKamar === '' || idKamar == null ? null : Number(idKamar)
  }
  if (kamarRow && typeof kamarRow === 'object') {
    if (kamarRow.kamar != null) patch.kamar = kamarRow.kamar
    if (kamarRow.daerah_nama != null) patch.daerah = kamarRow.daerah_nama
    if (kamarRow.daerah_kategori != null) patch.kategori = kamarRow.daerah_kategori
    if (kamarRow.id_daerah != null) patch.id_daerah = kamarRow.id_daerah
  }
  let list = [...prev.santri]
  const idx = list.findIndex((s) => String(s.id) === idStr)
  if (idx >= 0) {
    list[idx] = { ...list[idx], ...patch }
  } else {
    try {
      const res = await santriAPI.getById(idSantri)
      if (res?.success && res.data) list.push({ ...res.data, ...patch })
    } catch {
      /* abaikan — refresh penuh akan mengisi */
    }
  }
  await putDomisiliSnapshot({
    daerah: prev.daerah,
    kamar: prev.kamar,
    santri: dedupeDomisiliSantriById(list)
  })
  if (notify) dispatchDomisiliUpdated()
}

/**
 * Setelah pindah/tambah kamar: patch lokal + muat ulang daftar santri (semua halaman).
 */
export async function syncDomisiliAfterSantriKamarChange({ idSantri, idKamar, kamarRow }) {
  await patchDomisiliSantriKamar({ idSantri, idKamar, kamarRow, notify: true })
  await refreshDomisiliSantriInCache({ notify: true })
}

/**
 * Ambil penuh dari API lalu tulis IndexedDB (hanya jika daerah & kamar sukses) + opsional event UI.
 * @param {{ notify?: boolean }} [opts]
 * @returns {Promise<{ daerah: object[], kamar: object[], santri: object[], daerahOk: boolean, kamarOk: boolean }>}
 */
export async function fetchAndPersistDomisiliCache(opts = {}) {
  const { notify = false } = opts
  const prev = await getDomisiliSnapshot()
  const [daerahResponse, kamarResponse, santriRows] = await Promise.all([
    daerahAPI.getAll({}),
    daerahKamarAPI.getAll({}),
    fetchAllSantriForDomisiliCache().catch(() => null)
  ])
  const daerahOk = Boolean(daerahResponse?.success)
  const kamarOk = Boolean(kamarResponse?.success)
  const daerahFresh = daerahOk ? (daerahResponse.data || []) : null
  const kamarFresh = kamarOk ? (Array.isArray(kamarResponse.data) ? kamarResponse.data : []) : null
  const daerah = daerahFresh != null ? daerahFresh : (prev?.daerah || [])
  const kamar = kamarFresh != null ? kamarFresh : (prev?.kamar || [])
  const santri =
    Array.isArray(santriRows) && santriRows.length > 0 ? santriRows : prev?.santri || []
  if (daerahOk && kamarOk) {
    await putDomisiliSnapshot({ daerah: daerahFresh, kamar: kamarFresh, santri })
  }
  if (notify) dispatchDomisiliUpdated()
  return { daerah, kamar, santri, daerahOk, kamarOk }
}

/**
 * Setelah indeks santri berubah: segarkan hanya baris santri di snapshot (tanpa GET daerah/kamar).
 * @param {{ notify?: boolean }} [opts]
 */
export async function refreshDomisiliSantriInCache(opts = {}) {
  const { notify = true } = opts
  const prev = await getDomisiliSnapshot()
  if (!prev) return
  const santri = await fetchAllSantriForDomisiliCache().catch(() => null)
  if (!Array.isArray(santri) || santri.length === 0) return
  await putDomisiliSnapshot({
    daerah: prev.daerah,
    kamar: prev.kamar,
    santri
  })
  if (notify) dispatchDomisiliUpdated()
}
