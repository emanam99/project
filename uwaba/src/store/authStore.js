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
    // Normalize user data and store in localStorage as backup
    if (user) {
      const normalizedUser = {
        id: user.id,
        nama: user.nama,
        username: user.username || null,
        nip: user.pengurus?.nip ?? null, // NIP dari tabel pengurus
        // Role data baru
        role_key: user.role_key || user.level || 'user',
        role_label: user.role_label || user.level || 'user',
        all_roles: user.all_roles || [user.role_key || user.level || 'user'], // Array semua role keys
        allowed_apps: user.allowed_apps || [],
        permissions: user.permissions || [],
        lembaga_id: user.lembaga_id || null,
        // Backward compatibility
        level: (user.role_key || user.level || 'user').toLowerCase()
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
      
      // Try to refresh user data from API verify (to get latest all_roles)
      try {
        const response = await authAPI.verify()
        
        if (response.success && response.data) {
          const payload = response.data
          user = {
            id: payload.user_id || payload.id,
            nama: payload.user_name || payload.nama,
            username: payload.username || null,
            nip: payload.pengurus?.nip ?? null, // NIP dari tabel pengurus
            // Role data baru dari API verify (terbaru dari database)
            role_key: payload.role_key || payload.user_role || payload.level || 'user',
            role_label: payload.role_label || payload.user_role || payload.level || 'user',
            all_roles: payload.all_roles || [payload.role_key || payload.user_role || payload.level || 'user'], // Array semua role keys
            allowed_apps: payload.allowed_apps || [],
            permissions: payload.permissions || [],
            lembaga_id: payload.lembaga_id || null,
            // Backward compatibility
            level: (payload.role_key || payload.user_role || payload.level || 'user').toLowerCase()
          }
          
          // Update localStorage dengan data terbaru
          localStorage.setItem('user_data', JSON.stringify(user))
        }
      } catch (error) {
        console.error('Error verifying token, falling back to token decode:', error)
      }
      
      // Fallback: Try to get user from JWT token if API verify fails
      if (!user) {
        const decoded = decodeJWT(token)
        if (decoded) {
          // JWT payload is stored in 'data' property
          const payload = decoded.data || decoded
          user = {
            id: payload.user_id || payload.id,
            nama: payload.user_name || payload.nama,
            username: payload.username || null,
            nip: payload.pengurus?.nip ?? null, // NIP dari tabel pengurus
            // Role data baru dari token
            role_key: payload.role_key || payload.user_role || payload.level || 'user',
            role_label: payload.role_label || payload.user_role || payload.level || 'user',
            all_roles: payload.all_roles || [payload.role_key || payload.user_role || payload.level || 'user'], // Array semua role keys
            allowed_apps: payload.allowed_apps || [],
            permissions: payload.permissions || [],
            lembaga_id: payload.lembaga_id || null,
            // Backward compatibility
            level: (payload.role_key || payload.user_role || payload.level || 'user').toLowerCase()
          }
        }
      }
      
      // Fallback: try to get from localStorage if JWT decode fails
      if (!user) {
        const savedUser = localStorage.getItem('user_data')
        if (savedUser) {
          try {
            user = JSON.parse(savedUser)
            // Normalize level to lowercase
            if (user.level) {
              user.level = user.level.toLowerCase()
            }
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
        const payload = response.data
        const updatedUser = {
          id: payload.user_id || payload.id,
          nama: payload.user_name || payload.nama,
          username: payload.username || null,
          nip: payload.pengurus?.nip ?? null, // NIP dari tabel pengurus
          role_key: payload.role_key || payload.user_role || payload.level || 'user',
          role_label: payload.role_label || payload.user_role || payload.level || 'user',
          all_roles: payload.all_roles || [payload.role_key || payload.user_role || payload.level || 'user'],
          allowed_apps: payload.allowed_apps || [],
          permissions: payload.permissions || [],
          lembaga_id: payload.lembaga_id || null,
          level: (payload.role_key || payload.user_role || payload.level || 'user').toLowerCase()
        }
        
        // Update localStorage
        localStorage.setItem('user_data', JSON.stringify(updatedUser))
        
        // Update state
        useAuthStore.setState({ user: updatedUser })
        
        return true
      }
    } catch (error) {
      console.error('Error refreshing user data:', error)
    }
    
    return false
  }
}))

