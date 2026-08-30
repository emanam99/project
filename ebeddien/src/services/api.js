import axios from 'axios'
import { sanitizeUgtLaporanPayload } from '../utils/ugtLaporanSanitize'

// --- Environment label (development | staging | production) ---
// Dari VITE_APP_ENV di .env; kalau tidak set: dev mode = development, build = production
const VALID_ENV = ['development', 'staging', 'production']
export const getAppEnv = () => {
  const raw = import.meta.env.VITE_APP_ENV
  if (raw && typeof raw === 'string') {
    const v = raw.trim().toLowerCase()
    if (VALID_ENV.includes(v)) return v
    if (v === 'dev') return 'development'
    if (v === 'prod') return 'production'
  }
  return import.meta.env.DEV ? 'development' : 'production'
}

function envApiUrlPointsToLocalMachine(url) {
  try {
    const h = new URL(url.trim()).hostname
    return h === 'localhost' || h === '127.0.0.1'
  } catch {
    return false
  }
}

function deriveRemoteApiBaseUrl(hostname, protocol) {
  const parts = hostname.split('.')
  const rootDomain = hostname.toLowerCase().endsWith('.my.id') && parts.length >= 3
    ? parts.slice(-3).join('.')
    : (parts.length > 2 ? parts.slice(-2).join('.') : hostname)
  if (!rootDomain || rootDomain.includes('localhost')) {
    return 'http://localhost/api/public/api'
  }
  return `${protocol}//api.${rootDomain}/api`
}

// Helper untuk mendapatkan base URL API
// Saat akses dari HP/device lain lewat IP (10.x, 192.168.x): selalu pakai hostname agar API ke PC yang sama
// Saat localhost atau production: pakai VITE_API_BASE_URL atau fallback
export const getSlimApiUrl = () => {
  // Dev Vite: API lewat proxy same-origin (http/https, termasuk akses LAN dari HP)
  if (import.meta.env.DEV) {
    return '/api/public/api'
  }

  const hostname = typeof window !== 'undefined' ? window.location.hostname : 'localhost'
  const protocol = typeof window !== 'undefined' ? window.location.protocol : 'http:'
  const isPrivateOrIp = hostname.startsWith('10.') ||
    hostname.startsWith('192.168.') ||
    hostname.startsWith('172.16.') ||
    hostname === '127.0.0.1'

  // Akses lewat IP (HP buka 10.190.153.123:5173 dll): API harus ke host yang sama, jangan pakai localhost dari .env
  if (typeof window !== 'undefined' && isPrivateOrIp && hostname !== 'localhost') {
    const base = `${protocol}//${hostname}/api/public/api`
    return base
  }

  const envUrl = import.meta.env.VITE_API_BASE_URL
  if (envUrl && typeof envUrl === 'string' && envUrl.trim() !== '') {
    const url = envUrl.trim().replace(/\/$/, '')
    const onRemoteHost = typeof window !== 'undefined' && !isPrivateOrIp && hostname !== 'localhost' && hostname !== '127.0.0.1'
    if (!onRemoteHost || !envApiUrlPointsToLocalMachine(url)) {
      return url.endsWith('/') ? url.slice(0, -1) : url
    }
    if (typeof console !== 'undefined') {
      console.warn(
        '[eBeddien] VITE_API_BASE_URL mengarah ke localhost di host production — pakai API remote:',
        deriveRemoteApiBaseUrl(hostname, protocol)
      )
    }
  }

  if (typeof window !== 'undefined' && !isPrivateOrIp && hostname !== 'localhost' && hostname !== '127.0.0.1') {
    return deriveRemoteApiBaseUrl(hostname, protocol)
  }

  // Fallback jika .env belum di-set
  const isLocal = hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname.startsWith('192.168.') ||
    hostname.startsWith('10.') ||
    hostname.startsWith('172.16.')

  let fallback
  if (isLocal) {
    const localBase = (hostname === 'localhost' || hostname === '127.0.0.1')
      ? 'http://localhost'
      : `${protocol}//${hostname}`
    fallback = `${localBase}/api/public/api`
  } else {
    const parts = hostname.split('.')
    const rootDomain = hostname.toLowerCase().endsWith('.my.id') && parts.length >= 3
      ? parts.slice(-3).join('.')
      : (parts.length > 2 ? parts.slice(-2).join('.') : hostname)
    fallback = (!rootDomain || rootDomain.includes('localhost'))
      ? 'http://localhost/api/public/api'
      : `${protocol}//api.${rootDomain}/api`
  }
  console.warn(
    '[Uwaba] VITE_API_BASE_URL tidak di-set di .env — menggunakan fallback:',
    fallback,
    '| Set VITE_API_BASE_URL di .env untuk local, staging, dan production.'
  )
  return fallback
}

/**
 * Untuk fetch halaman pembayaran publik: jika URL halaman punya ?token=… (signed), teruskan ke API.
 */
export function appendPublicPaymentTokenQuery(url) {
  if (typeof window === 'undefined') return url
  try {
    const token = new URLSearchParams(window.location.search).get('token')
    if (!token) return url
    const sep = url.includes('?') ? '&' : '?'
    return `${url}${sep}token=${encodeURIComponent(token)}`
  } catch {
    return url
  }
}

// CSRF token cache
let csrfTokenCache = null
let csrfTokenPromise = null

// Fungsi untuk mendapatkan CSRF token
async function getCsrfToken() {
  if (csrfTokenCache) {
    return csrfTokenCache
  }

  if (csrfTokenPromise) {
    return csrfTokenPromise
  }

  csrfTokenPromise = (async () => {
    try {
      const response = await axios.get(`${getSlimApiUrl()}/auth/csrf-token`, {
        withCredentials: true
      })

      if (response.data.success && response.data.data?.token) {
        csrfTokenCache = response.data.data.token
        return csrfTokenCache
      }
      return null
    } catch (error) {
      console.error('Error fetching CSRF token:', error)
      return null
    } finally {
      csrfTokenPromise = null
    }
  })()

  return csrfTokenPromise
}

// Reset CSRF token cache
export function resetCsrfToken() {
  csrfTokenCache = null
  csrfTokenPromise = null
}

// Helper untuk fetch() di luar instance axios (mis. halaman print) supaya tetap
// kirim Authorization header. Mengembalikan object headers siap pakai.
export function getAuthHeaders(extra = {}) {
  let token = ''
  try { token = localStorage.getItem('auth_token') || '' } catch { /* localStorage disabled */ }
  const headers = { 'Accept': 'application/json', ...extra }
  if (token) headers['Authorization'] = `Bearer ${token}`
  return headers
}

// API URL dari .env (atau fallback). Base harus mengakhiri dengan /api agar path
// relatif (e.g. /santri, /v2/auth/login) menjadi .../api/santri = routes backend.
const apiBaseUrl = getSlimApiUrl()

// Setup axios instance — path relatif mengacu ke routes terbaru (api/routes/*)
const api = axios.create({
  baseURL: apiBaseUrl,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  },
  withCredentials: true
})

// Export untuk debugging
export const getApiBaseUrl = () => apiBaseUrl

/**
 * Cek nomor WhatsApp lewat backend API (satu jalur: ikut setting notifikasi WatZap/WA server).
 * Response: { success, data: { phoneNumber, isRegistered }, message }
 * Staff: kirim id_santri + field bila nomor di UI sudah di-mask.
 */
export const checkWhatsAppNumberViaAPI = (phoneNumber, sessionId = null, opts = null) => {
  const body = {}
  const idSantri = opts?.id_santri != null ? Number(opts.id_santri) : 0
  const field = opts?.field || opts?.phone_field || ''
  if (idSantri > 0 && field) {
    body.id_santri = idSantri
    body.field = String(field)
    // Endpoint auth agar boleh resolve nomor dari DB
    return api.post('/wa/check', body).then((r) => r.data)
  }
  body.phoneNumber = String(phoneNumber || '').trim()
  if (sessionId != null && String(sessionId).trim() !== '') {
    body.sessionId = String(sessionId).trim()
  }
  return api.post('/public/wa/check', body).then((r) => r.data)
}

// Batas umur token login: 5 jam dari terakhir digunakan (sliding). Lewat = hapus token dan wajib login lagi.
const AUTH_TOKEN_MAX_AGE_MS = 5 * 60 * 60 * 1000

/**
 * Endpoint auth v2 publik (link dari WA: setup akun, ubah password, daftar).
 * Jangan pakai cek umur JWT lokal / jangan paksa redirect login — user bisa punya token lama di storage
 * sambil membuka link setup dari WhatsApp.
 */
function isPublicV2AuthPath(config) {
  const u = config.url || ''
  return (
    // Cek nomor WA di halaman daftar/lupa password harus tetap bisa dipakai tanpa sesi login aktif.
    u.includes('/wa/check') ||
    u.includes('/v2/auth/setup-token') ||
    u.includes('/v2/auth/setup-akun') ||
    u.includes('/v2/auth/daftar-check') ||
    u.includes('/v2/auth/daftar-konfirmasi') ||
    u.includes('/v2/auth/lupa-password-request') ||
    u.includes('/v2/auth/ubah-password-token') ||
    u.includes('/v2/auth/ubah-password') ||
    u.includes('/v2/auth/verify-email-token') ||
    u.includes('/v2/auth/verify-email') ||
    u.includes('/v2/auth/ubah-username-token') ||
    u.includes('/v2/auth/ubah-username') ||
    // WebAuthn pra-login: jangan pakai Bearer + cek umur token — halaman login perlu cek passkey tanpa JWT valid
    u.includes('/v2/auth/webauthn/status') ||
    u.includes('/v2/auth/webauthn/login/options') ||
    u.includes('/v2/auth/webauthn/login/verify')
  )
}

/**
 * Hapus token login & redirect. Refresh token ikut dihapus agar tidak tertinggal di storage.
 */
function clearAuthAndRedirectToLogin() {
  localStorage.removeItem('auth_token')
  localStorage.removeItem('refresh_token')
  localStorage.removeItem('user_data')
  localStorage.removeItem('auth_last_used_at')
  resetCsrfToken()
  window.location.href = '/login'
}

// Request interceptor untuk menambahkan auth token dan CSRF token
api.interceptors.request.use(
  async (config) => {
    // Selalu kirim origin frontend agar backend bisa bangun link WA yang benar (setup akun / ubah password).
    if (typeof window !== 'undefined' && window.location?.origin) {
      config.headers['X-Frontend-Base-URL'] = window.location.origin
    }

    const token = localStorage.getItem('auth_token')
    const isPublicAuth = isPublicV2AuthPath(config)
    if (token && !isPublicAuth) {
      const lastUsedRaw = localStorage.getItem('auth_last_used_at')
      const lastUsed = lastUsedRaw ? parseInt(lastUsedRaw, 10) : null
      if (lastUsed == null || (Date.now() - lastUsed) > AUTH_TOKEN_MAX_AGE_MS) {
        clearAuthAndRedirectToLogin()
        return Promise.reject(new Error('Token login kadaluarsa (5 jam). Silakan login lagi.'))
      }
      localStorage.setItem('auth_last_used_at', String(Date.now()))
      config.headers.Authorization = `Bearer ${token}`
    }

    config.headers['X-Client-App'] = 'ebeddien'

    // Tambahkan CSRF token (kecuali untuk login dan auth v2 endpoint)
    if (!config.url?.includes('/auth/login') && !config.url?.includes('/v2/auth')) {
      const csrfToken = await getCsrfToken()
      if (csrfToken) {
        config.headers['X-CSRF-Token'] = csrfToken
      }
    }

    // FormData: jangan pakai Content-Type application/json — biarkan boundary multipart terpasang.
    if (typeof FormData !== 'undefined' && config.data instanceof FormData) {
      const h = config.headers
      if (h && typeof h.delete === 'function') {
        h.delete('Content-Type')
        h.delete('content-type')
      } else if (h) {
        delete h['Content-Type']
        delete h['content-type']
      }
    }

    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// Response interceptor untuk handle errors
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config

    // Skip handling untuk endpoint publik (hindari redirect login saat flow publik seperti daftar).
    if (
      originalRequest?.url?.includes('/auth/login') ||
      originalRequest?.url?.includes('/v2/auth') ||
      originalRequest?.url?.includes('/wa/check')
    ) {
      return Promise.reject(error)
    }

    // Endpoint /deepseek/*: 401 dari penyedia mode alternatif (bukan JWT eBeddien). Jangan logout.
    if (originalRequest?.url?.includes('/deepseek')) {
      return Promise.reject(error)
    }

    // 401 pada /public/pembayaran/*: bukan sesi JWT habis (token pembayaran publik / lookup).
    if (error.response?.status === 401 && String(originalRequest?.url || '').includes('/public/pembayaran')) {
      return Promise.reject(error)
    }

    // Handle 401 Unauthorized - Token tidak valid atau kadaluarsa
    if (error.response?.status === 401) {
      const errorMessage = error.response?.data?.message || ''

      // Cek apakah error terkait token tidak valid atau kadaluarsa
      const isTokenError = errorMessage.includes('Token tidak valid') ||
        errorMessage.includes('Token tidak ditemukan') ||
        errorMessage.includes('kadaluarsa') ||
        errorMessage.includes('login kembali')

      // Jika error terkait token atau sudah pernah retry, langsung redirect ke login
      if (isTokenError || originalRequest._retry) {
        clearAuthAndRedirectToLogin()
        return Promise.reject(new Error('Token tidak valid atau sudah kadaluarsa. Redirecting to login...'))
      }

      // Jika belum retry dan bukan error token yang jelas, coba retry sekali dengan CSRF token baru
      originalRequest._retry = true
      resetCsrfToken()
      const csrfToken = await getCsrfToken()
      if (csrfToken) {
        originalRequest.headers['X-CSRF-Token'] = csrfToken
        return api(originalRequest)
      }

      // Jika tidak bisa mendapatkan CSRF token, redirect ke login
      clearAuthAndRedirectToLogin()
      return Promise.reject(new Error('Token tidak valid atau sudah kadaluarsa. Redirecting to login...'))
    }

    // Handle 403 CSRF invalid
    if (error.response?.status === 403 && !originalRequest._retry) {
      originalRequest._retry = true
      resetCsrfToken()
      const csrfToken = await getCsrfToken()
      if (csrfToken) {
        originalRequest.headers['X-CSRF-Token'] = csrfToken
        return api(originalRequest)
      }
    }

    return Promise.reject(error)
  }
)

// Auth API
export const authAPI = {
  login: async (id, password) => {
    const response = await api.post('/auth/login', { id, password })
    return response.data
  },

  /** Info device untuk login: device_id (dari localStorage), platform, timezone, language, screen. */
  getDeviceInfo: () => {
    if (typeof window === 'undefined') return {}
    const deviceId = localStorage.getItem('uwaba_device_id')
    const timezone = Intl.DateTimeFormat?.()?.resolvedOptions?.()?.timeZone ?? null
    const language = navigator.language || navigator.userLanguage || null
    const screenStr = typeof screen !== 'undefined' ? `${screen.width}x${screen.height}` : null
    return {
      device_id: deviceId || undefined,
      platform: 'web',
      timezone: timezone || undefined,
      language: language || undefined,
      screen: screenStr || undefined,
    }
  },

  /** Login V2: username + password (tabel users). device_fingerprint opsional. deviceInfo: device_id, platform, timezone, language, screen. */
  loginV2: async (username, password, deviceFingerprint = null, deviceInfo = null) => {
    const body = { username, password }
    if (deviceFingerprint) body.device_fingerprint = deviceFingerprint
    const info = deviceInfo ?? authAPI.getDeviceInfo()
    if (info.device_id) body.device_id = info.device_id
    if (info.platform) body.platform = info.platform
    if (info.timezone) body.timezone = info.timezone
    if (info.language) body.language = info.language
    if (info.screen) body.screen = info.screen
    const response = await api.post('/v2/auth/login', body)
    return response.data
  },

  /** Cek apakah username punya passkey WebAuthn terdaftar */
  webauthnStatus: async (username) => {
    const response = await api.get('/v2/auth/webauthn/status', { params: { username } })
    return response.data
  },

  /** Opsi login WebAuthn (passkey / sidik jari) — 503 (mis. PHP di bawah 8.1) tetap kembalikan body JSON agar message terbaca */
  webauthnLoginOptions: async (username) => {
    try {
      const response = await api.post('/v2/auth/webauthn/login/options', { username })
      return response.data
    } catch (e) {
      if (e.response?.data) return e.response.data
      throw e
    }
  },

  /** Selesaikan login WebAuthn — credential dari @simplewebauthn/browser startAuthentication */
  webauthnLoginVerify: async (username, challengeId, credential, deviceInfo = null) => {
    const body = { username, challengeId, credential }
    const info = deviceInfo ?? authAPI.getDeviceInfo()
    if (info.device_id) body.device_id = info.device_id
    if (info.platform) body.platform = info.platform
    if (info.timezone) body.timezone = info.timezone
    if (info.language) body.language = info.language
    if (info.screen) body.screen = info.screen
    try {
      const response = await api.post('/v2/auth/webauthn/login/verify', body)
      return response.data
    } catch (e) {
      if (e.response?.data) return e.response.data
      throw e
    }
  },

  /** Daftar passkey — butuh JWT. credential dari @simplewebauthn/browser startRegistration */
  webauthnRegisterOptions: async () => {
    try {
      const response = await api.post('/v2/auth/webauthn/register/options', {})
      return response.data
    } catch (e) {
      if (e.response?.data) return e.response.data
      throw e
    }
  },

  webauthnRegisterVerify: async (challengeId, credential) => {
    try {
      const response = await api.post('/v2/auth/webauthn/register/verify', { challengeId, credential })
      return response.data
    } catch (e) {
      if (e.response?.data) return e.response.data
      throw e
    }
  },

  /** Daftar passkey yang terdaftar untuk akun (JWT). */
  webauthnListCredentials: async () => {
    const response = await api.get('/v2/auth/webauthn/credentials')
    return response.data
  },

  /** Hapus satu passkey by id baris DB (JWT). */
  webauthnDeleteCredential: async (credentialRowId) => {
    try {
      const response = await api.delete(`/v2/auth/webauthn/credentials/${encodeURIComponent(credentialRowId)}`)
      return response.data
    } catch (e) {
      if (e.response?.data) return e.response.data
      throw e
    }
  },

  /** Cek daftar: id_pengurus, nik, no_wa. Return already_registered atau nama + no_wa */
  daftarCheck: async (idPengurus, nik, noWa) => {
    const response = await api.post('/v2/auth/daftar-check', { id_pengurus: idPengurus, nik, no_wa: noWa })
    return response.data
  },

  /** Konfirmasi daftar: buat token (10 menit), kembalikan data wa.me + prefill — link setup dikirim di chat WA setelah konfirmasi simpan nomor. */
  daftarKonfirmasi: async (idPengurus, nik, noWa) => {
    const response = await api.post('/v2/auth/daftar-konfirmasi', { id_pengurus: idPengurus, nik, no_wa: noWa })
    return response.data
  },

  /** Lupa password (public): id_pengurus, nik, no_wa. NIK harus persis sama dengan yang terdaftar. Kirim link reset ke WA. */
  lupaPasswordRequest: async (idPengurus, nik, noWa) => {
    const response = await api.post('/v2/auth/lupa-password-request', { id_pengurus: idPengurus, nik, no_wa: noWa })
    return response.data
  },

  /** Validasi token setup akun */
  getSetupToken: async (token) => {
    const response = await api.get('/v2/auth/setup-token', { params: { token } })
    return response.data
  },

  /** Buat akun: token, username (min 5, no space), password (min 6) */
  postSetupAkun: async (token, username, password) => {
    const response = await api.post('/v2/auth/setup-akun', { token, username, password })
    return response.data
  },

  /** Profil: ambil nomor WA yang dimask (*******052) untuk konfirmasi ubah password */
  getNoWaMask: async () => {
    const response = await api.get('/v2/auth/no-wa-mask')
    return response.data
  },

  /** Edit Profil: kirim OTP ke nomor baru untuk ganti nomor WA */
  sendOtpGantiWa: async (noWaBaru) => {
    const response = await api.post('/v2/auth/send-otp-ganti-wa', { no_wa_baru: noWaBaru })
    return response.data
  },

  /** Edit Profil: verifikasi OTP dan update nomor WA */
  verifyOtpGantiWa: async (noWaBaru, otp) => {
    const response = await api.post('/v2/auth/verify-otp-ganti-wa', { no_wa_baru: noWaBaru, otp })
    return response.data
  },

  /** Profil: minta link ubah password; kirim ke WA setelah konfirmasi no_wa. */
  requestUbahPassword: async (noWaKonfirmasi) => {
    const response = await api.post('/v2/auth/request-ubah-password', { no_wa_konfirmasi: noWaKonfirmasi })
    return response.data
  },

  /** Halaman ubah password (public): validasi token */
  getUbahPasswordToken: async (token) => {
    const response = await api.get('/v2/auth/ubah-password-token', { params: { token } })
    return response.data
  },

  /** Halaman ubah password (public): set password baru */
  postUbahPassword: async (token, passwordBaru) => {
    const response = await api.post('/v2/auth/ubah-password', { token, password_baru: passwordBaru })
    return response.data
  },

  /** Profil: kirim link verifikasi email (JWT). */
  sendVerifyEmail: async () => {
    const response = await api.post('/v2/auth/send-verify-email', {})
    return response.data
  },

  /** Profil: sembunyikan modal pengingat email selama 1 tahun (JWT). */
  postEmailReminderSnooze: async () => {
    const response = await api.post('/v2/auth/email-reminder-snooze', {})
    return response.data
  },

  /** Halaman verifikasi email (public): cek token */
  getVerifyEmailToken: async (token) => {
    const response = await api.get('/v2/auth/verify-email-token', { params: { token } })
    return response.data
  },

  /** Halaman verifikasi email (public): konfirmasi */
  postVerifyEmail: async (token) => {
    const response = await api.post('/v2/auth/verify-email', { token })
    return response.data
  },

  /** Profil: ubah username langsung (tanpa WA). username_baru + password (verifikasi). */
  ubahUsernameLangsung: async (usernameBaru, password) => {
    const response = await api.post('/v2/auth/ubah-username-langsung', { username_baru: usernameBaru, password })
    return response.data
  },

  /** Profil: minta link ubah username; username_baru + password (verifikasi). Kirim link ke WA. */
  requestUbahUsername: async (usernameBaru, password) => {
    const response = await api.post('/v2/auth/request-ubah-username', { username_baru: usernameBaru, password })
    return response.data
  },

  /** Halaman ubah username (public): validasi token */
  getUbahUsernameToken: async (token) => {
    const response = await api.get('/v2/auth/ubah-username-token', { params: { token } })
    return response.data
  },

  /** Halaman ubah username (public): set username baru + password saat ini (harus benar) */
  postUbahUsername: async (token, usernameBaru, password) => {
    const response = await api.post('/v2/auth/ubah-username', { token, username_baru: usernameBaru, password })
    return response.data
  },

  verify: async () => {
    const response = await api.get('/auth/verify')
    return response.data
  },

  /** Logout V2: revoke session di server (jika token punya jti) */
  logoutV2: async () => {
    try {
      await api.post('/v2/auth/logout')
    } catch {
      // abaikan: best-effort revoke session; tetap lanjut clear state lokal
    }
  },

  /** Daftar session aktif (device, browser, IP, last_activity) - untuk aktivitas */
  getSessions: async () => {
    const response = await api.get('/v2/auth/sessions')
    return response.data
  },

  /** Logout dari semua perangkat kecuali yang saat ini */
  logoutAll: async () => {
    const response = await api.post('/v2/auth/logout-all')
    return response.data
  },

  /** Revoke session tertentu (logout perangkat itu). id = session id */
  revokeSession: async (id) => {
    const response = await api.delete(`/v2/auth/sessions/${id}`)
    return response.data
  },

  /**
   * Menu/fitur eBeddien dari DB (app___fitur + role___fitur), gabungan semua role di token.
   * @param {{ app_key?: string, types?: string }} [params] — types default 'menu', bisa 'menu,action'
   */
  getMyFiturMenu: async (params = {}) => {
    const response = await api.get('/v2/me/fitur-menu', { params })
    return response.data
  },

  /** Favorit nav bawah: urutan path menu (tabel app___fitur_favorit). */
  getMyFiturFavorit: async (params = {}) => {
    const response = await api.get('/v2/me/fitur-favorit', { params })
    return response.data
  },

  putMyFiturFavorit: async (body) => {
    const response = await api.put('/v2/me/fitur-favorit', body)
    return response.data
  },

  /** MyBeddien (self-service): data portal, santri tertaut, potong Bisyaroh. */
  getMeMybeddian: async () => {
    const response = await api.get('/v2/me/mybeddian')
    return response.data
  },

  searchMeMybeddianSantri: async (q) => {
    const response = await api.get('/v2/me/mybeddian/santri-search', { params: { q } })
    return response.data
  },

  /** Cek santri yang bisa ditautkan berdasarkan NIK (digit). */
  getMeMybeddianSantriByNik: async (nik) => {
    const response = await api.get('/v2/me/mybeddian/santri-by-nik', { params: { nik } })
    return response.data
  },

  linkMeMybeddianSantri: async (body) => {
    const response = await api.put('/v2/me/mybeddian/link-santri', body)
    return response.data
  },

  unlinkMeMybeddianSantri: async (santriId) => {
    const response = await api.delete(`/v2/me/mybeddian/santri/${santriId}`)
    return response.data
  },

  putMeMybeddianPortalSantri: async (access_mybeddian_santri) => {
    const response = await api.put('/v2/me/mybeddian/portal-santri', { access_mybeddian_santri })
    return response.data
  },

  putMeMybeddianPotongUwabaBulan: async (body) => {
    const response = await api.put('/v2/me/mybeddian/potong-uwaba-bulan', body)
    return response.data
  },

  /** @deprecated gunakan putMeMybeddianPotongUwabaBulan */
  putMeMybeddianBisyarohPotong: async (body) => {
    const response = await api.put('/v2/me/mybeddian/bisyaroh-potong', body)
    return response.data
  },

  /** Katalog semua menu eBeddien dari app___fitur (path, label, grup, meta) — acuan tampilan UI */
  getEbeddienMenuCatalog: async () => {
    const response = await api.get('/v2/fitur/ebeddien/menu-catalog')
    return response.data
  },

  logout: () => {
    resetCsrfToken()
    localStorage.removeItem('auth_token')
  }
}

/**
 * Base URL backend WA (Node) — koneksi/QR, status, connect/disconnect/logout.
 * - Staging: frontend di *.alutsmani.my.id atau *2.alutsmani.id → WA Node di https://wa2.alutsmani.id.
 *   Jangan same-origin ke ebeddien2/dll. kecuali Anda memang reverse-proxy /api/whatsapp ke Node di vhost yang sama.
 * - Production: https://wa.alutsmani.id
 * - Override: VITE_WA_BACKEND_URL (penuh) atau VITE_WA_BACKEND_PORT (default 3001) di .env.
 *   Harus sama dengan PORT di wa/.env — kalau beda, fetch ke WA akan "Failed to fetch".
 */
export const getWaBackendUrl = () => {
  const url = import.meta.env.VITE_WA_BACKEND_URL
  if (url && typeof url === 'string' && url.trim() !== '') {
    return url.trim().replace(/\/$/, '')
  }
  const waPort = String(import.meta.env.VITE_WA_BACKEND_PORT || '3001').replace(/\D/g, '') || '3001'
  const hostname = typeof window !== 'undefined' ? window.location.hostname : 'localhost'
  const protocol = typeof window !== 'undefined' ? window.location.protocol : 'http:'
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return `http://127.0.0.1:${waPort}`
  }

  const hl = hostname.toLowerCase()

  // Langsung buka dari host WA staging
  if (hl === 'wa2.alutsmani.id') {
    return 'https://wa2.alutsmani.id'
  }

  // Staging: portal di alutsmani.my.id, atau subdomain …2 di alutsmani.id
  if (hl === 'alutsmani.my.id' || hl.endsWith('.alutsmani.my.id')) {
    return 'https://wa2.alutsmani.id'
  }
  const alutsmaniParts = hl.match(/^([a-z0-9-]+)\.alutsmani\.id$/i)
  if (alutsmaniParts) {
    const sub = alutsmaniParts[1]
    if (sub.endsWith('2')) {
      return 'https://wa2.alutsmani.id'
    }
  }

  if (hl === 'alutsmani.id' || hl.endsWith('.alutsmani.id')) {
    return 'https://wa.alutsmani.id'
  }

  return `${protocol}//${hostname}:${waPort}`
}

/**
 * Stop/Start stack WA lewat API PHP (`docker compose down` / `up -d`), bukan hanya flag di Node.
 * Aktifkan di build: VITE_WA_DOCKER_CONTROL=true — hanya untuk super_admin; api/.env butuh WA_DOCKER_CONTROL_ENABLED + WA_DOCKER_COMPOSE_DIR.
 */
export const isWaDockerHostControlEnabled = () => {
  const v = import.meta.env.VITE_WA_DOCKER_CONTROL
  return v === 'true' || v === '1'
}

export const postWaDockerStop = async () => {
  const response = await api.post('/wa/docker/stop')
  return response.data
}

export const postWaDockerStart = async () => {
  const response = await api.post('/wa/docker/start')
  return response.data
}

const WA_HTTP_TIMEOUT_MS = 10000
/** Memulai sesi Puppeteer/Baileys di VPS bisa >10s — jangan timeout prematur. */
const WA_CONNECT_TIMEOUT_MS = Number(import.meta.env.VITE_WA_CONNECT_TIMEOUT_MS || 120000)
/** Ambil QR bisa lambat saat CPU penuh. */
const WA_QR_FETCH_TIMEOUT_MS = Number(import.meta.env.VITE_WA_QR_TIMEOUT_MS || 60000)
const fetchJsonWithTimeout = async (url, options = {}, timeoutMs = WA_HTTP_TIMEOUT_MS) => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal
    })
    const data = await res.json().catch(() => ({ success: false, message: 'Network error' }))
    return { res, data }
  } catch (err) {
    if (err?.name === 'AbortError') {
      return {
        res: null,
        data: { success: false, message: 'Permintaan melebihi batas waktu. Coba lagi.' }
      }
    }
    const raw = err?.message || 'Network error'
    const hint =
      raw === 'Failed to fetch'
        ? ' Tidak bisa ke server WA — pastikan `npm run dev` di folder wa jalan, port sama dengan VITE_WA_BACKEND_PORT (atau VITE_WA_BACKEND_URL) di ebeddien/.env, lalu restart Vite.'
        : ''
    return {
      res: null,
      data: { success: false, message: raw + hint }
    }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * API backend WA (Node): status, connect, disconnect, logout.
 * Request dengan Bearer token dari localStorage (kecuali getStatus bisa tanpa token).
 */
export const waBackendAPI = {
  getStatus: async () => {
    const base = getWaBackendUrl()
    const { res, data } = await fetchJsonWithTimeout(`${base}/api/whatsapp/status`, { method: 'GET', credentials: 'omit' })
    if (!res || !res.ok) {
      return {
        success: false,
        data: { sessions: {}, status: 'disconnected', qrCode: null, phoneNumber: null },
        statusCode: res?.status || 0,
        message: data?.message
      }
    }
    return data
  },
  getQr: async (sessionId = null, timeoutMs = WA_QR_FETCH_TIMEOUT_MS) => {
    const base = getWaBackendUrl()
    const q = sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : ''
    const { res, data } = await fetchJsonWithTimeout(`${base}/api/whatsapp/qr${q}`, { method: 'GET', credentials: 'omit' }, timeoutMs)
    if (!res || !res.ok) {
      return { success: false, data: sessionId ? { sessionId, qrCode: null, baileysQrCode: null } : { sessions: {} } }
    }
    return data
  },
  /**
   * @param {string} [sessionId] - hanya default (satu koneksi per backend Node)
   * @param {{ refreshQr?: boolean }} [options] - refreshQr: paksa QR baru (backend tidak mengembalikan cache)
   */
  connect: async (sessionId = 'default', options = {}) => {
    const base = getWaBackendUrl()
    const token = localStorage.getItem('auth_token')
    const body = { sessionId: sessionId || 'default' }
    if (options.refreshQr === true) body.refreshQr = true
    const timeoutMs =
      typeof options.timeoutMs === 'number' && options.timeoutMs > 0
        ? options.timeoutMs
        : WA_CONNECT_TIMEOUT_MS
    const { data } = await fetchJsonWithTimeout(`${base}/api/whatsapp/connect`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify(body)
    }, timeoutMs)
    return data
  },
  /** @param {string} [sessionId] */
  disconnect: async (sessionId = 'default') => {
    const base = getWaBackendUrl()
    const token = localStorage.getItem('auth_token')
    const { data } = await fetchJsonWithTimeout(`${base}/api/whatsapp/disconnect`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify({ sessionId: sessionId || 'default' })
    })
    return data
  },
  /** @param {string} [sessionId] */
  logout: async (sessionId = 'default') => {
    const base = getWaBackendUrl()
    const token = localStorage.getItem('auth_token')
    const { data } = await fetchJsonWithTimeout(`${base}/api/whatsapp/logout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify({ sessionId: sessionId || 'default' })
    })
    return data
  },
  /** Hapus slot WA (state + file sesi) agar baris stale hilang dari daftar. */
  deleteSlot: async (sessionId = 'default') => {
    const base = getWaBackendUrl()
    const token = localStorage.getItem('auth_token')
    const { data } = await fetchJsonWithTimeout(`${base}/api/whatsapp/delete-slot`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify({ sessionId: sessionId || 'default' })
    })
    return data
  },
  stopServer: async () => {
    const base = getWaBackendUrl()
    const token = localStorage.getItem('auth_token')
    const { data } = await fetchJsonWithTimeout(`${base}/api/whatsapp/server/stop`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      }
    })
    return data
  },
  startServer: async () => {
    const base = getWaBackendUrl()
    const token = localStorage.getItem('auth_token')
    const { data } = await fetchJsonWithTimeout(`${base}/api/whatsapp/server/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      }
    })
    return data
  },
  /**
   * Bangunkan / paksa sambung ulang Baileys (POST /wake). force=true memutus lalu init ulang (obat zombie / macet).
   */
  wake: async (sessionId = 'default', force = false) => {
    const base = getWaBackendUrl()
    const token = localStorage.getItem('auth_token')
    const body = { sessionId: sessionId || 'default' }
    if (force) body.force = true
    const { data } = await fetchJsonWithTimeout(
      `${base}/api/whatsapp/wake`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify(body)
      },
      20000
    )
    return data
  },
  /**
   * Kirim pesan lewat backend WA (untuk tes di halaman Koneksi WA / chat).
   * @param {string} phoneNumber - Nomor 08xxx atau 62xxx (untuk grup bisa kosong jika pakai chatId)
   * @param {string} message - Isi pesan
   * @param {string} [imageBase64] - Base64 gambar (opsional)
   * @param {string} [imageMimetype] - image/png, image/jpeg, dll.
   * @param {string} [sessionId] - default, wa2, ...
   * @param {string} [chatId] - JID penuh untuk grup (xxx@g.us) atau contact (628xxx@s.whatsapp.net); bila ada dipakai sebagai tujuan
   */
  send: async (phoneNumber, message, imageBase64 = null, imageMimetype = 'image/png', sessionId = null, chatId = null) => {
    const base = getWaBackendUrl()
    const token = localStorage.getItem('auth_token')
    const body = {
      phoneNumber: (phoneNumber || '').trim(),
      message: message || ''
    }
    if (sessionId) body.sessionId = sessionId
    if (chatId) body.chatId = chatId
    if (imageBase64) {
      body.imageBase64 = imageBase64
      body.imageMimetype = imageMimetype || 'image/png'
    }
    /** Antrian kirim di Node + jeda antar pesan bisa membuat respons sangat lambat */
    const { res, data } = await fetchJsonWithTimeout(
      `${base}/api/whatsapp/send`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify(body)
      },
      15 * 60 * 1000
    )
    if (res && !res.ok && !data.message) data.message = res.status === 503 ? 'Layanan WA sibuk. Coba lagi atau scan QR Baileys di tab Koneksi.' : 'Gagal mengirim pesan.'
    return data
  },

  /**
   * Cek apakah nomor terdaftar/aktif di WhatsApp (sama seperti fitur di wa lama).
   * @param {string} phoneNumber - Nomor 08xxx atau 62xxx
   */
  checkNumber: async (phoneNumber, sessionId = null) => {
    const base = getWaBackendUrl()
    const token = localStorage.getItem('auth_token')
    const body = { phoneNumber: (phoneNumber || '').trim() }
    if (sessionId) body.sessionId = sessionId
    const { data } = await fetchJsonWithTimeout(
      `${base}/api/whatsapp/check`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify(body)
      },
      30000
    )
    return data
  },

  /**
   * Daftar chat untuk satu session (list seperti WA Web).
   * @param {string} [sessionId] - default, wa2, wa3, ...
   */
  getChats: async (sessionId = 'default') => {
    const base = getWaBackendUrl()
    const token = localStorage.getItem('auth_token')
    const url = `${base}/api/whatsapp/chats?sessionId=${encodeURIComponent(sessionId || 'default')}`
    const { data } = await fetchJsonWithTimeout(url, {
      method: 'GET',
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) }
    })
    return data?.data != null || data?.success != null
      ? data
      : { success: false, message: data?.message || 'Network error', data: [] }
  },

  /**
   * Ambil riwayat pesan satu chat (contact atau grup).
   * @param {string} [sessionId] - default, wa2, ...
   * @param {string} phoneOrChatId - nomor 62xxx atau chatId penuh (628xxx@s.whatsapp.net / xxx@g.us)
   * @param {number} [limit] - jumlah pesan (default 50, max 100)
   */
  getChatMessages: async (sessionId = 'default', phoneOrChatId, limit = 50) => {
    const base = getWaBackendUrl()
    const token = localStorage.getItem('auth_token')
    const params = new URLSearchParams({ sessionId: sessionId || 'default', limit: String(Math.min(100, Math.max(1, limit))) })
    if (phoneOrChatId && phoneOrChatId.includes('@')) {
      params.set('chatId', phoneOrChatId)
    } else {
      params.set('phoneNumber', phoneOrChatId || '')
    }
    const { data } = await fetchJsonWithTimeout(`${base}/api/whatsapp/chat-messages?${params}`, {
      method: 'GET',
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) }
    })
    return data?.data != null || data?.success != null
      ? data
      : { success: false, message: data?.message || 'Network error', data: [] }
  }
}

/** Pengiriman WA terpusat lewat backend (sama dengan offcanvas kwitansi/biodata UWABA). Default = WA 1 (uwaba1). */
export const waAPI = {
  /**
   * Kirim pesan WA lewat backend. Backend sudah log ke tabel whatsapp; jangan panggil saveChat lagi setelah ini.
   * @param {string} phoneNumber - Nomor (08xxx atau 62xxx)
   * @param {string} message - Pesan teks
   * @param {string} [instance='uwaba1'] - Instance: uwaba1 (WA 1), uwaba2 (WA 2). Default WA 1.
   * @param {{ id_santri?: string|number, id_pengurus?: number }?} options - Opsional: agar backend log ke whatsapp dengan id_santri/id_pengurus
   */
  send: async (phoneNumber, message, instance = 'uwaba1', options = null) => {
    const body = {
      phoneNumber: phoneNumber?.trim() ?? '',
      message: message ?? '',
      ...(instance ? { instance } : {})
    }
    if (options && (options.id_santri != null && options.id_santri !== '')) {
      body.id_santri = options.id_santri
    }
    if (options && options.id_pengurus != null && options.id_pengurus !== '') {
      body.id_pengurus = options.id_pengurus
    }
    if (options && options.phone_field) {
      body.phone_field = options.phone_field
    }
    if (options && options.field) {
      body.field = options.field
    }
    try {
      const response = await api.post('/wa/send', body)
      return response.data
    } catch (e) {
      if (e.response?.data && typeof e.response.data === 'object') {
        return e.response.data
      }
      throw e
    }
  },

  /**
   * Edit pesan WA yang sudah dikirim (hanya dalam 15 menit setelah kirim).
   * @param {string} phoneNumber - Nomor (08xxx atau 62xxx); boleh kosong/mask jika id_santri + phone_field
   * @param {string} messageId - ID pesan dari WA (wa_message_id)
   * @param {string} newMessage - Isi pesan baru
   * @param {{ id_santri?: string|number, phone_field?: string }?} options
   */
  edit: async (phoneNumber, messageId, newMessage, options = null) => {
    const body = {
      phoneNumber: (phoneNumber || '').trim(),
      messageId: (messageId || '').trim(),
      newMessage: typeof newMessage === 'string' ? newMessage.trim() : ''
    }
    if (options?.id_santri != null && options.id_santri !== '') {
      body.id_santri = options.id_santri
    }
    if (options?.phone_field) body.phone_field = options.phone_field
    if (options?.field) body.field = options.field
    const response = await api.post('/wa/edit-message', body)
    return response.data
  }
}

// Santri API
export const santriAPI = {
  getAll: async (opts = {}) => {
    const { limit, offset, signal } = opts
    const params = new URLSearchParams()
    if (limit != null && limit !== '') {
      params.set('limit', String(Number(limit)))
      params.set('offset', String(Number(offset || 0)))
    }
    const qs = params.toString()
    const response = await api.get(qs ? `/santri?${qs}` : '/santri', signal ? { signal } : undefined)
    return response.data
  },

  /** Daftar santri yang tanggal_update / tanggal_dibuat lebih baru dari watermark (sinkron inkremental). */
  getChangedSince: async (since) => {
    const response = await api.get(`/santri?since=${encodeURIComponent(since)}`)
    return response.data
  },

  getById: async (id) => {
    const response = await api.get(`/santri?id=${id}`)
    return response.data
  },

  update: async (id, data) => {
    const response = await api.post('/santri', { id, ...data })
    return response.data
  },

  /** Token signed untuk halaman publik santri (QR cetak). Default scope=all, ttl max 7 hari. */
  issuePublicViewToken: async (idSantri, opts = {}) => {
    const body = {
      id_santri: idSantri,
      scope: opts.scope || 'all',
    }
    if (opts.ttl != null) body.ttl = Number(opts.ttl)
    const response = await api.post('/santri/public-view-token', body)
    return response.data
  },

  /** Santri by rombel id (id_diniyah = id OR id_formal = id). Menggabungkan hasil diniyah + formal, dedupe by id. */
  getByRombelId: async (rombelId) => {
    const [resD, resF] = await Promise.all([
      api.get(`/santri/by-kelas?mode=diniyah&id_rombel=${encodeURIComponent(rombelId)}`).then(r => r.data),
      api.get(`/santri/by-kelas?mode=formal&id_rombel=${encodeURIComponent(rombelId)}`).then(r => r.data)
    ])
    const listD = (resD?.success && Array.isArray(resD.data)) ? resD.data : []
    const listF = (resF?.success && Array.isArray(resF.data)) ? resF.data : []
    const byId = new Map()
    listD.forEach(s => { byId.set(s.id, { ...s, role_rombel: 'diniyah' }) })
    listF.forEach(s => {
      if (byId.has(s.id)) byId.get(s.id).role_rombel = 'diniyah & formal'
      else byId.set(s.id, { ...s, role_rombel: 'formal' })
    })
    return { success: true, data: Array.from(byId.values()) }
  },

  getRiwayatRombel: async (idSantri) => {
    const response = await api.get(`/santri/riwayat-rombel?id_santri=${encodeURIComponent(idSantri)}`)
    return response.data
  },

  deleteRiwayatRombel: async (idRiwayat) => {
    const response = await api.delete(`/santri/riwayat-rombel/${encodeURIComponent(idRiwayat)}`)
    return response.data
  },

  getByLttqTingkatanId: async (idLttqTingkatan) => {
    const response = await api.get(`/santri/by-lttq-tingkatan?id_lttq_tingkatan=${encodeURIComponent(idLttqTingkatan)}`)
    return response.data
  },

  getRiwayatLttq: async (idSantri) => {
    const response = await api.get(`/santri/riwayat-lttq?id_santri=${encodeURIComponent(idSantri)}`)
    return response.data
  },

  deleteRiwayatLttq: async (idRiwayat) => {
    const response = await api.delete(`/santri/riwayat-lttq/${encodeURIComponent(idRiwayat)}`)
    return response.data
  },

  getRiwayatKamar: async (idSantri) => {
    const response = await api.get(`/santri/riwayat-kamar?id_santri=${encodeURIComponent(idSantri)}`)
    return response.data
  },

  getExcelRaw: async (params = {}) => {
    const response = await api.get('/santri/excel-raw', { params })
    return response.data
  },

  bulkUpdateFromExcel: async (rows, opts = {}) => {
    const body = { rows, ...opts }
    const response = await api.post('/santri/excel-bulk-update', body)
    return response.data
  },
}

// Lulusan (santri___lulusan) — super_admin only
export const lulusanAPI = {
  getAll: async () => {
    const response = await api.get('/santri-lulusan')
    return response.data
  },

  /** Body: { id_rombel: number, tahun_ajaran, id_santri_list: number[] } */
  createBulk: async (payload) => {
    const response = await api.post('/santri-lulusan', payload)
    return response.data
  }
}

/** Data Alumni (staff eBeddien) */
export const alumniAPI = {
  list: async (params = {}) => {
    const response = await api.get('/alumni/staff', { params })
    return response.data
  },
  getById: async (id) => {
    const response = await api.get(`/alumni/staff/${id}`)
    return response.data
  },
  update: async (id, payload) => {
    const response = await api.put(`/alumni/staff/${id}`, payload)
    return response.data
  },
  updateStatus: async (id, status) => {
    const response = await api.patch(`/alumni/staff/${id}/status`, { status })
    return response.data
  },
  delete: async (id) => {
    const response = await api.delete(`/alumni/staff/${id}`)
    return response.data
  }
}

// Ijin API
export const ijinAPI = {
  get: async (idSantri = null, tahunAjaran = null, extra = {}) => {
    let url = '/ijin'
    const params = []
    if (idSantri) params.push(`id_santri=${idSantri}`)
    if (tahunAjaran) params.push(`tahun_ajaran=${encodeURIComponent(tahunAjaran)}`)
    if (extra?.tanggal) params.push(`tanggal=${encodeURIComponent(extra.tanggal)}`)
    if (params.length > 0) url += '?' + params.join('&')
    const response = await api.get(url)
    return response.data
  },

  /** Daftar ijin yang dicatat pada tanggal / rentang (Y-m-d). Opsional telat=1 (belum kembali & deadline lewat). */
  getByTanggal: async (tanggalOrRange, tahunAjaran = null) => {
    const params = new URLSearchParams()
    if (tanggalOrRange && typeof tanggalOrRange === 'object') {
      if (tanggalOrRange.telat) params.set('telat', '1')
      if (tanggalOrRange.tanggal_dari) params.set('tanggal_dari', tanggalOrRange.tanggal_dari)
      if (tanggalOrRange.tanggal_sampai) params.set('tanggal_sampai', tanggalOrRange.tanggal_sampai)
      if (tanggalOrRange.tanggal) params.set('tanggal', tanggalOrRange.tanggal)
    } else if (tanggalOrRange) {
      params.set('tanggal', String(tanggalOrRange))
    }
    if (tahunAjaran) params.set('tahun_ajaran', tahunAjaran)
    const response = await api.get(`/ijin?${params.toString()}`)
    return response.data
  },

  /** Ijin telat: belum kembali & deadline Masehi sudah lewat. */
  getTelat: async (tahunAjaran = null) => {
    const params = new URLSearchParams()
    params.set('telat', '1')
    if (tahunAjaran) params.set('tahun_ajaran', tahunAjaran)
    const response = await api.get(`/ijin?${params.toString()}`)
    return response.data
  },

  /** Resolve QR kartu santri (CS) atau mahrom (CM) → data santri. */
  scanKartu: async (token) => {
    const response = await api.post('/ijin/scan-kartu', { token })
    return response.data
  },

  getDashboard: async (tahunAjaran = null) => {
    let url = '/ijin/dashboard'
    if (tahunAjaran) url += `?tahun_ajaran=${encodeURIComponent(tahunAjaran)}`
    const response = await api.get(url)
    return response.data
  },

  create: async (data) => {
    const response = await api.post('/ijin', data)
    return response.data
  },

  update: async (id, data) => {
    const response = await api.put(`/ijin/${id}`, data)
    return response.data
  },

  /** Catat tanggal kembali (Masehi hari ini) atau batalkan (set=false). */
  markKembali: async (id, set = true) => {
    const response = await api.post(`/ijin/${encodeURIComponent(id)}/kembali`, { set })
    return response.data
  },

  delete: async (id) => {
    const response = await api.delete(`/ijin/${id}`)
    return response.data
  },

  /** Dropdown kamar (id_kamar); query opsional: { id_daerah, status } */
  getKamarOptions: async (query = {}) => {
    const q = new URLSearchParams()
    if (query.id_daerah != null && query.id_daerah !== '') q.set('id_daerah', String(query.id_daerah))
    if (query.status != null && query.status !== '') q.set('status', String(query.status))
    const suffix = q.toString() ? `?${q.toString()}` : ''
    const response = await api.get(`/ijin/kamar-options${suffix}`)
    return response.data
  },

  /** jenis: 'Diniyah' | 'Formal' (case-insensitive) */
  getRombelOptions: async (jenis) => {
    const response = await api.get(`/ijin/rombel-options?jenis=${encodeURIComponent(jenis)}`)
    return response.data
  }
}

// Boyong API (admin_ijin, super_admin only)
export const boyongAPI = {
  get: async (params = {}) => {
    const q = new URLSearchParams()
    if (params.id_santri) q.set('id_santri', params.id_santri)
    if (params.tahun_hijriyah) q.set('tahun_hijriyah', params.tahun_hijriyah)
    if (params.tahun_masehi) q.set('tahun_masehi', params.tahun_masehi)
    const url = q.toString() ? `/boyong?${q.toString()}` : '/boyong'
    const response = await api.get(url)
    return response.data
  },
  create: async (data) => {
    const response = await api.post('/boyong', data)
    return response.data
  },
  update: async (id, data) => {
    const response = await api.put(`/boyong/${id}`, data)
    return response.data
  },
  delete: async (id) => {
    const response = await api.delete(`/boyong/${id}`)
    return response.data
  }
}

// Kalender API (GET public, POST/DELETE admin_kalender)
export const kalenderAPI = {
  get: async (params = {}) => {
    const q = new URLSearchParams()
    if (params.action) q.set('action', params.action)
    if (params.tahun) q.set('tahun', params.tahun)
    if (params.tanggal) q.set('tanggal', params.tanggal)
    if (params.tanggal_awal) q.set('tanggal_awal', params.tanggal_awal)
    if (params.tanggal_akhir) q.set('tanggal_akhir', params.tanggal_akhir)
    if (params.waktu) q.set('waktu', params.waktu)
    if (params.lat != null) q.set('lat', params.lat)
    if (params.lng != null) q.set('lng', params.lng)
    if (params.accuracy != null && params.accuracy !== '') q.set('accuracy', params.accuracy)
    const url = q.toString() ? `/kalender?${q.toString()}` : '/kalender'
    const response = await api.get(url)
    return response.data
  },
  postBulk: async (data) => {
    const response = await api.post('/kalender', data)
    return response.data
  },
  putIstiwaLokasi: async (data) => {
    const response = await api.put('/kalender/istiwa-lokasi', data)
    return response.data
  }
}

// Hari Penting API (GET public + filter target jika token; POST/DELETE admin_kalender)
export const hariPentingAPI = {
  getList: async (params = {}) => {
    const q = new URLSearchParams()
    if (params.tipe) q.set('tipe', params.tipe)
    if (params.tahun) q.set('tahun', params.tahun)
    if (params.bulan) q.set('bulan', params.bulan)
    if (params.tanggal) q.set('tanggal', params.tanggal)
    if (params.hari_pekan) q.set('hari_pekan', params.hari_pekan)
    if (params.include_targets === true || params.include_targets === '1') q.set('include_targets', '1')
    const url = q.toString() ? `/hari-penting?${q.toString()}` : '/hari-penting'
    const response = await api.get(url)
    return response.data
  },
  getLembagaOptions: async () => {
    const response = await api.get('/hari-penting/lembaga-options')
    return response.data
  },
  getUserPicker: async (params = {}) => {
    const q = new URLSearchParams()
    if (params.search) q.set('search', params.search)
    if (params.limit) q.set('limit', String(params.limit))
    const url = `/hari-penting/user-picker${q.toString() ? `?${q.toString()}` : ''}`
    const response = await api.get(url)
    return response.data
  },
  create: async (data) => {
    const response = await api.post('/hari-penting', data)
    return response.data
  },
  update: async (data) => {
    const response = await api.post('/hari-penting', data)
    return response.data
  },
  delete: async (id) => {
    const response = await api.delete('/hari-penting', { data: { id } })
    return response.data
  },
  post: async (data) => {
    const response = await api.post('/hari-penting', data)
    return response.data
  },
  /** Tambah hari penting target hanya users.id pembuat (semua user login; tanpa aksi admin kalender) */
  createPersonalSelf: async (data) => {
    const response = await api.post('/hari-penting/personal-self', data)
    return response.data
  }
}

const publicPaymentTokenCache = new Map()

async function fetchPublicPaymentToken(idSantri, mode = 'all') {
  const key = `${idSantri}:${mode}`
  const hit = publicPaymentTokenCache.get(key)
  if (hit && hit.expMs > Date.now() + 60_000) {
    return hit.token
  }
  const response = await api.post('/payment/public-token', { id_santri: idSantri, mode })
  const data = response.data
  if (!data?.success || !data?.data?.token) {
    throw new Error(data?.message || 'Gagal membuat token akses pembayaran')
  }
  const token = data.data.token
  publicPaymentTokenCache.set(key, { token, expMs: Date.now() + 14 * 60 * 1000 })
  return token
}

async function publicPaymentAxiosConfig(idSantri, mode) {
  const scope = mode === 'uwaba' || mode === 'khusus' || mode === 'tunggakan' ? mode : 'all'
  const token = await fetchPublicPaymentToken(idSantri, scope)
  return { headers: { 'X-Public-Payment-Token': token } }
}

// Payment API
export const paymentAPI = {
  getRincian: async (idSantri, mode = 'tunggakan', tahunAjaran = null) => {
    let url = `/payment/rincian?id_santri=${idSantri}&page=${mode}`
    if (tahunAjaran) {
      url += `&tahun_ajaran=${encodeURIComponent(tahunAjaran)}`
    }
    const response = await api.get(url)
    return response.data
  },

  getPaymentHistory: async (idTunggakan, mode = 'tunggakan') => {
    const params = mode === 'khusus'
      ? `id_khusus=${idTunggakan}&page=${mode}`
      : `id_tunggakan=${idTunggakan}&page=${mode}`
    const response = await api.get(`/payment/history?${params}`)
    return response.data
  },

  savePayment: async (data) => {
    const response = await api.post('/payment/create', data)
    return response.data
  },

  deletePayment: async (paymentId, mode = 'tunggakan') => {
    const response = await api.post('/payment/delete', { id_bayar: paymentId, page: mode })
    return response.data
  },

  insertTunggakanKhusus: async (data, mode = 'tunggakan') => {
    const response = await api.post('/payment/insert', { ...data, page: mode })
    return response.data
  },

  updateTunggakanKhusus: async (data, mode = 'tunggakan') => {
    const response = await api.post('/payment/update', { ...data, page: mode })
    return response.data
  },

  deleteTunggakanKhusus: async (id, mode = 'tunggakan') => {
    const response = await api.post('/payment/delete-item', { id, page: mode })
    return response.data
  },

  checkRelatedPayment: async (id, mode = 'tunggakan') => {
    const response = await api.post('/payment/check-related', { id, page: mode })
    return response.data
  },

  /** Daftar tahun ajaran UWABA (untuk riwayat pembayaran). Public endpoint + token untuk id_santri. */
  getPublicUwabaTahunList: async (idSantri = null) => {
    const params = {}
    if (idSantri != null && idSantri !== '') {
      params.id_santri = idSantri
      const cfg = await publicPaymentAxiosConfig(idSantri, 'uwaba')
      const response = await api.get('/public/pembayaran/uwaba/tahun-list', { params, ...cfg })
      return response.data
    }
    const response = await api.get('/public/pembayaran/uwaba/tahun-list', { params })
    return response.data
  },

  /** Rincian pembayaran by santri (mode: uwaba, khusus, tunggakan). Public endpoint + token. */
  getPublicRincian: async (idSantri, mode, tahunAjaran = null) => {
    const params = { id_santri: idSantri }
    if (tahunAjaran) params.tahun_ajaran = tahunAjaran
    const cfg = await publicPaymentAxiosConfig(idSantri, mode)
    const response = await api.get(`/public/pembayaran/${mode}`, { params, ...cfg })
    return response.data
  }
}

// Uwaba API
export const uwabaAPI = {
  getPrices: async () => {
    // Load dari JSON file lokal
    try {
      const response = await fetch('/js/uwaba/uwaba-prices.json')
      if (response.ok) {
        const data = await response.json()
        return { success: true, data }
      }
      throw new Error('Failed to load prices')
    } catch (error) {
      console.error('Error loading uwaba prices:', error)
      return { success: false, message: error.message }
    }
  },

  getData: async (idSantri, tahunAjaran) => {
    const response = await api.get(`/uwaba?id=${idSantri}&tahun_ajaran=${tahunAjaran}`)
    return response.data
  },

  /** Semua baris uwaba santri (semua tahun ajaran), GET /api/uwaba/all-rows */
  getAllRowsForSantri: async (idSantri) => {
    const response = await api.get(`/uwaba/all-rows?id=${encodeURIComponent(idSantri)}`)
    return response.data
  },

  getStatusSantriOptions: async () => {
    const response = await api.get('/uwaba/status-santri-options')
    return response.data
  },

  saveRefresh: async (data) => {
    const response = await api.post('/uwaba/save-refresh', data)
    return response.data
  },

  savePayment: async (data) => {
    const response = await api.post('/payment/syahriah/save', data)
    return response.data
  },

  getPaymentHistory: async (idSantri, tahunAjaran) => {
    const response = await api.post('/payment/syahriah/history', {
      id_santri: idSantri,
      tahun_ajaran: tahunAjaran
    })
    return response.data
  },

  deletePayment: async (paymentId) => {
    const response = await api.post('/payment/syahriah/delete', { id: paymentId })
    return response.data
  },

  lengkapiData: async (idSantri, tahunAjaran, formData, options = {}) => {
    const body = {
      id_santri: idSantri,
      tahun_ajaran: tahunAjaran,
      form_data: formData,
      mode: options.mode === 'edit' ? 'edit' : 'create',
    }
    if (Array.isArray(options.idBulans) && options.idBulans.length > 0) {
      body.id_bulans = options.idBulans
    }
    const response = await api.post('/uwaba/lengkapi-data', body)
    return response.data
  }
}

// Pendaftaran API
export const pendaftaranAPI = {
  getKategoriOptions: async (statusSantri = '') => {
    const params = statusSantri ? `?status_santri=${encodeURIComponent(statusSantri)}` : ''
    const response = await api.get(`/pendaftaran/kategori-options${params}`)
    return response.data
  },
  getDaerahOptions: async (kategori) => {
    const params = kategori ? `?kategori=${encodeURIComponent(kategori)}` : ''
    const response = await api.get(`/pendaftaran/daerah-options${params}`)
    return response.data
  },
  getKamarOptions: async (idDaerah) => {
    const response = await api.get(`/pendaftaran/kamar-options?id_daerah=${idDaerah}`)
    return response.data
  },
  getRombelOptions: async (jenis) => {
    const response = await api.get(`/pendaftaran/rombel-options?jenis=${encodeURIComponent(jenis)}`)
    return response.data
  },
  getLembagaOptions: async (jenis) => {
    const response = await api.get(`/pendaftaran/lembaga-options?jenis=${encodeURIComponent(jenis)}`)
    return response.data
  },
  getKelasOptions: async (lembagaId) => {
    const response = await api.get(`/pendaftaran/kelas-options?lembaga_id=${encodeURIComponent(lembagaId)}`)
    return response.data
  },
  getKelOptions: async (lembagaId, kelas) => {
    const params = new URLSearchParams({ lembaga_id: lembagaId })
    if (kelas != null && kelas !== '') params.append('kelas', kelas)
    const response = await api.get(`/pendaftaran/kel-options?${params.toString()}`)
    return response.data
  },
  getRincian: async (idSantri) => {
    const response = await api.get(`/pendaftaran/rincian?id_santri=${idSantri}`)
    return response.data
  },

  /** Riwayat pembayaran PSB — id = id_registrasi (alias query id_pendaftaran). */
  getHistory: async (idPendaftaran) => {
    const response = await api.get(`/pendaftaran/history?id_pendaftaran=${idPendaftaran}`)
    return response.data
  },

  createPayment: async (data) => {
    const response = await api.post('/pendaftaran/create-payment', data)
    return response.data
  },

  deletePayment: async (idBayar) => {
    const response = await api.post('/pendaftaran/delete-payment', { id_bayar: idBayar })
    return response.data
  },

  insertPendaftaran: async (data) => {
    const response = await api.post('/pendaftaran/insert', data)
    return response.data
  },

  updatePendaftaran: async (data) => {
    const response = await api.post('/pendaftaran/update', data)
    return response.data
  },

  deletePendaftaran: async (id) => {
    const response = await api.post('/pendaftaran/delete-item', { id })
    return response.data
  },

  saveBiodata: async (data) => {
    // Header agar backend log WA satu tabel dengan daftar dan cegah kirim ganda (throttle)
    const response = await api.post('/pendaftaran/save-biodata', data, {
      headers: { 'X-App-Source': 'uwaba' }
    })
    return response.data
  },

  getRegistrasi: async (idSantri, tahunHijriyah = null, tahunMasehi = null) => {
    const th = tahunHijriyah != null ? String(tahunHijriyah).trim() : ''
    const tm = tahunMasehi != null ? String(tahunMasehi).trim() : ''
    if (!th || !tm) {
      return {
        success: false,
        data: null,
        message: 'tahun_hijriyah dan tahun_masehi wajib diisi sebelum mengambil registrasi'
      }
    }
    try {
      const params = new URLSearchParams()
      params.append('id_santri', idSantri)
      params.append('tahun_hijriyah', th)
      params.append('tahun_masehi', tm)
      const response = await api.get(`/pendaftaran/get-registrasi?${params.toString()}`)
      return response.data
    } catch (error) {
      const msg = error.response?.data?.message || error.message || 'Gagal mengambil registrasi'
      return { success: false, data: null, message: msg }
    }
  },

  // Santri Berkas API (v2 - upload ke folder uploads di luar public)
  uploadBerkas: async (idSantri, jenisBerkas, file, keterangan = null) => {
    const formData = new FormData()
    formData.append('id_santri', idSantri)
    formData.append('jenis_berkas', jenisBerkas)
    formData.append('file', file)
    if (keterangan) {
      formData.append('keterangan', keterangan)
    }
    const response = await api.post('/v2/santri-berkas/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
        'X-App-Source': 'uwaba'
      }
    })
    return response.data
  },

  getBerkasList: async (idSantri, jenisBerkas = null) => {
    const params = new URLSearchParams()
    params.append('id_santri', idSantri)
    if (jenisBerkas && jenisBerkas !== '') {
      params.append('jenis_berkas', jenisBerkas)
    }
    const response = await api.get(`/v2/santri-berkas/list?${params.toString()}`)
    return response.data
  },

  deleteBerkas: async (idBerkas) => {
    const response = await api.post('/v2/santri-berkas/delete', { id: idBerkas })
    return response.data
  },

  updateBerkas: async (formData) => {
    const response = await api.post('/v2/santri-berkas/update', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
        'X-App-Source': 'uwaba'
      }
    })
    return response.data
  },

  downloadBerkas: async (idBerkas) => {
    const response = await api.get(`/v2/santri-berkas/download?id=${idBerkas}`, {
      responseType: 'blob'
    })
    return response.data
  },

  linkBerkas: async (idSantri, jenisBerkas, idBerkasSource, jenisBerkasSource = null) => {
    const data = {
      id_santri: idSantri,
      jenis_berkas: jenisBerkas,
      id_berkas_source: idBerkasSource
    }
    if (jenisBerkasSource) {
      data.jenis_berkas_source = jenisBerkasSource
    }
    const response = await api.post('/v2/santri-berkas/link', data)
    return response.data
  },

  markTidakAda: async (idSantri, jenisBerkas) => {
    const response = await api.post('/v2/santri-berkas/mark-tidak-ada', { id_santri: idSantri, jenis_berkas: jenisBerkas }, {
      headers: { 'X-App-Source': 'uwaba' }
    })
    return response.data
  },

  unmarkTidakAda: async (idSantri, jenisBerkas) => {
    const response = await api.post('/v2/santri-berkas/unmark-tidak-ada', { id_santri: idSantri, jenis_berkas: jenisBerkas }, {
      headers: { 'X-App-Source': 'uwaba' }
    })
    return response.data
  },

  saveRegistrasi: async (data) => {
    const response = await api.post('/pendaftaran/save-registrasi', data)
    return response.data
  },

  getTesMadin: async (idSantri, tahunHijriyah, tahunMasehi, idRegistrasi = null) => {
    const th = tahunHijriyah != null ? String(tahunHijriyah).trim() : ''
    const tm = tahunMasehi != null ? String(tahunMasehi).trim() : ''
    const q = new URLSearchParams({
      id_santri: String(idSantri),
      tahun_hijriyah: th,
      tahun_masehi: tm
    })
    const regId = idRegistrasi != null ? Number(idRegistrasi) : 0
    if (Number.isFinite(regId) && regId > 0) {
      q.set('id_registrasi', String(regId))
    }
    const response = await api.get(`/pendaftaran/get-tes-madin?${q.toString()}`)
    return response.data
  },

  saveTesMadin: async (data) => {
    const response = await api.post('/pendaftaran/save-tes-madin', data)
    return response.data
  },

  updateRegistrasiTahunAjaran: async (data) => {
    const response = await api.post('/pendaftaran/update-registrasi-tahun-ajaran', data)
    return response.data
  },

  updateKeteranganStatus: async (data) => {
    const response = await api.post('/pendaftaran/update-keterangan-status', data)
    return response.data
  },

  /** Bulk update kolom psb___registrasi (kondisi pembayaran). Body: { updates: [ { id_registrasi, status_pendaftar?, keterangan_status?, daftar_formal?, daftar_diniyah?, gelombang? }, ... ] } */
  bulkUpdateRegistrasi: async (payload) => {
    const response = await api.post('/pendaftaran/bulk-update-registrasi', payload)
    return response.data
  },

  createSantri: async (data) => {
    const response = await api.post('/pendaftaran/create-santri', data)
    return response.data
  },

  searchByNik: async (nik) => {
    const response = await api.get(`/pendaftaran/search-by-nik?nik=${nik}`)
    return response.data
  },

  getPendaftarIds: async (tahunAjaran, tahunMasehi) => {
    const params = new URLSearchParams()
    if (tahunAjaran && tahunAjaran !== '') {
      params.append('tahun_ajaran', tahunAjaran)
    }
    if (tahunMasehi && tahunMasehi !== '') {
      params.append('tahun_masehi', tahunMasehi)
    }
    const queryString = params.toString()
    const url = queryString
      ? `/pendaftaran/get-pendaftar-ids?${queryString}`
      : '/pendaftaran/get-pendaftar-ids'
    const response = await api.get(url)
    return response.data
  },

  /**
   * @param {string} [tahunHijriyah]
   * @param {string} [tahunMasehi]
   * @param {string} [since] — watermark sinkron (tanggal_update / tanggal_dibuat registrasi); hanya baris yang lebih baru
   */
  getAllPendaftar: async (tahunHijriyah, tahunMasehi, since, options = {}) => {
    const params = new URLSearchParams()
    if (tahunHijriyah && tahunHijriyah !== '') {
      params.append('tahun_hijriyah', tahunHijriyah)
    }
    if (tahunMasehi && tahunMasehi !== '') {
      params.append('tahun_masehi', tahunMasehi)
    }
    if (since && String(since).trim() !== '') {
      params.append('since', String(since).trim())
    }
    if (options?.forTesMasuk) {
      params.append('for_tes_masuk', '1')
    }
    if (options?.includePii) {
      params.append('include_pii', '1')
    }
    const queryString = params.toString()
    const url = queryString
      ? `/pendaftaran/get-all-pendaftar?${queryString}`
      : '/pendaftaran/get-all-pendaftar'
    const response = await api.get(url)
    return response.data
  },

  /** Ringkasan pembayaran, breakdown, potensi duplikasi — wajib tahun_hijriyah + tahun_masehi */
  getAnalisisPendaftar: async (tahunHijriyah, tahunMasehi) => {
    const params = new URLSearchParams()
    if (tahunHijriyah && String(tahunHijriyah).trim() !== '') {
      params.append('tahun_hijriyah', String(tahunHijriyah).trim())
    }
    if (tahunMasehi && String(tahunMasehi).trim() !== '') {
      params.append('tahun_masehi', String(tahunMasehi).trim())
    }
    const q = params.toString()
    const url = q ? `/pendaftaran/analisis-pendaftar?${q}` : '/pendaftaran/analisis-pendaftar'
    const response = await api.get(url)
    return response.data
  },

  getAllRegistrasiBySantri: async (idSantri) => {
    const response = await api.get(`/pendaftaran/get-all-registrasi-by-santri?id_santri=${idSantri}`)
    return response.data
  },

  deleteRegistrasi: async (idRegistrasiList, hapusDiTabelSantri = false) => {
    const response = await api.post('/pendaftaran/delete-registrasi', {
      id_registrasi: idRegistrasiList,
      hapus_di_tabel_santri: hapusDiTabelSantri
    })
    return response.data
  },

  findSimilarSantri: async (nik = null, nama = null, idSantri = null) => {
    const params = new URLSearchParams()
    if (nik) params.append('nik', nik)
    if (nama) params.append('nama', nama)
    if (idSantri) params.append('id_santri', idSantri)
    const queryString = params.toString()
    const url = queryString
      ? `/pendaftaran/find-similar-santri?${queryString}`
      : '/pendaftaran/find-similar-santri'
    const response = await api.get(url)
    return response.data
  },

  mergeSantri: async (idSantriUtama, idSantriSekunder, options = {}) => {
    const body = {
      id_santri_utama: idSantriUtama,
      id_santri_sekunder: idSantriSekunder,
      ...options,
    }
    const response = await api.post('/pendaftaran/merge-santri', body)
    return response.data
  },

  getMergeSantriPreview: async (idSantriA, idSantriB) => {
    const response = await api.get(
      `/pendaftaran/merge-santri-preview?id_santri_a=${encodeURIComponent(idSantriA)}&id_santri_b=${encodeURIComponent(idSantriB)}`
    )
    return response.data
  },

  listNisPengajuan: async (status = '') => {
    const q = status ? `?status=${encodeURIComponent(status)}` : ''
    const response = await api.get(`/pendaftaran/nis-pengajuan${q}`)
    return response.data
  },

  getNisPengajuan: async (id) => {
    const response = await api.get(`/pendaftaran/nis-pengajuan/${id}`)
    return response.data
  },

  patchNisPengajuan: async (id, payload) => {
    const response = await api.patch(`/pendaftaran/nis-pengajuan/${id}`, payload)
    return response.data
  },

  kirimNisPengajuan: async (id) => {
    const response = await api.post(`/pendaftaran/nis-pengajuan/${id}/kirim-nis`)
    return response.data
  },

  tolakNisPengajuan: async (id, kirimWa = true) => {
    const response = await api.post(`/pendaftaran/nis-pengajuan/${id}/tolak`, { kirim_wa: !!kirimWa })
    return response.data
  },

  fetchNisPengajuanKkBlob: async (id) => {
    const response = await api.get(`/pendaftaran/nis-pengajuan/${id}/kk`, { responseType: 'blob' })
    const blob = response.data
    if (!(blob instanceof Blob) || blob.size === 0) return null
    return blob
  },

  getNisPengajuanKkBerkasInfo: async (id) => {
    const response = await api.get(`/pendaftaran/nis-pengajuan/${id}/kk-berkas-info`)
    return response.data
  },

  syncNisPengajuanKkBerkas: async (id, action, syncBiodata = true) => {
    const response = await api.post(`/pendaftaran/nis-pengajuan/${id}/sync-kk-berkas`, {
      action,
      sync_biodata: syncBiodata,
    })
    return response.data
  },

  getTahunAjaranList: async () => {
    const response = await api.get('/pendaftaran/get-tahun-ajaran-list')
    return response.data
  },

  getTransaksi: async (idRegistrasi) => {
    const response = await api.get(`/pendaftaran/get-transaksi?id_registrasi=${idRegistrasi}`)
    return response.data
  },

  deleteTransaksi: async (idTransaksi) => {
    const response = await api.post('/pendaftaran/delete-transaksi', { id: idTransaksi })
    return response.data
  },

  getRegistrasiById: async (idRegistrasi) => {
    const response = await api.get(`/pendaftaran/get-registrasi-by-id?id_registrasi=${idRegistrasi}`)
    return response.data
  },

  getRegistrasiDetail: async (idRegistrasi) => {
    const response = await api.get(`/pendaftaran/get-registrasi-detail?id_registrasi=${idRegistrasi}`)
    return response.data
  },

  updateRegistrasiDetail: async (data) => {
    const response = await api.post('/pendaftaran/update-registrasi-detail', data)
    return response.data
  },

  bulkUpdateRegistrasiDetail: async (details) => {
    console.log('Sending bulk update - details array:', details)
    console.log('Sending bulk update - payload structure:', { details })

    // Pastikan details adalah array
    if (!Array.isArray(details)) {
      console.error('Details is not an array:', details)
      throw new Error('Details must be an array')
    }

    const payload = { details }
    console.log('Sending bulk update - final payload:', payload)

    const response = await api.post('/pendaftaran/bulk-update-registrasi-detail', payload, {
      headers: {
        'Content-Type': 'application/json'
      }
    })
    return response.data
  },

  getItemList: async (kategori = null, search = null) => {
    const params = new URLSearchParams()
    if (kategori && kategori !== '') {
      params.append('kategori', kategori)
    }
    if (search && search !== '') {
      params.append('search', search)
    }
    const queryString = params.toString()
    const url = queryString
      ? `/pendaftaran/get-item-list?${queryString}`
      : '/pendaftaran/get-item-list'
    const response = await api.get(url)
    return response.data
  },
  getItemRekap: async (kategori = null, search = null, tahunHijriyah = null, tahunMasehi = null) => {
    const params = new URLSearchParams()
    if (kategori && kategori !== '') {
      params.append('kategori', kategori)
    }
    if (search && search !== '') {
      params.append('search', search)
    }
    if (tahunHijriyah && tahunHijriyah !== '') {
      params.append('tahun_hijriyah', tahunHijriyah)
    }
    if (tahunMasehi && tahunMasehi !== '') {
      params.append('tahun_masehi', tahunMasehi)
    }
    const queryString = params.toString()
    const url = queryString
      ? `/pendaftaran/item-rekap?${queryString}`
      : '/pendaftaran/item-rekap'
    const response = await api.get(url)
    return response.data
  },

  addItemToDetail: async (idRegistrasi, idItem) => {
    const response = await api.post('/pendaftaran/add-item-to-detail', {
      id_registrasi: idRegistrasi,
      id_item: idItem
    })
    return response.data
  },
  deleteRegistrasiDetail: async (id) => {
    const response = await api.post('/pendaftaran/delete-registrasi-detail', { id })
    return response.data
  },

  autoAssignItems: async (idRegistrasi, idAdmin = null) => {
    const data = { id_registrasi: idRegistrasi }
    if (idAdmin) {
      data.id_admin = idAdmin
    }
    const response = await api.post('/pendaftaran/auto-assign-items', data)
    return response.data
  },

  /**
   * Item + harga sesuai kondisi (satu logika backend untuk daftar & uwaba).
   * Body: { status_pendaftar?, daftar_formal?, daftar_diniyah?, status_murid? (tidak mempengaruhi matching harga), status_santri?, gender?, gelombang? }
   * Returns: { success, data: { items: [...], total_wajib, matching_set_ids } }
   */
  getItemsByKondisi: async (kondisi = {}) => {
    const response = await api.post('/pendaftaran/items-by-kondisi', kondisi)
    return response.data
  },

  getLastPendaftar: async (tahunHijriyah = null, tahunMasehi = null, lembagaId = null, statusPendaftar = null) => {
    const params = new URLSearchParams()
    if (tahunHijriyah && tahunHijriyah !== '') {
      params.append('tahun_hijriyah', tahunHijriyah)
    }
    if (tahunMasehi && tahunMasehi !== '') {
      params.append('tahun_masehi', tahunMasehi)
    }
    if (lembagaId != null && String(lembagaId).trim() !== '') {
      params.append('lembaga_id', String(lembagaId).trim())
    }
    if (statusPendaftar != null && String(statusPendaftar).trim() !== '') {
      params.append('status_pendaftar', String(statusPendaftar).trim())
    }
    const queryString = params.toString()
    const url = queryString
      ? `/pendaftaran/get-last-pendaftar?${queryString}`
      : '/pendaftaran/get-last-pendaftar'
    const response = await api.get(url)
    return response.data
  },

  getDashboard: async (tahunHijriyah = null, tahunMasehi = null, lembagaId = null, statusPendaftar = null) => {
    const params = new URLSearchParams()
    if (tahunHijriyah && tahunHijriyah !== '') {
      params.append('tahun_hijriyah', tahunHijriyah)
    }
    if (tahunMasehi && tahunMasehi !== '') {
      params.append('tahun_masehi', tahunMasehi)
    }
    if (lembagaId != null && String(lembagaId).trim() !== '') {
      params.append('lembaga_id', String(lembagaId).trim())
    }
    if (statusPendaftar != null && String(statusPendaftar).trim() !== '') {
      params.append('status_pendaftar', String(statusPendaftar).trim())
    }
    const queryString = params.toString()
    const url = queryString
      ? `/pendaftaran/dashboard?${queryString}`
      : '/pendaftaran/dashboard'
    const response = await api.get(url)
    return response.data
  },

  /** Pendapatan hari ini dari transaksi pendaftaran (filter tahun ajaran) */
  getPendapatanHariIni: async (tahunHijriyah, tahunMasehi) => {
    const params = new URLSearchParams()
    if (tahunHijriyah && tahunHijriyah !== '') params.append('tahun_hijriyah', tahunHijriyah)
    if (tahunMasehi && tahunMasehi !== '') params.append('tahun_masehi', tahunMasehi)
    const queryString = params.toString()
    const url = queryString ? `/pendaftaran/pendapatan-hari-ini?${queryString}` : '/pendaftaran/pendapatan-hari-ini'
    const response = await api.get(url)
    return response.data
  },

  createItem: async (data) => {
    const response = await api.post('/pendaftaran/create-item', data)
    return response.data
  },
  updateItem: async (id, data) => {
    const response = await api.post('/pendaftaran/update-item', { id, ...data })
    return response.data
  },
  deleteItem: async (id) => {
    const response = await api.post('/pendaftaran/delete-item-psb', { id })
    return response.data
  },

  createPaymentPsb: async (data) => {
    const response = await api.post('/pendaftaran/create-payment-psb', data)
    return response.data
  },

  // Item Set APIs
  getItemSets: async (includeInactive = false) => {
    const params = new URLSearchParams()
    if (includeInactive) {
      params.append('include_inactive', 'true')
    }
    const queryString = params.toString()
    const url = queryString ? `/pendaftaran/item-sets?${queryString}` : '/pendaftaran/item-sets'
    const response = await api.get(url)
    return response.data
  },
  getUniqueKondisiFromRegistrasi: async (page = 1, limit = 20, filters = {}) => {
    const params = new URLSearchParams()
    params.append('page', page)
    params.append('limit', limit)
    Object.entries(filters).forEach(([key, value]) => {
      if (value != null && String(value).trim() !== '') {
        params.append(key, String(value).trim())
      }
    })
    const response = await api.get(`/pendaftaran/unique-kondisi-from-registrasi?${params.toString()}`)
    return response.data
  },
  getRegistrasiByKondisi: async (condition) => {
    const response = await api.post('/pendaftaran/registrasi-by-kondisi', { condition })
    return response.data
  },
  getItemSet: async (id) => {
    const response = await api.get(`/pendaftaran/item-set/${id}`)
    return response.data
  },
  createItemSet: async (data) => {
    const response = await api.post('/pendaftaran/item-set', data)
    return response.data
  },
  updateItemSet: async (id, data) => {
    const response = await api.put(`/pendaftaran/item-set/${id}`, data)
    return response.data
  },
  deleteItemSet: async (id) => {
    const response = await api.delete(`/pendaftaran/item-set/${id}`)
    return response.data
  },

  // Kondisi Field APIs
  getKondisiFields: async (includeInactive = false) => {
    const params = new URLSearchParams()
    if (includeInactive) {
      params.append('include_inactive', 'true')
    }
    const queryString = params.toString()
    const url = queryString ? `/pendaftaran/kondisi-fields?${queryString}` : '/pendaftaran/kondisi-fields'
    const response = await api.get(url)
    return response.data
  },
  getKondisiField: async (id) => {
    const response = await api.get(`/pendaftaran/kondisi-field/${id}`)
    return response.data
  },
  createKondisiField: async (data) => {
    const response = await api.post('/pendaftaran/kondisi-field', data)
    return response.data
  },
  updateKondisiField: async (id, data) => {
    const response = await api.put(`/pendaftaran/kondisi-field/${id}`, data)
    return response.data
  },
  deleteKondisiField: async (id) => {
    const response = await api.delete(`/pendaftaran/kondisi-field/${id}`)
    return response.data
  },

  // Kondisi Value APIs
  getKondisiValues: async (idField = null, fieldName = null, includeInactive = false) => {
    const params = new URLSearchParams()
    if (idField) {
      params.append('id_field', idField)
    }
    if (fieldName) {
      params.append('field_name', fieldName)
    }
    if (includeInactive) {
      params.append('include_inactive', 'true')
    }
    const queryString = params.toString()
    const url = queryString ? `/pendaftaran/kondisi-values?${queryString}` : '/pendaftaran/kondisi-values'
    const response = await api.get(url)
    return response.data
  },
  getKondisiValue: async (id) => {
    const response = await api.get(`/pendaftaran/kondisi-value/${id}`)
    return response.data
  },
  createKondisiValue: async (data) => {
    const response = await api.post('/pendaftaran/kondisi-value', data)
    return response.data
  },
  updateKondisiValue: async (id, data) => {
    const response = await api.put(`/pendaftaran/kondisi-value/${id}`, data)
    return response.data
  },
  deleteKondisiValue: async (id) => {
    const response = await api.delete(`/pendaftaran/kondisi-value/${id}`)
    return response.data
  }
}

// Pengaturan API
export const pengaturanAPI = {
  getAll: async (kategori = null) => {
    const url = kategori 
      ? `/pengaturan?kategori=${encodeURIComponent(kategori)}`
      : '/pengaturan'
    const response = await api.get(url)
    return response.data
  },

  getByKey: async (key) => {
    const response = await api.get(`/pengaturan/${key}`)
    return response.data
  },

  create: async (data) => {
    const response = await api.post('/pengaturan', data)
    return response.data
  },

  update: async (id, data) => {
    const response = await api.put(`/pengaturan/${id}`, data)
    return response.data
  },

  updateByKey: async (key, data) => {
    const response = await api.put(`/pengaturan/key/${key}`, data)
    return response.data
  },

  delete: async (id) => {
    const response = await api.delete(`/pengaturan/${id}`)
    return response.data
  },

  uploadImage: async (key, file) => {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('key', key)
    
    const response = await api.post('/pengaturan/upload-image', formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    })
    return response.data
  }
}

// Payment Gateway API
export const paymentGatewayAPI = {
  getAllConfig: async () => {
    const response = await api.get('/payment-gateway/config')
    return response.data
  },

  getActiveConfig: async () => {
    const response = await api.get('/payment-gateway/config/active')
    return response.data
  },

  getConfigById: async (id) => {
    const response = await api.get(`/payment-gateway/config/${id}`)
    return response.data
  },

  updateConfig: async (id, data) => {
    const response = await api.put(`/payment-gateway/config/${id}`, data)
    return response.data
  },

  switchMode: async (productionMode) => {
    const response = await api.post('/payment-gateway/config/switch-mode', {
      production_mode: productionMode
    })
    return response.data
  },

  getServerInfo: async () => {
    const response = await api.get('/payment-gateway/server-info')
    return response.data
  },

  getMybeddianProvider: async () => {
    const response = await api.get('/payment-gateway/mybeddian-provider')
    return response.data
  },

  putMybeddianProvider: async (provider) => {
    const response = await api.put('/payment-gateway/mybeddian-provider', { provider })
    return response.data
  },
}

// Laporan API
export const laporanAPI = {
  getLaporan: async (mode = 'tunggakan', filters = {}) => {
    const params = new URLSearchParams()
    params.append('page', mode)

    if (filters.tanggal && !filters.showAll) {
      params.append('tanggal', filters.tanggal)
    }
    if (filters.tahun_ajaran) {
      params.append('tahun_ajaran', filters.tahun_ajaran)
    }
    if (filters.admin) {
      params.append('admin', filters.admin)
    }

    const response = await api.get(`/laporan?${params.toString()}`)
    return response.data
  }
}

// Dashboard API
export const dashboardAPI = {
  getDashboard: async (groupBy = 'keterangan_1', tahunAjaran = null, tahunAjaranMasehi = null) => {
    let url = `/dashboard?group_by=${groupBy}`
    if (tahunAjaran) {
      url += `&tahun_ajaran=${tahunAjaran}`
    }
    if (tahunAjaranMasehi) {
      url += `&tahun_ajaran_masehi=${tahunAjaranMasehi}`
    }
    const response = await api.get(url)
    return response.data
  },

  getManageDataRevision: async (queryParams = {}, opts = {}) => {
    const { signal } = opts || {}
    const response = await api.get('/dashboard/manage-data/revision', {
      params: queryParams,
      ...(signal ? { signal } : {}),
    })
    return response.data
  },

  getDataSantri: async (tahunAjaran, opts = {}) => {
    const { limit, offset, cursor, signal } = opts
    let url = `/dashboard/data-santri?tahun_ajaran=${encodeURIComponent(tahunAjaran || '')}`
    if (limit != null && limit !== '') {
      url += `&limit=${Number(limit)}`
      const cur = Number(cursor || 0)
      if (cur > 0) {
        url += `&cursor=${cur}&offset=0`
      } else {
        url += `&offset=${Number(offset || 0)}`
      }
    }
    const response = await api.get(url, signal ? { signal } : undefined)
    return response.data
  },
  getDataKhusus: async (tahunAjaran, tahunAjaranMasehi, showAll = false, belumAdaKewajiban = false, opts = {}) => {
    const { limit, offset, cursor, cursor_sid, cursor_kid, signal } = opts || {}
    let url = '/dashboard/data-khusus'
    const params = []
    if (belumAdaKewajiban) {
      params.push(`belum_ada_kewajiban=true`)
    } else {
      if (showAll) {
        params.push(`show_all=true`)
      } else {
        if (tahunAjaran) {
          params.push(`tahun_ajaran=${encodeURIComponent(tahunAjaran)}`)
        }
        if (tahunAjaranMasehi) {
          params.push(`tahun_ajaran_masehi=${encodeURIComponent(tahunAjaranMasehi)}`)
        }
      }
    }
    if (limit != null && limit !== '') {
      params.push(`limit=${Number(limit)}`)
      const cur = Number(cursor || 0)
      const cs = Number(cursor_sid || 0)
      const ck = Number(cursor_kid || 0)
      if (cur > 0) {
        params.push(`cursor=${cur}`)
        params.push(`offset=0`)
      } else if (cs > 0 || ck > 0) {
        params.push(`cursor_sid=${cs}`)
        params.push(`cursor_kid=${ck}`)
        params.push(`offset=0`)
      } else {
        params.push(`offset=${Number(offset || 0)}`)
      }
    }
    if (params.length > 0) {
      url += '?' + params.join('&')
    }
    const response = await api.get(url, signal ? { signal } : undefined)
    return response.data
  },
  getDataTunggakan: async (tahunAjaran, tahunAjaranMasehi, showAll = false, belumAdaKewajiban = false, opts = {}) => {
    const { limit, offset, cursor, cursor_sid, cursor_tid, signal } = opts || {}
    let url = '/dashboard/data-tunggakan'
    const params = []
    if (belumAdaKewajiban) {
      params.push(`belum_ada_kewajiban=true`)
    } else {
      if (showAll) {
        params.push(`show_all=true`)
      } else {
        if (tahunAjaran) params.push(`tahun_ajaran=${encodeURIComponent(tahunAjaran)}`)
        if (tahunAjaranMasehi) params.push(`tahun_ajaran_masehi=${encodeURIComponent(tahunAjaranMasehi)}`)
      }
    }
    if (limit != null && limit !== '') {
      params.push(`limit=${Number(limit)}`)
      const cur = Number(cursor || 0)
      const cs = Number(cursor_sid || 0)
      const ct = Number(cursor_tid || 0)
      if (cur > 0) {
        params.push(`cursor=${cur}`)
        params.push(`offset=0`)
      } else if (cs > 0 || ct > 0) {
        params.push(`cursor_sid=${cs}`)
        params.push(`cursor_tid=${ct}`)
        params.push(`offset=0`)
      } else {
        params.push(`offset=${Number(offset || 0)}`)
      }
    }
    if (params.length > 0) url += '?' + params.join('&')
    const response = await api.get(url, signal ? { signal } : undefined)
    return response.data
  },

  getKelompokDetail: async (tipe, groupBy, groupValue) => {
    const response = await api.get(`/dashboard/kelompok-detail?tipe=${tipe}&group_by=${groupBy}&group_value=${encodeURIComponent(groupValue)}`)
    return response.data
  },

  updateKelompok: async (data) => {
    const response = await api.post('/dashboard/update-kelompok', data)
    return response.data
  },

  /** Progress job kirim WA massal Manage Data (tab uwaba / khusus / tunggakan). */
  getWaBulkActive: async (page) => {
    const response = await api.get('/dashboard/manage-data/wa-bulk/active', {
      params: { page },
    })
    return response.data
  },

  startWaBulk: async (body) => {
    const response = await api.post('/dashboard/manage-data/wa-bulk/start', body)
    return response.data
  },

  cancelWaBulk: async (jobId) => {
    const response = await api.post('/dashboard/manage-data/wa-bulk/cancel', {
      job_id: jobId != null && jobId !== '' ? jobId : undefined,
    })
    return response.data
  },
}

// Chat user-to-user (percakapan, daftar user, riwayat pesan)
export const chatUserAPI = {
  /** users.id yang login (untuk daftar socket agar receive_message sampai). */
  getMe: () => api.get('/chat/me').then((r) => r.data),
  putChatPrivacy: (body = {}) => api.put('/chat/me/privacy', body).then((r) => r.data),
  getConversations: (params = {}) => api.get('/chat/conversations', { params }).then((r) => r.data),
  getUsers: () => api.get('/chat/users').then((r) => r.data),
  getUserPhotoBlob: (userId) => api.get(`/chat/users/${encodeURIComponent(userId)}/photo`, {
    responseType: 'blob',
    validateStatus: (status) => status === 200 || status === 204,
  }).then((r) => {
    if (r.status === 204) return null
    const blob = r.data
    if (!(blob instanceof Blob) || blob.size === 0) return null
    return blob
  }),
  /** Foto grup (blob + cookie auth) — jangan pakai URL /uploads langsung di img. */
  getGroupPhotoBlob: (conversationId) => api.get(`/chat/conversations/${encodeURIComponent(conversationId)}/photo`, {
    responseType: 'blob',
    validateStatus: (status) => status === 200 || status === 204,
  }).then((r) => {
    if (r.status === 204) return null
    const blob = r.data
    if (!(blob instanceof Blob) || blob.size === 0) return null
    return blob
  }),
  /** Keluar dari percakapan / hapus dari daftar (hapus membership; grup lain tetap ada). */
  deleteConversation: (conversationId) => api.delete(`/chat/conversations/${encodeURIComponent(conversationId)}`).then((r) => r.data),
  /** Detail anggota grup untuk panel info grup. */
  getConversationMembers: (conversationId) => api.get(`/chat/conversations/${encodeURIComponent(conversationId)}/members`).then((r) => r.data),
  /** Tambah anggota ke grup (khusus admin grup). */
  addConversationMembers: (conversationId, body = {}) => api.post(`/chat/conversations/${encodeURIComponent(conversationId)}/members`, body).then((r) => r.data),
  /** Keluarkan anggota grup (khusus admin grup). */
  removeConversationMember: (conversationId, userId) => api.delete(`/chat/conversations/${encodeURIComponent(conversationId)}/members/${encodeURIComponent(userId)}`).then((r) => r.data),
  /** Ubah status admin anggota grup (khusus admin grup). */
  setConversationMemberAdmin: (conversationId, userId, isAdmin) => api.patch(
    `/chat/conversations/${encodeURIComponent(conversationId)}/members/${encodeURIComponent(userId)}/admin`,
    { is_admin: Boolean(isAdmin) }
  ).then((r) => r.data),
  markConversationDelivered: (conversationId) =>
    api.post(`/chat/conversations/${encodeURIComponent(conversationId)}/delivered`).then((r) => r.data),
  getMessageReceipts: (messageId) =>
    api.get(`/chat/messages/${encodeURIComponent(messageId)}/receipts`).then((r) => r.data),
  editChatMessage: (messageId, body = {}) =>
    api.put(`/chat/messages/${encodeURIComponent(messageId)}`, body).then((r) => r.data),
  deleteChatMessage: (messageId) =>
    api.delete(`/chat/messages/${encodeURIComponent(messageId)}`).then((r) => r.data),
  searchConversation: (conversationId, params = {}) =>
    api.get(`/chat/conversations/${encodeURIComponent(conversationId)}/search`, { params }).then((r) => r.data),
  archiveConversation: (conversationId) =>
    api.post(`/chat/conversations/${encodeURIComponent(conversationId)}/archive`, null, {
      validateStatus: (status) => status >= 200 && status < 500,
    }).then((r) => r.data),
  unarchiveConversation: (conversationId) =>
    api.delete(`/chat/conversations/${encodeURIComponent(conversationId)}/archive`, {
      validateStatus: (status) => status >= 200 && status < 500,
    }).then((r) => r.data),
  setConversationDraft: (conversationId, body = {}) =>
    api.put(`/chat/conversations/${encodeURIComponent(conversationId)}/draft`, body, {
      validateStatus: (status) => status >= 200 && status < 500,
    }).then((r) => r.data),
  listPins: (conversationId) =>
    api.get(`/chat/conversations/${encodeURIComponent(conversationId)}/pins`).then((r) => r.data),
  addPin: (conversationId, messageId) =>
    api.post(`/chat/conversations/${encodeURIComponent(conversationId)}/pins`, { message_id: messageId }).then((r) => r.data),
  removePin: (conversationId, messageId) =>
    api.delete(`/chat/conversations/${encodeURIComponent(conversationId)}/pins/${encodeURIComponent(messageId)}`).then((r) => r.data),
  listInvites: (conversationId) =>
    api.get(`/chat/conversations/${encodeURIComponent(conversationId)}/invites`).then((r) => r.data),
  createInvite: (conversationId, body = {}) =>
    api.post(`/chat/conversations/${encodeURIComponent(conversationId)}/invites`, body).then((r) => r.data),
  revokeInvite: (conversationId, code) =>
    api.delete(`/chat/conversations/${encodeURIComponent(conversationId)}/invites/${encodeURIComponent(code)}`).then((r) => r.data),
  previewInvite: (code) =>
    api.get(`/chat/invites/${encodeURIComponent(code)}/preview`).then((r) => r.data),
  joinInvite: (code) =>
    api.post(`/chat/invites/${encodeURIComponent(code)}/join`).then((r) => r.data),
  createGroup: (body = {}) => {
    const { name = '', member_user_ids = [], group_photo = null } = body || {}
    const formData = new FormData()
    formData.append('name', String(name || ''))
    member_user_ids.forEach((id) => formData.append('member_user_ids[]', String(id)))
    if (group_photo instanceof File) formData.append('group_photo', group_photo)
    return api.post('/chat/groups', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then((r) => r.data)
  },
  /** Ubah nama dan/atau foto grup (admin grup). */
  updateGroup: (conversationId, body = {}) => {
    const { name, group_photo = null } = body || {}
    const formData = new FormData()
    if (name !== undefined && name !== null) formData.append('name', String(name))
    if (group_photo instanceof File) formData.append('group_photo', group_photo)
    return api.patch(`/chat/conversations/${encodeURIComponent(conversationId)}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then((r) => r.data)
  },
  /** Riwayat pesan. conversationId ATAU peerId (untuk private get-or-create), limit default 20, opsional before_id untuk pagination lama. */
  getMessages: (params = {}) => {
    const { conversation_id, peer_id, before_id, limit = 20 } = params
    const q = {}
    if (conversation_id != null) q.conversation_id = conversation_id
    if (peer_id != null) q.peer_id = peer_id
    if (before_id != null) q.before_id = before_id
    q.limit = limit
    return api.get('/chat/messages', { params: q }).then((r) => r.data)
  },
  /** Unduh lampiran pesan (butuh JWT — jangan dipakai di <img src> langsung). */
  fetchChatMessageAttachment: (messageId) =>
    api
      .get(`/chat/messages/${encodeURIComponent(messageId)}/attachment`, { responseType: 'blob' })
      .then((r) => r.data),
  /** Simpan pesan: text/file (foto, pdf, doc, xls, ppt). */
  sendMessage: (body = {}, options = {}) => {
    const { onUploadProgress } = options || {}
    const file = body?.file instanceof File ? body.file : null
    if (file) {
      const formData = new FormData()
      if (body?.conversation_id != null) formData.append('conversation_id', String(body.conversation_id))
      if (body?.to_user_id != null) formData.append('to_user_id', String(body.to_user_id))
      if (body?.reply_to_message_id != null) formData.append('reply_to_message_id', String(body.reply_to_message_id))
      if (body?.forwarded_from_message_id != null) {
        formData.append('forwarded_from_message_id', String(body.forwarded_from_message_id))
      }
      formData.append('message', String(body?.message || ''))
      formData.append('file', file)
      return api.post('/chat/send', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        validateStatus: (status) => status >= 200 && status < 500,
        onUploadProgress: typeof onUploadProgress === 'function' ? onUploadProgress : undefined,
      }).then((r) => r.data)
    }
    return api.post('/chat/send', body, {
      validateStatus: (status) => status >= 200 && status < 500,
    }).then((r) => r.data)
  },
  toggleMessageReaction: (messageId) =>
    api.post(`/chat/messages/${encodeURIComponent(messageId)}/reactions`).then((r) => r.data),
}

/** Asisten eBeddien — login mode alternatif + proxy Node; chat utama lewat /deepseek/api-chat. */
export const deepseekAPI = {
  getAccount: () => api.get('/deepseek/account').then((r) => r.data),
  login: (password) => api.post('/deepseek/login', { password }).then((r) => r.data),
  proxySession: (token) => api.post('/deepseek/proxy/session', { token }).then((r) => r.data),
  proxyChat: (body) => api.post('/deepseek/proxy/chat', body).then((r) => r.data),
  directApiChat: (body) => api.post('/deepseek/api-chat', body).then((r) => r.data),
  /** Google Gemini — backend butuh GEMINI_API_KEY. */
  directGeminiChat: (body) => api.post('/deepseek/gemini-chat', body).then((r) => r.data),
  /** Riwayat terakhir dari ai___chat; tanpa session_id = gabungan per user (mode utama). */
  getChatHistory: (params) => api.get('/deepseek/chat-history', { params }).then((r) => r.data),
  /** Saran tombol obrolan: hanya pertanyaan acak dari Bank Q&A (`ai___training`), bukan Training Chat. */
  getBankQaSuggestedPrompts: () => api.get('/deepseek/training-suggestions').then((r) => r.data),
  getWaInstansiSettings: () => api.get('/deepseek/wa-instansi-settings').then((r) => r.data),
  putWaInstansiSettings: (body) => api.put('/deepseek/wa-instansi-settings', body).then((r) => r.data),
  putChatModePreference: (mode) => api.put('/deepseek/chat-mode-preference', { mode }).then((r) => r.data),
  putApiProviderPreference: (body) => api.put('/deepseek/api-provider-preference', body).then((r) => r.data),
  /** Agen otomasi — RBAC server; konfirmasi eksplisit untuk tulis. */
  agentTurn: (body = {}) => api.post('/deepseek/agent/turn', body).then((r) => r.data),
  agentConfirm: (body = {}) => api.post('/deepseek/agent/confirm', body).then((r) => r.data),
  agentRollback: (body = {}) => api.post('/deepseek/agent/rollback', body).then((r) => r.data),
  agentDiscard: (body = {}) => api.post('/deepseek/agent/discard', body).then((r) => r.data),
  agentGetJob: (id) =>
    api.get(`/deepseek/agent/job/${encodeURIComponent(id)}`).then((r) => r.data),
  /** Bangunkan koneksi WA Node (opsional). */
  getWaWake: () => api.get('/deepseek/wa-wake').then((r) => r.data),
  adminListAiUsers: (params = {}) => api.get('/deepseek/admin/ai-users', { params }).then((r) => r.data),
  adminUpdateAiUser: (id, body = {}) => api.put(`/deepseek/admin/ai-users/${id}`, body).then((r) => r.data),
  /** Agregasi ai___chat — hanya super_admin. */
  adminAiChatDashboard: (params = {}) => api.get('/deepseek/admin/ai-dashboard', { params }).then((r) => r.data),
  /** Riwayat log ai___chat + perbaiki jawaban — hanya super_admin. */
  adminChatLogMeta: () => api.get('/deepseek/admin/chat-log/meta').then((r) => r.data),
  adminListChatLog: (params = {}) => api.get('/deepseek/admin/chat-log', { params }).then((r) => r.data),
  adminPatchChatLog: (id, body = {}) => api.patch(`/deepseek/admin/chat-log/${id}`, body).then((r) => r.data),
}

/** Bank Q&A + sesi training chat (ai___training, ai___training_sessions/messages) — hanya super_admin. */
export const aiTrainingAdminAPI = {
  listBank: () => api.get('/ai-training/bank').then((r) => r.data),
  saveBank: (body) => api.post('/ai-training/bank', body).then((r) => r.data),
  deleteBank: (id) => api.delete(`/ai-training/bank/${id}`).then((r) => r.data),
  listSessions: () => api.get('/ai-training/sessions').then((r) => r.data),
  createSession: (title) => api.post('/ai-training/sessions', { title }).then((r) => r.data),
  deleteSession: (id) => api.delete(`/ai-training/sessions/${id}`).then((r) => r.data),
  listMessages: (sessionId) => api.get(`/ai-training/sessions/${sessionId}/messages`).then((r) => r.data),
  sendMessage: (body) => api.post('/ai-training/messages', body).then((r) => r.data),
  patchMessage: (id, message) => api.patch(`/ai-training/messages/${id}`, { message }).then((r) => r.data),
  deleteMessage: (id) => api.delete(`/ai-training/messages/${id}`).then((r) => r.data),
  approveMessage: (id) => api.post(`/ai-training/messages/${id}/approve`, {}).then((r) => r.data),
  feedbackMessage: (id, feedback) =>
    api.post(`/ai-training/messages/${id}/feedback`, { feedback }).then((r) => r.data),
}

// Chat API
export const chatAPI = {
  getCountBySantri: async (idSantri) => {
    const response = await api.post('/chat/count-by-santri', { id_santri: idSantri })
    return response.data
  },

  checkPhoneStatus: async (nomorTujuan) => {
    const response = await api.post('/chat/check-phone-status', { nomor_tujuan: nomorTujuan })
    return response.data
  },

  /**
   * Simpan log chat/WA. Data: nomor_tujuan, pesan (wajib); id_santri, id_pengurus, page, source,
   * status_pengiriman, nomor_uwaba, via_wa (opsional). Pengirim hanya pakai id_pengurus.
   */
  saveChat: async (data) => {
    const response = await api.post('/chat/save', data)
    return response.data
  },

  getChatBySantri: async (idSantri) => {
    try {
      // Backend menggunakan GET dengan query parameter, bukan POST dengan body
      const response = await api.get(`/chat/get-by-santri?id_santri=${encodeURIComponent(idSantri)}`)
      return response.data
    } catch (error) {
      console.error('Error in getChatBySantri:', error)
      if (error.response && error.response.data) {
        return error.response.data
      }
      return {
        success: false,
        message: error.message || 'Gagal mengambil data chat',
        data: []
      }
    }
  },

  /**
   * Normalisasi nomor ke 62xxx (sama dengan backend) agar riwayat chat + pesan masuk cocok.
   */
  _normalizeNomor62(nomor) {
    const digits = String(nomor || '').replace(/\D/g, '')
    if (!digits) return ''
    if (digits.startsWith('0')) return '62' + digits.slice(1)
    if (!digits.startsWith('62')) return '62' + digits
    return digits
  },

  /** Riwayat chat berdasarkan nomor tujuan (untuk offcanvas riwayat chat).
   * @param {string} nomorTujuan
   * @param {number} limit - default 30
   * @param {string|null} beforeDate - ISO datetime untuk "load more" (ambil chat sebelum tanggal ini)
   * @param {{ id_santri?: string|number, phone_field?: string }?} opts
   */
  getChatByNomor: async (nomorTujuan, limit = 30, beforeDate = null, opts = null) => {
    try {
      const idSantri = opts?.id_santri != null && opts.id_santri !== '' ? Number(opts.id_santri) : 0
      const phoneField = opts?.phone_field || opts?.field || ''
      const looksMasked = String(nomorTujuan || '').includes('*')
      const num = looksMasked ? '' : chatAPI._normalizeNomor62(nomorTujuan)
      if (!num && !(idSantri > 0)) {
        return { success: true, data: [] }
      }
      const params = new URLSearchParams()
      params.set('limit', String(Math.min(Math.max(Number(limit) || 30, 1), 500)))
      if (num) params.set('nomor_tujuan', num)
      if (idSantri > 0) params.set('id_santri', String(idSantri))
      if (phoneField) params.set('phone_field', String(phoneField))
      if (beforeDate) params.set('before_date', beforeDate)
      const response = await api.get(`/chat/get-all?${params.toString()}`)
      return response.data
    } catch (error) {
      console.error('Error in getChatByNomor:', error)
      if (error.response && error.response.data) {
        return error.response.data
      }
      return {
        success: false,
        message: error.message || 'Gagal mengambil riwayat chat',
        data: []
      }
    }
  },

  /** Sinkron pesan dari WA ke DB (pesan kirim lewat WA langsung / pesan masuk saat WA off). */
  syncFromWa: async (nomorTujuan, limit = 50, opts = null) => {
    try {
      const idSantri = opts?.id_santri != null && opts.id_santri !== '' ? Number(opts.id_santri) : 0
      const phoneField = opts?.phone_field || opts?.field || ''
      const looksMasked = String(nomorTujuan || '').includes('*')
      const num = looksMasked ? '' : chatAPI._normalizeNomor62(nomorTujuan)
      if (!num && !(idSantri > 0)) {
        return { success: false, message: 'Nomor tidak valid', synced_count: 0 }
      }
      const response = await api.post('/chat/sync-from-wa', {
        ...(num ? { nomor_tujuan: num } : {}),
        ...(idSantri > 0 ? { id_santri: idSantri } : {}),
        ...(phoneField ? { phone_field: phoneField } : {}),
        limit: Math.min(Math.max(Number(limit) || 50, 1), 100)
      })
      return response.data
    } catch (error) {
      console.error('Error in syncFromWa:', error)
      if (error.response && error.response.data) {
        return error.response.data
      }
      return {
        success: false,
        message: error.message || 'Gagal sinkron dari WA',
        synced_count: 0
      }
    }
  }
}

// Template WhatsApp — list (semua role chat), create/update/delete (super_admin)
export const whatsappTemplateAPI = {
  list: async (kategori = null) => {
    const url = kategori
      ? `/whatsapp-template/list?kategori=${encodeURIComponent(kategori)}`
      : '/whatsapp-template/list'
    const response = await api.get(url)
    return response.data
  },
  create: async (data) => {
    const response = await api.post('/whatsapp-template/create', {
      kategori: data.kategori || 'umum',
      nama: data.nama,
      isi_pesan: data.isi_pesan
    })
    return response.data
  },
  update: async (data) => {
    const response = await api.put('/whatsapp-template/update', {
      id: data.id,
      kategori: data.kategori,
      nama: data.nama,
      isi_pesan: data.isi_pesan
    })
    return response.data
  },
  delete: async (id) => {
    const response = await api.post('/whatsapp-template/delete', { id })
    return response.data
  }
}

// Profil API
export const profilAPI = {
  getTotalPembayaran: async (idAdmin) => {
    const response = await api.get(`/profil/total-pembayaran?id_admin=${idAdmin}`)
    return response.data
  },
  getTotalPemasukanPengeluaran: async (tahunAjaran = null) => {
    const url = tahunAjaran
      ? `/profil/total-pemasukan-pengeluaran?tahun_ajaran=${encodeURIComponent(tahunAjaran)}`
      : '/profil/total-pemasukan-pengeluaran'
    const response = await api.get(url)
    return response.data
  },

  getUser: async (userId, options = {}) => {
    const params = new URLSearchParams()
    if (options?.fullPii) params.set('full_pii', '1')
    const q = params.toString()
    const response = await api.get(`/user/${userId}${q ? `?${q}` : ''}`)
    return response.data
  },

  /** Daftar aktivitas user yang login (audit log). Params: limit, offset, entity_type, date_from, date_to */
  getAktivitas: async (params = {}) => {
    const q = new URLSearchParams()
    if (params.limit != null) q.set('limit', params.limit)
    if (params.offset != null) q.set('offset', params.offset)
    if (params.entity_type) q.set('entity_type', params.entity_type)
    if (params.date_from) q.set('date_from', params.date_from)
    if (params.date_to) q.set('date_to', params.date_to)
    const response = await api.get(`/v2/profil/aktivitas?${q.toString()}`)
    return response.data
  },

  /** Ambil foto profil sebagai blob (untuk createObjectURL di img). Tanpa foto = null (server 204). */
  getProfilFotoBlob: async () => {
    const response = await api.get('/v2/profil/foto', {
      responseType: 'blob',
      validateStatus: (status) => status === 200 || status === 204,
      // Hindari cache browser untuk URL yang sama antar sesi/user (Authorization berbeda).
      params: { _nc: Date.now() },
      headers: {
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
      },
    })
    if (response.status === 204) return null
    const blob = response.data
    if (!(blob instanceof Blob) || blob.size === 0) return null
    return blob
  },

  /** Upload foto profil (FormData dengan key 'foto', file gambar <500KB) */
  uploadProfilFoto: async (file) => {
    const formData = new FormData()
    formData.append('foto', file)
    const response = await api.post('/v2/profil/foto', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
    return response.data
  },

  /** Hapus foto profil */
  deleteProfilFoto: async () => {
    const response = await api.delete('/v2/profil/foto')
    return response.data
  },

  updateProfile: async (data) => {
    const response = await api.post('/user/update-profile', data)
    return response.data
  },

  verifyPassword: async (data) => {
    const response = await api.post('/user/verify-password', data)
    return response.data
  },

  updatePassword: async (data) => {
    const response = await api.post('/user/update-password', data)
    return response.data
  }
}

// User API
export const userAPI = {
  getAll: async () => {
    const response = await api.get('/user/list')
    return response.data
  },
  /**
   * @param {string|null|undefined} lembagaId - id lembaga rencana/pengeluaran (opsional)
   * @param {{ notifContext?: 'draft' }} [options] - draft = penerima aksi draft.notif (satu lembaga sesuai role)
   */
  getSuperAdminAndUwaba: async (lembagaId = null, options = {}) => {
    const params = {}
    if (lembagaId != null && String(lembagaId).trim() !== '') {
      params.lembaga_id = String(lembagaId).trim()
    }
    if (options.notifContext === 'draft') {
      params.notif_context = 'draft'
    }
    const response = await api.get('/user/list-super-admin-uwaba', { params })
    return response.data
  },
  getById: async (id) => {
    const response = await api.get(`/user/${id}`)
    return response.data
  }
}

// Manage Users API (Super Admin only)
export const manageUsersAPI = {
  /** List dari tabel users (v2) - filter type, search, role_id, lembaga_id, jabatan_lembaga_id */
  getAllV2: async (params = {}) => {
    const queryParams = new URLSearchParams()
    if (params.page) queryParams.append('page', params.page)
    if (params.limit) queryParams.append('limit', params.limit)
    if (params.search) queryParams.append('search', params.search)
    if (params.type) queryParams.append('type', params.type) // santri | pengurus | all
    if (params.role_id) queryParams.append('role_id', params.role_id)
    if (params.lembaga_id) queryParams.append('lembaga_id', params.lembaga_id)
    if (params.jabatan_lembaga_id) queryParams.append('jabatan_lembaga_id', params.jabatan_lembaga_id)

    const queryString = queryParams.toString()
    const url = `/v2/manage-users${queryString ? '?' + queryString : ''}`
    const response = await api.get(url)
    return response.data
  },

  /** Get user by users.id (v2) - return user + pengurus + santri */
  getByIdV2: async (id) => {
    const response = await api.get(`/v2/manage-users/${id}`)
    return response.data
  },

  /** Detail user mode baca (akses lebih luas dari manage-users v2) */
  getDetailReadonly: async (id) => {
    const response = await api.get(`/v2/users/${id}/detail-readonly`)
    return response.data
  },

  /** Daftar session aktif user (users.id). Super_admin only. */
  getSessionsForUser: async (userId) => {
    const response = await api.get(`/v2/manage-users/${userId}/sessions`)
    return response.data
  },

  /** Daftar aktivitas (audit log) user. Super_admin only. Params: user_id, pengurus_id, limit, offset, entity_type, date_from, date_to */
  getAktivitasForUser: async (params = {}) => {
    const q = new URLSearchParams()
    if (params.user_id != null) q.set('user_id', params.user_id)
    if (params.pengurus_id != null) q.set('pengurus_id', params.pengurus_id)
    if (params.limit != null) q.set('limit', params.limit)
    if (params.offset != null) q.set('offset', params.offset)
    if (params.entity_type) q.set('entity_type', params.entity_type)
    if (params.date_from) q.set('date_from', params.date_from)
    if (params.date_to) q.set('date_to', params.date_to)
    if (params.action) q.set('action', params.action)
    const response = await api.get(`/user-aktivitas?${q.toString()}`)
    return response.data
  },

  /** Ringkasan Aktivitas User (top GET, mutasi, suspicious). */
  getUserAktivitasOverview: async (params = {}) => {
    const q = new URLSearchParams()
    if (params.days != null) q.set('days', params.days)
    const response = await api.get(`/user-aktivitas/overview${q.toString() ? `?${q}` : ''}`)
    return response.data
  },

  /** Log akses HTTP API. */
  getUserAktivitasAccessLog: async (params = {}) => {
    const q = new URLSearchParams()
    Object.entries(params || {}).forEach(([k, v]) => {
      if (v != null && v !== '') q.set(k, String(v))
    })
    const response = await api.get(`/user-aktivitas/access-log${q.toString() ? `?${q}` : ''}`)
    return response.data
  },

  /** Revoke session user (logout perangkat). userId = users.id, sessionId = session id. Super_admin only. */
  revokeUserSession: async (userId, sessionId) => {
    const response = await api.delete(`/v2/manage-users/${userId}/sessions/${sessionId}`)
    return response.data
  },

  /** Update no_wa dan email user (tabel users). userId = users.id. Super_admin only. */
  updateUserProfileV2: async (userId, data) => {
    const response = await api.put(`/v2/manage-users/${userId}`, data)
    return response.data
  },

  /** Flag akses eBeddien / Mybeddian (santri, toko, PJGT). Body: salah satu atau lebih dari access_* (0|1). */
  updateUserPortalAccessV2: async (userId, data) => {
    const response = await api.put(`/v2/manage-users/${userId}/portal-access`, data)
    return response.data
  },

  /** Daftar santri untuk dropdown Set Akses Mybeddian. Params: search, limit. */
  getSantriOptionsForMybeddian: async (params = {}) => {
    const q = new URLSearchParams()
    if (params.search != null && params.search !== '') q.set('search', params.search)
    if (params.limit != null) q.set('limit', params.limit)
    if (params.editing_user_id != null && params.editing_user_id !== '') q.set('editing_user_id', String(params.editing_user_id))
    const response = await api.get(`/v2/manage-users/santri-options${q.toString() ? '?' + q.toString() : ''}`)
    return response.data
  },

  /** Set atau hapus akses Mybeddian (santri) untuk user. userId = users.id. santriId = number atau null untuk lepas semua tautan santri. */
  setMybeddianAccess: async (userId, santriId) => {
    const response = await api.put(`/v2/manage-users/${userId}/mybeddian-access`, { santri_id: santriId })
    return response.data
  },

  /** Lepas satu santri dari user (users.id). */
  removeOneMybeddianSantri: async (userId, santriId) => {
    const response = await api.delete(`/v2/manage-users/${userId}/mybeddian-santri/${santriId}`)
    return response.data
  },

  /** Daftar pengurus untuk tautkan ke akun (login eBeddien). Params: search, limit, editing_user_id. */
  getPengurusOptionsForLink: async (params = {}) => {
    const q = new URLSearchParams()
    if (params.search != null && params.search !== '') q.set('search', params.search)
    if (params.limit != null) q.set('limit', params.limit)
    if (params.editing_user_id != null && params.editing_user_id !== '') q.set('editing_user_id', String(params.editing_user_id))
    const response = await api.get(`/v2/manage-users/pengurus-options${q.toString() ? '?' + q.toString() : ''}`)
    return response.data
  },

  /** Tautkan / lepas pengurus ke user. pengurusId = number atau null untuk lepas. */
  setPengurusLink: async (userId, pengurusId) => {
    const response = await api.put(`/v2/manage-users/${userId}/pengurus-link`, { pengurus_id: pengurusId })
    return response.data
  },

  /** Daftar toko yang terhubung ke user (users.id). */
  getTokoForUser: async (userId) => {
    const response = await api.get(`/v2/manage-users/${userId}/toko`)
    return response.data
  },

  /** Opsi toko yang belum punya user (untuk dropdown link). */
  getTokoOptions: async () => {
    const response = await api.get('/v2/manage-users/toko-options')
    return response.data
  },

  /** Tambah akses toko: body { nama_toko, kode_toko } buat baru, atau { pedagang_id } link existing. */
  addTokoToUser: async (userId, data) => {
    const response = await api.post(`/v2/manage-users/${userId}/toko`, data)
    return response.data
  },

  /** Cabut akses toko dari user. */
  removeTokoFromUser: async (userId, pedagangId) => {
    const response = await api.delete(`/v2/manage-users/${userId}/toko/${pedagangId}`)
    return response.data
  },

  /** Madrasah yang belum punya PJGT (id_pjgt kosong). Params: search, limit. */
  getMadrasahPjgtOptions: async (params = {}) => {
    const q = new URLSearchParams()
    if (params.search != null && params.search !== '') q.set('search', params.search)
    if (params.limit != null) q.set('limit', params.limit)
    const response = await api.get(`/v2/manage-users/madrasah-pjgt-options${q.toString() ? '?' + q.toString() : ''}`)
    return response.data
  },

  /** Tautkan user sebagai PJGT ke madrasah (body: { madrasah_id }). */
  linkUserPjgt: async (userId, data) => {
    const response = await api.post(`/v2/manage-users/${userId}/pjgt`, data)
    return response.data
  },

  /** Lepas peran PJGT user dari madrasah. */
  unlinkUserPjgt: async (userId) => {
    const response = await api.delete(`/v2/manage-users/${userId}/pjgt`)
    return response.data
  },

  /** Hapus akun user by users.id (unlink santri/pengurus, hapus session, hapus users). Untuk user santri-only atau edit by users.id. */
  deleteByUsersId: async (userId) => {
    const response = await api.delete(`/v2/manage-users/${userId}`)
    return response.data
  },

  getAll: async (params = {}) => {
    const queryParams = new URLSearchParams()
    if (params.page) queryParams.append('page', params.page)
    if (params.limit) queryParams.append('limit', params.limit)
    if (params.search) queryParams.append('search', params.search)
    if (params.level) queryParams.append('level', params.level)
    if (params.status) queryParams.append('status', params.status)
    if (params.role_id) queryParams.append('role_id', params.role_id)
    if (params.lembaga_id) queryParams.append('lembaga_id', params.lembaga_id)
    if (params.jabatan_lembaga_id) queryParams.append('jabatan_lembaga_id', params.jabatan_lembaga_id)

    const queryString = queryParams.toString()
    const url = `/manage-users${queryString ? '?' + queryString : ''}`
    const response = await api.get(url)
    return response.data
  },

  getById: async (id) => {
    const response = await api.get(`/manage-users/${id}`)
    return response.data
  },

  create: async (data, config = {}) => {
    const response = await api.post('/manage-users', data, config)
    return response.data
  },

  update: async (id, data, config = {}) => {
    const response = await api.put(`/manage-users/${id}`, data, config)
    return response.data
  },

  /** Simpan massal dari editor Excel pengurus (FortuneSheet). */
  bulkUpdatePengurusFromExcel: async (rows) => {
    const response = await api.post('/pengurus/excel-bulk-update', { rows })
    return response.data
  },

  delete: async (id) => {
    const response = await api.delete(`/manage-users/${id}`)
    return response.data
  },

  getRolesList: async () => {
    const response = await api.get('/manage-users/roles/list')
    return response.data
  },

  /** Role yang boleh ditambahkan/dicabut oleh pengurus login (role___boleh_assign_role). */
  getAssignableRolesList: async () => {
    const response = await api.get('/manage-users/roles/assignable-list')
    return response.data
  },

  /** Buat baris baru di tabel role (key snake_case, label tampilan). */
  createRole: async (key, label) => {
    const response = await api.post('/manage-users/roles', { key, label })
    return response.data
  },

  /** Hapus role (+ cabut dari pengurus / fitur terkait). */
  deleteRole: async (roleId) => {
    const response = await api.delete(`/manage-users/roles/${roleId}`)
    return response.data
  },

  addUserRole: async (userId, roleData) => {
    const response = await api.post(`/manage-users/${userId}/roles`, roleData)
    return response.data
  },

  removeUserRole: async (userId, pengurusRoleId) => {
    const response = await api.delete(`/manage-users/${userId}/roles/${pengurusRoleId}`)
    return response.data
  },

  addUserJabatan: async (userId, jabatanData) => {
    const response = await api.post(`/manage-users/${userId}/jabatan`, jabatanData)
    return response.data
  },

  removeUserJabatan: async (userId, pengurusJabatanId) => {
    const response = await api.delete(`/manage-users/${userId}/jabatan/${pengurusJabatanId}`)
    return response.data
  },

  /** Update jabatan pengurus (status, tanggal, mengajar). */
  updateJabatanStatus: async (userId, pengurusJabatanId, data) => {
    const body = typeof data === 'string'
      ? { status: data }
      : {
          status: data.status,
          tanggal_mulai: data.tanggal_mulai,
          tanggal_selesai: data.tanggal_selesai,
          mengajar: data.mengajar
        }
    const payload = Object.fromEntries(
      Object.entries(body).filter(([, v]) => v !== undefined)
    )
    const response = await api.put(`/manage-users/${userId}/jabatan/${pengurusJabatanId}`, payload)
    return response.data
  },

  /** Kirim link WA untuk buat password baru (super_admin). id = pengurus.id. */
  sendResetPasswordLink: async (id) => {
    const response = await api.post(`/manage-users/${id}/send-reset-password-link`, {})
    return response.data
  }
}

// Settings API (Super Admin only) - konfigurasi role & akses
export const settingsAPI = {
  getRolesConfig: async () => {
    const response = await api.get('/settings/roles-config')
    return response.data
  },
  /** Matriks menu eBeddien ↔ role (tabel app___fitur + role___fitur). Super admin. */
  getEbeddienMenuFitur: async () => {
    const response = await api.get('/settings/ebeddien-menu-fitur')
    return response.data
  },
  /** Body: { assignments: [ { fitur_id, role_ids: number[] } ] }. Super admin. */
  putEbeddienMenuFitur: async (body) => {
    const response = await api.put('/settings/ebeddien-menu-fitur', body)
    return response.data
  },
  /**
   * Satu fitur: body { role_ids?: number[], label?, icon_key?, group_label?, sort_order? }.
   * Kolom tampilan tersimpan di app___fitur; super admin.
   */
  patchEbeddienMenuFiturItem: async (fiturId, body) => {
    const response = await api.patch(`/settings/ebeddien-menu-fitur/${fiturId}`, body)
    return response.data
  },
  /** Checklist pengurus untuk satu role (Fitur → Role → Pengurus). */
  getRolePengurusChecklist: async (roleId) => {
    const response = await api.get(`/settings/roles/${roleId}/pengurus-checklist`)
    return response.data
  },
  /** Body: { pengurus_id, has_role }. Assign/cabut role pada pengurus. */
  putRolePengurusChecklist: async (roleId, body) => {
    const response = await api.put(`/settings/roles/${roleId}/pengurus-checklist`, body)
    return response.data
  },
  /** Matriks role___boleh_assign_role (super admin). */
  getRoleBolehAssign: async () => {
    const response = await api.get('/settings/role-boleh-assign')
    return response.data
  },
  putRoleBolehAssign: async (body) => {
    const response = await api.put('/settings/role-boleh-assign', body)
    return response.data
  },
  getFeaturesConfig: async () => {
    const response = await api.get('/settings/features-config')
    return response.data
  },
  getEbeddienFiturSelectors: async () => {
    const response = await api.get('/settings/ebeddien-fitur-selectors')
    return response.data
  },
  putEbeddienFiturSelector: async (selectorKey, body) => {
    const response = await api.put(
      `/settings/ebeddien-fitur-selectors/${encodeURIComponent(selectorKey)}`,
      body
    )
    return response.data
  },
  getEbeddienLegacyRouteRoles: async () => {
    const response = await api.get('/settings/ebeddien-legacy-route-roles')
    return response.data
  },
  putEbeddienLegacyRouteRoles: async (legacyKey, body) => {
    const response = await api.put(
      `/settings/ebeddien-legacy-route-roles/${encodeURIComponent(legacyKey)}`,
      body
    )
    return response.data
  },
  patchRolePolicy: async (roleKey, body) => {
    const response = await api.patch(`/settings/role-policy/${encodeURIComponent(roleKey)}`, body)
    return response.data
  },
  /** Katalog app + permission (RoleConfig) untuk form centang Role & Akses. */
  getRolePolicyCatalog: async () => {
    const response = await api.get('/settings/role-policy/catalog')
    return response.data
  },
  postRolePolicySyncFromPhp: async () => {
    const response = await api.post('/settings/role-policy/sync-from-php', {})
    return response.data
  },
  /** Buang cache RolePolicyResolver di worker backend (setelah edit SQL manual). Super admin. */
  postRolePolicyClearCache: async () => {
    const response = await api.post('/settings/role-policy/clear-cache', {})
    return response.data
  },
  getEmailConfig: async () => {
    const response = await api.get('/settings/email-config')
    return response.data
  },
  saveEmailConfig: async (data) => {
    const response = await api.put('/settings/email-config', data)
    return response.data
  },
  testEmailConfig: async (data) => {
    const response = await api.post('/settings/email-config/test', data)
    return response.data
  }
}

// Notifikasi (Super Admin only) - pilih provider: wa_sendiri (server WA sendiri) atau watzap
export const notificationConfigAPI = {
  getConfig: async () => {
    const response = await api.get('/settings/notification-config')
    return response.data
  },
  saveConfig: async (data) => {
    const response = await api.put('/settings/notification-config', data)
    return response.data
  },
  getNotificationGroups: async () => {
    const response = await api.get('/settings/notification-groups')
    return response.data
  },
  getNotificationMessages: async (kategori, page = 1, limit = 50) => {
    const response = await api.get('/settings/notification-messages', {
      params: { kategori, page, limit }
    })
    return response.data
  },
  testErrorAlert: async (data = {}) => {
    const response = await api.post('/settings/error-alert/test', data)
    return response.data
  }
}

export const installActivityAPI = {
  getDashboard: async (params = {}) => {
    const response = await api.get('/app-install-activity/dashboard', { params })
    return response.data
  },
  getOverview: async (params = {}) => {
    const response = await api.get('/app-install-activity/overview', { params })
    return response.data
  },
  getTimeseries: async (params = {}) => {
    const response = await api.get('/app-install-activity/timeseries', { params })
    return response.data
  },
  getBreakdown: async () => {
    const response = await api.get('/app-install-activity/breakdown')
    return response.data
  },
  getRetention: async () => {
    const response = await api.get('/app-install-activity/retention')
    return response.data
  },
  getFunnel: async () => {
    const response = await api.get('/app-install-activity/funnel')
    return response.data
  },
  getList: async (params = {}) => {
    const response = await api.get('/app-install-activity/list', { params })
    return response.data
  },
  getRealtime: async (params = {}) => {
    const response = await api.get('/app-install-activity/realtime', { params })
    return response.data
  },
  getDeployChecklist: async () => {
    const response = await api.get('/app-install-activity/deploy-checklist')
    return response.data
  },
  getUsersStats: async () => {
    const response = await api.get('/app-install-activity/users-stats')
    return response.data
  },
  getUsersTimeseries: async (params = {}) => {
    const response = await api.get('/app-install-activity/users-timeseries', { params })
    return response.data
  },
  getExportCsvUrl: () => `${api.defaults.baseURL}/app-install-activity/export.csv`
}

// Kontak WA (whatsapp___kontak, Super Admin only) - daftar nomor, siap/tidak terima notif
export const kontakAPI = {
  getList: async (params = {}) => {
    const response = await api.get('/kontak', { params: { page: params.page, limit: params.limit, search: params.search } })
    return response.data
  },
  /** PATCH: minimal satu field — siap_terima_notif, nama, nomor_kanonik */
  update: async (id, data) => {
    const response = await api.patch(`/kontak/${id}`, data)
    return response.data
  },
  updateSiapTerimaNotif: async (id, siapTerimaNotif) => {
    return kontakAPI.update(id, { siap_terima_notif: siapTerimaNotif })
  },
  /** Ambil LID dari server WA (Baileys onWhatsApp) dan simpan ke nomor_kanonik */
  resolveLid: async (id, sessionId = 'default') => {
    const response = await api.post(`/kontak/${id}/resolve-lid`, {
      session_id: sessionId || 'default'
    })
    return response.data
  },
  delete: async (id) => {
    const response = await api.delete(`/kontak/${id}`)
    return response.data
  }
}

// WatZap (Super Admin only) - kirim via WatZap API. Backend proxy ke https://api.watzap.id/v1/
// Body WatZap: api_key, number_key ("ALL"), phone_no, message. Tidak pakai device_id.
export const watzapAPI = {
  getStatus: async () => {
    const response = await api.get('/watzap/status')
    return response.data
  },
  putConfig: async (data) => {
    const response = await api.put('/watzap/config', data)
    return response.data
  },
  getDevices: async () => {
    const response = await api.get('/watzap/devices')
    return response.data
  },
  getWebhookUrl: async () => {
    const response = await api.get('/watzap/webhook-url')
    return response.data
  },
  getWebhooks: async () => {
    const response = await api.get('/watzap/webhooks')
    return response.data
  },
  setWebhook: async (url = null) => {
    const response = await api.post('/watzap/set-webhook', url != null ? { url } : {})
    return response.data
  },
  sendMessage: async (phoneNumber, message, numberKey = '') => {
    const response = await api.post('/watzap/send', { phone: phoneNumber, message, ...(numberKey ? { number_key: numberKey } : {}) })
    return response.data
  }
}

/** Evolution API v2 (Super Admin) — proxy ke server Evolution (QR, instance). Kunci di .env backend. */
export const evolutionApiAPI = {
  getConfig: async () => {
    const response = await api.get('/evolution-api/config')
    return response.data
  },
  putConfig: async (data) => {
    const response = await api.put('/evolution-api/config', data)
    return response.data
  },
  getInfo: async () => {
    const response = await api.get('/evolution-api/info')
    return response.data
  },
  getInstances: async (instanceName = '') => {
    const response = await api.get('/evolution-api/instances', {
      params: instanceName ? { instanceName } : undefined
    })
    return response.data
  },
  getConnectionState: async (name) => {
    const response = await api.get(`/evolution-api/instance/${encodeURIComponent(name)}/connection-state`)
    return response.data
  },
  getConnect: async (name, number) => {
    const response = await api.get(`/evolution-api/instance/${encodeURIComponent(name)}/connect`, {
      params: number ? { number } : undefined
    })
    return response.data
  },
  logout: async (name) => {
    const response = await api.delete(`/evolution-api/instance/${encodeURIComponent(name)}/logout`)
    return response.data
  },
  createInstance: async (body) => {
    const response = await api.post('/evolution-api/instance/create', body)
    return response.data
  },
  /** GET /webhook/find/{instance} lewat proxy */
  getInstanceWebhook: async (name) => {
    const response = await api.get(`/evolution-api/instance/${encodeURIComponent(name)}/webhook`)
    return response.data
  },
  /** POST /webhook/set/{instance} — body opsional: use_app_inbound_url, url, events, enabled, webhookByEvents, webhookBase64 */
  setInstanceWebhook: async (name, body = {}) => {
    const response = await api.post(`/evolution-api/instance/${encodeURIComponent(name)}/webhook`, body)
    return response.data
  },
  /** Tes kirim teks — instance = nama default tersimpan atau instance_name di body */
  sendText: async ({ number, text, instance_name: instanceName } = {}) => {
    const response = await api.post('/evolution-api/send-text', {
      number,
      text,
      ...(instanceName ? { instance_name: instanceName } : {})
    })
    return response.data
  },
  sendList: async (payload) => {
    const response = await api.post('/evolution-api/send-list', payload)
    return response.data
  },
  sendButtons: async (payload) => {
    const response = await api.post('/evolution-api/send-buttons', payload)
    return response.data
  }
}

/** Menu WA interaktif (Super Admin) — pohon menu & balasan otomatis */
export const waInteractiveMenuAPI = {
  getSettings: async () => {
    const response = await api.get('/wa-interactive-menu/settings')
    return response.data
  },
  putSettings: async (data) => {
    const response = await api.put('/wa-interactive-menu/settings', data)
    return response.data
  },
  getTree: async () => {
    const response = await api.get('/wa-interactive-menu/tree')
    return response.data
  },
  putTree: async (data) => {
    const response = await api.put('/wa-interactive-menu/tree', data)
    return response.data
  }
}

// Jabatan API (Super Admin only)
export const jabatanAPI = {
  getAll: async (params = {}) => {
    const queryParams = new URLSearchParams()
    if (params.page) queryParams.append('page', params.page)
    if (params.limit) queryParams.append('limit', params.limit)
    if (params.search) queryParams.append('search', params.search)
    if (params.kategori) queryParams.append('kategori', params.kategori)
    if (params.lembaga_id) queryParams.append('lembaga_id', params.lembaga_id)
    if (params.lembaga_ids) queryParams.append('lembaga_ids', params.lembaga_ids)
    if (params.status) queryParams.append('status', params.status)

    const queryString = queryParams.toString()
    const url = `/jabatan${queryString ? '?' + queryString : ''}`
    const response = await api.get(url)
    return response.data
  },

  getById: async (id) => {
    const response = await api.get(`/jabatan/${id}`)
    return response.data
  },

  create: async (data) => {
    const response = await api.post('/jabatan', data)
    return response.data
  },

  update: async (id, data) => {
    const response = await api.put(`/jabatan/${id}`, data)
    return response.data
  },

  delete: async (id) => {
    const response = await api.delete(`/jabatan/${id}`)
    return response.data
  },

  getList: async (params = {}) => {
    const queryParams = new URLSearchParams()
    if (params.kategori) queryParams.append('kategori', params.kategori)
    if (params.lembaga_id) queryParams.append('lembaga_id', params.lembaga_id)
    if (params.lembaga_ids) queryParams.append('lembaga_ids', params.lembaga_ids)
    if (params.status) queryParams.append('status', params.status)

    const queryString = queryParams.toString()
    const url = `/jabatan/list${queryString ? '?' + queryString : ''}`
    const response = await api.get(url)
    return response.data
  }
}

// Santri Juara API
export const santriJuaraAPI = {
  getAll: async (params = {}) => {
    const queryParams = new URLSearchParams()
    if (params.tahun_ajaran) queryParams.append('tahun_ajaran', params.tahun_ajaran)
    if (params.search) queryParams.append('search', params.search)
    if (params.lembaga) queryParams.append('lembaga', params.lembaga)
    if (params.juara) queryParams.append('juara', params.juara)
    if (params.page) queryParams.append('page', params.page)
    if (params.limit) queryParams.append('limit', params.limit)
    const queryString = queryParams.toString()
    const url = `/santri-juara${queryString ? '?' + queryString : ''}`
    const response = await api.get(url)
    return response.data
  },

  getById: async (id) => {
    const response = await api.get(`/santri-juara/${id}`)
    return response.data
  },

  create: async (data) => {
    const response = await api.post('/santri-juara', data)
    return response.data
  },

  update: async (id, data) => {
    const response = await api.put(`/santri-juara/${id}`, data)
    return response.data
  },

  delete: async (id) => {
    const response = await api.delete(`/santri-juara/${id}`)
    return response.data
  }
}

// Print API
export const printAPI = {
  getPrintData: async (idSantri, page = 'tunggakan', tahunAjaran = null) => {
    let url = `/print?id_santri=${idSantri}&page=${page}`
    if (tahunAjaran && page === 'uwaba') {
      url += `&tahun_ajaran=${tahunAjaran}`
    }
    const response = await api.get(url)
    return response.data
  }
}

// Pengeluaran API
export const pemasukanAPI = {
  create: async (data) => {
    const response = await api.post('/pemasukan', data)
    return response.data
  },
  getAll: async (kategori = null, status = null, tanggalDari = null, tanggalSampai = null, page = 1, limit = 20, lembaga = null) => {
    let url = `/pemasukan?page=${page}&limit=${limit}`
    if (kategori) {
      url += `&kategori=${encodeURIComponent(kategori)}`
    }
    if (status) {
      url += `&status=${encodeURIComponent(status)}`
    }
    if (tanggalDari) {
      url += `&tanggal_dari=${encodeURIComponent(tanggalDari)}`
    }
    if (tanggalSampai) {
      url += `&tanggal_sampai=${encodeURIComponent(tanggalSampai)}`
    }
    if (lembaga) {
      url += `&lembaga=${encodeURIComponent(lembaga)}`
    }
    const response = await api.get(url)
    return response.data
  },
  getDetail: async (id) => {
    const response = await api.get(`/pemasukan/${id}`)
    return response.data
  },
  update: async (id, data) => {
    const response = await api.put(`/pemasukan/${id}`, data)
    return response.data
  },
  delete: async (id) => {
    const response = await api.delete(`/pemasukan/${id}`)
    return response.data
  },
  getPendapatanUwaba: async (tanggal) => {
    const response = await api.get(`/pemasukan/uwaba/pendapatan?tanggal=${encodeURIComponent(tanggal)}`)
    return response.data
  },
  getPendapatanTunggakan: async (tanggal) => {
    const response = await api.get(`/pemasukan/tunggakan/pendapatan?tanggal=${encodeURIComponent(tanggal)}`)
    return response.data
  },
  getPendapatanKhusus: async (tanggal) => {
    const response = await api.get(`/pemasukan/khusus/pendapatan?tanggal=${encodeURIComponent(tanggal)}`)
    return response.data
  },
  getPendapatanPendaftaran: async (tanggal) => {
    const response = await api.get(`/pemasukan/pendaftaran/pendapatan?tanggal=${encodeURIComponent(tanggal)}`)
    return response.data
  }
}

export const pengeluaranAPI = {
  // Rencana
  createRencana: async (data) => {
    const response = await api.post('/pengeluaran/rencana', data)
    return response.data
  },

  /** Rencana dari item PSB + baris item___setor per detail */
  createRencanaFromPsbItemSetor: async (data) => {
    const response = await api.post('/pengeluaran/rencana/psb-item-setor', data)
    return response.data
  },

  getRencanaList: async (status = null, kategori = null, lembaga = null, tanggalDari = null, tanggalSampai = null, page = 1, limit = 20, lembagaContext = null) => {
    let url = `/pengeluaran/rencana?page=${page}&limit=${limit}`
    if (status) {
      url += `&status=${status}`
    }
    if (kategori) {
      url += `&kategori=${encodeURIComponent(kategori)}`
    }
    if (lembaga) {
      url += `&lembaga=${encodeURIComponent(lembaga)}`
    }
    if (tanggalDari) {
      url += `&tanggal_dari=${encodeURIComponent(tanggalDari)}`
    }
    if (tanggalSampai) {
      url += `&tanggal_sampai=${encodeURIComponent(tanggalSampai)}`
    }
    if (lembagaContext) {
      url += `&lembaga_context=${encodeURIComponent(lembagaContext)}`
    }
    const response = await api.get(url)
    return response.data
  },

  deleteRencana: async (id) => {
    const response = await api.delete(`/pengeluaran/rencana/${id}`)
    return response.data
  },

  getRencanaDetail: async (id) => {
    const response = await api.get(`/pengeluaran/rencana/${id}`)
    return response.data
  },

  /**
   * Kirim notifikasi WA rencana pengeluaran ke admin (lewat backend; tercatat di log whatsapp + user___aktivitas).
   * @param {number} rencanaId - ID rencana
   * @param {string} message - Isi pesan WA (biasanya dari generateRencanaWhatsAppMessage)
   * @param {Array<{id: number, whatsapp: string}>} recipients - Daftar penerima { id: pengurus_id, whatsapp: nomor }
   */
  sendNotifWa: async (rencanaId, message, recipients) => {
    const response = await api.post('/pengeluaran/rencana/notif-wa', {
      rencana_id: rencanaId,
      message: message ?? '',
      recipients: Array.isArray(recipients) ? recipients : []
    })
    return response.data
  },

  /**
   * Kirim notifikasi WA pengeluaran (entity sudah di-approve) ke admin (lewat backend + log).
   * @param {number} pengeluaranId - ID pengeluaran
   * @param {string} message - Isi pesan WA
   * @param {Array<{id: number, whatsapp: string}>} recipients - Daftar penerima
   */
  sendNotifWaPengeluaran: async (pengeluaranId, message, recipients) => {
    const response = await api.post('/pengeluaran/notif-wa', {
      pengeluaran_id: pengeluaranId,
      message: message ?? '',
      recipients: Array.isArray(recipients) ? recipients : []
    })
    return response.data
  },

  updateRencana: async (id, data) => {
    const response = await api.put(`/pengeluaran/rencana/${id}`, data)
    return response.data
  },

  /** Bangunkan server WA (Node) sebelum kirim notif — sama konsep dengan pendaftaran. */
  wakeRencanaWa: async () => {
    const response = await api.get('/pengeluaran/rencana/wa-wake')
    return response.data
  },

  /** Body opsional: { recipients: [{ id, whatsapp }], catatan?: string } — backend kirim WA + template. */
  approveRencana: async (id, body = {}) => {
    const response = await api.post(`/pengeluaran/rencana/${id}/approve`, body)
    return response.data
  },

  rejectRencana: async (id, body = {}) => {
    const response = await api.post(`/pengeluaran/rencana/${id}/reject`, body)
    return response.data
  },

  // Pengeluaran (sudah di-approve)
  getPengeluaranList: async (kategori = null, lembaga = null, tanggalDari = null, tanggalSampai = null, page = 1, limit = 20, semuaLembaga = false) => {
    let url = `/pengeluaran?page=${page}&limit=${limit}`
    if (kategori) {
      url += `&kategori=${encodeURIComponent(kategori)}`
    }
    if (lembaga) {
      url += `&lembaga=${encodeURIComponent(lembaga)}`
    }
    if (tanggalDari) {
      url += `&tanggal_dari=${encodeURIComponent(tanggalDari)}`
    }
    if (tanggalSampai) {
      url += `&tanggal_sampai=${encodeURIComponent(tanggalSampai)}`
    }
    if (semuaLembaga) {
      url += '&semua_lembaga=1'
    }
    const response = await api.get(url)
    return response.data
  },

  /** @param {{ semuaLembaga?: boolean }} [opts] */
  getPengeluaranDetail: async (id, opts = {}) => {
    const semuaLembaga = opts.semuaLembaga === true
    const url = semuaLembaga ? `/pengeluaran/${id}?semua_lembaga=1` : `/pengeluaran/${id}`
    const response = await api.get(url)
    return response.data
  },

  updatePengeluaran: async (id, data) => {
    const response = await api.put(`/pengeluaran/${id}`, data)
    return response.data
  },

  getPengurusByLembaga: async (pengeluaranId) => {
    const response = await api.get(`/pengeluaran/${pengeluaranId}/pengurus`)
    return response.data
  },

  deletePengeluaran: async (id, deleteRencana = false) => {
    const response = await api.delete(`/pengeluaran/${id}`, {
      data: { delete_rencana: deleteRencana }
    })
    return response.data
  },

  // Komentar (berdasarkan id_rencana)
  createKomentar: async (idRencana, komentar) => {
    const response = await api.post(`/pengeluaran/rencana/${idRencana}/komentar`, { komentar })
    return response.data
  },

  getKomentar: async (idRencana) => {
    const response = await api.get(`/pengeluaran/rencana/${idRencana}/komentar`)
    return response.data
  },

  deleteKomentar: async (idRencana, komentarId) => {
    const response = await api.delete(`/pengeluaran/rencana/${idRencana}/komentar/${komentarId}`)
    return response.data
  },

  // Viewer (berdasarkan id_rencana)
  getViewer: async (idRencana) => {
    const response = await api.get(`/pengeluaran/rencana/${idRencana}/viewer`)
    return response.data
  },

  // File operations (v2 - upload ke folder uploads di luar public)
  uploadFile: async (idRencana, file) => {
    const formData = new FormData()
    formData.append('file', file)
    // Jangan set Content-Type manual — interceptor menghapus default JSON agar browser/axios menambah boundary multipart.
    const response = await api.post(`/v2/pengeluaran/rencana/${idRencana}/file`, formData)
    return response.data
  },

  getFiles: async (idRencana) => {
    const response = await api.get(`/v2/pengeluaran/rencana/${idRencana}/file`)
    return response.data
  },

  downloadFile: async (fileId) => {
    const response = await api.get(`/v2/pengeluaran/rencana/file/${fileId}/download`, {
      responseType: 'blob'
    })
    return response.data
  },

  deleteFile: async (fileId) => {
    const response = await api.delete(`/v2/pengeluaran/rencana/file/${fileId}`)
    return response.data
  },

  getNotificationConfig: async () => {
    const response = await api.get('/pengeluaran/notification-config')
    return response.data
  },

  saveNotificationConfig: async (data) => {
    const response = await api.put('/pengeluaran/notification-config', data)
    return response.data
  }
}

export const subscriptionAPI = {
  saveSubscription: async (subscription) => {
    const response = await api.post('/subscription', subscription)
    return response.data
  },

  getSubscriptions: async () => {
    const response = await api.get('/subscription')
    return response.data
  },

  deleteSubscription: async (id) => {
    const response = await api.delete(`/subscription/${id}`)
    return response.data
  },

  deleteSubscriptionByEndpoint: async (endpoint) => {
    const response = await api.delete('/subscription/endpoint', {
      data: { endpoint }
    })
    return response.data
  }
}

export const aktivitasAPI = {
  getAktivitasList: async (bulan = null, tahun = null) => {
    let url = '/aktivitas'
    const params = []
    if (bulan) params.push(`bulan=${bulan}`)
    if (tahun) params.push(`tahun=${tahun}`)
    if (params.length > 0) {
      url += '?' + params.join('&')
    }
    const response = await api.get(url)
    return response.data
  },
  getAvailableMonths: async () => {
    const response = await api.get('/aktivitas/months')
    return response.data
  },
  getAktivitasListHijriyah: async (bulan = null, tahun = null) => {
    let url = '/aktivitas/hijriyah'
    const params = []
    if (bulan) params.push(`bulan=${bulan}`)
    if (tahun) params.push(`tahun=${tahun}`)
    if (params.length > 0) {
      url += '?' + params.join('&')
    }
    const response = await api.get(url)
    return response.data
  },
  getAvailableHijriyahMonths: async () => {
    const response = await api.get('/aktivitas/hijriyah/months')
    return response.data
  }
}

// Alamat (wilayah) - dropdown provinsi → kabupaten → kecamatan → desa
export const alamatAPI = {
  list: async ({ tipe, parent }) => {
    const params = new URLSearchParams()
    if (tipe) params.set('tipe', tipe)
    if (parent) params.set('parent', parent)
    const response = await api.get(`/alamat?${params.toString()}`)
    return response.data
  }
}

// Pengurus list & by id (UGT) - untuk cari koordinator madrasah. Return id, nama, whatsapp, dusun..provinsi, kode_pos
export const pengurusAPI = {
  getList: async (params) => {
    const response = await api.get('/pengurus', { params: params || {} })
    return response.data
  },
  getById: async (id) => {
    const response = await api.get(`/pengurus/${id}`)
    return response.data
  }
}

// Madrasah (UGT) - admin_ugt & super_admin only
export const madrasahAPI = {
  getAll: async () => {
    const response = await api.get('/madrasah')
    return response.data
  },

  getById: async (id) => {
    const response = await api.get(`/madrasah/${id}`)
    return response.data
  },

  create: async (data) => {
    const response = await api.post('/madrasah', data)
    return response.data
  },

  update: async (id, data) => {
    const response = await api.put(`/madrasah/${id}`, data)
    return response.data
  },

  /** Upload foto madrasah (hanya gambar, max 1MB). Return { success, foto_path }. */
  uploadFoto: async (file) => {
    const formData = new FormData()
    formData.append('foto', file)
    const response = await api.post('/madrasah/upload-foto', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
    return response.data
  },

  /** Upload logo madrasah (PNG/JPEG, maks. 1 MB — kompresi di klien). Return { success, logo_path }. */
  uploadLogo: async (file) => {
    const formData = new FormData()
    formData.append('logo', file)
    const response = await api.post('/madrasah/upload-logo', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
    return response.data
  },

  /** Cache blob URL per path agar tidak refetch (maks 50, LRU evict). */
  _fotoBlobCache: new Map(),
  _fotoBlobCacheMax: 50,

  /** Ambil URL blob untuk menampilkan foto madrasah (dengan auth). Hasil di-cache di memori; backend pakai Cache-Control + ETag. */
  fetchFotoBlobUrl: async (path) => {
    if (!path || typeof path !== 'string') return null
    const key = path.startsWith('uploads/') ? path : `uploads/ugt/${path}`
    const cached = madrasahAPI._fotoBlobCache.get(key)
    if (cached) return cached
    const response = await api.get('/madrasah/serve-foto', {
      params: { path: key },
      responseType: 'blob'
    })
    if (response.data instanceof Blob) {
      const url = URL.createObjectURL(response.data)
      if (madrasahAPI._fotoBlobCache.size >= madrasahAPI._fotoBlobCacheMax) {
        const firstKey = madrasahAPI._fotoBlobCache.keys().next().value
        const oldUrl = madrasahAPI._fotoBlobCache.get(firstKey)
        if (oldUrl) URL.revokeObjectURL(oldUrl)
        madrasahAPI._fotoBlobCache.delete(firstKey)
      }
      madrasahAPI._fotoBlobCache.set(key, url)
      return url
    }
    return null
  }
}

/** Pengajuan edit profil madrasah dari PJGT (review UGT) */
export const madrasahEditPengajuanAPI = {
  getAll: async (params = {}) => {
    const response = await api.get('/ugt/madrasah-edit-pengajuan', { params })
    return response.data
  },
  getById: async (id) => {
    const response = await api.get('/ugt/madrasah-edit-pengajuan/' + id)
    return response.data
  },
  update: async (id, data) => {
    const response = await api.put('/ugt/madrasah-edit-pengajuan/' + id, data)
    return response.data
  },
  approve: async (id, data = {}) => {
    const response = await api.post('/ugt/madrasah-edit-pengajuan/' + id + '/approve', data)
    return response.data
  },
  reject: async (id, data = {}) => {
    const response = await api.post('/ugt/madrasah-edit-pengajuan/' + id + '/reject', data)
    return response.data
  },
}

/** Penugasan Guru Tugas ke madrasah per tahun ajaran (ugt___guru_tugas_tugasan) */
export const ugtGuruTugasTugasanAPI = {
  listBySantri: async (santriId) => {
    const response = await api.get('/ugt/guru-tugas-tugasan', {
      params: { santri_id: String(santriId) }
    })
    return response.data
  },
  /** Riwayat penugasan guru tugas untuk satu madrasah (kelompokkan per TA di UI). */
  listByMadrasah: async (madrasahId) => {
    const response = await api.get('/ugt/guru-tugas-tugasan', {
      params: { madrasah_id: String(madrasahId) }
    })
    return response.data
  },
  /**
   * Santri yang terikat ke madrasah lewat tugasan aktif pada `tahunAjaran` (hijriyah master).
   * Dipakai page UGT → Guru Tugas (sumber data dinamis mengikuti header tahun ajaran).
   */
  listSantriByTa: async (tahunAjaran) => {
    const response = await api.get('/ugt/guru-tugas-tugasan/santri-by-ta', {
      params: { tahun_ajaran: String(tahunAjaran || '').trim() }
    })
    return response.data
  },
  create: async (data) => {
    const response = await api.post('/ugt/guru-tugas-tugasan', data)
    return response.data
  },
  patch: async (id, data) => {
    const response = await api.patch(`/ugt/guru-tugas-tugasan/${encodeURIComponent(id)}`, data)
    return response.data
  },
  delete: async (id) => {
    const response = await api.delete(`/ugt/guru-tugas-tugasan/${encodeURIComponent(id)}`)
    return response.data
  }
}

/** Laporan koordinator UGT (ugt___koordonator) — admin_ugt, koordinator_ugt, super_admin */
export const ugtLaporanKoordinatorAPI = {
  getAll: async (params = {}) => {
    const q = new URLSearchParams()
    if (params.id_madrasah) q.set('id_madrasah', String(params.id_madrasah))
    if (params.id_koordinator) q.set('id_koordinator', String(params.id_koordinator))
    if (params.id_tahun_ajaran) q.set('id_tahun_ajaran', params.id_tahun_ajaran)
    if (params.bulan != null && params.bulan !== '') q.set('bulan', String(params.bulan))
    const s = q.toString()
    const response = await api.get(s ? `/ugt/laporan-koordinator?${s}` : '/ugt/laporan-koordinator')
    return response.data
  },

  getById: async (id) => {
    const response = await api.get(`/ugt/laporan-koordinator/${id}`)
    return response.data
  },

  create: async (data) => {
    const response = await api.post(
      '/ugt/laporan-koordinator',
      sanitizeUgtLaporanPayload(data, 'koordinator')
    )
    return response.data
  },

  update: async (id, data) => {
    const response = await api.put(
      `/ugt/laporan-koordinator/${id}`,
      sanitizeUgtLaporanPayload(data, 'koordinator')
    )
    return response.data
  },

  remove: async (id) => {
    const response = await api.delete(`/ugt/laporan-koordinator/${id}`)
    return response.data
  },

  getSantriOptions: async (params = {}) => {
    const q = new URLSearchParams()
    if (params.search) q.set('search', params.search)
    if (params.limit) q.set('limit', String(params.limit))
    const s = q.toString()
    const response = await api.get(s ? `/ugt/laporan-koordinator/santri-options?${s}` : '/ugt/laporan-koordinator/santri-options')
    return response.data
  },

  uploadFoto: async (file) => {
    const formData = new FormData()
    formData.append('foto', file)
    const response = await api.post('/ugt/laporan-koordinator/upload-foto', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
    return response.data
  }
}

/** Laporan GT UGT (ugt___gt) */
export const ugtLaporanGtAPI = {
  getAll: async (params = {}) => {
    const q = new URLSearchParams()
    if (params.id_madrasah) q.set('id_madrasah', String(params.id_madrasah))
    if (params.id_koordinator) q.set('id_koordinator', String(params.id_koordinator))
    if (params.id_tahun_ajaran) q.set('id_tahun_ajaran', params.id_tahun_ajaran)
    if (params.bulan != null && params.bulan !== '') q.set('bulan', String(params.bulan))
    const s = q.toString()
    const response = await api.get(s ? `/ugt/laporan-gt?${s}` : '/ugt/laporan-gt')
    return response.data
  },
  getById: async (id) => {
    const response = await api.get(`/ugt/laporan-gt/${id}`)
    return response.data
  },
  create: async (data) => {
    const response = await api.post('/ugt/laporan-gt', sanitizeUgtLaporanPayload(data, 'gt'))
    return response.data
  },
  update: async (id, data) => {
    const response = await api.put(`/ugt/laporan-gt/${id}`, sanitizeUgtLaporanPayload(data, 'gt'))
    return response.data
  },
  remove: async (id) => {
    const response = await api.delete(`/ugt/laporan-gt/${id}`)
    return response.data
  },
  getSantriOptions: async (params = {}) => {
    const q = new URLSearchParams()
    if (params.search) q.set('search', params.search)
    if (params.limit) q.set('limit', String(params.limit))
    const s = q.toString()
    const response = await api.get(s ? `/ugt/laporan-gt/santri-options?${s}` : '/ugt/laporan-gt/santri-options')
    return response.data
  }
}

/** Laporan PJGT UGT (ugt___pjgt) */
export const ugtLaporanPjgtAPI = {
  getAll: async (params = {}) => {
    const q = new URLSearchParams()
    if (params.id_madrasah) q.set('id_madrasah', String(params.id_madrasah))
    if (params.id_koordinator) q.set('id_koordinator', String(params.id_koordinator))
    if (params.id_tahun_ajaran) q.set('id_tahun_ajaran', params.id_tahun_ajaran)
    if (params.bulan != null && params.bulan !== '') q.set('bulan', String(params.bulan))
    const s = q.toString()
    const response = await api.get(s ? `/ugt/laporan-pjgt?${s}` : '/ugt/laporan-pjgt')
    return response.data
  },
  getById: async (id) => {
    const response = await api.get(`/ugt/laporan-pjgt/${id}`)
    return response.data
  },
  create: async (data) => {
    const response = await api.post('/ugt/laporan-pjgt', sanitizeUgtLaporanPayload(data, 'pjgt'))
    return response.data
  },
  update: async (id, data) => {
    const response = await api.put(`/ugt/laporan-pjgt/${id}`, sanitizeUgtLaporanPayload(data, 'pjgt'))
    return response.data
  },
  remove: async (id) => {
    const response = await api.delete(`/ugt/laporan-pjgt/${id}`)
    return response.data
  },
  getSantriOptions: async (params = {}) => {
    const q = new URLSearchParams()
    if (params.search) q.set('search', params.search)
    if (params.limit) q.set('limit', String(params.limit))
    const s = q.toString()
    const response = await api.get(s ? `/ugt/laporan-pjgt/santri-options?${s}` : '/ugt/laporan-pjgt/santri-options')
    return response.data
  },

  /** TA hijriyah aktif + bulan hijriyah saat ini (rentang master + psa___kalender). */
  getKonteksSekarang: async (params = {}) => {
    const q = new URLSearchParams()
    if (params.tanggal) q.set('tanggal', params.tanggal)
    if (params.waktu) q.set('waktu', params.waktu)
    const s = q.toString()
    const response = await api.get(
      s ? `/ugt/laporan-pjgt/konteks-sekarang?${s}` : '/ugt/laporan-pjgt/konteks-sekarang'
    )
    return response.data
  }
}

/** UGT KOMMPAS — lomba & pendaftaran madrasah */
export const ugtKompasAPI = {
  dashboard: async (tahunAjaran) => {
    const response = await api.get('/ugt/kompas/dashboard', {
      params: { tahun_ajaran: tahunAjaran },
    })
    return response.data
  },
  getAturan: async (tahunAjaran) => {
    const response = await api.get('/ugt/kompas/aturan', {
      params: { tahun_ajaran: String(tahunAjaran || '').trim() }
    })
    return response.data
  },
  saveAturan: async (data) => {
    const response = await api.put('/ugt/kompas/aturan', data)
    return response.data
  },
  listLomba: async (tahunAjaran) => {
    const response = await api.get('/ugt/kompas/lomba', {
      params: { tahun_ajaran: String(tahunAjaran || '').trim() }
    })
    return response.data
  },
  getLomba: async (id) => {
    const response = await api.get(`/ugt/kompas/lomba/${id}`)
    return response.data
  },
  createLomba: async (data) => {
    const response = await api.post('/ugt/kompas/lomba', data)
    return response.data
  },
  updateLomba: async (id, data) => {
    const response = await api.put(`/ugt/kompas/lomba/${id}`, data)
    return response.data
  },
  deleteLomba: async (id) => {
    const response = await api.delete(`/ugt/kompas/lomba/${id}`)
    return response.data
  },
  listDaftar: async (params = {}) => {
    const q = {}
    if (params.tahun_ajaran) q.tahun_ajaran = String(params.tahun_ajaran).trim()
    if (params.id_lomba) q.id_lomba = String(params.id_lomba)
    const response = await api.get('/ugt/kompas/daftar', { params: q })
    return response.data
  },
  exportDaftar: async (params = {}) => {
    const q = {}
    if (params.tahun_ajaran) q.tahun_ajaran = String(params.tahun_ajaran).trim()
    if (params.id_lomba) q.id_lomba = String(params.id_lomba)
    const response = await api.get('/ugt/kompas/daftar-export', { params: q })
    return response.data
  },
  getDaftar: async (id) => {
    const response = await api.get(`/ugt/kompas/daftar/${id}`)
    return response.data
  },
  createDaftar: async (data) => {
    const response = await api.post('/ugt/kompas/daftar', data)
    return response.data
  },
  updateDaftar: async (id, data) => {
    const response = await api.put(`/ugt/kompas/daftar/${id}`, data)
    return response.data
  },
  deleteDaftar: async (id) => {
    const response = await api.delete(`/ugt/kompas/daftar/${id}`)
    return response.data
  },
  upload: async (file, jenis = 'foto') => {
    const form = new FormData()
    form.append('file', file)
    form.append('jenis', jenis)
    const response = await api.post('/ugt/kompas/upload', form, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
    return response.data
  },
  checkNik: async ({ nik, tahunAjaran, excludeDaftarId } = {}) => {
    const params = {
      nik: String(nik || '').replace(/\D/g, ''),
      tahun_ajaran: String(tahunAjaran || '').trim(),
    }
    if (excludeDaftarId) params.exclude_daftar_id = String(excludeDaftarId)
    const response = await api.get('/ugt/kompas/check-nik', { params })
    return response.data
  },
  _berkasBlobCache: new Map(),
  _berkasBlobCacheMax: 40,
  fetchBerkasBlobUrl: async (path) => {
    if (!path || typeof path !== 'string') return null
    const key = path.startsWith('uploads/') ? path : `uploads/ugt/kompas/${path}`
    const cached = ugtKompasAPI._berkasBlobCache.get(key)
    if (cached) return cached
    try {
      const response = await api.get('/ugt/kompas/serve-file', {
        params: { path: key },
        responseType: 'blob'
      })
      if (response.data instanceof Blob) {
        const url = URL.createObjectURL(response.data)
        if (ugtKompasAPI._berkasBlobCache.size >= ugtKompasAPI._berkasBlobCacheMax) {
          const firstKey = ugtKompasAPI._berkasBlobCache.keys().next().value
          const oldUrl = ugtKompasAPI._berkasBlobCache.get(firstKey)
          if (oldUrl) URL.revokeObjectURL(oldUrl)
          ugtKompasAPI._berkasBlobCache.delete(firstKey)
        }
        ugtKompasAPI._berkasBlobCache.set(key, url)
        return url
      }
    } catch {
      // abaikan
    }
    return null
  }
}

// Cashless (data toko) - admin_cashless & super_admin only; base path /v2/cashless
export const cashlessAPI = {
  getTokoList: async (params = {}) => {
    const response = await api.get('/v2/cashless/toko', { params })
    return response.data
  },

  /** Detail toko + akun wallet + count & 5 barang terbaru. */
  getTokoDetail: async (id) => {
    const response = await api.get(`/v2/cashless/toko/${id}`)
    return response.data
  },

  createToko: async (data) => {
    const response = await api.post('/v2/cashless/toko', data)
    return response.data
  },

  /** Ambil URL blob untuk foto toko (path dari cashless___pedagang.foto_path). */
  _fotoBlobCache: new Map(),
  _fotoBlobCacheMax: 50,
  fetchFotoBlobUrl: async (path) => {
    if (!path || typeof path !== 'string') return null
    const key = path.startsWith('uploads/') ? path : `uploads/cashless/${path}`
    const cached = cashlessAPI._fotoBlobCache.get(key)
    if (cached) return cached
    try {
      const response = await api.get('/v2/cashless/serve-foto', {
        params: { path: key },
        responseType: 'blob'
      })
      if (response.data instanceof Blob) {
        const url = URL.createObjectURL(response.data)
        if (cashlessAPI._fotoBlobCache.size >= cashlessAPI._fotoBlobCacheMax) {
          const firstKey = cashlessAPI._fotoBlobCache.keys().next().value
          const oldUrl = cashlessAPI._fotoBlobCache.get(firstKey)
          if (oldUrl) URL.revokeObjectURL(oldUrl)
          cashlessAPI._fotoBlobCache.delete(firstKey)
        }
        cashlessAPI._fotoBlobCache.set(key, url)
        return url
      }
    } catch {
      // abaikan: serve-foto gagal/file tidak ada, fallback ke null (placeholder UI)
    }
    return null
  },

  uploadFoto: async (file, pedagangId = null, uploadType = 'toko') => {
    const formData = new FormData()
    formData.append('foto', file)
    if (pedagangId != null) formData.append('pedagang_id', String(pedagangId))
    if (uploadType) formData.append('upload_type', uploadType)
    const response = await api.post('/v2/cashless/upload-foto', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
    return response.data
  },

  updateToko: async (id, data) => {
    const response = await api.put(`/v2/cashless/toko/${id}`, data)
    return response.data
  },

  /** Daftar akun wallet (cashless___accounts). Params: page, limit, entity_type, search. */
  getAccountsList: async (params = {}) => {
    const response = await api.get('/v2/cashless/accounts', { params })
    return response.data
  },

  /** Ringkasan kas SYSTEM vs total wallet (cek keseimbangan). */
  getLedgerSummary: async () => {
    const response = await api.get('/v2/cashless/ledger-summary')
    return response.data
  },

  /** Buat akun wallet dari toko atau santri. Body: { entity_type: 'PEDAGANG'|'SANTRI', entity_id: number }. */
  createAccount: async (data) => {
    const response = await api.post('/v2/cashless/accounts', data)
    return response.data
  },

  /** Data kartu untuk preview/cetak (code, card_uid, name, entity_label). */
  getAccountCard: async (accountId) => {
    const response = await api.get(`/v2/cashless/accounts/${accountId}/card`)
    return response.data
  },

  /** Update akun (card_uid). */
  updateAccount: async (accountId, data) => {
    const response = await api.patch(`/v2/cashless/accounts/${accountId}`, data)
    return response.data
  },

  getConfig: async () => {
    const response = await api.get('/v2/cashless/config')
    return response.data
  },

  setConfig: async (data) => {
    const response = await api.put('/v2/cashless/config', data)
    return response.data
  },

  /** Batas belanja harian wallet santri (override limit masal). */
  getAccountBatasHarian: async (accountId) => {
    const response = await api.get(`/v2/cashless/accounts/${accountId}/batas-harian`)
    return response.data
  },

  setAccountBatasHarian: async (accountId, data) => {
    const response = await api.put(`/v2/cashless/accounts/${accountId}/batas-harian`, data)
    return response.data
  },

  listBatasHarianOpsional: async (params = {}) => {
    const response = await api.get('/v2/cashless/batas-harian-opsional', { params })
    return response.data
  },

  setSantriBatasHarian: async (santriId, data) => {
    const response = await api.put(`/v2/cashless/batas-harian-santri/${santriId}`, data)
    return response.data
  },

  /** Top-up dana ke wallet santri (orang tua bayar cash ke kantor, petugas input manual). Body: { santri_id, nominal, referensi?, metode? }. */
  topUp: async (data) => {
    const response = await api.post('/v2/cashless/topup', data)
    return response.data
  },

  getTopUpHistory: async (santriId, limit = 50) => {
    const response = await api.get('/v2/cashless/topup/history', {
      params: { santri_id: santriId, limit },
    })
    return response.data
  },

  /** Riwayat top-up: { santriId } atau { pedagangId|tokoId }, limit */
  getTopUpHistoryFor: async ({ santriId, pedagangId, tokoId, limit = 50 } = {}) => {
    const params = { limit }
    if (santriId) params.santri_id = santriId
    if (pedagangId) params.pedagang_id = pedagangId
    if (tokoId) params.toko_id = tokoId
    const response = await api.get('/v2/cashless/topup/history', { params })
    return response.data
  },

  /** Tarik tunai dari wallet santri atau toko. Body: { santri_id? | pedagang_id?/toko_id?, nominal, referensi?, metode? }. */
  withdraw: async (data) => {
    const response = await api.post('/v2/cashless/withdraw', data)
    return response.data
  },

  getWithdrawHistory: async ({ santriId, pedagangId, tokoId, limit = 50 } = {}) => {
    const params = { limit }
    if (santriId) params.santri_id = santriId
    if (pedagangId) params.pedagang_id = pedagangId
    if (tokoId) params.toko_id = tokoId
    const response = await api.get('/v2/cashless/withdraw/history', { params })
    return response.data
  },

  /** Riwayat mutasi wallet lengkap (top-up, tarik, belanja, transfer). */
  getStatementHistory: async ({ santriId, pedagangId, tokoId, limit = 50 } = {}) => {
    const params = { limit }
    if (santriId) params.santri_id = santriId
    if (pedagangId) params.pedagang_id = pedagangId
    if (tokoId) params.toko_id = tokoId
    const response = await api.get('/v2/cashless/statement/history', { params })
    return response.data
  },

  issueKartuSingle: async (santriId, cardType, mahromId = null) => {
    const body = { card_type: cardType }
    if (mahromId) body.mahrom_id = mahromId
    const response = await api.post(`/v2/cashless/kartu/santri/${santriId}/issue`, body)
    return response.data
  },

  issueKartuBundle: async (santriId, mahromId = null) => {
    const body = { santri_id: santriId }
    if (mahromId) body.mahrom_id = mahromId
    const response = await api.post('/v2/cashless/kartu/issue-bundle', body)
    return response.data
  },

  listKartuBySantri: async (santriId) => {
    const response = await api.get(`/v2/cashless/kartu/santri/${santriId}`)
    return response.data
  },

  markKartuPrinted: async (santriId, cardType = 'all', mahromId = null, kartuId = null) => {
    const body = { card_type: cardType }
    if (mahromId) body.mahrom_id = mahromId
    if (kartuId) body.kartu_id = kartuId
    const response = await api.post(`/v2/cashless/kartu/santri/${santriId}/mark-printed`, body)
    return response.data
  },

  validateKartuPrinted: async (token, kartuId = null) => {
    const body = { token }
    if (kartuId) body.kartu_id = kartuId
    const response = await api.post('/v2/cashless/kartu/validate', body)
    return response.data
  },

  invalidateAllKartu: async () => {
    const response = await api.post('/v2/cashless/kartu/invalidate-all')
    return response.data
  },

  /** Set/ganti PIN 6 digit kartu CS. */
  setKartuPin: async (kartuId, pin) => {
    const response = await api.put(`/v2/cashless/kartu/${kartuId}/pin`, { pin })
    return response.data
  },

  startMaintenance: async (durationMinutes = null) => {
    const body = {}
    if (durationMinutes != null) body.duration_minutes = durationMinutes
    const response = await api.post('/v2/cashless/maintenance/start', body)
    return response.data
  },

  stopMaintenance: async () => {
    const response = await api.post('/v2/cashless/maintenance/stop')
    return response.data
  },
}

export const mahromAPI = {
  getList: async (params = {}) => {
    const q = new URLSearchParams()
    if (params.search) q.set('search', params.search)
    if (params.page != null) q.set('page', String(params.page))
    if (params.limit != null) q.set('limit', String(params.limit))
    if (params.aktif != null) q.set('aktif', String(params.aktif))
    const response = await api.get(`/v2/mahrom${q.toString() ? `?${q}` : ''}`)
    return response.data
  },

  getById: async (id) => {
    const response = await api.get(`/v2/mahrom/${id}`)
    return response.data
  },

  create: async (data) => {
    const response = await api.post('/v2/mahrom', data)
    return response.data
  },

  update: async (id, data) => {
    const response = await api.put(`/v2/mahrom/${id}`, data)
    return response.data
  },

  setAktif: async (id, aktif) => {
    const response = await api.patch(`/v2/mahrom/${id}/aktif`, { aktif: aktif ? 1 : 0 })
    return response.data
  },

  listBySantri: async (santriId) => {
    const response = await api.get(`/v2/mahrom/santri/${santriId}`)
    return response.data
  },

  searchSantri: async (search = '', limit = 30) => {
    const q = new URLSearchParams()
    if (search) q.set('search', search)
    if (limit != null) q.set('limit', String(limit))
    const response = await api.get(`/v2/mahrom/santri-options?${q}`)
    return response.data
  },

  getHubunganOptions: async () => {
    const response = await api.get('/v2/mahrom/hubungan-options')
    return response.data
  },

  checkNik: async (nik, excludeMahromId = null) => {
    const q = new URLSearchParams({ nik })
    if (excludeMahromId != null && Number(excludeMahromId) > 0) {
      q.set('exclude_id', String(excludeMahromId))
    }
    const response = await api.get(`/v2/mahrom/check-nik?${q}`)
    return response.data
  },

  linkSantri: async (mahromId, relasi) => {
    const response = await api.post(`/v2/mahrom/${mahromId}/link-santri`, { relasi })
    return response.data
  },

  uploadBerkas: async (idMahrom, jenisBerkas, file, keterangan = null) => {
    const formData = new FormData()
    formData.append('id_mahrom', idMahrom)
    formData.append('jenis_berkas', jenisBerkas)
    formData.append('file', file)
    if (keterangan) {
      formData.append('keterangan', keterangan)
    }
    const response = await api.post('/v2/mahrom-berkas/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
        'X-App-Source': 'uwaba',
      },
    })
    return response.data
  },

  getBerkasList: async (idMahrom, jenisBerkas = null) => {
    const params = new URLSearchParams()
    params.append('id_mahrom', idMahrom)
    if (jenisBerkas && jenisBerkas !== '') {
      params.append('jenis_berkas', jenisBerkas)
    }
    const response = await api.get(`/v2/mahrom-berkas/list?${params.toString()}`)
    return response.data
  },

  deleteBerkas: async (idBerkas) => {
    const response = await api.post('/v2/mahrom-berkas/delete', { id: idBerkas })
    return response.data
  },

  updateBerkas: async (formData) => {
    const response = await api.post('/v2/mahrom-berkas/update', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
        'X-App-Source': 'uwaba',
      },
    })
    return response.data
  },

  downloadBerkas: async (idBerkas) => {
    const response = await api.get(`/v2/mahrom-berkas/download?id=${idBerkas}`, {
      responseType: 'blob',
    })
    return response.data
  },

  _fotoBlobCache: new Map(),
  _fotoBlobCacheMax: 50,
  fetchFotoBlobUrl: async (path) => {
    if (!path || typeof path !== 'string') return null
    const key = path.startsWith('uploads/') ? path : `uploads/mahrom/${path}`
    const cached = mahromAPI._fotoBlobCache.get(key)
    if (cached) return cached
    try {
      const response = await api.get('/v2/mahrom/serve-foto', {
        params: { path: key },
        responseType: 'blob',
      })
      if (response.data instanceof Blob) {
        const url = URL.createObjectURL(response.data)
        if (mahromAPI._fotoBlobCache.size >= mahromAPI._fotoBlobCacheMax) {
          const firstKey = mahromAPI._fotoBlobCache.keys().next().value
          const oldUrl = mahromAPI._fotoBlobCache.get(firstKey)
          if (oldUrl) URL.revokeObjectURL(oldUrl)
          mahromAPI._fotoBlobCache.delete(firstKey)
        }
        mahromAPI._fotoBlobCache.set(key, url)
        return url
      }
    } catch {
      // abaikan
    }
    return null
  },

  uploadFoto: async (file, mahromId) => {
    const formData = new FormData()
    formData.append('foto', file)
    formData.append('mahrom_id', String(mahromId))
    const response = await api.post('/v2/mahrom/upload-foto', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return response.data
  },
}

export const bukuTamuAPI = {
  getList: async (params = {}) => {
    const q = new URLSearchParams()
    if (params.tanggal) q.set('tanggal', params.tanggal)
    if (params.search) q.set('search', params.search)
    if (params.page != null) q.set('page', String(params.page))
    if (params.limit != null) q.set('limit', String(params.limit))
    const response = await api.get(`/v2/buku-tamu${q.toString() ? `?${q}` : ''}`)
    return response.data
  },

  scan: async (token, santriIds = null) => {
    const body = { token }
    if (Array.isArray(santriIds) && santriIds.length > 0) {
      body.santri_ids = santriIds
    }
    const response = await api.post('/v2/buku-tamu/scan', body)
    return response.data
  },

  patchSantri: async (entryId, santriIds) => {
    const response = await api.patch(`/v2/buku-tamu/${entryId}/santri`, {
      santri_ids: santriIds,
    })
    return response.data
  },
}

export const lembagaAPI = {
  getAll: async () => {
    const response = await api.get('/lembaga')
    return response.data
  },

  getById: async (id) => {
    const response = await api.get(`/lembaga/${id}`)
    return response.data
  },

  create: async (data) => {
    const response = await api.post('/lembaga', data)
    return response.data
  },

  update: async (id, data) => {
    const response = await api.put(`/lembaga/${id}`, data)
    return response.data
  },

  delete: async (id) => {
    const response = await api.delete(`/lembaga/${id}`)
    return response.data
  },

  /** Upload logo lembaga (PNG saja, max 2MB di server). */
  uploadLogo: async (id, file) => {
    const formData = new FormData()
    formData.append('file', file)
    const response = await api.post(`/lembaga/${encodeURIComponent(id)}/logo`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
    return response.data
  },

  deleteLogo: async (id) => {
    const response = await api.delete(`/lembaga/${encodeURIComponent(id)}/logo`)
    return response.data
  },

  _logoBlobCache: new Map(),
  _logoBlobCacheMax: 50,

  /** URL blob untuk menampilkan logo (dengan auth), di-cache di memori. */
  fetchLogoBlobUrl: async (path) => {
    if (!path || typeof path !== 'string') return null
    const key = path.startsWith('uploads/') ? path : `uploads/lembaga/${path}`
    const cached = lembagaAPI._logoBlobCache.get(key)
    if (cached) return cached
    const response = await api.get('/lembaga/serve-logo', {
      params: { path: key },
      responseType: 'blob'
    })
    if (response.data instanceof Blob) {
      const url = URL.createObjectURL(response.data)
      if (lembagaAPI._logoBlobCache.size >= lembagaAPI._logoBlobCacheMax) {
        const firstKey = lembagaAPI._logoBlobCache.keys().next().value
        const oldUrl = lembagaAPI._logoBlobCache.get(firstKey)
        if (oldUrl) URL.revokeObjectURL(oldUrl)
        lembagaAPI._logoBlobCache.delete(firstKey)
      }
      lembagaAPI._logoBlobCache.set(key, url)
      return url
    }
    return null
  }
}

/** Bisyaroh — aturan & rekap per lembaga */
export const bisyarohAPI = {
  /** @param {string|string[]} lembagaIds — satu id atau beberapa (array → dipisah koma) */
  list: async (lembagaIds) => {
    const ids = Array.isArray(lembagaIds) ? lembagaIds.filter(Boolean).join(',') : lembagaIds
    const response = await api.get('/bisyaroh', { params: { lembaga_ids: ids } })
    return response.data
  },
  /** Semua set yang boleh diakses (tab Aturan — kelola nama & penghubungan lembaga) */
  listAll: async () => {
    const response = await api.get('/bisyaroh', { params: { all: 1 } })
    return response.data
  },
  show: async (id) => {
    const response = await api.get(`/bisyaroh/${id}`)
    return response.data
  },
  create: async (body) => {
    const response = await api.post('/bisyaroh', body)
    return response.data
  },
  update: async (id, body) => {
    const response = await api.put(`/bisyaroh/${id}`, body)
    return response.data
  },
  delete: async (id) => {
    const response = await api.delete(`/bisyaroh/${id}`)
    return response.data
  },
  listKolom: async (bisyarohId) => {
    const response = await api.get(`/bisyaroh/${bisyarohId}/kolom`)
    return response.data
  },
  createKolom: async (bisyarohId, body) => {
    const response = await api.post(`/bisyaroh/${bisyarohId}/kolom`, body)
    return response.data
  },
  updateKolom: async (bisyarohId, kolomId, body) => {
    const response = await api.put(`/bisyaroh/${bisyarohId}/kolom/${kolomId}`, body)
    return response.data
  },
  reorderKolom: async (bisyarohId, orderIds) => {
    const response = await api.put(`/bisyaroh/${bisyarohId}/kolom/reorder`, { order: orderIds })
    return response.data
  },
  deleteKolom: async (bisyarohId, kolomId) => {
    const response = await api.delete(`/bisyaroh/${bisyarohId}/kolom/${kolomId}`)
    return response.data
  },
  listAturan: async (bisyarohId) => {
    const response = await api.get(`/bisyaroh/${bisyarohId}/aturan`)
    return response.data
  },
  createAturan: async (bisyarohId, body) => {
    const response = await api.post(`/bisyaroh/${bisyarohId}/aturan`, body)
    return response.data
  },
  updateAturan: async (bisyarohId, aturanId, body) => {
    const response = await api.put(`/bisyaroh/${bisyarohId}/aturan/${aturanId}`, body)
    return response.data
  },
  deleteAturan: async (bisyarohId, aturanId) => {
    const response = await api.delete(`/bisyaroh/${bisyarohId}/aturan/${aturanId}`)
    return response.data
  },
  listRekap: async (bisyarohId, periodeBulan, kalender = 'masehi', lembagaIds = []) => {
    const ids = Array.isArray(lembagaIds) ? lembagaIds.filter(Boolean).join(',') : ''
    const response = await api.get(`/bisyaroh/${bisyarohId}/rekap`, {
      params: { periode_bulan: periodeBulan, kalender, lembaga_ids: ids }
    })
    return response.data
  },
  /** Beberapa set sekaligus: subtotal per set + grand total */
  /** Lembaga yang boleh dipilih di tab Rekap (ter-scope per API / peran tab Rekap) */
  /** @param {{ histori?: boolean }} [opts] — histori=true memakai cakupan lembaga tab Histori */
  listRekapLembaga: async (opts = {}) => {
    const params = opts.histori ? { histori: 1 } : {}
    const response = await api.get('/bisyaroh/rekap/lembaga', { params })
    return response.data
  },
  /** Tab Review: kalender wajib; periode_bulan → lembaga bulan itu; tanpa periode → daftar bulan */
  listRekapReviewMeta: async ({ lembaga_id: lembagaId = '', kalender = '', periode_bulan: periodeBulan = '' } = {}) => {
    const params = {}
    if (lembagaId) params.lembaga_id = lembagaId
    if (kalender) params.kalender = kalender
    if (periodeBulan) params.periode_bulan = periodeBulan
    const response = await api.get('/bisyaroh/rekap/review-meta', { params })
    return response.data
  },
  getRekapPengurusUrutan: async (lembagaId) => {
    const response = await api.get('/bisyaroh/rekap/pengurus-urutan', {
      params: { lembaga_id: lembagaId }
    })
    return response.data
  },
  putRekapPengurusUrutan: async (lembagaId, orderIds) => {
    const response = await api.put('/bisyaroh/rekap/pengurus-urutan', {
      lembaga_id: lembagaId,
      order: orderIds
    })
    return response.data
  },
  putRekapPengurusRekeningJatim: async (lembagaId, idPengurus, rekeningJatim) => {
    const response = await api.put('/bisyaroh/rekap/pengurus-rekening-jatim', {
      lembaga_id: lembagaId,
      id_pengurus: idPengurus,
      rekening_jatim: rekeningJatim ?? ''
    })
    return response.data
  },
  listHistori: async ({ q = '', lembaga_id: lembagaId = '', only_self: onlySelf = false, limit = 50, offset = 0 } = {}) => {
    const response = await api.get('/bisyaroh/histori', {
      params: {
        q: q || undefined,
        lembaga_id: lembagaId || undefined,
        only_self: onlySelf ? 1 : undefined,
        limit,
        offset
      }
    })
    return response.data
  },
  historiRincian: async (rekapBarisId) => {
    const response = await api.get(`/bisyaroh/histori/rincian/${rekapBarisId}`)
    return response.data
  },
  listRekapMulti: async (bisyarohIds, periodeBulan, kalender = 'masehi', lembagaIds = []) => {
    const ids = Array.isArray(bisyarohIds) ? bisyarohIds.filter(Boolean).join(',') : String(bisyarohIds)
    const lids = Array.isArray(lembagaIds) ? lembagaIds.filter(Boolean).join(',') : ''
    const response = await api.get('/bisyaroh/rekap/multi', {
      params: { bisyaroh_ids: ids, periode_bulan: periodeBulan, kalender, lembaga_ids: lids }
    })
    return response.data
  },
  /** Status alur rekap per set × lembaga (pengajuan / ditinjau / rilis) */
  listRekapStatuses: async ({ bisyarohIds = [], lembagaIds = [], periodeBulan, kalender = 'masehi' }) => {
    const ids = Array.isArray(bisyarohIds) ? bisyarohIds.filter(Boolean).join(',') : ''
    const lids = Array.isArray(lembagaIds) ? lembagaIds.filter(Boolean).join(',') : ''
    const response = await api.get('/bisyaroh/rekap/status', {
      params: { bisyaroh_ids: ids, lembaga_ids: lids, periode_bulan: periodeBulan, kalender }
    })
    return response.data
  },
  updateRekapStatus: async (bisyarohId, body) => {
    const response = await api.put(`/bisyaroh/${bisyarohId}/rekap/status`, body)
    return response.data
  },
  previewRekap: async (bisyarohId, body) => {
    const response = await api.post(`/bisyaroh/${bisyarohId}/rekap/preview`, body)
    return response.data
  },
  upsertRekap: async (bisyarohId, body) => {
    const response = await api.post(`/bisyaroh/${bisyarohId}/rekap`, body)
    return response.data
  },
  upsertRekapBulk: async (bisyarohId, body) => {
    const response = await api.post(`/bisyaroh/${bisyarohId}/rekap/bulk`, body)
    return response.data
  },

  /** Transfer Bank Jatim — preview / buat batch export CSV */
  transferExportBatch: async (body) => {
    const response = await api.post('/bisyaroh/transfer/export-batch', body)
    return response.data
  },
  transferExportRetryFailed: async (body) => {
    const response = await api.post('/bisyaroh/transfer/export-retry-failed', body)
    return response.data
  },
  transferUploadMutasi: async ({ file, exportBatchId }) => {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('export_batch_id', String(exportBatchId))
    const response = await api.post('/bisyaroh/transfer/upload-mutasi', formData)
    return response.data
  },
  transferListBatches: async (params = {}) => {
    const response = await api.get('/bisyaroh/transfer/batches', { params })
    return response.data
  },
  transferShowBatch: async (id) => {
    const response = await api.get(`/bisyaroh/transfer/batches/${id}`)
    return response.data
  },
  transferListBatchRows: async (id, params = {}) => {
    const response = await api.get(`/bisyaroh/transfer/batches/${id}/rows`, { params })
    return response.data
  },
  transferRilisManual: async (body) => {
    const response = await api.post('/bisyaroh/transfer/rilis-manual', body)
    return response.data
  },
  transferApplyMutasi: async ({ mutasiBatchId, exportBatchId }) => {
    const body = { mutasi_batch_id: mutasiBatchId }
    if (exportBatchId) body.export_batch_id = exportBatchId
    const response = await api.post('/bisyaroh/transfer/apply-mutasi', body)
    return response.data
  }
}

/** Reverse geocoding (alamat dari lat/lng) — memakai proxy API + Nominatim */
export const geocodeAPI = {
  reverse: async ({ lat, lng }) => {
    const q = new URLSearchParams()
    q.set('lat', String(lat))
    q.set('lng', String(lng))
    const response = await api.get(`/geocode/reverse?${q.toString()}`)
    return response.data
  },
}

/** Titik lokasi absen GPS */
export const absenLokasiAPI = {
  getList: async () => {
    const response = await api.get('/absen-lokasi')
    return response.data
  },
  /** Titik aktif dalam radius: alamat saja (tanpa nama), untuk semua pengguna berhak tab Absen */
  getPratinjauAlamat: async (params = {}) => {
    const q = new URLSearchParams()
    if (params.lat != null) q.set('lat', String(params.lat))
    if (params.lng != null) q.set('lng', String(params.lng))
    if (params.accuracy != null && params.accuracy !== '') q.set('accuracy', String(params.accuracy))
    const url =
      q.toString().length > 0
        ? `/absen-lokasi/pratinjau-alamat?${q.toString()}`
        : '/absen-lokasi/pratinjau-alamat'
    const response = await api.get(url)
    return response.data
  },
  create: async (body) => {
    const response = await api.post('/absen-lokasi', body)
    return response.data
  },
  update: async (id, body) => {
    const response = await api.put(`/absen-lokasi/${id}`, body)
    return response.data
  },
  delete: async (id) => {
    const response = await api.delete(`/absen-lokasi/${id}`)
    return response.data
  }
}

/** Master alamat pratinjau absen (absen___alamat) — dipakai bersama titik lokasi */
export const absenAlamatAPI = {
  getList: async (params = {}) => {
    const q = new URLSearchParams()
    if (params.id_lembaga != null && String(params.id_lembaga).trim() !== '') {
      q.set('id_lembaga', String(params.id_lembaga).trim())
    }
    const url = q.toString() ? `/absen-alamat?${q.toString()}` : '/absen-alamat'
    const response = await api.get(url)
    return response.data
  },
  create: async (body) => {
    const response = await api.post('/absen-alamat', body)
    return response.data
  },
  update: async (id, body) => {
    const response = await api.put(`/absen-alamat/${id}`, body)
    return response.data
  },
  delete: async (id) => {
    const response = await api.delete(`/absen-alamat/${id}`)
    return response.data
  }
}

/** Pengaturan global absen (jadwal default, sidik jari) — absen___setting */
export const absenSettingAPI = {
  get: async () => {
    const response = await api.get('/absen-setting')
    return response.data
  },
  put: async (body) => {
    const response = await api.put('/absen-setting', body)
    return response.data
  }
}

/** Rekap absensi pengurus (absen___pengurus) — super_admin */
export const absenPengurusAPI = {
  getList: async (params = {}) => {
    const q = new URLSearchParams()
    if (params.q != null && String(params.q).trim() !== '') q.set('q', String(params.q).trim())
    if (params.lembaga_id != null && String(params.lembaga_id).trim() !== '') {
      q.set('lembaga_id', String(params.lembaga_id).trim())
    }
    if (params.limit != null) q.set('limit', String(params.limit))
    if (params.offset != null) q.set('offset', String(params.offset))
    const url = q.toString() ? `/absen-pengurus?${q.toString()}` : '/absen-pengurus'
    const response = await api.get(url)
    return response.data
  },

  /** Rekap per pengurus per hari — from/to: YYYY-MM-DD */
  getRekap: async (params = {}) => {
    const q = new URLSearchParams()
    if (params.from) q.set('from', String(params.from).trim())
    if (params.to) q.set('to', String(params.to).trim())
    if (params.lembaga_id != null && String(params.lembaga_id).trim() !== '') {
      q.set('lembaga_id', String(params.lembaga_id).trim())
    }
    if (params.mode === 'hari') q.set('mode', 'hari')
    if (params.mode === 'jam') q.set('mode', 'jam')
    const url = q.toString() ? `/absen-pengurus/rekap?${q.toString()}` : '/absen-pengurus/rekap'
    const response = await api.get(url)
    return response.data
  },

  /** Analisis peringkat + metrik durasi / tanpa keluar — from/to: YYYY-MM-DD */
  getAnalisis: async (params = {}) => {
    const q = new URLSearchParams()
    if (params.from) q.set('from', String(params.from).trim())
    if (params.to) q.set('to', String(params.to).trim())
    if (params.lembaga_id != null && String(params.lembaga_id).trim() !== '') {
      q.set('lembaga_id', String(params.lembaga_id).trim())
    }
    const url = q.toString() ? `/absen-pengurus/analisis?${q.toString()}` : '/absen-pengurus/analisis'
    const response = await api.get(url)
    return response.data
  },

  /** Status tombol masuk/keluar (absen mandiri GPS) */
  getMandiriSlot: async () => {
    const response = await api.get('/absen-pengurus/mandiri-slot')
    return response.data
  },

  /** Riwayat absen masuk untuk pengurus login (panel GPS) */
  getMandiriRiwayatMasuk: async (params = {}) => {
    const q = new URLSearchParams()
    if (params.limit != null) q.set('limit', String(params.limit))
    const url = q.toString()
      ? `/absen-pengurus/mandiri-riwayat-masuk?${q.toString()}`
      : '/absen-pengurus/mandiri-riwayat-masuk'
    const response = await api.get(url)
    return response.data
  },

  /** Absen mandiri lewat GPS (pengurus) */
  postLokasi: async (body) => {
    const response = await api.post('/absen-pengurus/lokasi', body)
    return response.data
  },
}

/** Konten wirid/amaliyah Nailul Murod (admin_wirid) */
export const wiridNailulMurodAPI = {
  getList: async (params = {}) => {
    const q = new URLSearchParams()
    if (params.bab != null && String(params.bab).trim() !== '') q.set('bab', String(params.bab).trim())
    const url = q.toString() ? `/wirid-nailul-murod?${q.toString()}` : '/wirid-nailul-murod'
    const response = await api.get(url)
    return response.data
  },
  getBabOptions: async () => {
    const response = await api.get('/wirid-nailul-murod/bab-options')
    return response.data
  },
  getBabList: async () => {
    const response = await api.get('/wirid-nailul-murod/bab')
    return response.data
  },
  createBab: async (data) => {
    const response = await api.post('/wirid-nailul-murod/bab', data)
    return response.data
  },
  updateBab: async (id, data) => {
    const response = await api.put(`/wirid-nailul-murod/bab/${id}`, data)
    return response.data
  },
  deleteBab: async (id) => {
    const response = await api.delete(`/wirid-nailul-murod/bab/${id}`)
    return response.data
  },
  reorderBab: async (data) => {
    const response = await api.put('/wirid-nailul-murod/bab/reorder', data)
    return response.data
  },
  reorder: async (data) => {
    const response = await api.put('/wirid-nailul-murod/reorder', data)
    return response.data
  },
  getById: async (id) => {
    const response = await api.get(`/wirid-nailul-murod/${id}`)
    return response.data
  },
  create: async (data) => {
    const response = await api.post('/wirid-nailul-murod', data)
    return response.data
  },
  update: async (id, data) => {
    const response = await api.put(`/wirid-nailul-murod/${id}`, data)
    return response.data
  },
  delete: async (id) => {
    const response = await api.delete(`/wirid-nailul-murod/${id}`)
    return response.data
  },
}

/** Daftar kitab (tabel kitab) — super_admin */
export const kitabAPI = {
  getList: async (params = {}) => {
    const q = new URLSearchParams()
    if (params.search != null && params.search !== '') q.set('search', String(params.search))
    if (params.fan != null && params.fan !== '') q.set('fan', String(params.fan))
    const url = q.toString() ? `/kitab?${q.toString()}` : '/kitab'
    const response = await api.get(url)
    return response.data
  },

  getFanOptions: async () => {
    const response = await api.get('/kitab/fan-options')
    return response.data
  },

  getById: async (id) => {
    const response = await api.get(`/kitab/${id}`)
    return response.data
  },

  create: async (data) => {
    const response = await api.post('/kitab', data)
    return response.data
  },

  update: async (id, data) => {
    const response = await api.put(`/kitab/${id}`, data)
    return response.data
  },

  delete: async (id) => {
    const response = await api.delete(`/kitab/${id}`)
    return response.data
  }
}

/** Mapel per rombel (lembaga___kitab) — super_admin */
export const mapelAPI = {
  getList: async (params = {}) => {
    const q = new URLSearchParams()
    if (params.search != null && params.search !== '') q.set('search', String(params.search))
    if (params.lembaga_id != null && params.lembaga_id !== '') q.set('lembaga_id', String(params.lembaga_id))
    if (params.lembaga_ids != null && params.lembaga_ids !== '') q.set('lembaga_ids', String(params.lembaga_ids))
    if (params.id_rombel != null && params.id_rombel !== '') q.set('id_rombel', String(params.id_rombel))
    if (params.id_rombel_ids != null && params.id_rombel_ids !== '') q.set('id_rombel_ids', String(params.id_rombel_ids))
    if (params.status != null && params.status !== '') q.set('status', String(params.status))
    if (params.page != null) q.set('page', String(params.page))
    if (params.limit != null) q.set('limit', String(params.limit))
    const url = q.toString() ? `/mapel?${q.toString()}` : '/mapel'
    const response = await api.get(url)
    return response.data
  },

  getById: async (id) => {
    const response = await api.get(`/mapel/${id}`)
    return response.data
  },

  create: async (data) => {
    const response = await api.post('/mapel', data)
    return response.data
  },

  update: async (id, data) => {
    const response = await api.put(`/mapel/${id}`, data)
    return response.data
  },

  delete: async (id) => {
    const response = await api.delete(`/mapel/${id}`)
    return response.data
  }
}

/** Jadwal pelajaran (Kurikulum → tab Jadwal) */
export const kurikulumJadwalAPI = {
  getList: async (params = {}) => {
    const q = new URLSearchParams()
    if (params.search != null && params.search !== '') q.set('search', String(params.search))
    if (params.lembaga_id != null && params.lembaga_id !== '') q.set('lembaga_id', String(params.lembaga_id))
    if (params.lembaga_ids != null && params.lembaga_ids !== '') q.set('lembaga_ids', String(params.lembaga_ids))
    if (params.id_rombel != null && params.id_rombel !== '') q.set('id_rombel', String(params.id_rombel))
    if (params.id_lembaga_kitab != null && params.id_lembaga_kitab !== '') {
      q.set('id_lembaga_kitab', String(params.id_lembaga_kitab))
    }
    if (params.status != null && params.status !== '') q.set('status', String(params.status))
    if (params.page != null) q.set('page', String(params.page))
    if (params.limit != null) q.set('limit', String(params.limit))
    const url = q.toString() ? `/kurikulum-jadwal?${q.toString()}` : '/kurikulum-jadwal'
    const response = await api.get(url)
    return response.data
  },

  getById: async (id) => {
    const response = await api.get(`/kurikulum-jadwal/${id}`)
    return response.data
  },

  create: async (data) => {
    const response = await api.post('/kurikulum-jadwal', data)
    return response.data
  },

  update: async (id, data) => {
    const response = await api.put(`/kurikulum-jadwal/${id}`, data)
    return response.data
  },

  delete: async (id) => {
    const response = await api.delete(`/kurikulum-jadwal/${id}`)
    return response.data
  }
}

/** Ujian (jadwal + absensi + nilai per mapel) */
export const ujianAPI = {
  getFormData: async (idLembagaKitab, params = {}) => {
    const q = new URLSearchParams()
    q.set('id_lembaga_kitab', String(idLembagaKitab))
    if (params.id_rombel_ids != null && String(params.id_rombel_ids).trim() !== '') {
      q.set('id_rombel_ids', String(params.id_rombel_ids).trim())
    }
    const response = await api.get(`/ujian/form-data?${q.toString()}`)
    return response.data
  },

  getList: async (params = {}) => {
    const q = new URLSearchParams()
    if (params.lembaga_id != null && params.lembaga_id !== '') q.set('lembaga_id', String(params.lembaga_id))
    if (params.lembaga_ids != null && params.lembaga_ids !== '') q.set('lembaga_ids', String(params.lembaga_ids))
    if (params.id_rombel != null && params.id_rombel !== '') q.set('id_rombel', String(params.id_rombel))
    if (params.id_rombel_ids != null && params.id_rombel_ids !== '') q.set('id_rombel_ids', String(params.id_rombel_ids))
    if (params.id_lembaga_kitab != null && params.id_lembaga_kitab !== '') {
      q.set('id_lembaga_kitab', String(params.id_lembaga_kitab))
    }
    if (params.q != null && String(params.q).trim() !== '') q.set('q', String(params.q).trim())
    if (params.page != null) q.set('page', String(params.page))
    if (params.limit != null) q.set('limit', String(params.limit))
    const url = q.toString() ? `/ujian?${q.toString()}` : '/ujian'
    const response = await api.get(url)
    return response.data
  },

  getById: async (id) => {
    const response = await api.get(`/ujian/${id}`)
    return response.data
  },

  getGrup: async (id) => {
    const response = await api.get(`/ujian/grup/${id}`)
    return response.data
  },

  createGrup: async (data) => {
    const response = await api.post('/ujian/grup', data)
    return response.data
  },

  updateGrup: async (id, data) => {
    const response = await api.put(`/ujian/grup/${id}`, data)
    return response.data
  },

  deleteGrup: async (id) => {
    const response = await api.delete(`/ujian/grup/${id}`)
    return response.data
  },

  create: async (data) => {
    const response = await api.post('/ujian', data)
    return response.data
  },

  update: async (id, data) => {
    const response = await api.put(`/ujian/${id}`, data)
    return response.data
  },

  delete: async (id) => {
    const response = await api.delete(`/ujian/${id}`)
    return response.data
  }
}

// Rombel (lembaga___rombel) — super_admin only
export const rombelAPI = {
  getAll: async (params = {}) => {
    const q = new URLSearchParams()
    if (params.lembaga_id) q.set('lembaga_id', params.lembaga_id)
    if (params.lembaga_ids != null && params.lembaga_ids !== '') q.set('lembaga_ids', params.lembaga_ids)
    if (params.lembaga_nama != null && params.lembaga_nama !== '') q.set('lembaga_nama', params.lembaga_nama)
    if (params.status) q.set('status', params.status)
    if (params.kelas != null && params.kelas !== '') q.set('kelas', params.kelas)
    if (params.search != null && params.search !== '') q.set('search', params.search)
    if (params.id_pengurus_ampu != null && params.id_pengurus_ampu !== '') {
      q.set('id_pengurus_ampu', String(params.id_pengurus_ampu))
    }
    if (params.page != null) q.set('page', String(params.page))
    if (params.limit != null) q.set('limit', String(params.limit))
    const url = q.toString() ? `/rombel?${q.toString()}` : '/rombel'
    const response = await api.get(url)
    return response.data
  },

  getById: async (id) => {
    const response = await api.get(`/rombel/${id}`)
    return response.data
  },

  create: async (data) => {
    const response = await api.post('/rombel', data)
    return response.data
  },

  update: async (id, data) => {
    const response = await api.put(`/rombel/${id}`, data)
    return response.data
  },

  setStatus: async (id, status) => {
    const response = await api.patch(`/rombel/${id}/status`, { status })
    return response.data
  },

  delete: async (id) => {
    const response = await api.delete(`/rombel/${id}`)
    return response.data
  }
}

// Wali kelas (lembaga___wali_kelas) — super_admin only, riwayat tidak dihapus
export const waliKelasAPI = {
  getAll: async (params = {}) => {
    const q = new URLSearchParams()
    if (params.id_kelas) q.set('id_kelas', params.id_kelas)
    if (params.status) q.set('status', params.status)
    if (params.tahun_ajaran) q.set('tahun_ajaran', params.tahun_ajaran)
    const url = q.toString() ? `/wali-kelas?${q.toString()}` : '/wali-kelas'
    const response = await api.get(url)
    return response.data
  },

  getById: async (id) => {
    const response = await api.get(`/wali-kelas/${id}`)
    return response.data
  },

  create: async (data) => {
    const response = await api.post('/wali-kelas', data)
    return response.data
  },

  update: async (id, data) => {
    const response = await api.put(`/wali-kelas/${id}`, data)
    return response.data
  },

  setStatus: async (id, status) => {
    const response = await api.patch(`/wali-kelas/${id}/status`, { status })
    return response.data
  }
}

/** Opsi master biodata santri — tidak memerlukan akses modul LTTQ staff. */
export const santriBiodataAPI = {
  getLttqTingkatanOptions: async (params = {}) => {
    const q = new URLSearchParams()
    if (params.lembaga_id) q.set('lembaga_id', params.lembaga_id)
    if (params.status) q.set('status', params.status)
    if (params.limit != null) q.set('limit', String(params.limit))
    const url = q.toString() ? `/lttq-tingkatan-options?${q.toString()}` : '/lttq-tingkatan-options'
    const response = await api.get(url)
    return response.data
  },
}

export const lttqTingkatanAPI = {
  getAll: async (params = {}) => {
    const q = new URLSearchParams()
    if (params.lembaga_id) q.set('lembaga_id', params.lembaga_id)
    if (params.status) q.set('status', params.status)
    if (params.tingkatan != null && params.tingkatan !== '') q.set('tingkatan', params.tingkatan)
    if (params.search != null && params.search !== '') q.set('search', params.search)
    if (params.page != null) q.set('page', String(params.page))
    if (params.limit != null) q.set('limit', String(params.limit))
    const url = q.toString() ? `/lttq-tingkatan?${q.toString()}` : '/lttq-tingkatan'
    const response = await api.get(url)
    return response.data
  },
  getById: async (id) => {
    const response = await api.get(`/lttq-tingkatan/${id}`)
    return response.data
  },
  create: async (data) => {
    const response = await api.post('/lttq-tingkatan', data)
    return response.data
  },
  update: async (id, data) => {
    const response = await api.put(`/lttq-tingkatan/${id}`, data)
    return response.data
  },
  setStatus: async (id, status) => {
    const response = await api.patch(`/lttq-tingkatan/${id}/status`, { status })
    return response.data
  },
  delete: async (id) => {
    const response = await api.delete(`/lttq-tingkatan/${id}`)
    return response.data
  },
  lulusBulk: async (data) => {
    const response = await api.post('/lttq-tingkatan/lulus', data)
    return response.data
  }
}

export const lttqMualimAPI = {
  getAll: async (params = {}) => {
    const q = new URLSearchParams()
    if (params.id_lttq_tingkatan) q.set('id_lttq_tingkatan', params.id_lttq_tingkatan)
    if (params.status) q.set('status', params.status)
    if (params.tahun_ajaran) q.set('tahun_ajaran', params.tahun_ajaran)
    const url = q.toString() ? `/lttq-mualim?${q.toString()}` : '/lttq-mualim'
    const response = await api.get(url)
    return response.data
  },
  create: async (data) => {
    const response = await api.post('/lttq-mualim', data)
    return response.data
  },
  update: async (id, data) => {
    const response = await api.put(`/lttq-mualim/${id}`, data)
    return response.data
  },
  setStatus: async (id, status) => {
    const response = await api.patch(`/lttq-mualim/${id}/status`, { status })
    return response.data
  }
}

// Daerah (tabel daerah) — super_admin only, grup Domisili
export const daerahAPI = {
  getAll: async (params = {}) => {
    const q = new URLSearchParams()
    if (params.kategori) q.set('kategori', params.kategori)
    if (params.status) q.set('status', params.status)
    const url = q.toString() ? `/daerah?${q.toString()}` : '/daerah'
    const response = await api.get(url)
    return response.data
  },
  getById: async (id) => {
    const response = await api.get(`/daerah/${id}`)
    return response.data
  },
  create: async (data) => {
    const response = await api.post('/daerah', data)
    return response.data
  },
  update: async (id, data) => {
    const response = await api.put(`/daerah/${id}`, data)
    return response.data
  },
  setStatus: async (id, status) => {
    const response = await api.patch(`/daerah/${id}/status`, { status })
    return response.data
  }
}

// Daerah Pengurus (daerah___pengurus)
export const daerahPengurusAPI = {
  getAll: async (params = {}) => {
    const q = new URLSearchParams()
    if (params.id_daerah) q.set('id_daerah', params.id_daerah)
    if (params.status) q.set('status', params.status)
    const url = q.toString() ? `/daerah-pengurus?${q.toString()}` : '/daerah-pengurus'
    const response = await api.get(url)
    return response.data
  },
  getById: async (id) => {
    const response = await api.get(`/daerah-pengurus/${id}`)
    return response.data
  },
  create: async (data) => {
    const response = await api.post('/daerah-pengurus', data)
    return response.data
  },
  update: async (id, data) => {
    const response = await api.put(`/daerah-pengurus/${id}`, data)
    return response.data
  },
  setStatus: async (id, status) => {
    const response = await api.patch(`/daerah-pengurus/${id}/status`, { status })
    return response.data
  }
}

// Daerah Kamar (daerah___kamar)
export const daerahKamarAPI = {
  getAll: async (params = {}) => {
    const q = new URLSearchParams()
    if (params.id_daerah) q.set('id_daerah', params.id_daerah)
    if (params.status) q.set('status', params.status)
    const url = q.toString() ? `/daerah-kamar?${q.toString()}` : '/daerah-kamar'
    const response = await api.get(url)
    return response.data
  },
  getById: async (id) => {
    const response = await api.get(`/daerah-kamar/${id}`)
    return response.data
  },
  create: async (data) => {
    const response = await api.post('/daerah-kamar', data)
    return response.data
  },
  update: async (id, data) => {
    const response = await api.put(`/daerah-kamar/${id}`, data)
    return response.data
  },
  setStatus: async (id, status) => {
    const response = await api.patch(`/daerah-kamar/${id}/status`, { status })
    return response.data
  }
}

// Master Status Santri (tabel status)
export const statusSantriMasterAPI = {
  getAll: async (params = {}) => {
    const q = new URLSearchParams()
    if (params.kategori) q.set('kategori', params.kategori)
    if (params.status) q.set('status', params.status)
    if (params.q) q.set('q', params.q)
    const url = q.toString() ? `/status-santri-master?${q.toString()}` : '/status-santri-master'
    const response = await api.get(url)
    return response.data
  },
  create: async (data) => {
    const response = await api.post('/status-santri-master', data)
    return response.data
  },
  update: async (id, data) => {
    const response = await api.put(`/status-santri-master/${id}`, data)
    return response.data
  },
  setStatus: async (id, status) => {
    const response = await api.patch(`/status-santri-master/${id}/status`, { status })
    return response.data
  }
}

// Daerah Ketua Kamar (daerah___ketua_kamar)
export const daerahKetuaKamarAPI = {
  getAll: async (params = {}) => {
    const q = new URLSearchParams()
    if (params.id_daerah_kamar) q.set('id_daerah_kamar', params.id_daerah_kamar)
    if (params.status) q.set('status', params.status)
    const url = q.toString() ? `/daerah-ketua-kamar?${q.toString()}` : '/daerah-ketua-kamar'
    const response = await api.get(url)
    return response.data
  },
  getById: async (id) => {
    const response = await api.get(`/daerah-ketua-kamar/${id}`)
    return response.data
  },
  create: async (data) => {
    const response = await api.post('/daerah-ketua-kamar', data)
    return response.data
  },
  update: async (id, data) => {
    const response = await api.put(`/daerah-ketua-kamar/${id}`, data)
    return response.data
  },
  setStatus: async (id, status) => {
    const response = await api.patch(`/daerah-ketua-kamar/${id}/status`, { status })
    return response.data
  }
}

/** Catatan santri, pindah kamar, boyong cepat dari halaman Domisili — middleware tarbiyah super */
export const tarbiyahDomisiliSantriAPI = {
  /** @param {number|string} idSantri @param {{ jenis_catatan?: 'putih'|'hitam'|'' }} [opts] */
  getCatatan: async (idSantri, opts = {}) => {
    const q = new URLSearchParams()
    q.set('id_santri', String(idSantri))
    const j = opts.jenis_catatan
    if (j === 'putih' || j === 'hitam') q.set('jenis_catatan', j)
    const response = await api.get(`/tarbiyah/santri/catatan?${q.toString()}`)
    return response.data
  },
  postCatatan: async (data) => {
    const response = await api.post('/tarbiyah/santri/catatan', data)
    return response.data
  },
  deleteCatatan: async (id) => {
    const response = await api.delete(`/tarbiyah/santri/catatan/${encodeURIComponent(id)}`)
    return response.data
  },
  pindahKamar: async (data) => {
    const response = await api.post('/tarbiyah/santri/pindah-kamar', data)
    return response.data
  },
  boyongDomisili: async (data) => {
    const response = await api.post('/tarbiyah/santri/boyong-domisili', data)
    return response.data
  },
  /** Master jenis pelanggaran (opsional filter kategori: ringan|sedang|berat|buku_hitam) */
  getPelanggaranMaster: async (opts = {}) => {
    const q = new URLSearchParams()
    const k = opts.kategori
    if (k === 'ringan' || k === 'sedang' || k === 'berat' || k === 'buku_hitam') q.set('kategori', k)
    const suffix = q.toString() ? `?${q.toString()}` : ''
    const response = await api.get(`/tarbiyah/santri/pelanggaran-master${suffix}`)
    return response.data
  },
  /** Riwayat pelanggaran per santri */
  getPelanggaranSantri: async (idSantri) => {
    const q = new URLSearchParams()
    q.set('id_santri', String(idSantri))
    const response = await api.get(`/tarbiyah/santri/pelanggaran?${q.toString()}`)
    return response.data
  },
  /**
   * Daftar catatan pelanggaran by rentang tanggal_dibuat (Masehi Y-m-d).
   * @param {{ tanggal_dari: string, tanggal_sampai: string }} range
   */
  getPelanggaranByTanggal: async (range) => {
    const q = new URLSearchParams()
    if (range?.tanggal_dari) q.set('tanggal_dari', String(range.tanggal_dari).slice(0, 10))
    if (range?.tanggal_sampai) q.set('tanggal_sampai', String(range.tanggal_sampai).slice(0, 10))
    const response = await api.get(`/tarbiyah/santri/pelanggaran-by-tanggal?${q.toString()}`)
    return response.data
  },
  /** Body: id_santri, id_pelanggaran, catatan (opsional) — konteks rombel/kamar diisi server */
  postPelanggaran: async (data) => {
    const response = await api.post('/tarbiyah/santri/pelanggaran', data)
    return response.data
  }
}

/** Master pelanggaran (CRUD admin Domisili) — /api/tarbiyah/pelanggaran-admin */
export const pelanggaranAdminAPI = {
  /** @param {{ aktif?: boolean|'1' }} [params] — jika aktif true, hanya baris aktif */
  getAll: async (params = {}) => {
    const q = new URLSearchParams()
    if (params.aktif === true || params.aktif === '1' || params.aktif === 1) q.set('aktif', '1')
    const suffix = q.toString() ? `?${q.toString()}` : ''
    const response = await api.get(`/tarbiyah/pelanggaran-admin${suffix}`)
    return response.data
  },
  create: async (data) => {
    const response = await api.post('/tarbiyah/pelanggaran-admin', data)
    return response.data
  },
  update: async (id, data) => {
    const response = await api.put(`/tarbiyah/pelanggaran-admin/${encodeURIComponent(id)}`, data)
    return response.data
  },
  setStatus: async (id, aktif) => {
    const response = await api.patch(`/tarbiyah/pelanggaran-admin/${encodeURIComponent(id)}/status`, {
      aktif: aktif ? 1 : 0
    })
    return response.data
  }
}

// Master Tahun Ajaran (hijriyah / masehi) — super_admin only
export const tahunAjaranAPI = {
  getAll: async (params = {}) => {
    const q = new URLSearchParams()
    if (params.kategori) q.set('kategori', params.kategori)
    const url = q.toString() ? `/tahun-ajaran?${q.toString()}` : '/tahun-ajaran'
    const response = await api.get(url)
    return response.data
  },

  getById: async (id) => {
    const response = await api.get(`/tahun-ajaran/${encodeURIComponent(id)}`)
    return response.data
  },

  create: async (data) => {
    const response = await api.post('/tahun-ajaran', data)
    return response.data
  },

  update: async (id, data) => {
    const response = await api.put(`/tahun-ajaran/${encodeURIComponent(id)}`, data)
    return response.data
  }
}

// Uploads Manager (super_admin only) - kelola file di folder backend/uploads
export const uploadsManagerAPI = {
  list: async () => {
    const response = await api.get('/uploads-manager/list')
    return response.data
  },

  /** Ambil file sebagai blob untuk preview/download (menggunakan auth yang sama dengan axios) */
  serveBlob: async (path) => {
    const response = await api.get('/uploads-manager/serve', {
      params: { path },
      responseType: 'blob'
    })
    return response.data
  },

  deleteFile: async (path) => {
    const response = await api.post('/uploads-manager/delete', { path })
    return response.data
  },

  /** Cek apakah ada file di lokasi berkas lama (backend/uploads/santri) */
  checkLegacySantri: async () => {
    const response = await api.get('/uploads-manager/check-legacy-santri')
    return response.data
  },

  /** Pindahkan file santri dari lokasi lama ke lokasi baru */
  migrateSantriFromLegacy: async () => {
    const response = await api.post('/uploads-manager/migrate-santri')
    return response.data
  },

  /** Cek apakah ada file rencana-pengeluaran di lokasi lama */
  checkLegacyRencana: async () => {
    const response = await api.get('/uploads-manager/check-legacy-rencana')
    return response.data
  },

  /** Pindahkan file rencana-pengeluaran dari lokasi lama ke lokasi baru */
  migrateRencanaFromLegacy: async () => {
    const response = await api.post('/uploads-manager/migrate-rencana')
    return response.data
  }
}

export const umrohJamaahAPI = {
  getDashboard: async () => {
    const response = await api.get('/umroh/dashboard')
    return response.data
  },

  getLaporan: async (params = {}) => {
    const queryString = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '' && v != null))
    ).toString()
    const url = queryString ? `/umroh/laporan?${queryString}` : '/umroh/laporan'
    const response = await api.get(url)
    return response.data
  },

  getAll: async (params = {}) => {
    const queryString = new URLSearchParams(params).toString()
    const url = queryString ? `/umroh/jamaah?${queryString}` : '/umroh/jamaah'
    const response = await api.get(url)
    return response.data
  },

  getById: async (id) => {
    const response = await api.get(`/umroh/jamaah/${id}`)
    return response.data
  },

  create: async (data) => {
    const response = await api.post('/umroh/jamaah', data)
    return response.data
  },

  update: async (id, data) => {
    const response = await api.put(`/umroh/jamaah/${id}`, data)
    return response.data
  },

  delete: async (id) => {
    const response = await api.delete(`/umroh/jamaah/${id}`)
    return response.data
  }
}

export const umrohTabunganAPI = {
  getAll: async (params = {}) => {
    const queryString = new URLSearchParams(params).toString()
    const url = queryString ? `/umroh/tabungan?${queryString}` : '/umroh/tabungan'
    const response = await api.get(url)
    return response.data
  },

  getById: async (id) => {
    const response = await api.get(`/umroh/tabungan/${id}`)
    return response.data
  },

  getByJamaahId: async (jamaahId) => {
    const response = await api.get(`/umroh/tabungan?id_jamaah=${jamaahId}&limit=500`)
    return response.data
  },

  create: async (data) => {
    const response = await api.post('/umroh/tabungan', data)
    return response.data
  },

  update: async (id, data) => {
    const response = await api.put(`/umroh/tabungan/${id}`, data)
    return response.data
  },

  delete: async (id) => {
    const response = await api.delete(`/umroh/tabungan/${id}`)
    return response.data
  }
}

export const umrohPengeluaranAPI = {
  getAll: async (params = {}) => {
    const queryString = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '' && v != null))
    ).toString()
    const url = queryString ? `/umroh/pengeluaran?${queryString}` : '/umroh/pengeluaran'
    const response = await api.get(url)
    return response.data
  },

  getById: async (id) => {
    const response = await api.get(`/umroh/pengeluaran/${id}`)
    return response.data
  },

  create: async (data) => {
    const response = await api.post('/umroh/pengeluaran', data)
    return response.data
  },

  update: async (id, data) => {
    const response = await api.put(`/umroh/pengeluaran/${id}`, data)
    return response.data
  },

  approve: async (id) => {
    const response = await api.post(`/umroh/pengeluaran/${id}/approve`)
    return response.data
  },

  reject: async (id) => {
    const response = await api.post(`/umroh/pengeluaran/${id}/reject`)
    return response.data
  },

  delete: async (id) => {
    const response = await api.delete(`/umroh/pengeluaran/${id}`)
    return response.data
  },
}

// Payment Transaction API (iPayMu)
export const paymentTransactionAPI = {
  createTransaction: async (data) => {
    const response = await api.post('/payment-transaction/create', data)
    return response.data
  },

  checkStatus: async (sessionId) => {
    const response = await api.get(`/payment-transaction/status/${sessionId}`)
    return response.data
  },

  /** Staff: kirim WA tagihan (QRIS / logo metode) ke nomor yang dipilih. */
  sendWa: async (transactionId, { phone, email, phones } = {}) => {
    const response = await api.post(`/payment-transaction/${transactionId}/send-wa`, {
      phone: phone ?? undefined,
      email: email ?? undefined,
      phones: Array.isArray(phones) ? phones : undefined
    })
    return response.data
  }
}

/** Modul Website Pesantren (admin) — selaras api/routes/37_website_admin.php */
export const websiteAPI = {
  dashboard: async () => (await api.get('/website/dashboard')).data,
  // Berita
  listBerita: async (params = {}) =>
    (await api.get('/website/berita', { params })).data,
  getBerita: async (id) =>
    (await api.get(`/website/berita/${encodeURIComponent(id)}`)).data,
  createBerita: async (data) =>
    (await api.post('/website/berita', data)).data,
  updateBerita: async (id, data) =>
    (await api.put(`/website/berita/${encodeURIComponent(id)}`, data)).data,
  deleteBerita: async (id) =>
    (await api.delete(`/website/berita/${encodeURIComponent(id)}`)).data,
  /**
   * Multipart: field `file`, opsional `context`:
   * berita_cover | berita_konten | galeri | banner | seo_og | seo_favicon | default
   * Server mengompres & mengarahkan ke uploads/website/… (publik lewat gambar.* jika di-set).
   */
  uploadImage: async (file, context = 'default') => {
    const fd = new FormData()
    fd.append('file', file)
    if (context && String(context).trim() !== '') {
      fd.append('context', String(context).trim())
    }
    const response = await api.post('/website/upload-image', fd)
    return response.data
  },
  // Kategori berita
  listKategoriBerita: async (params = {}) =>
    (await api.get('/website/kategori-berita', { params })).data,
  createKategoriBerita: async (data) =>
    (await api.post('/website/kategori-berita', data)).data,
  updateKategoriBerita: async (id, data) =>
    (await api.put(`/website/kategori-berita/${encodeURIComponent(id)}`, data)).data,
  deleteKategoriBerita: async (id) =>
    (await api.delete(`/website/kategori-berita/${encodeURIComponent(id)}`)).data,
  // Banner
  listBanner: async () => (await api.get('/website/banner')).data,
  createBanner: async (data) => (await api.post('/website/banner', data)).data,
  updateBanner: async (id, data) =>
    (await api.put(`/website/banner/${encodeURIComponent(id)}`, data)).data,
  deleteBanner: async (id) =>
    (await api.delete(`/website/banner/${encodeURIComponent(id)}`)).data,
  // Halaman
  listHalaman: async (params = {}) =>
    (await api.get('/website/halaman', { params })).data,
  getHalaman: async (id) =>
    (await api.get(`/website/halaman/${encodeURIComponent(id)}`)).data,
  createHalaman: async (data) =>
    (await api.post('/website/halaman', data)).data,
  updateHalaman: async (id, data) =>
    (await api.put(`/website/halaman/${encodeURIComponent(id)}`, data)).data,
  deleteHalaman: async (id) =>
    (await api.delete(`/website/halaman/${encodeURIComponent(id)}`)).data,
  // Galeri
  listGaleri: async (params = {}) =>
    (await api.get('/website/galeri', { params })).data,
  createGaleri: async (data) =>
    (await api.post('/website/galeri', data)).data,
  updateGaleri: async (id, data) =>
    (await api.put(`/website/galeri/${encodeURIComponent(id)}`, data)).data,
  deleteGaleri: async (id) =>
    (await api.delete(`/website/galeri/${encodeURIComponent(id)}`)).data,
  // Kategori galeri
  listKategoriGaleri: async (params = {}) =>
    (await api.get('/website/kategori-galeri', { params })).data,
  createKategoriGaleri: async (data) =>
    (await api.post('/website/kategori-galeri', data)).data,
  updateKategoriGaleri: async (id, data) =>
    (await api.put(`/website/kategori-galeri/${encodeURIComponent(id)}`, data)).data,
  deleteKategoriGaleri: async (id) =>
    (await api.delete(`/website/kategori-galeri/${encodeURIComponent(id)}`)).data,
  // SEO global
  getSeo: async () => (await api.get('/website/seo')).data,
  updateSeo: async (data) => (await api.put('/website/seo', data)).data
}

export default api

