export type UserRole =
  | 'platform_admin'
  | 'super_admin'
  | 'admin_approve'
  | 'admin_maker'
  | 'admin'
  | 'user'
  | 'pending'

export type BelanjaBniStatus = 'belum' | 'maker' | 'approved'
export type BelanjaCairStatus = 'jatim' | 'cair'
export type RekeningJenis = 'va' | 'rek'

export type AuthUser = {
  id: number
  sppg_id?: number
  email: string
  name: string | null
  picture: string | null
  role: UserRole
}

export type SppgProfile = {
  id: number
  public_id: string
  slug: string
  subdomain?: string | null
  tenant_url?: string | null
  nama_unit: string
  nama_yayasan: string
  alamat?: string | null
  telepon?: string | null
  email_kontak?: string | null
  status: string
  pwa_short_name?: string | null
  pwa_logo_url?: string | null
}

export type SubscriptionInfo = {
  id: number
  plan_code: string
  amount: number
  currency: string
  status: string
  period_start?: string | null
  period_end?: string | null
  invoice_url?: string | null
}

export type SessionContext = {
  sppg?: SppgProfile | null
  subscription?: SubscriptionInfo | null
  subscription_active?: boolean
}

export const AUTH_TOKEN_KEY = 'sppg_token'
export const AUTH_USER_KEY = 'sppg_user'
export const SESSION_CONTEXT_KEY = 'sppg_context'

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

export function saveSession(token: string, user: AuthUser, context?: SessionContext): void {
  localStorage.setItem(AUTH_TOKEN_KEY, token)
  localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user))
  if (context) {
    localStorage.setItem(SESSION_CONTEXT_KEY, JSON.stringify(context))
  }
}

export function getSessionContext(): SessionContext | null {
  const raw = localStorage.getItem(SESSION_CONTEXT_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as SessionContext
  } catch {
    return null
  }
}

export function isSubscriptionActive(): boolean {
  const ctx = getSessionContext()
  if (ctx?.subscription_active === false) return false
  return ctx?.subscription_active !== false
}

export function clearSession(): void {
  localStorage.removeItem(AUTH_TOKEN_KEY)
  localStorage.removeItem(AUTH_USER_KEY)
  localStorage.removeItem(SESSION_CONTEXT_KEY)
}

export function isLoggedIn(): boolean {
  return Boolean(getToken() && getStoredUser())
}

export function isAdminRole(role?: string | null): boolean {
  return (
    role === 'admin' ||
    role === 'admin_maker' ||
    role === 'admin_approve' ||
    role === 'super_admin'
  )
}

export function isPlatformAdminRole(role?: string | null): boolean {
  return role === 'platform_admin'
}

export function isSuperAdminRole(role?: string | null): boolean {
  return role === 'super_admin'
}

/** Semua jenis admin: boleh kelola belanja/rekening (dengan batasan status). */
export function canManageData(role?: string | null): boolean {
  return isAdminRole(role)
}

/** Boleh ubah status BNI (bukan admin biasa). */
export function canChangeBniStatus(role?: string | null): boolean {
  return role === 'admin_maker' || role === 'admin_approve' || role === 'super_admin'
}

/** Hanya super_admin boleh ubah Jatim/Cair. */
export function canChangeCairStatus(role?: string | null): boolean {
  return role === 'super_admin'
}

export function isBniLocked(status?: string | null): boolean {
  return status === 'maker' || status === 'approved'
}

export function bniStatusRank(status: string): number {
  if (status === 'belum') return 0
  if (status === 'maker') return 1
  if (status === 'approved') return 2
  return -1
}

/** Apakah role boleh set status target dari status saat ini. */
export function canSetBniStatus(
  role: string | null | undefined,
  from: string,
  to: BelanjaBniStatus,
): boolean {
  if (!canChangeBniStatus(role)) return false
  const fromRank = bniStatusRank(from || 'belum')
  const toRank = bniStatusRank(to)
  if (fromRank < 0 || toRank < 0 || toRank <= fromRank) return false
  if (role === 'admin_maker') return from === 'belum' && to === 'maker'
  if (role === 'admin_approve') return from === 'maker' && to === 'approved'
  return true // super_admin: maju saja
}

export function isPendingRole(role?: string | null): boolean {
  return role === 'pending'
}

/** Role yang boleh memakai fitur aplikasi. */
export function hasAppAccess(role?: string | null): boolean {
  return (
    role === 'super_admin' ||
    role === 'admin_approve' ||
    role === 'admin_maker' ||
    role === 'admin' ||
    role === 'user'
  )
}
