/**
 * Hak akses = gabungan semua role (all_roles + role_key utama).
 * Backend mengirim role_key "multi_role" bila banyak role; jangan mengandalkan satu string itu untuk izin.
 */

export function normalizeRoleKey(r) {
  return String(r || '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '_')
}

export function getUserRoleKeysLower(user) {
  if (!user) return []
  const out = new Set()
  if (user.all_roles && Array.isArray(user.all_roles) && user.all_roles.length > 0) {
    user.all_roles.forEach((r) => {
      const k = normalizeRoleKey(r)
      if (k) out.add(k)
    })
  }
  const primary = normalizeRoleKey(user.role_key || user.user_role || user.level)
  if (primary) out.add(primary)
  return [...out]
}

export function userMatchesAnyAllowedRole(user, allowedRoles) {
  if (!user || !allowedRoles?.length) return false
  const normalized = allowedRoles.map((r) => normalizeRoleKey(r))
  const keys = getUserRoleKeysLower(user)
  return keys.some((k) => normalized.includes(k))
}

/** Punya role super_admin di gabungan role, atau flag eksplisit dari backend. */
export function userHasSuperAdminAccess(user) {
  if (!user) return false
  if (user.is_real_super_admin === true) return true
  return getUserRoleKeysLower(user).includes('super_admin')
}

export function userHasAnyAdminCap(user) {
  if (!user) return false
  if (userHasSuperAdminAccess(user)) return true
  const keys = getUserRoleKeysLower(user)
  return keys.some((k) =>
    ['admin', 'admin_uwaba', 'admin_psb', 'admin_lembaga'].includes(k)
  )
}

/**
 * Hak kelola PSB (Data Pendaftar, scope formal/diniyah, dll.).
 * Sumber utama: array `permissions` di JWT — gabungan per role dari tabel `role.permissions_json` atau RoleConfig API.
 * Fallback: role key admin_psb / petugas_psb jika token lama tanpa permissions.
 */
export function userHasManagePsbPermission(user) {
  if (!user) return false
  const perms = user.permissions
  if (Array.isArray(perms) && perms.length > 0) {
    return perms.includes('manage_psb')
  }
  return userMatchesAnyAllowedRole(user, ['admin_psb', 'petugas_psb'])
}
