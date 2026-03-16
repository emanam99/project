import { create } from 'zustand'
import { authAPI } from '../services/api'

const STORAGE_NIK_KEY = 'daftar_storage_nik'

/** Hapus semua localStorage dan sessionStorage (dipakai saat logout) */
function clearAllStorage() {
  if (typeof localStorage !== 'undefined') {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i)
      if (k) localStorage.removeItem(k)
    }
  }
  if (typeof sessionStorage !== 'undefined') {
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const k = sessionStorage.key(i)
      if (k) sessionStorage.removeItem(k)
    }
  }
}

/** Hapus hanya data daftar/user (NIK berubah = orang berbeda), tetap pertahankan auth_token & user_data */
function clearDaftarDataOnly() {
  const keep = new Set(['auth_token', 'user_data', 'theme', 'sidebarCollapsed'])
  if (typeof localStorage !== 'undefined') {
    const keys = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && !keep.has(k)) keys.push(k)
    }
    keys.forEach((k) => localStorage.removeItem(k))
  }
  if (typeof sessionStorage !== 'undefined') {
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const k = sessionStorage.key(i)
      if (k) sessionStorage.removeItem(k)
    }
  }
}

/** Pastikan data localStorage dipakai hanya untuk NIK yang sama; jika NIK berubah, bersihkan data orang sebelumnya */
function ensureStorageNik(currentNik) {
  if (!currentNik || String(currentNik).trim() === '') return
  const nik = String(currentNik).trim()
  const stored = localStorage.getItem(STORAGE_NIK_KEY)
  if (stored != null && stored !== nik) {
    clearDaftarDataOnly()
  }
  try {
    localStorage.setItem(STORAGE_NIK_KEY, nik)
  } catch (e) { /* ignore */ }
}

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

export const useAuthStore = create((set) => ({
  token: null,
  user: null,
  isAuthenticated: false,
  
  setAuth: (token, user) => {
    if (user?.nik) {
      ensureStorageNik(user.nik)
    }
    localStorage.setItem('auth_token', token)
    if (user) {
      const normalizedUser = {
        id: user.id,
        nama: user.nama,
        nik: user.nik,
        role_key: user.role_key || 'user',
        role_label: user.role_label || 'user',
        allowed_apps: user.allowed_apps || [],
        permissions: user.permissions || []
      }
      localStorage.setItem('user_data', JSON.stringify(normalizedUser))
      set({ 
        token, 
        user: normalizedUser, 
        isAuthenticated: true 
      })
    } else {
      set({ 
        token, 
        user: null, 
        isAuthenticated: true 
      })
    }
  },
  
  logout: () => {
    clearAllStorage()
    set({ 
      token: null, 
      user: null, 
      isAuthenticated: false 
    })
  },
  
  checkAuth: async () => {
    const token = localStorage.getItem('auth_token')
    if (token) {
      let user = null
      
      try {
        const response = await authAPI.verify()
        
        if (response.success && response.data) {
          const payload = response.data
          user = {
            id: payload.user_id || payload.id,
            nama: payload.user_name || payload.nama,
            nik: payload.nik || null,
            role_key: payload.role_key || 'user',
            role_label: payload.role_label || 'user',
            allowed_apps: payload.allowed_apps || [],
            permissions: payload.permissions || []
          }
          localStorage.setItem('user_data', JSON.stringify(user))
        }
      } catch (error) {
        console.error('Error verifying token, falling back to token decode:', error)
      }
      
      if (!user) {
        const decoded = decodeJWT(token)
        if (decoded) {
          const payload = decoded.data || decoded
          user = {
            id: payload.user_id || payload.id,
            nama: payload.user_name || payload.nama,
            nik: payload.nik || null,
            role_key: payload.role_key || 'user',
            role_label: payload.role_label || 'user',
            allowed_apps: payload.allowed_apps || [],
            permissions: payload.permissions || []
          }
        }
      }
      
      if (!user) {
        const savedUser = localStorage.getItem('user_data')
        if (savedUser) {
          try {
            user = JSON.parse(savedUser)
          } catch (e) {
            console.error('Error parsing saved user data:', e)
          }
        }
      }

      // Jika user dari verify/decode tidak punya NIK, pertahankan dari localStorage atau sessionStorage (aplikasi daftar)
      const hasNik = user && (user.nik != null && String(user.nik).trim() !== '')
      if (user && !hasNik) {
        try {
          const saved = localStorage.getItem('user_data')
          if (saved) {
            const parsed = JSON.parse(saved)
            if (parsed.nik != null && String(parsed.nik).trim() !== '') {
              user = { ...user, nik: parsed.nik }
            }
          }
          if ((!user.nik || String(user.nik).trim() === '') && typeof sessionStorage !== 'undefined') {
            const sessionNik = sessionStorage.getItem('daftar_login_nik')
            if (sessionNik && sessionNik.trim() !== '') {
              user = { ...user, nik: sessionNik.trim() }
            }
          }
        } catch (e) { /* ignore */ }
      }

      // NIK berubah = orang berbeda: bersihkan data daftar milik NIK sebelumnya
      if (user?.nik) {
        ensureStorageNik(user.nik)
      }
      
      set({ 
        token, 
        user,
        isAuthenticated: true 
      })
    }
  }
}))
