import { useEffect, useState } from 'react'
import { ACCESS_MODE } from '../config/accessMode'
import { useAuthStore } from '../store/authStore'
import { useSantriDataStore } from '../store/santriDataStore'
import { profilAPI, madrasahPjgtAPI } from '../services/api'
import { syncSantriBiodata } from '../services/santriDataService'

/**
 * Nama tampilan mengikuti akses aktif: santri → nama santri, PJGT → nama madrasah, toko → nama toko.
 */
export function useActiveAccessDisplayName() {
  const { user, activeAccess } = useAuthStore()
  const biodataNama = useSantriDataStore((s) => s.biodata?.nama)
  const [resolvedNama, setResolvedNama] = useState('')

  useEffect(() => {
    if (!user?.id) {
      setResolvedNama('')
      return undefined
    }
    let cancelled = false
    setResolvedNama('')

    const run = async () => {
      try {
        if (activeAccess === ACCESS_MODE.santri && user?.santri_id) {
          const cached = typeof biodataNama === 'string' ? biodataNama.trim() : ''
          if (cached) {
            if (!cancelled) setResolvedNama(cached)
            return
          }
          const sid = Number(user.santri_id)
          const uid = Number(user.id)
          const data = await syncSantriBiodata(sid, uid, { background: true })
          const n = data?.nama != null ? String(data.nama).trim() : ''
          if (!cancelled) setResolvedNama(n || '')
          return
        }
        if (activeAccess === ACCESS_MODE.toko && user?.has_toko) {
          const fromJwt = typeof user?.toko_nama === 'string' ? user.toko_nama.trim() : ''
          if (fromJwt) {
            if (!cancelled) setResolvedNama(fromJwt)
            return
          }
          const res = await profilAPI.getProfil('toko')
          const n = res?.success && res.nama != null ? String(res.nama).trim() : ''
          if (!cancelled && n) {
            setResolvedNama(n)
            return
          }
        }
        if (activeAccess === ACCESS_MODE.pjgt && user?.madrasah_id) {
          const res = await madrasahPjgtAPI.getProfil()
          let n = res?.success && res.data?.nama != null ? String(res.data.nama).trim() : ''
          if (!n) {
            const r2 = await profilAPI.getProfil('pjgt')
            const m = r2?.madrasah && typeof r2.madrasah === 'object' ? r2.madrasah.nama : null
            n = m != null ? String(m).trim() : ''
            if (!n && r2?.success && r2.nama != null) n = String(r2.nama).trim()
          }
          if (!n && typeof user?.madrasah_nama === 'string') {
            n = user.madrasah_nama.trim()
          }
          if (!cancelled) setResolvedNama(n || '')
          return
        }
        if (activeAccess === ACCESS_MODE.wali) {
          const res = await profilAPI.getProfil('wali')
          const n = res?.success && res.nama != null ? String(res.nama).trim() : ''
          if (!cancelled && n) {
            setResolvedNama(n)
            return
          }
        }
        const prefer =
          activeAccess === ACCESS_MODE.toko
            ? 'toko'
            : activeAccess === ACCESS_MODE.pjgt
              ? 'pjgt'
              : activeAccess === ACCESS_MODE.santri
                ? 'santri'
                : undefined
        const res = await profilAPI.getProfil(prefer)
        const n = res?.success && res.nama != null ? String(res.nama).trim() : ''
        if (!cancelled) setResolvedNama(n || '')
      } catch {
        if (!cancelled) setResolvedNama('')
      }
    }

    run()
    return () => {
      cancelled = true
    }
  }, [
    user?.id,
    user?.santri_id,
    user?.has_toko,
    user?.toko_nama,
    user?.madrasah_id,
    user?.madrasah_nama,
    activeAccess,
    biodataNama,
  ])

  const displayName =
    (resolvedNama || '').trim() ||
    (activeAccess === ACCESS_MODE.pjgt && typeof user?.madrasah_nama === 'string'
      ? user.madrasah_nama.trim()
      : '') ||
    (activeAccess === ACCESS_MODE.toko && typeof user?.toko_nama === 'string' ? user.toko_nama.trim() : '') ||
    (user?.nama || '').trim() ||
    (user?.username || '').trim() ||
    'Pengguna'

  const initial = (displayName || '?').trim().charAt(0).toUpperCase()

  return { displayName, initial }
}
