/**
 * Sinkron inkremental daftar Data Pendaftar ke IndexedDB (memakai sessionStorage scope aktif).
 */
import { pendaftaranAPI } from './api'
import {
  applyPendaftarServerPayload,
  getLocalPendaftarSinceWatermark,
  makePendaftarScopeKey,
} from './pendaftarListCache'

const SCOPE_KEY = 'ebeddien_pendaftar_scope'

function readActiveScope() {
  try {
    const raw = sessionStorage.getItem(SCOPE_KEY)
    if (!raw) return null
    const o = JSON.parse(raw)
    if (!o || typeof o !== 'object') return null
    return {
      hijriyah: o.hijriyah != null ? String(o.hijriyah) : '',
      masehi: o.masehi != null ? String(o.masehi) : '',
    }
  } catch {
    return null
  }
}

export async function fetchPendaftarDeltaQuiet() {
  try {
    const sc = readActiveScope()
    if (!sc) return
    const scopeKey = makePendaftarScopeKey(sc.hijriyah, sc.masehi)
    const since = await getLocalPendaftarSinceWatermark(scopeKey)
    if (!since) return
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return

    const result = await pendaftaranAPI.getAllPendaftar(sc.hijriyah, sc.masehi, since)
    if (result.success && Array.isArray(result.data) && result.data.length > 0) {
      await applyPendaftarServerPayload(scopeKey, result.data, true)
    }
  } catch (e) {
    console.warn('Sinkron inkremental daftar pendaftar (IndexedDB):', e)
  }
}
