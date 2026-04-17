/**
 * Sinkron indeks santri ke IndexedDB (tabel santriRows di offcanvasSearchCache).
 * Dipakai bersama oleh halaman Data Santri, SearchOffcanvas, dan LiveSocketSync — satu sumber data lokal.
 */
import { santriAPI } from './api'
import {
  applySantriSearchServerPayload,
  getLocalSantriSinceWatermark,
} from './offcanvasSearchCache'

export async function fetchSantriDeltaQuiet() {
  try {
    const since = await getLocalSantriSinceWatermark()
    if (!since) return
    const result = await santriAPI.getChangedSince(since)
    if (result.success && Array.isArray(result.data) && result.data.length > 0) {
      await applySantriSearchServerPayload(result.data, true)
    }
  } catch (e) {
    console.warn('Sinkron inkremental indeks santri (IndexedDB):', e)
  }
}
