const KEY = 'wifi_jatuh_tempo_hari'
const DEFAULT_DAY = 10

export function getJatuhTempoHari(): number {
  try {
    const raw = localStorage.getItem(KEY)
    const n = Number(raw)
    if (Number.isInteger(n) && n >= 1 && n <= 31) return n
  } catch {
    /* ignore */
  }
  return DEFAULT_DAY
}

export function setJatuhTempoHari(day: number): void {
  const n = Math.min(31, Math.max(1, Math.round(day)))
  localStorage.setItem(KEY, String(n))
}

/** Tanggal jatuh tempo YYYY-MM-DD dari periode + hari di pengaturan. */
export function computeJatuhTempo(bulan: number, tahun: number, hari?: number): string {
  const dayWanted = hari ?? getJatuhTempoHari()
  const last = new Date(tahun, bulan, 0).getDate()
  const day = Math.min(dayWanted, last)
  const m = String(bulan).padStart(2, '0')
  const d = String(day).padStart(2, '0')
  return `${tahun}-${m}-${d}`
}

export function labelPeriode(bulan: number, tahun: number): string {
  const names = [
    '',
    'Januari',
    'Februari',
    'Maret',
    'April',
    'Mei',
    'Juni',
    'Juli',
    'Agustus',
    'September',
    'Oktober',
    'November',
    'Desember',
  ]
  return `${names[bulan] || bulan} ${tahun}`
}
