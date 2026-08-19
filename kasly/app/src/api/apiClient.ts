import { clearSession, getStoredUser, getToken, saveSession, type AuthUser, type TransaksiJenis } from '../utils/auth'

function isPrivateHostname(hostname: string): boolean {
  const h = hostname.toLowerCase()
  if (h === 'localhost' || h === '127.0.0.1') return false
  return /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(h)
}

function resolveApiBaseUrl(): string {
  const fromEnv = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '')
  if (fromEnv) return fromEnv

  if (typeof window !== 'undefined') {
    const { protocol, hostname, origin } = window.location
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return `${protocol}//${hostname}/kasly/api/public`
    }
    return `${origin}/api/public`
  }

  return 'http://localhost/kasly/api/public'
}

function resolveOAuthApiUrl(): string {
  const explicit = (import.meta.env.VITE_OAUTH_API_URL as string | undefined)?.replace(/\/$/, '')
  if (explicit) return explicit

  const api = resolveApiBaseUrl()
  if (typeof window !== 'undefined' && isPrivateHostname(window.location.hostname)) {
    return 'http://localhost/kasly/api/public'
  }
  try {
    const host = new URL(api).hostname
    if (isPrivateHostname(host)) {
      return 'http://localhost/kasly/api/public'
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

type ApiResult<T = unknown> = {
  success: boolean
  message?: string
  data?: T
  user?: AuthUser
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
      const tokenNow = getToken()
      const user = getStoredUser()
      if (tokenNow && user && user.role !== 'pending') {
        saveSession(tokenNow, { ...user, role: 'pending' })
      }
      const pathNow = window.location.pathname
      if (pathNow !== '/menunggu-akses' && pathNow !== '/login' && pathNow !== '/auth/callback') {
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

export async function logout(): Promise<ApiResult> {
  const result = await request('/auth/logout', { method: 'POST' })
  clearSession()
  return result
}

export type BelanjaRow = {
  id: number
  tanggal: string
  jenis: TransaksiJenis
  keterangan: string | null
  kategori?: string | null
  total: number | string
  created_by: number | null
  created_by_name?: string | null
  created_by_email?: string | null
  item_count?: number
  alokasi?: BelanjaAlokasi[]
  alokasi_label?: string
}

export type BelanjaItem = {
  id: number
  belanja_id: number
  nama_barang: string
  qty: number | string
  satuan: string
  harga_satuan: number | string
  subtotal: number | string
  catatan: string | null
}

export type BelanjaDetail = {
  belanja: BelanjaRow
  items: BelanjaItem[]
  alokasi?: BelanjaAlokasi[]
}

export type DashboardSummary = {
  saldo: number
  masuk_semua: number
  keluar_semua: number
  masuk_bulan_ini: number
  keluar_bulan_ini: number
  masuk_bulan_lalu: number
  keluar_bulan_lalu: number
  masuk_hari_ini: number
  keluar_hari_ini: number
  catatan_hari_ini: number
  jumlah_catatan: number
  jumlah_item: number
  rata_keluar_harian: number
  daily: Array<{ tanggal: string; masuk: number; keluar: number; total: number; jumlah: number }>
  by_kategori_keluar: Array<{ nama: string; total: number; jumlah: number }>
  by_kategori_masuk: Array<{ nama: string; total: number; jumlah: number }>
  recent: BelanjaRow[]
  top_items: Array<{
    nama_barang: string
    total_qty: number | string
    total_nilai: number | string
  }>
  rekening?: RekeningRow[]
  saldo_bank?: number
  saldo_ewallet?: number
  saldo_cash?: number
}

export async function getDashboardSummary() {
  return request<DashboardSummary>('/dashboard/summary')
}

export async function listBelanja(params: {
  from?: string
  to?: string
  q?: string
  kategori?: string
  jenis?: TransaksiJenis
} = {}) {
  const qs = new URLSearchParams()
  if (params.from) qs.set('from', params.from)
  if (params.to) qs.set('to', params.to)
  if (params.q) qs.set('q', params.q)
  if (params.kategori) qs.set('kategori', params.kategori)
  if (params.jenis) qs.set('jenis', params.jenis)
  const query = qs.toString()
  return request<BelanjaRow[]>(`/belanja${query ? `?${query}` : ''}`)
}

export async function getBelanja(id: number) {
  return request<BelanjaDetail>(`/belanja/${id}`)
}

export async function createBelanja(payload: {
  tanggal: string
  jenis: TransaksiJenis
  keterangan?: string
  kategori?: string
  items?: Array<{
    nama_barang: string
    qty: number
    satuan?: string
    harga_satuan: number
    catatan?: string
  }>
  alokasi?: Array<{ rekening_id: number; jumlah: number }>
}) {
  return request<BelanjaDetail>('/belanja', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function updateBelanja(
  id: number,
  payload: {
    tanggal?: string
    jenis?: TransaksiJenis
    keterangan?: string
    kategori?: string | null
    alokasi?: Array<{ rekening_id: number; jumlah: number }>
  },
) {
  return request<BelanjaDetail>(`/belanja/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}

export async function deleteBelanja(id: number) {
  return request(`/belanja/${id}`, { method: 'DELETE' })
}

export async function addBelanjaItem(
  belanjaId: number,
  payload: {
    nama_barang: string
    qty: number
    satuan?: string
    harga_satuan: number
    catatan?: string
  },
) {
  return request<BelanjaItem>(`/belanja/${belanjaId}/items`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function updateBelanjaItem(
  belanjaId: number,
  itemId: number,
  payload: Partial<{
    nama_barang: string
    qty: number
    satuan: string
    harga_satuan: number
    catatan: string
  }>,
) {
  return request<BelanjaItem>(`/belanja/${belanjaId}/items/${itemId}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}

export async function deleteBelanjaItem(belanjaId: number, itemId: number) {
  return request(`/belanja/${belanjaId}/items/${itemId}`, { method: 'DELETE' })
}

export type BelanjaFileRow = {
  id: number
  belanja_id: number
  nama_file: string
  nama_file_simpan: string
  path_file?: string
  tipe_file: string | null
  ukuran_file: number
  uploaded_by?: number | null
  uploaded_by_name?: string | null
  created_at?: string
}

export async function listBelanjaFiles(belanjaId: number) {
  return request<BelanjaFileRow[]>(`/belanja/${belanjaId}/files`)
}

export async function uploadBelanjaFile(belanjaId: number, file: File) {
  const form = new FormData()
  form.append('file', file)
  const headers = new Headers()
  const token = getToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  try {
    const res = await fetch(`${API_URL}/belanja/${belanjaId}/files`, {
      method: 'POST',
      headers,
      body: form,
      credentials: 'include',
    })
    const json = (await res.json().catch(() => ({}))) as ApiResult<BelanjaFileRow>
    if (res.status === 401) clearSession()
    if (!res.ok && json.success === undefined) {
      return { success: false, message: json.message || `HTTP ${res.status}` }
    }
    return json
  } catch {
    return { success: false, message: 'Koneksi gagal saat meng-upload file.' }
  }
}

export async function deleteBelanjaFile(fileId: number) {
  return request(`/belanja/files/${fileId}`, { method: 'DELETE' })
}

export async function downloadBelanjaFileBlob(
  fileId: number,
): Promise<{ success: true; blob: Blob } | { success: false; message: string }> {
  const headers = new Headers()
  const token = getToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  try {
    const res = await fetch(`${API_URL}/belanja/files/${fileId}/download`, {
      headers,
      credentials: 'include',
    })
    const type = res.headers.get('Content-Type') || ''
    if (!res.ok || type.includes('application/json')) {
      const json = (await res.json().catch(() => ({}))) as { message?: string }
      if (res.status === 401) clearSession()
      return { success: false, message: json.message || `Gagal unduh (HTTP ${res.status})` }
    }
    return { success: true, blob: await res.blob() }
  } catch {
    return { success: false, message: 'Koneksi gagal saat mengunduh file.' }
  }
}

export type UserRow = {
  id: number
  email: string
  name: string | null
  picture: string | null
  google_id: string | null
  role: string
  created_at: string
}

export async function listUsers() {
  return request<UserRow[]>('/users')
}

export async function createUser(payload: { email: string; role: string }) {
  return request<UserRow>('/users', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function updateUserRole(id: number, role: string) {
  return request<UserRow>(`/users/${id}/role`, {
    method: 'PUT',
    body: JSON.stringify({ role }),
  })
}

export async function deleteUser(id: number) {
  return request(`/users/${id}`, { method: 'DELETE' })
}

export type KategoriRow = {
  id: number
  nama: string
  jenis?: string
}

export async function listKategori(jenis?: TransaksiJenis) {
  const qs = jenis ? `?jenis=${encodeURIComponent(jenis)}` : ''
  return request<KategoriRow[]>(`/kategori${qs}`)
}

export type BelanjaNamaOption = {
  nama: string
  satuan: string
  harga_satuan: number
}

export type BelanjaItemOptions = {
  nama_barang: BelanjaNamaOption[]
  satuan: string[]
}

export async function listBelanjaItemOptions(jenis?: TransaksiJenis) {
  const qs = jenis ? `?jenis=${encodeURIComponent(jenis)}` : ''
  return request<BelanjaItemOptions>(`/belanja/item-options${qs}`)
}

export type RekeningTipe = 'bank' | 'ewallet' | 'cash'

export type RekeningRow = {
  id: number
  nama: string
  tipe: RekeningTipe
  nomor: string | null
  is_system: number | boolean
  aktif: number | boolean
  sort_order?: number
  saldo?: number | string
}

export type BelanjaAlokasi = {
  id?: number
  belanja_id?: number
  rekening_id: number
  jumlah: number | string
  rekening_nama?: string
  rekening_tipe?: RekeningTipe
}

export type RekeningRingkas = {
  bank: number
  ewallet: number
  cash: number
}

export type RekeningListData = {
  rekening: RekeningRow[]
  ringkas: RekeningRingkas
}

export type RekeningTransferRow = {
  id: number
  tanggal: string
  dari_rekening_id: number
  ke_rekening_id: number
  jumlah: number | string
  biaya_admin?: number | string
  keterangan: string | null
  belanja_id?: number | null
  dari_nama?: string
  dari_tipe?: RekeningTipe
  ke_nama?: string
  ke_tipe?: RekeningTipe
  created_by_name?: string | null
}

export async function listRekening(params: { q?: string; aktif?: 'all' | '1' } = {}) {
  const qs = new URLSearchParams()
  if (params.q) qs.set('q', params.q)
  if (params.aktif) qs.set('aktif', params.aktif)
  const query = qs.toString()
  return request<RekeningListData>(`/rekening${query ? `?${query}` : ''}`)
}

export async function createRekening(payload: { nama: string; tipe: RekeningTipe; nomor?: string }) {
  return request<RekeningRow>('/rekening', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function updateRekening(
  id: number,
  payload: { nama?: string; nomor?: string | null; aktif?: number },
) {
  return request<RekeningRow>(`/rekening/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}

export async function deleteRekening(id: number) {
  return request(`/rekening/${id}`, { method: 'DELETE' })
}

export async function listRekeningTransfer() {
  return request<RekeningTransferRow[]>('/rekening/transfer')
}

export async function createRekeningTransfer(payload: {
  tanggal: string
  dari_rekening_id: number
  ke_rekening_id: number
  jumlah: number
  biaya_admin?: number
  keterangan?: string
}) {
  return request('/rekening/transfer', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}
