import { create } from 'zustand'
import { authAPI, resetCsrfToken } from '../services/api'
import { ensureStorageNik, normalizeNisForStorage } from '../utils/clientStorage'
import { performLogoutCleanup } from '../utils/logoutSession'

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
        nis: user.nis != null && String(user.nis).trim() !== '' ? String(user.nis).trim() : null,
        id_registrasi: user.id_registrasi != null && user.id_registrasi !== '' ? Number(user.id_registrasi) : null,
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
  
  logout: async () => {
    resetCsrfToken()
    await performLogoutCleanup()
    set({
      token: null,
      user: null,
      isAuthenticated: false,
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
            nis: normalizeNisForStorage(payload.nis ?? payload.NIS),
            id_registrasi: payload.id_registrasi != null && payload.id_registrasi !== '' ? Number(payload.id_registrasi) : null,
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
            nis: normalizeNisForStorage(payload.nis ?? payload.NIS),
            id_registrasi: payload.id_registrasi != null && payload.id_registrasi !== '' ? Number(payload.id_registrasi) : null,
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
            {
              const mergedNis = normalizeNisForStorage(parsed.nis)
              if ((user.nis == null || String(user.nis).trim() === '') && mergedNis) {
                user = { ...user, nis: mergedNis }
              }
            }
            if ((user.id_registrasi == null || Number.isNaN(user.id_registrasi)) && parsed.id_registrasi != null && parsed.id_registrasi !== '') {
              user = { ...user, id_registrasi: Number(parsed.id_registrasi) }
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
