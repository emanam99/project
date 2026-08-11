/** Judul web / share link — beda dari Aplikasi Pendaftaran santri */
export const ALUMNI_DOC_TITLE = 'Pendataan Alumni'
export const ALUMNI_DOC_SUBTITLE = 'Sensus Alumni Pesantren Salafiyah Al-Utsmani'

/**
 * Host khusus alumni (alumni.alutsmani.id) — konten sama /alumni di daftar.
 * Staging: alumni2.alutsmani.id dll.
 */
export function isAlumniAppHost(hostname = typeof window !== 'undefined' ? window.location.hostname : '') {
  const h = String(hostname || '').toLowerCase()
  if (!h) return false
  if (h === 'alumni.alutsmani.id') return true
  if (/^alumni\d+\.alutsmani\.id$/.test(h)) return true
  return false
}

/** Prefix path: '' di host alumni, '/alumni' di daftar.alutsmani.id */
export function alumniBasePath() {
  return isAlumniAppHost() ? '' : '/alumni'
}

/**
 * Path rute alumni.
 * - alumniPath() → '/' (host) atau '/alumni' (daftar)
 * - alumniPath('biodata') → '/biodata' atau '/alumni/biodata'
 */
export function alumniPath(sub = '') {
  const base = alumniBasePath()
  const s = String(sub || '').replace(/^\/+/, '')
  if (!s) return base || '/'
  const joined = `${base}/${s}`.replace(/\/{2,}/g, '/')
  return joined.startsWith('/') ? joined : `/${joined}`
}

/** Canonical URL untuk og:url / share */
export function alumniCanonicalUrl() {
  if (typeof window === 'undefined') return 'https://alumni.alutsmani.id/'
  const { protocol, hostname } = window.location
  if (isAlumniAppHost(hostname)) {
    return `${protocol}//${hostname}/`
  }
  return `${protocol}//${hostname}/alumni`
}
