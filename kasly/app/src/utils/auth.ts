export type UserRole = 'super_admin' | 'admin' | 'user' | 'pending'

export type TransaksiJenis = 'masuk' | 'keluar'

export type AuthUser = {
  id: number
  email: string
  name: string | null
  picture: string | null
  role: UserRole
}

export const AUTH_TOKEN_KEY = 'kasly_token'
export const AUTH_USER_KEY = 'kasly_user'

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

export function canManageData(role?: string | null): boolean {
  return isAdminRole(role)
}

export function isPendingRole(role?: string | null): boolean {
  return role === 'pending'
}

export function hasAppAccess(role?: string | null): boolean {
  return role === 'super_admin' || role === 'admin' || role === 'user'
}

export function jenisFromPath(pathname: string): TransaksiJenis {
  return pathname.startsWith('/masuk') ? 'masuk' : 'keluar'
}

export function jenisBase(jenis: TransaksiJenis): string {
  return jenis === 'masuk' ? '/masuk' : '/keluar'
}

export function jenisLabel(jenis: TransaksiJenis, opts?: { short?: boolean }): string {
  if (opts?.short) return jenis === 'masuk' ? 'Masuk' : 'Keluar'
  return jenis === 'masuk' ? 'Uang masuk' : 'Belanja'
}
