import { madrasahPjgtAPI, profilAPI } from '../services/api'
import { hydratePjgtStore, syncPjgtProfil } from '../services/pjgtDataService'
import { usePjgtDataStore } from '../store/pjgtDataStore'

/** Nama madrasah dari JWT (bukan nama santri / akun). */
export function madrasahNamaFromUser(user) {
  const n = typeof user?.madrasah_nama === 'string' ? user.madrasah_nama.trim() : ''
  return n || ''
}

/**
 * Nama lembaga untuk UI PJGT — prioritas: cache/store → GET madrasah-profil → profil.madrasah → JWT.
 */
export async function fetchPjgtMadrasahNama(user) {
  const madrasahId = user?.madrasah_id ? Number(user.madrasah_id) : 0
  if (madrasahId) {
    hydratePjgtStore(madrasahId)
    const cached = usePjgtDataStore.getState().profil?.nama
    if (cached != null && String(cached).trim() !== '') return String(cached).trim()
    const synced = await syncPjgtProfil(madrasahId, { background: false })
    if (synced?.nama != null && String(synced.nama).trim() !== '') return String(synced.nama).trim()
  }

  try {
    const res = await madrasahPjgtAPI.getProfil()
    if (res?.success && res.data?.nama != null) {
      const n = String(res.data.nama).trim()
      if (n) return n
    }
  } catch {
    /* lanjut fallback */
  }
  try {
    const r = await profilAPI.getProfil()
    if (r?.success && r.madrasah?.nama != null) {
      const n = String(r.madrasah.nama).trim()
      if (n) return n
    }
  } catch {
    /* lanjut fallback */
  }
  return madrasahNamaFromUser(user)
}
