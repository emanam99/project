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

export const useAuthStore = create((set) => ({
  token: null,
  user: null,
  isAuthenticated: false,
  
  setAuth: (token, user) => {
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
    localStorage.removeItem('auth_token')
    localStorage.removeItem('user_data')
    localStorage.removeItem('daftar_status_pendaftar')
    localStorage.removeItem('daftar_diniyah')
    localStorage.removeItem('daftar_formal')
    localStorage.removeItem('daftar_status_santri')
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem('redirect_after_login')
      sessionStorage.removeItem('pendaftaranData')
      sessionStorage.removeItem('daftar_login_nik')
    }
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
      
      set({ 
        token, 
        user,
        isAuthenticated: true 
      })
    }
  }
}))
