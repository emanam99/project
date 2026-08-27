export type UserRole = 'super_admin' | 'admin' | 'user' | 'pending'

export type AuthUser = {
  id: number
  email: string
  name: string | null
  picture: string | null
  role: UserRole
  pelanggan_id?: number | null
  pelanggan_nama?: string | null
}

export const AUTH_TOKEN_KEY = 'wifi_token'
export const AUTH_USER_KEY = 'wifi_user'

export function getToken(): string | null {
  return localStorage.getItem(AUTH_TOKEN_KEY)
}

export function getStoredUser(): AuthUser | null {
  const raw = localStorage.getItem(AUTH_USER_KEY)
  if (!raw) return null
  try {
    const user = JSON.parse(raw) as AuthUser
    if (!user?.id || !user?.email) return null
    return user
  } catch {
    return null
  }
}

export function saveSession(token: string, user: AuthUser): void {
  localStorage.setItem(AUTH_TOKEN_KEY, token)
  localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user))
}

export function clearSession(): void {
  localStorage.removeItem(AUTH_TOKEN_KEY)
  localStorage.removeItem(AUTH_USER_KEY)
}

export function isLoggedIn(): boolean {
  return Boolean(getToken() && getStoredUser())
}

export function isAdminRole(role?: string | null): boolean {
  return role === 'admin' || role === 'super_admin'
}

export function isSuperAdminRole(role?: string | null): boolean {
  return role === 'super_admin'
}

/** Admin/super_admin: kelola data. User: hanya lihat. */
export function canManageData(role?: string | null): boolean {
  return isAdminRole(role)
}

export function isPortalUser(role?: string | null): boolean {
  return role === 'user'
}

export function isPendingRole(role?: string | null): boolean {
  return role === 'pending'
}

export function hasAppAccess(role?: string | null): boolean {
  return role === 'super_admin' || role === 'admin' || role === 'user'
}

export function homePathForRole(role?: string | null): string {
  if (role === 'user') return '/saya'
  return '/dashboard'
}
