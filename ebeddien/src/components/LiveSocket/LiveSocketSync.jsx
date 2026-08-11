import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { useLiveSocket } from '../../contexts/LiveSocketContext'
import { fetchSantriDeltaQuiet } from '../../services/santriIndexedDbSync'
import { fetchPendaftarDeltaQuiet } from '../../services/pendaftarListSync'
import { removeSantriRowsByIds } from '../../services/offcanvasSearchCache'
import { removePendaftarRowsByRegistrasiIds } from '../../services/pendaftarListCache'
import { fetchAndPersistDomisiliCache, refreshDomisiliSantriInCache } from '../../services/domisiliCacheSync'
import { EBEDDIEN_IJIN_HINT } from '../../services/ijinLiveEvents'

// Prefix path yang benar-benar butuh polling delta santri/pendaftar.
// Di luar prefix ini, kita tidak boros bandwidth tiap 2 menit.
const SANTRI_DELTA_PATH_PREFIXES = [
  '/data-santri',
  '/uwaba',
  '/pembayaran',
  '/pendaftaran',
  '/beranda',
  '/super-admin',
]

/**
 * Satu listener socket + satu interval polling untuk indeks santri di IndexedDB,
 * agar tidak diduplikasi di setiap halaman/offcanvas.
 */
export default function LiveSocketSync() {
  const liveCtx = useLiveSocket()
  const socket = liveCtx?.socket ?? null
  const location = useLocation()

  useEffect(() => {
    if (!socket) return
    const onHint = async (payload) => {
      await removeSantriRowsByIds(payload?.removed_ids)
      await removePendaftarRowsByRegistrasiIds(payload?.removed_registrasi_ids)
      await fetchSantriDeltaQuiet()
      await fetchPendaftarDeltaQuiet()
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
    if (!socket) return
    const onIjinHint = (payload) => {
      try {
        window.dispatchEvent(
          new CustomEvent(EBEDDIEN_IJIN_HINT, { detail: payload && typeof payload === 'object' ? payload : {} })
        )
      } catch (_) { /* lama/SSR */ }
    }
    socket.on('ijin_data_hint', onIjinHint)
    return () => socket.off('ijin_data_hint', onIjinHint)
  }, [socket])

  useEffect(() => {
    // Hanya polling delta saat user berada di halaman yang memang menampilkan
    // data santri/pendaftar. Selain itu kita andalkan event socket (hint) saja.
    const pathname = location?.pathname || ''
    const needs = SANTRI_DELTA_PATH_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'))
    if (!needs) return
    const tick = () => {
      if (typeof document !== 'undefined' && document.hidden) return
      fetchSantriDeltaQuiet()
      fetchPendaftarDeltaQuiet()
    }
    tick()
    const id = setInterval(tick, 120000)
    return () => clearInterval(id)
  }, [location?.pathname])

  return null
}
