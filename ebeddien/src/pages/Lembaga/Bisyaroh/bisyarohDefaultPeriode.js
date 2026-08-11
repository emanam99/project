/** Hari 1–15 (inklusif): default periode = bulan sebelumnya (masehi & hijriyah). */
export const BISYAROH_DEFAULT_PERIODE_EARLY_DAY_CUTOFF = 15

/** Kurangi satu bulan dari YYYY-MM (masehi atau hijriyah). */
export function shiftPeriodeBulanBack(ym) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(ym || ''))
  if (!m) return ym
  let y = Number(m[1])
  let mo = Number(m[2])
  mo -= 1
  if (mo < 1) {
    mo = 12
    y -= 1
  }
  return `${y}-${String(mo).padStart(2, '0')}`
}

/** Default periode masehi: bulan berjalan, kecuali tgl 1–15 → bulan sebelumnya. */
export function defaultPeriodeBulanMasehi(refDate = new Date()) {
  const d = refDate instanceof Date ? refDate : new Date(refDate)
  let y = d.getFullYear()
  let mo = d.getMonth() + 1
  if (d.getDate() <= BISYAROH_DEFAULT_PERIODE_EARLY_DAY_CUTOFF) {
    mo -= 1
    if (mo < 1) {
      mo = 12
      y -= 1
    }
  }
  return `${y}-${String(mo).padStart(2, '0')}`
}

/**
 * Default periode hijriyah dari string tanggal hijriyah API (YYYY-MM-DD atau YYYY-MM).
 * Tanggal hijriyah 1–15 → bulan hijriyah sebelumnya.
 */
export function defaultPeriodeBulanHijriyahFromString(hijriyahStr) {
  const raw = String(hijriyahStr || '').slice(0, 10)
  if (!/^\d{4}-\d{2}/.test(raw) || raw.startsWith('0000')) return null
  const parts = raw.split('-').map((x) => Number(x))
  const yr = parts[0]
  const mo = parts[1]
  const day = parts[2] > 0 ? parts[2] : 1
  if (!yr || !mo) return null
  let ym = `${String(yr).padStart(4, '0')}-${String(mo).padStart(2, '0')}`
  if (day <= BISYAROH_DEFAULT_PERIODE_EARLY_DAY_CUTOFF) {
    ym = shiftPeriodeBulanBack(ym)
  }
  return ym
}

/** Ambil default periode hijriyah hari ini via API kalender. */
export async function fetchDefaultPeriodeBulanHijriyah(kalenderAPI, refDate = new Date()) {
  const now = refDate instanceof Date ? refDate : new Date(refDate)
  try {
    const y = now.getFullYear()
    const m = now.getMonth() + 1
    const d = now.getDate()
    const tanggal = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    const h = now.getHours()
    const min = now.getMinutes()
    const sec = now.getSeconds()
    const waktu = `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
    const res = await kalenderAPI.get({ action: 'today', tanggal, waktu })
    const hijriyah = res?.hijriyah ?? res?.data?.hijriyah
    const ym = defaultPeriodeBulanHijriyahFromString(hijriyah)
    if (ym) return ym
  } catch {
    /* abaikan */
  }
  return '1446-01'
}
