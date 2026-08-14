/**
 * Client HTTP ke API PHP Slim (mdtwustha/api/public).
 * Bukan Google Apps Script.
 */

const API_URL = 'http://localhost/mdtwustha/api/public';

export const getApiBaseUrl = (): string => API_URL;

const getBaseUrl = (): string => getApiBaseUrl();

export interface LoginPayload {
  nip: string
  password: string
}

export interface LoginResponse {
  success: boolean
  message?: string
  firstLogin?: boolean
  user?: { id: string; nip?: string; name?: string; jabatan?: string; akses?: string }
}

export interface PengurusRow {
  id: string
  nip: string
  nama: string
  jabatan: string
  akses: string
}

export interface GetPengurusResponse {
  success: boolean
  message?: string
  data: PengurusRow[]
}

export interface SavePengurusResponse {
  success: boolean
  message?: string
}

export interface KelasRow {
  id: string
  nama_kelas: string
  kel?: string
  wali_kelas_id?: string
  wali_kelas_nama?: string
}

export interface SantriKelasRiwayatRow {
  id: string
  kelas_id: string
  nama_kelas: string
  kel?: string
  wali_kelas_nama?: string
  tanggal_mulai: string
  tanggal_selesai?: string | null
}

export interface GetKelasResponse {
  success: boolean
  message?: string
  data: KelasRow[]
}

export interface SaveKelasResponse {
  success: boolean
  message?: string
}

export interface GetSantriKelasRiwayatResponse {
  success: boolean
  message?: string
  data: SantriKelasRiwayatRow[]
}

export interface SantriRow {
  id: string
  nomer_induk: string
  nama: string
  kelas?: string
  kelas_id?: string
  nama_kelas?: string
  kelas_kel?: string
  wali_kelas_nama?: string
  kel?: string
  kamar: string
  no_kk: string
  nik: string
  idp?: string
  tempat_lahir: string
  tanggal_lahir: string
  jenis_kelamin: string
  dusun: string
  rt: string
  rw: string
  desa: string
  kecamatan: string
  kabupaten: string
  provinsi: string
  ayah: string
  ibu: string
  saudara_di_pesantren: string
}

export interface GetSantriResponse {
  success: boolean
  message?: string
  data: SantriRow[]
}

export interface SaveSantriResponse {
  success: boolean
  message?: string
}

export type AbsenStatus = 'H' | 'S' | 'I' | 'A'

export interface AbsenSantriRow {
  santri_id: string
  nomer_induk?: string
  nama: string
  jam_1: AbsenStatus
  jam_2: AbsenStatus
  absen_id?: string | null
}

export interface NilaiSantriRow {
  santri_id: string
  nomer_induk?: string
  nama: string
  urutan?: number
  absen: AbsenStatus
  nilai: number | null
  nilai_id?: string | null
}

export interface GetNilaiResponse {
  success: boolean
  message?: string
  data: NilaiSantriRow[]
  meta?: { kelas_id: string; mapel_id: string; tanggal: string }
}

export interface SaveNilaiResponse {
  success: boolean
  message?: string
  data?: {
    id: number
    santri_id: string
    absen: AbsenStatus
    nilai: number | null
    tanggal: string
  }
}

export type NilaiRekapTampil = 'nilai' | 'absen' | 'keduanya'

export interface NilaiRekapCell {
  nilai: number | null
  absen: AbsenStatus
  tanggal: string
}

export interface NilaiRekapRow {
  santri_id: string
  nomer_induk?: string
  nama: string
  urutan?: number
  kelas_id?: string
  nama_kelas?: string
  kel?: string
  cells: Record<string, NilaiRekapCell | null>
}

export interface GetNilaiRekapResponse {
  success: boolean
  message?: string
  mapel: MapelRow[]
  data: NilaiRekapRow[]
  meta?: {
    kelas_id?: string
    kelas_ids?: string[]
    tanggal_awal: string
    tanggal_akhir: string
  }
}

export interface GetAbsenResponse {
  success: boolean
  message?: string
  data: AbsenSantriRow[]
  meta?: { kelas_id: string; tanggal: string; can_edit: boolean; lock_hour: number }
}

export interface SaveAbsenResponse {
  success: boolean
  message?: string
}

export type JurnalStatus = 'mengajar' | 'ijin' | 'sakit'

export interface JurnalMengajarEntry {
  id: string
  pengurus_id: string
  pengurus_nama: string
  status: JurnalStatus
  mapel_id?: string | null
  deskripsi?: string | null
  pelajaran?: string | null
  alasan?: string | null
  updated_at?: string
  mapel_fan?: string | null
  mapel_kitab?: string | null
  mapel_musonnif?: string | null
  mapel_dari?: string | null
  mapel_sampai?: string | null
}

export interface KitabRow {
  id: string
  fan: string
  nama: string
  musonnif: string
}

export interface GetKitabResponse {
  success: boolean
  message?: string
  data: KitabRow[]
}

export interface SaveKitabResponse {
  success: boolean
  message?: string
}

export interface MapelRow {
  id: string
  kitab_id: string
  dari: string
  sampai: string
  fan?: string
  kitab_nama?: string
  musonnif?: string
  /** Kelas yang memakai mapel ini (dari rekap multi-kelas) */
  kelas_ids?: string[]
}

export interface GetMapelResponse {
  success: boolean
  message?: string
  data: MapelRow[]
}

export interface SaveMapelResponse {
  success: boolean
  message?: string
}

export interface JurnalSlotStatus {
  occupied_by_other: boolean
  by_me: boolean
}

export interface GetJurnalMengajarResponse {
  success: boolean
  message?: string
  entries?: { jam_1: JurnalMengajarEntry[]; jam_2: JurnalMengajarEntry[] }
  mine?: { jam_1: JurnalMengajarEntry | null; jam_2: JurnalMengajarEntry | null }
  slots?: { jam_1: JurnalSlotStatus; jam_2: JurnalSlotStatus }
  mapel_list?: MapelRow[]
  meta?: {
    kelas_id: string
    tanggal: string
    can_edit: boolean
    lock_hour: number
    is_admin: boolean
  }
}

export interface SaveJurnalMengajarResponse {
  success: boolean
  message?: string
}

export type JurnalRekapCounts = Record<JurnalStatus, number>

export interface AbsenGuruRekapRow {
  pengurus_id: string
  pengurus_nama: string
  jam_1: JurnalRekapCounts
  jam_2: JurnalRekapCounts
  total: JurnalRekapCounts
}

export interface JurnalRekapDetailRow {
  tanggal: string
  jam: 'jam_1' | 'jam_2'
  status: JurnalStatus
  mapel_id?: string | null
  deskripsi?: string | null
  pelajaran?: string | null
  alasan?: string | null
  pengurus_id: string
  pengurus_nama: string
  kelas_id: string
  nama_kelas: string
  kel?: string
  mapel_fan?: string | null
  mapel_kitab?: string | null
  mapel_musonnif?: string | null
  mapel_dari?: string | null
  mapel_sampai?: string | null
}

export interface RekapJurnalMeta {
  kelas_id?: string | null
  pengurus_id?: string
  tanggal_awal: string
  tanggal_akhir: string
  hari_efektif: number
}

export interface GetAbsenGuruRekapResponse {
  success: boolean
  message?: string
  data: AbsenGuruRekapRow[]
  meta?: RekapJurnalMeta
}

export interface GetJurnalRekapResponse {
  success: boolean
  message?: string
  data: JurnalRekapDetailRow[]
  meta?: RekapJurnalMeta
}

export type AbsenRekapCounts = Record<AbsenStatus, number>

export interface AbsenRekapRow {
  santri_id: string
  nomer_induk?: string
  nama: string
  jam_1: AbsenRekapCounts
  jam_2: AbsenRekapCounts
}

export interface GetAbsenRekapResponse {
  success: boolean
  message?: string
  data: AbsenRekapRow[]
  meta?: {
    kelas_id: string
    tanggal_awal: string
    tanggal_akhir: string
    hari_efektif: number
  }
}

export interface AbsenRekapPublishBaris {
  id?: string | number
  santri_id: string
  nomer_induk?: string | null
  nama: string
  h: number
  s: number
  i: number
  a: number
  jam1_h: number
  jam1_s: number
  jam1_i: number
  jam1_a: number
  jam2_h: number
  jam2_s: number
  jam2_i: number
  jam2_a: number
  urutan?: number
}

export interface AbsenRekapPublishRow {
  id: string
  kelas_id: string
  judul: string
  catatan?: string | null
  tanggal_awal: string
  tanggal_akhir: string
  hijri_awal?: string | null
  hijri_akhir?: string | null
  publish_at: string
  published_by?: string | null
  publisher_nama?: string | null
  nama_kelas?: string | null
  kel?: string | null
  created_at?: string | null
  updated_at?: string | null
  is_live?: boolean
  seconds_until?: number
  can_view_content?: boolean
}

export interface AbsenRekapPublishPayload {
  judul: string
  catatan?: string
  kelas_id: string
  tanggal_awal: string
  tanggal_akhir: string
  hijri_awal?: string
  hijri_akhir?: string
  publish_at: string
  published_by?: string
  akses?: string
  baris: AbsenRekapPublishBaris[]
}

export function absenRekapRowsToPublishBaris(rows: AbsenRekapRow[]): AbsenRekapPublishBaris[] {
  return rows.map((row, index) => ({
    santri_id: String(row.santri_id),
    nomer_induk: row.nomer_induk || null,
    nama: row.nama,
    h: (row.jam_1?.H ?? 0) + (row.jam_2?.H ?? 0),
    s: (row.jam_1?.S ?? 0) + (row.jam_2?.S ?? 0),
    i: (row.jam_1?.I ?? 0) + (row.jam_2?.I ?? 0),
    a: (row.jam_1?.A ?? 0) + (row.jam_2?.A ?? 0),
    jam1_h: row.jam_1?.H ?? 0,
    jam1_s: row.jam_1?.S ?? 0,
    jam1_i: row.jam_1?.I ?? 0,
    jam1_a: row.jam_1?.A ?? 0,
    jam2_h: row.jam_2?.H ?? 0,
    jam2_s: row.jam_2?.S ?? 0,
    jam2_i: row.jam_2?.I ?? 0,
    jam2_a: row.jam_2?.A ?? 0,
    urutan: index + 1,
  }))
}

export async function login(payload: LoginPayload): Promise<LoginResponse> {
  const base = getBaseUrl() + '/login'
  const res = await fetch(base, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    return {
      success: false,
      message: `Network error: ${res.status}`,
    }
  }

  const data = (await res.json()) as LoginResponse
  return data
}

export async function getKelas(): Promise<GetKelasResponse> {
  const base = getBaseUrl() + '/kelas'
  try {
    const res = await fetch(base, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) return { success: false, message: `Error ${res.status}`, data: [] }
    return (await res.json()) as GetKelasResponse
  } catch {
    return { success: false, message: 'Koneksi gagal', data: [] }
  }
}

export async function getSantriKelasRiwayat(santriId: string): Promise<GetSantriKelasRiwayatResponse> {
  const base = getBaseUrl() + '/santri/' + santriId + '/kelas-riwayat'
  try {
    const res = await fetch(base, { method: 'GET', headers: { Accept: 'application/json' } })
    if (!res.ok) return { success: false, message: `Error ${res.status}`, data: [] }
    return (await res.json()) as GetSantriKelasRiwayatResponse
  } catch {
    return { success: false, message: 'Koneksi gagal', data: [] }
  }
}

export async function createKelas(data: {
  nama_kelas: string
  kel?: string
  wali_kelas_id?: string
}): Promise<SaveKelasResponse> {
  const base = getBaseUrl() + '/kelas'
  try {
    const res = await fetch(base, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    const out = (await res.json()) as SaveKelasResponse
    return res.ok ? out : { success: false, message: out.message || `Error ${res.status}` }
  } catch {
    return { success: false, message: 'Koneksi gagal' }
  }
}

export async function updateKelas(
  id: string,
  data: { nama_kelas: string; kel?: string; wali_kelas_id?: string }
): Promise<SaveKelasResponse> {
  const base = getBaseUrl() + '/kelas/' + id
  try {
    const res = await fetch(base, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    const out = (await res.json()) as SaveKelasResponse
    return res.ok ? out : { success: false, message: out.message || `Error ${res.status}` }
  } catch {
    return { success: false, message: 'Koneksi gagal' }
  }
}

export async function deleteKelas(id: string): Promise<SaveKelasResponse> {
  const base = getBaseUrl() + '/kelas/' + id
  try {
    const res = await fetch(base, { method: 'DELETE' })
    const out = (await res.json()) as SaveKelasResponse
    return res.ok ? out : { success: false, message: out.message || `Error ${res.status}` }
  } catch {
    return { success: false, message: 'Koneksi gagal' }
  }
}

export async function getSantri(): Promise<GetSantriResponse> {
  const base = getBaseUrl() + '/santri'
  try {
    const res = await fetch(base, {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    })
    if (!res.ok) return { success: false, message: `Error ${res.status}`, data: [] }
    return (await res.json()) as GetSantriResponse
  } catch {
    return { success: false, message: 'Koneksi gagal', data: [] }
  }
}

export async function createSantriFromSheet(data: Partial<SantriRow>): Promise<SaveSantriResponse> {
  const base = getBaseUrl() + '/santri'
  try {
    const res = await fetch(base, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    const out = (await res.json()) as SaveSantriResponse
    return res.ok ? out : { success: false, message: out.message || `Error ${res.status}` }
  } catch {
    return { success: false, message: 'Koneksi gagal' }
  }
}

export async function updateSantriFromSheet(data: Partial<SantriRow>): Promise<SaveSantriResponse> {
  const base = getBaseUrl() + '/santri/' + (data.id || '')
  try {
    const res = await fetch(base, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    const out = (await res.json()) as SaveSantriResponse
    return res.ok ? out : { success: false, message: out.message || `Error ${res.status}` }
  } catch {
    return { success: false, message: 'Koneksi gagal' }
  }
}

export async function getPengurus(): Promise<GetPengurusResponse> {
  const base = getBaseUrl() + '/pengurus'
  try {
    const res = await fetch(base, {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    })
    if (!res.ok) return { success: false, message: `Error ${res.status}`, data: [] }
    return (await res.json()) as GetPengurusResponse
  } catch {
    return { success: false, message: 'Koneksi gagal', data: [] }
  }
}

export async function createPengurus(data: Partial<PengurusRow>): Promise<SavePengurusResponse> {
  const base = getBaseUrl() + '/pengurus'
  try {
    const res = await fetch(base, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    const out = (await res.json()) as SavePengurusResponse
    return res.ok ? out : { success: false, message: out.message || `Error ${res.status}` }
  } catch {
    return { success: false, message: 'Koneksi gagal' }
  }
}

export async function getAbsen(kelasId: string): Promise<GetAbsenResponse> {
  const params = new URLSearchParams({ kelas_id: kelasId })
  const base = getBaseUrl() + '/absen?' + params.toString()
  try {
    const res = await fetch(base, { method: 'GET', headers: { Accept: 'application/json' } })
    if (!res.ok) {
      const out = (await res.json()) as GetAbsenResponse
      return { success: false, message: out.message || `Error ${res.status}`, data: [] }
    }
    return (await res.json()) as GetAbsenResponse
  } catch {
    return { success: false, message: 'Koneksi gagal', data: [] }
  }
}

export async function getAbsenRekap(
  kelasId: string,
  tanggalAwal: string,
  tanggalAkhir: string
): Promise<GetAbsenRekapResponse> {
  const params = new URLSearchParams({
    kelas_id: kelasId,
    tanggal_awal: tanggalAwal,
    tanggal_akhir: tanggalAkhir,
  })
  const base = getBaseUrl() + '/absen/rekap?' + params.toString()
  try {
    const res = await fetch(base, { method: 'GET', headers: { Accept: 'application/json' } })
    if (!res.ok) {
      const out = (await res.json()) as GetAbsenRekapResponse
      return { success: false, message: out.message || `Error ${res.status}`, data: [] }
    }
    return (await res.json()) as GetAbsenRekapResponse
  } catch {
    return { success: false, message: 'Koneksi gagal', data: [] }
  }
}

export async function getAbsenRekapPublishOccupied(
  kelasId: string,
  akses: string,
  excludeId?: string
): Promise<{ success: boolean; message?: string; data: string[] }> {
  const params = new URLSearchParams({ kelas_id: kelasId, akses })
  if (excludeId) params.set('exclude_id', excludeId)
  const base = getBaseUrl() + '/absen/rekap/publish/occupied?' + params.toString()
  try {
    const res = await fetch(base, { method: 'GET', headers: { Accept: 'application/json' } })
    const out = (await res.json()) as { success: boolean; message?: string; data?: string[] }
    if (!res.ok) return { success: false, message: out.message || `Error ${res.status}`, data: [] }
    return { success: true, data: out.data || [] }
  } catch {
    return { success: false, message: 'Koneksi gagal', data: [] }
  }
}

export async function listAbsenRekapPublish(
  akses: string,
  kelasId?: string
): Promise<{ success: boolean; message?: string; data: AbsenRekapPublishRow[] }> {
  const params = new URLSearchParams({ akses })
  if (kelasId) params.set('kelas_id', kelasId)
  const base = getBaseUrl() + '/absen/rekap/publish?' + params.toString()
  try {
    const res = await fetch(base, { method: 'GET', headers: { Accept: 'application/json' } })
    const out = (await res.json()) as { success: boolean; message?: string; data?: AbsenRekapPublishRow[] }
    if (!res.ok) return { success: false, message: out.message || `Error ${res.status}`, data: [] }
    return { success: true, data: out.data || [] }
  } catch {
    return { success: false, message: 'Koneksi gagal', data: [] }
  }
}

export async function getAbsenRekapPublish(
  id: string,
  akses: string
): Promise<{
  success: boolean
  message?: string
  data?: AbsenRekapPublishRow
  baris?: AbsenRekapPublishBaris[]
  meta?: { locked?: boolean; publish_at?: string; seconds_until?: number }
}> {
  const params = new URLSearchParams({ akses })
  const base = getBaseUrl() + '/absen/rekap/publish/' + encodeURIComponent(id) + '?' + params.toString()
  try {
    const res = await fetch(base, { method: 'GET', headers: { Accept: 'application/json' } })
    const out = (await res.json()) as {
      success: boolean
      message?: string
      data?: AbsenRekapPublishRow
      baris?: AbsenRekapPublishBaris[]
      meta?: { locked?: boolean; publish_at?: string; seconds_until?: number }
    }
    if (!res.ok) return { success: false, message: out.message || `Error ${res.status}` }
    return out
  } catch {
    return { success: false, message: 'Koneksi gagal' }
  }
}

export async function createAbsenRekapPublish(
  payload: AbsenRekapPublishPayload
): Promise<{ success: boolean; message?: string; data?: { id: number }; occupied?: string[] }> {
  const base = getBaseUrl() + '/absen/rekap/publish'
  try {
    const res = await fetch(base, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const out = (await res.json()) as {
      success: boolean
      message?: string
      data?: { id: number }
      occupied?: string[]
    }
    return res.ok ? out : { success: false, message: out.message || `Error ${res.status}`, occupied: out.occupied }
  } catch {
    return { success: false, message: 'Koneksi gagal' }
  }
}

export async function updateAbsenRekapPublish(
  id: string,
  payload: AbsenRekapPublishPayload
): Promise<{ success: boolean; message?: string; occupied?: string[] }> {
  const base = getBaseUrl() + '/absen/rekap/publish/' + encodeURIComponent(id)
  try {
    const res = await fetch(base, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const out = (await res.json()) as { success: boolean; message?: string; occupied?: string[] }
    return res.ok ? out : { success: false, message: out.message || `Error ${res.status}`, occupied: out.occupied }
  } catch {
    return { success: false, message: 'Koneksi gagal' }
  }
}

export async function deleteAbsenRekapPublish(
  id: string,
  akses: string
): Promise<{ success: boolean; message?: string }> {
  const params = new URLSearchParams({ akses })
  const base = getBaseUrl() + '/absen/rekap/publish/' + encodeURIComponent(id) + '?' + params.toString()
  try {
    const res = await fetch(base, { method: 'DELETE', headers: { Accept: 'application/json' } })
    const out = (await res.json()) as { success: boolean; message?: string }
    return res.ok ? out : { success: false, message: out.message || `Error ${res.status}` }
  } catch {
    return { success: false, message: 'Koneksi gagal' }
  }
}

export interface AbsenGuruRekapPublishBaris {
  id?: string | number
  pengurus_id: string
  pengurus_nama: string
  mengajar: number
  ijin: number
  sakit: number
  jam1_mengajar: number
  jam1_ijin: number
  jam1_sakit: number
  jam2_mengajar: number
  jam2_ijin: number
  jam2_sakit: number
  urutan?: number
}

export interface AbsenGuruRekapPublishRow {
  id: string
  judul: string
  catatan?: string | null
  tanggal_awal: string
  tanggal_akhir: string
  hijri_awal?: string | null
  hijri_akhir?: string | null
  publish_at: string
  published_by?: string | null
  publisher_nama?: string | null
  semua_kelas?: boolean
  kelas_ids?: string[]
  kelas_labels?: string[]
  kelas_label?: string
  created_at?: string | null
  updated_at?: string | null
  is_live?: boolean
  seconds_until?: number
  can_view_content?: boolean
}

export interface AbsenGuruRekapPublishPayload {
  judul: string
  catatan?: string
  kelas_ids?: string[]
  semua_kelas?: boolean
  tanggal_awal: string
  tanggal_akhir: string
  hijri_awal?: string
  hijri_akhir?: string
  publish_at: string
  published_by?: string
  akses?: string
  baris: AbsenGuruRekapPublishBaris[]
}

export function absenGuruRekapRowsToPublishBaris(rows: AbsenGuruRekapRow[]): AbsenGuruRekapPublishBaris[] {
  return rows.map((row, index) => {
    const total = row.total ?? {
      mengajar: (row.jam_1?.mengajar ?? 0) + (row.jam_2?.mengajar ?? 0),
      ijin: (row.jam_1?.ijin ?? 0) + (row.jam_2?.ijin ?? 0),
      sakit: (row.jam_1?.sakit ?? 0) + (row.jam_2?.sakit ?? 0),
    }
    return {
      pengurus_id: String(row.pengurus_id),
      pengurus_nama: row.pengurus_nama,
      mengajar: total.mengajar,
      ijin: total.ijin,
      sakit: total.sakit,
      jam1_mengajar: row.jam_1?.mengajar ?? 0,
      jam1_ijin: row.jam_1?.ijin ?? 0,
      jam1_sakit: row.jam_1?.sakit ?? 0,
      jam2_mengajar: row.jam_2?.mengajar ?? 0,
      jam2_ijin: row.jam_2?.ijin ?? 0,
      jam2_sakit: row.jam_2?.sakit ?? 0,
      urutan: index + 1,
    }
  })
}

export async function getAbsenGuruRekapPublishOccupied(
  akses: string,
  kelasIds?: string[],
  excludeId?: string
): Promise<{ success: boolean; message?: string; data: string[] }> {
  const params = new URLSearchParams({ akses })
  if (kelasIds?.length) params.set('kelas_ids', kelasIds.join(','))
  if (excludeId) params.set('exclude_id', excludeId)
  const base = getBaseUrl() + '/absen/jurnal/rekap-absen-guru/publish/occupied?' + params.toString()
  try {
    const res = await fetch(base, { method: 'GET', headers: { Accept: 'application/json' } })
    const out = (await res.json()) as { success: boolean; message?: string; data?: string[] }
    if (!res.ok) return { success: false, message: out.message || `Error ${res.status}`, data: [] }
    return { success: true, data: out.data || [] }
  } catch {
    return { success: false, message: 'Koneksi gagal', data: [] }
  }
}

export async function listAbsenGuruRekapPublish(
  akses: string
): Promise<{ success: boolean; message?: string; data: AbsenGuruRekapPublishRow[] }> {
  const params = new URLSearchParams({ akses })
  const base = getBaseUrl() + '/absen/jurnal/rekap-absen-guru/publish?' + params.toString()
  try {
    const res = await fetch(base, { method: 'GET', headers: { Accept: 'application/json' } })
    const out = (await res.json()) as { success: boolean; message?: string; data?: AbsenGuruRekapPublishRow[] }
    if (!res.ok) return { success: false, message: out.message || `Error ${res.status}`, data: [] }
    return { success: true, data: out.data || [] }
  } catch {
    return { success: false, message: 'Koneksi gagal', data: [] }
  }
}

export async function getAbsenGuruRekapPublish(
  id: string,
  akses: string
): Promise<{
  success: boolean
  message?: string
  data?: AbsenGuruRekapPublishRow
  baris?: AbsenGuruRekapPublishBaris[]
  meta?: { locked?: boolean; publish_at?: string; seconds_until?: number }
}> {
  const params = new URLSearchParams({ akses })
  const base =
    getBaseUrl() + '/absen/jurnal/rekap-absen-guru/publish/' + encodeURIComponent(id) + '?' + params.toString()
  try {
    const res = await fetch(base, { method: 'GET', headers: { Accept: 'application/json' } })
    const out = (await res.json()) as {
      success: boolean
      message?: string
      data?: AbsenGuruRekapPublishRow
      baris?: AbsenGuruRekapPublishBaris[]
      meta?: { locked?: boolean; publish_at?: string; seconds_until?: number }
    }
    if (!res.ok) return { success: false, message: out.message || `Error ${res.status}` }
    return out
  } catch {
    return { success: false, message: 'Koneksi gagal' }
  }
}

export async function createAbsenGuruRekapPublish(
  payload: AbsenGuruRekapPublishPayload
): Promise<{ success: boolean; message?: string; data?: { id: number }; occupied?: string[] }> {
  const base = getBaseUrl() + '/absen/jurnal/rekap-absen-guru/publish'
  try {
    const res = await fetch(base, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const out = (await res.json()) as {
      success: boolean
      message?: string
      data?: { id: number }
      occupied?: string[]
    }
    return res.ok ? out : { success: false, message: out.message || `Error ${res.status}`, occupied: out.occupied }
  } catch {
    return { success: false, message: 'Koneksi gagal' }
  }
}

export async function updateAbsenGuruRekapPublish(
  id: string,
  payload: AbsenGuruRekapPublishPayload
): Promise<{ success: boolean; message?: string; occupied?: string[] }> {
  const base = getBaseUrl() + '/absen/jurnal/rekap-absen-guru/publish/' + encodeURIComponent(id)
  try {
    const res = await fetch(base, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const out = (await res.json()) as { success: boolean; message?: string; occupied?: string[] }
    return res.ok ? out : { success: false, message: out.message || `Error ${res.status}`, occupied: out.occupied }
  } catch {
    return { success: false, message: 'Koneksi gagal' }
  }
}

export async function deleteAbsenGuruRekapPublish(
  id: string,
  akses: string
): Promise<{ success: boolean; message?: string }> {
  const params = new URLSearchParams({ akses })
  const base =
    getBaseUrl() + '/absen/jurnal/rekap-absen-guru/publish/' + encodeURIComponent(id) + '?' + params.toString()
  try {
    const res = await fetch(base, { method: 'DELETE', headers: { Accept: 'application/json' } })
    const out = (await res.json()) as { success: boolean; message?: string }
    return res.ok ? out : { success: false, message: out.message || `Error ${res.status}` }
  } catch {
    return { success: false, message: 'Koneksi gagal' }
  }
}

export type JadwalHari = 'senin' | 'selasa' | 'rabu' | 'kamis' | 'jumat' | 'sabtu' | 'ahad'

export interface JadwalRow {
  id: string
  kelas_id: string
  mapel_id: string
  pengurus_id: string
  hari: JadwalHari | string
  jam_dari: string
  jam_sampai: string
  ket_jam: number
  aktif: boolean
  nama_kelas?: string | null
  kel?: string | null
  pengurus_nama?: string | null
  pengurus_nip?: string | null
  mapel_fan?: string | null
  mapel_kitab?: string | null
  mapel_musonnif?: string | null
  mapel_dari?: string | null
  mapel_sampai?: string | null
  created_at?: string | null
  updated_at?: string | null
}

export interface JadwalListFilters {
  akses: string
  kelas_id?: string
  mapel_id?: string
  pengurus_id?: string
  hari?: string
  aktif?: 'all' | '1' | '0'
}

export interface JadwalPayload {
  kelas_id: string
  mapel_id: string
  pengurus_id: string
  hari: string
  jam_dari: string
  jam_sampai: string
  ket_jam: number
  aktif?: boolean
  akses?: string
}

export async function getJadwal(
  filters: JadwalListFilters
): Promise<{ success: boolean; message?: string; data: JadwalRow[] }> {
  const params = new URLSearchParams({ akses: filters.akses })
  if (filters.kelas_id) params.set('kelas_id', filters.kelas_id)
  if (filters.mapel_id) params.set('mapel_id', filters.mapel_id)
  if (filters.pengurus_id) params.set('pengurus_id', filters.pengurus_id)
  if (filters.hari) params.set('hari', filters.hari)
  if (filters.aktif && filters.aktif !== 'all') params.set('aktif', filters.aktif)
  const base = getBaseUrl() + '/jadwal?' + params.toString()
  try {
    const res = await fetch(base, { method: 'GET', headers: { Accept: 'application/json' } })
    const out = (await res.json()) as { success: boolean; message?: string; data?: JadwalRow[] }
    if (!res.ok) return { success: false, message: out.message || `Error ${res.status}`, data: [] }
    return { success: true, data: out.data || [] }
  } catch {
    return { success: false, message: 'Koneksi gagal', data: [] }
  }
}

export async function createJadwal(
  payload: JadwalPayload
): Promise<{ success: boolean; message?: string; data?: JadwalRow }> {
  const base = getBaseUrl() + '/jadwal'
  try {
    const res = await fetch(base, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const out = (await res.json()) as { success: boolean; message?: string; data?: JadwalRow }
    return res.ok ? out : { success: false, message: out.message || `Error ${res.status}` }
  } catch {
    return { success: false, message: 'Koneksi gagal' }
  }
}

export async function updateJadwal(
  id: string,
  payload: Partial<JadwalPayload> & { aktif?: boolean; akses?: string }
): Promise<{ success: boolean; message?: string; data?: JadwalRow }> {
  const base = getBaseUrl() + '/jadwal/' + encodeURIComponent(id)
  try {
    const res = await fetch(base, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const out = (await res.json()) as { success: boolean; message?: string; data?: JadwalRow }
    return res.ok ? out : { success: false, message: out.message || `Error ${res.status}` }
  } catch {
    return { success: false, message: 'Koneksi gagal' }
  }
}

export async function deleteJadwal(
  id: string,
  akses: string
): Promise<{ success: boolean; message?: string }> {
  const params = new URLSearchParams({ akses })
  const base = getBaseUrl() + '/jadwal/' + encodeURIComponent(id) + '?' + params.toString()
  try {
    const res = await fetch(base, { method: 'DELETE', headers: { Accept: 'application/json' } })
    const out = (await res.json()) as { success: boolean; message?: string }
    return res.ok ? out : { success: false, message: out.message || `Error ${res.status}` }
  } catch {
    return { success: false, message: 'Koneksi gagal' }
  }
}

export async function updateAbsenJam(data: {
  santri_id: string
  tanggal: string
  jam: 'jam_1' | 'jam_2'
  status: AbsenStatus
  idp?: string
}): Promise<SaveAbsenResponse> {
  const base = getBaseUrl() + '/absen/jam'
  try {
    const res = await fetch(base, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    const out = (await res.json()) as SaveAbsenResponse
    return res.ok ? out : { success: false, message: out.message || `Error ${res.status}` }
  } catch {
    return { success: false, message: 'Koneksi gagal' }
  }
}

export async function getJurnalMengajar(
  kelasId: string,
  pengurusId: string,
  akses?: string
): Promise<GetJurnalMengajarResponse> {
  const params = new URLSearchParams({
    kelas_id: kelasId,
    pengurus_id: pengurusId,
  })
  if (akses) params.set('akses', akses)
  const base = getBaseUrl() + '/absen/jurnal?' + params.toString()
  try {
    const res = await fetch(base, { method: 'GET', headers: { Accept: 'application/json' } })
    const out = (await res.json()) as GetJurnalMengajarResponse
    if (!res.ok) return { success: false, message: out.message || `Error ${res.status}` }
    return out
  } catch {
    return { success: false, message: 'Koneksi gagal' }
  }
}

export async function saveJurnalMengajar(data: {
  kelas_id: string
  pengurus_id: string
  jam: 'jam_1' | 'jam_2'
  status: JurnalStatus
  mapel_id?: string
  deskripsi?: string
  alasan?: string
  tanggal?: string
}): Promise<SaveJurnalMengajarResponse> {
  const base = getBaseUrl() + '/absen/jurnal'
  try {
    const res = await fetch(base, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    const out = (await res.json()) as SaveJurnalMengajarResponse
    return res.ok ? out : { success: false, message: out.message || `Error ${res.status}` }
  } catch {
    return { success: false, message: 'Koneksi gagal' }
  }
}

export async function getAbsenGuruRekap(
  tanggalAwal: string,
  tanggalAkhir: string,
  akses: string,
  kelasIds?: string | string[],
  pengurusId?: string
): Promise<GetAbsenGuruRekapResponse> {
  const params = new URLSearchParams({
    tanggal_awal: tanggalAwal,
    tanggal_akhir: tanggalAkhir,
    akses,
  })
  const ids = (Array.isArray(kelasIds) ? kelasIds : kelasIds ? [kelasIds] : []).filter(Boolean)
  if (ids.length) params.set('kelas_ids', ids.join(','))
  if (pengurusId) params.set('pengurus_id', pengurusId)
  const base = getBaseUrl() + '/absen/jurnal/rekap-absen-guru?' + params.toString()
  try {
    const res = await fetch(base, { method: 'GET', headers: { Accept: 'application/json' } })
    const out = (await res.json()) as GetAbsenGuruRekapResponse
    if (!res.ok) return { success: false, message: out.message || `Error ${res.status}`, data: [] }
    return out
  } catch {
    return { success: false, message: 'Koneksi gagal', data: [] }
  }
}

export async function getJurnalRekap(
  tanggalAwal: string,
  tanggalAkhir: string,
  akses: string,
  filters?: { kelasId?: string; pengurusId?: string }
): Promise<GetJurnalRekapResponse> {
  const params = new URLSearchParams({
    tanggal_awal: tanggalAwal,
    tanggal_akhir: tanggalAkhir,
    akses,
  })
  if (filters?.kelasId) params.set('kelas_id', filters.kelasId)
  if (filters?.pengurusId) params.set('pengurus_id', filters.pengurusId)
  const base = getBaseUrl() + '/absen/jurnal/rekap?' + params.toString()
  try {
    const res = await fetch(base, { method: 'GET', headers: { Accept: 'application/json' } })
    const out = (await res.json()) as GetJurnalRekapResponse
    if (!res.ok) return { success: false, message: out.message || `Error ${res.status}`, data: [] }
    return out
  } catch {
    return { success: false, message: 'Koneksi gagal', data: [] }
  }
}

export async function getKitab(): Promise<GetKitabResponse> {
  const base = getBaseUrl() + '/kitab'
  try {
    const res = await fetch(base, { method: 'GET', headers: { Accept: 'application/json' } })
    if (!res.ok) return { success: false, message: `Error ${res.status}`, data: [] }
    return (await res.json()) as GetKitabResponse
  } catch {
    return { success: false, message: 'Koneksi gagal', data: [] }
  }
}

export async function createKitab(data: Partial<KitabRow>): Promise<SaveKitabResponse> {
  const base = getBaseUrl() + '/kitab'
  try {
    const res = await fetch(base, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    const out = (await res.json()) as SaveKitabResponse
    return res.ok ? out : { success: false, message: out.message || `Error ${res.status}` }
  } catch {
    return { success: false, message: 'Koneksi gagal' }
  }
}

export async function updateKitab(id: string, data: Partial<KitabRow>): Promise<SaveKitabResponse> {
  const base = getBaseUrl() + '/kitab/' + id
  try {
    const res = await fetch(base, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    const out = (await res.json()) as SaveKitabResponse
    return res.ok ? out : { success: false, message: out.message || `Error ${res.status}` }
  } catch {
    return { success: false, message: 'Koneksi gagal' }
  }
}

export async function deleteKitab(id: string): Promise<SaveKitabResponse> {
  const base = getBaseUrl() + '/kitab/' + id
  try {
    const res = await fetch(base, { method: 'DELETE', headers: { Accept: 'application/json' } })
    const out = (await res.json()) as SaveKitabResponse
    return res.ok ? out : { success: false, message: out.message || `Error ${res.status}` }
  } catch {
    return { success: false, message: 'Koneksi gagal' }
  }
}

export async function getMapel(kelasId?: string): Promise<GetMapelResponse> {
  const params = kelasId ? '?' + new URLSearchParams({ kelas_id: kelasId }).toString() : ''
  const base = getBaseUrl() + '/mapel' + params
  try {
    const res = await fetch(base, { method: 'GET', headers: { Accept: 'application/json' } })
    if (!res.ok) return { success: false, message: `Error ${res.status}`, data: [] }
    return (await res.json()) as GetMapelResponse
  } catch {
    return { success: false, message: 'Koneksi gagal', data: [] }
  }
}

export async function getMapelDetail(id: string): Promise<{ success: boolean; message?: string; data?: MapelRow & { kelas_ids?: string[] } }> {
  const base = getBaseUrl() + '/mapel/' + id
  try {
    const res = await fetch(base, { method: 'GET', headers: { Accept: 'application/json' } })
    const out = (await res.json()) as { success: boolean; message?: string; data?: MapelRow & { kelas_ids?: string[] } }
    if (!res.ok) return { success: false, message: out.message || `Error ${res.status}` }
    return out
  } catch {
    return { success: false, message: 'Koneksi gagal' }
  }
}

export async function createMapel(data: Partial<MapelRow> & { kelas_ids?: string[] }): Promise<SaveMapelResponse> {
  const base = getBaseUrl() + '/mapel'
  try {
    const res = await fetch(base, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    const out = (await res.json()) as SaveMapelResponse
    return res.ok ? out : { success: false, message: out.message || `Error ${res.status}` }
  } catch {
    return { success: false, message: 'Koneksi gagal' }
  }
}

export async function updateMapel(id: string, data: Partial<MapelRow> & { kelas_ids?: string[] }): Promise<SaveMapelResponse> {
  const base = getBaseUrl() + '/mapel/' + id
  try {
    const res = await fetch(base, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    const out = (await res.json()) as SaveMapelResponse
    return res.ok ? out : { success: false, message: out.message || `Error ${res.status}` }
  } catch {
    return { success: false, message: 'Koneksi gagal' }
  }
}

export async function deleteMapel(id: string): Promise<SaveMapelResponse> {
  const base = getBaseUrl() + '/mapel/' + id
  try {
    const res = await fetch(base, { method: 'DELETE', headers: { Accept: 'application/json' } })
    const out = (await res.json()) as SaveMapelResponse
    return res.ok ? out : { success: false, message: out.message || `Error ${res.status}` }
  } catch {
    return { success: false, message: 'Koneksi gagal' }
  }
}

export async function syncKelasMapel(kelasId: string, mapelIds: string[]): Promise<SaveMapelResponse> {
  const base = getBaseUrl() + '/kelas/' + kelasId + '/mapel'
  try {
    const res = await fetch(base, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mapel_ids: mapelIds }),
    })
    const out = (await res.json()) as SaveMapelResponse
    return res.ok ? out : { success: false, message: out.message || `Error ${res.status}` }
  } catch {
    return { success: false, message: 'Koneksi gagal' }
  }
}

export async function getNilai(
  kelasId: string,
  mapelId: string,
  tanggal: string
): Promise<GetNilaiResponse> {
  const params = new URLSearchParams({
    kelas_id: kelasId,
    mapel_id: mapelId,
    tanggal,
  })
  const base = getBaseUrl() + '/nilai?' + params.toString()
  try {
    const res = await fetch(base, { method: 'GET', headers: { Accept: 'application/json' } })
    const out = (await res.json()) as GetNilaiResponse
    if (!res.ok) return { success: false, message: out.message || `Error ${res.status}`, data: [] }
    return out
  } catch {
    return { success: false, message: 'Koneksi gagal', data: [] }
  }
}

export async function getNilaiRekap(
  kelasIds: string | string[],
  tanggalAwal: string,
  tanggalAkhir: string
): Promise<GetNilaiRekapResponse> {
  const ids = (Array.isArray(kelasIds) ? kelasIds : [kelasIds]).filter(Boolean)
  const params = new URLSearchParams({
    kelas_ids: ids.join(','),
    tanggal_awal: tanggalAwal,
    tanggal_akhir: tanggalAkhir,
  })
  const base = getBaseUrl() + '/nilai/rekap?' + params.toString()
  try {
    const res = await fetch(base, { method: 'GET', headers: { Accept: 'application/json' } })
    const out = (await res.json()) as GetNilaiRekapResponse
    if (!res.ok) {
      return { success: false, message: out.message || `Error ${res.status}`, mapel: [], data: [] }
    }
    return out
  } catch {
    return { success: false, message: 'Koneksi gagal', mapel: [], data: [] }
  }
}

export interface NilaiRekapPublishRow {
  id: string
  judul: string
  catatan?: string | null
  tanggal_awal: string
  tanggal_akhir: string
  hijri_awal?: string | null
  hijri_akhir?: string | null
  tampil?: NilaiRekapTampil | string
  publish_at: string
  published_by?: string | null
  publisher_nama?: string | null
  kelas_ids?: string[]
  kelas_labels?: string[]
  kelas_label?: string
  created_at?: string | null
  updated_at?: string | null
  is_live?: boolean
  seconds_until?: number
  can_view_content?: boolean
}

export interface NilaiRekapPublishPayload {
  judul: string
  catatan?: string
  kelas_ids: string[]
  tanggal_awal: string
  tanggal_akhir: string
  hijri_awal?: string
  hijri_akhir?: string
  tampil?: NilaiRekapTampil | string
  publish_at: string
  published_by?: string
  akses?: string
  mapel: MapelRow[]
  baris: NilaiRekapRow[]
}

export async function getNilaiRekapPublishOccupied(
  akses: string,
  kelasIds: string[],
  excludeId?: string
): Promise<{ success: boolean; message?: string; data: string[] }> {
  const params = new URLSearchParams({ akses, kelas_ids: kelasIds.join(',') })
  if (excludeId) params.set('exclude_id', excludeId)
  const base = getBaseUrl() + '/nilai/rekap/publish/occupied?' + params.toString()
  try {
    const res = await fetch(base, { method: 'GET', headers: { Accept: 'application/json' } })
    const out = (await res.json()) as { success: boolean; message?: string; data?: string[] }
    if (!res.ok) return { success: false, message: out.message || `Error ${res.status}`, data: [] }
    return { success: true, data: out.data || [] }
  } catch {
    return { success: false, message: 'Koneksi gagal', data: [] }
  }
}

export async function listNilaiRekapPublish(
  akses: string
): Promise<{ success: boolean; message?: string; data: NilaiRekapPublishRow[] }> {
  const params = new URLSearchParams({ akses })
  const base = getBaseUrl() + '/nilai/rekap/publish?' + params.toString()
  try {
    const res = await fetch(base, { method: 'GET', headers: { Accept: 'application/json' } })
    const out = (await res.json()) as { success: boolean; message?: string; data?: NilaiRekapPublishRow[] }
    if (!res.ok) return { success: false, message: out.message || `Error ${res.status}`, data: [] }
    return { success: true, data: out.data || [] }
  } catch {
    return { success: false, message: 'Koneksi gagal', data: [] }
  }
}

export async function getNilaiRekapPublish(
  id: string,
  akses: string
): Promise<{
  success: boolean
  message?: string
  data?: NilaiRekapPublishRow
  mapel?: MapelRow[]
  baris?: NilaiRekapRow[]
  meta?: { locked?: boolean; publish_at?: string; seconds_until?: number }
}> {
  const params = new URLSearchParams({ akses })
  const base = getBaseUrl() + '/nilai/rekap/publish/' + encodeURIComponent(id) + '?' + params.toString()
  try {
    const res = await fetch(base, { method: 'GET', headers: { Accept: 'application/json' } })
    const out = (await res.json()) as {
      success: boolean
      message?: string
      data?: NilaiRekapPublishRow
      mapel?: MapelRow[]
      baris?: NilaiRekapRow[]
      meta?: { locked?: boolean; publish_at?: string; seconds_until?: number }
    }
    if (!res.ok) return { success: false, message: out.message || `Error ${res.status}` }
    return out
  } catch {
    return { success: false, message: 'Koneksi gagal' }
  }
}

export async function createNilaiRekapPublish(
  payload: NilaiRekapPublishPayload
): Promise<{ success: boolean; message?: string; data?: { id: number }; occupied?: string[] }> {
  const base = getBaseUrl() + '/nilai/rekap/publish'
  try {
    const res = await fetch(base, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const out = (await res.json()) as {
      success: boolean
      message?: string
      data?: { id: number }
      occupied?: string[]
    }
    return res.ok ? out : { success: false, message: out.message || `Error ${res.status}`, occupied: out.occupied }
  } catch {
    return { success: false, message: 'Koneksi gagal' }
  }
}

export async function updateNilaiRekapPublish(
  id: string,
  payload: NilaiRekapPublishPayload
): Promise<{ success: boolean; message?: string; occupied?: string[] }> {
  const base = getBaseUrl() + '/nilai/rekap/publish/' + encodeURIComponent(id)
  try {
    const res = await fetch(base, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const out = (await res.json()) as { success: boolean; message?: string; occupied?: string[] }
    return res.ok ? out : { success: false, message: out.message || `Error ${res.status}`, occupied: out.occupied }
  } catch {
    return { success: false, message: 'Koneksi gagal' }
  }
}

export async function deleteNilaiRekapPublish(
  id: string,
  akses: string
): Promise<{ success: boolean; message?: string }> {
  const params = new URLSearchParams({ akses })
  const base = getBaseUrl() + '/nilai/rekap/publish/' + encodeURIComponent(id) + '?' + params.toString()
  try {
    const res = await fetch(base, { method: 'DELETE', headers: { Accept: 'application/json' } })
    const out = (await res.json()) as { success: boolean; message?: string }
    return res.ok ? out : { success: false, message: out.message || `Error ${res.status}` }
  } catch {
    return { success: false, message: 'Koneksi gagal' }
  }
}

/** Publish gabungan nilai + absen santri */
export interface RekapPublishAbsenBaris {
  santri_id: string
  nomer_induk?: string | null
  nama: string
  kelas_id: string
  nama_kelas?: string | null
  kel?: string | null
  h: number
  s: number
  i: number
  a: number
  jam1_h: number
  jam1_s: number
  jam1_i: number
  jam1_a: number
  jam2_h: number
  jam2_s: number
  jam2_i: number
  jam2_a: number
  urutan?: number
}

export interface RekapPublishRow {
  id: string
  judul: string
  catatan?: string | null
  nilai_tanggal_awal: string
  nilai_tanggal_akhir: string
  nilai_hijri_awal?: string | null
  nilai_hijri_akhir?: string | null
  absen_tanggal_awal: string
  absen_tanggal_akhir: string
  absen_hijri_awal?: string | null
  absen_hijri_akhir?: string | null
  tampil_nilai?: NilaiRekapTampil | string
  publish_at: string
  published_by?: string | null
  publisher_nama?: string | null
  kelas_ids?: string[]
  kelas_labels?: string[]
  kelas_label?: string
  created_at?: string | null
  updated_at?: string | null
  is_live?: boolean
  seconds_until?: number
  can_view_content?: boolean
}

export interface RekapPublishPayload {
  judul: string
  catatan?: string
  kelas_ids: string[]
  nilai_tanggal_awal: string
  nilai_tanggal_akhir: string
  nilai_hijri_awal?: string
  nilai_hijri_akhir?: string
  absen_tanggal_awal: string
  absen_tanggal_akhir: string
  absen_hijri_awal?: string
  absen_hijri_akhir?: string
  tampil_nilai?: NilaiRekapTampil | string
  publish_at: string
  published_by?: string
  akses?: string
  mapel: MapelRow[]
  baris_nilai: NilaiRekapRow[]
  baris_absen: RekapPublishAbsenBaris[]
}

export function absenRekapToUnifiedBaris(
  rows: AbsenRekapRow[],
  kelasId: string,
  namaKelas?: string,
  kel?: string
): RekapPublishAbsenBaris[] {
  return absenRekapRowsToPublishBaris(rows).map((b) => ({
    ...b,
    kelas_id: kelasId,
    nama_kelas: namaKelas || null,
    kel: kel || null,
  }))
}

export async function getRekapPublishOccupied(
  akses: string,
  kelasIds: string[],
  excludeId?: string
): Promise<{ success: boolean; message?: string; data: string[] }> {
  const params = new URLSearchParams({ akses, kelas_ids: kelasIds.join(',') })
  if (excludeId) params.set('exclude_id', excludeId)
  const base = getBaseUrl() + '/rekap/publish/occupied?' + params.toString()
  try {
    const res = await fetch(base, { method: 'GET', headers: { Accept: 'application/json' } })
    const out = (await res.json()) as { success: boolean; message?: string; data?: string[] }
    if (!res.ok) return { success: false, message: out.message || `Error ${res.status}`, data: [] }
    return { success: true, data: out.data || [] }
  } catch {
    return { success: false, message: 'Koneksi gagal', data: [] }
  }
}

export async function listRekapPublish(
  akses: string
): Promise<{ success: boolean; message?: string; data: RekapPublishRow[] }> {
  const params = new URLSearchParams({ akses })
  const base = getBaseUrl() + '/rekap/publish?' + params.toString()
  try {
    const res = await fetch(base, { method: 'GET', headers: { Accept: 'application/json' } })
    const out = (await res.json()) as { success: boolean; message?: string; data?: RekapPublishRow[] }
    if (!res.ok) return { success: false, message: out.message || `Error ${res.status}`, data: [] }
    return { success: true, data: out.data || [] }
  } catch {
    return { success: false, message: 'Koneksi gagal', data: [] }
  }
}

export async function getRekapPublish(
  id: string,
  akses: string
): Promise<{
  success: boolean
  message?: string
  data?: RekapPublishRow
  mapel?: MapelRow[]
  baris_nilai?: NilaiRekapRow[]
  baris_absen?: RekapPublishAbsenBaris[]
  meta?: { locked?: boolean; publish_at?: string; seconds_until?: number }
}> {
  const params = new URLSearchParams({ akses })
  const base = getBaseUrl() + '/rekap/publish/' + encodeURIComponent(id) + '?' + params.toString()
  try {
    const res = await fetch(base, { method: 'GET', headers: { Accept: 'application/json' } })
    const out = (await res.json()) as {
      success: boolean
      message?: string
      data?: RekapPublishRow
      mapel?: MapelRow[]
      baris_nilai?: NilaiRekapRow[]
      baris_absen?: RekapPublishAbsenBaris[]
      meta?: { locked?: boolean; publish_at?: string; seconds_until?: number }
    }
    if (!res.ok) return { success: false, message: out.message || `Error ${res.status}` }
    return out
  } catch {
    return { success: false, message: 'Koneksi gagal' }
  }
}

export async function createRekapPublish(
  payload: RekapPublishPayload
): Promise<{ success: boolean; message?: string; data?: { id: number }; occupied?: string[] }> {
  const base = getBaseUrl() + '/rekap/publish'
  try {
    const res = await fetch(base, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const out = (await res.json()) as {
      success: boolean
      message?: string
      data?: { id: number }
      occupied?: string[]
    }
    return res.ok ? out : { success: false, message: out.message || `Error ${res.status}`, occupied: out.occupied }
  } catch {
    return { success: false, message: 'Koneksi gagal' }
  }
}

export async function updateRekapPublish(
  id: string,
  payload: RekapPublishPayload
): Promise<{ success: boolean; message?: string; occupied?: string[] }> {
  const base = getBaseUrl() + '/rekap/publish/' + encodeURIComponent(id)
  try {
    const res = await fetch(base, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const out = (await res.json()) as { success: boolean; message?: string; occupied?: string[] }
    return res.ok ? out : { success: false, message: out.message || `Error ${res.status}`, occupied: out.occupied }
  } catch {
    return { success: false, message: 'Koneksi gagal' }
  }
}

export async function deleteRekapPublish(
  id: string,
  akses: string
): Promise<{ success: boolean; message?: string }> {
  const params = new URLSearchParams({ akses })
  const base = getBaseUrl() + '/rekap/publish/' + encodeURIComponent(id) + '?' + params.toString()
  try {
    const res = await fetch(base, { method: 'DELETE', headers: { Accept: 'application/json' } })
    const out = (await res.json()) as { success: boolean; message?: string }
    return res.ok ? out : { success: false, message: out.message || `Error ${res.status}` }
  } catch {
    return { success: false, message: 'Koneksi gagal' }
  }
}

export async function saveNilai(data: {
  kelas_id: string
  mapel_id: string
  santri_id: string
  tanggal: string
  absen?: AbsenStatus
  nilai?: number | null
  idp?: string
}): Promise<SaveNilaiResponse> {
  const base = getBaseUrl() + '/nilai'
  try {
    const res = await fetch(base, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    const out = (await res.json()) as SaveNilaiResponse
    return res.ok ? out : { success: false, message: out.message || `Error ${res.status}` }
  } catch {
    return { success: false, message: 'Koneksi gagal' }
  }
}

export async function saveNilaiUrutan(
  kelasId: string,
  santriIds: string[]
): Promise<{ success: boolean; message?: string }> {
  const base = getBaseUrl() + '/nilai/urutan'
  try {
    const res = await fetch(base, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kelas_id: kelasId, santri_ids: santriIds }),
    })
    const out = (await res.json()) as { success: boolean; message?: string }
    return res.ok ? out : { success: false, message: out.message || `Error ${res.status}` }
  } catch {
    return { success: false, message: 'Koneksi gagal' }
  }
}

export async function ubahTanggalNilai(data: {
  kelas_id: string
  mapel_id: string
  tanggal_lama: string
  tanggal_baru: string
}): Promise<{ success: boolean; message?: string; data?: { tanggal_baru: string; updated: number } }> {
  const base = getBaseUrl() + '/nilai/ubah-tanggal'
  try {
    const res = await fetch(base, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    const out = (await res.json()) as {
      success: boolean
      message?: string
      data?: { tanggal_baru: string; updated: number }
    }
    return res.ok ? out : { success: false, message: out.message || `Error ${res.status}` }
  } catch {
    return { success: false, message: 'Koneksi gagal' }
  }
}

export async function hapusNilaiBatch(data: {
  kelas_id: string
  mapel_id: string
  tanggal: string
}): Promise<{ success: boolean; message?: string; data?: { deleted: number } }> {
  const base = getBaseUrl() + '/nilai/hapus'
  try {
    const res = await fetch(base, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    const out = (await res.json()) as {
      success: boolean
      message?: string
      data?: { deleted: number }
    }
    return res.ok ? out : { success: false, message: out.message || `Error ${res.status}` }
  } catch {
    return { success: false, message: 'Koneksi gagal' }
  }
}

export async function updatePengurus(
  id: string,
  data: { nama: string; jabatan?: string; akses: string }
): Promise<SavePengurusResponse> {
  const base = getBaseUrl() + '/pengurus/' + id
  try {
    const res = await fetch(base, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    const out = (await res.json()) as SavePengurusResponse
    return res.ok ? out : { success: false, message: out.message || `Error ${res.status}` }
  } catch {
    return { success: false, message: 'Koneksi gagal' }
  }
}

export async function resetPengurusPassword(id: string): Promise<SavePengurusResponse> {
  const base = getBaseUrl() + '/pengurus/reset-password'
  try {
    const res = await fetch(base, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    const out = (await res.json()) as SavePengurusResponse
    return res.ok ? out : { success: false, message: out.message || `Error ${res.status}` }
  } catch {
    return { success: false, message: 'Koneksi gagal' }
  }
}

export interface DashboardCounts {
  santri: number
  kelas: number
  pengurus: number
  mapel: number
}

export interface DashboardAbsenStatus {
  H: number
  S: number
  I: number
  A: number
  slot_total: number
}

export interface DashboardJurnalHariIni {
  mengajar: number
  ijin: number
  sakit: number
  total: number
}

export interface DashboardTrenAbsen extends DashboardAbsenStatus {
  tanggal: string
}

export interface DashboardPerKelas {
  kelas_id: string
  nama_kelas: string
  kel: string
  santri: number
  hadir_pct: number
}

export interface DashboardData {
  tanggal: string
  counts: DashboardCounts
  absen_hari_ini: DashboardAbsenStatus
  jurnal_hari_ini: DashboardJurnalHariIni
  tren_absen: DashboardTrenAbsen[]
  per_kelas: DashboardPerKelas[]
}

export interface GetDashboardResponse {
  success: boolean
  message?: string
  data?: DashboardData
}

export async function getDashboard(): Promise<GetDashboardResponse> {
  const base = getBaseUrl() + '/dashboard'
  try {
    const res = await fetch(base, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) return { success: false, message: `Error ${res.status}` }
    return (await res.json()) as GetDashboardResponse
  } catch {
    return { success: false, message: 'Koneksi gagal' }
  }
}

/* ========== Syahriah ========== */

export interface TahunAjaranRow {
  id: string | number
  tahun_hijri_awal: number
  label: string
  aktif: number | boolean
  created_at?: string
}

export interface SyahriahBulanMeta {
  bulan_hijri: number
  tahun_hijri: number
  urut: number
}

export interface SyahriahBulanCell extends SyahriahBulanMeta {
  wajib_id: number | null
  nominal: number | null
  terbayar: number
  sisa: number | null
}

export interface SyahriahRingkasRow {
  santri_id: string
  nomer_induk: string
  nama: string
  kelas_id: string
  nama_kelas: string
  kel?: string
  bulan: SyahriahBulanCell[]
  total_wajib: number
  total_terbayar: number
  total_sisa: number
  total_bayar: number
  saldo: number
}

export interface SyahriahBayarRow {
  id: string | number
  nominal: number
  tanggal: string
  keterangan?: string | null
  via?: string | null
  pengurus_id?: string | null
  pengurus_nama?: string | null
  created_at?: string
  alokasi?: { bayar_id?: number; nominal: number; bulan_hijri: number; tahun_hijri: number }[]
}

function withAkses(url: string, akses: string) {
  const u = new URL(url)
  u.searchParams.set('akses', akses)
  return u.toString()
}

export async function getTahunAjaran(akses: string): Promise<{ success: boolean; message?: string; data: TahunAjaranRow[] }> {
  try {
    const res = await fetch(withAkses(getBaseUrl() + '/syahriah/tahun-ajaran', akses), {
      headers: { Accept: 'application/json' },
    })
    const out = await res.json()
    if (!res.ok) return { success: false, message: out.message || `Error ${res.status}`, data: [] }
    return { success: true, data: out.data || [] }
  } catch {
    return { success: false, message: 'Koneksi gagal', data: [] }
  }
}

export async function createTahunAjaran(
  akses: string,
  data: { tahun_hijri_awal: number; label?: string; aktif?: boolean }
): Promise<{ success: boolean; message?: string; data?: TahunAjaranRow }> {
  try {
    const res = await fetch(withAkses(getBaseUrl() + '/syahriah/tahun-ajaran', akses), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(data),
    })
    return (await res.json()) as { success: boolean; message?: string; data?: TahunAjaranRow }
  } catch {
    return { success: false, message: 'Koneksi gagal' }
  }
}

export async function setTahunAjaranAktif(
  akses: string,
  id: string | number
): Promise<{ success: boolean; message?: string }> {
  try {
    const res = await fetch(withAkses(getBaseUrl() + `/syahriah/tahun-ajaran/${id}`, akses), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ aktif: true }),
    })
    return (await res.json()) as { success: boolean; message?: string }
  } catch {
    return { success: false, message: 'Koneksi gagal' }
  }
}

export async function getSyahriahBulan(
  akses: string,
  tahunAjaranId: string | number
): Promise<{ success: boolean; message?: string; data: SyahriahBulanMeta[] }> {
  try {
    const url = withAkses(getBaseUrl() + '/syahriah/bulan', akses)
    const u = new URL(url)
    u.searchParams.set('tahun_ajaran_id', String(tahunAjaranId))
    const res = await fetch(u.toString(), { headers: { Accept: 'application/json' } })
    const out = await res.json()
    if (!res.ok) return { success: false, message: out.message, data: [] }
    return { success: true, data: out.data || [] }
  } catch {
    return { success: false, message: 'Koneksi gagal', data: [] }
  }
}

export async function getSyahriahRingkas(
  akses: string,
  tahunAjaranId: string | number,
  kelasIds?: string | string[],
  santriId?: string | number
): Promise<{
  success: boolean
  message?: string
  data: SyahriahRingkasRow[]
  meta?: { tahun_ajaran: TahunAjaranRow; bulan: SyahriahBulanMeta[] }
}> {
  try {
    const url = withAkses(getBaseUrl() + '/syahriah/ringkas', akses)
    const u = new URL(url)
    u.searchParams.set('tahun_ajaran_id', String(tahunAjaranId))
    if (santriId != null && String(santriId) !== '') {
      u.searchParams.set('santri_id', String(santriId))
    } else {
      const ids = (Array.isArray(kelasIds) ? kelasIds : kelasIds ? [kelasIds] : []).filter(Boolean)
      if (ids.length) u.searchParams.set('kelas_ids', ids.join(','))
    }
    const res = await fetch(u.toString(), { headers: { Accept: 'application/json' } })
    const out = await res.json()
    if (!res.ok) return { success: false, message: out.message, data: [] }
    return { success: true, data: out.data || [], meta: out.meta }
  } catch {
    return { success: false, message: 'Koneksi gagal', data: [] }
  }
}

export async function batchSyahriahWajib(
  akses: string,
  payload: {
    tahun_ajaran_id: string | number
    santri_ids: string[]
    bulan: { bulan_hijri: number; tahun_hijri: number }[]
    nominal?: number
    nominal_per_bulan?: Record<string, number>
  }
): Promise<{ success: boolean; message?: string }> {
  try {
    const res = await fetch(withAkses(getBaseUrl() + '/syahriah/wajib/batch', akses), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
    })
    return (await res.json()) as { success: boolean; message?: string }
  } catch {
    return { success: false, message: 'Koneksi gagal' }
  }
}

export async function getSyahriahBayar(
  akses: string,
  tahunAjaranId: string | number,
  santriId: string
): Promise<{ success: boolean; message?: string; data: SyahriahBayarRow[] }> {
  try {
    const url = withAkses(getBaseUrl() + '/syahriah/bayar', akses)
    const u = new URL(url)
    u.searchParams.set('tahun_ajaran_id', String(tahunAjaranId))
    u.searchParams.set('santri_id', santriId)
    const res = await fetch(u.toString(), { headers: { Accept: 'application/json' } })
    const out = await res.json()
    if (!res.ok) return { success: false, message: out.message, data: [] }
    return { success: true, data: out.data || [] }
  } catch {
    return { success: false, message: 'Koneksi gagal', data: [] }
  }
}

export async function createSyahriahBayar(
  akses: string,
  payload: {
    tahun_ajaran_id: string | number
    santri_id: string
    nominal: number
    tanggal?: string
    keterangan?: string
    via?: 'cash' | 'tf'
    pengurus_id?: string
  }
): Promise<{ success: boolean; message?: string; data?: { bayar_id: number; alokasi: unknown[]; saldo: number } }> {
  try {
    const res = await fetch(withAkses(getBaseUrl() + '/syahriah/bayar', akses), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
    })
    return await res.json()
  } catch {
    return { success: false, message: 'Koneksi gagal' }
  }
}

export async function previewSyahriahBayar(
  akses: string,
  payload: { tahun_ajaran_id: string | number; santri_id: string; nominal: number }
): Promise<{ success: boolean; message?: string; data?: { alokasi: { bulan_hijri: number; tahun_hijri: number; nominal: number }[]; saldo: number } }> {
  try {
    const res = await fetch(withAkses(getBaseUrl() + '/syahriah/bayar/preview', akses), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
    })
    return await res.json()
  } catch {
    return { success: false, message: 'Koneksi gagal' }
  }
}

export async function deleteSyahriahBayar(
  akses: string,
  id: string | number
): Promise<{ success: boolean; message?: string }> {
  try {
    const res = await fetch(withAkses(getBaseUrl() + `/syahriah/bayar/${id}`, akses), {
      method: 'DELETE',
      headers: { Accept: 'application/json' },
    })
    return await res.json()
  } catch {
    return { success: false, message: 'Koneksi gagal' }
  }
}

export interface SyahriahKhususBayarRow {
  id: string | number
  khusus_id?: string | number
  nominal: number
  tanggal: string
  keterangan?: string | null
  via?: string | null
  pengurus_id?: string | null
  pengurus_nama?: string | null
  created_at?: string
}

export interface SyahriahKhususRow {
  id: string | number
  tahun_ajaran_id: string | number
  santri_id: string
  nama: string
  nominal: number
  terakhir_pembayaran: string
  keterangan?: string | null
  nomer_induk?: string
  nama_santri?: string
  kelas_id?: string
  nama_kelas?: string
  kel?: string
  total_bayar: number
  jumlah_bayar: number
  sisa: number
  tanggal_bayar_terakhir?: string | null
  sudah_bayar: boolean
  lunas: boolean
  bayar?: SyahriahKhususBayarRow[]
  created_at?: string
}

export async function getSyahriahKhusus(
  akses: string,
  tahunAjaranId: string | number,
  opts?: { kelasIds?: string | string[]; santriId?: string | number }
): Promise<{ success: boolean; message?: string; data: SyahriahKhususRow[] }> {
  try {
    const url = withAkses(getBaseUrl() + '/syahriah/khusus', akses)
    const u = new URL(url)
    u.searchParams.set('tahun_ajaran_id', String(tahunAjaranId))
    if (opts?.santriId != null && String(opts.santriId) !== '') {
      u.searchParams.set('santri_id', String(opts.santriId))
    } else {
      const ids = (Array.isArray(opts?.kelasIds) ? opts?.kelasIds : opts?.kelasIds ? [opts.kelasIds] : []).filter(
        Boolean
      ) as string[]
      if (ids.length) u.searchParams.set('kelas_ids', ids.join(','))
    }
    const res = await fetch(u.toString(), { headers: { Accept: 'application/json' } })
    const out = await res.json()
    if (!res.ok) return { success: false, message: out.message, data: [] }
    return { success: true, data: out.data || [] }
  } catch {
    return { success: false, message: 'Koneksi gagal', data: [] }
  }
}

export async function batchSyahriahKhusus(
  akses: string,
  payload: {
    tahun_ajaran_id: string | number
    santri_ids: string[]
    nama: string
    nominal: number
    terakhir_pembayaran: string
    keterangan?: string
  }
): Promise<{ success: boolean; message?: string }> {
  try {
    const res = await fetch(withAkses(getBaseUrl() + '/syahriah/khusus/batch', akses), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
    })
    return (await res.json()) as { success: boolean; message?: string }
  } catch {
    return { success: false, message: 'Koneksi gagal' }
  }
}

export async function deleteSyahriahKhusus(
  akses: string,
  id: string | number
): Promise<{ success: boolean; message?: string }> {
  try {
    const res = await fetch(withAkses(getBaseUrl() + `/syahriah/khusus/${id}`, akses), {
      method: 'DELETE',
      headers: { Accept: 'application/json' },
    })
    return await res.json()
  } catch {
    return { success: false, message: 'Koneksi gagal' }
  }
}

export async function batchDeleteSyahriahKhusus(
  akses: string,
  ids: Array<string | number>
): Promise<{ success: boolean; message?: string }> {
  try {
    const res = await fetch(withAkses(getBaseUrl() + '/syahriah/khusus/batch-delete', akses), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ ids }),
    })
    return (await res.json()) as { success: boolean; message?: string }
  } catch {
    return { success: false, message: 'Koneksi gagal' }
  }
}

export async function batchUpdateSyahriahKhusus(
  akses: string,
  payload: {
    ids: Array<string | number>
    nama?: string
    nominal?: number
    terakhir_pembayaran?: string
    keterangan?: string | null
  }
): Promise<{ success: boolean; message?: string }> {
  try {
    const res = await fetch(withAkses(getBaseUrl() + '/syahriah/khusus/batch-update', akses), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
    })
    return (await res.json()) as { success: boolean; message?: string }
  } catch {
    return { success: false, message: 'Koneksi gagal' }
  }
}

export async function createSyahriahKhususBayar(
  akses: string,
  payload: {
    khusus_id: string | number
    nominal: number
    tanggal?: string
    keterangan?: string
    via?: 'cash' | 'tf'
    pengurus_id?: string
  }
): Promise<{ success: boolean; message?: string; data?: { bayar_id: number } }> {
  try {
    const res = await fetch(withAkses(getBaseUrl() + '/syahriah/khusus/bayar', akses), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
    })
    return await res.json()
  } catch {
    return { success: false, message: 'Koneksi gagal' }
  }
}

export async function deleteSyahriahKhususBayar(
  akses: string,
  id: string | number
): Promise<{ success: boolean; message?: string }> {
  try {
    const res = await fetch(withAkses(getBaseUrl() + `/syahriah/khusus/bayar/${id}`, akses), {
      method: 'DELETE',
      headers: { Accept: 'application/json' },
    })
    return await res.json()
  } catch {
    return { success: false, message: 'Koneksi gagal' }
  }
}
