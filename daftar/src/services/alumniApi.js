import axios from 'axios'
import { getSlimApiUrl, resetCsrfToken, getCsrfToken } from './api'
import { alumniPath, isAlumniAppHost } from '../config/alumniApp'

const alumniApi = axios.create({
  baseURL: getSlimApiUrl(),
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
  withCredentials: true,
})

alumniApi.interceptors.request.use(
  async (config) => {
    const token = localStorage.getItem('alumni_auth_token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    const method = (config.method || 'get').toLowerCase()
    if (!['get', 'head', 'options'].includes(method)) {
      const csrf = await getCsrfToken()
      if (csrf) {
        config.headers['X-CSRF-Token'] = csrf
      }
    }
    return config
  },
  (error) => Promise.reject(error)
)

alumniApi.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      const url = error.config?.url || ''
      if (!url.includes('/alumni/login-nik')) {
        localStorage.removeItem('alumni_auth_token')
        localStorage.removeItem('alumni_user_data')
        // Kembali ke halaman NIK (host alumni → /, daftar → /alumni)
        if (typeof window !== 'undefined') {
          const home = alumniPath()
          const path = window.location.pathname.replace(/\/+$/, '') || '/'
          const homeNorm = home.replace(/\/+$/, '') || '/'
          const onAlumniFlow =
            isAlumniAppHost() || path === '/alumni' || path.startsWith('/alumni/')
          if (onAlumniFlow && path !== homeNorm) {
            window.location.assign(`${window.location.origin}${home}`)
          }
        }
      }
    }
    return Promise.reject(error)
  }
)

export const alumniAPI = {
  count: async () => {
    const res = await alumniApi.get('/alumni/count')
    return res.data
  },

  topWilayah: async () => {
    const res = await alumniApi.get('/alumni/top-wilayah')
    return res.data
  },

  alamatSuggest: async (q, field = 'desa') => {
    const res = await alumniApi.get('/alumni/alamat-suggest', { params: { q, field } })
    return res.data
  },

  checkNik: async (nik) => {
    const res = await alumniApi.get('/alumni/check-nik', { params: { nik } })
    return res.data
  },

  convertTahun: async (masehi) => {
    const res = await alumniApi.get('/alumni/convert-tahun', { params: { masehi } })
    return res.data
  },

  loginNik: async (nik) => {
    const res = await alumniApi.post('/alumni/login-nik', { nik })
    return res.data
  },

  me: async () => {
    const res = await alumniApi.get('/alumni/me')
    return res.data
  },

  saveBiodata: async (payload) => {
    const res = await alumniApi.put('/alumni/biodata', payload)
    return res.data
  },
}

export function clearAlumniSession() {
  resetCsrfToken()
  localStorage.removeItem('alumni_auth_token')
  localStorage.removeItem('alumni_user_data')
}
