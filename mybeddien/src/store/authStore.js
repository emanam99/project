import { create } from 'zustand'
import { authAPI } from '../services/api'

export const useAuthStore = create((set) => ({
  token: null,
  user: null,
  isAuthenticated: false,

  setAuth: (token, user) => {
    localStorage.setItem('auth_token', token)
    if (user) {
      const normalizedUser = {
        id: user.id,
        santri_id: user.santri_id ?? null,
        nama: user.nama,
        username: user.username || null,
        role_key: user.role_key || user.level || 'user',
        role_label: user.role_label || user.level || 'user',
        allowed_apps: user.allowed_apps || [],
        permissions: user.permissions || [],
        has_toko: user.has_toko ?? false,
        toko_id: user.toko_id ?? null,
        toko_nama: user.toko_nama ?? '',
        grup_akses: Array.isArray(user.grup_akses) ? user.grup_akses : [],
      }
      localStorage.setItem('user_data', JSON.stringify(normalizedUser))
      set({ token, user: normalizedUser, isAuthenticated: true })
    } else {
      set({ token, user: null, isAuthenticated: true })
    }
  },

  logout: () => {
    authAPI.logout()
    set({ token: null, user: null, isAuthenticated: false })
  },

  checkAuth: async () => {
    const token = localStorage.getItem('auth_token')
    if (!token) {
      set({ token: null, user: null, isAuthenticated: false })
      return
    }
    try {
      const response = await authAPI.verifyMybeddian()
      if (response.success && response.data) {
        const u = response.data
        const stored = (() => {
          try {
            const raw = localStorage.getItem('user_data')
            return raw ? JSON.parse(raw) : null
          } catch (_) { return null }
        })()
        const user = {
          id: u.id,
          santri_id: u.santri_id ?? stored?.santri_id ?? null,
          nama: u.nama,
          username: u.username || null,
          role_key: u.role_key || u.level || 'user',
          role_label: u.role_label || u.level || 'user',
          allowed_apps: u.allowed_apps || [],
          permissions: u.permissions || [],
          has_toko: u.has_toko ?? stored?.has_toko ?? false,
          toko_id: u.toko_id ?? stored?.toko_id ?? null,
          toko_nama: u.toko_nama ?? stored?.toko_nama ?? '',
          grup_akses: Array.isArray(u.grup_akses)
            ? u.grup_akses
            : Array.isArray(stored?.grup_akses)
              ? stored.grup_akses
              : [],
        }
        localStorage.setItem('user_data', JSON.stringify(user))
        set({ token, user, isAuthenticated: true })
        return
      }
    } catch (_) {}
    localStorage.removeItem('auth_token')
    localStorage.removeItem('user_data')
    set({ token: null, user: null, isAuthenticated: false })
  },
}))
