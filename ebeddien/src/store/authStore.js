import { create } from 'zustand'
import { authAPI } from '../services/api'
import { userHasSuperAdminAccess } from '../utils/roleAccess'

// Helper function to decode JWT token
const decodeJWT = (token) => {
  try {
    const base64Url = token.split('.')[1]
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/')
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    )
    return JSON.parse(jsonPayload)
  } catch (error) {
    console.error('Error decoding JWT:', error)
    return null
  }
}

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
    is_real_super_admin: payload.is_real_super_admin === true
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
  /** Modal pengingat daftar passkey setelah login password (interval dari server). */
  passkeyPromptOpen: false,
  setPasskeyPromptOpen: (open) => set({ passkeyPromptOpen: !!open }),

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
      set({ token, user: normalizedUser, isAuthenticated: true })
    } else {
      set({ token, user: null, isAuthenticated: true })
    }
  },

  /** Keluar dari aplikasi. Token akses & user_data dihapus; refresh_token & auth_ever_logged_in tetap agar kalender/tool gratis tetap bisa diakses. */
  logout: () => {
    localStorage.removeItem('auth_token')
    localStorage.removeItem('user_data')
    localStorage.removeItem('auth_last_used_at')
    set({ token: null, user: null, isAuthenticated: false, passkeyPromptOpen: false })
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
      let user = null
      
      // Try to refresh user data from API verify (to get latest all_roles)
      try {
        const response = await authAPI.verify()
        if (response.success && response.data) {
          user = normalizeUserFromPayload(response.data)
          if (user) localStorage.setItem('user_data', JSON.stringify(user))
        }
      } catch (error) {
        console.error('Error verifying token, falling back to token decode:', error)
      }

      if (!user) {
        const decoded = decodeJWT(token)
        if (decoded) {
          const payload = decoded.data || decoded
          user = normalizeUserFromPayload(payload)
        }
      }

      if (!user) {
        const savedUser = localStorage.getItem('user_data')
        if (savedUser) {
          try {
            user = JSON.parse(savedUser)
            if (user.level) user.level = user.level.toLowerCase()
          } catch (e) {
            console.error('Error parsing saved user data:', e)
          }
        }
      }

      set({ token, user, isAuthenticated: true })
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
    
    try {
      const response = await authAPI.verify()
      
      if (response.success && response.data) {
        const updatedUser = normalizeUserFromPayload(response.data)
        if (updatedUser) {
          localStorage.setItem('user_data', JSON.stringify(updatedUser))
          useAuthStore.setState({ user: updatedUser })
          return true
        }
      }
    } catch (error) {
      console.error('Error refreshing user data:', error)
    }
    
    return false
  }
}))

