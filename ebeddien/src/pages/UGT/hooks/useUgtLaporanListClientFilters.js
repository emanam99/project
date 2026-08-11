import { useState, useEffect, useCallback, useMemo } from 'react'
import { getBulanName } from '../../Kalender/utils/bulanHijri'

function rowMatchesKoordinator(r, filterKoordinator, hasFilterKoordinatorSemua, koordinatorFilterLocked) {
  if (koordinatorFilterLocked || !hasFilterKoordinatorSemua || !filterKoordinator) return true
  return String(r.id_koordinator ?? '') === String(filterKoordinator)
}

function rowMatchesMadrasah(r, filterMadrasah) {
  if (!filterMadrasah) return true
  return String(r.id_madrasah ?? '') === String(filterMadrasah)
}

function rowMatchesTa(r, filterTa) {
  if (!filterTa) return true
  return String(r.id_tahun_ajaran ?? '') === String(filterTa)
}

function rowMatchesBulan(r, filterBulan) {
  if (!filterBulan) return true
  return String(r.bulan ?? '') === String(filterBulan)
}

function rowSearchMatch(row, qNorm, appendSearchParts) {
  if (!qNorm) return true
  const parts = [
    row.madrasah_nama,
    row.koordinator_nama,
    row.santri_nama,
    row.santri_nis,
    row.pembuat_nama,
    row.usulan,
    row.id_tahun_ajaran,
    row.bulan != null ? getBulanName(Number(row.bulan), 'hijriyah') : ''
  ]
  if (typeof appendSearchParts === 'function') {
    for (const p of appendSearchParts(row) || []) {
      if (p != null && String(p).trim() !== '') parts.push(p)
    }
  }
  const blob = parts
    .filter((x) => x != null && String(x).trim() !== '')
    .join(' ')
    .toLowerCase()
  return blob.includes(qNorm)
}

/**
 * Satu fetch laporan (tanpa filter dimensi) + filter silang & pencarian di klien,
 * pola opsi/count mirip halaman Rombel.
 */
export function useUgtLaporanListClientFilters({
  fetchAll,
  madrasahList,
  hijriyahOptions,
  showKoordinatorFilter,
  koordinatorFilterLocked,
  hasFilterKoordinatorSemua,
  appendSearchParts,
  onFetchError,
  onListMessage
}) {
  const [scopeRows, setScopeRows] = useState([])
  const [loadingScope, setLoadingScope] = useState(true)
  const [filterMadrasah, setFilterMadrasah] = useState('')
  const [filterKoordinator, setFilterKoordinator] = useState('')
  const [filterTa, setFilterTa] = useState('')
  const [filterBulan, setFilterBulan] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [isInputFocused, setIsInputFocused] = useState(false)

  const loadScope = useCallback(async () => {
    setLoadingScope(true)
    try {
      const res = await fetchAll()
      if (res?.success && Array.isArray(res.data)) {
        setScopeRows(res.data)
      } else {
        setScopeRows([])
        if (res?.message && typeof onListMessage === 'function') onListMessage(res.message)
      }
    } catch (e) {
      setScopeRows([])
      if (typeof onFetchError === 'function') onFetchError(e)
    } finally {
      setLoadingScope(false)
    }
  }, [fetchAll, onFetchError, onListMessage])

  useEffect(() => {
    loadScope()
  }, [loadScope])

  const madrasahById = useMemo(() => {
    const m = new Map()
    for (const x of madrasahList || []) {
      m.set(String(x.id), String(x.nama ?? x.id).trim() || String(x.id))
    }
    return m
  }, [madrasahList])

  const taLabelMap = useMemo(() => {
    const m = new Map()
    for (const o of hijriyahOptions || []) {
      m.set(String(o.value), o.label ?? String(o.value))
    }
    return m
  }, [hijriyahOptions])

  const koordinatorOptions = useMemo(() => {
    if (!showKoordinatorFilter || koordinatorFilterLocked || !hasFilterKoordinatorSemua) return []
    const rows = scopeRows.filter(
      (r) =>
        rowMatchesMadrasah(r, filterMadrasah) &&
        rowMatchesTa(r, filterTa) &&
        rowMatchesBulan(r, filterBulan)
    )
    const counts = new Map()
    for (const r of rows) {
      const kid = r.id_koordinator
      if (kid == null || kid === '') continue
      const id = String(kid)
      counts.set(id, (counts.get(id) || 0) + 1)
    }
    return [...counts.entries()]
      .map(([id, count]) => ({
        value: id,
        label: (() => {
          const hit = rows.find((x) => String(x.id_koordinator) === id)
          const nama = (hit?.koordinator_nama || '').trim()
          return nama || `ID ${id}`
        })(),
        count
      }))
      .sort((a, b) => a.label.localeCompare(b.label, 'id'))
  }, [
    scopeRows,
    filterMadrasah,
    filterTa,
    filterBulan,
    showKoordinatorFilter,
    koordinatorFilterLocked,
    hasFilterKoordinatorSemua
  ])

  const madrasahOptions = useMemo(() => {
    const rows = scopeRows.filter(
      (r) =>
        rowMatchesKoordinator(r, filterKoordinator, hasFilterKoordinatorSemua, koordinatorFilterLocked) &&
        rowMatchesTa(r, filterTa) &&
        rowMatchesBulan(r, filterBulan)
    )
    const counts = new Map()
    for (const r of rows) {
      const id = String(r.id_madrasah ?? '')
      if (!id) continue
      counts.set(id, (counts.get(id) || 0) + 1)
    }
    return [...counts.entries()]
      .map(([id, count]) => ({
        value: id,
        label: madrasahById.get(id) || id,
        count
      }))
      .sort((a, b) => a.label.localeCompare(b.label, 'id'))
  }, [
    scopeRows,
    filterKoordinator,
    filterTa,
    filterBulan,
    hasFilterKoordinatorSemua,
    koordinatorFilterLocked,
    madrasahById
  ])

  const taOptions = useMemo(() => {
    const rows = scopeRows.filter(
      (r) =>
        rowMatchesKoordinator(r, filterKoordinator, hasFilterKoordinatorSemua, koordinatorFilterLocked) &&
        rowMatchesMadrasah(r, filterMadrasah) &&
        rowMatchesBulan(r, filterBulan)
    )
    const counts = new Map()
    for (const r of rows) {
      const ta = r.id_tahun_ajaran
      if (ta == null || String(ta).trim() === '') continue
      const id = String(ta)
      counts.set(id, (counts.get(id) || 0) + 1)
    }
    return [...counts.entries()]
      .map(([id, count]) => ({
        value: id,
        label: taLabelMap.get(id) || id,
        count
      }))
      .sort((a, b) => a.label.localeCompare(b.label, 'id'))
  }, [
    scopeRows,
    filterKoordinator,
    filterMadrasah,
    filterBulan,
    hasFilterKoordinatorSemua,
    koordinatorFilterLocked,
    taLabelMap
  ])

  const bulanOptions = useMemo(() => {
    const rows = scopeRows.filter(
      (r) =>
        rowMatchesKoordinator(r, filterKoordinator, hasFilterKoordinatorSemua, koordinatorFilterLocked) &&
        rowMatchesMadrasah(r, filterMadrasah) &&
        rowMatchesTa(r, filterTa)
    )
    const counts = new Map()
    for (const r of rows) {
      const b = Number(r.bulan)
      if (!Number.isFinite(b) || b < 1 || b > 12) continue
      const id = String(b)
      counts.set(id, (counts.get(id) || 0) + 1)
    }
    return [...counts.entries()]
      .map(([id, count]) => ({
        value: id,
        label: `${id} — ${getBulanName(Number(id), 'hijriyah')}`,
        count
      }))
      .sort((a, b) => Number(a.value) - Number(b.value))
  }, [
    scopeRows,
    filterKoordinator,
    filterMadrasah,
    filterTa,
    hasFilterKoordinatorSemua,
    koordinatorFilterLocked
  ])

  const filteredForDisplay = useMemo(() => {
    return scopeRows.filter(
      (r) =>
        rowMatchesKoordinator(r, filterKoordinator, hasFilterKoordinatorSemua, koordinatorFilterLocked) &&
        rowMatchesMadrasah(r, filterMadrasah) &&
        rowMatchesTa(r, filterTa) &&
        rowMatchesBulan(r, filterBulan)
    )
  }, [
    scopeRows,
    filterKoordinator,
    filterMadrasah,
    filterTa,
    filterBulan,
    hasFilterKoordinatorSemua,
    koordinatorFilterLocked
  ])

  const searchNorm = useMemo(() => searchQuery.trim().toLowerCase(), [searchQuery])

  const displayRows = useMemo(() => {
    if (!searchNorm) return filteredForDisplay
    return filteredForDisplay.filter((r) => rowSearchMatch(r, searchNorm, appendSearchParts))
  }, [filteredForDisplay, searchNorm, appendSearchParts])

  const koordinatorValid = useMemo(() => new Set(koordinatorOptions.map((o) => o.value)), [koordinatorOptions])
  const madrasahValid = useMemo(() => new Set(madrasahOptions.map((o) => o.value)), [madrasahOptions])
  const taValid = useMemo(() => new Set(taOptions.map((o) => o.value)), [taOptions])
  const bulanValid = useMemo(() => new Set(bulanOptions.map((o) => o.value)), [bulanOptions])

  useEffect(() => {
    if (filterKoordinator && !koordinatorValid.has(filterKoordinator)) setFilterKoordinator('')
  }, [filterKoordinator, koordinatorValid])

  useEffect(() => {
    if (filterMadrasah && !madrasahValid.has(filterMadrasah)) setFilterMadrasah('')
  }, [filterMadrasah, madrasahValid])

  useEffect(() => {
    if (filterTa && !taValid.has(filterTa)) setFilterTa('')
  }, [filterTa, taValid])

  useEffect(() => {
    if (filterBulan && !bulanValid.has(filterBulan)) setFilterBulan('')
  }, [filterBulan, bulanValid])

  const resetFilters = useCallback(() => {
    setFilterMadrasah('')
    setFilterKoordinator('')
    setFilterTa('')
    setFilterBulan('')
    setSearchQuery('')
  }, [])

  const hasActiveFilters =
    Boolean(filterMadrasah || filterKoordinator || filterTa || filterBulan || searchQuery.trim())

  return {
    scopeRows,
    loadScope,
    loadingScope,
    filterMadrasah,
    setFilterMadrasah,
    filterKoordinator,
    setFilterKoordinator,
    filterTa,
    setFilterTa,
    filterBulan,
    setFilterBulan,
    searchQuery,
    setSearchQuery,
    isFilterOpen,
    setIsFilterOpen,
    isInputFocused,
    setIsInputFocused,
    koordinatorOptions,
    madrasahOptions,
    taOptions,
    bulanOptions,
    filteredForDisplay,
    displayRows,
    resetFilters,
    hasActiveFilters
  }
}
