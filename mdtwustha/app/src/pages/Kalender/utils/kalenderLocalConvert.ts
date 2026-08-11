import type { KalenderMonthRow } from '../../../api/kalenderApi'
import { getKalenderMonthsSync } from './kalenderLocalStore'

const MAGHRIB_HOUR = 17
const MAGHRIB_MINUTE = 30

function parseYmd(ymd: string): { y: number; m: number; d: number } | null {
  const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return null
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) }
}

function formatYmd(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function toUtcDate(ymd: string): Date | null {
  const p = parseYmd(ymd)
  if (!p) return null
  return new Date(Date.UTC(p.y, p.m - 1, p.d))
}

function fromUtcDate(dt: Date): string {
  return formatYmd(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate())
}

export function addDaysYmd(ymd: string, days: number): string | null {
  const dt = toUtcDate(ymd)
  if (!dt) return null
  dt.setUTCDate(dt.getUTCDate() + days)
  return fromUtcDate(dt)
}

export function daysBetweenYmd(awal: string, akhir: string): number | null {
  const a = toUtcDate(awal)
  const b = toUtcDate(akhir)
  if (!a || !b) return null
  return Math.round((b.getTime() - a.getTime()) / 86400000)
}

export function isAfterMaghrib(waktu?: string): boolean {
  if (!waktu) return false
  const m = waktu.match(/^(\d{1,2}):(\d{2})/)
  if (!m) return false
  const h = Number(m[1])
  const min = Number(m[2])
  if (Number.isNaN(h) || Number.isNaN(min)) return false
  return h > MAGHRIB_HOUR || (h === MAGHRIB_HOUR && min >= MAGHRIB_MINUTE)
}

function monthStart(row: KalenderMonthRow): string {
  return (row.mulai_adj || row.mulai || '').slice(0, 10)
}

function monthEnd(row: KalenderMonthRow): string {
  return (row.akhir_adj || row.akhir || '').slice(0, 10)
}

function findMonthForHijri(hijriYmd: string, months: KalenderMonthRow[]): KalenderMonthRow | null {
  const p = parseYmd(hijriYmd)
  if (!p) return null
  return (
    months.find((row) => Number(row.tahun) === p.y && Number(row.id_bulan) === p.m) ?? null
  )
}

function findMonthForMasehi(masehiYmd: string, months: KalenderMonthRow[]): KalenderMonthRow | null {
  return (
    months.find((row) => {
      const mulai = monthStart(row)
      const akhir = monthEnd(row)
      return mulai && akhir && masehiYmd >= mulai && masehiYmd <= akhir
    }) ?? null
  )
}

/** Hijriyah YYYY-MM-DD → Masehi (dari data bulan lokal). */
export function hijriToMasehiLocal(
  hijriYmd: string,
  months: KalenderMonthRow[] = getKalenderMonthsSync()
): string | null {
  const p = parseYmd(hijriYmd)
  if (!p || p.d < 1 || p.d > 30) return null
  const row = findMonthForHijri(hijriYmd.slice(0, 10), months)
  if (!row) return null
  const mulai = monthStart(row)
  if (!mulai) return null
  const masehi = addDaysYmd(mulai, p.d - 1)
  if (!masehi) return null
  const akhir = monthEnd(row)
  if (akhir && masehi > akhir) return null
  return masehi
}

/**
 * Masehi YYYY-MM-DD → Hijriyah.
 * Jika `waktu` ≥ 17:30, tanggal Hijriyah bergeser +1 hari (aturan Maghrib).
 */
export function masehiToHijriLocal(
  masehiYmd: string,
  waktu?: string,
  months: KalenderMonthRow[] = getKalenderMonthsSync()
): string | null {
  let lookup = masehiYmd.slice(0, 10)
  if (isAfterMaghrib(waktu)) {
    const next = addDaysYmd(lookup, 1)
    if (next) lookup = next
  }
  const row = findMonthForMasehi(lookup, months)
  if (!row) return null
  const mulai = monthStart(row)
  if (!mulai) return null
  const offset = daysBetweenYmd(mulai, lookup)
  if (offset == null || offset < 0) return null
  const day = offset + 1
  const tahun = Number(row.tahun)
  const bulan = Number(row.id_bulan)
  if (!tahun || !bulan || day < 1 || day > 30) return null
  return formatYmd(tahun, bulan, day)
}

export function convertRangeLocal(
  tanggalAwal: string,
  tanggalAkhir: string,
  months: KalenderMonthRow[] = getKalenderMonthsSync()
): Record<string, string> {
  const out: Record<string, string> = {}
  let cur = tanggalAwal.slice(0, 10)
  const end = tanggalAkhir.slice(0, 10)
  if (!cur || !end || cur > end) return out
  let guard = 0
  while (cur <= end && guard < 400) {
    const h = masehiToHijriLocal(cur, '12:00:00', months)
    if (h) out[cur] = h
    const next = addDaysYmd(cur, 1)
    if (!next) break
    cur = next
    guard += 1
  }
  return out
}
