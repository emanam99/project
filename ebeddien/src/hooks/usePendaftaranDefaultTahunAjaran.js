import { useState, useEffect } from 'react'
import { useActiveHijriyahTahunAjaran, useActiveMasehiTahunAjaran } from './useActiveTahunAjaran'
import { fetchDefaultTahunAjaranFromPengaturan, getCachedPsbDefaultTahunAjaran } from '../utils/pendaftaranTahunAjaranDefault'

/**
 * Default tahun ajaran PSB dari pengaturan (tahun_hijriyah & tahun_masehi).
 * Fallback ke tahun ajaran aktif header bila pengaturan kosong.
 */
export function usePendaftaranDefaultTahunAjaran() {
  const activeH = useActiveHijriyahTahunAjaran()
  const activeM = useActiveMasehiTahunAjaran()
  const cached = getCachedPsbDefaultTahunAjaran()
  const [hijriyah, setHijriyah] = useState(() => cached.hijriyah || activeH || '')
  const [masehi, setMasehi] = useState(() => cached.masehi || activeM || '')

  useEffect(() => {
    let cancelled = false
    void fetchDefaultTahunAjaranFromPengaturan().then(({ hijriyah: h, masehi: m }) => {
      if (cancelled) return
      setHijriyah(h || activeH || '')
      setMasehi(m || activeM || '')
    })
    return () => {
      cancelled = true
    }
  }, [activeH, activeM])

  return { hijriyah, masehi }
}
