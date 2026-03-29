/**
 * Snapshot progress dashboard (langkah, berkas, keterangan) + meta user/tahun.
 * Hydrasi instan seperti biodata; API tetap dijalankan di latar belakang untuk menyegarkan.
 */

import { biodataCacheMatchesUser } from './biodataLocalCache'

export const DASHBOARD_CACHE_PREFIX = 'daftar_dashboard_v1:'

export function getDashboardCacheKey(nik, idSantriPk, tahunHijriyah, tahunMasehi) {
  const n = String(nik || '').trim() || 'anon'
  const id = idSantriPk != null && String(idSantriPk).trim() !== '' ? String(idSantriPk).trim() : 'new'
  const th = String(tahunHijriyah ?? '').trim()
  const tm = String(tahunMasehi ?? '').trim()
  return `${DASHBOARD_CACHE_PREFIX}${n}:${id}:${th}:${tm}`
}

/**
 * @returns {{
 *   v: number,
 *   stepStatuses: string[],
 *   berkasProgress: { uploaded: number, notAvailable: number, total: number },
 *   keteranganStatus: string|null,
 *   meta: object,
 *   client_saved_at?: string
 * }|null}
 */
export function readDashboardCache(storageKey) {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(storageKey)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || parsed.v !== 1 || !Array.isArray(parsed.stepStatuses)) return null
    if (!parsed.berkasProgress || typeof parsed.berkasProgress !== 'object') return null
    if (typeof parsed.meta !== 'object' || parsed.meta === null) return null
    return parsed
  } catch {
    return null
  }
}

/**
 * @param {string} storageKey
 * @param {{
 *   v: number,
 *   stepStatuses: string[],
 *   berkasProgress: { uploaded: number, notAvailable: number, total: number },
 *   keteranganStatus: string|null,
 *   meta: object
 * }} snapshot
 */
export function writeDashboardCache(storageKey, snapshot) {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(
      storageKey,
      JSON.stringify({
        ...snapshot,
        client_saved_at: new Date().toISOString(),
      })
    )
  } catch {
    /* quota */
  }
}

export function dashboardCacheMatchesUser(meta, user, sessionNik) {
  return biodataCacheMatchesUser(meta, user, sessionNik)
}
