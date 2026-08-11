/** Nilai tahun ajaran persis seperti di DB (hijriyah atau masehi, tanpa digabung). */
export function formatTahunAjaranValue(raw) {
  const v = String(raw ?? '').trim()
  return v || '–'
}

export function matchesTahunAjaranFilter(rowTahunAjaran, filterKey) {
  if (!filterKey) return true
  return String(rowTahunAjaran ?? '').trim() === filterKey
}

/** Opsi filter tahun ajaran dengan count; value = label = nilai DB. */
export function buildTahunAjaranFilterOptions(rows, {
  excludeTahunAjaranFilter = false,
  tahunAjaranFilter = '',
  applyOtherFilters = (list) => list,
} = {}) {
  let filtered = applyOtherFilters(rows)
  if (!excludeTahunAjaranFilter && tahunAjaranFilter) {
    filtered = filtered.filter((s) =>
      matchesTahunAjaranFilter(s.tahun_ajaran, tahunAjaranFilter),
    )
  }

  const countsMap = new Map()
  for (const s of filtered) {
    const key = String(s.tahun_ajaran ?? '').trim()
    if (!key) continue
    countsMap.set(key, (countsMap.get(key) || 0) + 1)
  }

  return [...countsMap.entries()]
    .map(([value, count]) => ({ value, count, label: value }))
    .sort((a, b) => a.label.localeCompare(b.label))
}
