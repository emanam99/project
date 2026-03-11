import { useState, useEffect, useCallback } from 'react'
import { kalenderAPI } from '../../../services/api'
import { getYearCache, setYearCache } from '../utils/kalenderCache'

/**
 * Fetch data kalender per tahun (array bulan). Pakai cache agar buka lagi cepat.
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
    const hasCache = !!getYearCache(year)
    if (!hasCache) setLoading(true)
    setError(null)
    try {
      const data = await kalenderAPI.get({ action: 'year', tahun: year })
      const arr = Array.isArray(data) ? data : []
      setYearCache(year, arr)
      setYearData(arr)
    } catch (e) {
      setError(e.message || 'Gagal memuat data kalender')
      setYearData([])
    } finally {
      setLoading(false)
    }
  }, [year])

  useEffect(() => {
    fetchYear()
  }, [fetchYear])

  return { yearData, loading, error, refetch: fetchYear }
}
