import { useState, useEffect, useCallback } from 'react'
import { kalenderGet, getKalenderYearLocal, type KalenderMonthRow } from '../../../api/kalenderApi'
import { getYearCache, setYearCache } from '../utils/kalenderCache'
import { ensureKalenderMonthsLoaded } from '../utils/kalenderLocalStore'

export function useKalenderYear(year: number) {
  const [yearData, setYearData] = useState<KalenderMonthRow[]>(() => {
    if (!year) return []
    return getKalenderYearLocal(year) ?? getYearCache(year) ?? []
  })
  const [loading, setLoading] = useState(() => !year || !getKalenderYearLocal(year))
  const [error, setError] = useState<string | null>(null)

  const fetchYear = useCallback(async () => {
    if (!year) {
      setYearData([])
      setLoading(false)
      return
    }

    const local = getKalenderYearLocal(year)
    if (local?.length) {
      setYearData(local)
      setLoading(false)
      return
    }

    const cached = getYearCache(year)
    if (cached) {
      setYearData(cached)
      setLoading(false)
    } else {
      setLoading(true)
    }

    setError(null)
    try {
      await ensureKalenderMonthsLoaded(() => kalenderGet({ action: 'all' }))
      const fromAll = getKalenderYearLocal(year)
      if (fromAll?.length) {
        setYearData(fromAll)
        return
      }
      const data = await kalenderGet({ action: 'year', tahun: year })
      const arr = Array.isArray(data) ? (data as KalenderMonthRow[]) : []
      setYearCache(year, arr)
      setYearData(arr)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat data kalender')
      if (!cached) setYearData([])
    } finally {
      setLoading(false)
    }
  }, [year])

  useEffect(() => {
    fetchYear()
  }, [fetchYear])

  return { yearData, loading, error, refetch: fetchYear }
}
