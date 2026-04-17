import { daerahAPI, daerahKamarAPI, santriAPI } from './api'
import { getDomisiliSnapshot, putDomisiliSnapshot } from './domisiliIndexedDb'

export const DOMISILI_CACHE_EVENT = 'ebeddien-domisili-cache-updated'

function dispatchDomisiliUpdated() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(DOMISILI_CACHE_EVENT, { detail: { ts: Date.now() } }))
}

/**
 * Ambil penuh dari API lalu tulis IndexedDB (hanya jika daerah & kamar sukses) + opsional event UI.
 * @param {{ notify?: boolean }} [opts]
 * @returns {Promise<{ daerah: object[], kamar: object[], santri: object[], daerahOk: boolean, kamarOk: boolean }>}
 */
export async function fetchAndPersistDomisiliCache(opts = {}) {
  const { notify = false } = opts
  const prev = await getDomisiliSnapshot()
  const [daerahResponse, kamarResponse, stRes] = await Promise.all([
    daerahAPI.getAll({}),
    daerahKamarAPI.getAll({}),
    santriAPI.getAll().catch(() => ({ success: false, data: null }))
  ])
  const daerahOk = Boolean(daerahResponse?.success)
  const kamarOk = Boolean(kamarResponse?.success)
  const daerahFresh = daerahOk ? (daerahResponse.data || []) : null
  const kamarFresh = kamarOk ? (Array.isArray(kamarResponse.data) ? kamarResponse.data : []) : null
  const daerah = daerahFresh != null ? daerahFresh : (prev?.daerah || [])
  const kamar = kamarFresh != null ? kamarFresh : (prev?.kamar || [])
  const santri =
    stRes?.success && Array.isArray(stRes.data)
      ? stRes.data
      : (prev?.santri || [])
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
  const stRes = await santriAPI.getAll().catch(() => ({ success: false, data: null }))
  if (!stRes?.success || !Array.isArray(stRes.data)) return
  await putDomisiliSnapshot({
    daerah: prev.daerah,
    kamar: prev.kamar,
    santri: stRes.data
  })
  if (notify) dispatchDomisiliUpdated()
}
