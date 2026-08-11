import { pengaturanAPI } from '../services/api'

const PSB_TA_CACHE_KEY = 'ebeddien_psb_tahun_ajaran_default'

function parsePengaturanArray(response) {
  if (!response) return []
  if (response.success === true && Array.isArray(response.data)) return response.data
  if (Array.isArray(response)) return response
  if (Array.isArray(response.data)) return response.data
  return []
}

/** Baca cache lokal default PSB (sinkron, untuk inisialisasi UI). */
export function getCachedPsbDefaultTahunAjaran() {
  if (typeof window === 'undefined') return { hijriyah: '', masehi: '' }
  try {
    const raw = localStorage.getItem(PSB_TA_CACHE_KEY)
    if (!raw) return { hijriyah: '', masehi: '' }
    const o = JSON.parse(raw)
    return {
      hijriyah: String(o?.hijriyah || '').trim(),
      masehi: String(o?.masehi || '').trim()
    }
  } catch {
    return { hijriyah: '', masehi: '' }
  }
}

/** Simpan default PSB ke cache lokal setelah berhasil dibaca dari pengaturan. */
export function cachePsbDefaultTahunAjaran(hijriyah, masehi) {
  if (typeof window === 'undefined') return
  const h = String(hijriyah || '').trim()
  const m = String(masehi || '').trim()
  if (!h && !m) return
  try {
    localStorage.setItem(PSB_TA_CACHE_KEY, JSON.stringify({ hijriyah: h, masehi: m }))
  } catch {
    /* quota / private mode */
  }
}

/**
 * Default tahun ajaran PSB dari pengaturan (key tahun_hijriyah & tahun_masehi),
 * selaras aplikasi daftar.
 */
export async function fetchDefaultTahunAjaranFromPengaturan() {
  try {
    const response = await pengaturanAPI.getAll()
    const data = parsePengaturanArray(response)
    let hijriyah = ''
    let masehi = ''
    for (const setting of data) {
      if (!setting?.key) continue
      if (setting.key === 'tahun_hijriyah') {
        hijriyah = String(setting.value || '').trim()
      } else if (setting.key === 'tahun_masehi') {
        masehi = String(setting.value || '').trim()
      }
    }
    if (hijriyah || masehi) {
      cachePsbDefaultTahunAjaran(hijriyah, masehi)
      return { hijriyah, masehi }
    }
    return getCachedPsbDefaultTahunAjaran()
  } catch {
    return getCachedPsbDefaultTahunAjaran()
  }
}
