import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useActiveHijriyahTahunAjaran, useActiveMasehiTahunAjaran } from './useActiveTahunAjaran'
import { useTahunAjaranStore } from '../store/tahunAjaranStore'
import { pendaftaranAPI } from '../services/api'
import {
  encodeTahunAjaranPair,
  parseTahunAjaranPair,
  pairKey
} from '../utils/tahunAjaranPair'
import { mergeTahunAjaranValuesAsc, sortTahunAjaranPairsAsc } from '../utils/tahunAjaranSort'
import { fetchDefaultTahunAjaranFromPengaturan, getCachedPsbDefaultTahunAjaran } from '../utils/pendaftaranTahunAjaranDefault'

/**
 * State filter tahun ajaran tingkat halaman.
 * @param {{ loadPairs?: boolean, urlHijriyah?: string, urlMasehi?: string, defaultFromPengaturan?: boolean }} [opts]
 * — defaultFromPengaturan: default dari pengaturan PSB (selaras aplikasi daftar)
 */
export function usePageTahunAjaranFilter(opts = {}) {
  const { loadPairs = false, urlHijriyah, urlMasehi, defaultFromPengaturan = false } = opts
  const activeH = useActiveHijriyahTahunAjaran()
  const activeM = useActiveMasehiTahunAjaran()
  const { options: storeH, optionsMasehi: storeM } = useTahunAjaranStore()

  const urlH = String(urlHijriyah || '').trim()
  const urlM = String(urlMasehi || '').trim()
  const hasUrlTahun = Boolean(urlH && urlM)

  const activeHRef = useRef(activeH)
  const activeMRef = useRef(activeM)
  activeHRef.current = activeH
  activeMRef.current = activeM

  const cachedPsbDefault = defaultFromPengaturan && !hasUrlTahun ? getCachedPsbDefaultTahunAjaran() : null

  const [selectedHijriyah, setSelectedHijriyah] = useState(() => {
    if (urlH) return urlH
    if (defaultFromPengaturan) return cachedPsbDefault?.hijriyah || ''
    return activeH || ''
  })
  const [selectedMasehi, setSelectedMasehi] = useState(() => {
    if (urlM) return urlM
    if (defaultFromPengaturan) return cachedPsbDefault?.masehi || ''
    return activeM || ''
  })
  const [psbHijriyahList, setPsbHijriyahList] = useState([])
  const [psbMasehiList, setPsbMasehiList] = useState([])
  const [psbPairs, setPsbPairs] = useState([])
  const [combinedValue, setCombinedValue] = useState(() => {
    if (urlH && urlM) return encodeTahunAjaranPair(urlH, urlM)
    if (defaultFromPengaturan) {
      const h = cachedPsbDefault?.hijriyah || ''
      const m = cachedPsbDefault?.masehi || ''
      return h && m ? encodeTahunAjaranPair(h, m) : ''
    }
    return encodeTahunAjaranPair(activeH, activeM)
  })
  const [psbDefaultReady, setPsbDefaultReady] = useState(() => {
    if (hasUrlTahun || !defaultFromPengaturan) return true
    const c = cachedPsbDefault
    return Boolean(c?.hijriyah && c?.masehi)
  })

  useEffect(() => {
    if (hasUrlTahun) {
      setSelectedHijriyah(urlH)
      setSelectedMasehi(urlM)
      setCombinedValue(encodeTahunAjaranPair(urlH, urlM))
      return
    }
    if (defaultFromPengaturan) return
    setSelectedHijriyah(activeH || '')
  }, [hasUrlTahun, urlH, urlM, activeH, defaultFromPengaturan])

  useEffect(() => {
    if (hasUrlTahun || defaultFromPengaturan) return
    setSelectedMasehi(activeM || '')
  }, [hasUrlTahun, activeM, defaultFromPengaturan])

  useEffect(() => {
    if (hasUrlTahun || defaultFromPengaturan) return
    setCombinedValue(encodeTahunAjaranPair(activeH, activeM))
  }, [hasUrlTahun, activeH, activeM, defaultFromPengaturan])

  useEffect(() => {
    if (!defaultFromPengaturan || hasUrlTahun) {
      if (hasUrlTahun || !defaultFromPengaturan) setPsbDefaultReady(true)
      return
    }
    let cancelled = false
    void fetchDefaultTahunAjaranFromPengaturan().then(({ hijriyah, masehi }) => {
      if (cancelled) return
      const fromPengaturanH = String(hijriyah || '').trim()
      const fromPengaturanM = String(masehi || '').trim()
      const h = fromPengaturanH || activeHRef.current || ''
      const m = fromPengaturanM || activeMRef.current || ''
      setSelectedHijriyah(h)
      setSelectedMasehi(m)
      setCombinedValue(encodeTahunAjaranPair(h, m))
      setPsbDefaultReady(true)
    })
    return () => {
      cancelled = true
    }
  }, [defaultFromPengaturan, hasUrlTahun, urlH, urlM])

  const fetchLists = useCallback(async () => {
    try {
      const result = await pendaftaranAPI.getTahunAjaranList()
      if (result?.success && result.data) {
        setPsbHijriyahList(Array.isArray(result.data.tahun_hijriyah) ? result.data.tahun_hijriyah : [])
        setPsbMasehiList(Array.isArray(result.data.tahun_masehi) ? result.data.tahun_masehi : [])
        if (loadPairs && Array.isArray(result.data.pairs)) {
          setPsbPairs(result.data.pairs)
        }
      }
    } catch (_) {
      setPsbHijriyahList([])
      setPsbMasehiList([])
      if (loadPairs) setPsbPairs([])
    }
  }, [loadPairs])

  useEffect(() => {
    fetchLists()
  }, [fetchLists])

  const hijriyahOptions = useMemo(() => {
    const fromStore = (storeH || []).map((o) => String(o.value ?? o.label ?? '').trim()).filter(Boolean)
    return mergeTahunAjaranValuesAsc([psbHijriyahList, fromStore], selectedHijriyah)
  }, [storeH, psbHijriyahList, selectedHijriyah])

  const masehiOptions = useMemo(() => {
    const fromStore = (storeM || []).map((o) => String(o.value ?? o.label ?? '').trim()).filter(Boolean)
    return mergeTahunAjaranValuesAsc([psbMasehiList, fromStore], selectedMasehi)
  }, [storeM, psbMasehiList, selectedMasehi])

  const pairOptions = useMemo(() => {
    const map = new Map()
    const add = (h, m) => {
      const hk = String(h ?? '').trim()
      const mk = String(m ?? '').trim()
      if (!hk && !mk) return
      const key = pairKey(hk, mk)
      if (!map.has(key)) map.set(key, { hijriyah: hk, masehi: mk, value: key })
    }
    for (const p of psbPairs) {
      add(p.tahun_hijriyah ?? p.hijriyah, p.tahun_masehi ?? p.masehi)
    }
    add(activeH, activeM)
    add(selectedHijriyah, selectedMasehi)
    const parsed = parseTahunAjaranPair(combinedValue)
    add(parsed.hijriyah, parsed.masehi)
    return sortTahunAjaranPairsAsc([...map.values()])
  }, [psbPairs, activeH, activeM, selectedHijriyah, selectedMasehi, combinedValue])

  const onCombinedChange = useCallback((value) => {
    setCombinedValue(value)
    const { hijriyah, masehi } = parseTahunAjaranPair(value)
    setSelectedHijriyah(hijriyah)
    setSelectedMasehi(masehi)
  }, [])

  const bothFilled = Boolean(String(selectedHijriyah || '').trim() && String(selectedMasehi || '').trim())

  return {
    selectedHijriyah,
    setSelectedHijriyah,
    selectedMasehi,
    setSelectedMasehi,
    combinedValue,
    setCombinedValue: onCombinedChange,
    hijriyahOptions,
    masehiOptions,
    pairOptions,
    bothFilled,
    psbDefaultReady,
    refreshOptions: fetchLists
  }
}
