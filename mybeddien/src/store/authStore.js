import { create } from 'zustand'
import { authAPI } from '../services/api'
import { writeStoredAccessPick } from '../config/accessStorage'
import { isValidAccessModeForUser, resolveInitialActiveAccess } from '../config/accessMode'
import { clearPjgtCache } from '../utils/pjgtCacheStorage'
import { clearSantriCache } from '../utils/santriCacheStorage'
import { clearPwaApiCache } from '../utils/clearPwaApiCache'
import { clearPublicPaymentTokenCache } from '../services/api'
import { usePjgtDataStore } from './pjgtDataStore'
import { useSantriDataStore } from './santriDataStore'

export const useAuthStore = create((set, get) => ({
  token: null,
  user: null,
  isAuthenticated: false,
  /** @type {string | null} salah satu: santri | toko | pjgt | wali — hanya relevan jika user punya >0 fitur */
  activeAccess: null,
  /** Modal pengingat daftar passkey setelah login password (interval backend). */
  passkeyPromptOpen: false,
  setPasskeyPromptOpen: (open) => set({ passkeyPromptOpen: !!open }),

  setAuth: (token, user) => {
    const prevMadrasahId = get().user?.madrasah_id ?? null
    localStorage.setItem('auth_token', token)
    localStorage.setItem('auth_last_used_at', String(Date.now()))
    if (user) {
      const normalizedUser = {
        id: user.id,
        santri_id: user.santri_id ?? null,
        madrasah_id: user.madrasah_id ?? null,
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
        foto_profil: user.foto_profil ?? null,
        santri_options: Array.isArray(user.santri_options) ? user.santri_options : [],
        madrasah_nama: typeof user.madrasah_nama === 'string' ? user.madrasah_nama : '',
      }
      localStorage.setItem('user_data', JSON.stringify(normalizedUser))
      const nextMadrasahId = normalizedUser.madrasah_id ?? null
      const prevSantriId = get().user?.santri_id ?? null
      const nextSantriId = normalizedUser.santri_id ?? null
      if (prevMadrasahId !== nextMadrasahId) {
        clearPjgtCache()
        usePjgtDataStore.getState().reset()
      }
      if (prevSantriId !== nextSantriId) {
        clearSantriCache()
        useSantriDataStore.getState().reset()
      }
      const initialActive = resolveInitialActiveAccess(normalizedUser)
      set({ token, user: normalizedUser, isAuthenticated: true, activeAccess: initialActive })
    } else {
      set({ token, user: null, isAuthenticated: true, activeAccess: null })
    }
  },

  /**
   * Ganti akses aplikasi (santri / toko / pjgt / wali). Disimpan di localStorage.
   * @param {string} modeKey
   * @param {number} [santriIdOpt] wajib konsisten jika baris santri memuat beberapa identitas
   */
  setActiveAccess: (modeKey, santriIdOpt) => {
    const user = get().user
    if (!user || !isValidAccessModeForUser(user, modeKey)) return
    const pick = { mode: modeKey }
    if (santriIdOpt != null && santriIdOpt > 0) pick.santriId = santriIdOpt
    writeStoredAccessPick(pick)
    set({ activeAccess: modeKey })
  },

  /** Gabungan parsial ke objek user (mis. path foto profil setelah upload). */
  patchUser: (partial) =>
    set((state) => {
      if (!state.user || !partial || typeof partial !== 'object') return state
      const next = { ...state.user, ...partial }
      try {
        localStorage.setItem('user_data', JSON.stringify(next))
      } catch (_) {}
      return { user: next }
    }),

  logout: () => {
    authAPI.logout()
    localStorage.removeItem('auth_last_used_at')
    writeStoredAccessPick(null)
    clearPjgtCache()
    clearSantriCache()
    clearPublicPaymentTokenCache()
    void clearPwaApiCache()
    usePjgtDataStore.getState().reset()
    useSantriDataStore.getState().reset()
    set({ token: null, user: null, isAuthenticated: false, activeAccess: null, passkeyPromptOpen: false })
  },

  checkAuth: async () => {
    const token = localStorage.getItem('auth_token')
    if (!token) {
      set({ token: null, user: null, isAuthenticated: false, activeAccess: null, passkeyPromptOpen: false })
      return
    }
    try {
      const response = await authAPI.verifyMybeddian()
      if (response.success && response.data) {
        const u = response.data
        const allowedApps = Array.isArray(u.allowed_apps) ? u.allowed_apps : []
        const hasPortalAccess =
          allowedApps.includes('mybeddian') ||
          allowedApps.includes('mybeddien') ||
          allowedApps.includes('uwaba')
        if (!hasPortalAccess) {
          localStorage.removeItem('auth_token')
          localStorage.removeItem('user_data')
          localStorage.removeItem('auth_last_used_at')
          set({ token: null, user: null, isAuthenticated: false, activeAccess: null, passkeyPromptOpen: false })
          return
        }
        const user = {
          id: u.id,
          santri_id: u.santri_id ?? null,
          madrasah_id: u.madrasah_id ?? null,
          nama: u.nama,
          username: u.username || null,
          role_key: u.role_key || u.level || 'user',
          role_label: u.role_label || u.level || 'user',
          allowed_apps: u.allowed_apps || [],
          permissions: u.permissions || [],
          has_toko: u.has_toko ?? false,
          toko_id: u.toko_id ?? null,
          toko_nama: u.toko_nama ?? '',
          grup_akses: Array.isArray(u.grup_akses) ? u.grup_akses : [],
          foto_profil:
            u.foto_profil != null && String(u.foto_profil).trim() !== '' ? u.foto_profil : null,
          santri_options: Array.isArray(u.santri_options) ? u.santri_options : [],
          madrasah_nama: typeof u.madrasah_nama === 'string' ? u.madrasah_nama : '',
        }
        localStorage.setItem('user_data', JSON.stringify(user))
        localStorage.setItem('auth_last_used_at', String(Date.now()))
        const nextActive = resolveInitialActiveAccess(user)
        set({ token, user, isAuthenticated: true, activeAccess: nextActive })
        return
      }
    } catch (_) {}
    localStorage.removeItem('auth_token')
    localStorage.removeItem('user_data')
    localStorage.removeItem('auth_last_used_at')
    set({ token: null, user: null, isAuthenticated: false, activeAccess: null, passkeyPromptOpen: false })
  },
}))
