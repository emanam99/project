import axios from 'axios'

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

// Helper untuk mendapatkan base URL API
// Saat akses dari HP/device lain lewat IP (10.x, 192.168.x): selalu pakai hostname agar API ke PC yang sama
// Saat localhost atau production: pakai VITE_API_BASE_URL atau fallback
export const getSlimApiUrl = () => {
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
    const url = envUrl.trim()
    return url.endsWith('/') ? url.slice(0, -1) : url
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
    const rootDomain = parts.length > 2 ? parts.slice(-2).join('.') : hostname
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
 */
export const checkWhatsAppNumberViaAPI = (phoneNumber) =>
  api.post('/wa/check', { phoneNumber: String(phoneNumber || '').trim() }).then((r) => r.data)

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
    u.includes('/v2/auth/setup-token') ||
    u.includes('/v2/auth/setup-akun') ||
    u.includes('/v2/auth/daftar-check') ||
    u.includes('/v2/auth/daftar-konfirmasi') ||
    u.includes('/v2/auth/lupa-password-request') ||
    u.includes('/v2/auth/ubah-password-token') ||
    u.includes('/v2/auth/ubah-password') ||
    u.includes('/v2/auth/ubah-username-token') ||
    u.includes('/v2/auth/ubah-username') ||
    // WebAuthn pra-login: jangan pakai Bearer + cek umur token — halaman login perlu cek passkey tanpa JWT valid
    u.includes('/v2/auth/webauthn/status') ||
    u.includes('/v2/auth/webauthn/login/options') ||
    u.includes('/v2/auth/webauthn/login/verify')
  )
}

/** Hapus token login & redirect. Refresh token tetap disimpan agar kalender tetap bisa diakses (tanpa auto-login). */
function clearAuthAndRedirectToLogin() {
  localStorage.removeItem('auth_token')
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

    // Tambahkan CSRF token (kecuali untuk login dan auth v2 endpoint)
    if (!config.url?.includes('/auth/login') && !config.url?.includes('/v2/auth')) {
      const csrfToken = await getCsrfToken()
      if (csrfToken) {
        config.headers['X-CSRF-Token'] = csrfToken
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

    // Skip handling untuk endpoint login dan v2 auth (untuk menghindari redirect loop)
    if (originalRequest?.url?.includes('/auth/login') || originalRequest?.url?.includes('/v2/auth')) {
      return Promise.reject(error)
    }

    // Endpoint /deepseek/*: 401 dari penyedia mode alternatif (bukan JWT eBeddien). Jangan logout.
    if (originalRequest?.url?.includes('/deepseek')) {
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

  /** Konfirmasi daftar: kirim link WA (aktif 5 menit). Origin frontend dikirim otomatis lewat interceptor axios. */
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
    } catch (_) {}
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

  logout: () => {
    resetCsrfToken()
    localStorage.removeItem('auth_token')
  }
}

/**
 * Base URL backend WA (Node) — koneksi/QR, status, connect/disconnect/logout.
 * - Staging: frontend di *2.alutsmani.id → WA Node di https://wa2.alutsmani.id (folder `wa`, port 3003 di VPS).
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

  // Staging alutsmani.id: subdomain …2 (ebeddien2, uwaba2, api2 untuk tes, dll.) → backend WA terpisah wa2
  // Kecuali api* (biasanya bukan UI Koneksi WA) — tetap wa2 aman untuk konsistensi; bisa override lewat .env.
  // ebeddien2.alutsmani.id, uwaba2.*, api2.*, … (subdomain berakhiran "2" = staging → WA Node wa2)
  const alutsmaniParts = hl.match(/^([a-z0-9-]+)\.alutsmani\.id$/i)
  if (alutsmaniParts) {
    const sub = alutsmaniParts[1]
    if (sub.endsWith('2')) {
      return 'https://wa2.alutsmani.id'
    }
  }

  // Production & domain lain *.alutsmani.id / *.alutsmani.my.id
  if (hl.includes('alutsmani.id') || hl.includes('alutsmani.my.id')) {
    return 'https://wa.alutsmani.id'
  }

  return `${protocol}//${hostname}:${waPort}`
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
   * @param {string} [sessionId] - default, wa2, wa3, ... (max 10)
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
   * Kirim pesan lewat backend WA (untuk tes di halaman Koneksi WA).
   * @param {string} phoneNumber - Nomor 08xxx atau 62xxx
   * @param {string} message - Isi pesan
   * @param {string} [imageBase64] - Base64 gambar (opsional)
   * @param {string} [imageMimetype] - image/png, image/jpeg, dll.
   */
  send: async (phoneNumber, message, imageBase64 = null, imageMimetype = 'image/png', sessionId = null) => {
    const base = getWaBackendUrl()
    const token = localStorage.getItem('auth_token')
    const body = {
      phoneNumber: (phoneNumber || '').trim(),
      message: message || ''
    }
    if (sessionId) body.sessionId = sessionId
    if (imageBase64) {
      body.imageBase64 = imageBase64
      body.imageMimetype = imageMimetype || 'image/png'
    }
    const { res, data } = await fetchJsonWithTimeout(`${base}/api/whatsapp/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify(body)
    })
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
    const { data } = await fetchJsonWithTimeout(`${base}/api/whatsapp/check`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify(body)
    })
    return data
  }
}

/**
 * Warmer: data pairs & pesan dari API PHP (Slim). Hanya role chat+.
 */
export const warmerAPI = {
  getPairs: () => api.get('/warmer/pairs').then((r) => r.data),
  getCategories: () => api.get('/warmer/categories').then((r) => r.data),
  getThemes: () => api.get('/warmer/themes').then((r) => r.data),
  deleteTheme: (theme) => api.post('/warmer/themes/delete', { theme }).then((r) => r.data),
  createPair: (body) => api.post('/warmer/pairs', body).then((r) => r.data),
  updatePair: (body) => api.put('/warmer/pairs', body).then((r) => r.data),
  deletePair: (id) => api.post('/warmer/pairs/delete', { id }).then((r) => r.data),
  getMessages: (params) => api.get('/warmer/messages', { params }).then((r) => r.data),
  importMessages: (body) => api.post('/warmer/messages/import', body).then((r) => r.data),
  deleteMessage: (id) => api.post('/warmer/messages/delete', { id }).then((r) => r.data),
  getExamples: (format) => api.get('/warmer/examples', { params: { format: format || 'txt' } }).then((r) => r.data)
}

/**
 * Warmer: start/stop/status di backend Node (WA).
 */
export const warmerNodeAPI = {
  getStatus: async () => {
    const base = getWaBackendUrl()
    const token = localStorage.getItem('auth_token')
    const { data } = await fetchJsonWithTimeout(`${base}/api/warmer/status`, {
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) }
    })
    return data?.success ? data : { success: false, data: { running: false } }
  },
  start: async () => {
    const base = getWaBackendUrl()
    const token = localStorage.getItem('auth_token')
    const { data } = await fetchJsonWithTimeout(`${base}/api/warmer/start`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) } })
    return data
  },
  stop: async () => {
    const base = getWaBackendUrl()
    const token = localStorage.getItem('auth_token')
    const { data } = await fetchJsonWithTimeout(`${base}/api/warmer/stop`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) } })
    return data
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
    const response = await api.post('/wa/send', body)
    return response.data
  },

  /**
   * Edit pesan WA yang sudah dikirim (hanya dalam 15 menit setelah kirim).
   * @param {string} phoneNumber - Nomor (08xxx atau 62xxx)
   * @param {string} messageId - ID pesan dari WA (wa_message_id)
   * @param {string} newMessage - Isi pesan baru
   */
  edit: async (phoneNumber, messageId, newMessage) => {
    const response = await api.post('/wa/edit-message', {
      phoneNumber: (phoneNumber || '').trim(),
      messageId: (messageId || '').trim(),
      newMessage: typeof newMessage === 'string' ? newMessage.trim() : ''
    })
    return response.data
  }
}

// Santri API
export const santriAPI = {
  getAll: async () => {
    const response = await api.get('/santri')
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

  getRiwayatKamar: async (idSantri) => {
    const response = await api.get(`/santri/riwayat-kamar?id_santri=${encodeURIComponent(idSantri)}`)
    return response.data
  }
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

// Ijin API
export const ijinAPI = {
  get: async (idSantri = null, tahunAjaran = null) => {
    let url = '/ijin'
    const params = []
    if (idSantri) params.push(`id_santri=${idSantri}`)
    if (tahunAjaran) params.push(`tahun_ajaran=${encodeURIComponent(tahunAjaran)}`)
    if (params.length > 0) url += '?' + params.join('&')
    const response = await api.get(url)
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
    const url = q.toString() ? `/kalender?${q.toString()}` : '/kalender'
    const response = await api.get(url)
    return response.data
  },
  postBulk: async (data) => {
    const response = await api.post('/kalender', data)
    return response.data
  }
}

// Hari Penting API (GET public, POST/DELETE admin_kalender)
export const hariPentingAPI = {
  getList: async (params = {}) => {
    const q = new URLSearchParams()
    if (params.tipe) q.set('tipe', params.tipe)
    if (params.tahun) q.set('tahun', params.tahun)
    if (params.bulan) q.set('bulan', params.bulan)
    if (params.tanggal) q.set('tanggal', params.tanggal)
    if (params.hari_pekan) q.set('hari_pekan', params.hari_pekan)
    const url = q.toString() ? `/hari-penting?${q.toString()}` : '/hari-penting'
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
  }
}

// Google Calendar (Jadwal Pesantren - kalender public)
export const googleCalendarAPI = {
  getEvents: async (params = {}) => {
    const q = new URLSearchParams()
    if (params.slug) q.set('slug', params.slug)
    if (params.timeMin) q.set('timeMin', params.timeMin)
    if (params.timeMax) q.set('timeMax', params.timeMax)
    const url = `/google-calendar/events${q.toString() ? `?${q.toString()}` : ''}`
    const response = await api.get(url)
    return response.data
  },
  getConfig: async () => {
    const response = await api.get('/google-calendar/config')
    return response.data
  },
  getConfigBySlug: async (slug) => {
    const response = await api.get(`/google-calendar/config/${encodeURIComponent(slug)}`)
    return response.data
  },
  updateConfig: async (slug, data) => {
    const response = await api.put(`/google-calendar/config/${encodeURIComponent(slug)}`, data)
    return response.data
  },
  createEvent: async (data) => {
    const response = await api.post('/google-calendar/events', data)
    return response.data
  },
  updateEvent: async (eventId, data) => {
    const response = await api.put(`/google-calendar/events/${encodeURIComponent(eventId)}`, data)
    return response.data
  },
  deleteEvent: async (eventId, slug = 'pesantren') => {
    const response = await api.delete(`/google-calendar/events/${encodeURIComponent(eventId)}?slug=${encodeURIComponent(slug)}`)
    return response.data
  }
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

  /** Daftar tahun ajaran UWABA (untuk riwayat pembayaran). Public endpoint. */
  getPublicUwabaTahunList: async () => {
    const response = await api.get('public/pembayaran/uwaba/tahun-list')
    return response.data
  },

  /** Rincian pembayaran by santri (mode: uwaba, khusus, tunggakan). Public endpoint. */
  getPublicRincian: async (idSantri, mode, tahunAjaran = null) => {
    let url = `public/pembayaran/${mode}?id_santri=${encodeURIComponent(idSantri)}`
    if (tahunAjaran) url += `&tahun_ajaran=${encodeURIComponent(tahunAjaran)}`
    const response = await api.get(url)
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

  lengkapiData: async (idSantri, tahunAjaran, formData) => {
    const response = await api.post('/uwaba/lengkapi-data', {
      id_santri: idSantri,
      tahun_ajaran: tahunAjaran,
      form_data: formData
    })
    return response.data
  }
}

// Pendaftaran API
export const pendaftaranAPI = {
  getKategoriOptions: async () => {
    const response = await api.get('/pendaftaran/kategori-options')
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
    const params = new URLSearchParams()
    params.append('id_santri', idSantri)
    if (tahunHijriyah && tahunHijriyah !== '') {
      params.append('tahun_hijriyah', tahunHijriyah)
    }
    if (tahunMasehi && tahunMasehi !== '') {
      params.append('tahun_masehi', tahunMasehi)
    }
    const response = await api.get(`/pendaftaran/get-registrasi?${params.toString()}`)
    return response.data
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

  getAllPendaftar: async (tahunHijriyah, tahunMasehi) => {
    const params = new URLSearchParams()
    if (tahunHijriyah && tahunHijriyah !== '') {
      params.append('tahun_hijriyah', tahunHijriyah)
    }
    if (tahunMasehi && tahunMasehi !== '') {
      params.append('tahun_masehi', tahunMasehi)
    }
    const queryString = params.toString()
    const url = queryString
      ? `/pendaftaran/get-all-pendaftar?${queryString}`
      : '/pendaftaran/get-all-pendaftar'
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

  mergeSantri: async (idSantriUtama, idSantriSekunder) => {
    const response = await api.post('/pendaftaran/merge-santri', {
      id_santri_utama: idSantriUtama,
      id_santri_sekunder: idSantriSekunder
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
   * Body: { status_pendaftar?, daftar_formal?, daftar_diniyah?, status_murid?, status_santri?, gender?, gelombang? }
   * Returns: { success, data: { items: [...], total_wajib, matching_set_ids } }
   */
  getItemsByKondisi: async (kondisi = {}) => {
    const response = await api.post('/pendaftaran/items-by-kondisi', kondisi)
    return response.data
  },

  getLastPendaftar: async (tahunHijriyah = null, tahunMasehi = null) => {
    const params = new URLSearchParams()
    if (tahunHijriyah && tahunHijriyah !== '') {
      params.append('tahun_hijriyah', tahunHijriyah)
    }
    if (tahunMasehi && tahunMasehi !== '') {
      params.append('tahun_masehi', tahunMasehi)
    }
    const queryString = params.toString()
    const url = queryString
      ? `/pendaftaran/get-last-pendaftar?${queryString}`
      : '/pendaftaran/get-last-pendaftar'
    const response = await api.get(url)
    return response.data
  },

  getDashboard: async (tahunHijriyah = null, tahunMasehi = null) => {
    const params = new URLSearchParams()
    if (tahunHijriyah && tahunHijriyah !== '') {
      params.append('tahun_hijriyah', tahunHijriyah)
    }
    if (tahunMasehi && tahunMasehi !== '') {
      params.append('tahun_masehi', tahunMasehi)
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
  }
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

  getDataSantri: async (tahunAjaran) => {
    const response = await api.get(`/dashboard/data-santri?tahun_ajaran=${tahunAjaran || ''}`)
    return response.data
  },
  getDataKhusus: async (tahunAjaran, tahunAjaranMasehi, showAll = false, belumAdaKewajiban = false) => {
    let url = '/dashboard/data-khusus'
    const params = []
    if (belumAdaKewajiban) {
      params.push(`belum_ada_kewajiban=true`)
    } else {
      if (showAll) {
        params.push(`show_all=true`)
      } else {
        if (tahunAjaran) {
          params.push(`tahun_ajaran=${tahunAjaran}`)
        }
        if (tahunAjaranMasehi) {
          params.push(`tahun_ajaran_masehi=${tahunAjaranMasehi}`)
        }
      }
    }
    if (params.length > 0) {
      url += '?' + params.join('&')
    }
    const response = await api.get(url)
    return response.data
  },
  getDataTunggakan: async (tahunAjaran, tahunAjaranMasehi, showAll = false, belumAdaKewajiban = false) => {
    let url = '/dashboard/data-tunggakan'
    const params = []
    if (belumAdaKewajiban) {
      params.push(`belum_ada_kewajiban=true`)
    } else {
      if (showAll) {
        params.push(`show_all=true`)
      } else {
        if (tahunAjaran) params.push(`tahun_ajaran=${tahunAjaran}`)
        if (tahunAjaranMasehi) params.push(`tahun_ajaran_masehi=${tahunAjaranMasehi}`)
      }
    }
    if (params.length > 0) url += '?' + params.join('&')
    const response = await api.get(url)
    return response.data
  },

  getKelompokDetail: async (tipe, groupBy, groupValue) => {
    const response = await api.get(`/dashboard/kelompok-detail?tipe=${tipe}&group_by=${groupBy}&group_value=${encodeURIComponent(groupValue)}`)
    return response.data
  },

  updateKelompok: async (data) => {
    const response = await api.post('/dashboard/update-kelompok', data)
    return response.data
  }
}

// Chat user-to-user (percakapan, daftar user, riwayat pesan)
export const chatUserAPI = {
  /** users.id yang login (untuk daftar socket agar receive_message sampai). */
  getMe: () => api.get('/chat/me').then((r) => r.data),
  getConversations: () => api.get('/chat/conversations').then((r) => r.data),
  getUsers: () => api.get('/chat/users').then((r) => r.data),
  /** Riwayat pesan. conversationId ATAU peerId (untuk private get-or-create), limit default 20. */
  getMessages: (params = {}) => {
    const { conversation_id, peer_id, limit = 20 } = params
    const q = {}
    if (conversation_id != null) q.conversation_id = conversation_id
    if (peer_id != null) q.peer_id = peer_id
    q.limit = limit
    return api.get('/chat/messages', { params: q }).then((r) => r.data)
  },
}

/** Asisten eBeddien — login mode alternatif + proxy Node; chat utama lewat /deepseek/api-chat. */
export const deepseekAPI = {
  getAccount: () => api.get('/deepseek/account').then((r) => r.data),
  login: (password) => api.post('/deepseek/login', { password }).then((r) => r.data),
  proxySession: (token) => api.post('/deepseek/proxy/session', { token }).then((r) => r.data),
  proxyChat: (body) => api.post('/deepseek/proxy/chat', body).then((r) => r.data),
  directApiChat: (body) => api.post('/deepseek/api-chat', body).then((r) => r.data),
  /** Riwayat terakhir dari ai___chat; tanpa session_id = gabungan per user (mode utama). */
  getChatHistory: (params) => api.get('/deepseek/chat-history', { params }).then((r) => r.data),
  getTrainingSuggestions: () => api.get('/deepseek/training-suggestions').then((r) => r.data),
  getWhatsappAccess: () => api.get('/deepseek/whatsapp-access').then((r) => r.data),
  putWhatsappAccess: (enabled) => api.put('/deepseek/whatsapp-access', { enabled: !!enabled }).then((r) => r.data),
  /** Token sekali pakai + pesan wa.me (wajib login). */
  postWhatsappActivationToken: () => api.post('/deepseek/whatsapp-activation-token', {}).then((r) => r.data),
  /** Bangunkan koneksi WA Node (sama konsep dengan /pendaftaran/wa-wake) sebelum buka wa.me aktivasi AI. */
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
   */
  getChatByNomor: async (nomorTujuan, limit = 30, beforeDate = null) => {
    try {
      const num = chatAPI._normalizeNomor62(nomorTujuan)
      if (!num) {
        return { success: true, data: [] }
      }
      let url = `/chat/get-all?nomor_tujuan=${encodeURIComponent(num)}&limit=${Math.min(Math.max(Number(limit) || 30, 1), 500)}`
      if (beforeDate) {
        url += `&before_date=${encodeURIComponent(beforeDate)}`
      }
      const response = await api.get(url)
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
  syncFromWa: async (nomorTujuan, limit = 50) => {
    try {
      const num = chatAPI._normalizeNomor62(nomorTujuan)
      if (!num) {
        return { success: false, message: 'Nomor tidak valid', synced_count: 0 }
      }
      const response = await api.post('/chat/sync-from-wa', {
        nomor_tujuan: num,
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

  getUser: async (userId) => {
    const response = await api.get(`/user/${userId}`)
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

  /** Ambil foto profil sebagai blob (untuk createObjectURL di img) */
  getProfilFotoBlob: async () => {
    const response = await api.get('/v2/profil/foto', { responseType: 'blob' })
    return response.data
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
  getSuperAdminAndUwaba: async () => {
    const response = await api.get('/user/list-super-admin-uwaba')
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
    const response = await api.get(`/user-aktivitas?${q.toString()}`)
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

  /** Daftar santri untuk dropdown Set Akses Mybeddian. Params: search, limit. */
  getSantriOptionsForMybeddian: async (params = {}) => {
    const q = new URLSearchParams()
    if (params.search != null && params.search !== '') q.set('search', params.search)
    if (params.limit != null) q.set('limit', params.limit)
    const response = await api.get(`/v2/manage-users/santri-options${q.toString() ? '?' + q.toString() : ''}`)
    return response.data
  },

  /** Set atau hapus akses Mybeddian (santri) untuk user. userId = users.id. santriId = number atau null untuk unlink. */
  setMybeddianAccess: async (userId, santriId) => {
    const response = await api.put(`/v2/manage-users/${userId}/mybeddian-access`, { santri_id: santriId })
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

  create: async (data) => {
    const response = await api.post('/manage-users', data)
    return response.data
  },

  update: async (id, data) => {
    const response = await api.put(`/manage-users/${id}`, data)
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

  /** Update status jabatan pengurus (aktif / nonaktif). Optional: tanggal_mulai, tanggal_selesai untuk edit. */
  updateJabatanStatus: async (userId, pengurusJabatanId, data) => {
    const body = typeof data === 'string' ? { status: data } : { status: data.status, tanggal_mulai: data.tanggal_mulai, tanggal_selesai: data.tanggal_selesai }
    const response = await api.put(`/manage-users/${userId}/jabatan/${pengurusJabatanId}`, body)
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
  getFeaturesConfig: async () => {
    const response = await api.get('/settings/features-config')
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
  }
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
  getAll: async (kategori = null, status = null, tanggalDari = null, tanggalSampai = null, page = 1, limit = 20) => {
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

  getRencanaList: async (status = null, kategori = null, lembaga = null, tanggalDari = null, tanggalSampai = null, page = 1, limit = 20) => {
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
    const response = await api.get(url)
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

  approveRencana: async (id) => {
    const response = await api.post(`/pengeluaran/rencana/${id}/approve`)
    return response.data
  },

  rejectRencana: async (id) => {
    const response = await api.post(`/pengeluaran/rencana/${id}/reject`)
    return response.data
  },

  // Pengeluaran (sudah di-approve)
  getPengeluaranList: async (kategori = null, lembaga = null, tanggalDari = null, tanggalSampai = null, page = 1, limit = 20) => {
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
    const response = await api.get(url)
    return response.data
  },

  getPengeluaranDetail: async (id) => {
    const response = await api.get(`/pengeluaran/${id}`)
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
    const response = await api.post(`/v2/pengeluaran/rencana/${idRencana}/file`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    })
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

// Cashless (data toko) - admin_cashless & super_admin only; base path /v2/cashless
export const cashlessAPI = {
  getTokoList: async (params = {}) => {
    const response = await api.get('/v2/cashless/toko', { params })
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
    } catch (_) {}
    return null
  },

  uploadFoto: async (file, pedagangId = null) => {
    const formData = new FormData()
    formData.append('foto', file)
    if (pedagangId != null) formData.append('pedagang_id', String(pedagangId))
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

  /** Top-up dana ke wallet santri (orang tua bayar cash ke kantor, petugas input manual). Body: { santri_id, nominal, referensi?, metode? }. */
  topUp: async (data) => {
    const response = await api.post('/v2/cashless/topup', data)
    return response.data
  }
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
    const url = q.toString() ? `/absen-pengurus/rekap?${q.toString()}` : '/absen-pengurus/rekap'
    const response = await api.get(url)
    return response.data
  }
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

// Rombel (lembaga___rombel) — super_admin only
export const rombelAPI = {
  getAll: async (params = {}) => {
    const q = new URLSearchParams()
    if (params.lembaga_id) q.set('lembaga_id', params.lembaga_id)
    if (params.lembaga_nama != null && params.lembaga_nama !== '') q.set('lembaga_nama', params.lembaga_nama)
    if (params.status) q.set('status', params.status)
    if (params.kelas != null && params.kelas !== '') q.set('kelas', params.kelas)
    if (params.search != null && params.search !== '') q.set('search', params.search)
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
    const response = await api.get(`/umroh/tabungan?id_jamaah=${jamaahId}`)
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

// Payment Transaction API (iPayMu)
export const paymentTransactionAPI = {
  createTransaction: async (data) => {
    const response = await api.post('/payment-transaction/create', data)
    return response.data
  },

  checkStatus: async (sessionId) => {
    const response = await api.get(`/payment-transaction/status/${sessionId}`)
    return response.data
  }
}

export default api

