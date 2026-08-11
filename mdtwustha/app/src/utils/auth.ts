export type AuthUser = {
  id: string
  nip?: string
  name?: string
  jabatan?: string
  akses?: string
}

export const AUTH_STORAGE_KEY = 'mdtwustha_user'
export const AUTH_ACTIVITY_KEY = 'mdtwustha_session_activity'

/** Idle maksimal tanpa aktivitas sebelum wajib login ulang. */
export const SESSION_IDLE_MS = 5 * 60 * 60 * 1000 // 5 jam

/** Throttle tulis aktivitas ke storage. */
const ACTIVITY_WRITE_THROTTLE_MS = 30_000

let memoryLastActive = 0
let lastWriteAt = 0

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0
}

/** Validasi objek user dari storage / response login. */
export function isValidAuthUser(value: unknown): value is AuthUser {
  if (!value || typeof value !== 'object') return false
  const u = value as Record<string, unknown>
  return isNonEmptyString(u.id) && isNonEmptyString(u.nip)
}

function readActivityAt(): number {
  try {
    const raw = localStorage.getItem(AUTH_ACTIVITY_KEY)
    if (!raw) return 0
    const n = Number(raw)
    return Number.isFinite(n) && n > 0 ? n : 0
  } catch {
    return 0
  }
}

function writeActivityAt(ts: number): void {
  try {
    localStorage.setItem(AUTH_ACTIVITY_KEY, String(ts))
  } catch (_) {}
}

export function getLastActiveAt(): number {
  return Math.max(memoryLastActive, readActivityAt())
}

export function isSessionExpired(): boolean {
  const last = getLastActiveAt()
  if (!last) return true
  return Date.now() - last > SESSION_IDLE_MS
}

/**
 * Perbarui waktu aktivitas terakhir (throttle).
 * Dipanggil saat interaksi pengguna / navigasi.
 */
export function touchSessionActivity(force = false): void {
  try {
    if (!localStorage.getItem(AUTH_STORAGE_KEY)) return
  } catch {
    return
  }

  const now = Date.now()
  memoryLastActive = now
  if (!force && now - lastWriteAt < ACTIVITY_WRITE_THROTTLE_MS) return
  lastWriteAt = now
  writeActivityAt(now)
}

function ensureActivityStamp(): void {
  if (readActivityAt() > 0 || memoryLastActive > 0) return
  // Sesi lama tanpa stamp: mulai hitung idle dari sekarang
  const now = Date.now()
  memoryLastActive = now
  lastWriteAt = now
  writeActivityAt(now)
}

export function getStoredUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (!isValidAuthUser(parsed)) {
      clearSession()
      return null
    }
    ensureActivityStamp()
    if (isSessionExpired()) {
      clearSession()
      return null
    }
    return {
      id: String(parsed.id),
      nip: parsed.nip,
      name: parsed.name,
      jabatan: parsed.jabatan,
      akses: parsed.akses,
    }
  } catch {
    clearSession()
    return null
  }
}

export function isLoggedIn(): boolean {
  return getStoredUser() !== null
}

export function saveSession(user: AuthUser): void {
  if (!isValidAuthUser(user)) return
  try {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user))
    const now = Date.now()
    memoryLastActive = now
    lastWriteAt = now
    writeActivityAt(now)
  } catch (_) {}
}

export function clearSession(): void {
  memoryLastActive = 0
  lastWriteAt = 0
  try {
    localStorage.removeItem(AUTH_STORAGE_KEY)
    localStorage.removeItem(AUTH_ACTIVITY_KEY)
  } catch (_) {}
}
