const LS_PREFIX = 'bisyaroh-review-disabled-v1'

export function reviewRowKey(bisyarohId, idPengurus) {
  return `${bisyarohId}:${idPengurus}`
}

export function reviewDisabledStorageKey({ lembagaId, periodeBulan, periodeKalender }) {
  return `${LS_PREFIX}:${lembagaId || '_'}:${periodeBulan || '_'}:${periodeKalender || 'masehi'}`
}

export function loadReviewDisabledRowKeys(storageKey) {
  try {
    const raw = localStorage.getItem(storageKey)
    if (!raw) return new Set()
    const arr = JSON.parse(raw)
    return new Set(Array.isArray(arr) ? arr.filter((k) => typeof k === 'string') : [])
  } catch {
    return new Set()
  }
}

export function persistReviewDisabledRowKeys(storageKey, keys) {
  try {
    localStorage.setItem(storageKey, JSON.stringify([...keys]))
  } catch {
    /* abaikan */
  }
}

export function isReviewRowDisabled(disabledSet, bisyarohId, idPengurus) {
  if (!disabledSet || disabledSet.size === 0) return false
  return disabledSet.has(reviewRowKey(bisyarohId, idPengurus))
}

export function sumSectionActiveRows(rows, disabledSet, bisyarohId) {
  return (rows || []).reduce((acc, row) => {
    if (isReviewRowDisabled(disabledSet, bisyarohId, row.id_pengurus)) return acc
    return acc + (Number(row.total_nominal) || 0)
  }, 0)
}

export function applyReviewDisabledToSections(sections, disabledSet) {
  if (!disabledSet || disabledSet.size === 0) return sections
  return sections.map((sec) => ({
    ...sec,
    subtotal_nominal: sumSectionActiveRows(sec.rows, disabledSet, sec.bisyaroh_id)
  }))
}

export function reviewGrandTotalFromSections(sections, disabledSet) {
  return (sections || []).reduce(
    (acc, sec) => acc + sumSectionActiveRows(sec.rows, disabledSet, sec.bisyaroh_id),
    0
  )
}
