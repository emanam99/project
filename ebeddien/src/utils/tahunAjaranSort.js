/**
 * Urutkan nilai tahun ajaran (format "YYYY-YYYY") dari terkecil ke terbesar.
 */

export function parseTahunAjaranStartYear(value) {
  const s = String(value ?? '').trim()
  const m = s.match(/^(\d{4})/)
  return m ? Number(m[1]) : null
}

export function compareTahunAjaranAsc(a, b) {
  const ya = parseTahunAjaranStartYear(a)
  const yb = parseTahunAjaranStartYear(b)
  if (ya != null && yb != null && ya !== yb) return ya - yb
  if (ya != null && yb == null) return -1
  if (ya == null && yb != null) return 1
  return String(a ?? '').localeCompare(String(b ?? ''), 'id', { numeric: true })
}

/** Daftar string tahun ajaran unik, ascending. */
export function sortTahunAjaranValuesAsc(values) {
  return [...new Set((values || []).map((v) => String(v).trim()).filter(Boolean))].sort(compareTahunAjaranAsc)
}

/** Gabung beberapa sumber lalu urut ascending; nilai terpilih ikut diurutkan bila belum ada. */
export function mergeTahunAjaranValuesAsc(sources, selected = '') {
  const merged = sortTahunAjaranValuesAsc((sources || []).flat())
  const sel = String(selected || '').trim()
  if (sel && !merged.includes(sel)) {
    return sortTahunAjaranValuesAsc([...merged, sel])
  }
  return merged
}

/** Opsi { value, label } diurut menurut value tahun ajaran ascending. */
export function sortTahunAjaranOptionRowsAsc(rows) {
  return [...(rows || [])].sort((a, b) =>
    compareTahunAjaranAsc(a?.value ?? a?.label, b?.value ?? b?.label)
  )
}

/** Pasangan hijriyah/masehi ascending (hijriyah dulu, lalu masehi). */
export function sortTahunAjaranPairsAsc(pairs) {
  return [...(pairs || [])].sort((a, b) => {
    const ah = a?.hijriyah ?? a?.tahun_hijriyah ?? ''
    const bh = b?.hijriyah ?? b?.tahun_hijriyah ?? ''
    const c = compareTahunAjaranAsc(ah, bh)
    if (c !== 0) return c
    const am = a?.masehi ?? a?.tahun_masehi ?? ''
    const bm = b?.masehi ?? b?.tahun_masehi ?? ''
    return compareTahunAjaranAsc(am, bm)
  })
}
