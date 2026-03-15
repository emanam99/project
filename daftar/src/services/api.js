import axios from 'axios'

// --- Environment label (development | staging | production) ---
// Dari VITE_APP_ENV di .env; sama dengan aplikasi uwaba
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

// Helper untuk mendapatkan base URL API — selalu dari .env (local / staging / production)
// Tanpa VITE_API_BASE_URL: fallback dari hostname + peringatan agar set .env
export const getSlimApiUrl = () => {
  const envUrl = import.meta.env.VITE_API_BASE_URL
  if (envUrl && typeof envUrl === 'string' && envUrl.trim() !== '') {
    const url = envUrl.trim()
    return url.endsWith('/') ? url.slice(0, -1) : url
  }

  // Fallback jika .env belum di-set (disarankan set VITE_API_BASE_URL untuk semua environment)
  const hostname = typeof window !== 'undefined' ? window.location.hostname : 'localhost'
  const protocol = typeof window !== 'undefined' ? window.location.protocol : 'http:'
  const isLocal = hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '10.111.215.123' ||
    hostname === '192.168.0.103' ||
    hostname.startsWith('192.168.') ||
    hostname.startsWith('10.') ||
    hostname.startsWith('172.16.')

  // Fallback local: gunakan routes API terbaru (api/public = entry point Slim, /api = prefix route)
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
    '[Daftar] VITE_API_BASE_URL tidak di-set di .env — menggunakan fallback:',
    fallback,
    '| Set VITE_API_BASE_URL di .env untuk local, staging, dan production.'
  )
  return fallback
}

// CSRF token cache
let csrfTokenCache = null
let csrfTokenPromise = null

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

export function resetCsrfToken() {
  csrfTokenCache = null
  csrfTokenPromise = null
}

const apiBaseUrl = getSlimApiUrl()
if (typeof console !== 'undefined' && console.log) {
  console.log('[Daftar] API Base URL:', apiBaseUrl, '| Env:', getAppEnv())
}

const api = axios.create({
  baseURL: apiBaseUrl,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  },
  withCredentials: true
})

export const getApiBaseUrl = () => apiBaseUrl

/**
 * Cek nomor WhatsApp lewat backend API (satu jalur: ikut setting notifikasi WatZap/WA server).
 * Response: { success, data: { phoneNumber, isRegistered }, message }
 */
export const checkWhatsAppNumberViaAPI = (phoneNumber) =>
  api.post('/wa/check', { phoneNumber: String(phoneNumber || '').trim() }).then((r) => r.data)

// Request interceptor
api.interceptors.request.use(
  async (config) => {
    const token = localStorage.getItem('auth_token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }

    if (!config.url?.includes('/auth/login')) {
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

// Response interceptor
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config

    if (originalRequest?.url?.includes('/auth/login')) {
      return Promise.reject(error)
    }

    if (error.response?.status === 401) {
      const errorMessage = error.response?.data?.message || ''
      const isTokenError = errorMessage.includes('Token tidak valid') || 
                          errorMessage.includes('Token tidak ditemukan') ||
                          errorMessage.includes('kadaluarsa') ||
                          errorMessage.includes('login kembali')
      
      if (isTokenError || originalRequest._retry) {
        localStorage.removeItem('auth_token')
        resetCsrfToken()
        window.location.href = '/login'
        return Promise.reject(new Error('Token tidak valid atau sudah kadaluarsa. Redirecting to login...'))
      }
      
      originalRequest._retry = true
      resetCsrfToken()
      const csrfToken = await getCsrfToken()
      if (csrfToken) {
        originalRequest.headers['X-CSRF-Token'] = csrfToken
        return api(originalRequest)
      }
      
      localStorage.removeItem('auth_token')
      resetCsrfToken()
      window.location.href = '/login'
      return Promise.reject(new Error('Token tidak valid atau sudah kadaluarsa. Redirecting to login...'))
    }

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
  login: async (nik) => {
    const response = await api.post('/auth/login-nik', { nik })
    return response.data
  },
  
  verify: async () => {
    const response = await api.get('/auth/verify')
    return response.data
  },
  
  logout: () => {
    resetCsrfToken()
    localStorage.removeItem('auth_token')
  }
}

// Santri API
export const santriAPI = {
  getAll: async () => {
    const response = await api.get('/santri')
    return response.data
  },

  /** GET /api/santri?id=... — butuh role admin_psb/petugas_psb/super_admin */
  getById: async (id) => {
    const response = await api.get(`/santri?id=${id}`)
    return response.data
  },

  /**
   * GET /api/public/santri?id=... — untuk aplikasi daftar (role santri).
   * Endpoint public bisa diakses dengan auth token tanpa perlu role admin.
   * Dipakai saat butuh biodata (no_telpon, email) untuk iPayMu dll.
   */
  getByIdPublic: async (id) => {
    const response = await api.get(`/public/santri?id=${encodeURIComponent(id)}`)
    return response.data
  },
  
  update: async (id, data) => {
    const response = await api.post('/santri', { id, ...data })
    return response.data
  }
}

// Pendaftaran API
export const pendaftaranAPI = {
  searchByNik: async (nik) => {
    // Gunakan endpoint publik check-nik untuk halaman login
    try {
      const response = await axios.get(`${getSlimApiUrl()}/pendaftaran/check-nik?nik=${nik}`, {
        withCredentials: true,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      })
      return response.data
    } catch (error) {
      console.error('Error checking NIK:', error)
      // Jika error, anggap NIK belum ada
      return {
        success: false,
        data: {
          exists: false
        }
      }
    }
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
    // Tambahkan timestamp untuk menghindari cache browser
    params.append('_t', Date.now())
    const response = await api.get(`/pendaftaran/get-registrasi?${params.toString()}`)
    return response.data
  },

  getRegistrasiDetail: async (idRegistrasi) => {
    const response = await api.get(`/pendaftaran/get-registrasi-detail?id_registrasi=${idRegistrasi}&_t=${Date.now()}`)
    return response.data
  },

  /** GET transaksi pembayaran. Wajib auth; role santri hanya akses transaksi registrasi sendiri. id_registrasi dari getRegistrasi. */
  getTransaksi: async (idSantri, idRegistrasi = null) => {
    try {
      if (!idRegistrasi) {
        return { success: true, data: [] }
      }
      const params = new URLSearchParams()
      params.append('id_registrasi', idRegistrasi)
      params.append('_t', Date.now())
      const response = await api.get(`/pendaftaran/get-transaksi?${params.toString()}`)
      return response.data
    } catch (error) {
      console.error('Error fetching transaksi:', error)
      if (error.response?.status === 401 || error.response?.status === 403) {
        console.warn('Transaksi memerlukan login atau akses ditolak')
      }
      return {
        success: false,
        data: [],
        message: error.response?.data?.message || 'Gagal mengambil transaksi'
      }
    }
  },

  autoAssignItems: async (idRegistrasi, idAdmin = null) => {
    const data = { id_registrasi: idRegistrasi }
    if (idAdmin) {
      data.id_admin = idAdmin
    }
    const response = await api.post('/pendaftaran/auto-assign-items', data)
    return response.data
  },
  
  saveBiodata: async (data) => {
    const response = await api.post('/pendaftaran/save-biodata', data)
    return response.data
  },

  /** GET biodata santri (untuk role santri = data sendiri dari token; admin boleh id_santri) */
  getBiodata: async (idSantri = null) => {
    const params = new URLSearchParams()
    if (idSantri) params.append('id_santri', idSantri)
    const url = params.toString() ? `/pendaftaran/get-biodata?${params.toString()}` : '/pendaftaran/get-biodata'
    const response = await api.get(url)
    return response.data
  },
  
  getKondisiValues: async (idField = null, fieldName = null) => {
    const params = new URLSearchParams()
    if (idField) {
      params.append('id_field', idField)
    }
    if (fieldName) {
      params.append('field_name', fieldName)
    }
    const queryString = params.toString()
    const url = queryString ? `/pendaftaran/kondisi-values?${queryString}` : '/pendaftaran/kondisi-values'
    const response = await api.get(url)
    return response.data
  },

  /** Daftar semua field kondisi (untuk tampilan dinamis, tanpa auth) */
  getKondisiFields: async () => {
    const response = await api.get('/pendaftaran/kondisi-fields')
    return response.data
  },

  /**
   * Item + harga sesuai kondisi (satu logika backend untuk daftar & uwaba).
   * Body: { status_pendaftar?, daftar_formal?, daftar_diniyah?, status_murid?, status_santri?, gender?, gelombang? }
   * Returns: { success, data: { items: [{ id_item, nama_item, harga, kategori, urutan }], total_wajib, matching_set_ids } }
   */
  getItemsByKondisi: async (kondisi = {}) => {
    const response = await api.post('/pendaftaran/items-by-kondisi', kondisi)
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
        'Content-Type': 'multipart/form-data'
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
        'Content-Type': 'multipart/form-data'
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
    const response = await api.post('/v2/santri-berkas/mark-tidak-ada', { id_santri: idSantri, jenis_berkas: jenisBerkas })
    return response.data
  },

  unmarkTidakAda: async (idSantri, jenisBerkas) => {
    const response = await api.post('/v2/santri-berkas/unmark-tidak-ada', { id_santri: idSantri, jenis_berkas: jenisBerkas })
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

  /** Hitung dan update keterangan_status di backend (id_santri, tahun_hijriyah?, tahun_masehi?) */
  syncKeteranganStatus: async (data) => {
    const response = await api.post('/pendaftaran/sync-keterangan-status', data)
    return response.data
  }
}

// Payment Transaction API (iPayMu)
export const paymentTransactionAPI = {
  getMode: async () => {
    try {
      const response = await api.get('/payment-transaction/mode')
      return response.data
    } catch (error) {
      console.error('Error fetching payment mode:', error)
      return { success: false, data: { is_sandbox: false } }
    }
  },

  createTransaction: async (data) => {
    const response = await api.post('/payment-transaction/create', data)
    return response.data
  },

  checkStatus: async (sessionId) => {
    const response = await api.get(`/payment-transaction/status/${sessionId}`)
    return response.data
  },

  getAdminFee: async (paymentMethod = 'va', paymentChannel = '') => {
    const params = new URLSearchParams()
    if (paymentMethod) params.append('payment_method', paymentMethod)
    if (paymentChannel) params.append('payment_channel', paymentChannel)
    const response = await api.get(`/payment-transaction/admin-fee?${params.toString()}`)
    return response.data
  },

  getPendingTransaction: async (idRegistrasi = null, idSantri = null) => {
    const params = new URLSearchParams()
    if (idRegistrasi) {
      params.append('id_registrasi', idRegistrasi)
    }
    if (idSantri) {
      params.append('id_santri', idSantri)
    }
    params.append('status', 'pending')
    params.append('_t', Date.now())
    try {
      const response = await api.get(`/payment-transaction/pending?${params.toString()}`)
      return response.data
    } catch (error) {
      // Jika 404 (tidak ada transaksi pending), return response dengan success: false
      if (error.response && error.response.status === 404) {
        return {
          success: false,
          message: 'Tidak ada transaksi pending ditemukan',
          data: null
        }
      }
      // Untuk error lain, throw kembali
      throw error
    }
  },

  cancelTransaction: async (transactionId) => {
    const response = await api.post(`/payment-transaction/${transactionId}/cancel`, {})
    return response?.data ?? { success: false }
  },

  updateTransaction: async (transactionId, data) => {
    const response = await api.post(`/payment-transaction/${transactionId}/update`, data)
    return response.data
  }
}

// Pengaturan API (public - tidak perlu auth untuk getAll)
export const pengaturanAPI = {
  getAll: async (kategori = null) => {
    try {
      const url = kategori 
        ? `/pengaturan?kategori=${encodeURIComponent(kategori)}`
        : '/pengaturan'
      // Tambahkan timestamp untuk avoid cache browser
      const timestamp = Date.now()
      const finalUrl = url.includes('?') ? `${url}&_t=${timestamp}` : `${url}?_t=${timestamp}`
      const response = await axios.get(`${getSlimApiUrl()}${finalUrl}`, {
        withCredentials: true,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      })
      return response.data
    } catch (error) {
      console.error('Error fetching pengaturan:', error)
      return { success: false, data: [] }
    }
  },

  getByKey: async (key) => {
    try {
      const response = await axios.get(`${getSlimApiUrl()}/pengaturan/${key}`, {
        withCredentials: true,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      })
      return response.data
    } catch (error) {
      console.error('Error fetching pengaturan by key:', error)
      return { success: false, data: null }
    }
  }
}

export default api
