/**
 * URL portal MyBeddien — selaras host eBeddien (production/staging) bila API masih mengembalikan localhost.
 */
export function getMybeddienAppUrl(apiUrl = '') {
  if (typeof window !== 'undefined') {
    const host = window.location.hostname
    if (host === 'ebeddien.alutsmani.id') return 'https://mybeddien.alutsmani.id'
    if (host === 'ebeddien2.alutsmani.id') return 'https://mybeddien2.alutsmani.id'
    if (host === 'ebeddien.alutsmani.my.id' || host.endsWith('.alutsmani.my.id')) {
      return 'https://mybeddien.alutsmani.my.id'
    }
  }
  const fromApi = String(apiUrl || '').trim().replace(/\/$/, '')
  if (fromApi && !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(fromApi)) {
    return fromApi
  }
  const fromEnv = import.meta.env.VITE_MYBEDDIEN_APP_URL
  if (fromEnv && String(fromEnv).trim() !== '') {
    return String(fromEnv).trim().replace(/\/$/, '')
  }
  return fromApi || 'http://localhost:5174'
}

/** Path riwayat pembayaran di myBeddien (butuh login santri). */
const KWITANSI_QR_PATHS = {
  pendaftaran: '/santri/riwayat-pembayaran/pendaftaran',
  uwaba: '/santri/riwayat-pembayaran/uwaba',
  khusus: '/santri/riwayat-pembayaran/khusus',
  tunggakan: '/santri/riwayat-pembayaran/tunggakan',
}

/**
 * URL QR kwitansi → myBeddien + identitas santri (nis/id) untuk validasi setelah login.
 * @param {'pendaftaran'|'uwaba'|'khusus'|'tunggakan'} kind
 * @param {{ nis?: string|number|null, id?: string|number|null }} [identity]
 */
export function getMybeddienKwitansiQrUrl(kind, identity = {}) {
  const base = getMybeddienAppUrl().replace(/\/$/, '')
  const path = KWITANSI_QR_PATHS[kind] || KWITANSI_QR_PATHS.tunggakan
  const params = new URLSearchParams()
  const nis = identity.nis != null && String(identity.nis).trim() !== '' ? String(identity.nis).trim() : ''
  const id = identity.id != null && String(identity.id).trim() !== '' ? String(identity.id).trim() : ''
  if (nis) params.set('nis', nis)
  if (id) params.set('id', id)
  const qs = params.toString()
  return qs ? `${base}${path}?${qs}` : `${base}${path}`
}
