/**
 * Koneksi langsung ke Google Apps Script (Google Sheet).
 * URL Web App ada di bawah; ganti jika deploy script ke URL lain.
 * Pakai Content-Type: text/plain agar browser tidak kirim preflight OPTIONS
 * (GAS tidak menangani OPTIONS), sehingga POST langsung ke doPost dan berjalan di GitHub Pages.
 */

const APPSCRIPT_URL =
  'https://script.google.com/macros/s/AKfycbwC3qicZl-f6-li_94_PSNnzM-K-rTA1uoeeqHkN9qiUmbD-XFfd-oMFXgqGr_XCssYdw/exec'

const getBaseUrl = (): string => APPSCRIPT_URL.replace(/\/$/, '')

export interface LoginPayload {
  nip: string
  password: string
}

export interface LoginResponse {
  success: boolean
  message?: string
  firstLogin?: boolean
  user?: { id: string; nip?: string; name?: string; jabatan?: string }
}

export interface SantriRow {
  id: string
  nomer_induk: string
  nama: string
  kelas: string
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

/**
 * Verifikasi login via Google Apps Script.
 * Apps Script harus expose doPost(e) dan menerima JSON: { action: 'login', nip, password }
 * serta mengembalikan JSON: { success: true/false, message?, user? }
 */
export async function loginWithSheet(payload: LoginPayload): Promise<LoginResponse> {
  const base = getBaseUrl()
  const res = await fetch(base, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({
      action: 'login',
      nip: payload.nip,
      password: payload.password,
    }),
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

/**
 * Ambil data santri dari Google Sheet via Apps Script.
 */
export async function getSantriFromSheet(): Promise<GetSantriResponse> {
  const base = getBaseUrl()
  try {
    const res = await fetch(base, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'getSantri' }),
    })
    if (!res.ok) return { success: false, message: `Error ${res.status}`, data: [] }
    return (await res.json()) as GetSantriResponse
  } catch {
    return { success: false, message: 'Koneksi gagal', data: [] }
  }
}

/** Tambah santri baru ke sheet */
export async function createSantriFromSheet(data: Partial<SantriRow>): Promise<SaveSantriResponse> {
  const base = getBaseUrl()
  try {
    const res = await fetch(base, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'createSantri', data }),
    })
    const out = (await res.json()) as SaveSantriResponse
    return res.ok ? out : { success: false, message: out.message || `Error ${res.status}` }
  } catch {
    return { success: false, message: 'Koneksi gagal' }
  }
}

/** Update santri (cari by id atau nomer_induk) */
export async function updateSantriFromSheet(data: Partial<SantriRow>): Promise<SaveSantriResponse> {
  const base = getBaseUrl()
  try {
    const res = await fetch(base, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'updateSantri', data }),
    })
    const out = (await res.json()) as SaveSantriResponse
    return res.ok ? out : { success: false, message: out.message || `Error ${res.status}` }
  } catch {
    return { success: false, message: 'Koneksi gagal' }
  }
}
