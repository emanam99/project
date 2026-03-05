import { create } from 'zustand'
import { authAPI } from '../services/api'

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
  return {
    id: payload.user_id || payload.id,
    nama: payload.user_name || payload.nama,
    username: payload.username || null,
    nip: payload.pengurus?.nip ?? null,
    role_key: payload.role_key || payload.user_role || payload.level || 'user',
    role_label: payload.role_label || payload.user_role || payload.level || 'user',
    all_roles: payload.all_roles || [payload.role_key || payload.user_role || payload.level || 'user'],
    allowed_apps: payload.allowed_apps || [],
    permissions: payload.permissions || [],
    lembaga_id: payload.lembaga_id ?? null,
    level: (payload.role_key || payload.user_role || payload.level || 'user').toLowerCase(),
    is_real_super_admin: payload.is_real_super_admin === true,
    view_as_active: payload.view_as_active === true
  }
}

export const useAuthStore = create((set, get) => ({
  token: null,
  user: null,
  isAuthenticated: false,

  setAuth: (token, user) => {
    localStorage.setItem('auth_token', token)
    if (user) {
      const normalizedUser = normalizeUserFromPayload({
        ...user,
        user_id: user.id,
        user_name: user.nama,
        user_role: user.role_key,
        role_key: user.role_key,
        role_label: user.role_label,
        all_roles: user.all_roles,
        allowed_apps: user.allowed_apps,
        permissions: user.permissions,
        lembaga_id: user.lembaga_id
      })
      if (!normalizedUser.is_real_super_admin) {
        normalizedUser.is_real_super_admin = (user.role_key || user.level || '').toLowerCase() === 'super_admin'
      }
      localStorage.setItem('user_data', JSON.stringify(normalizedUser))
      set({ token, user: normalizedUser, isAuthenticated: true })
    } else {
      set({ token, user: null, isAuthenticated: true })
    }
  },

  logout: () => {
    localStorage.removeItem('auth_token')
    localStorage.removeItem('user_data')
    set({ token: null, user: null, isAuthenticated: false })
  },

  /** Super admin: set "coba sebagai" role + lembaga di backend, lalu refresh user dari verify. */
  setViewAsRole: async (roleKey, lembagaId = null) => {
    try {
      await authAPI.setViewAs(roleKey || null, lembagaId)
      return get().refreshUserData()
    } catch (err) {
      console.error('setViewAsRole error:', err)
      return false
    }
  },

  /** Set hanya lembaga saat sudah dalam mode view-as (role tetap, lembaga diubah). */
  setViewAsLembagaId: async (lembagaId) => {
    const { user } = get()
    const roleKey = user?.view_as_active ? user?.role_key : null
    if (!roleKey) return false
    try {
      await authAPI.setViewAs(roleKey, lembagaId)
      return get().refreshUserData()
    } catch (err) {
      console.error('setViewAsLembagaId error:', err)
      return false
    }
  },

  /** Super admin: clear "coba sebagai" di backend, lalu refresh user. */
  clearViewAsRole: async () => {
    try {
      await authAPI.setViewAs(null)
      return get().refreshUserData()
    } catch (err) {
      console.error('clearViewAsRole error:', err)
      return false
    }
  },

  /** Role efektif (dari backend; sudah termasuk "view as" jika aktif). */
  getEffectiveRole: () => {
    const { user } = get()
    return (user?.role_key || user?.level || '').toLowerCase() || null
  },

  /** True jika user asli adalah super_admin (backend mengirim is_real_super_admin). */
  isRealSuperAdmin: () => {
    const { user } = get()
    return user?.is_real_super_admin === true
  },

  /** Lembaga ID efektif (dari backend; sudah termasuk "view as" jika aktif). */
  getEffectiveLembagaId: () => {
    const { user } = get()
    return user?.lembaga_id ?? null
  },
  
  checkAuth: async () => {
    const token = localStorage.getItem('auth_token')
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

