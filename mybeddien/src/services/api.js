import axios from 'axios'

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

export const getApiBaseUrl = () => {
  const envUrl = import.meta.env.VITE_API_BASE_URL
  if (envUrl && typeof envUrl === 'string' && envUrl.trim() !== '') {
    const url = envUrl.trim()
    return url.endsWith('/') ? url.slice(0, -1) : url
  }
  const hostname = typeof window !== 'undefined' ? window.location.hostname : 'localhost'
  const protocol = typeof window !== 'undefined' ? window.location.protocol : 'http:'
  const isLocal = hostname === 'localhost' || hostname === '127.0.0.1' ||
    hostname.startsWith('192.168.') || hostname.startsWith('10.')
  if (isLocal) {
    const localBase = (hostname === 'localhost' || hostname === '127.0.0.1')
      ? 'http://localhost' : `${protocol}//${hostname}`
    return `${localBase}/api/public/api`
  }
  const parts = hostname.split('.')
  const rootDomain = parts.length > 2 ? parts.slice(-2).join('.') : hostname
  return (!rootDomain || rootDomain.includes('localhost'))
    ? 'http://localhost/api/public/api'
    : `${protocol}//api.${rootDomain}/api`
}

const apiBaseUrl = getApiBaseUrl()
const api = axios.create({
  baseURL: apiBaseUrl,
  headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
  withCredentials: true,
})

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('auth_token')
    if (token) config.headers.Authorization = `Bearer ${token}`
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
    if (originalRequest?.url?.includes('/v2/auth')) return Promise.reject(error)
    if (error.response?.status === 401) {
      const msg = error.response?.data?.message || ''
      const isTokenError = msg.includes('Token tidak valid') || msg.includes('kadaluarsa') || msg.includes('login kembali')
      if (isTokenError || originalRequest._retry) {
        localStorage.removeItem('auth_token')
        localStorage.removeItem('user_data')
        window.location.href = '/login'
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
  loginMybeddian: async (username, password, deviceFingerprint = null, deviceInfo = null) => {
    const base = authAPI.getMybeddianBaseUrl()
    const body = { username, password }
    if (deviceFingerprint) body.device_fingerprint = deviceFingerprint
    const info = deviceInfo ?? authAPI.getDeviceInfo()
    if (info.device_id) body.device_id = info.device_id
    if (info.platform) body.platform = info.platform
    if (info.timezone) body.timezone = info.timezone
    if (info.language) body.language = info.language
    if (info.screen) body.screen = info.screen
    const response = await api.post(base + '/api/mybeddian/v2/auth/login', body)
    return response.data
  },

  /** Verify token via endpoint mybeddian (untuk santri, tidak pakai data pengurus) */
  verifyMybeddian: async () => {
    const base = authAPI.getMybeddianBaseUrl()
    const response = await api.get(base + '/api/mybeddian/v2/auth/verify')
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
    const base = authAPI.getMybeddianBaseUrl()
    const token = localStorage.getItem('auth_token')
    if (token) {
      api.post(base + '/api/mybeddian/v2/auth/logout', {}, { headers: { Authorization: `Bearer ${token}` } }).catch(() => {})
    }
    localStorage.removeItem('auth_token')
    localStorage.removeItem('user_data')
  },

  /** Base URL untuk endpoint mybeddian (group /api/mybeddian) */
  getMybeddianBaseUrl: () => {
    const base = getApiBaseUrl()
    return base.endsWith('/api') ? base.slice(0, -4) : base
  },

  /** Daftar santri: cek NIS, NIK, no_wa. Return already_registered atau nama + no_wa */
  daftarCheckSantri: async (nis, nik, noWa) => {
    const base = authAPI.getMybeddianBaseUrl()
    const response = await api.post(base + '/api/mybeddian/v2/auth/daftar-check', { nis: String(nis).trim(), nik: String(nik).trim(), no_wa: String(noWa).trim() })
    return response.data
  },

  /** Konfirmasi daftar santri: kirim link setup akun ke WA */
  daftarKonfirmasiSantri: async (nis, nik, noWa) => {
    const base = authAPI.getMybeddianBaseUrl()
    const response = await api.post(base + '/api/mybeddian/v2/auth/daftar-konfirmasi', { nis: String(nis).trim(), nik: String(nik).trim(), no_wa: String(noWa).trim() })
    return response.data
  },

  /** Validasi token setup akun santri (query: token=...) */
  getSetupTokenSantri: async (token) => {
    const base = authAPI.getMybeddianBaseUrl()
    const response = await api.get(base + '/api/mybeddian/v2/auth/setup-token', { params: { token } })
    return response.data
  },

  /** Buat akun santri: token, username, password */
  postSetupAkunSantri: async (token, username, password) => {
    const base = authAPI.getMybeddianBaseUrl()
    const response = await api.post(base + '/api/mybeddian/v2/auth/setup-akun', { token, username, password })
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
}

/** Base URL untuk endpoint mybeddian (profil, dll) */
function getMybeddianBase() {
  const base = getApiBaseUrl()
  return base.endsWith('/api') ? base.slice(0, -4) : base
}

export const profilAPI = {
  /** GET profil santri (data untuk beranda & halaman profil) */
  getProfil: async () => {
    const response = await api.get(getMybeddianBase() + '/api/mybeddian/v2/profil')
    return response.data
  },
  /** Ambil foto profil santri sebagai blob. Mengembalikan null jika 404 (belum ada foto). */
  getProfilFotoBlob: async () => {
    try {
      const response = await api.get(getMybeddianBase() + '/api/mybeddian/v2/profil/foto', { responseType: 'blob' })
      return response.data
    } catch (err) {
      if (err.response?.status === 404) return null
      throw err
    }
  },
  /** Upload foto profil (FormData key 'foto'). Content-Type dihapus oleh interceptor agar multipart + boundary. */
  uploadProfilFoto: async (file) => {
    const formData = new FormData()
    formData.append('foto', file)
    const response = await api.post(getMybeddianBase() + '/api/mybeddian/v2/profil/foto', formData)
    return response.data
  },
  /** Hapus foto profil */
  deleteProfilFoto: async () => {
    const response = await api.delete(getMybeddianBase() + '/api/mybeddian/v2/profil/foto')
    return response.data
  },

  /** GET biodata santri lengkap (struktur sama dengan public santri Uwaba) */
  getBiodata: async () => {
    const response = await api.get(getMybeddianBase() + '/api/mybeddian/v2/biodata')
    return response.data
  },
}

/** Data barang toko (hanya untuk user dengan akses toko). search = cari nama atau kode/QR/barcode. */
export const barangAPI = {
  getList: async (params = {}) => {
    const response = await api.get(getMybeddianBase() + '/api/mybeddian/v2/barang', { params })
    return response.data
  },
  create: async (data) => {
    const response = await api.post(getMybeddianBase() + '/api/mybeddian/v2/barang', data)
    return response.data
  },
  update: async (id, data) => {
    const response = await api.put(getMybeddianBase() + '/api/mybeddian/v2/barang/' + id, data)
    return response.data
  },
  delete: async (id) => {
    const response = await api.delete(getMybeddianBase() + '/api/mybeddian/v2/barang/' + id)
    return response.data
  },
}

/** Riwayat pembayaran: pendaftaran, uwaba (per tahun ajaran), khusus, tunggakan. id_santri dari auth (santri_id). */
export const pembayaranAPI = {
  /** Daftar tahun ajaran (untuk filter UWABA). Public. */
  getTahunAjaranList: async () => {
    const response = await api.get('/pendaftaran/get-tahun-ajaran-list')
    return response.data
  },

  /** Daftar tahun ajaran UWABA dari tabel uwaba (format 1447-1448). Public. Fallback ke getTahunAjaranList jika kosong. */
  getUwabaTahunList: async () => {
    const response = await api.get('/public/pembayaran/uwaba/tahun-list')
    return response.data
  },

  /** Registrasi PSB per santri (perlu auth santri). */
  getAllRegistrasiBySantri: async (idSantri) => {
    const response = await api.get('/pendaftaran/get-all-registrasi-by-santri', { params: { id_santri: idSantri } })
    return response.data
  },

  /** Transaksi pembayaran pendaftaran (public). id_santri = santri_id. */
  getTransaksiPendaftaran: async (idSantri) => {
    const response = await api.get('/pendaftaran/get-transaksi-public', { params: { id_santri: idSantri } })
    return response.data
  },

  /** Rincian pembayaran public. mode: uwaba | khusus | tunggakan. uwaba butuh tahun_ajaran. */
  getRincian: async (idSantri, mode, tahunAjaran = null) => {
    const params = { id_santri: idSantri }
    if (tahunAjaran) params.tahun_ajaran = tahunAjaran
    const response = await api.get(`/public/pembayaran/${mode}`, { params })
    return response.data
  },

  /** Riwayat pembayaran (list transaksi) public. mode: uwaba | khusus | tunggakan. uwaba butuh tahun_ajaran. */
  getHistory: async (idSantri, mode, tahunAjaran = null) => {
    const params = { id_santri: idSantri }
    if (tahunAjaran) params.tahun_ajaran = tahunAjaran
    const response = await api.get(`/public/pembayaran/${mode}/history`, { params })
    return response.data
  },
}

/** Pembayaran via iPayMu (untuk Pendaftaran, UWABA, Khusus, Tunggakan). */
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

export default api
