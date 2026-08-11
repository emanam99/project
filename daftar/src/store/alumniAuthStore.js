import { create } from 'zustand'

const TOKEN_KEY = 'alumni_auth_token'
const USER_KEY = 'alumni_user_data'

function normalizeUser(user) {
  if (!user) return null
  return {
    id: user.id ?? user.alumni_id ?? null,
    alumni_id: user.alumni_id ?? user.id ?? null,
    id_alumni: user.id_alumni != null ? Number(user.id_alumni) : null,
    nama: user.nama || '',
    nik: user.nik || '',
    gender: user.gender ?? null,
    tanggal_lahir: user.tanggal_lahir ?? null,
    tempat_lahir: user.tempat_lahir ?? null,
    role_key: 'alumni',
    role_label: 'Alumni',
    allowed_apps: user.allowed_apps || ['daftar'],
    registered: user.registered === true,
  }
}

export const useAlumniAuthStore = create((set) => ({
  token: typeof localStorage !== 'undefined' ? localStorage.getItem(TOKEN_KEY) : null,
  user: (() => {
    try {
      const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(USER_KEY) : null
      return raw ? normalizeUser(JSON.parse(raw)) : null
    } catch {
      return null
    }
  })(),
  isAuthenticated: typeof localStorage !== 'undefined' ? !!localStorage.getItem(TOKEN_KEY) : false,

  setAuth: (token, user) => {
    const normalized = normalizeUser(user)
    localStorage.setItem(TOKEN_KEY, token)
    if (normalized) {
      localStorage.setItem(USER_KEY, JSON.stringify(normalized))
    }
    set({
      token,
      user: normalized,
      isAuthenticated: true,
    })
  },

  clearAuth: () => {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
    set({
      token: null,
      user: null,
      isAuthenticated: false,
    })
  },

  hydrate: () => {
    const token = localStorage.getItem(TOKEN_KEY)
    let user = null
    try {
      const raw = localStorage.getItem(USER_KEY)
      user = raw ? normalizeUser(JSON.parse(raw)) : null
    } catch {
      user = null
    }
    set({
      token,
      user,
      isAuthenticated: !!token,
    })
  },
}))
