import { userHasSuperAdminAccess } from './roleAccess'

function normalizeRoleKey(k) {
  return String(k ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
}

/**
 * @param {object|null|undefined} user
 * @param {{ role_keys?: string[] }|null|undefined} aksesAbsenMandiri dari GET /api/absen-setting
 * @returns {boolean} true jika tidak ada pembatasan atau salah satu peran user ada di daftar
 */
export function userPassesMandiriRoleAllowlist(user, aksesAbsenMandiri) {
  if (userHasSuperAdminAccess(user)) return true
  const keys = aksesAbsenMandiri?.role_keys
  if (!Array.isArray(keys) || keys.length === 0) return true
  const allow = new Set(keys.map((k) => normalizeRoleKey(k)).filter(Boolean))
  if (allow.size === 0) return true
  const raw = Array.isArray(user?.all_roles) ? user.all_roles : []
  const roles = raw.length > 0 ? raw : [user?.role_key, user?.level].filter(Boolean)
  for (const r of roles) {
    const nk = normalizeRoleKey(r)
    if (nk && allow.has(nk)) return true
  }
  return false
}

/**
 * @param {unknown} data
 * @returns {{ role_keys: string[] }}
 */
export function normalizeAksesMandiriFromApi(data) {
  const o = data && typeof data === 'object' ? data : {}
  const inner = o.akses_absen_mandiri
  const rk = inner && typeof inner === 'object' && Array.isArray(inner.role_keys) ? inner.role_keys : []
  return { role_keys: rk.map((k) => normalizeRoleKey(k)).filter(Boolean) }
}
