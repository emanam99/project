import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { pendaftaranAPI } from '../../services/api'
import {
  subscribeSantriRowsOrdered,
  getLocalSantriSinceWatermark,
  countSantriRows,
} from '../../services/offcanvasSearchCache'
import {
  fetchSantriDeltaQuiet,
  fetchAndApplyFullSantriIndex,
  isSantriIndexComplete,
} from '../../services/santriIndexedDbSync'
import { useSantriDetailOffcanvas } from '../../contexts/SantriDetailOffcanvasContext'
import { useNotification } from '../../contexts/NotificationContext'
import { useUmumFiturAccess } from '../../hooks/useUmumFiturAccess'
import ManageDataStreamProgress from '../../pages/Pembayaran/components/ManageDataStreamProgress'

/** Min z-index backdrop detail santri (portal global) — selaras default DetailSantriOffcanvas. */
const DETAIL_SANTRI_MIN_STACK = 10250

/**
 * Z-index backdrop detail santri saat dibuka dari hasil Cari Santri (panel memakai inline `zIndex`).
 * Wajib di atas panel cari dan UI baris (dropdown status memakai hingga zIndex + 100).
 * @param {number} searchPanelZ
 * @returns {number}
 */
export function stackBaseZForSantriDetailAboveSearch(searchPanelZ) {
  const raw = Number(searchPanelZ)
  const base = Number.isFinite(raw) ? Math.floor(raw) : 50
  return Math.max(base + 400, DETAIL_SANTRI_MIN_STACK)
}

/** Default z-index panel Cari Santri dari halaman konten (di atas chrome sidebar App z-[61]). */
export const SEARCH_OFFCANVAS_Z_PAGE_DEFAULT = 130

/**
 * @param {number} [zIndex] — lapisan panel + backdrop cari (inline style). Default {@link SEARCH_OFFCANVAS_Z_PAGE_DEFAULT}.
 */
function SearchOffcanvas({
  isOpen,
  onClose,
  onSelectSantri,
  onSelectSantriRecord,
  zIndex = SEARCH_OFFCANVAS_Z_PAGE_DEFAULT,
  allowedSantriIds = null,
  restrictedEmptyText = 'Data tidak ditemukan.',
}) {
  const { openSantriDetail } = useSantriDetailOffcanvas()
  const { canCariSantri, canDetailSantri } = useUmumFiturAccess()
  const { showNotification } = useNotification()
  const [searchQuery, setSearchQuery] = useState('')
  const [santriList, setSantriList] = useState([])
  const [filteredList, setFilteredList] = useState([])
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncError, setSyncError] = useState('')
  const [streamProgress, setStreamProgress] = useState({ active: false, loaded: 0, total: null })
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [isInputFocused, setIsInputFocused] = useState(false)
  const [isPendaftarOnly, setIsPendaftarOnly] = useState(false)
  const [pendaftarIds, setPendaftarIds] = useState([])
  const [selectedTahunAjaran, setSelectedTahunAjaran] = useState('')
  const [selectedTahunMasehi, setSelectedTahunMasehi] = useState('')
  const [tahunHijriyahOptions, setTahunHijriyahOptions] = useState([])
  const [tahunMasehiOptions, setTahunMasehiOptions] = useState([])
  const allowedIdSet = useMemo(() => {
    if (allowedSantriIds == null) return null
    return new Set(Array.from(allowedSantriIds, (id) => Number(id)).filter((n) => n > 0))
  }, [allowedSantriIds])

  const [filters, setFilters] = useState({
    diniyah: '',
    formal: '',
    lttq: '',
    gender: '',
  })
  const [kelasDiniyahFilter, setKelasDiniyahFilter] = useState('')
  const [kelDiniyahFilter, setKelDiniyahFilter] = useState('')
  const [kelasFormalFilter, setKelasFormalFilter] = useState('')
  const [kelFormalFilter, setKelFormalFilter] = useState('')
  const [kategoriFilter, setKategoriFilter] = useState('')
  const [daerahFilter, setDaerahFilter] = useState('')
  const [kamarFilter, setKamarFilter] = useState('')
  const [tidakDiniyahFilter, setTidakDiniyahFilter] = useState(false)
  const [tidakFormalFilter, setTidakFormalFilter] = useState(false)
  const [apiDaerahFilterOptions, setApiDaerahFilterOptions] = useState([])
  /** null = belum diinisialisasi; [] = tanpa filter status (tampil semua); isi = subset status (normalized + __NULL__) */
  const [statusSantriFilter, setStatusSantriFilter] = useState(null)
  const [isStatusFilterOpen, setIsStatusFilterOpen] = useState(false)
  const statusFilterRef = useRef(null)
  const statusFilterButtonRef = useRef(null)
  const statusFilterDropdownRef = useRef(null)
  const [statusFilterPosition, setStatusFilterPosition] = useState({ top: 0, left: 0, width: 0 })

  const normalizeStatusSantri = (value) => {
    const raw = String(value || '').trim().toLowerCase()
    if (raw === 'khooriji') return 'khoriji'
    return raw
  }

  const applyStatusToList = (list, statusArr) => {
    if (statusArr === null) return list
    if (statusArr.length === 0) return list
    return list.filter((s) => {
      const raw = s.status_santri
      if (!raw || raw === '') return statusArr.includes('__NULL__')
      return statusArr.includes(normalizeStatusSantri(raw))
    })
  }

  const applyTidakSekolahKategoriDaerahKamar = (list) => {
    let out = list
    if (tidakDiniyahFilter) {
      out = out.filter((s) => s.diniyah == null || s.diniyah === '')
    }
    if (tidakFormalFilter) {
      out = out.filter((s) => s.formal == null || s.formal === '')
    }
    if (kategoriFilter) {
      out = out.filter((s) => (s.kategori || '') === kategoriFilter)
    }
    if (daerahFilter) {
      out = out.filter((s) => (s.daerah || '') === daerahFilter)
    }
    if (kamarFilter) {
      out = out.filter((s) => (s.kamar || '') === kamarFilter)
    }
    return out
  }

  // Gate fitur Umum · Cari Santri
  useEffect(() => {
    if (!isOpen || canCariSantri) return
    showNotification('Anda tidak memiliki akses Cari Santri (Fitur → Umum)', 'error')
    onClose?.()
  }, [isOpen, canCariSantri, onClose, showNotification])

  // Prevent body scroll saat offcanvas terbuka
  useEffect(() => {
    if (isOpen && canCariSantri) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'unset'
    }
    
    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [isOpen, canCariSantri])

  // Tutup offcanvas: reset filter agar buka berikutnya bersih + default status
  useEffect(() => {
    if (!isOpen) {
      setStatusSantriFilter(null)
      setKategoriFilter('')
      setDaerahFilter('')
      setKamarFilter('')
      setTidakDiniyahFilter(false)
      setTidakFormalFilter(false)
      setApiDaerahFilterOptions([])
      setIsStatusFilterOpen(false)
      setFilters({ diniyah: '', formal: '', lttq: '', gender: '' })
      setKelasDiniyahFilter('')
      setKelDiniyahFilter('')
      setKelasFormalFilter('')
      setKelFormalFilter('')
    }
  }, [isOpen])

  const sameLembaga = (a, b) => a != null && b != null && String(a) === String(b)

  useEffect(() => {
    if (!filters.diniyah || filters.diniyah === '__NULL__') {
      setKelasDiniyahFilter('')
      setKelDiniyahFilter('')
    }
  }, [filters.diniyah])

  useEffect(() => {
    if (!kelasDiniyahFilter) setKelDiniyahFilter('')
  }, [kelasDiniyahFilter])

  useEffect(() => {
    if (!filters.formal || filters.formal === '__NULL__') {
      setKelasFormalFilter('')
      setKelFormalFilter('')
    }
  }, [filters.formal])

  useEffect(() => {
    if (!kelasFormalFilter) setKelFormalFilter('')
  }, [kelasFormalFilter])

  useEffect(() => {
    if (tidakDiniyahFilter) {
      setFilters((f) => ({ ...f, diniyah: '' }))
      setKelasDiniyahFilter('')
      setKelDiniyahFilter('')
    }
  }, [tidakDiniyahFilter])

  useEffect(() => {
    if (tidakFormalFilter) {
      setFilters((f) => ({ ...f, formal: '' }))
      setKelasFormalFilter('')
      setKelFormalFilter('')
    }
  }, [tidakFormalFilter])

  const buildListAfterCommon = (list) => {
    let t = [...list]
    if (isPendaftarOnly && pendaftarIds.length > 0) {
      t = t.filter((s) => pendaftarIds.includes(s.id))
    }
    t = applyTidakSekolahKategoriDaerahKamar(t)
    t = applyStatusToList(t, statusSantriFilter)
    return t
  }

  const applyLttqGenderToList = (list, skip = {}) => {
    let t = [...list]
    if (!skip.lttq && filters.lttq) {
      if (filters.lttq === '__NULL__') t = t.filter((s) => !s.lttq || s.lttq === '')
      else t = t.filter((s) => String(s.lttq || '') === String(filters.lttq))
    }
    if (!skip.gender && filters.gender) {
      if (filters.gender === '__NULL__') t = t.filter((s) => !s.gender || s.gender === '')
      else t = t.filter((s) => String(s.gender || '') === String(filters.gender))
    }
    return t
  }

  const applyDiniyahChain = (list, { through = 'all' } = {}) => {
    if (!filters.diniyah) return [...list]
    let t = [...list]
    if (filters.diniyah === '__NULL__') {
      return t.filter((s) => !s.diniyah || s.diniyah === '')
    }
    t = t.filter((s) => sameLembaga(s.diniyah, filters.diniyah))
    if (through === 'lembaga') return t
    if (kelasDiniyahFilter) {
      t = t.filter((s) => (s.kelas_diniyah || '') === kelasDiniyahFilter)
    }
    if (through === 'lembaga_kelas') return t
    if (kelDiniyahFilter) {
      t = t.filter((s) => (s.kel_diniyah || '') === kelDiniyahFilter)
    }
    return t
  }

  const applyFormalChain = (list, { through = 'all' } = {}) => {
    if (!filters.formal) return [...list]
    let t = [...list]
    if (filters.formal === '__NULL__') {
      return t.filter((s) => !s.formal || s.formal === '')
    }
    t = t.filter((s) => sameLembaga(s.formal, filters.formal))
    if (through === 'lembaga') return t
    if (kelasFormalFilter) {
      t = t.filter((s) => (s.kelas_formal || '') === kelasFormalFilter)
    }
    if (through === 'lembaga_kelas') return t
    if (kelFormalFilter) {
      t = t.filter((s) => (s.kel_formal || '') === kelFormalFilter)
    }
    return t
  }

  useEffect(() => {
    if (!kategoriFilter) {
      setApiDaerahFilterOptions([])
      return
    }
    let cancelled = false
    pendaftaranAPI.getDaerahOptions(kategoriFilter).then((res) => {
      if (cancelled) return
      const list = res?.success && Array.isArray(res.data) ? res.data : []
      setApiDaerahFilterOptions(list)
    }).catch(() => {
      if (!cancelled) setApiDaerahFilterOptions([])
    })
    return () => {
      cancelled = true
    }
  }, [kategoriFilter])

  useEffect(() => {
    if (!daerahFilter || !kategoriFilter) return
    const ok = apiDaerahFilterOptions.some((d) => String(d.daerah) === String(daerahFilter))
    if (!ok) setDaerahFilter('')
  }, [apiDaerahFilterOptions, daerahFilter, kategoriFilter])

  useEffect(() => {
    if (!daerahFilter && kamarFilter) setKamarFilter('')
  }, [daerahFilter, kamarFilter])

  // Default status: semua tercentang kecuali boyong (normalized); merge status baru dari sync
  useEffect(() => {
    if (!isOpen || santriList.length === 0) return
    setStatusSantriFilter((prev) => {
      const norms = new Set()
      santriList.forEach((s) => {
        const r = s.status_santri
        if (!r || r === '') norms.add('__NULL__')
        else norms.add(normalizeStatusSantri(r))
      })
      const allKeys = [...norms]
      if (prev === null) {
        return allKeys.filter((k) => k !== 'boyong')
      }
      const prevSet = new Set(prev)
      const next = [...prev]
      for (const k of allKeys) {
        if (!prevSet.has(k) && k !== 'boyong') next.push(k)
      }
      return next
    })
  }, [isOpen, santriList])

  // Ambil daftar tahun ajaran dari API
  const fetchTahunAjaranList = async () => {
    try {
      const result = await pendaftaranAPI.getTahunAjaranList()
      if (result.success && result.data) {
        // Handle format baru (object dengan tahun_hijriyah dan tahun_masehi)
        if (result.data.tahun_hijriyah && result.data.tahun_masehi) {
          const hijriyahOptions = result.data.tahun_hijriyah.map(tahun => ({
            value: tahun,
            label: tahun
          }))
          const masehiOptions = result.data.tahun_masehi.map(tahun => ({
            value: tahun,
            label: tahun
          }))
          setTahunHijriyahOptions(hijriyahOptions)
          setTahunMasehiOptions(masehiOptions)
        } else {
          // Fallback untuk format lama (array)
          const options = Array.isArray(result.data) ? result.data.map(tahun => ({
            value: tahun,
            label: tahun
          })) : []
          setTahunHijriyahOptions(options)
          setTahunMasehiOptions([])
        }
      }
    } catch (error) {
      console.error('Error fetching tahun ajaran list:', error)
      setTahunHijriyahOptions([])
      setTahunMasehiOptions([])
    }
  }

  // Ambil data pendaftar IDs dari API
  const fetchPendaftarIds = async (tahunHijriyah = null, tahunMasehi = null) => {
    try {
      const result = await pendaftaranAPI.getPendaftarIds(tahunHijriyah, tahunMasehi)
      if (result.success && result.data) {
        setPendaftarIds(result.data)
      }
    } catch (error) {
      console.error('Error fetching pendaftar IDs:', error)
      setPendaftarIds([])
    }
  }

  // UI mengikuti IndexedDB (Dexie liveQuery)
  useEffect(() => {
    const sub = subscribeSantriRowsOrdered(setSantriList)
    return () => sub.unsubscribe()
  }, [])

  const fetchSantriListFull = useCallback(async () => {
    setLoading(true)
    setSyncError('')
    setStreamProgress({ active: true, loaded: 0, total: null })
    try {
      const rows = await fetchAndApplyFullSantriIndex({
        onProgress: (loaded, total) => {
          setStreamProgress({ active: true, loaded, total })
        },
      })
      if (rows.length === 0) {
        setSyncError('Tidak ada data santri dari server')
      }
    } catch (error) {
      console.error('Error fetching santri list:', error)
      setSyncError(error?.message || 'Gagal memuat daftar santri')
    } finally {
      setLoading(false)
      setStreamProgress((p) => ({ ...p, active: false }))
    }
  }, [])

  const handleSync = async () => {
    setSyncing(true)
    setSyncError('')
    setStreamProgress({ active: true, loaded: 0, total: null })
    try {
      const rows = await fetchAndApplyFullSantriIndex({
        onProgress: (loaded, total) => {
          setStreamProgress({ active: true, loaded, total })
        },
      })
      if (rows.length === 0) {
        setSyncError('Tidak ada data santri dari server')
      }
    } catch (error) {
      console.error('Error syncing data:', error)
      setSyncError(error?.message || 'Gagal memuat daftar santri')
    } finally {
      setSyncing(false)
      setStreamProgress((p) => ({ ...p, active: false }))
    }
  }

  // Get unique values untuk filter options
  const getUniqueValues = (key, list) => {
    const values = list.map(s => s[key]).filter(v => v !== null && v !== '')
    return [...new Set(values)].sort((a, b) => a.localeCompare(b, 'id'))
  }

  const listForStatusOptions = useMemo(() => {
    let list = [...santriList]
    if (isPendaftarOnly && pendaftarIds.length > 0) {
      list = list.filter((s) => pendaftarIds.includes(s.id))
    }
    return applyTidakSekolahKategoriDaerahKamar(list)
  }, [
    santriList,
    isPendaftarOnly,
    pendaftarIds,
    tidakDiniyahFilter,
    tidakFormalFilter,
    kategoriFilter,
    daerahFilter,
    kamarFilter,
  ])

  const dynamicUniqueStatusSantri = useMemo(() => {
    const filtered = listForStatusOptions
    const map = new Map()
    for (const s of filtered) {
      const raw = s.status_santri
      const empty = !raw || raw === ''
      const norm = empty ? '__NULL__' : normalizeStatusSantri(raw)
      if (!map.has(norm)) {
        map.set(norm, {
          value: empty ? '' : String(raw),
          norm,
          count: 0,
        })
      }
      map.get(norm).count += 1
    }
    return [...map.values()].sort((a, b) => {
      if (a.norm === '__NULL__') return 1
      if (b.norm === '__NULL__') return -1
      return (a.value || '').localeCompare(b.value || '', 'id')
    })
  }, [listForStatusOptions])

  const listForKategoriOptions = useMemo(() => {
    let list = [...santriList]
    if (isPendaftarOnly && pendaftarIds.length > 0) {
      list = list.filter((s) => pendaftarIds.includes(s.id))
    }
    if (tidakDiniyahFilter) list = list.filter((s) => s.diniyah == null || s.diniyah === '')
    if (tidakFormalFilter) list = list.filter((s) => s.formal == null || s.formal === '')
    if (daerahFilter) list = list.filter((s) => (s.daerah || '') === daerahFilter)
    if (kamarFilter) list = list.filter((s) => (s.kamar || '') === kamarFilter)
    list = applyStatusToList(list, statusSantriFilter)
    return list
  }, [
    santriList,
    isPendaftarOnly,
    pendaftarIds,
    tidakDiniyahFilter,
    tidakFormalFilter,
    daerahFilter,
    kamarFilter,
    statusSantriFilter,
  ])

  const dynamicUniqueKategori = useMemo(() => {
    const filtered = listForKategoriOptions
    const values = [
      ...new Set(
        filtered
          .map((s) => ((s.kategori != null && s.kategori !== '') ? String(s.kategori) : null))
          .filter(Boolean)
      ),
    ]
    return values
      .map((val) => ({
        value: val,
        count: filtered.filter((s) => (s.kategori || '') === val).length,
      }))
      .sort((a, b) => (a.value || '').localeCompare(b.value || '', 'id'))
  }, [listForKategoriOptions])

  const daerahFilterDropdown = useMemo(() => {
    if (!kategoriFilter) return []
    return apiDaerahFilterOptions.map((d) => {
      const label = String(d.daerah ?? '')
      const count = santriList.filter(
        (s) => (s.kategori || '') === kategoriFilter && String(s.daerah || '') === label
      ).length
      return { value: label, count }
    })
  }, [kategoriFilter, apiDaerahFilterOptions, santriList])

  const dynamicUniqueKamar = useMemo(() => {
    if (!kategoriFilter) return []
    let filtered = [...santriList]
    if (isPendaftarOnly && pendaftarIds.length > 0) {
      filtered = filtered.filter((s) => pendaftarIds.includes(s.id))
    }
    if (tidakDiniyahFilter) filtered = filtered.filter((s) => s.diniyah == null || s.diniyah === '')
    if (tidakFormalFilter) filtered = filtered.filter((s) => s.formal == null || s.formal === '')
    if (kategoriFilter) filtered = filtered.filter((s) => (s.kategori || '') === kategoriFilter)
    if (daerahFilter) filtered = filtered.filter((s) => (s.daerah || '') === daerahFilter)
    filtered = applyStatusToList(filtered, statusSantriFilter)
    const values = [
      ...new Set(
        filtered
          .map((s) => ((s.kamar != null && s.kamar !== '') ? String(s.kamar) : null))
          .filter(Boolean)
      ),
    ]
    return values
      .map((val) => ({
        value: val,
        count: filtered.filter((s) => (s.kamar || '') === val).length,
      }))
      .sort((a, b) => (a.value || '').localeCompare(b.value || '', 'id'))
  }, [
    santriList,
    isPendaftarOnly,
    pendaftarIds,
    tidakDiniyahFilter,
    tidakFormalFilter,
    kategoriFilter,
    daerahFilter,
    statusSantriFilter,
  ])

  const uniqueRombelCol = (list, col) => {
    const vals = [...new Set(list.map((s) => s[col]).filter((v) => v != null && v !== '').map(String))]
    return vals
      .sort((a, b) => a.localeCompare(b, 'id'))
      .map((value) => ({
        value,
        count: list.filter((s) => String(s[col] ?? '') === value).length,
      }))
  }

  const diniyahLembagaOptions = useMemo(() => {
    let t = buildListAfterCommon(santriList)
    t = applyLttqGenderToList(t, {})
    t = applyFormalChain(t, { through: 'all' })
    const values = [...new Set(t.map((s) => s.diniyah).filter((v) => v != null && v !== '').map(String))]
    return values
      .sort((a, b) => a.localeCompare(b, 'id'))
      .map((value) => ({
        value,
        count: t.filter((s) => String(s.diniyah ?? '') === value).length,
      }))
  }, [
    santriList,
    isPendaftarOnly,
    pendaftarIds,
    tidakDiniyahFilter,
    tidakFormalFilter,
    kategoriFilter,
    daerahFilter,
    kamarFilter,
    statusSantriFilter,
    filters.lttq,
    filters.gender,
    filters.formal,
    kelasDiniyahFilter,
    kelDiniyahFilter,
    kelasFormalFilter,
    kelFormalFilter,
  ])

  const kelasDiniyahOptions = useMemo(() => {
    if (!filters.diniyah || filters.diniyah === '__NULL__') return []
    let t = buildListAfterCommon(santriList)
    t = applyLttqGenderToList(t, {})
    t = applyFormalChain(t, { through: 'all' })
    t = applyDiniyahChain(t, { through: 'lembaga' })
    return uniqueRombelCol(t, 'kelas_diniyah')
  }, [
    santriList,
    isPendaftarOnly,
    pendaftarIds,
    tidakDiniyahFilter,
    tidakFormalFilter,
    kategoriFilter,
    daerahFilter,
    kamarFilter,
    statusSantriFilter,
    filters.lttq,
    filters.gender,
    filters.diniyah,
    filters.formal,
    kelasFormalFilter,
    kelFormalFilter,
  ])

  const kelDiniyahOptions = useMemo(() => {
    if (!filters.diniyah || filters.diniyah === '__NULL__' || !kelasDiniyahFilter) return []
    let t = buildListAfterCommon(santriList)
    t = applyLttqGenderToList(t, {})
    t = applyFormalChain(t, { through: 'all' })
    t = applyDiniyahChain(t, { through: 'lembaga_kelas' })
    return uniqueRombelCol(t, 'kel_diniyah')
  }, [
    santriList,
    isPendaftarOnly,
    pendaftarIds,
    tidakDiniyahFilter,
    tidakFormalFilter,
    kategoriFilter,
    daerahFilter,
    kamarFilter,
    statusSantriFilter,
    filters.lttq,
    filters.gender,
    filters.diniyah,
    filters.formal,
    kelasDiniyahFilter,
    kelasFormalFilter,
    kelFormalFilter,
  ])

  const formalLembagaOptions = useMemo(() => {
    let t = buildListAfterCommon(santriList)
    t = applyLttqGenderToList(t, {})
    t = applyDiniyahChain(t, { through: 'all' })
    const values = [...new Set(t.map((s) => s.formal).filter((v) => v != null && v !== '').map(String))]
    return values
      .sort((a, b) => a.localeCompare(b, 'id'))
      .map((value) => ({
        value,
        count: t.filter((s) => String(s.formal ?? '') === value).length,
      }))
  }, [
    santriList,
    isPendaftarOnly,
    pendaftarIds,
    tidakDiniyahFilter,
    tidakFormalFilter,
    kategoriFilter,
    daerahFilter,
    kamarFilter,
    statusSantriFilter,
    filters.lttq,
    filters.gender,
    filters.diniyah,
    kelasDiniyahFilter,
    kelDiniyahFilter,
  ])

  const kelasFormalOptions = useMemo(() => {
    if (!filters.formal || filters.formal === '__NULL__') return []
    let t = buildListAfterCommon(santriList)
    t = applyLttqGenderToList(t, {})
    t = applyDiniyahChain(t, { through: 'all' })
    t = applyFormalChain(t, { through: 'lembaga' })
    return uniqueRombelCol(t, 'kelas_formal')
  }, [
    santriList,
    isPendaftarOnly,
    pendaftarIds,
    tidakDiniyahFilter,
    tidakFormalFilter,
    kategoriFilter,
    daerahFilter,
    kamarFilter,
    statusSantriFilter,
    filters.lttq,
    filters.gender,
    filters.diniyah,
    filters.formal,
    kelasDiniyahFilter,
    kelDiniyahFilter,
  ])

  const kelFormalOptions = useMemo(() => {
    if (!filters.formal || filters.formal === '__NULL__' || !kelasFormalFilter) return []
    let t = buildListAfterCommon(santriList)
    t = applyLttqGenderToList(t, {})
    t = applyDiniyahChain(t, { through: 'all' })
    t = applyFormalChain(t, { through: 'lembaga_kelas' })
    return uniqueRombelCol(t, 'kel_formal')
  }, [
    santriList,
    isPendaftarOnly,
    pendaftarIds,
    tidakDiniyahFilter,
    tidakFormalFilter,
    kategoriFilter,
    daerahFilter,
    kamarFilter,
    statusSantriFilter,
    filters.lttq,
    filters.gender,
    filters.diniyah,
    filters.formal,
    kelasDiniyahFilter,
    kelDiniyahFilter,
    kelasFormalFilter,
  ])

  // Filter list berdasarkan query dan filters
  const applyFilters = () => {
    let filtered = [...santriList]

    if (allowedIdSet) {
      filtered = filtered.filter((s) => allowedIdSet.has(Number(s.id)))
    }

    if (isPendaftarOnly && pendaftarIds.length > 0) {
      filtered = filtered.filter((s) => pendaftarIds.includes(s.id))
    }

    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(
        (s) =>
          (s.nis && s.nis.toString().toLowerCase().includes(query)) ||
          (s.id && s.id.toString().toLowerCase().includes(query)) ||
          (s.nama && s.nama.toLowerCase().includes(query))
      )
    }

    filtered = applyTidakSekolahKategoriDaerahKamar(filtered)
    filtered = applyStatusToList(filtered, statusSantriFilter)
    filtered = applyLttqGenderToList(filtered, {})
    filtered = applyDiniyahChain(filtered, { through: 'all' })
    filtered = applyFormalChain(filtered, { through: 'all' })

    const displayCap = searchQuery.trim() ? filtered.length : 50
    setFilteredList(filtered.slice(0, displayCap))
  }

  // Handle filter change
  const handleFilterChange = (key, value) => {
    setFilters((prev) => ({
      ...prev,
      [key]: value,
    }))
    if (key === 'diniyah') {
      setKelasDiniyahFilter('')
      setKelDiniyahFilter('')
    }
    if (key === 'formal') {
      setKelasFormalFilter('')
      setKelFormalFilter('')
    }
  }

  const resetAllFilters = useCallback(() => {
    setSearchQuery('')
    setKategoriFilter('')
    setDaerahFilter('')
    setKamarFilter('')
    setTidakDiniyahFilter(false)
    setTidakFormalFilter(false)
    setApiDaerahFilterOptions([])
    setIsStatusFilterOpen(false)
    setFilters({ diniyah: '', formal: '', lttq: '', gender: '' })
    setKelasDiniyahFilter('')
    setKelDiniyahFilter('')
    setKelasFormalFilter('')
    setKelFormalFilter('')
    setIsPendaftarOnly(false)
    setSelectedTahunAjaran('')
    setSelectedTahunMasehi('')
    setPendaftarIds([])
    if (santriList.length === 0) {
      setStatusSantriFilter(null)
      return
    }
    const norms = new Set()
    santriList.forEach((s) => {
      const r = s.status_santri
      if (!r || r === '') norms.add('__NULL__')
      else norms.add(normalizeStatusSantri(r))
    })
    setStatusSantriFilter([...norms].filter((k) => k !== 'boyong'))
  }, [santriList])

  // Handle select santri — prioritas baris penuh (untuk form yang perlu id DB); fallback NIS ke parent
  const handleSelectSantri = (santri) => {
    if (onSelectSantriRecord) {
      onSelectSantriRecord(santri)
      onClose()
      return
    }
    if (onSelectSantri) {
      const nisAtauId = (santri.nis != null && santri.nis !== '')
        ? String(santri.nis)
        : String(santri.id ?? '').padStart(7, '0')
      onSelectSantri(nisAtauId)
    }
    onClose()
  }

  const openDetailSantriFromRow = useCallback(
    (santri, e) => {
      e?.stopPropagation?.()
      e?.preventDefault?.()
      if (!santri || (santri.id == null && santri.nis == null)) return
      const stackBaseZIndex = stackBaseZForSantriDetailAboveSearch(zIndex)
      openSantriDetail(santri, {
        onEditSaved: () => {
          void fetchSantriDeltaQuiet()
        },
        stackBaseZIndex,
      })
    },
    [openSantriDetail, zIndex, fetchSantriDeltaQuiet]
  )

  // Buka offcanvas: tahun ajaran + sinkron (penuh jika cache kosong / tanpa watermark; kalau tidak, delta diam-diam)
  useEffect(() => {
    if (!isOpen) return
    fetchTahunAjaranList()
    let cancelled = false
    ;(async () => {
      const n = await countSantriRows()
      if (cancelled) return
      const complete = n > 0 ? await isSantriIndexComplete() : false
      if (cancelled) return
      if (n === 0 || !complete) {
        await fetchSantriListFull()
        return
      }
      const since = await getLocalSantriSinceWatermark()
      if (cancelled) return
      if (!since) {
        await fetchSantriListFull()
        return
      }
      await fetchSantriDeltaQuiet()
    })()
    return () => {
      cancelled = true
    }
  }, [isOpen, fetchSantriListFull])

  // Fetch pendaftar IDs saat checkbox dicentang atau tahun ajaran berubah
  useEffect(() => {
    if (isOpen && isPendaftarOnly && (selectedTahunAjaran || selectedTahunMasehi)) {
      fetchPendaftarIds(selectedTahunAjaran || null, selectedTahunMasehi || null)
    } else if (isOpen && !isPendaftarOnly) {
      setPendaftarIds([])
    }
  }, [isPendaftarOnly, selectedTahunAjaran, selectedTahunMasehi, isOpen])

  // Apply filters saat search query atau filters berubah
  useEffect(() => {
    applyFilters()
  }, [
    searchQuery,
    filters,
    santriList,
    isPendaftarOnly,
    pendaftarIds,
    statusSantriFilter,
    kategoriFilter,
    daerahFilter,
    kamarFilter,
    tidakDiniyahFilter,
    tidakFormalFilter,
    kelasDiniyahFilter,
    kelDiniyahFilter,
    kelasFormalFilter,
    kelFormalFilter,
    allowedIdSet,
  ])

  const getFilterOptions = (key) => {
    let tempList = buildListAfterCommon(santriList)
    tempList = applyDiniyahChain(tempList, { through: 'all' })
    tempList = applyFormalChain(tempList, { through: 'all' })
    if (key === 'lttq') {
      tempList = applyLttqGenderToList(tempList, { skipLttq: true })
    } else if (key === 'gender') {
      tempList = applyLttqGenderToList(tempList, { skipGender: true })
    }
    return getUniqueValues(key, tempList)
  }

  const filterConfig = [
    [
      { key: 'lttq', label: 'LTTQ' },
      { key: 'gender', label: 'Gender' },
    ],
  ]

  const rombelMotion = {
    initial: { opacity: 0, x: -14, scale: 0.98 },
    animate: { opacity: 1, x: 0, scale: 1 },
    exit: { opacity: 0, x: -14, scale: 0.98 },
    transition: { duration: 0.28, ease: [0.4, 0, 0.2, 1] },
  }

  const statusDropdownZ = Math.max(9999, zIndex + 100)

  useEffect(() => {
    const updatePosition = () => {
      if (statusFilterButtonRef.current) {
        const rect = statusFilterButtonRef.current.getBoundingClientRect()
        setStatusFilterPosition({
          top: rect.bottom + window.scrollY + 4,
          left: rect.left + window.scrollX,
          width: rect.width,
        })
      }
    }
    if (isStatusFilterOpen) {
      updatePosition()
      window.addEventListener('scroll', updatePosition, true)
      window.addEventListener('resize', updatePosition)
    }
    return () => {
      window.removeEventListener('scroll', updatePosition, true)
      window.removeEventListener('resize', updatePosition)
    }
  }, [isStatusFilterOpen])

  useEffect(() => {
    if (!isFilterOpen) setIsStatusFilterOpen(false)
  }, [isFilterOpen])

  useEffect(() => {
    const handleClickOutside = (event) => {
      const inBtn = statusFilterButtonRef.current?.contains(event.target)
      const inDrop = statusFilterDropdownRef.current?.contains(event.target)
      const inBox = statusFilterRef.current?.contains(event.target)
      if (!inBtn && !inDrop && !inBox) setIsStatusFilterOpen(false)
    }
    if (isStatusFilterOpen) {
      const t = setTimeout(() => document.addEventListener('mousedown', handleClickOutside), 0)
      return () => {
        clearTimeout(t)
        document.removeEventListener('mousedown', handleClickOutside)
      }
    }
    return undefined
  }, [isStatusFilterOpen])

  if (!canCariSantri) return null

  return (
    <AnimatePresence mode="wait">
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 bg-black bg-opacity-50"
            style={{ willChange: 'opacity', zIndex: zIndex - 1 }}
          />

          {/* Offcanvas */}
          <motion.div
            key="offcanvas"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ 
              type: 'tween', 
              duration: 0.35,
              ease: [0.25, 0.1, 0.25, 1] // Easing yang lebih smooth
            }}
            className="fixed inset-y-0 right-0 w-full sm:w-96 lg:w-[500px] bg-white dark:bg-gray-800 shadow-xl flex flex-col"
            style={{ 
              willChange: 'transform',
              backfaceVisibility: 'hidden', // Optimasi untuk animasi
              zIndex: zIndex
            }}
          >
            {/* Header */}
            <div className="p-6 border-b border-gray-200 dark:border-gray-700">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold text-teal-600 dark:text-teal-400">Cari Santri</h2>
                <button
                  onClick={onClose}
                  className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                  </svg>
                </button>
              </div>

              {/* Search Input dengan tombol di kanan */}
              <div className="relative pb-2">
                <div className="relative">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onFocus={() => setIsInputFocused(true)}
                    onBlur={() => setIsInputFocused(false)}
                    className="w-full p-2 pr-[7.5rem] sm:pr-36 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
                    placeholder="Cari NIS atau Nama Santri"
                    autoFocus
                  />
                  {/* Tombol Filter, reset filter, dan Sync di kanan */}
                  <div className="absolute right-0 top-0 bottom-0 flex items-center gap-0.5 pr-0.5 pointer-events-none">
                  <button
                    type="button"
                    onClick={() => setIsFilterOpen(!isFilterOpen)}
                    className="bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 p-1.5 rounded text-xs flex items-center gap-1 transition-colors pointer-events-auto"
                    title={isFilterOpen ? 'Sembunyikan Filter' : 'Tampilkan Filter'}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"></path>
                    </svg>
                    {isFilterOpen ? (
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 15l7-7 7 7"></path>
                      </svg>
                    ) : (
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path>
                      </svg>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={resetAllFilters}
                    className="bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 p-1.5 rounded text-xs flex items-center justify-center transition-colors pointer-events-auto"
                    title="Reset filter & pencarian"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3"
                      />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={handleSync}
                    disabled={syncing}
                    className="bg-teal-500 hover:bg-teal-600 text-white p-1.5 rounded text-xs flex items-center gap-1 transition-colors disabled:opacity-50 pointer-events-auto"
                    title="Perbarui dari server (simpan ke cache lokal)"
                  >
                    {syncing ? (
                      <svg className="animate-spin w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
                      </svg>
                    )}
                  </button>
                </div>
                </div>
                {/* Border bawah yang sampai ke kanan */}
                <div className="absolute left-0 right-0 bottom-0 h-0.5 bg-gray-300 dark:bg-gray-600"></div>
                <div className={`absolute left-0 right-0 bottom-0 h-0.5 bg-teal-500 dark:bg-teal-400 transition-opacity ${isInputFocused ? 'opacity-100' : 'opacity-0'}`}></div>
              </div>
            </div>

            <ManageDataStreamProgress
              active={streamProgress.active || loading || syncing}
              loaded={streamProgress.loaded || santriList.length}
              total={streamProgress.total}
              errorMessage={syncError}
            />

            {/* Filter Container dengan Accordion */}
            <AnimatePresence>
              {isFilterOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50"
                >
                  <div className="px-6 py-2">
                    <motion.div layout className="flex flex-wrap gap-2 mb-2 items-center">
                      <div className="relative" ref={statusFilterRef}>
                        <button
                          ref={statusFilterButtonRef}
                          type="button"
                          disabled={statusSantriFilter === null}
                          onClick={() => setIsStatusFilterOpen(!isStatusFilterOpen)}
                          className="border border-gray-300 dark:border-gray-600 rounded p-1 h-7 min-w-0 text-xs bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-1 focus:ring-teal-400 flex items-center justify-between gap-1 px-2 disabled:opacity-50"
                          style={{ minWidth: '128px' }}
                        >
                          <span className="truncate">
                            {statusSantriFilter === null
                              ? 'Status…'
                              : statusSantriFilter.length === 0
                                ? 'Status santri'
                                : statusSantriFilter.length === 1
                                  ? (() => {
                                      const item = dynamicUniqueStatusSantri.find((s) => s.norm === statusSantriFilter[0])
                                      if (item?.norm === '__NULL__') return '(Tanpa status)'
                                      return item?.value || statusSantriFilter[0]
                                    })()
                                  : `${statusSantriFilter.length} dipilih`}
                          </span>
                          <svg
                            className={`w-3 h-3 flex-shrink-0 transition-transform ${isStatusFilterOpen ? 'rotate-180' : ''}`}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                      </div>
                      <select
                        value={kategoriFilter}
                        onChange={(e) => {
                          setKategoriFilter(e.target.value)
                          setDaerahFilter('')
                          setKamarFilter('')
                        }}
                        className="border border-gray-300 dark:border-gray-600 rounded p-1 h-7 min-w-0 text-xs bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-1 focus:ring-teal-400"
                      >
                        <option value="">Kategori</option>
                        {dynamicUniqueKategori.map((item) => (
                          <option key={item.value} value={item.value}>
                            {item.value} ({item.count})
                          </option>
                        ))}
                      </select>
                      <AnimatePresence mode="popLayout">
                        {kategoriFilter ? (
                          <motion.div
                            key="daerah-filter"
                            initial={{ opacity: 0, x: -14, scale: 0.98 }}
                            animate={{ opacity: 1, x: 0, scale: 1 }}
                            exit={{ opacity: 0, x: -14, scale: 0.98 }}
                            transition={{ duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
                            className="inline-flex shrink-0"
                          >
                            <select
                              value={daerahFilter}
                              onChange={(e) => {
                                setDaerahFilter(e.target.value)
                                setKamarFilter('')
                              }}
                              className="border border-gray-300 dark:border-gray-600 rounded p-1 h-7 min-w-0 text-xs bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-1 focus:ring-teal-400"
                            >
                              <option value="">Daerah</option>
                              {daerahFilterDropdown.map((item) => (
                                <option key={item.value} value={item.value}>
                                  {item.value} ({item.count})
                                </option>
                              ))}
                            </select>
                          </motion.div>
                        ) : null}
                      </AnimatePresence>
                      <AnimatePresence mode="popLayout">
                        {kategoriFilter && daerahFilter ? (
                          <motion.div
                            key="kamar-filter"
                            initial={{ opacity: 0, x: -14, scale: 0.98 }}
                            animate={{ opacity: 1, x: 0, scale: 1 }}
                            exit={{ opacity: 0, x: -14, scale: 0.98 }}
                            transition={{ duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
                            className="inline-flex shrink-0"
                          >
                            <select
                              value={kamarFilter}
                              onChange={(e) => setKamarFilter(e.target.value)}
                              className="border border-gray-300 dark:border-gray-600 rounded p-1 h-7 min-w-0 text-xs bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-1 focus:ring-teal-400"
                            >
                              <option value="">Kamar</option>
                              {dynamicUniqueKamar.map((item) => (
                                <option key={item.value} value={item.value}>
                                  {item.value} ({item.count})
                                </option>
                              ))}
                            </select>
                          </motion.div>
                        ) : null}
                      </AnimatePresence>
                    </motion.div>
                    <motion.div layout className="flex flex-wrap gap-2 mb-2 items-center">
                      <select
                        value={filters.diniyah || ''}
                        disabled={tidakDiniyahFilter}
                        onChange={(e) => handleFilterChange('diniyah', e.target.value)}
                        className="border border-gray-300 dark:border-gray-600 rounded p-1 h-7 min-w-0 text-xs bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-1 focus:ring-teal-400 disabled:opacity-50"
                      >
                        <option value="">Diniyah</option>
                        {diniyahLembagaOptions.map((item) => (
                          <option key={item.value} value={item.value}>
                            {item.value} ({item.count})
                          </option>
                        ))}
                        {buildListAfterCommon(santriList).some((s) => !s.diniyah || s.diniyah === '') && (
                          <option value="__NULL__">Kosong/Null</option>
                        )}
                      </select>
                      <AnimatePresence mode="popLayout">
                        {filters.diniyah && filters.diniyah !== '__NULL__' ? (
                          <motion.div key="kelas-diniyah" className="inline-flex shrink-0" {...rombelMotion}>
                            <select
                              value={kelasDiniyahFilter}
                              onChange={(e) => {
                                setKelasDiniyahFilter(e.target.value)
                                setKelDiniyahFilter('')
                              }}
                              className="border border-gray-300 dark:border-gray-600 rounded p-1 h-7 min-w-0 text-xs bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-1 focus:ring-teal-400"
                            >
                              <option value="">Kelas</option>
                              {kelasDiniyahOptions.map((item) => (
                                <option key={item.value} value={item.value}>
                                  {String(item.value)} ({item.count})
                                </option>
                              ))}
                            </select>
                          </motion.div>
                        ) : null}
                      </AnimatePresence>
                      <AnimatePresence mode="popLayout">
                        {filters.diniyah && filters.diniyah !== '__NULL__' && kelasDiniyahFilter ? (
                          <motion.div key="kel-diniyah" className="inline-flex shrink-0" {...rombelMotion}>
                            <select
                              value={kelDiniyahFilter}
                              onChange={(e) => setKelDiniyahFilter(e.target.value)}
                              className="border border-gray-300 dark:border-gray-600 rounded p-1 h-7 min-w-0 text-xs bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-1 focus:ring-teal-400"
                            >
                              <option value="">Kel</option>
                              {kelDiniyahOptions.map((item) => (
                                <option key={item.value} value={item.value}>
                                  {String(item.value)} ({item.count})
                                </option>
                              ))}
                            </select>
                          </motion.div>
                        ) : null}
                      </AnimatePresence>
                    </motion.div>
                    <motion.div layout className="flex flex-wrap gap-2 mb-2 items-center">
                      <select
                        value={filters.formal || ''}
                        disabled={tidakFormalFilter}
                        onChange={(e) => handleFilterChange('formal', e.target.value)}
                        className="border border-gray-300 dark:border-gray-600 rounded p-1 h-7 min-w-0 text-xs bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-1 focus:ring-teal-400 disabled:opacity-50"
                      >
                        <option value="">Formal</option>
                        {formalLembagaOptions.map((item) => (
                          <option key={item.value} value={item.value}>
                            {item.value} ({item.count})
                          </option>
                        ))}
                        {buildListAfterCommon(santriList).some((s) => !s.formal || s.formal === '') && (
                          <option value="__NULL__">Kosong/Null</option>
                        )}
                      </select>
                      <AnimatePresence mode="popLayout">
                        {filters.formal && filters.formal !== '__NULL__' ? (
                          <motion.div key="kelas-formal" className="inline-flex shrink-0" {...rombelMotion}>
                            <select
                              value={kelasFormalFilter}
                              onChange={(e) => {
                                setKelasFormalFilter(e.target.value)
                                setKelFormalFilter('')
                              }}
                              className="border border-gray-300 dark:border-gray-600 rounded p-1 h-7 min-w-0 text-xs bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-1 focus:ring-teal-400"
                            >
                              <option value="">Kelas</option>
                              {kelasFormalOptions.map((item) => (
                                <option key={item.value} value={item.value}>
                                  {String(item.value)} ({item.count})
                                </option>
                              ))}
                            </select>
                          </motion.div>
                        ) : null}
                      </AnimatePresence>
                      <AnimatePresence mode="popLayout">
                        {filters.formal && filters.formal !== '__NULL__' && kelasFormalFilter ? (
                          <motion.div key="kel-formal" className="inline-flex shrink-0" {...rombelMotion}>
                            <select
                              value={kelFormalFilter}
                              onChange={(e) => setKelFormalFilter(e.target.value)}
                              className="border border-gray-300 dark:border-gray-600 rounded p-1 h-7 min-w-0 text-xs bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-1 focus:ring-teal-400"
                            >
                              <option value="">Kel</option>
                              {kelFormalOptions.map((item) => (
                                <option key={item.value} value={item.value}>
                                  {String(item.value)} ({item.count})
                                </option>
                              ))}
                            </select>
                          </motion.div>
                        ) : null}
                      </AnimatePresence>
                    </motion.div>
                    {filterConfig.map((row, rowIndex) => (
                      <motion.div
                        layout
                        key={rowIndex}
                        className="flex flex-wrap gap-2 mb-2 last:mb-0"
                      >
                        {row.map((filter) => (
                          <select
                            key={filter.key}
                            value={filters[filter.key] || ''}
                            onChange={(e) => handleFilterChange(filter.key, e.target.value)}
                            className="border border-gray-300 dark:border-gray-600 rounded p-1 h-7 min-w-0 text-xs bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-1 focus:ring-teal-400"
                          >
                            <option value="">{filter.label}</option>
                            {getFilterOptions(filter.key).map((opt) => (
                              <option key={opt} value={opt}>
                                {opt}
                              </option>
                            ))}
                            {santriList.some((s) => !s[filter.key] || s[filter.key] === '') && (
                              <option value="__NULL__">Kosong/Null</option>
                            )}
                          </select>
                        ))}
                      </motion.div>
                    ))}
                    <motion.div
                      layout
                      className="flex flex-col gap-3 pt-2 mt-2 border-t border-gray-200 dark:border-gray-700"
                    >
                      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
                        <label className="inline-flex shrink-0 items-center gap-2 cursor-pointer select-none text-xs text-gray-700 dark:text-gray-300">
                          <input
                            type="checkbox"
                            checked={isPendaftarOnly}
                            onChange={(e) => setIsPendaftarOnly(e.target.checked)}
                            className="rounded border-gray-300 dark:border-gray-600 text-teal-600 focus:ring-teal-500"
                          />
                          Pendaftar
                        </label>
                        {isPendaftarOnly && (
                          <div className="flex min-w-0 flex-1 flex-wrap gap-2">
                            <select
                              value={selectedTahunAjaran || ''}
                              onChange={(e) => setSelectedTahunAjaran(e.target.value)}
                              className="min-w-[8rem] flex-1 border border-gray-300 dark:border-gray-600 rounded p-1 h-7 text-xs bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-1 focus:ring-teal-400"
                            >
                              <option value="">Tahun Hijriyah</option>
                              {tahunHijriyahOptions.length === 0 ? (
                                <option value="">Tidak ada data</option>
                              ) : (
                                tahunHijriyahOptions.map((option) => (
                                  <option key={option.value} value={option.value}>
                                    {option.label}
                                  </option>
                                ))
                              )}
                            </select>
                            <select
                              value={selectedTahunMasehi || ''}
                              onChange={(e) => setSelectedTahunMasehi(e.target.value)}
                              className="min-w-[8rem] flex-1 border border-gray-300 dark:border-gray-600 rounded p-1 h-7 text-xs bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-1 focus:ring-teal-400"
                            >
                              <option value="">Tahun Masehi</option>
                              {tahunMasehiOptions.length === 0 ? (
                                <option value="">Tidak ada data</option>
                              ) : (
                                tahunMasehiOptions.map((option) => (
                                  <option key={option.value} value={option.value}>
                                    {option.label}
                                  </option>
                                ))
                              )}
                            </select>
                          </div>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-4">
                        <label className="inline-flex items-center gap-2 cursor-pointer select-none text-xs text-gray-700 dark:text-gray-300">
                          <input
                            type="checkbox"
                            checked={tidakDiniyahFilter}
                            onChange={(e) => setTidakDiniyahFilter(e.target.checked)}
                            className="rounded border-gray-300 dark:border-gray-600 text-teal-600 focus:ring-teal-500"
                          />
                          Tidak Sekolah Diniyah
                        </label>
                        <label className="inline-flex items-center gap-2 cursor-pointer select-none text-xs text-gray-700 dark:text-gray-300">
                          <input
                            type="checkbox"
                            checked={tidakFormalFilter}
                            onChange={(e) => setTidakFormalFilter(e.target.checked)}
                            className="rounded border-gray-300 dark:border-gray-600 text-teal-600 focus:ring-teal-500"
                          />
                          Tidak Sekolah Formal
                        </label>
                      </div>
                    </motion.div>
                    {isStatusFilterOpen &&
                      createPortal(
                        <AnimatePresence>
                          <motion.div
                            ref={statusFilterDropdownRef}
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ duration: 0.2 }}
                            className="fixed bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded shadow-lg max-h-60 overflow-y-auto"
                            style={{
                              top: `${statusFilterPosition.top}px`,
                              left: `${statusFilterPosition.left}px`,
                              width: `${Math.max(statusFilterPosition.width, 200)}px`,
                              zIndex: statusDropdownZ,
                            }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="p-2 space-y-1">
                              {dynamicUniqueStatusSantri.map((item) => {
                                const isChecked =
                                  statusSantriFilter != null && statusSantriFilter.includes(item.norm)
                                const label =
                                  item.norm === '__NULL__' ? '(Tanpa status)' : item.value || item.norm
                                return (
                                  <label
                                    key={item.norm}
                                    className="flex items-center gap-2 p-1.5 hover:bg-gray-50 dark:hover:bg-gray-600 rounded cursor-pointer text-xs"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={isChecked}
                                      onChange={(e) => {
                                        e.stopPropagation()
                                        if (e.target.checked) {
                                          setStatusSantriFilter((prev) => {
                                            if (prev === null) return prev
                                            return prev.includes(item.norm) ? prev : [...prev, item.norm]
                                          })
                                        } else {
                                          setStatusSantriFilter((prev) =>
                                            prev === null ? prev : prev.filter((v) => v !== item.norm)
                                          )
                                        }
                                      }}
                                      onClick={(e) => e.stopPropagation()}
                                      className="w-3.5 h-3.5 rounded border-gray-300 dark:border-gray-600 text-teal-600 focus:ring-teal-500"
                                    />
                                    <span className="text-gray-700 dark:text-gray-300 flex-1">
                                      {label} ({item.count})
                                    </span>
                                  </label>
                                )
                              })}
                              {statusSantriFilter != null && statusSantriFilter.length > 0 && (
                                <div className="pt-1 border-t border-gray-200 dark:border-gray-600">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setStatusSantriFilter([])
                                      setIsStatusFilterOpen(false)
                                    }}
                                    className="w-full text-left px-1.5 py-1 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                                  >
                                    Hapus semua
                                  </button>
                                </div>
                              )}
                            </div>
                          </motion.div>
                        </AnimatePresence>,
                        document.body
                      )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Results */}
            <div className="flex-1 overflow-y-auto p-6">
              {loading && santriList.length === 0 ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600 dark:border-teal-400"></div>
                  <span className="ml-3 text-gray-600 dark:text-gray-400">Memuat data...</span>
                </div>
              ) : filteredList.length === 0 ? (
                <p className="text-gray-500 dark:text-gray-400 text-center py-8">
                  {allowedIdSet && !searchQuery.trim() ? restrictedEmptyText : 'Data tidak ditemukan.'}
                </p>
              ) : (
                <div className="space-y-0">
                  {filteredList.map((santri) => (
                    <div
                      key={santri.id}
                      className="flex items-stretch gap-1 border-b border-gray-200 dark:border-gray-700 transition-colors hover:bg-teal-50/80 dark:hover:bg-gray-700/40"
                    >
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => handleSelectSantri(santri)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            handleSelectSantri(santri)
                          }
                        }}
                        className="flex min-w-0 flex-1 cursor-pointer items-center justify-between gap-2 p-2 text-left"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                            <strong>
                              {santri.nis != null && santri.nis !== ''
                                ? santri.nis
                                : String(santri.id ?? '').padStart(7, '0')}
                            </strong>{' '}
                            - {santri.nama || '-'}
                          </p>
                          <div className="mt-1 text-[10px] text-gray-500 dark:text-gray-400">
                            Gender: {santri.gender || '-'} | Diniyah: {santri.diniyah || '-'} | Formal:{' '}
                            {santri.formal || '-'} | Daerah: {santri.daerah || '-'} | Kamar: {santri.kamar || '-'}
                          </div>
                        </div>
                        <div className="ml-2 flex min-w-[70px] shrink-0 flex-col items-end">
                          <span className="mb-0.5 whitespace-nowrap rounded bg-teal-100 px-2 py-0.5 text-[10px] text-teal-700 dark:bg-teal-900/50 dark:text-teal-300">
                            {santri.status_santri || '-'}
                          </span>
                          <span className="whitespace-nowrap rounded bg-gray-100 px-2 py-0.5 text-[10px] text-gray-700 dark:bg-gray-700 dark:text-gray-300">
                            {santri.kategori || '-'}
                          </span>
                        </div>
                      </div>
                      {canDetailSantri ? (
                        <button
                          type="button"
                          onClick={(e) => openDetailSantriFromRow(santri, e)}
                          className="shrink-0 self-center rounded-lg p-2 text-gray-500 hover:bg-gray-200 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-gray-600 dark:hover:text-gray-100"
                          aria-label={`Detail santri — ${santri.nama || santri.nis || santri.id || ''}`}
                          title="Detail santri"
                        >
                          <svg className="h-5 w-5 text-current" viewBox="0 0 24 24" aria-hidden>
                            <circle cx="12" cy="6" r="1.5" fill="currentColor" />
                            <circle cx="12" cy="12" r="1.5" fill="currentColor" />
                            <circle cx="12" cy="18" r="1.5" fill="currentColor" />
                          </svg>
                        </button>
                      ) : null}
                    </div>
                  ))}
                  {!searchQuery.trim() && filteredList.length >= 50 && (
                    <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-2">
                      Menampilkan 50 dari {santriList.length.toLocaleString('id-ID')} santri di cache — ketik nama/NIS untuk mempersempit
                    </p>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

export default SearchOffcanvas

