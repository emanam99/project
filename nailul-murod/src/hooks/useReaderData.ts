import { useCallback, useEffect, useMemo, useState } from 'react'
import { loadWiridForReader } from '../db'
import type { ReaderState } from '../types/wirid'

const SYNC_INTERVAL_MS = 2 * 60 * 1000

export function useReaderData() {
  const [state, setState] = useState<ReaderState>({
    rows: [],
    loading: true,
    syncing: false,
    source: null,
    lastSyncAt: null,
  })

  const refreshData = useCallback(async () => {
    setState((prev) => ({ ...prev, syncing: true }))
    const result = await loadWiridForReader()
    setState((prev) => ({
      ...prev,
      rows: result.rows,
      source: result.source,
      loading: false,
      syncing: false,
      lastSyncAt: new Date(),
    }))
  }, [])

  useEffect(() => {
    refreshData().catch(() => {
      setState((prev) => ({ ...prev, loading: false, syncing: false }))
    })
  }, [refreshData])

  useEffect(() => {
    const id = window.setInterval(() => {
      refreshData().catch(() => {})
    }, SYNC_INTERVAL_MS)
    return () => window.clearInterval(id)
  }, [refreshData])

  const syncInfo = useMemo(() => {
    if (!state.lastSyncAt) return 'Belum sinkron'
    return state.lastSyncAt.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
  }, [state.lastSyncAt])

  return { state, refreshData, syncInfo }
}
