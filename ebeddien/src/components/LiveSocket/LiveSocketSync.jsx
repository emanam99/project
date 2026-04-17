import { useEffect } from 'react'
import { useLiveSocket } from '../../contexts/LiveSocketContext'
import { fetchSantriDeltaQuiet } from '../../services/santriIndexedDbSync'
import { removeSantriRowsByIds } from '../../services/offcanvasSearchCache'
import { fetchAndPersistDomisiliCache, refreshDomisiliSantriInCache } from '../../services/domisiliCacheSync'

/**
 * Satu listener socket + satu interval polling untuk indeks santri di IndexedDB,
 * agar tidak diduplikasi di setiap halaman/offcanvas.
 */
export default function LiveSocketSync() {
  const liveCtx = useLiveSocket()
  const socket = liveCtx?.socket ?? null

  useEffect(() => {
    if (!socket) return
    const onHint = async (payload) => {
      await removeSantriRowsByIds(payload?.removed_ids)
      await fetchSantriDeltaQuiet()
      await refreshDomisiliSantriInCache({ notify: true })
    }
    socket.on('santri_search_index_hint', onHint)
    return () => socket.off('santri_search_index_hint', onHint)
  }, [socket])

  useEffect(() => {
    if (!socket) return
    const onDomisiliHint = async () => {
      await fetchAndPersistDomisiliCache({ notify: true })
    }
    socket.on('domisili_cache_hint', onDomisiliHint)
    return () => socket.off('domisili_cache_hint', onDomisiliHint)
  }, [socket])

  useEffect(() => {
    const id = setInterval(() => {
      fetchSantriDeltaQuiet()
    }, 120000)
    return () => clearInterval(id)
  }, [])

  return null
}
