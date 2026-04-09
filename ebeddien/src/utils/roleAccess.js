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

/** Route admin umum: role admin/super_admin atau permission manage_users. */
export function userHasAdminRouteAccess(user) {
  if (!user) return false
  if (userHasSuperAdminAccess(user)) return true
  const perms = user.permissions
  if (Array.isArray(perms) && perms.length > 0 && perms.includes('manage_users')) {
    return true
  }
  return userMatchesAnyAllowedRole(user, ['admin'])
}

/** Cek permission tunggal dari JWT, dengan bypass super_admin secara default. */
export function userHasPermission(user, permission, opts = {}) {
  if (!user || !permission) return false
  const { allowSuperAdmin = true } = opts
  if (allowSuperAdmin && userHasSuperAdminAccess(user)) return true
  const perms = user.permissions
  if (!Array.isArray(perms) || perms.length === 0) return false
  return perms.includes(permission)
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

/** Area pembayaran UWABA (nav utama / redirect) — permission manage_uwaba atau role staff UWABA. */
export function userHasUwabaPaymentNavAccess(user) {
  if (!user) return false
  if (userHasSuperAdminAccess(user)) return true
  const perms = user.permissions
  if (Array.isArray(perms) && perms.length > 0 && perms.includes('manage_uwaba')) {
    return true
  }
  return userMatchesAnyAllowedRole(user, ['admin_uwaba', 'petugas_uwaba'])
}

/** Area PSB (nav utama / redirect) — permission manage_psb atau role PSB. */
export function userHasPsbNavAccess(user) {
  if (!user) return false
  if (userHasSuperAdminAccess(user)) return true
  const perms = user.permissions
  if (Array.isArray(perms) && perms.length > 0 && perms.includes('manage_psb')) {
    return true
  }
  return userMatchesAnyAllowedRole(user, ['admin_psb', 'petugas_psb'])
}

/** Area Umroh — permission manage_umroh atau role umroh. */
export function userHasUmrohNavAccess(user) {
  if (!user) return false
  if (userHasSuperAdminAccess(user)) return true
  const perms = user.permissions
  if (Array.isArray(perms) && perms.length > 0 && perms.includes('manage_umroh')) {
    return true
  }
  return userMatchesAnyAllowedRole(user, ['admin_umroh', 'petugas_umroh'])
}

/** Area Ijin — permission manage_ijin atau role ijin. */
export function userHasIjinNavAccess(user) {
  if (!user) return false
  if (userHasSuperAdminAccess(user)) return true
  const perms = user.permissions
  if (Array.isArray(perms) && perms.length > 0 && perms.includes('manage_ijin')) {
    return true
  }
  return userMatchesAnyAllowedRole(user, ['admin_ijin', 'petugas_ijin'])
}

/** Menu Data Boyong: hanya super_admin atau admin_ijin (bukan petugas_ijin). */
export function userHasIjinBoyongNavAccess(user) {
  if (!user) return false
  return userHasSuperAdminAccess(user) || userMatchesAnyAllowedRole(user, ['admin_ijin'])
}

/**
 * Cocok untuk daftar role route + fallback permission (JWT.permissions dari DB/RoleConfig).
 * Dipakai RoleRoute guard & menu expanded requiresRole.
 */
export function userMatchesAllowedRolesOrPermissions(user, allowedRoles) {
  if (!user || !allowedRoles?.length) return false
  if (userHasSuperAdminAccess(user)) return true
  if (userMatchesAnyAllowedRole(user, allowedRoles)) return true
  const perms = user.permissions
  if (!Array.isArray(perms) || perms.length === 0) return false
  const norm = allowedRoles.map((r) => normalizeRoleKey(r))
  if (norm.some((r) => ['admin_uwaba', 'petugas_uwaba'].includes(r)) && perms.includes('manage_uwaba')) {
    return true
  }
  if (norm.some((r) => ['admin_psb', 'petugas_psb'].includes(r)) && perms.includes('manage_psb')) {
    return true
  }
  if (norm.some((r) => ['admin_ijin', 'petugas_ijin'].includes(r)) && perms.includes('manage_ijin')) {
    return true
  }
  if (norm.some((r) => ['admin_umroh', 'petugas_umroh'].includes(r)) && perms.includes('manage_umroh')) {
    return true
  }
  if (norm.includes('admin_cashless') && perms.includes('manage_users')) {
    return true
  }
  return false
}
