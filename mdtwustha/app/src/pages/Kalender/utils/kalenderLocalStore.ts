import type { KalenderMonthRow } from '../../../api/kalenderApi'

const KEY_MONTHS = 'mdtwustha_kalender_months_v1'
const KEY_META = 'mdtwustha_kalender_months_meta_v1'
/** Refresh data pusat maksimal tiap 7 hari. */
const REFRESH_MS = 7 * 24 * 60 * 60 * 1000

let memoryMonths: KalenderMonthRow[] | null = null
let loadPromise: Promise<KalenderMonthRow[]> | null = null
let backgroundRefreshStarted = false

type MonthsMeta = { savedAt: number; count: number }

function readMeta(): MonthsMeta | null {
  try {
    const raw = localStorage.getItem(KEY_META)
    if (!raw) return null
    return JSON.parse(raw) as MonthsMeta
  } catch {
    return null
  }
}

function writeMeta(count: number) {
  try {
    localStorage.setItem(KEY_META, JSON.stringify({ savedAt: Date.now(), count }))
  } catch {
    /* quota */
  }
}

export function loadKalenderMonthsFromStorage(): KalenderMonthRow[] | null {
  if (memoryMonths?.length) return memoryMonths
  try {
    const raw = localStorage.getItem(KEY_MONTHS)
    if (!raw) return null
    const parsed = JSON.parse(raw) as KalenderMonthRow[]
    if (!Array.isArray(parsed) || parsed.length === 0) return null
    memoryMonths = parsed
    return parsed
  } catch {
    return null
  }
}

export function saveKalenderMonthsToStorage(months: KalenderMonthRow[]) {
  if (!Array.isArray(months) || months.length === 0) return
  memoryMonths = months
  try {
    localStorage.setItem(KEY_MONTHS, JSON.stringify(months))
    writeMeta(months.length)
  } catch {
    /* quota — tetap pakai memory */
  }
}

export function getKalenderMonthsSync(): KalenderMonthRow[] {
  return loadKalenderMonthsFromStorage() ?? []
}

function normalizeMonths(data: unknown): KalenderMonthRow[] {
  if (!Array.isArray(data)) return []
  return data.filter(
    (row): row is KalenderMonthRow =>
      row != null &&
      typeof row === 'object' &&
      typeof (row as KalenderMonthRow).tahun === 'number' &&
      (row as KalenderMonthRow).mulai != null &&
      (row as KalenderMonthRow).akhir != null
  )
}

/**
 * Pastikan data bulan Hijriyah ada di local (memory + localStorage).
 * Fetch `action=all` hanya jika belum ada / force.
 */
export async function ensureKalenderMonthsLoaded(
  fetchAll: () => Promise<unknown>,
  options?: { force?: boolean }
): Promise<KalenderMonthRow[]> {
  const force = options?.force === true
  const cached = loadKalenderMonthsFromStorage()
  if (cached?.length && !force) {
    scheduleBackgroundRefresh(fetchAll)
    return cached
  }

  if (loadPromise) return loadPromise

  loadPromise = (async () => {
    try {
      const data = await fetchAll()
      const months = normalizeMonths(data)
      if (months.length) saveKalenderMonthsToStorage(months)
      return months.length ? months : cached ?? []
    } finally {
      loadPromise = null
    }
  })()

  return loadPromise
}

function scheduleBackgroundRefresh(fetchAll: () => Promise<unknown>) {
  if (backgroundRefreshStarted || typeof window === 'undefined') return
  const meta = readMeta()
  if (meta && Date.now() - meta.savedAt < REFRESH_MS) return
  backgroundRefreshStarted = true
  window.setTimeout(() => {
    fetchAll()
      .then((data) => {
        const months = normalizeMonths(data)
        if (months.length) saveKalenderMonthsToStorage(months)
      })
      .catch(() => {})
  }, 2500)
}

export function getMonthsForHijriYear(tahun: number): KalenderMonthRow[] {
  return getKalenderMonthsSync()
    .filter((m) => Number(m.tahun) === tahun)
    .slice()
    .sort((a, b) => Number(a.id_bulan) - Number(b.id_bulan))
}
