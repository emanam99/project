import axios from 'axios'
import { sanitizePersonName, sanitizeUserText } from '../utils/textSanitize'
import { sanitizeUgtLaporanPayload } from '../utils/ugtLaporanSanitize'

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

function isLocalDevHost(hostname) {
  const is172Private = /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname)
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname.startsWith('192.168.') ||
    hostname.startsWith('10.') ||
    is172Private
  )
}

/** true bila VITE_API_BASE_URL mengarah ke API di mesin yang sama (localhost / IP LAN). */
function envApiUrlIsLocal(envUrl) {
  try {
    const h = new URL(envUrl.trim()).hostname
    return isLocalDevHost(h)
  } catch {
    return false
  }
}

function envApiUrlPointsToLocalMachine(url) {
  try {
    const h = new URL(url.trim()).hostname
    return h === 'localhost' || h === '127.0.0.1'
  } catch {
    return false
  }
}

/** Derive production/staging API URL from current hostname (api.{rootDomain}/api). */
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

/**
 * Sama konsep eBeddien getSlimApiUrl.
 * Dev lokal/LAN: pakai proxy Vite → Apache lokal agar cek WA memakai WA Node yang sama (api/.env).
 * Jangan pakai VITE_API_BASE_URL production saat npm run dev — PHP di server jauh tidak bisa ke wa/ lokal.
 */
export const getApiBaseUrl = () => {
  const hostname = typeof window !== 'undefined' ? window.location.hostname : 'localhost'
  const protocol = typeof window !== 'undefined' ? window.location.protocol : 'http:'

  if (import.meta.env.DEV && isLocalDevHost(hostname)) {
    return '/api/public/api'
  }

  if (typeof window !== 'undefined' && isLocalDevHost(hostname) && hostname !== 'localhost' && hostname !== '127.0.0.1') {
    return `${protocol}//${hostname}/api/public/api`
  }

  const envUrl = import.meta.env.VITE_API_BASE_URL
  if (envUrl && typeof envUrl === 'string' && envUrl.trim() !== '') {
    const url = envUrl.trim().replace(/\/$/, '')
    const onRemoteHost = typeof window !== 'undefined' && !isLocalDevHost(window.location.hostname)
    if (!onRemoteHost || !envApiUrlPointsToLocalMachine(url)) {
      if (!import.meta.env.DEV || envApiUrlIsLocal(url)) {
        return url
      }
    } else if (typeof console !== 'undefined') {
      console.warn(
        '[myBeddien] VITE_API_BASE_URL mengarah ke localhost di host production — pakai API remote:',
        deriveRemoteApiBaseUrl(window.location.hostname, protocol)
      )
    }
  } else if (envUrl && typeof envUrl === 'string' && envUrl.trim() !== '' && import.meta.env.DEV && !envApiUrlIsLocal(envUrl)) {
    if (typeof console !== 'undefined') {
      console.warn(
        '[myBeddien] VITE_API_BASE_URL mengarah ke server jauh saat dev — diabaikan, pakai API lokal agar cek WA ikut wa/ di mesin ini.'
      )
    }
  }

  if (typeof window !== 'undefined' && !isLocalDevHost(window.location.hostname)) {
    return deriveRemoteApiBaseUrl(window.location.hostname, protocol)
  }

  if (isLocalDevHost(hostname)) {
    const localBase =
      hostname === 'localhost' || hostname === '127.0.0.1' ? 'http://localhost' : `${protocol}//${hostname}`
    return `${localBase}/api/public/api`
  }

  const parts = hostname.split('.')
  const rootDomain = parts.length > 2 ? parts.slice(-2).join('.') : hostname
  return !rootDomain || rootDomain.includes('localhost')
    ? 'http://localhost/api/public/api'
    : `${protocol}//api.${rootDomain}/api`
}

/**
 * Base URL server WA Node (sama eBeddien) — fallback dev bila PHP belum terjangkau Node.
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
  if (hl === 'alutsmani.my.id' || hl.endsWith('.alutsmani.my.id')) {
    return 'https://wa2.alutsmani.id'
  }
  if (hl === 'alutsmani.id' || hl.endsWith('.alutsmani.id')) {
    const sub = hl.replace(/\.alutsmani\.id$/, '')
    return (sub !== hl && sub.endsWith('2')) ? 'https://wa2.alutsmani.id' : 'https://wa.alutsmani.id'
  }
  return `${protocol}//${hostname}:${waPort}`
}

const apiBaseUrl = getApiBaseUrl()
const AUTH_TOKEN_MAX_AGE_MS = 5 * 60 * 60 * 1000

function clearAuthAndRedirectToLogin() {
  localStorage.removeItem('auth_token')
  localStorage.removeItem('user_data')
  clearPublicPaymentTokenCache()
  window.location.href = '/login'
}

const api = axios.create({
  baseURL: apiBaseUrl,
  headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
  withCredentials: true,
})

/**
 * Path mybeddian relatif ke baseURL axios (…/api/public/api).
 * Jangan gabung getMybeddianBaseUrl() + '/api/mybeddian/…' — axios akan menggandakan path.
 */
export function mybeddianPath(suffix) {
  const s = String(suffix || '').trim()
  const tail = s.startsWith('/') ? s : `/${s}`
  return `/mybeddian${tail}`
}

/** Agar respons 400/404 daftar tetap berisi JSON { success, message } (bukan throw axios). */
const daftarPostOpts = { validateStatus: (status) => status < 500 }

/** Seperti eBeddien: endpoint publik tertentu tanpa Bearer (cek WA, WebAuthn pra-login). */
function requestShouldAttachBearer(config) {
  const u = String(config.url || '')
  if (u.includes('/wa/check')) return false
  if (
    u.includes('/v2/auth/webauthn/status') ||
    u.includes('/v2/auth/webauthn/login/options') ||
    u.includes('/v2/auth/webauthn/login/verify')
  ) {
    return false
  }
  return true
}

api.interceptors.request.use(
  (config) => {
    if (typeof window !== 'undefined' && window.location?.origin) {
      config.headers['X-Frontend-Base-URL'] = window.location.origin
    }
    const token = localStorage.getItem('auth_token')
    if (token && requestShouldAttachBearer(config)) {
      const lastUsedRaw = localStorage.getItem('auth_last_used_at')
      let lastUsed = lastUsedRaw ? parseInt(lastUsedRaw, 10) : null
      if (lastUsed == null || Number.isNaN(lastUsed)) {
        localStorage.setItem('auth_last_used_at', String(Date.now()))
      } else if (Date.now() - lastUsed > AUTH_TOKEN_MAX_AGE_MS) {
        clearAuthAndRedirectToLogin()
        return Promise.reject(new Error('Token login kadaluarsa (5 jam). Silakan login lagi.'))
      }
      localStorage.setItem('auth_last_used_at', String(Date.now()))
      config.headers.Authorization = `Bearer ${token}`
    }
    config.headers['X-Client-App'] = 'mybeddien'
    const appEnv = getAppEnv()
    if (appEnv === 'staging') {
      config.headers['X-Frontend-Env'] = 'staging'
    }
    // FormData: jangan pakai Content-Type agar browser set multipart/form-data + boundary
    if (config.data && typeof FormData !== 'undefined' && config.data instanceof FormData) {
      delete config.headers['Content-Type']
    }
    return config
  },
  (err) => Promise.reject(err)
)

api.interceptors.response.use(
  (res) => res,
  (error) => {
    const originalRequest = error.config
    if (originalRequest?.url?.includes('/v2/auth') || originalRequest?.url?.includes('/wa/check')) {
      return Promise.reject(error)
    }
    if (error.response?.status === 401) {
      const url = String(originalRequest?.url || '')
      // 401 pada /api/public/pembayaran/…: jangan anggap JWT login habis (bisa pesan bisnis / token opsional).
      // Tetap reject agar UI bisa menampilkan error; backend default mengizinkan akses tanpa signed token.
      if (url.includes('/public/pembayaran')) {
        return Promise.reject(error)
      }
      const msg = error.response?.data?.message || ''
      const isTokenError = msg.includes('Token tidak valid') || msg.includes('kadaluarsa') || msg.includes('login kembali')
      if (isTokenError || originalRequest._retry) {
        clearAuthAndRedirectToLogin()
        return Promise.reject(new Error('Session expired'))
      }
    }
    return Promise.reject(error)
  }
)

export const authAPI = {
  getDeviceInfo: () => {
    if (typeof window === 'undefined') return {}
    const deviceId = localStorage.getItem('mybeddian_device_id')
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

  /** Login via endpoint mybeddian agar role santri dapat token & santri_id (hindari 401 dari main API) */
  loginMybeddian: async (username, password, deviceFingerprint = null, deviceInfo = null, santriId = null) => {
    const body = { username, password }
    if (santriId != null && santriId !== '') {
      const n = Number(santriId)
      if (!Number.isNaN(n) && n > 0) body.santri_id = n
    }
    if (deviceFingerprint) body.device_fingerprint = deviceFingerprint
    const info = deviceInfo ?? authAPI.getDeviceInfo()
    if (info.device_id) body.device_id = info.device_id
    if (info.platform) body.platform = info.platform
    if (info.timezone) body.timezone = info.timezone
    if (info.language) body.language = info.language
    if (info.screen) body.screen = info.screen
    const response = await api.post(mybeddianPath('/v2/auth/login'), body)
    return response.data
  },

  /** Verify token via endpoint mybeddian (untuk santri, tidak pakai data pengurus) */
  verifyMybeddian: async () => {
    const response = await api.get(mybeddianPath('/v2/auth/verify'))
    return response.data
  },

  /** Ganti identitas santri aktif di JWT (akun dengan beberapa data santri). */
  switchMybeddianSantri: async (santriId) => {
    const response = await api.post(mybeddianPath('/v2/auth/switch-santri'), {
      santri_id: Number(santriId),
    })
    return response.data
  },

  verify: async () => {
    const response = await api.get('/auth/verify')
    return response.data
  },

  logoutV2: async () => {
    try { await api.post('/v2/auth/logout') } catch (_) {}
  },

  logout: () => {
    const token = localStorage.getItem('auth_token')
    if (token) {
      api.post(mybeddianPath('/v2/auth/logout'), {}, { headers: { Authorization: `Bearer ${token}` } }).catch(() => {})
    }
    localStorage.removeItem('auth_token')
    localStorage.removeItem('user_data')
    localStorage.removeItem('auth_last_used_at')
  },

  /** Daftar santri: cek NIS, NIK, no_wa. Return already_registered atau nama + no_wa */
  daftarCheckSantri: async (nis, nik, noWa) => {
    const response = await api.post(
      mybeddianPath('/v2/auth/daftar-check'),
      { nis: String(nis).trim(), nik: String(nik).trim(), no_wa: String(noWa).trim() },
      daftarPostOpts
    )
    return response.data
  },

  /** Konfirmasi daftar santri: buat token; app mengarahkan ke /setup-akun */
  daftarKonfirmasiSantri: async (nis, nik, noWa) => {
    const response = await api.post(
      mybeddianPath('/v2/auth/daftar-konfirmasi'),
      { nis: String(nis).trim(), nik: String(nik).trim(), no_wa: String(noWa).trim() },
      daftarPostOpts
    )
    return response.data
  },

  /** Profil: siapkan WA tambah akses (santri/pjgt/toko) — butuh auth */
  tambahAksesPrepare: async (body) => {
    const response = await api.post(mybeddianPath('/v2/auth/tambah-akses-prepare'), body)
    return response.data
  },

  /** Profil: cek cepat status NIS (sudah di akun / tertaut akun lain) */
  tambahAksesCheckNis: async (nis) => {
    const response = await api.post(mybeddianPath('/v2/auth/tambah-akses-check-nis'), {
      nis: String(nis || '').trim(),
    })
    return response.data
  },

  /** Profil: ajukan akses saudara (NIS tertaut akun lain) — NIK + file KK */
  tambahAksesSaudaraPengajuan: async ({ nis, nik, file }) => {
    const form = new FormData()
    form.append('nis', String(nis || '').trim())
    form.append('nik', String(nik || '').trim())
    form.append('file', file)
    const response = await api.post(mybeddianPath('/v2/auth/tambah-akses-saudara-pengajuan'), form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 120000,
    })
    return response.data
  },

  /** Tukar token link WA tambah akses → sesi login + preferred_access */
  tambahAksesConsume: async (token) => {
    const response = await api.post(
      mybeddianPath('/v2/auth/tambah-akses-consume'),
      { token: String(token || '').trim().toLowerCase() },
      daftarPostOpts
    )
    return response.data
  },

  /** Lookup madrasah by identitas (scan QR daftar PJGT) */
  daftarLookupMadrasahPjgt: async (identitas) => {
    const response = await api.get(mybeddianPath('/v2/auth/daftar-pjgt-lookup-madrasah'), {
      params: { identitas: String(identitas).trim() },
      validateStatus: (status) => status < 500,
    })
    return response.data
  },

  /** Daftar PJGT: identitas, nama madrasah, no_wa (= no_pjgt) */
  daftarCheckMadrasahPjgt: async (identitas, nama, noWa) => {
    const namaClean = sanitizePersonName(nama)
    if (!namaClean) {
      return { success: false, message: 'Nama madrasah tidak valid. Ketik ulang tanpa salin dari font khusus.' }
    }
    const response = await api.post(
      mybeddianPath('/v2/auth/daftar-check-pjgt'),
      {
        identitas: sanitizeUserText(identitas),
        nama: namaClean,
        no_wa: String(noWa).trim(),
      },
      daftarPostOpts
    )
    return response.data
  },

  daftarKonfirmasiMadrasahPjgt: async (identitas, nama, noWa) => {
    const namaClean = sanitizePersonName(nama)
    if (!namaClean) {
      return { success: false, message: 'Nama madrasah tidak valid. Ketik ulang tanpa salin dari font khusus.' }
    }
    const response = await api.post(
      mybeddianPath('/v2/auth/daftar-konfirmasi-pjgt'),
      {
        identitas: sanitizeUserText(identitas),
        nama: namaClean,
        no_wa: String(noWa).trim(),
      },
      daftarPostOpts
    )
    return response.data
  },

  /** PJGT: hubungkan madrasah ke akun existing (nomor WA sudah di users) setelah verifikasi identitas */
  daftarPjgtHubungAkun: async (payload) => {
    const response = await api.post(mybeddianPath('/v2/auth/daftar-pjgt-hubung-akun'), {
      identitas: sanitizeUserText(payload.identitas),
      nama: sanitizePersonName(payload.nama) || '',
      no_wa: String(payload.no_wa || '').trim(),
      username: String(payload.username || '').trim(),
      nama_profil: sanitizePersonName(payload.nama_profil) || '',
      nama_pjgt: payload.nama_pjgt ? sanitizePersonName(payload.nama_pjgt) || '' : '',
      password: typeof payload.password === 'string' ? payload.password : '',
    }, daftarPostOpts)
    return response.data
  },

  /** Santri: hubungkan data santri ke akun existing (nomor WA sudah di users) setelah verifikasi */
  daftarSantriHubungAkun: async (payload) => {
    const response = await api.post(mybeddianPath('/v2/auth/daftar-santri-hubung-akun'), {
      nis: String(payload.nis || '').trim(),
      nik: String(payload.nik || '').trim(),
      no_wa: String(payload.no_wa || '').trim(),
      username: String(payload.username || '').trim(),
      nama_profil: sanitizePersonName(payload.nama_profil) || '',
      password: typeof payload.password === 'string' ? payload.password : '',
    }, daftarPostOpts)
    return response.data
  },

  /** Daftar toko: kode_toko, nama_toko, no_wa */
  daftarCheckToko: async (kodeToko, namaToko, noWa) => {
    const namaClean = sanitizePersonName(namaToko)
    if (!namaClean) {
      return { success: false, message: 'Nama toko tidak valid. Ketik ulang tanpa salin dari font khusus.' }
    }
    const response = await api.post(
      mybeddianPath('/v2/auth/daftar-check-toko'),
      {
        kode_toko: sanitizeUserText(kodeToko),
        nama_toko: namaClean,
        no_wa: String(noWa).trim(),
      },
      daftarPostOpts
    )
    return response.data
  },

  daftarKonfirmasiToko: async (kodeToko, namaToko, noWa) => {
    const namaClean = sanitizePersonName(namaToko)
    if (!namaClean) {
      return { success: false, message: 'Nama toko tidak valid. Ketik ulang tanpa salin dari font khusus.' }
    }
    const response = await api.post(
      mybeddianPath('/v2/auth/daftar-konfirmasi-toko'),
      {
        kode_toko: sanitizeUserText(kodeToko),
        nama_toko: namaClean,
        no_wa: String(noWa).trim(),
      },
      daftarPostOpts
    )
    return response.data
  },

  /** Toko: hubungkan ke akun existing (nomor WA sudah di users) */
  daftarTokoHubungAkun: async (payload) => {
    const response = await api.post(
      mybeddianPath('/v2/auth/daftar-toko-hubung-akun'),
      {
        kode_toko: sanitizeUserText(payload.kode_toko),
        nama_toko: sanitizePersonName(payload.nama_toko) || '',
        no_wa: String(payload.no_wa || '').trim(),
        username: String(payload.username || '').trim(),
        penanggung_jawab_nama: payload.penanggung_jawab_nama
          ? sanitizePersonName(payload.penanggung_jawab_nama) || ''
          : '',
        password: typeof payload.password === 'string' ? payload.password : '',
      },
      daftarPostOpts
    )
    return response.data
  },

  /** Cek identitas untuk lupa NIS (nama, NIK, tanggal lahir, WA). */
  nisPengajuanCheck: async (payload) => {
    const namaClean = sanitizePersonName(payload.nama)
    if (!namaClean) {
      return { success: false, message: 'Nama tidak valid. Ketik ulang tanpa salin dari font khusus atau PDF.' }
    }
    const response = await api.post(mybeddianPath('/v2/auth/nis-pengajuan/check'), {
      nama: namaClean,
      nik: String(payload.nik || '').trim(),
      tanggal_lahir: String(payload.tanggal_lahir || '').trim(),
      no_wa: String(payload.no_wa || '').trim(),
    }, daftarPostOpts)
    return response.data
  },

  /** Buat pengajuan NIS (belum upload KK). */
  nisPengajuanCreate: async (payload) => {
    const namaClean = sanitizePersonName(payload.nama)
    if (!namaClean) {
      return { success: false, message: 'Nama tidak valid. Ketik ulang tanpa salin dari font khusus atau PDF.' }
    }
    const response = await api.post(mybeddianPath('/v2/auth/nis-pengajuan'), {
      nama: namaClean,
      nik: String(payload.nik || '').trim(),
      tanggal_lahir: String(payload.tanggal_lahir || '').trim(),
      no_wa: String(payload.no_wa || '').trim(),
    }, daftarPostOpts)
    return response.data
  },

  /** Upload KK untuk pengajuan NIS → kembalikan wa_me_url (verifikasi token seperti lupa password). */
  nisPengajuanUploadKk: async (pengajuanId, file) => {
    const form = new FormData()
    form.append('file', file)
    const response = await api.post(
      mybeddianPath(`/v2/auth/nis-pengajuan/${pengajuanId}/upload-kk`),
      form,
      {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 120000,
      }
    )
    return response.data
  },

  /** Regenerasi tautan WA pengajuan NIS (status menunggu_wa). */
  nisPengajuanPrepareWa: async (pengajuanId) => {
    const response = await api.post(
      mybeddianPath(`/v2/auth/nis-pengajuan/${pengajuanId}/prepare-wa`),
      {},
      daftarPostOpts
    )
    return response.data
  },

  /** Lupa password (public): NIS, NIK, no_wa harus cocok dengan santri yang sudah punya akun. Kirim link /ubah-password ke WA. */
  lupaPasswordRequestSantri: async (nis, nik, noWa) => {
    const response = await api.post(
      mybeddianPath('/v2/auth/lupa-password-request'),
      { nis: String(nis).trim(), nik: String(nik).trim(), no_wa: String(noWa).trim() },
      {
        headers: { 'X-Frontend-Base-URL': typeof window !== 'undefined' ? window.location.origin : '' },
      }
    )
    return response.data
  },

  /** Lupa password PJGT (public): identitas + nama madrasah + no_wa cocok akun PJGT terdaftar. */
  lupaPasswordRequestPjgt: async (identitas, nama, noWa) => {
    const response = await api.post(
      mybeddianPath('/v2/auth/lupa-password-request-pjgt'),
      {
        identitas: String(identitas).trim(),
        nama: String(nama).trim(),
        no_wa: String(noWa).trim(),
      },
      {
        headers: { 'X-Frontend-Base-URL': typeof window !== 'undefined' ? window.location.origin : '' },
      }
    )
    return response.data
  },

  /** Lupa password toko (public): kode_toko + nama_toko + no_wa cocok akun toko terdaftar. */
  lupaPasswordRequestToko: async (kodeToko, namaToko, noWa) => {
    const response = await api.post(
      mybeddianPath('/v2/auth/lupa-password-request-toko'),
      {
        kode_toko: String(kodeToko).trim(),
        nama_toko: String(namaToko).trim(),
        no_wa: String(noWa).trim(),
      },
      {
        headers: { 'X-Frontend-Base-URL': typeof window !== 'undefined' ? window.location.origin : '' },
      }
    )
    return response.data
  },

  /** Lupa username (public): mode santri|pjgt|toko + data identitas seperti daftar → kirim username ke WA. */
  lupaUsernameRequest: async (payload) => {
    const body =
      payload && typeof payload === 'object' && !Array.isArray(payload)
        ? { ...payload }
        : { no_wa: String(payload || '').trim(), mode: 'santri' }
    const response = await api.post(mybeddianPath('/v2/auth/lupa-username-request'), body, {
      headers: { 'X-Frontend-Base-URL': typeof window !== 'undefined' ? window.location.origin : '' },
    })
    return response.data
  },

  /** Validasi token setup akun santri (query: token=...) */
  getSetupTokenSantri: async (token) => {
    const response = await api.get(mybeddianPath('/v2/auth/setup-token'), { params: { token } })
    return response.data
  },

  /** Buat akun santri: token, username, password */
  postSetupAkunSantri: async (token, username, password) => {
    const response = await api.post(mybeddianPath('/v2/auth/setup-akun'), { token, username, password })
    return response.data
  },

  /** Profil: nomor WA dimask (*******052) untuk konfirmasi ubah password. Endpoint v2 auth (santri didukung). */
  getNoWaMask: async () => {
    const response = await api.get('/v2/auth/no-wa-mask')
    return response.data
  },

  /** Profil: minta link ubah password; kirim ke WA. Header X-Frontend-Base-URL agar link ke app mybeddian. */
  requestUbahPassword: async (noWaKonfirmasi) => {
    const response = await api.post('/v2/auth/request-ubah-password', { no_wa_konfirmasi: noWaKonfirmasi }, {
      headers: { 'X-Frontend-Base-URL': typeof window !== 'undefined' ? window.location.origin : '' },
    })
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

  /** Profil: ubah username langsung. username_baru + password (verifikasi). */
  ubahUsernameLangsung: async (usernameBaru, password) => {
    const response = await api.post('/v2/auth/ubah-username-langsung', { username_baru: usernameBaru, password })
    return response.data
  },

  /** Halaman ubah username (public): validasi token */
  getUbahUsernameToken: async (token) => {
    const response = await api.get('/v2/auth/ubah-username-token', { params: { token } })
    return response.data
  },

  /** Halaman ubah username (public): set username baru + password saat ini */
  postUbahUsername: async (token, usernameBaru, password) => {
    const response = await api.post('/v2/auth/ubah-username', { token, username_baru: usernameBaru, password })
    return response.data
  },

  /** Cek apakah username punya passkey WebAuthn terdaftar */
  webauthnStatus: async (username) => {
    const response = await api.get('/v2/auth/webauthn/status', { params: { username } })
    return response.data
  },

  /** Opsi login WebAuthn — respons error 503 tetap bisa berupa JSON */
  webauthnLoginOptions: async (username, extras = {}) => {
    try {
      const response = await api.post('/v2/auth/webauthn/login/options', { username, ...extras })
      return response.data
    } catch (e) {
      if (e.response?.data) return e.response.data
      throw e
    }
  },

  /** Selesaikan login WebAuthn */
  webauthnLoginVerify: async (username, challengeId, credential, deviceInfo = null, extras = {}) => {
    const body = { username, challengeId, credential, ...extras }
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

  webauthnListCredentials: async () => {
    const response = await api.get('/v2/auth/webauthn/credentials')
    return response.data
  },

  webauthnDeleteCredential: async (credentialRowId) => {
    const response = await api.delete(`/v2/auth/webauthn/credentials/${encodeURIComponent(credentialRowId)}`)
    return response.data
  },

  /** Opsi verifikasi ulang passkey (JWT) — step-up */
  webauthnReauthOptions: async () => {
    try {
      const response = await api.post('/v2/auth/webauthn/reauth/options', {})
      return response.data
    } catch (e) {
      if (e.response?.data) return e.response.data
      throw e
    }
  },
}

/** POST /public/wa/check — cek nomor terdaftar di WhatsApp (publik, tanpa JWT). */
export const checkWhatsAppNumberViaAPI = (phoneNumber, sessionId = 'default', options = {}) => {
  const body = { phoneNumber: String(phoneNumber || '').trim() }
  const sid = sessionId != null ? String(sessionId).trim() : ''
  body.sessionId = sid !== '' ? sid : 'default'
  const timeoutMs =
    typeof options.timeout === 'number' && options.timeout > 0 ? options.timeout : 55000
  return api.post('/public/wa/check', body, { timeout: timeoutMs }).then((r) => r.data)
}

export const profilAPI = {
  /** GET profil (nama mengikuti ?akses=santri|toko|pjgt bila multi-akses) */
  getProfil: async (akses) => {
    const params = {}
    if (akses && typeof akses === 'string') params.akses = akses
    const response = await api.get(mybeddianPath('/v2/profil'), { params })
    return response.data
  },
  /** Ambil foto profil sebagai blob. Lewati request bila path kosong; 204/404 = belum ada foto (bukan error). */
  getProfilFotoBlob: async (fotoProfilPath) => {
    if (fotoProfilPath == null || fotoProfilPath === false) return null
    if (String(fotoProfilPath).trim() === '') return null
    const response = await api.get(mybeddianPath('/v2/profil/foto'), {
      responseType: 'blob',
      validateStatus: (status) =>
        status === 200 || status === 204 || status === 404 || status === 403,
    })
    if (
      response.status !== 200 ||
      !(response.data instanceof Blob) ||
      response.data.size === 0
    ) {
      return null
    }
    return response.data
  },
  /** Upload foto profil (FormData key 'foto'). Content-Type dihapus oleh interceptor agar multipart + boundary. */
  uploadProfilFoto: async (file) => {
    const formData = new FormData()
    formData.append('foto', file)
    const response = await api.post(mybeddianPath('/v2/profil/foto'), formData)
    return response.data
  },
  /** Hapus foto profil */
  deleteProfilFoto: async () => {
    const response = await api.delete(mybeddianPath('/v2/profil/foto'))
    return response.data
  },

  /** GET biodata santri lengkap (struktur sama dengan public santri Uwaba) */
  getBiodata: async () => {
    const response = await api.get(mybeddianPath('/v2/biodata'))
    return response.data
  },
  /** PATCH email santri (disimpan ke tabel santri) */
  updateBiodataEmail: async (email) => {
    const response = await api.patch(mybeddianPath('/v2/biodata/email'), { email })
    return response.data
  },
  /** PATCH email dan/atau no WA santri (sebelum bayar iPayMu) */
  updateBiodataContact: async ({ email, no_wa_santri, phone } = {}) => {
    const body = {}
    if (email !== undefined) body.email = email
    if (no_wa_santri !== undefined) body.no_wa_santri = no_wa_santri
    else if (phone !== undefined) body.no_wa_santri = phone
    const response = await api.patch(mybeddianPath('/v2/biodata/contact'), body)
    return response.data
  },
  /** GET riwayat ijin santri yang login */
  getRiwayatIjin: async () => {
    const response = await api.get(mybeddianPath('/v2/ijin'))
    return response.data
  },
  /** GET shohifah santri yang login (+ status jendela) */
  getShohifah: async (tahunAjaran) => {
    const params = tahunAjaran ? { tahun_ajaran: tahunAjaran } : {}
    const response = await api.get(mybeddianPath('/v2/shohifah'), { params })
    return response.data
  },
  /** POST simpan shohifah (hanya masa Sya'ban–Syawal) */
  saveShohifah: async (body) => {
    const response = await api.post(mybeddianPath('/v2/shohifah'), body)
    return response.data
  },
  /** GET riwayat pelanggaran santri yang login */
  getRiwayatPelanggaran: async () => {
    const response = await api.get(mybeddianPath('/v2/pelanggaran'))
    return response.data
  },
  /** GET riwayat rombel (diniyah/formal) santri yang login */
  getRiwayatRombel: async () => {
    const response = await api.get(mybeddianPath('/v2/riwayat-rombel'))
    return response.data
  },
  /** GET kamar aktif + riwayat kamar & status santri yang login */
  getRiwayatKamar: async () => {
    const response = await api.get(mybeddianPath('/v2/riwayat-kamar'))
    return response.data
  },
  /** GET riwayat penempatan LTTQ santri yang login */
  getRiwayatLttq: async () => {
    const response = await api.get(mybeddianPath('/v2/riwayat-lttq'))
    return response.data
  },
}

/** Biodata madrasah PJGT (mirror Data Madrasah eBeddien) + foto/logo lewat endpoint mybeddian */
export const madrasahPjgtAPI = {
  getProfil: async () => {
    const response = await api.get(mybeddianPath('/v2/madrasah-profil'))
    return response.data
  },
  /** Minta blob dari server; buat object URL — panggil URL.revokeObjectURL saat tidak dipakai */
  fetchAssetBlobUrl: async (path) => {
    if (!path || typeof path !== 'string') return null
    try {
      const u = mybeddianPath('/v2/madrasah-profil/foto') + '?path=' + encodeURIComponent(path)
      const response = await api.get(u, { responseType: 'blob' })
      const blob = response.data
      if (!(blob instanceof Blob) || blob.size === 0) return null
      return URL.createObjectURL(blob)
    } catch {
      return null
    }
  },
  getPengajuan: async () => {
    const response = await api.get(mybeddianPath('/v2/madrasah-profil/pengajuan'))
    return response.data
  },
  postPengajuan: async (payload) => {
    const response = await api.post(mybeddianPath('/v2/madrasah-profil/pengajuan'), payload)
    return response.data
  },
  uploadPengajuanMedia: async (file, kind = 'foto') => {
    const formData = new FormData()
    formData.append(kind === 'logo' ? 'logo' : 'foto', file)
    formData.append('kind', kind)
    const response = await api.post(
      mybeddianPath('/v2/madrasah-profil/pengajuan/upload') + '?kind=' + encodeURIComponent(kind),
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    )
    return response.data
  },
}

/** Data barang toko (hanya untuk user dengan akses toko). search = cari nama atau kode/QR/barcode. */
/** Riwayat penugasan Guru Tugas di madrasah PJGT (baca saja). */
export const guruTugasRiwayatPjgtAPI = {
  getRiwayat: async () => {
    const response = await api.get(mybeddianPath('/v2/guru-tugas-riwayat'))
    return response.data
  },
}

/** Laporan PJGT UGT — endpoint mybeddian; server membatasi ke madrasah_id di token. */
export const laporanPjgtMybeddianAPI = {
  getAll: async (params = {}) => {
    const q = new URLSearchParams()
    if (params.id_tahun_ajaran) q.set('id_tahun_ajaran', String(params.id_tahun_ajaran))
    if (params.bulan) q.set('bulan', String(params.bulan))
    const s = q.toString()
    const url = mybeddianPath('/v2/laporan-pjgt') + (s ? `?${s}` : '')
    const response = await api.get(url)
    return response.data
  },
  getById: async (id) => {
    const response = await api.get(mybeddianPath(`/v2/laporan-pjgt/${id}`))
    return response.data
  },
  create: async (data) => {
    const response = await api.post(
      mybeddianPath('/v2/laporan-pjgt'),
      sanitizeUgtLaporanPayload(data, 'pjgt')
    )
    return response.data
  },
  update: async (id, data) => {
    const response = await api.put(
      mybeddianPath(`/v2/laporan-pjgt/${id}`),
      sanitizeUgtLaporanPayload(data, 'pjgt')
    )
    return response.data
  },
  remove: async (id) => {
    const response = await api.delete(mybeddianPath(`/v2/laporan-pjgt/${id}`))
    return response.data
  },
  getSantriOptions: async (params = {}) => {
    const q = new URLSearchParams()
    if (params.search) q.set('search', String(params.search))
    if (params.limit) q.set('limit', String(params.limit))
    const s = q.toString()
    const url = mybeddianPath('/v2/laporan-pjgt/santri-options') + (s ? `?${s}` : '')
    const response = await api.get(url)
    return response.data
  },
  /** Tahun ajaran hijriyah (master, rentang dari–sampai terisi) — untuk filter & form laporan. */
  getTahunAjaranOptions: async () => {
    const response = await api.get(mybeddianPath('/v2/laporan-pjgt/tahun-ajaran-options'))
    return response.data
  },
  getKonteksSekarang: async (params = {}) => {
    const q = new URLSearchParams()
    if (params.tanggal) q.set('tanggal', String(params.tanggal))
    if (params.waktu) q.set('waktu', String(params.waktu))
    const s = q.toString()
    const url = mybeddianPath('/v2/laporan-pjgt/konteks-sekarang') + (s ? `?${s}` : '')
    const response = await api.get(url)
    return response.data
  },
}

/** KOMMPAS — PJGT / Guru Tugas */
export const kompasMybeddianAPI = {
  overview: async (tahunAjaran) => {
    const q = new URLSearchParams()
    if (tahunAjaran) q.set('tahun_ajaran', String(tahunAjaran).trim())
    const s = q.toString()
    const response = await api.get(mybeddianPath('/v2/kompas') + (s ? `?${s}` : ''))
    return response.data
  },
  getDaftar: async (id) => {
    const response = await api.get(mybeddianPath(`/v2/kompas/daftar/${id}`))
    return response.data
  },
  createDaftar: async (data) => {
    const response = await api.post(mybeddianPath('/v2/kompas/daftar'), data)
    return response.data
  },
  updateDaftar: async (id, data) => {
    const response = await api.put(mybeddianPath(`/v2/kompas/daftar/${id}`), data)
    return response.data
  },
  upload: async (file, jenis = 'foto') => {
    const form = new FormData()
    form.append('file', file)
    form.append('jenis', jenis)
    const response = await api.post(mybeddianPath('/v2/kompas/upload'), form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return response.data
  },
  checkNik: async ({ nik, tahunAjaran, excludeDaftarId } = {}) => {
    const params = new URLSearchParams()
    params.set('nik', String(nik || '').replace(/\D/g, ''))
    if (tahunAjaran) params.set('tahun_ajaran', String(tahunAjaran).trim())
    if (excludeDaftarId) params.set('exclude_daftar_id', String(excludeDaftarId))
    const response = await api.get(mybeddianPath(`/v2/kompas/check-nik?${params.toString()}`))
    return response.data
  },
  _berkasBlobCache: new Map(),
  _berkasBlobCacheMax: 40,
  fetchBerkasBlobUrl: async (path) => {
    if (!path || typeof path !== 'string') return null
    const key = path.startsWith('uploads/') ? path : `uploads/ugt/kompas/${path}`
    const cached = kompasMybeddianAPI._berkasBlobCache.get(key)
    if (cached) return cached
    try {
      const response = await api.get(mybeddianPath('/v2/kompas/serve-file'), {
        params: { path: key },
        responseType: 'blob',
      })
      if (response.data instanceof Blob) {
        const url = URL.createObjectURL(response.data)
        if (kompasMybeddianAPI._berkasBlobCache.size >= kompasMybeddianAPI._berkasBlobCacheMax) {
          const firstKey = kompasMybeddianAPI._berkasBlobCache.keys().next().value
          const oldUrl = kompasMybeddianAPI._berkasBlobCache.get(firstKey)
          if (oldUrl) URL.revokeObjectURL(oldUrl)
          kompasMybeddianAPI._berkasBlobCache.delete(firstKey)
        }
        kompasMybeddianAPI._berkasBlobCache.set(key, url)
        return url
      }
    } catch {
      // abaikan
    }
    return null
  },
}

/** Laporan GT — santri status guru tugas (scope id_santri + penugasan aktif). */
export const laporanGtMybeddianAPI = {
  getAll: async (params = {}) => {
    const q = new URLSearchParams()
    if (params.id_tahun_ajaran) q.set('id_tahun_ajaran', String(params.id_tahun_ajaran))
    if (params.bulan) q.set('bulan', String(params.bulan))
    const s = q.toString()
    const url = mybeddianPath('/v2/laporan-gt') + (s ? `?${s}` : '')
    const response = await api.get(url)
    return response.data
  },
  getById: async (id) => {
    const response = await api.get(mybeddianPath(`/v2/laporan-gt/${id}`))
    return response.data
  },
  create: async (data) => {
    const response = await api.post(
      mybeddianPath('/v2/laporan-gt'),
      sanitizeUgtLaporanPayload(data, 'gt')
    )
    return response.data
  },
  update: async (id, data) => {
    const response = await api.put(
      mybeddianPath(`/v2/laporan-gt/${id}`),
      sanitizeUgtLaporanPayload(data, 'gt')
    )
    return response.data
  },
  remove: async (id) => {
    const response = await api.delete(mybeddianPath(`/v2/laporan-gt/${id}`))
    return response.data
  },
  getKonteksSekarang: async (params = {}) => {
    const q = new URLSearchParams()
    if (params.tanggal) q.set('tanggal', String(params.tanggal))
    if (params.waktu) q.set('waktu', String(params.waktu))
    const s = q.toString()
    const url = mybeddianPath('/v2/laporan-gt/konteks-sekarang') + (s ? `?${s}` : '')
    const response = await api.get(url)
    return response.data
  },
}

export const barangAPI = {
  getList: async (params = {}) => {
    const response = await api.get(mybeddianPath('/v2/barang'), { params })
    return response.data
  },
  create: async (data) => {
    const response = await api.post(mybeddianPath('/v2/barang'), data)
    return response.data
  },
  update: async (id, data) => {
    const response = await api.put(mybeddianPath(`/v2/barang/${id}`), data)
    return response.data
  },
  delete: async (id) => {
    const response = await api.delete(mybeddianPath(`/v2/barang/${id}`))
    return response.data
  },
  getStokHistory: async (id, params = {}) => {
    const response = await api.get(mybeddianPath(`/v2/barang/${id}/stok`), { params })
    return response.data
  },
  addStok: async (id, data) => {
    const response = await api.post(mybeddianPath(`/v2/barang/${id}/stok`), data)
    return response.data
  },
  getByKode: async (kode) => {
    const response = await api.get(mybeddianPath('/v2/barang/by-kode'), { params: { kode } })
    return response.data
  },
}

export const penjualanAPI = {
  checkout: async (data) => {
    const response = await api.post(mybeddianPath('/v2/penjualan/checkout'), data)
    return response.data
  },
  getList: async (params = {}) => {
    const response = await api.get(mybeddianPath('/v2/penjualan'), { params })
    return response.data
  },
  getDetail: async (id) => {
    const response = await api.get(mybeddianPath(`/v2/penjualan/${id}`))
    return response.data
  },
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

export function clearPublicPaymentTokenCache() {
  publicPaymentTokenCache.clear()
}

/** Riwayat pembayaran: pendaftaran, uwaba (per tahun ajaran), khusus, tunggakan. id_santri dari auth (santri_id). */
export const pembayaranAPI = {
  /** Daftar tahun ajaran (untuk filter UWABA). Public. */
  getTahunAjaranList: async () => {
    const response = await api.get('/pendaftaran/get-tahun-ajaran-list')
    return response.data
  },

  /** Daftar tahun ajaran UWABA (format 1447-1448). Dengan id_santri: hanya tahun yang punya uwaba/pembayaran untuk santri itu. */
  getUwabaTahunList: async (idSantri = null) => {
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

  /** Registrasi PSB per santri (perlu auth santri). */
  getAllRegistrasiBySantri: async (idSantri) => {
    const response = await api.get('/pendaftaran/get-all-registrasi-by-santri', { params: { id_santri: idSantri } })
    return response.data
  },

  /** Item komponen per registrasi (psb___registrasi_detail). */
  getRegistrasiDetail: async (idRegistrasi) => {
    const response = await api.get('/pendaftaran/get-registrasi-detail', {
      params: { id_registrasi: idRegistrasi },
    })
    return response.data
  },

  /** Transaksi pembayaran pendaftaran (auth; scope santri di backend). */
  getTransaksiPendaftaran: async (idRegistrasi) => {
    const response = await api.get('/pendaftaran/get-transaksi', { params: { id_registrasi: idRegistrasi } })
    return response.data
  },

  /** Rincian pembayaran public. mode: uwaba | khusus | tunggakan. uwaba butuh tahun_ajaran. */
  getRincian: async (idSantri, mode, tahunAjaran = null) => {
    const params = { id_santri: idSantri }
    if (tahunAjaran) params.tahun_ajaran = tahunAjaran
    const cfg = await publicPaymentAxiosConfig(idSantri, mode)
    const response = await api.get(`/public/pembayaran/${mode}`, { params, ...cfg })
    return response.data
  },

  /** Riwayat pembayaran (list transaksi) public. mode: uwaba | khusus | tunggakan. uwaba butuh tahun_ajaran. */
  getHistory: async (idSantri, mode, tahunAjaran = null) => {
    const params = { id_santri: idSantri }
    if (tahunAjaran) params.tahun_ajaran = tahunAjaran
    const cfg = await publicPaymentAxiosConfig(idSantri, mode)
    const response = await api.get(`/public/pembayaran/${mode}/history`, { params, ...cfg })
    return response.data
  },
}

/** Pembayaran via iPayMu (Pendaftaran, UWABA, Khusus, Tunggakan, Cashless). */
export const paymentTransactionAPI = {
  getMode: async () => {
    const response = await api.get('/payment-transaction/mode')
    return response.data
  },
  createTransaction: async (data) => {
    const response = await api.post('/payment-transaction/create', data)
    return response.data
  },
  checkStatus: async (sessionId) => {
    const response = await api.get(`/payment-transaction/status/${sessionId}`)
    return response.data
  },
  getPendingTransaction: async (idRegistrasi, idSantri, idReferensi = null, tabelReferensi = null) => {
    const params = {}
    if (idRegistrasi != null) params.id_registrasi = idRegistrasi
    if (idSantri != null) params.id_santri = idSantri
    if (idReferensi != null && idReferensi !== '') params.id_referensi = idReferensi
    if (tabelReferensi != null && tabelReferensi !== '') params.tabel_referensi = tabelReferensi
    const response = await api.get('/payment-transaction/pending', { params })
    return response.data
  },
  cancelTransaction: async (transactionId) => {
    const response = await api.post(`/payment-transaction/${transactionId}/cancel`, {})
    return response.data
  },
  getAdminFee: async (paymentMethod = 'va', paymentChannel = '') => {
    const params = new URLSearchParams()
    if (paymentMethod) params.append('payment_method', paymentMethod)
    if (paymentChannel) params.append('payment_channel', paymentChannel)
    const response = await api.get(`/payment-transaction/admin-fee?${params.toString()}`)
    return response.data
  },
}

/** Cashless wallet santri / saldo toko (myBeddian). */
export const cashlessAPI = {
  getWallet: async (akses) => {
    const params = {}
    if (akses === 'toko' || akses === 'santri') params.akses = akses
    const response = await api.get(mybeddianPath('/v2/cashless/wallet'), { params })
    return response.data
  },
  getTransactions: async (limit = 50, akses) => {
    const params = { limit }
    if (akses === 'toko' || akses === 'santri') params.akses = akses
    const response = await api.get(mybeddianPath('/v2/cashless/transactions'), { params })
    return response.data
  },
  getTransactionDetail: async (journalId, akses) => {
    const params = {}
    if (akses === 'toko' || akses === 'santri') params.akses = akses
    const response = await api.get(mybeddianPath(`/v2/cashless/transactions/${journalId}`), {
      params,
    })
    return response.data
  },
  getLiveState: async (akses) => {
    const params = {}
    if (akses === 'toko' || akses === 'santri') params.akses = akses
    const response = await api.get(mybeddianPath('/v2/cashless/live-state'), { params })
    return response.data
  },
  getKartuPin: async () => {
    const response = await api.get(mybeddianPath('/v2/cashless/kartu-pin'))
    return response.data
  },
  /** Atur PIN pertama: { pin, pin_confirm, password } atau + webauthn_* */
  setKartuPin: async (body) => {
    try {
      const response = await api.post(mybeddianPath('/v2/cashless/kartu-pin'), body)
      return response.data
    } catch (e) {
      if (e.response?.data) return e.response.data
      throw e
    }
  },
  /** Ubah PIN: { old_pin, pin, pin_confirm, password } atau + webauthn_* */
  changeKartuPin: async (body) => {
    try {
      const response = await api.put(mybeddianPath('/v2/cashless/kartu-pin'), body)
      return response.data
    } catch (e) {
      if (e.response?.data) return e.response.data
      throw e
    }
  },
  lookupWallet: async (code, akses) => {
    try {
      const params = { code }
      if (akses === 'toko' || akses === 'santri') params.akses = akses
      const response = await api.get(mybeddianPath('/v2/cashless/wallet-lookup'), {
        params,
      })
      return response.data
    } catch (e) {
      if (e.response?.data) return e.response.data
      throw e
    }
  },
  transfer: async (body, akses) => {
    try {
      const payload = { ...body }
      if (akses === 'toko' || akses === 'santri') payload.akses = akses
      const response = await api.post(mybeddianPath('/v2/cashless/transfer'), payload)
      return response.data
    } catch (e) {
      if (e.response?.data) return e.response.data
      throw e
    }
  },
}

export default api
