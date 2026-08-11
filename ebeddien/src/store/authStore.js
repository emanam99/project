import { create } from 'zustand'
import { authAPI } from '../services/api'
import { userHasSuperAdminAccess } from '../utils/roleAccess'

function normalizeUserFromPayload(payload) {
  if (!payload) return null
  const userId = payload.user_id || payload.id
  const base = {
    id: userId,
    users_id: payload.users_id != null ? Number(payload.users_id) : null,
    id_pengurus: payload.id_pengurus ?? (payload.user_id != null ? payload.user_id : null),
    nama: payload.user_name || payload.nama,
    username: payload.username || null,
    nip: payload.pengurus?.nip ?? null,
    role_key: payload.role_key || payload.user_role || payload.level || 'user',
    role_label: payload.role_label || payload.user_role || payload.level || 'user',
    all_roles: payload.all_roles || [payload.role_key || payload.user_role || payload.level || 'user'],
    allowed_apps: payload.allowed_apps || [],
    permissions: payload.permissions || [],
    lembaga_id: payload.lembaga_id ?? null,
    lembaga_scope_all: payload.lembaga_scope_all === true,
    lembaga_ids: Array.isArray(payload.lembaga_ids) ? payload.lembaga_ids.map((x) => String(x)) : [],
    level: (payload.role_key || payload.user_role || payload.level || 'user').toLowerCase(),
    is_real_super_admin: payload.is_real_super_admin === true,
    email: payload.email != null ? String(payload.email).trim() : '',
    email_verified_at: payload.email_verified_at ?? null,
    email_reminder_snoozed_until: payload.email_reminder_snoozed_until ?? null
  }
  if (!base.is_real_super_admin) {
    base.is_real_super_admin = userHasSuperAdminAccess(base)
  }
  return base
}

// Batas umur token login: 5 jam dari terakhir digunakan (sliding). Lewat = harus login lagi.
const AUTH_TOKEN_MAX_AGE_MS = 5 * 60 * 60 * 1000

function getAuthLastUsedAt() {
  try {
    const v = localStorage.getItem('auth_last_used_at')
    return v ? parseInt(v, 10) : null
  } catch {
    return null
  }
}

export const useAuthStore = create((set, get) => ({
  token: null,
  user: null,
  isAuthenticated: false,
  /** Menu navigasi dari GET /v2/me/fitur-menu; kosong = susun dari katalog DB + kode user */
  fiturMenuFromApi: null,
  /** Semua baris menu eBeddien dari GET /v2/fitur/ebeddien/menu-catalog */
  fiturMenuCatalog: null,
  fiturMenuCodes: [],
  fiturMenuFetchStatus: 'idle',
  fiturMenuCatalogFetchStatus: 'idle',
  /** Modal pengingat daftar passkey setelah login password (interval dari server). */
  passkeyPromptOpen: false,
  setPasskeyPromptOpen: (open) => set({ passkeyPromptOpen: !!open }),
  /** Tutup modal email (tanpa snooze 1 tahun) sampai login berikutnya. */
  emailReminderSessionDismissed: false,
  dismissEmailReminderSession: () => set({ emailReminderSessionDismissed: true }),

  fetchFiturMenu: async (options = {}) => {
    const { background = false } = options
    const tokenAtStart = localStorage.getItem('auth_token')
    if (!tokenAtStart) {
      set({ fiturMenuFromApi: null, fiturMenuCodes: [], fiturMenuFetchStatus: 'idle' })
      return
    }
    const prevStatus = get().fiturMenuFetchStatus
    if (!background || prevStatus === 'idle') {
      set({ fiturMenuFetchStatus: 'loading' })
    }
    try {
      const res = await authAPI.getMyFiturMenu({ app_key: 'ebeddien', types: 'menu,action' })
      // Jangan timpa menu jika user sudah ganti akun di laptop bersama.
      if (localStorage.getItem('auth_token') !== tokenAtStart) return
      if (res.success && Array.isArray(res.data?.items) && res.data.items.length > 0) {
        set({
          fiturMenuFromApi: res.data.items,
          fiturMenuCodes: Array.isArray(res.data.codes) ? res.data.codes : [],
          fiturMenuFetchStatus: 'ok'
        })
      } else {
        set({ fiturMenuFromApi: null, fiturMenuCodes: [], fiturMenuFetchStatus: 'ok' })
      }
    } catch (e) {
      if (localStorage.getItem('auth_token') !== tokenAtStart) return
      console.warn('[authStore] fetchFiturMenu:', e)
      set({ fiturMenuFromApi: null, fiturMenuCodes: [], fiturMenuFetchStatus: 'error' })
    }
  },

  fetchFiturMenuCatalog: async () => {
    const tokenAtStart = localStorage.getItem('auth_token')
    if (!tokenAtStart) {
      set({ fiturMenuCatalog: null, fiturMenuCatalogFetchStatus: 'idle' })
      return
    }
    set({ fiturMenuCatalogFetchStatus: 'loading' })
    try {
      const res = await authAPI.getEbeddienMenuCatalog()
      if (localStorage.getItem('auth_token') !== tokenAtStart) return
      if (res.success && Array.isArray(res.data?.items)) {
        set({
          fiturMenuCatalog: res.data.items,
          fiturMenuCatalogFetchStatus: 'ok'
        })
      } else {
        set({ fiturMenuCatalog: [], fiturMenuCatalogFetchStatus: 'ok' })
      }
    } catch (e) {
      if (localStorage.getItem('auth_token') !== tokenAtStart) return
      console.warn('[authStore] fetchFiturMenuCatalog:', e)
      set({ fiturMenuCatalog: null, fiturMenuCatalogFetchStatus: 'error' })
    }
  },

  setAuth: (token, user, refreshToken = null) => {
    localStorage.setItem('auth_token', token)
    const now = Date.now()
    localStorage.setItem('auth_last_used_at', String(now))
    try {
      localStorage.setItem('auth_ever_logged_in', '1')
    } catch {
      /* localStorage tidak tersedia */
    }
    if (refreshToken != null && refreshToken !== '') {
      try {
        localStorage.setItem('refresh_token', refreshToken)
      } catch {
        /* localStorage tidak tersedia */
      }
    }
    if (user) {
      const normalizedUser = normalizeUserFromPayload({
        ...user,
        user_id: user.id,
        users_id: user.users_id,
        user_name: user.nama,
        user_role: user.role_key,
        role_key: user.role_key,
        role_label: user.role_label,
        all_roles: user.all_roles,
        allowed_apps: user.allowed_apps,
        permissions: user.permissions,
        lembaga_id: user.lembaga_id,
        lembaga_scope_all: user.lembaga_scope_all,
        lembaga_ids: user.lembaga_ids
      })
      if (!normalizedUser.is_real_super_admin) {
        normalizedUser.is_real_super_admin = userHasSuperAdminAccess(normalizedUser)
      }
      localStorage.setItem('user_data', JSON.stringify(normalizedUser))
      // Reset menu/sisa state akun lama sebelum fetch milik akun baru.
      set({
        token,
        user: normalizedUser,
        isAuthenticated: true,
        emailReminderSessionDismissed: false,
        passkeyPromptOpen: false,
        fiturMenuFromApi: null,
        fiturMenuCatalog: null,
        fiturMenuCodes: [],
        fiturMenuFetchStatus: 'idle',
        fiturMenuCatalogFetchStatus: 'idle'
      })
      get().fetchFiturMenu().catch(() => {})
      get().fetchFiturMenuCatalog().catch(() => {})
    } else {
      set({ token, user: null, isAuthenticated: true })
    }
  },

  /**
   * Keluar dari aplikasi. Token akses, refresh token, & user_data dihapus seluruhnya
   * (audit Mei 2026): sebelumnya refresh_token & auth_ever_logged_in dipertahankan
   * sehingga bisa di-eksploitasi via XSS untuk re-issue access token.
   * auth_ever_logged_in tetap aman dipertahankan (hanya flag boolean, bukan kredensial).
   */
  logout: () => {
    try { localStorage.removeItem('auth_token') } catch (_) { /* noop */ }
    try { localStorage.removeItem('user_data') } catch (_) { /* noop */ }
    try { localStorage.removeItem('auth_last_used_at') } catch (_) { /* noop */ }
    try { localStorage.removeItem('refresh_token') } catch (_) { /* noop */ }
    set({
      token: null,
      user: null,
      isAuthenticated: false,
      passkeyPromptOpen: false,
      emailReminderSessionDismissed: false,
      fiturMenuFromApi: null,
      fiturMenuCatalog: null,
      fiturMenuCodes: [],
      fiturMenuFetchStatus: 'idle',
      fiturMenuCatalogFetchStatus: 'idle'
    })
  },

  /** Role utama dari token (bisa "multi_role" jika banyak role — jangan dipakai tunggal untuk izin menu). */
  getEffectiveRole: () => {
    const { user } = get()
    return (user?.role_key || user?.level || '').toLowerCase() || null
  },

  /** True jika user punya role super_admin (gabungan all_roles / flag backend). */
  isRealSuperAdmin: () => {
    const { user } = get()
    return userHasSuperAdminAccess(user)
  },

  /** Lembaga ID dari token (gabungan scope dari semua role). */
  getEffectiveLembagaId: () => {
    const { user } = get()
    return user?.lembaga_id ?? null
  },
  
  checkAuth: async () => {
    const token = localStorage.getItem('auth_token')
    const lastUsed = getAuthLastUsedAt()
    if (token && lastUsed != null && (Date.now() - lastUsed) > AUTH_TOKEN_MAX_AGE_MS) {
      localStorage.removeItem('auth_token')
      localStorage.removeItem('user_data')
      localStorage.removeItem('auth_last_used_at')
      set({ token: null, user: null, isAuthenticated: false })
      return
    }
    if (token) {
      const tokenAtStart = token
      let user = null
      let verifyHttpError = false

      // Audit Mei 2026: HARUS verify ke server. Fallback ke decode JWT lokal dihapus
      // karena bisa di-tampering dari sisi klien (revoked / role-demoted tidak terdeteksi).
      try {
        const response = await authAPI.verify()
        if (localStorage.getItem('auth_token') !== tokenAtStart) return
        if (response?.success && response?.data) {
          user = normalizeUserFromPayload(response.data)
          if (user) localStorage.setItem('user_data', JSON.stringify(user))
        }
      } catch (error) {
        if (localStorage.getItem('auth_token') !== tokenAtStart) return
        const status = error?.response?.status
        verifyHttpError = status === 401 || status === 403
      }

      if (verifyHttpError) {
        // Token ditolak server: paksa logout penuh.
        try { localStorage.removeItem('auth_token') } catch (_) { /* noop */ }
        try { localStorage.removeItem('user_data') } catch (_) { /* noop */ }
        try { localStorage.removeItem('auth_last_used_at') } catch (_) { /* noop */ }
        try { localStorage.removeItem('refresh_token') } catch (_) { /* noop */ }
        set({ token: null, user: null, isAuthenticated: false })
        return
      }

      if (localStorage.getItem('auth_token') !== tokenAtStart) return

      // Offline / 5xx: gunakan user_data terakhir agar UI tidak white screen,
      // tapi tidak boleh decode token sendiri.
      if (!user) {
        const savedUser = localStorage.getItem('user_data')
        if (savedUser) {
          try {
            user = JSON.parse(savedUser)
            if (user?.level) user.level = String(user.level).toLowerCase()
          } catch (_) { /* parse error: tetap null */ }
        }
      }

      set({ token: tokenAtStart, user, isAuthenticated: true })
      await Promise.all([
        get().fetchFiturMenu().catch(() => {}),
        get().fetchFiturMenuCatalog().catch(() => {})
      ])
    }
  },
  
  // Helper function untuk cek apakah user bisa akses aplikasi ini (uwaba)
  canAccessApp: (appKey = 'uwaba') => {
    const state = useAuthStore.getState()
    if (!state.user || !state.user.allowed_apps) {
      return false
    }
    return state.user.allowed_apps.includes(appKey)
  },
  
  // Helper function untuk cek permission
  hasPermission: (permission) => {
    const state = useAuthStore.getState()
    if (!state.user || !state.user.permissions) {
      return false
    }
    return state.user.permissions.includes(permission)
  },
  
  // Helper function untuk refresh user data dari API verify
  refreshUserData: async () => {
    const { token } = useAuthStore.getState()
    if (!token) {
      return false
    }
    const tokenAtStart = token

    try {
      const response = await authAPI.verify()
      if (localStorage.getItem('auth_token') !== tokenAtStart) return false

      if (response.success && response.data) {
        const updatedUser = normalizeUserFromPayload(response.data)
        if (updatedUser) {
          localStorage.setItem('user_data', JSON.stringify(updatedUser))
          useAuthStore.setState({ user: updatedUser })
          get().fetchFiturMenu().catch(() => {})
          get().fetchFiturMenuCatalog().catch(() => {})
          return true
        }
      }
    } catch (error) {
      console.error('Error refreshing user data:', error)
    }

    return false
  }
}))

/** Flag sessionStorage: tampilkan modal passkey setelah hard-redirect login. */
export const EBEDDIEN_PASSKEY_PROMPT_FLAG = 'ebeddien_show_passkey_prompt'

/**
 * Laptop bersama / multi-tab: jika tab lain login/logout, muat ulang agar profil tidak campur.
 * Panggil sekali dari App.
 */
export function initAuthCrossTabSync() {
  if (typeof window === 'undefined') return
  if (window.__ebeddienAuthCrossTabSync) return
  window.__ebeddienAuthCrossTabSync = true
  window.addEventListener('storage', (e) => {
    if (e.key !== 'auth_token' && e.key !== 'user_data') return
    // Full reload paling aman: reset semua state React (header foto, query, dll.).
    window.location.reload()
  })
}

