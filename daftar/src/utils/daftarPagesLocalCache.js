/**
 * Cache halaman Daftar (Berkas list, snapshot Pembayaran) + invalidasi terkoordinasi dengan Dashboard.
 */

import { biodataCacheMatchesUser } from './biodataLocalCache'
import { getDashboardCacheKey } from './dashboardLocalCache'

export const BERKAS_LIST_CACHE_PREFIX = 'daftar_berkas_list_v1:'
export const PEMBAYARAN_CACHE_PREFIX = 'daftar_pembayaran_v1:'

export function getBerkasListCacheKey(nik, idSantriPk) {
  const n = String(nik || '').trim() || 'anon'
  const id = idSantriPk != null && String(idSantriPk).trim() !== '' ? String(idSantriPk).trim() : 'new'
  return `${BERKAS_LIST_CACHE_PREFIX}${n}:${id}`
}

export function getPembayaranCacheKey(nik, idSantriPk, tahunHijriyah, tahunMasehi) {
  const n = String(nik || '').trim() || 'anon'
  const id = idSantriPk != null && String(idSantriPk).trim() !== '' ? String(idSantriPk).trim() : 'new'
  const th = String(tahunHijriyah ?? '').trim()
  const tm = String(tahunMasehi ?? '').trim()
  return `${PEMBAYARAN_CACHE_PREFIX}${n}:${id}:${th}:${tm}`
}

/**
 * @returns {{ v: number, berkasList: object[], meta: object }|null}
 */
export function readBerkasListCache(storageKey) {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(storageKey)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || parsed.v !== 1 || !Array.isArray(parsed.berkasList) || typeof parsed.meta !== 'object') {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

export function writeBerkasListCache(storageKey, berkasList, meta) {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(
      storageKey,
      JSON.stringify({
        v: 1,
        berkasList,
        meta,
        client_saved_at: new Date().toISOString(),
      })
    )
  } catch {
    /* quota */
  }
}

/**
 * @returns {{
 *   v: number,
 *   registrasi: object|null,
 *   registrasiDetail: object[],
 *   buktiPembayaranList: object[],
 *   paymentHistory: object[],
 *   meta: object
 * }|null}
 */
export function readPembayaranCache(storageKey) {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(storageKey)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || parsed.v !== 1 || typeof parsed.meta !== 'object') return null
    if (!('registrasi' in parsed)) return null
    if (!Array.isArray(parsed.registrasiDetail)) return null
    if (!Array.isArray(parsed.buktiPembayaranList)) return null
    if (!Array.isArray(parsed.paymentHistory)) return null
    return parsed
  } catch {
    return null
  }
}

export function writePembayaranCache(storageKey, snapshot) {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(
      storageKey,
      JSON.stringify({
        ...snapshot,
        v: 1,
        client_saved_at: new Date().toISOString(),
      })
    )
  } catch {
    /* quota */
  }
}

export function berkasListCacheMatchesUser(meta, user, sessionNik) {
  return biodataCacheMatchesUser(meta, user, sessionNik)
}

export function pembayaranCacheMatchesUser(meta, user, sessionNik) {
  return biodataCacheMatchesUser(meta, user, sessionNik)
}

/**
 * Hapus cache dashboard / berkas / pembayaran untuk konteks user+tahun.
 * @param {{
 *   nik?: string|null,
 *   idSantri: string|number,
 *   tahunHijriyah?: string|null,
 *   tahunMasehi?: string|null,
 *   sessionNik?: string,
 *   dashboard?: boolean,
 *   berkas?: boolean,
 *   pembayaran?: boolean,
 * }} opts
 */
export function invalidateDaftarCaches(opts) {
  if (typeof localStorage === 'undefined') return
  const {
    nik,
    idSantri,
    tahunHijriyah,
    tahunMasehi,
    sessionNik: sn,
    dashboard = true,
    berkas = false,
    pembayaran = false,
  } = opts
  const sessionNik =
    sn !== undefined
      ? sn
      : typeof sessionStorage !== 'undefined'
        ? sessionStorage.getItem('daftar_login_nik') || ''
        : ''
  const n = String(nik || sessionNik || '').trim() || 'anon'
  if (idSantri == null || String(idSantri).trim() === '') return
  const id = String(idSantri).trim()
  const th = String(tahunHijriyah ?? '').trim()
  const tm = String(tahunMasehi ?? '').trim()
  try {
    if (dashboard) {
      localStorage.removeItem(getDashboardCacheKey(n, id, tahunHijriyah, tahunMasehi))
    }
    if (berkas) {
      localStorage.removeItem(getBerkasListCacheKey(n, id))
    }
    if (pembayaran) {
      localStorage.removeItem(getPembayaranCacheKey(n, id, tahunHijriyah, tahunMasehi))
    }
  } catch {
    /* ignore */
  }
}

/** Setelah ubah berkas: dashboard progress ikut usang */
export function invalidateBerkasAndDashboard(nik, idSantri, tahunHijriyah, tahunMasehi, sessionNik) {
  invalidateDaftarCaches({
    nik,
    idSantri,
    tahunHijriyah,
    tahunMasehi,
    sessionNik,
    dashboard: true,
    berkas: true,
    pembayaran: false,
  })
}

/** Setelah ubah pembayaran/registrasi: dashboard langkah 3 & keterangan */
export function invalidatePembayaranAndDashboard(nik, idSantri, tahunHijriyah, tahunMasehi, sessionNik) {
  invalidateDaftarCaches({
    nik,
    idSantri,
    tahunHijriyah,
    tahunMasehi,
    sessionNik,
    dashboard: true,
    berkas: false,
    pembayaran: true,
  })
}

/** Setelah simpan biodata: dashboard + pembayaran (registrasi/bayar bisa berubah); berkas tidak */
export function invalidateAfterBiodataSave(nik, idSantri, tahunHijriyah, tahunMasehi, sessionNik) {
  invalidateDaftarCaches({
    nik,
    idSantri,
    tahunHijriyah,
    tahunMasehi,
    sessionNik,
    dashboard: true,
    berkas: false,
    pembayaran: true,
  })
}

/** Hanya cache dashboard (setelah daftar berkas berubah; daftar berkas di-cache terpisah dan diperbarui saat fetch). */
export function invalidateDashboardCacheOnly(nik, idSantri, tahunHijriyah, tahunMasehi, sessionNik) {
  invalidateDaftarCaches({
    nik,
    idSantri,
    tahunHijriyah,
    tahunMasehi,
    sessionNik,
    dashboard: true,
    berkas: false,
    pembayaran: false,
  })
}
