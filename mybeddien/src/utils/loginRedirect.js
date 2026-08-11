/**
 * Path internal aman untuk redirect setelah login (anti open-redirect).
 * @param {unknown} raw
 * @returns {string|null}
 */
export function sanitizeAppRedirect(raw) {
  if (raw == null) return null
  const s = String(raw).trim()
  if (!s.startsWith('/') || s.startsWith('//') || s.includes('://')) return null
  if (
    s === '/login' ||
    s.startsWith('/login?') ||
    s.startsWith('/login/') ||
    s.startsWith('/daftar') ||
    s.startsWith('/lupa-') ||
    s.startsWith('/setup-akun')
  ) {
    return null
  }
  return s
}

/** Bangun /login?redirect=… dari lokasi yang diminta saat belum autentikasi. */
export function loginPathWithRedirect(pathname, search = '') {
  const full = `${pathname || '/'}${search || ''}`
  const safe = sanitizeAppRedirect(full)
  if (!safe || safe === '/') return '/login'
  return `/login?redirect=${encodeURIComponent(safe)}`
}
