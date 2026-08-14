import { clearSession, getStoredUser, getToken, saveSession, type AuthUser } from '../utils/auth'

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
    // Dev Vite → XAMPP lokal
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return `${protocol}//${hostname}/sppg/api/public`
    }
    // Production / same-origin (mis. https://sppg.alutsmani.id)
    return `${origin}/api/public`
  }

  return 'http://localhost/sppg/api/public'
}

/**
 * OAuth Google:
 * - Production / domain publik → sama dengan API (jangan paksa localhost)
 * - Akses via IP LAN privat → localhost (Google menolak redirect IP privat)
 */
function resolveOAuthApiUrl(): string {
  const explicit = (import.meta.env.VITE_OAUTH_API_URL as string | undefined)?.replace(/\/$/, '')
  if (explicit) return explicit

  const api = resolveApiBaseUrl()
  if (typeof window !== 'undefined' && isPrivateHostname(window.location.hostname)) {
    return 'http://localhost/sppg/api/public'
  }
  try {
    const host = new URL(api).hostname
    if (isPrivateHostname(host)) {
      return 'http://localhost/sppg/api/public'
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
      const token = getToken()
      const user = getStoredUser()
      if (token && user && user.role !== 'pending') {
        saveSession(token, { ...user, role: 'pending' })
      }
      const path = window.location.pathname
      if (path !== '/menunggu-akses' && path !== '/login' && path !== '/auth/callback') {
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

export type BelanjaBniStatus = 'belum' | 'maker' | 'approved'
export type BelanjaCairStatus = 'jatim' | 'cair'
export type RekeningJenis = 'va' | 'rek'

export type BelanjaRow = {
  id: number
  tanggal: string
  keterangan: string | null
  rekening_id?: number | null
  kategori?: string | null
  bni_status?: BelanjaBniStatus | null
  cair_status?: BelanjaCairStatus | null
  nomor_rekening?: string | null
  nama_penerima?: string | null
  bank_tujuan?: string | null
  online_bank_code?: string | null
  rekening_jenis?: RekeningJenis | null
  total: number | string
  created_by: number | null
  created_by_name?: string | null
  created_by_email?: string | null
  item_count?: number
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
}

export type DashboardSummary = {
  total_semua: number
  total_bulan_ini: number
  total_bulan_lalu: number
  total_hari_ini: number
  total_kemarin: number
  catatan_hari_ini: number
  jumlah_catatan: number
  jumlah_item: number
  rata_harian_bulan: number
  pct_vs_kemarin: number | null
  pct_vs_bulan_lalu: number | null
  daily: Array<{ tanggal: string; total: number; jumlah: number }>
  daily_delta: Array<{ tanggal: string; total: number; delta: number | null; pct: number | null }>
  by_kategori: Array<{ nama: string; total: number; jumlah: number }>
  by_rekening: Array<{ nama: string; total: number; jumlah: number }>
  recent: BelanjaRow[]
  top_items: Array<{
    nama_barang: string
    total_qty: number | string
    total_nilai: number | string
  }>
}

export async function getDashboardSummary() {
  return request<DashboardSummary>('/dashboard/summary')
}

export async function listBelanja(params: {
  from?: string
  to?: string
  q?: string
  rekening_id?: number
  kategori?: string
  bni_status?: BelanjaBniStatus
} = {}) {
  const qs = new URLSearchParams()
  if (params.from) qs.set('from', params.from)
  if (params.to) qs.set('to', params.to)
  if (params.q) qs.set('q', params.q)
  if (params.rekening_id) qs.set('rekening_id', String(params.rekening_id))
  if (params.kategori) qs.set('kategori', params.kategori)
  if (params.bni_status) qs.set('bni_status', params.bni_status)
  const query = qs.toString()
  return request<BelanjaRow[]>(`/belanja${query ? `?${query}` : ''}`)
}

/** Unduh CSV BNI Direct (sheet Online), mengikuti filter daftar belanja. */
export async function downloadBelanjaBniCsv(params: {
  from?: string
  to?: string
  q?: string
  nama?: string
  rekening_id?: number
  kategori?: string
  bni_status?: BelanjaBniStatus
  ids?: number[]
}): Promise<{ success: true; filename: string } | { success: false; message: string }> {
  return downloadBelanjaExportFile('/belanja/export/bni-online', params, 'belanja_Online.csv', 'CSV')
}

/** Unduh Excel Maker Operasional (layout template MAKER OPERASIONAL). */
export async function downloadBelanjaMakerXlsx(params: {
  from?: string
  to?: string
  q?: string
  nama?: string
  rekening_id?: number
  kategori?: string
  bni_status?: BelanjaBniStatus
  ids?: number[]
}): Promise<{ success: true; filename: string } | { success: false; message: string }> {
  return downloadBelanjaExportFile('/belanja/export/maker-xlsx', params, 'MAKER_OPERASIONAL.xlsx', 'Excel')
}

async function downloadBelanjaExportFile(
  path: string,
  params: {
    from?: string
    to?: string
    q?: string
    nama?: string
    rekening_id?: number
    kategori?: string
    bni_status?: BelanjaBniStatus
    ids?: number[]
  },
  fallbackName: string,
  label: string,
): Promise<{ success: true; filename: string } | { success: false; message: string }> {
  const qs = new URLSearchParams()
  if (params.from) qs.set('from', params.from)
  if (params.to) qs.set('to', params.to)
  if (params.q) qs.set('q', params.q)
  if (params.nama) qs.set('nama', params.nama)
  if (params.rekening_id) qs.set('rekening_id', String(params.rekening_id))
  if (params.kategori) qs.set('kategori', params.kategori)
  if (params.bni_status) qs.set('bni_status', params.bni_status)
  if (params.ids?.length) qs.set('ids', params.ids.join(','))
  const query = qs.toString()
  const headers = new Headers()
  const token = getToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)

  try {
    const res = await fetch(`${API_URL}${path}${query ? `?${query}` : ''}`, {
      headers,
      credentials: 'include',
    })
    const disposition = res.headers.get('Content-Disposition') || ''
    const type = res.headers.get('Content-Type') || ''

    if (!res.ok || type.includes('application/json')) {
      const json = (await res.json().catch(() => ({}))) as { message?: string }
      if (res.status === 401) clearSession()
      return { success: false, message: json.message || `Gagal ekspor (HTTP ${res.status})` }
    }

    const blob = await res.blob()
    let filename = fallbackName
    const m = /filename=\"([^\"]+)\"/i.exec(disposition)
    if (m?.[1]) filename = m[1]

    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
    return { success: true, filename }
  } catch {
    return { success: false, message: `Koneksi gagal saat mengunduh ${label}.` }
  }
}

export async function updateBelanjaBniStatus(
  ids: number[],
  status: BelanjaBniStatus,
  opts?: { nama?: string },
) {
  return request<{
    updated: number
    status: BelanjaBniStatus
    batch?: {
      batch_id: number
      csv_filename: string
      record_count: number
      total_amount: number
      debit_account: string
    }
    batch_error?: string
    cair_updated?: number
  }>('/belanja/bni-status', {
    method: 'PATCH',
    body: JSON.stringify({
      ids,
      status,
      ...(opts?.nama ? { nama: opts.nama } : {}),
    }),
  })
}

export async function updateBelanjaCairStatus(ids: number[], status: BelanjaCairStatus) {
  return request<{ updated: number; status: BelanjaCairStatus }>('/belanja/cair-status', {
    method: 'PATCH',
    body: JSON.stringify({ ids, status }),
  })
}

export type ExportArsipRow = {
  id: number
  export_type: 'bni_csv' | 'maker_xlsx'
  nama_file: string
  csv_filename: string
  record_count: number
  total_amount: number | string
  trx_date: string
  status: string
  bni_reference?: string | null
  email_datetime?: string | null
  matched_at?: string | null
  created_at: string
  created_by?: number | null
  exported_by_name?: string | null
  exported_by_email?: string | null
}

export type ExportArsipDetail = {
  batch: ExportArsipRow & {
    belanja_ids?: string
    debit_account?: string
    csv_path?: string
  }
  belanja: BelanjaRow[]
}

export async function listExportArsip(params: { type?: 'bni_csv' | 'maker_xlsx' } = {}) {
  const qs = new URLSearchParams()
  if (params.type) qs.set('type', params.type)
  const query = qs.toString()
  return request<ExportArsipRow[]>(`/export-arsip${query ? `?${query}` : ''}`)
}

export async function getExportArsip(id: number) {
  return request<ExportArsipDetail>(`/export-arsip/${id}`)
}

export async function getBelanja(id: number) {
  return request<BelanjaDetail>(`/belanja/${id}`)
}

export async function createBelanja(payload: {
  tanggal: string
  keterangan?: string
  rekening_id?: number | null
  kategori?: string
  items?: Array<{
    nama_barang: string
    qty: number
    satuan?: string
    harga_satuan: number
    catatan?: string
  }>
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
    keterangan?: string
    rekening_id?: number | null
    kategori?: string | null
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
  // Jangan set Content-Type — browser isi boundary multipart
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

export type RekeningRow = {
  id: number
  nomor_rekening: string
  nama_penerima: string
  online_bank_code: string
  bank_tujuan: string
  jenis?: RekeningJenis | null
  aktif: number
}

export type KategoriRow = {
  id: number
  nama: string
}

export async function listRekening(params: { q?: string; aktif?: 'all' | '1' } = {}) {
  const qs = new URLSearchParams()
  if (params.q) qs.set('q', params.q)
  if (params.aktif) qs.set('aktif', params.aktif)
  const query = qs.toString()
  return request<RekeningRow[]>(`/rekening${query ? `?${query}` : ''}`)
}

export async function createRekening(payload: {
  nomor_rekening: string
  nama_penerima: string
  online_bank_code: string
  bank_tujuan: string
  jenis?: RekeningJenis
}) {
  return request<RekeningRow>('/rekening', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function updateRekening(
  id: number,
  payload: {
    nomor_rekening?: string
    nama_penerima?: string
    online_bank_code?: string
    bank_tujuan?: string
    jenis?: RekeningJenis
    aktif?: number
  },
) {
  return request<RekeningRow>(`/rekening/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}

export async function deleteRekening(id: number) {
  return request(`/rekening/${id}`, { method: 'DELETE' })
}

export async function listKategori() {
  return request<KategoriRow[]>('/kategori')
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

export async function listBelanjaItemOptions() {
  return request<BelanjaItemOptions>('/belanja/item-options')
}

export type PorsiUkuran = 'besar' | 'kecil'

export type PorsiRow = {
  id: number
  tanggal: string
  judul?: string | null
  ukuran: PorsiUkuran
  energi_kkal: number | string
  karbohidrat_gr: number | string
  protein_gr: number | string
  lemak_gr: number | string
  serat_gr: number | string
  foto_nama?: string | null
  foto_simpan?: string | null
  foto_path?: string | null
  foto_tipe?: string | null
  foto_ukuran?: number | string
  created_by?: number | null
  created_by_name?: string | null
  created_by_email?: string | null
  created_at?: string
  updated_at?: string
  menu_count?: number | string
  total_pb?: number | string
  total_pk?: number | string
  total_harga?: number | string
}

export type PorsiMenuItem = {
  id: number
  porsi_id: number
  nama: string
  pb: number | string
  pk: number | string | null
  urutan: number
  created_at?: string
}

export type PorsiDetail = {
  porsi: PorsiRow
  menu: PorsiMenuItem[]
}

export type PorsiMenuOption = {
  nama: string
  pb: number | null
  pk: number | null
}

export type PorsiPayload = {
  tanggal: string
  judul: string
  ukuran: PorsiUkuran
  energi_kkal: number
  karbohidrat_gr: number
  protein_gr: number
  lemak_gr: number
  serat_gr: number
  menu?: Array<{ nama: string; harga: number }>
}

export async function listPorsi(params: {
  from?: string
  to?: string
  q?: string
  ukuran?: PorsiUkuran
} = {}) {
  const qs = new URLSearchParams()
  if (params.from) qs.set('from', params.from)
  if (params.to) qs.set('to', params.to)
  if (params.q) qs.set('q', params.q)
  if (params.ukuran) qs.set('ukuran', params.ukuran)
  const query = qs.toString()
  return request<PorsiRow[]>(`/porsi${query ? `?${query}` : ''}`)
}

export async function getPorsi(id: number) {
  return request<PorsiDetail>(`/porsi/${id}`)
}

export async function createPorsi(payload: PorsiPayload) {
  return request<PorsiDetail>('/porsi', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function updatePorsi(id: number, payload: PorsiPayload) {
  return request<PorsiDetail>(`/porsi/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}

export async function deletePorsi(id: number) {
  return request(`/porsi/${id}`, { method: 'DELETE' })
}

export async function listPorsiItemOptions() {
  return request<{ menu: PorsiMenuOption[] }>('/porsi/item-options')
}

export async function uploadPorsiFoto(porsiId: number, file: File) {
  const form = new FormData()
  form.append('file', file)
  const headers = new Headers()
  const token = getToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  try {
    const res = await fetch(`${API_URL}/porsi/${porsiId}/foto`, {
      method: 'POST',
      headers,
      body: form,
      credentials: 'include',
    })
    const json = (await res.json().catch(() => ({}))) as ApiResult<PorsiRow>
    if (res.status === 401) clearSession()
    if (!res.ok && json.success === undefined) {
      return { success: false, message: json.message || `HTTP ${res.status}` }
    }
    return json
  } catch {
    return { success: false, message: 'Koneksi gagal saat meng-upload foto.' }
  }
}

export async function deletePorsiFoto(porsiId: number) {
  return request<PorsiRow>(`/porsi/${porsiId}/foto`, { method: 'DELETE' })
}

export async function downloadPorsiFotoBlob(
  porsiId: number,
): Promise<{ success: true; blob: Blob } | { success: false; message: string }> {
  const headers = new Headers()
  const token = getToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  try {
    const res = await fetch(`${API_URL}/porsi/${porsiId}/foto`, {
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
    return { success: false, message: 'Koneksi gagal saat mengunduh foto.' }
  }
}
