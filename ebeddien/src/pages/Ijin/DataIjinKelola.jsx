import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { createPortal, flushSync } from 'react-dom'
import axios from 'axios'
import { motion, AnimatePresence } from 'framer-motion'
import { dashboardAPI, lembagaAPI, pendaftaranAPI, santriAPI } from '../../services/api'
import {
  subscribeSantriRowsOrdered,
  applySantriSearchServerPayload,
  getLocalSantriSinceWatermark,
  countSantriRows,
} from '../../services/offcanvasSearchCache'
import { fetchSantriDeltaQuiet } from '../../services/santriIndexedDbSync'
import { useIjinTahunAjaran } from '../../hooks/useIjinTahunAjaran'
import { useOffcanvasBackClose } from '../../hooks/useOffcanvasBackClose'
import ManageDataStreamProgress, { MANAGE_DATA_CHUNK_SIZE } from '../Pembayaran/components/ManageDataStreamProgress'
import { fetchManageDataParallelOffsets } from '../Pembayaran/components/manageDataParallelFetch'
import { EBEDDIEN_IJIN_HINT, ijinHintMatches } from '../../services/ijinLiveEvents'
import BulkEditOffcanvas from './components/BulkEditOffcanvas'
import DetailSantriOffcanvas from './components/DetailSantriOffcanvas'
import ExportIjinOffcanvas from './components/ExportIjinOffcanvas'
import PrintMultipleModal from './components/PrintMultipleModal'
import PrintMultipleOffcanvas from './components/PrintMultipleOffcanvas'
import PrintDataModal from './components/PrintDataModal'
import PrintDataOffcanvas from './components/PrintDataOffcanvas'

const EMPTY_FILTER_VALUE = '__empty__'
const EMPTY_FILTER_LABEL = 'Kosong'

function DataIjin() {
  const tahunAjaran = useIjinTahunAjaran()
  const [loading, setLoading] = useState(false)
  const [ijinLoading, setIjinLoading] = useState(false)
  const [error, setError] = useState('')
  const [streamProgress, setStreamProgress] = useState({ active: false, loaded: 0, total: null })
  const loadAbortRef = useRef(null)
  const ijinLoadAbortRef = useRef(null)
  const [santriList, setSantriList] = useState([])
  const [ijinCountById, setIjinCountById] = useState(() => new Map())
  const [ijinHariIni, setIjinHariIni] = useState(0)
  const [filteredList, setFilteredList] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(50)
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [isInputFocused, setIsInputFocused] = useState(false)
  const [lembagaFilter, setLembagaFilter] = useState('')
  const [kelasFilter, setKelasFilter] = useState('')
  const [kelFilter, setKelFilter] = useState('')
  const [statusSantriFilter, setStatusSantriFilter] = useState(['mukim', 'khoriji'])
  const [isStatusFilterOpen, setIsStatusFilterOpen] = useState(false)
  const [kategoriFilter, setKategoriFilter] = useState([])
  const [isKategoriFilterOpen, setIsKategoriFilterOpen] = useState(false)
  const [daerahFilter, setDaerahFilter] = useState('')
  const [kamarFilter, setKamarFilter] = useState('')
  const [tidakDiniyahFilter, setTidakDiniyahFilter] = useState(false)
  const [tidakFormalFilter, setTidakFormalFilter] = useState(false)
  const [ijinMinFilter, setIjinMinFilter] = useState('')
  const [ijinMaxFilter, setIjinMaxFilter] = useState('')
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' })
  const [selectedItems, setSelectedItems] = useState(new Set())
  const [showBulkEditOffcanvas, setShowBulkEditOffcanvas] = useState(false)
  const [showDetailOffcanvas, setShowDetailOffcanvas] = useState(false)
  const [selectedSantri, setSelectedSantri] = useState(null)
  const closeBulkEditOffcanvas = useOffcanvasBackClose(showBulkEditOffcanvas, () => setShowBulkEditOffcanvas(false))
  const closeDetailSantriOffcanvas = useOffcanvasBackClose(showDetailOffcanvas, () => { setShowDetailOffcanvas(false); setSelectedSantri(null) })
  const [showPrintModal, setShowPrintModal] = useState(false)
  const [showPrintOffcanvas, setShowPrintOffcanvas] = useState(false)
  const [printOptions, setPrintOptions] = useState({ pulangan: false, shohifah: false })
  const [showPrintDataModal, setShowPrintDataModal] = useState(false)
  const [showPrintDataOffcanvas, setShowPrintDataOffcanvas] = useState(false)
  const [selectedPrintColumns, setSelectedPrintColumns] = useState([])
  const [showExportOffcanvas, setShowExportOffcanvas] = useState(false)
  const statusFilterRef = useRef(null)
  const statusFilterButtonRef = useRef(null)
  const statusFilterDropdownRef = useRef(null)
  const [statusFilterPosition, setStatusFilterPosition] = useState({ top: 0, left: 0, width: 0 })
  const kategoriFilterRef = useRef(null)
  const kategoriFilterButtonRef = useRef(null)
  const kategoriFilterDropdownRef = useRef(null)
  const [kategoriFilterPosition, setKategoriFilterPosition] = useState({ top: 0, left: 0, width: 0 })
  const [lembagaRows, setLembagaRows] = useState([])
  const [apiDaerahFilterOptions, setApiDaerahFilterOptions] = useState([])

  const sameLembaga = (a, b) => (a != null && b != null && String(a) === String(b))
  const normalizeStatusSantri = (value) => {
    const raw = String(value ?? '').trim().toLowerCase()
    if (raw === '') return EMPTY_FILTER_VALUE
    if (raw === 'khooriji') return 'khoriji'
    return raw
  }
  const normalizeKategori = (value) => {
    const raw = String(value ?? '').trim()
    return raw === '' ? EMPTY_FILTER_VALUE : raw
  }
  const filterOptionLabel = (value) => value === EMPTY_FILTER_VALUE ? EMPTY_FILTER_LABEL : value
  const isStatusSantriSelected = useCallback(
    (value) => statusSantriFilter.includes(normalizeStatusSantri(value)),
    [statusSantriFilter]
  )
  const isKategoriSelected = useCallback(
    (value) => kategoriFilter.includes(normalizeKategori(value)),
    [kategoriFilter]
  )

  const mapSantriRows = useCallback((data) => (
    (Array.isArray(data) ? data : []).map((row) => ({
      ...row,
      status_santri: row?.status_santri ?? row?.status ?? '',
      kategori: row?.kategori ?? row?.kategori_santri ?? '',
    }))
  ), [])

  const dataSantri = useMemo(() => (
    santriList.map((row) => ({
      ...row,
      ijin_count: ijinCountById.get(Number(row.id)) ?? 0,
    }))
  ), [santriList, ijinCountById])

  useEffect(() => {
    let cancelled = false
    lembagaAPI.getAll().then((res) => {
      if (cancelled) return
      if (res?.success && Array.isArray(res.data)) setLembagaRows(res.data)
      else setLembagaRows([])
    }).catch(() => {
      if (!cancelled) setLembagaRows([])
    })
    return () => { cancelled = true }
  }, [])

  const lembagaMasterFilterOptions = useMemo(() => {
    const rows = Array.isArray(lembagaRows) ? lembagaRows : []
    return rows
      .map((l) => {
        const id = String(l.id)
        const count = dataSantri.filter(
          (s) => sameLembaga(s.diniyah, id) || sameLembaga(s.formal, id)
        ).length
        const nama = l.nama != null && String(l.nama).trim() !== '' ? String(l.nama) : id
        const kategori = l.kategori != null && String(l.kategori).trim() !== '' ? String(l.kategori) : 'Lainnya'
        return { value: id, label: `${nama} (${count})`, count, kategori }
      })
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [lembagaRows, dataSantri])

  const lembagaMasterFilterGroups = useMemo(() => {
    const grouped = new Map()
    lembagaMasterFilterOptions.forEach((item) => {
      const key = item.kategori || 'Lainnya'
      if (!grouped.has(key)) grouped.set(key, [])
      grouped.get(key).push(item)
    })
    return Array.from(grouped.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([kategori, options]) => ({
        kategori,
        options: [...options].sort((a, b) => a.label.localeCompare(b.label)),
      }))
  }, [lembagaMasterFilterOptions])

  useEffect(() => {
    const valid = new Set(['', ...lembagaMasterFilterOptions.map((o) => o.value)])
    if (lembagaFilter && !valid.has(lembagaFilter)) setLembagaFilter('')
  }, [lembagaFilter, lembagaMasterFilterOptions])

  const dynamicUniqueStatusSantri = useMemo(() => {
    let filtered = dataSantri
    if (lembagaFilter) filtered = filtered.filter(s => sameLembaga(s.diniyah, lembagaFilter) || sameLembaga(s.formal, lembagaFilter))
    if (kategoriFilter.length > 0) filtered = filtered.filter(s => isKategoriSelected(s.kategori))
    if (daerahFilter) filtered = filtered.filter(s => (s.daerah || '') === daerahFilter)
    if (kamarFilter) filtered = filtered.filter(s => (s.kamar || '') === kamarFilter)
    const grouped = new Map()
    filtered.forEach((s) => {
      const value = normalizeStatusSantri(s.status_santri)
      const label = filterOptionLabel(value === EMPTY_FILTER_VALUE ? value : String(s.status_santri ?? '').trim())
      const current = grouped.get(value)
      if (current) current.count += 1
      else grouped.set(value, { value, label, count: 1 })
    })
    return Array.from(grouped.values()).sort((a, b) => a.label.localeCompare(b.label))
  }, [dataSantri, lembagaFilter, kategoriFilter, daerahFilter, kamarFilter, isKategoriSelected])

  const dynamicUniqueKategori = useMemo(() => {
    let filtered = dataSantri
    if (lembagaFilter) filtered = filtered.filter(s => sameLembaga(s.diniyah, lembagaFilter) || sameLembaga(s.formal, lembagaFilter))
    if (statusSantriFilter.length > 0) filtered = filtered.filter(s => isStatusSantriSelected(s.status_santri))
    if (daerahFilter) filtered = filtered.filter(s => (s.daerah || '') === daerahFilter)
    if (kamarFilter) filtered = filtered.filter(s => (s.kamar || '') === kamarFilter)
    const grouped = new Map()
    filtered.forEach((s) => {
      const value = normalizeKategori(s.kategori)
      const label = filterOptionLabel(value)
      const current = grouped.get(value)
      if (current) current.count += 1
      else grouped.set(value, { value, label, count: 1 })
    })
    return Array.from(grouped.values()).sort((a, b) => a.label.localeCompare(b.label))
  }, [dataSantri, lembagaFilter, statusSantriFilter, daerahFilter, kamarFilter, isStatusSantriSelected])

  useEffect(() => {
    const singleKategori = kategoriFilter.length === 1 && kategoriFilter[0] !== EMPTY_FILTER_VALUE ? kategoriFilter[0] : ''
    if (!singleKategori) {
      setApiDaerahFilterOptions([])
      return
    }
    let cancelled = false
    pendaftaranAPI.getDaerahOptions(singleKategori).then((res) => {
      if (cancelled) return
      const list = res?.success && Array.isArray(res.data) ? res.data : []
      setApiDaerahFilterOptions(list)
    }).catch(() => {
      if (!cancelled) setApiDaerahFilterOptions([])
    })
    return () => { cancelled = true }
  }, [kategoriFilter])

  useEffect(() => {
    if (!daerahFilter || kategoriFilter.length === 0) return
    const ok = apiDaerahFilterOptions.some((d) => String(d.daerah) === String(daerahFilter))
    if (apiDaerahFilterOptions.length > 0 && !ok) setDaerahFilter('')
  }, [apiDaerahFilterOptions, daerahFilter, kategoriFilter])

  const daerahFilterDropdown = useMemo(() => {
    if (kategoriFilter.length === 0) return []
    const apiOptions = apiDaerahFilterOptions.map((d) => {
      const label = String(d.daerah ?? '')
      const count = dataSantri.filter(
        (s) => isKategoriSelected(s.kategori) && String(s.daerah || '') === label
      ).length
      return { value: label, count }
    })
    if (apiOptions.length > 0) return apiOptions
    let filtered = dataSantri
    if (lembagaFilter) filtered = filtered.filter(s => sameLembaga(s.diniyah, lembagaFilter) || sameLembaga(s.formal, lembagaFilter))
    if (statusSantriFilter.length > 0) filtered = filtered.filter(s => isStatusSantriSelected(s.status_santri))
    filtered = filtered.filter(s => isKategoriSelected(s.kategori))
    const values = [...new Set(filtered.map(s => (s.daerah != null && s.daerah !== '') ? String(s.daerah) : null).filter(Boolean))]
    return values.map(val => ({
      value: val,
      count: filtered.filter(s => (s.daerah || '') === val).length
    })).sort((a, b) => (a.value || '').localeCompare(b.value || ''))
  }, [kategoriFilter, apiDaerahFilterOptions, dataSantri, lembagaFilter, statusSantriFilter, isStatusSantriSelected, isKategoriSelected])

  const dynamicUniqueKamar = useMemo(() => {
    if (kategoriFilter.length === 0) return []
    let filtered = dataSantri
    if (lembagaFilter) filtered = filtered.filter(s => sameLembaga(s.diniyah, lembagaFilter) || sameLembaga(s.formal, lembagaFilter))
    if (statusSantriFilter.length > 0) filtered = filtered.filter(s => isStatusSantriSelected(s.status_santri))
    if (kategoriFilter.length > 0) filtered = filtered.filter(s => isKategoriSelected(s.kategori))
    if (daerahFilter) filtered = filtered.filter(s => (s.daerah || '') === daerahFilter)
    const values = [...new Set(filtered.map(s => (s.kamar != null && s.kamar !== '') ? String(s.kamar) : null).filter(Boolean))]
    return values.map(val => ({
      value: val,
      count: filtered.filter(s => (s.kamar || '') === val).length
    })).sort((a, b) => (a.value || '').localeCompare(b.value || ''))
  }, [dataSantri, lembagaFilter, statusSantriFilter, kategoriFilter, daerahFilter, isStatusSantriSelected, isKategoriSelected])

  const getKelasForLembaga = (s) => {
    if (sameLembaga(s.diniyah, lembagaFilter)) return (s.kelas_diniyah != null && s.kelas_diniyah !== '') ? String(s.kelas_diniyah) : null
    if (sameLembaga(s.formal, lembagaFilter)) return (s.kelas_formal != null && s.kelas_formal !== '') ? String(s.kelas_formal) : null
    return null
  }
  const getKelForLembaga = (s) => {
    if (sameLembaga(s.diniyah, lembagaFilter)) return (s.kel_diniyah != null && s.kel_diniyah !== '') ? String(s.kel_diniyah) : null
    if (sameLembaga(s.formal, lembagaFilter)) return (s.kel_formal != null && s.kel_formal !== '') ? String(s.kel_formal) : null
    return null
  }
  const santriInLembaga = useMemo(() => {
    if (!lembagaFilter) return []
    return dataSantri.filter(s => sameLembaga(s.diniyah, lembagaFilter) || sameLembaga(s.formal, lembagaFilter))
  }, [dataSantri, lembagaFilter])

  const dynamicUniqueKelas = useMemo(() => {
    if (!lembagaFilter) return []
    let filtered = santriInLembaga
    if (statusSantriFilter.length > 0) filtered = filtered.filter(s => isStatusSantriSelected(s.status_santri))
    if (kategoriFilter.length > 0) filtered = filtered.filter(s => isKategoriSelected(s.kategori))
    if (daerahFilter) filtered = filtered.filter(s => (s.daerah || '') === daerahFilter)
    if (kamarFilter) filtered = filtered.filter(s => (s.kamar || '') === kamarFilter)
    const values = [...new Set(filtered.map(getKelasForLembaga).filter(Boolean))]
    return values.map(val => ({
      value: val,
      count: filtered.filter(s => getKelasForLembaga(s) === val).length
    })).sort((a, b) => (String(a.value || '')).localeCompare(String(b.value || '')))
  }, [lembagaFilter, santriInLembaga, statusSantriFilter, kategoriFilter, daerahFilter, kamarFilter, isStatusSantriSelected, isKategoriSelected])

  const dynamicUniqueKel = useMemo(() => {
    if (!lembagaFilter) return []
    let filtered = santriInLembaga
    if (statusSantriFilter.length > 0) filtered = filtered.filter(s => isStatusSantriSelected(s.status_santri))
    if (kategoriFilter.length > 0) filtered = filtered.filter(s => isKategoriSelected(s.kategori))
    if (daerahFilter) filtered = filtered.filter(s => (s.daerah || '') === daerahFilter)
    if (kamarFilter) filtered = filtered.filter(s => (s.kamar || '') === kamarFilter)
    if (kelasFilter) filtered = filtered.filter(s => getKelasForLembaga(s) === kelasFilter)
    const values = [...new Set(filtered.map(getKelForLembaga).filter(Boolean))]
    return values.map(val => ({
      value: val,
      count: filtered.filter(s => getKelForLembaga(s) === val).length
    })).sort((a, b) => (String(a.value || '')).localeCompare(String(b.value || '')))
  }, [lembagaFilter, kelasFilter, santriInLembaga, statusSantriFilter, kategoriFilter, daerahFilter, kamarFilter, isStatusSantriSelected, isKategoriSelected])

  const loadSantriData = useCallback(async (opts = {}) => {
    const softRefresh = opts.softRefresh === true
    loadAbortRef.current?.abort()
    const ac = new AbortController()
    loadAbortRef.current = ac

    setLoading(true)
    setError('')
    setStreamProgress({ active: true, loaded: 0, total: null })

    const cachedCount = await countSantriRows()

    try {
      let pendingSoftFlush = softRefresh || cachedCount > 0

      const parallelResult = await fetchManageDataParallelOffsets({
        chunkSize: MANAGE_DATA_CHUNK_SIZE,
        signal: ac.signal,
        fetchChunk: (chunkOpts) => santriAPI.getAll(chunkOpts),
        onProgress: (rows, tot) => {
          const mapped = mapSantriRows(rows)
          if (pendingSoftFlush) {
            pendingSoftFlush = false
            flushSync(() => {
              setStreamProgress({ active: true, loaded: mapped.length, total: tot })
              setSantriList(mapped)
            })
          } else {
            setSantriList(mapped)
            setStreamProgress({ active: true, loaded: mapped.length, total: tot })
          }
        },
      })

      if (!parallelResult.ok) {
        setError(parallelResult.message || 'Gagal memuat data santri')
        setStreamProgress((p) => ({ ...p, active: false }))
      } else {
        const finalRows = mapSantriRows(parallelResult.rows)
        await applySantriSearchServerPayload(finalRows, false)
        setCurrentPage(1)
      }
    } catch (err) {
      if (axios.isCancel?.(err) || err?.code === 'ERR_CANCELED' || err?.name === 'CanceledError') {
        return
      }
      console.error('Error loading santri:', err)
      setError(err?.message || 'Terjadi kesalahan saat memuat data')
      setStreamProgress((p) => ({ ...p, active: false }))
    } finally {
      if (loadAbortRef.current === ac) {
        setLoading(false)
        setStreamProgress((p) => ({ ...p, active: false }))
      }
    }
  }, [mapSantriRows])

  const loadIjinCounts = useCallback(async (opts = {}) => {
    const quiet = opts?.quiet === true
    const ta = String(tahunAjaran || '').trim()
    if (!ta) {
      setIjinCountById(new Map())
      setIjinHariIni(0)
      return
    }

    ijinLoadAbortRef.current?.abort()
    const ac = new AbortController()
    ijinLoadAbortRef.current = ac

    if (!quiet) setIjinLoading(true)

    try {
      let hariIni = 0
      const countMap = new Map()

      const parallelResult = await fetchManageDataParallelOffsets({
        chunkSize: MANAGE_DATA_CHUNK_SIZE,
        signal: ac.signal,
        fetchChunk: async (chunkOpts) => {
          const res = await dashboardAPI.getDataSantri(ta, chunkOpts)
          if (Number(chunkOpts?.offset || 0) === 0 && res?.ijin_hari_ini != null) {
            hariIni = Number(res.ijin_hari_ini) || 0
          }
          return res
        },
        onProgress: (rows) => {
          rows.forEach((row) => {
            countMap.set(Number(row.id), Number(row.ijin_count) || 0)
          })
        },
      })

      if (parallelResult.ok) {
        parallelResult.rows.forEach((row) => {
          countMap.set(Number(row.id), Number(row.ijin_count) || 0)
        })
      }

      if (!ac.signal.aborted) {
        setIjinCountById(countMap)
        setIjinHariIni(hariIni)
      }
    } catch (err) {
      if (axios.isCancel?.(err) || err?.code === 'ERR_CANCELED' || err?.name === 'CanceledError') return
      console.error('Error loading ijin counts:', err)
    } finally {
      if (ijinLoadAbortRef.current === ac && !quiet) {
        setIjinLoading(false)
      }
    }
  }, [tahunAjaran])

  useEffect(() => {
    const sub = subscribeSantriRowsOrdered(setSantriList)
    return () => sub.unsubscribe()
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const n = await countSantriRows()
      if (cancelled) return
      if (n === 0) {
        await loadSantriData()
        return
      }
      const since = await getLocalSantriSinceWatermark()
      if (cancelled) return
      if (!since) {
        await loadSantriData({ softRefresh: true })
        return
      }
      await fetchSantriDeltaQuiet()
    })()
    return () => {
      cancelled = true
      loadAbortRef.current?.abort()
    }
  }, [loadSantriData])

  useEffect(() => {
    loadIjinCounts()
    return () => ijinLoadAbortRef.current?.abort()
  }, [loadIjinCounts])

  const refreshAll = useCallback(() => {
    loadSantriData({ softRefresh: true })
    loadIjinCounts({ quiet: true })
  }, [loadSantriData, loadIjinCounts])

  const tahunAjaranRef = useRef(tahunAjaran)
  tahunAjaranRef.current = tahunAjaran
  const loadIjinCountsRef = useRef(loadIjinCounts)
  loadIjinCountsRef.current = loadIjinCounts

  useEffect(() => {
    const onHint = (e) => {
      const d = e?.detail || {}
      if (!ijinHintMatches(d, null, tahunAjaranRef.current)) return
      void loadIjinCountsRef.current({ quiet: true })
    }
    window.addEventListener(EBEDDIEN_IJIN_HINT, onHint)
    return () => window.removeEventListener(EBEDDIEN_IJIN_HINT, onHint)
  }, [])

  useEffect(() => {
    let filtered = dataSantri

    if (lembagaFilter) {
      filtered = filtered.filter(s => sameLembaga(s.diniyah, lembagaFilter) || sameLembaga(s.formal, lembagaFilter))
    }
    if (kelasFilter) {
      filtered = filtered.filter(s =>
        (sameLembaga(s.diniyah, lembagaFilter) && (s.kelas_diniyah || '') === kelasFilter) ||
        (sameLembaga(s.formal, lembagaFilter) && (s.kelas_formal || '') === kelasFilter)
      )
    }
    if (kelFilter) {
      filtered = filtered.filter(s =>
        (sameLembaga(s.diniyah, lembagaFilter) && (s.kel_diniyah || '') === kelFilter) ||
        (sameLembaga(s.formal, lembagaFilter) && (s.kel_formal || '') === kelFilter)
      )
    }
    if (statusSantriFilter.length > 0) {
      filtered = filtered.filter(s => isStatusSantriSelected(s.status_santri))
    }
    if (kategoriFilter.length > 0) {
      filtered = filtered.filter(s => isKategoriSelected(s.kategori))
    }
    if (daerahFilter) {
      filtered = filtered.filter(s => (s.daerah || '') === daerahFilter)
    }
    if (kamarFilter) {
      filtered = filtered.filter(s => (s.kamar || '') === kamarFilter)
    }
    if (tidakDiniyahFilter) {
      filtered = filtered.filter(s => s.diniyah == null || s.diniyah === '')
    }
    if (tidakFormalFilter) {
      filtered = filtered.filter(s => s.formal == null || s.formal === '')
    }

    const ijinMinN = ijinMinFilter === '' ? null : parseInt(ijinMinFilter, 10)
    const ijinMaxN = ijinMaxFilter === '' ? null : parseInt(ijinMaxFilter, 10)
    if (ijinMinN !== null && !Number.isNaN(ijinMinN)) {
      filtered = filtered.filter((s) => (s.ijin_count ?? 0) >= ijinMinN)
    }
    if (ijinMaxN !== null && !Number.isNaN(ijinMaxN)) {
      filtered = filtered.filter((s) => (s.ijin_count ?? 0) <= ijinMaxN)
    }

    if (searchQuery.trim() !== '') {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(s =>
        (s.nama && s.nama.toLowerCase().includes(query)) ||
        (s.nis != null && String(s.nis).toLowerCase().includes(query)) ||
        (s.id != null && String(s.id).includes(query)) ||
        (s.nik && String(s.nik).includes(query))
      )
    }

    if (sortConfig.key) {
      filtered = [...filtered].sort((a, b) => {
        let aVal = a[sortConfig.key]
        let bVal = b[sortConfig.key]
        if (sortConfig.key === 'ijin_count') {
          aVal = a.ijin_count ?? 0
          bVal = b.ijin_count ?? 0
        }
        if (aVal == null && bVal == null) return 0
        if (aVal == null) return 1
        if (bVal == null) return -1
        if (typeof aVal === 'string') {
          return sortConfig.direction === 'asc'
            ? aVal.localeCompare(bVal)
            : bVal.localeCompare(aVal)
        }
        return sortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal
      })
    }

    setFilteredList(filtered)
  }, [
    searchQuery, dataSantri, lembagaFilter, kelasFilter, kelFilter, statusSantriFilter, kategoriFilter,
    daerahFilter, kamarFilter, tidakDiniyahFilter, tidakFormalFilter, ijinMinFilter, ijinMaxFilter,
    sortConfig, isStatusSantriSelected, isKategoriSelected,
  ])

  const dataToExport = useMemo(() => {
    if (selectedItems.size > 0) {
      return filteredList.filter(santri => selectedItems.has(santri.id))
    }
    return filteredList
  }, [filteredList, selectedItems])

  const totalPages = Math.ceil(filteredList.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const paginatedList = filteredList.slice(startIndex, endIndex)

  const handlePageChange = (page) => {
    setCurrentPage(page)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleItemsPerPageChange = (value) => {
    const newItemsPerPage = value === 'all' ? filteredList.length : Number(value)
    setItemsPerPage(newItemsPerPage)
    setCurrentPage(1)
  }

  const handleSort = (key) => {
    let direction = 'asc'
    if (sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc'
    setSortConfig({ key, direction })
  }

  useEffect(() => {
    setCurrentPage(1)
  }, [
    searchQuery, lembagaFilter, kelasFilter, kelFilter, statusSantriFilter, kategoriFilter,
    daerahFilter, kamarFilter, tidakDiniyahFilter, tidakFormalFilter, ijinMinFilter, ijinMaxFilter,
    sortConfig, itemsPerPage,
  ])

  useEffect(() => {
    if (!lembagaFilter) {
      setKelasFilter('')
      setKelFilter('')
    }
  }, [lembagaFilter])

  useEffect(() => {
    if (!daerahFilter && kamarFilter) setKamarFilter('')
  }, [daerahFilter, kamarFilter])

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
    const updatePosition = () => {
      if (kategoriFilterButtonRef.current) {
        const rect = kategoriFilterButtonRef.current.getBoundingClientRect()
        setKategoriFilterPosition({
          top: rect.bottom + window.scrollY + 4,
          left: rect.left + window.scrollX,
          width: rect.width,
        })
      }
    }
    if (isKategoriFilterOpen) {
      updatePosition()
      window.addEventListener('scroll', updatePosition, true)
      window.addEventListener('resize', updatePosition)
    }
    return () => {
      window.removeEventListener('scroll', updatePosition, true)
      window.removeEventListener('resize', updatePosition)
    }
  }, [isKategoriFilterOpen])

  useEffect(() => {
    const handleClickOutside = (event) => {
      const isClickInButton = statusFilterButtonRef.current && statusFilterButtonRef.current.contains(event.target)
      const isClickInDropdown = statusFilterDropdownRef.current && statusFilterDropdownRef.current.contains(event.target)
      const isClickInContainer = statusFilterRef.current && statusFilterRef.current.contains(event.target)
      if (!isClickInButton && !isClickInDropdown && !isClickInContainer) {
        setIsStatusFilterOpen(false)
      }
    }
    if (isStatusFilterOpen) {
      setTimeout(() => document.addEventListener('mousedown', handleClickOutside), 0)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isStatusFilterOpen])

  useEffect(() => {
    const handleClickOutside = (event) => {
      const isClickInButton = kategoriFilterButtonRef.current && kategoriFilterButtonRef.current.contains(event.target)
      const isClickInDropdown = kategoriFilterDropdownRef.current && kategoriFilterDropdownRef.current.contains(event.target)
      const isClickInContainer = kategoriFilterRef.current && kategoriFilterRef.current.contains(event.target)
      if (!isClickInButton && !isClickInDropdown && !isClickInContainer) {
        setIsKategoriFilterOpen(false)
      }
    }
    if (isKategoriFilterOpen) {
      setTimeout(() => document.addEventListener('mousedown', handleClickOutside), 0)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isKategoriFilterOpen])

  const handleToggleSelect = (id) => {
    setSelectedItems(prev => {
      const newSet = new Set(prev)
      if (newSet.has(id)) newSet.delete(id)
      else newSet.add(id)
      return newSet
    })
  }

  const handleToggleSelectAll = () => {
    if (selectedItems.size === paginatedList.length && paginatedList.length > 0) {
      setSelectedItems(new Set())
    } else {
      const newSet = new Set(selectedItems)
      paginatedList.forEach(santri => newSet.add(santri.id))
      setSelectedItems(newSet)
    }
  }

  const isAllPageSelected = paginatedList.length > 0 && paginatedList.every(santri => selectedItems.has(santri.id))
  const isSomePageSelected = paginatedList.some(santri => selectedItems.has(santri.id))

  const lembagaName = (id) => {
    if (id == null || id === '') return null
    const row = lembagaRows.find((l) => String(l.id) === String(id))
    return row?.nama ? String(row.nama).trim() : String(id)
  }

  const SortIcon = ({ columnKey }) => {
    if (sortConfig.key !== columnKey) {
      return (
        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
        </svg>
      )
    }
    return sortConfig.direction === 'asc' ? (
      <svg className="w-4 h-4 text-teal-600 dark:text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 15l7-7 7 7" />
      </svg>
    ) : (
      <svg className="w-4 h-4 text-teal-600 dark:text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
      </svg>
    )
  }

  const printFilterSummary = {
    searchQuery,
    statusSantriFilter,
    kategoriFilter,
    daerahFilter,
    kamarFilter,
    lembagaFilter,
    ijinMinFilter,
    ijinMaxFilter,
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="h-full overflow-hidden"
      style={{ minHeight: 0 }}
    >
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        className="h-full overflow-y-auto page-content-scroll"
        style={{ minHeight: 0 }}
      >
        <div className="p-4 sm:p-6 lg:p-8">
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
          >
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
              className="sticky top-0 z-10 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 mb-4"
            >
              <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
                className="rounded-xl overflow-hidden"
              >
                <div className="relative pb-2 px-4 pt-3">
                  <motion.div
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, ease: 'easeOut' }}
                    className="relative"
                  >
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onFocus={() => setIsInputFocused(true)}
                      onBlur={() => setIsInputFocused(false)}
                      className="w-full p-2 pr-12 focus:outline-none bg-transparent dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400"
                      placeholder="Cari"
                    />
                    <div className="absolute right-0 top-0 bottom-0 flex items-center gap-1 pr-1 pointer-events-none">
                      <button
                        type="button"
                        onClick={() => setIsFilterOpen(!isFilterOpen)}
                        className="bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 p-1.5 rounded text-xs flex items-center gap-1 transition-colors pointer-events-auto"
                        title={isFilterOpen ? 'Sembunyikan Filter' : 'Tampilkan Filter'}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                        </svg>
                        {isFilterOpen ? (
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 15l7-7 7 7" />
                          </svg>
                        ) : (
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </motion.div>
                  <div className="absolute left-0 right-0 bottom-0 h-0.5 bg-gray-300 dark:bg-gray-600" />
                  <motion.div
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, ease: 'easeOut' }}
                    className={`absolute left-0 right-0 bottom-0 h-0.5 bg-teal-500 transition-opacity ${isInputFocused ? 'opacity-100' : 'opacity-0'}`}
                  />
                </div>

                <ManageDataStreamProgress
                  active={streamProgress.active || loading || ijinLoading}
                  loaded={streamProgress.loaded}
                  total={streamProgress.total}
                  errorMessage={error}
                />

                <AnimatePresence>
                  {isFilterOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden border-t bg-gray-50 dark:bg-gray-700/50"
                    >
                      <div className="px-4 py-2">
                        <div className="flex flex-wrap gap-2">
                          <select
                            value={lembagaFilter}
                            onChange={(e) => setLembagaFilter(e.target.value)}
                            className="border rounded p-1 h-7 min-w-0 text-xs bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 focus:ring-1 focus:ring-teal-400"
                          >
                            <option value="">Semua Lembaga</option>
                            {lembagaMasterFilterGroups.map((group) => (
                              <optgroup key={group.kategori} label={group.kategori}>
                                {group.options.map((item) => (
                                  <option key={item.value} value={item.value}>{item.label}</option>
                                ))}
                              </optgroup>
                            ))}
                          </select>
                          <AnimatePresence mode="wait">
                            {lembagaFilter && (
                              <motion.div
                                key="kelas-kel-filters"
                                initial={{ opacity: 0, x: -12 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -12 }}
                                transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
                                className="inline-flex items-center gap-2 shrink-0"
                              >
                                <select
                                  value={kelasFilter}
                                  onChange={(e) => { setKelasFilter(e.target.value); setKelFilter('') }}
                                  className="border rounded p-1 h-7 min-w-0 text-xs bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 focus:ring-1 focus:ring-teal-400"
                                >
                                  <option value="">Kelas</option>
                                  {dynamicUniqueKelas.map(item => (
                                    <option key={item.value} value={item.value}>{String(item.value)} ({item.count})</option>
                                  ))}
                                </select>
                                <select
                                  value={kelFilter}
                                  onChange={(e) => setKelFilter(e.target.value)}
                                  className="border rounded p-1 h-7 min-w-0 text-xs bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 focus:ring-1 focus:ring-teal-400"
                                >
                                  <option value="">Kel</option>
                                  {dynamicUniqueKel.map(item => (
                                    <option key={item.value} value={item.value}>{String(item.value)} ({item.count})</option>
                                  ))}
                                </select>
                              </motion.div>
                            )}
                          </AnimatePresence>
                          <motion.div
                            initial={{ opacity: 0, y: 15 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.3, ease: 'easeOut' }}
                            className="relative"
                            ref={statusFilterRef}
                          >
                            <button
                              ref={statusFilterButtonRef}
                              type="button"
                              onClick={() => setIsStatusFilterOpen(!isStatusFilterOpen)}
                              className="border rounded p-1 h-7 min-w-0 text-xs bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 focus:ring-1 focus:ring-teal-400 flex items-center justify-between gap-1 px-2"
                              style={{ minWidth: '120px' }}
                            >
                              <span className="truncate">
                                {statusSantriFilter.length === 0
                                  ? 'Status Santri'
                                  : statusSantriFilter.length === 1
                                    ? (dynamicUniqueStatusSantri.find((s) => s.value === statusSantriFilter[0])?.label || filterOptionLabel(statusSantriFilter[0]))
                                    : `${statusSantriFilter.length} dipilih`}
                              </span>
                              <svg className={`w-3 h-3 transition-transform ${isStatusFilterOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                              </svg>
                            </button>
                          </motion.div>
                          {isStatusFilterOpen && createPortal(
                            <AnimatePresence>
                              <motion.div
                                ref={statusFilterDropdownRef}
                                initial={{ opacity: 0, y: -10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                transition={{ duration: 0.2 }}
                                className="fixed z-[9999] bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded shadow-lg max-h-60 overflow-y-auto"
                                style={{
                                  top: `${statusFilterPosition.top}px`,
                                  left: `${statusFilterPosition.left}px`,
                                  width: `${Math.max(statusFilterPosition.width, 200)}px`,
                                }}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <motion.div
                                  initial={{ opacity: 0, y: 15 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  transition={{ duration: 0.3, ease: 'easeOut' }}
                                  className="p-2 space-y-1"
                                >
                                  {dynamicUniqueStatusSantri.map((item) => {
                                    const isChecked = statusSantriFilter.includes(item.value)
                                    return (
                                      <label
                                        key={item.value}
                                        className="flex items-center gap-2 p-1.5 hover:bg-gray-50 dark:hover:bg-gray-600 rounded cursor-pointer text-xs"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        <input
                                          type="checkbox"
                                          checked={isChecked}
                                          onChange={(e) => {
                                            e.stopPropagation()
                                            if (e.target.checked) {
                                              setStatusSantriFilter((prev) => (
                                                prev.includes(item.value) ? prev : [...prev, item.value]
                                              ))
                                            } else {
                                              setStatusSantriFilter((prev) => prev.filter((v) => v !== item.value))
                                            }
                                          }}
                                          onClick={(e) => e.stopPropagation()}
                                          className="w-3.5 h-3.5 rounded border-gray-300 dark:border-gray-600 text-teal-600 focus:ring-teal-500"
                                        />
                                        <span className="text-gray-700 dark:text-gray-300 flex-1">
                                          {item.label} ({item.count})
                                        </span>
                                      </label>
                                    )
                                  })}
                                  {statusSantriFilter.length > 0 && (
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
                                </motion.div>
                              </motion.div>
                            </AnimatePresence>,
                            document.body
                          )}
                          <div className="relative" ref={kategoriFilterRef}>
                            <button
                              ref={kategoriFilterButtonRef}
                              type="button"
                              onClick={() => setIsKategoriFilterOpen(!isKategoriFilterOpen)}
                              className="border rounded p-1 h-7 min-w-0 text-xs bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 focus:ring-1 focus:ring-teal-400 flex items-center justify-between gap-1 px-2"
                              style={{ minWidth: '120px' }}
                            >
                              <span className="truncate">
                                {kategoriFilter.length === 0
                                  ? 'Kategori'
                                  : kategoriFilter.length === 1
                                    ? (dynamicUniqueKategori.find((s) => s.value === kategoriFilter[0])?.label || filterOptionLabel(kategoriFilter[0]))
                                    : `${kategoriFilter.length} dipilih`}
                              </span>
                              <svg className={`w-3 h-3 transition-transform ${isKategoriFilterOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                              </svg>
                            </button>
                          </div>
                          {isKategoriFilterOpen && createPortal(
                            <AnimatePresence>
                              <motion.div
                                ref={kategoriFilterDropdownRef}
                                initial={{ opacity: 0, y: -10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                transition={{ duration: 0.2 }}
                                className="fixed z-[9999] bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded shadow-lg max-h-60 overflow-y-auto"
                                style={{
                                  top: `${kategoriFilterPosition.top}px`,
                                  left: `${kategoriFilterPosition.left}px`,
                                  width: `${Math.max(kategoriFilterPosition.width, 200)}px`,
                                }}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <div className="p-2 space-y-1">
                                  {dynamicUniqueKategori.map((item) => {
                                    const isChecked = kategoriFilter.includes(item.value)
                                    return (
                                      <label
                                        key={item.value}
                                        className="flex items-center gap-2 p-1.5 hover:bg-gray-50 dark:hover:bg-gray-600 rounded cursor-pointer text-xs"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        <input
                                          type="checkbox"
                                          checked={isChecked}
                                          onChange={(e) => {
                                            e.stopPropagation()
                                            setDaerahFilter('')
                                            setKamarFilter('')
                                            if (e.target.checked) {
                                              setKategoriFilter((prev) => (
                                                prev.includes(item.value) ? prev : [...prev, item.value]
                                              ))
                                            } else {
                                              setKategoriFilter((prev) => prev.filter((v) => v !== item.value))
                                            }
                                          }}
                                          onClick={(e) => e.stopPropagation()}
                                          className="w-3.5 h-3.5 rounded border-gray-300 dark:border-gray-600 text-teal-600 focus:ring-teal-500"
                                        />
                                        <span className="text-gray-700 dark:text-gray-300 flex-1">
                                          {item.label} ({item.count})
                                        </span>
                                      </label>
                                    )
                                  })}
                                  {kategoriFilter.length > 0 && (
                                    <motion.div
                                      initial={{ opacity: 0, y: 15 }}
                                      animate={{ opacity: 1, y: 0 }}
                                      transition={{ duration: 0.3, ease: 'easeOut' }}
                                      className="pt-1 border-t border-gray-200 dark:border-gray-600"
                                    >
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setKategoriFilter([])
                                          setDaerahFilter('')
                                          setKamarFilter('')
                                          setIsKategoriFilterOpen(false)
                                        }}
                                        className="w-full text-left px-1.5 py-1 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                                      >
                                        Hapus semua
                                      </button>
                                    </motion.div>
                                  )}
                                </div>
                              </motion.div>
                            </AnimatePresence>,
                            document.body
                          )}
                          {kategoriFilter.length > 0 && (
                            <select
                              value={daerahFilter}
                              onChange={(e) => { setDaerahFilter(e.target.value); setKamarFilter('') }}
                              className="border rounded p-1 h-7 min-w-0 text-xs bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 focus:ring-1 focus:ring-teal-400"
                            >
                              <option value="">Daerah</option>
                              {daerahFilterDropdown.map(item => (
                                <option key={item.value} value={item.value}>{item.value} ({item.count})</option>
                              ))}
                            </select>
                          )}
                          {kategoriFilter.length > 0 && daerahFilter && (
                            <select
                              value={kamarFilter}
                              onChange={(e) => setKamarFilter(e.target.value)}
                              className="border rounded p-1 h-7 min-w-0 text-xs bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 focus:ring-1 focus:ring-teal-400"
                            >
                              <option value="">Kamar</option>
                              {dynamicUniqueKamar.map(item => (
                                <option key={item.value} value={item.value}>{item.value} ({item.count})</option>
                              ))}
                            </select>
                          )}
                          <label className="flex items-center gap-1 text-[10px] text-gray-600 dark:text-gray-400 whitespace-nowrap">
                            Ijin TA {tahunAjaran}
                            <input
                              type="number"
                              min={0}
                              inputMode="numeric"
                              placeholder="min"
                              value={ijinMinFilter}
                              onChange={(e) => {
                                const v = e.target.value === '' ? '' : String(Math.max(0, parseInt(e.target.value, 10) || 0))
                                setIjinMinFilter(v)
                              }}
                              className="border rounded px-1 py-0.5 w-14 h-7 text-xs bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 focus:ring-1 focus:ring-teal-400"
                            />
                            <span className="text-gray-400">–</span>
                            <input
                              type="number"
                              min={0}
                              inputMode="numeric"
                              placeholder="maks"
                              value={ijinMaxFilter}
                              onChange={(e) => {
                                const v = e.target.value === '' ? '' : String(Math.max(0, parseInt(e.target.value, 10) || 0))
                                setIjinMaxFilter(v)
                              }}
                              className="border rounded px-1 py-0.5 w-14 h-7 text-xs bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 focus:ring-1 focus:ring-teal-400"
                            />
                          </label>
                        </div>
                        <div className="flex flex-wrap items-center gap-4 pt-2 mt-2 border-t border-gray-200 dark:border-gray-600">
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
                        <div className="flex flex-wrap items-center justify-end gap-2 pt-3 mt-2 border-t border-gray-200 dark:border-gray-600">
                          <button
                            type="button"
                            onClick={() => refreshAll()}
                            disabled={loading || ijinLoading}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors disabled:opacity-50"
                            title="Refresh"
                          >
                            <svg className={`w-4 h-4 ${loading || ijinLoading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                            Refresh
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setLembagaFilter('')
                              setKelasFilter('')
                              setKelFilter('')
                              setStatusSantriFilter(['mukim', 'khoriji'])
                              setKategoriFilter([])
                              setDaerahFilter('')
                              setKamarFilter('')
                              setLembagaFilter('')
                              setTidakDiniyahFilter(false)
                              setTidakFormalFilter(false)
                              setIjinMinFilter('')
                              setIjinMaxFilter('')
                              setSearchQuery('')
                              setCurrentPage(1)
                            }}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
                            title="Reset filter"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
                            </svg>
                            Reset filter
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            </motion.div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4 mb-6">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-800 rounded-xl p-3 md:p-4"
              >
                <p className="text-[10px] md:text-xs font-medium text-sky-700 dark:text-sky-300 mb-1">Total Data</p>
                <p className="text-sm md:text-lg font-bold text-sky-700 dark:text-sky-200">{filteredList.length}</p>
              </motion.div>
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
                className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl p-3 md:p-4"
              >
                <p className="text-[10px] md:text-xs font-medium text-emerald-700 dark:text-emerald-300 mb-1">Terpilih</p>
                <p className="text-sm md:text-lg font-bold text-emerald-700 dark:text-emerald-200">{selectedItems.size}</p>
              </motion.div>
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-3 md:p-4"
              >
                <p className="text-[10px] md:text-xs font-medium text-amber-800 dark:text-amber-200 mb-1">Ijin dicatat hari ini</p>
                <p className="text-sm md:text-lg font-bold text-amber-900 dark:text-amber-100">{ijinHariIni}</p>
                <p className="text-[9px] md:text-[10px] text-amber-700/80 dark:text-amber-300/80 mt-1">
                  Semua tahun ajaran · menurut tanggal dicatat di server
                </p>
              </motion.div>
            </div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 }}
              className="bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden border border-gray-200 dark:border-gray-700"
            >
              <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700 flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => setShowExportOffcanvas(true)}
                  disabled={filteredList.length === 0}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Export {selectedItems.size > 0 && `(${selectedItems.size})`}
                </button>
                <button
                  type="button"
                  onClick={() => setShowPrintDataModal(true)}
                  disabled={filteredList.length === 0}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Print Data
                </button>
                {selectedItems.size > 0 && (
                  <>
                    <button
                      type="button"
                      onClick={() => setShowBulkEditOffcanvas(true)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-teal-600 hover:bg-teal-700 text-white rounded transition-colors"
                    >
                      Edit Masal ({selectedItems.size})
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowPrintModal(true)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-purple-600 hover:bg-purple-700 text-white rounded transition-colors"
                    >
                      Print ({selectedItems.size})
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedItems(new Set())}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-gray-600 hover:bg-gray-700 text-white rounded transition-colors"
                    >
                      Hapus
                    </button>
                  </>
                )}
              </div>

              <div className="px-4 sm:px-6 py-3 border-b border-gray-200 dark:border-gray-700 flex flex-row items-center justify-between gap-2">
                <h2 className="text-base sm:text-lg font-semibold text-gray-500 dark:text-gray-400 shrink-0">
                  {filteredList.length}
                </h2>
                <select
                  value={itemsPerPage >= filteredList.length ? 'all' : itemsPerPage}
                  onChange={(e) => handleItemsPerPageChange(e.target.value)}
                  className="h-8 pr-6 pl-1 py-1 text-xs bg-transparent border-none text-gray-700 dark:text-gray-300 focus:outline-none cursor-pointer"
                >
                  <option value="25">25</option>
                  <option value="50">50</option>
                  <option value="100">100</option>
                  <option value="200">200</option>
                  <option value="500">500</option>
                  <option value="all">Semua</option>
                </select>
              </div>

              {filteredList.length === 0 ? (
                <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                  <p>{searchQuery || lembagaFilter || statusSantriFilter.length || kategoriFilter.length ? 'Tidak ada data yang sesuai filter' : 'Belum ada data santri'}</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 dark:bg-gray-900">
                      <tr>
                        <th className="px-4 py-3 text-center w-12">
                          <input
                            type="checkbox"
                            checked={isAllPageSelected}
                            ref={(input) => {
                              if (input) input.indeterminate = isSomePageSelected && !isAllPageSelected
                            }}
                            onChange={handleToggleSelectAll}
                            className="w-4 h-4 text-teal-600 bg-gray-100 border-gray-300 rounded focus:ring-teal-500"
                          />
                        </th>
                        <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">No</th>
                        <th onClick={() => handleSort('nama')} className="px-4 sm:px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors whitespace-nowrap">
                          <motion.div
                            initial={{ opacity: 0, y: 15 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.3, ease: 'easeOut' }}
                            className="flex items-center gap-2"
                          >
                            Nama <SortIcon columnKey="nama" />
                          </motion.div>
                        </th>
                        <th onClick={() => handleSort('nis')} className="px-4 sm:px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors whitespace-nowrap">
                          <div className="flex items-center gap-2">NIS <SortIcon columnKey="nis" /></div>
                        </th>
                        <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">NIK</th>
                        <th onClick={() => handleSort('diniyah')} className="px-4 sm:px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors whitespace-nowrap">
                          <div className="flex items-center gap-2">Diniyah <SortIcon columnKey="diniyah" /></div>
                        </th>
                        <th onClick={() => handleSort('formal')} className="px-4 sm:px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors whitespace-nowrap">
                          <motion.div
                            initial={{ opacity: 0, y: 15 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.3, ease: 'easeOut' }}
                            className="flex items-center gap-2"
                          >
                            Formal <SortIcon columnKey="formal" />
                          </motion.div>
                        </th>
                        <th onClick={() => handleSort('status_santri')} className="px-4 sm:px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors whitespace-nowrap">
                          <div className="flex items-center gap-2">Status <SortIcon columnKey="status_santri" /></div>
                        </th>
                        <th onClick={() => handleSort('kategori')} className="px-4 sm:px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors whitespace-nowrap">
                          <div className="flex items-center gap-2">Kategori <SortIcon columnKey="kategori" /></div>
                        </th>
                        <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Daerah.Kamar</th>
                        <th
                          onClick={() => handleSort('ijin_count')}
                          className="px-4 sm:px-6 py-3 text-center text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors whitespace-nowrap"
                          title={`Jumlah ijin tahun ajaran ${tahunAjaran}`}
                        >
                          <div className="flex items-center justify-center gap-2">
                            Ijin <SortIcon columnKey="ijin_count" />
                          </div>
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                      {paginatedList.map((santri, index) => {
                        const isSelected = selectedItems.has(santri.id)
                        const diniyahLabel = lembagaName(santri.diniyah) || '-'
                        const formalLabel = lembagaName(santri.formal) || '-'
                        return (
                          <tr
                            key={santri.id}
                            onClick={(e) => {
                              if (e.target.type === 'checkbox') return
                              setSelectedSantri(santri)
                              setShowDetailOffcanvas(true)
                            }}
                            className={`hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors cursor-pointer ${isSelected ? 'bg-teal-50 dark:bg-teal-900/20' : ''}`}
                          >
                            <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => handleToggleSelect(santri.id)}
                                className="w-4 h-4 text-teal-600 bg-gray-100 border-gray-300 rounded focus:ring-teal-500"
                              />
                            </td>
                            <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-200">
                              {startIndex + index + 1}
                            </td>
                            <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-200">{santri.nama || '-'}</td>
                            <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-700 dark:text-gray-300">{santri.nis ?? santri.id ?? '-'}</td>
                            <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-700 dark:text-gray-300">{santri.nik || '-'}</td>
                            <td className="px-4 sm:px-6 py-4 whitespace-nowrap">
                              <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${santri.diniyah ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'}`}>
                                {diniyahLabel}
                              </span>
                            </td>
                            <td className="px-4 sm:px-6 py-4 whitespace-nowrap">
                              <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${santri.formal ? 'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-400' : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'}`}>
                                {formalLabel}
                              </span>
                            </td>
                            <td className="px-4 sm:px-6 py-4 whitespace-nowrap">
                              <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${santri.status_santri ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400' : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'}`}>
                                {santri.status_santri || '-'}
                              </span>
                            </td>
                            <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">{santri.kategori || '-'}</td>
                            <td className="px-4 sm:px-6 py-4 text-sm text-gray-700 dark:text-gray-300 max-w-[14rem] sm:max-w-xs">
                              <span className="whitespace-nowrap">
                                {santri.daerah && santri.kamar ? `${santri.daerah}.${santri.kamar}` : (santri.daerah || santri.kamar || '-')}
                              </span>
                            </td>
                            <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm text-center font-medium text-amber-800 dark:text-amber-200 tabular-nums">
                              {santri.ijin_count ?? 0}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {filteredList.length > 0 && totalPages > 1 && (
                <div className="px-4 sm:px-6 py-4 border-t border-gray-200 dark:border-gray-700">
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                    <p className="text-sm text-gray-700 dark:text-gray-300">
                      Menampilkan {startIndex + 1} - {Math.min(endIndex, filteredList.length)} dari {filteredList.length} santri
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handlePageChange(currentPage - 1)}
                        disabled={currentPage === 1}
                        className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
                      >
                        ‹
                      </button>
                      <div className="flex items-center gap-1">
                        {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                          let pageNum
                          if (totalPages <= 5) pageNum = i + 1
                          else if (currentPage <= 3) pageNum = i + 1
                          else if (currentPage >= totalPages - 2) pageNum = totalPages - 4 + i
                          else pageNum = currentPage - 2 + i
                          return (
                            <button
                              key={pageNum}
                              type="button"
                              onClick={() => handlePageChange(pageNum)}
                              className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                                currentPage === pageNum
                                  ? 'bg-teal-600 text-white'
                                  : 'text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
                              }`}
                            >
                              {pageNum}
                            </button>
                          )
                        })}
                      </div>
                      <button
                        type="button"
                        onClick={() => handlePageChange(currentPage + 1)}
                        disabled={currentPage === totalPages}
                        className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
                      >
                        ›
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          </motion.div>
        </div>
      </motion.div>

      <BulkEditOffcanvas
        isOpen={showBulkEditOffcanvas}
        onClose={closeBulkEditOffcanvas}
        selectedSantriList={filteredList.filter(s => selectedItems.has(s.id))}
        allDataSantri={dataSantri}
        onSuccess={() => {
          refreshAll()
          setSelectedItems(new Set())
        }}
      />

      <DetailSantriOffcanvas
        isOpen={showDetailOffcanvas}
        onClose={closeDetailSantriOffcanvas}
        santri={selectedSantri}
        onSuccess={async () => {
          await loadIjinCounts({ quiet: true })
          if (selectedSantri?.id) {
            const updated = dataSantri.find(s => s.id === selectedSantri.id)
            if (updated) setSelectedSantri(updated)
          }
        }}
      />

      <PrintMultipleModal
        isOpen={showPrintModal}
        onClose={() => setShowPrintModal(false)}
        selectedSantriList={filteredList.filter(s => selectedItems.has(s.id))}
        printOptions={printOptions}
        onPrintOptionsChange={setPrintOptions}
        onConfirm={() => setShowPrintOffcanvas(true)}
      />

      <PrintMultipleOffcanvas
        isOpen={showPrintOffcanvas}
        onClose={() => {
          setShowPrintOffcanvas(false)
          setPrintOptions({ pulangan: false, shohifah: false })
        }}
        selectedSantriList={filteredList.filter(s => selectedItems.has(s.id))}
        printOptions={printOptions}
      />

      <PrintDataModal
        isOpen={showPrintDataModal}
        onClose={() => setShowPrintDataModal(false)}
        onPrint={(columns) => {
          setSelectedPrintColumns(columns)
          setShowPrintDataModal(false)
          setShowPrintDataOffcanvas(true)
        }}
        data={filteredList}
        filters={printFilterSummary}
      />

      <PrintDataOffcanvas
        isOpen={showPrintDataOffcanvas}
        onClose={() => {
          setShowPrintDataOffcanvas(false)
          setSelectedPrintColumns([])
        }}
        data={filteredList}
        selectedColumns={selectedPrintColumns}
        filters={printFilterSummary}
      />

      <ExportIjinOffcanvas
        isOpen={showExportOffcanvas}
        onClose={() => setShowExportOffcanvas(false)}
        data={dataToExport}
        tahunAjaran={tahunAjaran}
      />
    </motion.div>
  )
}

export default DataIjin
