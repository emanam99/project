import { getApiBaseUrl } from './apiClient'
import {
  ensureKalenderMonthsLoaded,
  getMonthsForHijriYear,
} from '../pages/Kalender/utils/kalenderLocalStore'
import {
  hijriToMasehiLocal,
  masehiToHijriLocal,
  convertRangeLocal,
} from '../pages/Kalender/utils/kalenderLocalConvert'
import { getConvertCache, setConvertCache, getYearCache, setYearCache } from '../pages/Kalender/utils/kalenderCache'

export interface KalenderToday {
  masehi: string
  hijriyah: string
  waktu: string
}

export interface KalenderMonthRow {
  id: string
  tahun: number
  id_bulan: string
  mulai: string
  akhir: string
  mulai_adj?: string
  akhir_adj?: string
}

export type KalenderGetParams = {
  action?: 'today' | 'year' | 'convert' | 'convert_range' | 'to_masehi' | 'all'
  tahun?: number | string
  tanggal?: string
  tanggal_awal?: string
  tanggal_akhir?: string
  waktu?: string
}

export interface KalenderConvert {
  masehi: string
  hijriyah: string
  waktu: string
}

export interface KalenderToMasehi {
  hijriyah: string
  masehi: string | null
  error?: string
}

/** Kalender via API mdtwustha (proxy ke api.alutsmani.id) — hindari CORS cross-domain. */
const getKalenderApiUrl = (): string => getApiBaseUrl() + '/kalender'

export async function kalenderGet(params: KalenderGetParams = {}): Promise<unknown> {
  const q = new URLSearchParams()
  if (params.action) q.set('action', params.action)
  if (params.tahun != null) q.set('tahun', String(params.tahun))
  if (params.tanggal) q.set('tanggal', params.tanggal)
  if (params.tanggal_awal) q.set('tanggal_awal', params.tanggal_awal)
  if (params.tanggal_akhir) q.set('tanggal_akhir', params.tanggal_akhir)
  if (params.waktu) q.set('waktu', params.waktu)

  const base = getKalenderApiUrl()
  const url = q.toString() ? `${base}?${q.toString()}` : base
  const res = await fetch(url, { method: 'GET', headers: { Accept: 'application/json' } })
  if (!res.ok) {
    throw new Error(`Kalender API error ${res.status}`)
  }
  return res.json()
}

async function ensureMonths() {
  return ensureKalenderMonthsLoaded(() => kalenderGet({ action: 'all' }))
}

/** Prefetch data bulan ke localStorage (panggil saat app start). */
export function prefetchKalenderMonths(): void {
  if (typeof window === 'undefined') return
  void ensureMonths().catch(() => {})
}

/**
 * Konversi Masehi → Hijriyah.
 * Utama: hitung lokal dari data bulan tersimpan. Fallback: server.
 * `waktu` ≥ 17:30 → tanggal Hijriyah +1 (Maghrib).
 */
export async function kalenderConvert(tanggal: string, waktu?: string): Promise<KalenderConvert> {
  const w = waktu ?? new Date().toTimeString().slice(0, 8)
  const ymd = tanggal.slice(0, 10)
  const isNoonConvert = w.startsWith('12:')

  if (isNoonConvert) {
    const cached = getConvertCache(ymd)
    if (cached) return { masehi: ymd, hijriyah: cached, waktu: w }
  }

  try {
    await ensureMonths()
    const local = masehiToHijriLocal(ymd, w)
    if (local) {
      if (isNoonConvert) setConvertCache(ymd, local)
      return { masehi: ymd, hijriyah: local, waktu: w }
    }
  } catch {
    /* lanjut fallback */
  }

  const remote = (await kalenderGet({ action: 'convert', tanggal: ymd, waktu: w })) as KalenderConvert
  if (remote?.hijriyah && remote.hijriyah !== '0000-00-00' && isNoonConvert) {
    setConvertCache(ymd, remote.hijriyah.slice(0, 10))
  }
  return remote
}


/** Konversi Hijriyah → Masehi (lokal dulu, lalu server). */
export async function kalenderToMasehi(hijriyah: string): Promise<KalenderToMasehi> {
  const h = hijriyah.slice(0, 10)
  try {
    await ensureMonths()
    const local = hijriToMasehiLocal(h)
    if (local) return { hijriyah: h, masehi: local }
  } catch {
    /* fallback */
  }

  try {
    return (await kalenderGet({ action: 'to_masehi', tanggal: h })) as KalenderToMasehi
  } catch (e) {
    return {
      hijriyah: h,
      masehi: null,
      error: e instanceof Error ? e.message : 'Konversi gagal',
    }
  }
}

/** Range Masehi→Hijri untuk tampilan kalender (lokal, tanpa round-trip per hari). */
export async function kalenderConvertRange(
  tanggalAwal: string,
  tanggalAkhir: string
): Promise<Record<string, string>> {
  try {
    await ensureMonths()
    const local = convertRangeLocal(tanggalAwal, tanggalAkhir)
    if (Object.keys(local).length > 0) {
      Object.entries(local).forEach(([m, h]) => setConvertCache(m, h))
      return local
    }
  } catch {
    /* fallback */
  }

  const res = await kalenderGet({
    action: 'convert_range',
    tanggal_awal: tanggalAwal,
    tanggal_akhir: tanggalAkhir,
  })
  const data =
    res && typeof res === 'object' && 'data' in res && typeof (res as { data: unknown }).data === 'object'
      ? ((res as { data: Record<string, string> }).data ?? {})
      : {}
  Object.entries(data).forEach(([m, h]) => {
    if (h && h !== '0000-00-00') setConvertCache(m, h)
  })
  return data
}

/** Ambil data tahun Hijriyah dari store lokal bila ada. */
export function getKalenderYearLocal(tahun: number): KalenderMonthRow[] | null {
  const mem = getYearCache(tahun)
  if (mem?.length) return mem
  const fromAll = getMonthsForHijriYear(tahun)
  if (fromAll.length) {
    setYearCache(tahun, fromAll)
    return fromAll
  }
  return null
}
