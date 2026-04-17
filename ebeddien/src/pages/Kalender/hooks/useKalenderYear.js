import { useState, useEffect, useCallback } from 'react'
import { kalenderAPI } from '../../../services/api'
import { idbGetYear, idbPutYear } from '../../../services/hijriPenanggalanStorage'
import { getYearCache, setYearCache } from '../utils/kalenderCache'

/**
 * Fetch data kalender per tahun (array bulan). Pakai cache memori + IndexedDB agar buka lagi cepat.
 * @param {number} year - tahun hijriyah
 * @returns { { yearData: array, loading: boolean, error: string|null, refetch: function } }
 */
export function useKalenderYear(year) {
  const [yearData, setYearData] = useState(() => {
    if (!year) return []
    const cached = getYearCache(year)
    return cached ?? []
  })
  const [loading, setLoading] = useState(() => !year || !getYearCache(year))
  const [error, setError] = useState(null)

  const fetchYear = useCallback(async () => {
    if (!year) {
      setYearData([])
      setLoading(false)
      return
    }
    const mem = getYearCache(year)
    let idbRows = null
    try {
      idbRows = await idbGetYear(year)
    } catch (_) {
      idbRows = null
    }
    const localRows =
      mem && mem.length ? mem : idbRows && idbRows.length ? idbRows : null
    if (localRows) {
      if (idbRows && idbRows.length && (!mem || !mem.length)) {
        setYearCache(year, idbRows)
      }
      setYearData(localRows)
      setLoading(false)
    } else {
      setLoading(true)
    }
    setError(null)
    try {
      const data = await kalenderAPI.get({ action: 'year', tahun: year })
      const arr = Array.isArray(data) ? data : []
      setYearCache(year, arr)
      setYearData(arr)
      if (arr.length) void idbPutYear(year, arr)
    } catch (e) {
      setError(e.message || 'Gagal memuat data kalender')
      if (!localRows) setYearData([])
    } finally {
      setLoading(false)
    }
  }, [year])

  useEffect(() => {
    fetchYear()
  }, [fetchYear])

  return { yearData, loading, error, refetch: fetchYear }
}
