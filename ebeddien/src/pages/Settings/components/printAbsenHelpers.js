/** Senin=1 … Minggu=7 (ISO-style dengan Minggu = 7) */
export function toIdWeekday(date) {
  const js = date.getDay()
  return js === 0 ? 7 : js
}

export const HARI_ID_OPTIONS = [
  { value: 1, label: 'Senin' },
  { value: 2, label: 'Selasa' },
  { value: 3, label: 'Rabu' },
  { value: 4, label: 'Kamis' },
  { value: 5, label: 'Jumat' },
  { value: 6, label: 'Sabtu' },
  { value: 7, label: 'Minggu' },
]

/** Apakah id hari (1–7) termasuk rentang inklusif; jika start > end, dianggap melintang minggu */
export function weekdayInRange(id, start, end) {
  if (start <= end) return id >= start && id <= end
  return id >= start || id <= end
}

export function parseYmdLocal(ymd) {
  if (!ymd || typeof ymd !== 'string') return null
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim())
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2]) - 1
  const d = Number(m[3])
  const dt = new Date(y, mo, d)
  if (dt.getFullYear() !== y || dt.getMonth() !== mo || dt.getDate() !== d) return null
  return dt
}

export function formatYmdLocal(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Senin minggu berjalan (lokal) */
export function startOfWeekMonday(ref = new Date()) {
  const x = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate())
  const day = x.getDay()
  const diff = day === 0 ? -6 : 1 - day
  x.setDate(x.getDate() + diff)
  return x
}

/**
 * Daftar tanggal dalam rentang yang jatuh pada hari dalam rentang hari (Senin–Minggu).
 */
export function buildHarianColumns(tanggalMulai, tanggalSelesai, hariMulai, hariSelesai) {
  const s = parseYmdLocal(tanggalMulai)
  const e = parseYmdLocal(tanggalSelesai)
  if (!s || !e) return []
  const start = new Date(s.getFullYear(), s.getMonth(), s.getDate())
  const end = new Date(e.getFullYear(), e.getMonth(), e.getDate())
  if (start > end) return []

  const cols = []
  for (let t = start.getTime(); t <= end.getTime(); t += 86400000) {
    const d = new Date(t)
    const id = toIdWeekday(d)
    if (weekdayInRange(id, hariMulai, hariSelesai)) {
      cols.push({
        key: formatYmdLocal(d),
        label: d.toLocaleDateString('id-ID', {
          weekday: 'short',
          day: 'numeric',
          month: 'short',
        }),
      })
    }
  }
  return cols
}
