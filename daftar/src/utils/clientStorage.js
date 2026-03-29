/**
 * Util penyimpanan browser untuk aplikasi Daftar (tanpa dependensi api/authStore)
 * — dipakai logout, interceptor 401, dan sinkron NIK antar sesi.
 *
 * Audit kunci yang dipakai aplikasi Daftar (semua ikut terhapus saat `clearAllClientStorage`):
 * - Auth: auth_token, user_data
 * - Sesi login: daftar_login_nik, redirect_after_login (sessionStorage)
 * - Biodata: daftar_biodata_draft, daftar_biodata_full_v2:*, daftar_status_*, daftar_diniyah, daftar_formal, daftar_prodi
 * - Flow pendaftaran: pendaftaranData (local + session), STORAGE keys di halaman Pilihan*
 * - Tahun ajaran / pengaturan: tahun_ajaran, tahun_ajaran_masehi, tahun_ajaran_cache, tahun_ajaran_cache_timestamp
 * - Dashboard / berkas / pembayaran: daftar_dashboard_v1:*, daftar_berkas_list_v1:*, daftar_pembayaran_v1:*
 * - Berkas: kkSamaDenganSantri_* (per localId)
 * - UI: theme, sidebarCollapsed
 * - iPayMu: ipaymu_session_* (localStorage)
 * - Editor/upload: editedImageData, imageMeta, uploadingBerkasJenis, editorReturnPage (sessionStorage)
 * Cookie httpOnly session server tidak bisa dihapus dari JS — hanya lewat endpoint logout backend jika ada.
 */

export const STORAGE_NIK_KEY = 'daftar_storage_nik'

/** Normalisasi NIS untuk disimpan di user_data / state (null jika kosong). */
export function normalizeNisForStorage(v) {
  if (v == null) return null
  const s = String(v).trim()
  return s === '' ? null : s
}

/** Hapus semua localStorage dan sessionStorage (logout paksa / logout pengguna). */
export function clearAllClientStorage() {
  if (typeof localStorage !== 'undefined') {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i)
      if (k) localStorage.removeItem(k)
    }
  }
  if (typeof sessionStorage !== 'undefined') {
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const k = sessionStorage.key(i)
      if (k) sessionStorage.removeItem(k)
    }
  }
}

/**
 * Hapus Cache Storage API (PWA/service worker) jika ada — melengkapi pembersihan logout.
 */
export async function clearOptionalWebCaches() {
  if (typeof caches === 'undefined') return
  try {
    const keys = await caches.keys()
    await Promise.all(keys.map((name) => caches.delete(name)))
  } catch {
    /* ignore */
  }
}

/** Hapus hanya data daftar (NIK berubah = orang berbeda), tetap auth_token & user_data. */
export function clearDaftarDataOnly() {
  const keep = new Set(['auth_token', 'user_data', 'theme', 'sidebarCollapsed'])
  if (typeof localStorage !== 'undefined') {
    const keys = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && !keep.has(k)) keys.push(k)
    }
    keys.forEach((k) => localStorage.removeItem(k))
  }
  if (typeof sessionStorage !== 'undefined') {
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const k = sessionStorage.key(i)
      if (k) sessionStorage.removeItem(k)
    }
  }
}

/** Pastikan data localStorage hanya untuk NIK yang sama; jika NIK berubah, bersihkan data sebelumnya. */
export function ensureStorageNik(currentNik) {
  if (!currentNik || String(currentNik).trim() === '') return
  const nik = String(currentNik).trim()
  const stored = localStorage.getItem(STORAGE_NIK_KEY)
  if (stored != null && stored !== nik) {
    clearDaftarDataOnly()
  }
  try {
    localStorage.setItem(STORAGE_NIK_KEY, nik)
  } catch (e) { /* ignore */ }
}
