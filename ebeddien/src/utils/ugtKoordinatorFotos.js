export const MAX_KOORDINATOR_FOTOS = 5

/** Normalisasi daftar path foto dari baris API (foto_list / foto legacy / JSON di foto). */
export function parseKoordinatorFotoList(row) {
  if (!row) return []
  if (Array.isArray(row.foto_list)) {
    return row.foto_list.map((p) => String(p).trim()).filter(Boolean)
  }
  const raw = row.foto
  if (raw == null || raw === '') return []
  if (typeof raw === 'string' && raw.trim().startsWith('[')) {
    try {
      const arr = JSON.parse(raw)
      if (Array.isArray(arr)) {
        return arr.map((p) => String(p).trim()).filter(Boolean)
      }
    } catch {
      /* legacy */
    }
  }
  const single = String(raw).trim()
  return single ? [single] : []
}
