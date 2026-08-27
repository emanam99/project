import { clearSession, getStoredUser, getToken, saveSession, type AuthUser } from '../utils/auth'

function isPrivateHostname(hostname: string): boolean {
  const h = hostname.toLowerCase()
  if (h === 'localhost' || h === '127.0.0.1') return false
  return /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(h)
}

function resolveApiBaseUrl(): string {
  if (import.meta.env.DEV && typeof window !== 'undefined') {
    return `${window.location.origin}/wifi/api/public`
  }

  const fromEnv = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '')
  if (fromEnv) return fromEnv

  if (typeof window !== 'undefined') {
    const { protocol, hostname, origin } = window.location
    if (hostname === 'localhost' || hostname === '127.0.0.1' || isPrivateHostname(hostname)) {
      return `${protocol}//${hostname}/wifi/api/public`
    }
    return `${origin}/api/public`
  }

  return 'http://localhost/wifi/api/public'
}

function resolveOAuthApiUrl(): string {
  const explicit = (import.meta.env.VITE_OAUTH_API_URL as string | undefined)?.replace(/\/$/, '')
  if (explicit) return explicit

  const api = resolveApiBaseUrl()
  if (typeof window !== 'undefined' && isPrivateHostname(window.location.hostname)) {
    return 'http://localhost/wifi/api/public'
  }
  try {
    const host = new URL(api).hostname
    if (isPrivateHostname(host)) {
      return 'http://localhost/wifi/api/public'
    }
  } catch {
    /* ignore */
  }
  return api
}

const API_URL = resolveApiBaseUrl()
const OAUTH_API_URL = resolveOAuthApiUrl()

export const getApiBaseUrl = (): string => API_URL

export function getGoogleLoginUrl(returnTo = '/dashboard'): string {
  const frontend = encodeURIComponent(window.location.origin)
  return `${OAUTH_API_URL}/auth/google?returnTo=${encodeURIComponent(returnTo)}&frontend=${frontend}`
}

export async function loginWithPassword(
  email: string,
  password: string,
): Promise<ApiResult<AuthUser> & { token?: string }> {
  return request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  }) as Promise<ApiResult<AuthUser> & { token?: string }>
}

type ApiResult<T = unknown> = {
  success: boolean
  message?: string
  data?: T
  user?: AuthUser
  count?: number
}

async function request<T = unknown>(
  path: string,
  options: RequestInit = {},
): Promise<ApiResult<T>> {
  const headers = new Headers(options.headers || {})
  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json')
  }
  const token = getToken()
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  try {
    const res = await fetch(`${API_URL}${path}`, {
      ...options,
      headers,
      credentials: 'include',
    })
    const json = (await res.json().catch(() => ({}))) as ApiResult<T> & { code?: string }
    if (res.status === 401) {
      clearSession()
    }
    if (res.status === 403 && json.code === 'pending_access') {
      const tok = getToken()
      const user = getStoredUser()
      if (tok && user && user.role !== 'pending') {
        saveSession(tok, { ...user, role: 'pending' })
      }
      const pathName = window.location.pathname
      if (pathName !== '/menunggu-akses' && pathName !== '/login' && pathName !== '/auth/callback') {
        window.location.replace('/menunggu-akses')
      }
    }
    if (!res.ok && json.success === undefined) {
      return { success: false, message: json.message || `HTTP ${res.status}` }
    }
    return json
  } catch {
    return { success: false, message: 'Koneksi gagal. Periksa API atau jaringan.' }
  }
}

export async function fetchMe(): Promise<ApiResult<AuthUser>> {
  const result = await request<AuthUser>('/auth/me')
  if (result.success && result.user) {
    const token = getToken()
    if (token) saveSession(token, result.user)
  }
  return result
}

export async function logout(): Promise<void> {
  try {
    await request('/auth/logout', { method: 'POST' })
  } finally {
    clearSession()
  }
}

export type UserRow = {
  id: number
  email: string
  name: string | null
  picture: string | null
  google_id: string | null
  role: string
  pelanggan_id?: number | null
  pelanggan_nama?: string | null
  created_at?: string
  updated_at?: string
}

export async function listUsers() {
  return request<UserRow[]>('/users')
}

export async function createUser(payload: { email: string; role: string }) {
  return request<UserRow>('/users', { method: 'POST', body: JSON.stringify(payload) })
}

export async function updateUserRole(id: number, role: string) {
  return request<UserRow>(`/users/${id}/role`, { method: 'PUT', body: JSON.stringify({ role }) })
}

export async function linkUserPelanggan(id: number, pelangganId: number | null) {
  return request<UserRow>(`/users/${id}/pelanggan`, {
    method: 'PUT',
    body: JSON.stringify({ pelanggan_id: pelangganId }),
  })
}

export async function deleteUser(id: number) {
  return request(`/users/${id}`, { method: 'DELETE' })
}

export type Pelanggan = {
  id: number
  nama: string
  no_hp: string | null
  alamat: string | null
  paket: string | null
  aktif: boolean
  keterangan: string | null
  user_email?: string | null
  user_id?: number | null
  created_at?: string
  updated_at?: string
}

export async function listPelanggan(params?: { q?: string; aktif?: '0' | '1' }) {
  const qs = new URLSearchParams()
  if (params?.q) qs.set('q', params.q)
  if (params?.aktif) qs.set('aktif', params.aktif)
  const q = qs.toString()
  return request<Pelanggan[]>(`/pelanggan${q ? `?${q}` : ''}`)
}

export async function getPelanggan(id: number) {
  return request<Pelanggan>(`/pelanggan/${id}`)
}

export async function createPelanggan(
  payload: Partial<Pelanggan> & { nama: string; email?: string | null },
) {
  return request<Pelanggan>('/pelanggan', { method: 'POST', body: JSON.stringify(payload) })
}

export async function updatePelanggan(
  id: number,
  payload: Partial<Pelanggan> & { email?: string | null },
) {
  return request<Pelanggan>(`/pelanggan/${id}`, { method: 'PUT', body: JSON.stringify(payload) })
}

export async function deletePelanggan(id: number) {
  return request(`/pelanggan/${id}`, { method: 'DELETE' })
}

export type PelangganImportItem = {
  nama: string
  email?: string | null
  no_hp?: string | null
  alamat?: string | null
  paket?: string | null
  keterangan?: string | null
  aktif?: boolean
}

export type PelangganImportResult = {
  created: number
  failed: { index: number; message: string }[]
  data?: Pelanggan[]
}

export async function importPelangganBatch(items: PelangganImportItem[]) {
  return request<Pelanggan[]>('/pelanggan/import', {
    method: 'POST',
    body: JSON.stringify({ items }),
  }) as Promise<
    ApiResult<Pelanggan[]> & {
      created?: number
      failed?: { index: number; message: string }[]
    }
  >
}

export type TagihanBayar = {
  id: number
  tagihan_id: number
  nominal: number
  tanggal: string
  via: string
  keterangan: string | null
  created_by: number | null
  created_by_name?: string | null
  created_at?: string
}

export type Tagihan = {
  id: number
  pelanggan_id: number
  nama_pelanggan?: string | null
  nama: string
  nominal: number
  periode_bulan: number
  periode_tahun: number
  jatuh_tempo: string
  keterangan: string | null
  total_bayar: number
  sisa: number
  lunas: boolean
  jumlah_bayar?: number
  tanggal_bayar_terakhir?: string | null
  pembayaran?: TagihanBayar[] | null
  created_at?: string
  updated_at?: string
}

export async function listTagihan(params?: {
  pelanggan_id?: number
  periode_bulan?: number
  periode_tahun?: number
  status?: string
  q?: string
}) {
  const qs = new URLSearchParams()
  if (params?.pelanggan_id) qs.set('pelanggan_id', String(params.pelanggan_id))
  if (params?.periode_bulan) qs.set('periode_bulan', String(params.periode_bulan))
  if (params?.periode_tahun) qs.set('periode_tahun', String(params.periode_tahun))
  if (params?.status) qs.set('status', params.status)
  if (params?.q) qs.set('q', params.q)
  const q = qs.toString()
  return request<Tagihan[]>(`/tagihan${q ? `?${q}` : ''}`)
}

export async function getTagihan(id: number) {
  return request<Tagihan>(`/tagihan/${id}`)
}

export async function createTagihan(payload: {
  pelanggan_id?: number
  pelanggan_ids?: number[]
  nama: string
  nominal: number
  periode_bulan: number
  periode_tahun: number
  jatuh_tempo: string
  keterangan?: string
  /** Jika true, simpan template & buat ulang tiap tanggal 1 via cron. */
  berulang?: boolean
  jatuh_tempo_hari?: number
}) {
  return request<Tagihan | Tagihan[]>('/tagihan', { method: 'POST', body: JSON.stringify(payload) })
}

export type TagihanBerulang = {
  id: number
  pelanggan_id: number
  nama_pelanggan: string
  nominal: number
  keterangan: string | null
  jatuh_tempo_hari: number
  aktif: boolean
  last_run_periode: string | null
  created_at?: string
}

export async function listTagihanBerulang(pelangganId?: number) {
  const qs = new URLSearchParams()
  if (pelangganId) qs.set('pelanggan_id', String(pelangganId))
  const q = qs.toString()
  return request<TagihanBerulang[]>(`/tagihan/berulang${q ? `?${q}` : ''}`)
}

export async function deleteTagihanBerulang(id: number) {
  return request(`/tagihan/berulang/${id}`, { method: 'DELETE' })
}

export async function updateTagihan(
  id: number,
  payload: Partial<{
    nama: string
    nominal: number
    periode_bulan: number
    periode_tahun: number
    jatuh_tempo: string
    keterangan: string
  }>,
) {
  return request<Tagihan>(`/tagihan/${id}`, { method: 'PUT', body: JSON.stringify(payload) })
}

export async function deleteTagihan(id: number) {
  return request(`/tagihan/${id}`, { method: 'DELETE' })
}

export async function createTagihanBayar(payload: {
  tagihan_id: number
  nominal: number
  tanggal?: string
  via?: string
  keterangan?: string
}) {
  return request<Tagihan>('/tagihan/bayar', { method: 'POST', body: JSON.stringify(payload) })
}

export async function deleteTagihanBayar(id: number) {
  return request<Tagihan>(`/tagihan/bayar/${id}`, { method: 'DELETE' })
}

export type RekapSummary = {
  jumlah_pelanggan?: number
  jumlah_tagihan: number
  jumlah_lunas: number
  jumlah_belum: number
  total_kewajiban: number
  total_terbayar: number
  total_sisa: number
}

export type RekapItem = {
  pelanggan_id: number
  nama_pelanggan: string
  no_hp?: string | null
  paket?: string | null
  jumlah_tagihan: number
  nominal: number
  total_bayar: number
  sisa: number
  lunas: boolean
  jatuh_tempo?: string | null
  periode_bulan?: number
  periode_tahun?: number
}

export type RekapData = {
  items: RekapItem[]
  summary: RekapSummary
}

export async function fetchRekap(params?: {
  periode_bulan?: number
  periode_tahun?: number
  status?: string
  q?: string
}) {
  const qs = new URLSearchParams()
  if (params?.periode_bulan) qs.set('periode_bulan', String(params.periode_bulan))
  if (params?.periode_tahun) qs.set('periode_tahun', String(params.periode_tahun))
  if (params?.status) qs.set('status', params.status)
  if (params?.q) qs.set('q', params.q)
  const q = qs.toString()
  return request<RekapData>(`/rekap${q ? `?${q}` : ''}`)
}

export type DashboardTrendPoint = {
  curr: number
  prev: number
  delta: number
  delta_pct: number | null
}

export type DashboardData = {
  periode_bulan: number
  periode_tahun: number
  prev_periode_bulan?: number
  prev_periode_tahun?: number
  pelanggan: {
    total: number
    aktif: number
    nonaktif: number
  }
  periode: {
    jumlah_pelanggan: number
    jumlah_tagihan: number
    jumlah_lunas: number
    jumlah_belum: number
    jumlah_terlambat: number
    total_kewajiban: number
    total_terbayar: number
    total_sisa: number
    koleksi_pct?: number
  }
  prev_periode?: DashboardData['periode']
  tren?: {
    kewajiban: DashboardTrendPoint
    terbayar: DashboardTrendPoint
    sisa: DashboardTrendPoint
    koleksi_pct: DashboardTrendPoint
    belum: DashboardTrendPoint
    terlambat: DashboardTrendPoint
  }
  pembayaran: {
    hari_ini_total: number
    hari_ini_jumlah: number
    kemarin_total?: number
    kemarin_jumlah?: number
    hari_ini_delta?: number
    hari_ini_delta_pct?: number | null
    periode_total: number
    periode_jumlah: number
    via_cash?: number
    via_tf?: number
  }
  charts?: {
    bulanan: Array<{
      periode_bulan: number
      periode_tahun: number
      label: string
      kewajiban: number
      terbayar: number
      sisa: number
      koleksi_pct: number
      jumlah_lunas: number
      jumlah_belum: number
      jumlah_terlambat: number
    }>
    harian: Array<{
      tanggal: string
      label: string
      total: number
      jumlah: number
      cash: number
      tf: number
    }>
    status: Array<{ key: string; label: string; value: number }>
    via: Array<{ key: string; label: string; value: number }>
  }
  belum_lunas: Array<{
    pelanggan_id: number
    nama_pelanggan: string
    jumlah_tagihan: number
    nominal: number
    total_bayar: number
    sisa: number
    lunas: boolean
    jatuh_tempo: string | null
    terlambat: boolean
    periode_bulan: number
    periode_tahun: number
  }>
}

export async function fetchDashboard(params?: { periode_bulan?: number; periode_tahun?: number }) {
  const qs = new URLSearchParams()
  if (params?.periode_bulan) qs.set('periode_bulan', String(params.periode_bulan))
  if (params?.periode_tahun) qs.set('periode_tahun', String(params.periode_tahun))
  const q = qs.toString()
  return request<DashboardData>(`/dashboard${q ? `?${q}` : ''}`)
}

