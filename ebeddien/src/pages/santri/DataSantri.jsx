import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { createPortal, flushSync } from 'react-dom'
import axios from 'axios'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate, useLocation } from 'react-router-dom'
import { santriAPI, pendaftaranAPI, lembagaAPI, ugtGuruTugasTugasanAPI } from '../../services/api'
import {
  subscribeSantriRowsOrdered,
  applySantriSearchServerPayload,
  getLocalSantriSinceWatermark,
  countSantriRows,
} from '../../services/offcanvasSearchCache'
import { fetchSantriDeltaQuiet } from '../../services/santriIndexedDbSync'
import { useOffcanvasBackClose } from '../../hooks/useOffcanvasBackClose'
import ExportSantriOffcanvas from './components/ExportSantriOffcanvas'
import BulkEditGuruTugasOffcanvas from '../UGT/components/BulkEditGuruTugasOffcanvas'
import { useNotification } from '../../contexts/NotificationContext'
import { userCanTambahGtTugasan } from '../../utils/ugtGuruTugasanAccess'
import { useSantriDetailOffcanvas } from '../../contexts/SantriDetailOffcanvasContext'
import { useLembagaFilterAccess } from '../../hooks/useLembagaFilterAccess'
import { LEMBAGA_FILTER_ACTION_CODES } from '../../config/lembagaFilterFiturCodes'
import { useAuthStore } from '../../store/authStore'
import { useActiveHijriyahTahunAjaran } from '../../hooks/useActiveTahunAjaran'
import { useTahunAjaranStore } from '../../store/tahunAjaranStore'
import ManageDataStreamProgress, { MANAGE_DATA_CHUNK_SIZE } from '../Pembayaran/components/ManageDataStreamProgress'
import { fetchManageDataParallelOffsets } from '../Pembayaran/components/manageDataParallelFetch'

const UGT_GURU_TUGAS_PATH = '/ugt/guru-tugas'
const EMPTY_FILTER_VALUE = '__empty__'
const EMPTY_FILTER_LABEL = 'Kosong'

function DataSantri() {
  const { showNotification } = useNotification()
  const { openSantriDetail } = useSantriDetailOffcanvas()
  const navigate = useNavigate()
  const location = useLocation()
  const isUgtGuruTugasPage =
    (location.pathname || '').replace(/\/+$/, '') === UGT_GURU_TUGAS_PATH
  const fiturMenuCodes = useAuthStore((s) => s.fiturMenuCodes)
  const tahunAjaranHijriyah = useActiveHijriyahTahunAjaran()
  // Untuk page UGT → Guru Tugas: ikat ke pilihan header (hijriyah). Saat header berubah, reload.
  const tahunAjaranHeader = useTahunAjaranStore((s) => s.tahunAjaran)
  const ugtTahunAjaran = isUgtGuruTugasPage ? (tahunAjaranHeader || '').trim() : ''
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [streamProgress, setStreamProgress] = useState({ active: false, loaded: 0, total: null })
  const loadAbortRef = useRef(null)
  const [santriList, setSantriList] = useState([])
  const [filteredList, setFilteredList] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(50)
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [isInputFocused, setIsInputFocused] = useState(false)
  const [lembagaFilter, setLembagaFilter] = useState('')
  const [kelasFilter, setKelasFilter] = useState('')
  const [kelFilter, setKelFilter] = useState('')
  // Pada page UGT → Guru Tugas, sumber data sudah dibatasi backend (santri terikat madrasah di TA terpilih),
  // sehingga preset filter status_santri dikosongkan agar tidak menyaring ulang berdasarkan label status.
  const [statusSantriFilter, setStatusSantriFilter] = useState(() =>
    isUgtGuruTugasPage ? [] : ['mukim', 'khoriji']
  )
  const [isStatusFilterOpen, setIsStatusFilterOpen] = useState(false)
  const [kategoriFilter, setKategoriFilter] = useState([])
  const [isKategoriFilterOpen, setIsKategoriFilterOpen] = useState(false)
  const [daerahFilter, setDaerahFilter] = useState('')
  const [kamarFilter, setKamarFilter] = useState('')
  const [tidakDiniyahFilter, setTidakDiniyahFilter] = useState(false)
  const [tidakFormalFilter, setTidakFormalFilter] = useState(false)
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' })
  const [apiDaerahFilterOptions, setApiDaerahFilterOptions] = useState([])
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [menuOpen, setMenuOpen] = useState(false)
  const statusFilterRef = useRef(null)
  const statusFilterButtonRef = useRef(null)
  const statusFilterDropdownRef = useRef(null)
  const [statusFilterPosition, setStatusFilterPosition] = useState({ top: 0, left: 0, width: 0 })
  const kategoriFilterRef = useRef(null)
  const kategoriFilterButtonRef = useRef(null)
  const kategoriFilterDropdownRef = useRef(null)
  const [kategoriFilterPosition, setKategoriFilterPosition] = useState({ top: 0, left: 0, width: 0 })
  const menuRef = useRef(null)
  const [isExportOffcanvasOpen, setIsExportOffcanvasOpen] = useState(false)
  const [showBulkEditGtOffcanvas, setShowBulkEditGtOffcanvas] = useState(false)
  useOffcanvasBackClose(isExportOffcanvasOpen, () => setIsExportOffcanvasOpen(false))
  useOffcanvasBackClose(showBulkEditGtOffcanvas, () => setShowBulkEditGtOffcanvas(false))
  const [lembagaRows, setLembagaRows] = useState([])
  const lembagaAccess = useLembagaFilterAccess(LEMBAGA_FILTER_ACTION_CODES.santriSemua)
  const canOpenExcelEditor = Array.isArray(fiturMenuCodes) && fiturMenuCodes.includes('action.santri.excel')
  const authUser = useAuthStore((s) => s.user)
  const canBulkEditGt = isUgtGuruTugasPage && userCanTambahGtTugasan(fiturMenuCodes, authUser, true)

  const openExcelEditor = useCallback(() => {
    if (isUgtGuruTugasPage) {
      const ta = (ugtTahunAjaran || tahunAjaranHijriyah || '').trim()
      if (!ta) {
        showNotification('Pilih tahun ajaran di header terlebih dahulu', 'warning')
        return
      }
    }
    const params = new URLSearchParams()
    if (lembagaFilter) params.set('lembaga', lembagaFilter)
    if (kelasFilter) params.set('kelas', kelasFilter)
    if (kelFilter) params.set('kel', kelFilter)
    if (statusSantriFilter.length > 0) params.set('status', statusSantriFilter.join(','))
    if (kategoriFilter.length > 0) params.set('kategori', kategoriFilter.join(','))
    if (daerahFilter) params.set('daerah', daerahFilter)
    if (kamarFilter) params.set('kamar', kamarFilter)
    if (tidakDiniyahFilter) params.set('tidak_diniyah', '1')
    if (tidakFormalFilter) params.set('tidak_formal', '1')
    if (isUgtGuruTugasPage) {
      params.set('ugt_guru_tugas', '1')
      const ta = ugtTahunAjaran || tahunAjaranHijriyah
      if (ta) params.set('tahun_ajaran_ugt', String(ta).trim())
    }
    const qs = params.toString()
    navigate(qs ? `/santri/excel-editor?${qs}` : '/santri/excel-editor')
  }, [
    isUgtGuruTugasPage,
    ugtTahunAjaran,
    tahunAjaranHijriyah,
    lembagaFilter,
    kelasFilter,
    kelFilter,
    statusSantriFilter,
    kategoriFilter,
    daerahFilter,
    kamarFilter,
    tidakDiniyahFilter,
    tidakFormalFilter,
    navigate,
    showNotification,
  ])

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
    const allowedSet = lembagaAccess.allowedLembagaIds ? new Set(lembagaAccess.allowedLembagaIds.map(String)) : null
    return rows
      .filter((l) => !allowedSet || allowedSet.has(String(l.id)))
      .map((l) => {
        const id = String(l.id)
        const count = santriList.filter(
          (s) => sameLembaga(s.diniyah, id) || sameLembaga(s.formal, id)
        ).length
        const nama = l.nama != null && String(l.nama).trim() !== '' ? String(l.nama) : id
        const kategori = l.kategori != null && String(l.kategori).trim() !== '' ? String(l.kategori) : 'Lainnya'
        return { value: id, label: `${nama} (${count})`, count, kategori }
      })
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [lembagaRows, santriList, lembagaAccess.allowedLembagaIds])

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

  // Dynamic unique values untuk filter (dengan count)
  const dynamicUniqueStatusSantri = useMemo(() => {
    let filtered = santriList
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
  }, [santriList, lembagaFilter, kategoriFilter, daerahFilter, kamarFilter, isKategoriSelected])

  const dynamicUniqueKategori = useMemo(() => {
    let filtered = santriList
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
  }, [santriList, lembagaFilter, statusSantriFilter, daerahFilter, kamarFilter, isStatusSantriSelected])

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
      const count = santriList.filter(
        (s) => isKategoriSelected(s.kategori) && String(s.daerah || '') === label
      ).length
      return { value: label, count }
    })
    if (apiOptions.length > 0) return apiOptions
    let filtered = santriList
    if (lembagaFilter) filtered = filtered.filter(s => sameLembaga(s.diniyah, lembagaFilter) || sameLembaga(s.formal, lembagaFilter))
    if (statusSantriFilter.length > 0) filtered = filtered.filter(s => isStatusSantriSelected(s.status_santri))
    filtered = filtered.filter(s => isKategoriSelected(s.kategori))
    const values = [...new Set(filtered.map(s => (s.daerah != null && s.daerah !== '') ? String(s.daerah) : null).filter(Boolean))]
    return values.map(val => ({
      value: val,
      count: filtered.filter(s => (s.daerah || '') === val).length
    })).sort((a, b) => (a.value || '').localeCompare(b.value || ''))
  }, [kategoriFilter, apiDaerahFilterOptions, santriList, lembagaFilter, statusSantriFilter, isStatusSantriSelected, isKategoriSelected])

  const dynamicUniqueKamar = useMemo(() => {
    if (kategoriFilter.length === 0) return []
    let filtered = santriList
    if (lembagaFilter) filtered = filtered.filter(s => sameLembaga(s.diniyah, lembagaFilter) || sameLembaga(s.formal, lembagaFilter))
    if (statusSantriFilter.length > 0) filtered = filtered.filter(s => isStatusSantriSelected(s.status_santri))
    if (kategoriFilter.length > 0) filtered = filtered.filter(s => isKategoriSelected(s.kategori))
    if (daerahFilter) filtered = filtered.filter(s => (s.daerah || '') === daerahFilter)
    const values = [...new Set(filtered.map(s => (s.kamar != null && s.kamar !== '') ? String(s.kamar) : null).filter(Boolean))]
    const counts = values.map(val => ({
      value: val,
      count: filtered.filter(s => (s.kamar || '') === val).length
    }))
    return counts.sort((a, b) => (a.value || '').localeCompare(b.value || ''))
  }, [santriList, lembagaFilter, statusSantriFilter, kategoriFilter, daerahFilter, isStatusSantriSelected, isKategoriSelected])

  // Kelas & Kel (rombel) — hanya untuk santri di lembaga terpilih
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
    return santriList.filter(s => sameLembaga(s.diniyah, lembagaFilter) || sameLembaga(s.formal, lembagaFilter))
  }, [santriList, lembagaFilter])

  useEffect(() => {
    const allowed = lembagaAccess.allowedLembagaIds
    if (!allowed || allowed.length === 0) return
    if (allowed.length === 1 && lembagaFilter !== allowed[0]) {
      setLembagaFilter(allowed[0])
    }
  }, [lembagaAccess.allowedLembagaIds, lembagaFilter])
  const dynamicUniqueKelas = useMemo(() => {
    if (!lembagaFilter) return []
    let filtered = santriInLembaga
    if (statusSantriFilter.length > 0) filtered = filtered.filter(s => isStatusSantriSelected(s.status_santri))
    if (kategoriFilter.length > 0) filtered = filtered.filter(s => isKategoriSelected(s.kategori))
    if (daerahFilter) filtered = filtered.filter(s => (s.daerah || '') === daerahFilter)
    if (kamarFilter) filtered = filtered.filter(s => (s.kamar || '') === kamarFilter)
    const values = [...new Set(filtered.map(getKelasForLembaga).filter(Boolean))]
    const counts = values.map(val => ({
      value: val,
      count: filtered.filter(s => getKelasForLembaga(s) === val).length
    }))
    return counts.sort((a, b) => (String(a.value || '')).localeCompare(String(b.value || '')))
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
    const counts = values.map(val => ({
      value: val,
      count: filtered.filter(s => getKelForLembaga(s) === val).length
    }))
    return counts.sort((a, b) => (String(a.value || '')).localeCompare(String(b.value || '')))
  }, [lembagaFilter, kelasFilter, santriInLembaga, statusSantriFilter, kategoriFilter, daerahFilter, kamarFilter, isStatusSantriSelected, isKategoriSelected])

  // Filter data berdasarkan search dan filter
  useEffect(() => {
    let filtered = santriList

    if (lembagaAccess.allowedLembagaIds?.length) {
      const allowedSet = new Set(lembagaAccess.allowedLembagaIds.map(String))
      filtered = filtered.filter(
        (s) => allowedSet.has(String(s.diniyah || '')) || allowedSet.has(String(s.formal || ''))
      )
    }

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
        const aVal = a[sortConfig.key]
        const bVal = b[sortConfig.key]
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
  }, [searchQuery, santriList, lembagaFilter, kelasFilter, kelFilter, statusSantriFilter, kategoriFilter, daerahFilter, kamarFilter, tidakDiniyahFilter, tidakFormalFilter, sortConfig, isStatusSantriSelected, isKategoriSelected, lembagaAccess.allowedLembagaIds])

  const mapSantriRows = useCallback((data) => (
    (Array.isArray(data) ? data : []).map((row) => ({
      ...row,
      status_santri: row?.status_santri ?? row?.status ?? '',
      kategori: row?.kategori ?? row?.kategori_santri ?? '',
    }))
  ), [])

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

  /**
   * Page UGT → Guru Tugas: muat santri terikat madrasah pada TA terpilih (header hijriyah).
   * Reload otomatis tiap kali `ugtTahunAjaran` berubah.
   */
  const loadUgtGuruTugasData = useCallback(async (ta) => {
    const target = String(ta || '').trim()
    loadAbortRef.current?.abort()
    const ac = new AbortController()
    loadAbortRef.current = ac
    setError('')
    setStreamProgress({ active: false, loaded: 0, total: null })
    if (!target) {
      setSantriList([])
      setCurrentPage(1)
      return
    }
    setLoading(true)
    try {
      const res = await ugtGuruTugasTugasanAPI.listSantriByTa(target)
      if (ac.signal.aborted) return
      const rows = res && res.success && Array.isArray(res.data) ? res.data : []
      setSantriList(mapSantriRows(rows))
      setCurrentPage(1)
    } catch (err) {
      if (axios.isCancel?.(err) || err?.code === 'ERR_CANCELED' || err?.name === 'CanceledError') return
      console.error('Error loading santri UGT Guru Tugas:', err)
      setError(err?.response?.data?.message || err?.message || 'Gagal memuat data santri Guru Tugas')
      setSantriList([])
    } finally {
      if (loadAbortRef.current === ac) {
        setLoading(false)
      }
    }
  }, [mapSantriRows])

  useEffect(() => {
    if (isUgtGuruTugasPage) return undefined
    const sub = subscribeSantriRowsOrdered(setSantriList)
    return () => sub.unsubscribe()
  }, [isUgtGuruTugasPage])

  useEffect(() => {
    if (isUgtGuruTugasPage) return undefined
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
  }, [loadSantriData, isUgtGuruTugasPage])

  // Reload page UGT Guru Tugas saat TA header berubah.
  useEffect(() => {
    if (!isUgtGuruTugasPage) return undefined
    loadUgtGuruTugasData(ugtTahunAjaran)
    return () => {
      loadAbortRef.current?.abort()
    }
  }, [isUgtGuruTugasPage, ugtTahunAjaran, loadUgtGuruTugasData])

  const refreshList = useCallback(() => {
    if (isUgtGuruTugasPage) {
      loadUgtGuruTugasData(ugtTahunAjaran)
    } else {
      loadSantriData({ softRefresh: true })
    }
  }, [isUgtGuruTugasPage, loadUgtGuruTugasData, ugtTahunAjaran, loadSantriData])

  const openDetailForRow = useCallback(
    (santri) => {
      openSantriDetail(santri, { onEditSaved: refreshList })
    },
    [openSantriDetail, refreshList]
  )

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
  }, [searchQuery, lembagaFilter, kelasFilter, kelFilter, statusSantriFilter, kategoriFilter, daerahFilter, kamarFilter, tidakDiniyahFilter, tidakFormalFilter, sortConfig, itemsPerPage])

  // Reset filter kelas & kel saat lembaga dihapus
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
      setTimeout(() => {
        document.addEventListener('mousedown', handleClickOutside)
      }, 0)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
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
      setTimeout(() => {
        document.addEventListener('mousedown', handleClickOutside)
      }, 0)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isKategoriFilterOpen])

  // Tutup menu saat klik luar
  useEffect(() => {
    if (!menuOpen) return
    const onOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false)
    }
    document.addEventListener('click', onOutside)
    return () => document.removeEventListener('click', onOutside)
  }, [menuOpen])

  const exportData = selectionMode && selectedIds.size > 0
    ? filteredList.filter((s) => selectedIds.has(s.id))
    : filteredList

  const selectedGtRows = useMemo(() => {
    if (!isUgtGuruTugasPage || selectedIds.size === 0) return []
    return filteredList.filter((s) => selectedIds.has(s.id))
  }, [isUgtGuruTugasPage, selectedIds, filteredList])

  const toggleSelectAllPage = () => {
    if (selectedIds.size >= paginatedList.length) {
      setSelectedIds((prev) => {
        const next = new Set(prev)
        paginatedList.forEach((s) => next.delete(s.id))
        return next
      })
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev)
        paginatedList.forEach((s) => next.add(s.id))
        return next
      })
    }
  }

  const toggleSelectOne = (id, e) => {
    e.stopPropagation()
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
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

  return (
    <div className="h-full overflow-hidden" style={{ minHeight: 0 }}>
      <div className="h-full overflow-y-auto page-content-scroll" style={{ minHeight: 0 }}>
        <div className="p-4 sm:p-6 lg:p-8">
          {isUgtGuruTugasPage && selectionMode && selectedIds.size > 0 && (
            <div className="mb-3 flex flex-wrap items-center gap-2">
              {canBulkEditGt && (
                <button
                  type="button"
                  onClick={() => setShowBulkEditGtOffcanvas(true)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition-colors"
                  title="Ubah massal penugasan terpilih"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  Ubah Massal ({selectedIds.size})
                </button>
              )}
              <button
                type="button"
                onClick={() => setSelectedIds(new Set())}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors"
              >
                Hapus pilihan
              </button>
            </div>
          )}
          {isUgtGuruTugasPage && (
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-teal-200 dark:border-teal-700/40 bg-teal-50/70 dark:bg-teal-900/20 px-3 py-2 text-xs sm:text-sm text-teal-800 dark:text-teal-200">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                <span>
                  Menampilkan santri terikat madrasah pada tahun ajaran{' '}
                  <span className="font-semibold">{ugtTahunAjaran || '—'}</span>
                  {' '}(ikut pilihan header).
                </span>
              </div>
              <span className="px-2 py-0.5 rounded-full bg-teal-100 dark:bg-teal-800/40 text-[11px] font-medium tabular-nums">
                {filteredList.length} santri
              </span>
            </div>
          )}
          {/* Search & Filter — sticky seperti di page Pengurus */}
          <div className="sticky top-0 z-10 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 mb-4">
        <div className="rounded-xl overflow-hidden">
                <div className="relative pb-2 px-4 pt-3">
                  <div className="relative">
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
                  </div>
                  <div className="absolute left-0 right-0 bottom-0 h-0.5 bg-gray-300 dark:bg-gray-600"></div>
                  <div className={`absolute left-0 right-0 bottom-0 h-0.5 bg-teal-500 transition-opacity ${isInputFocused ? 'opacity-100' : 'opacity-0'}`}></div>
                </div>

                <ManageDataStreamProgress
                  active={streamProgress.active || loading}
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
                            disabled={lembagaAccess.lembagaFilterLocked && (lembagaAccess.allowedLembagaIds?.length === 1)}
                          >
                            <option value="">{lembagaAccess.canFilterAllLembaga ? 'Semua Lembaga' : 'Lembaga'}</option>
                            {lembagaMasterFilterGroups.map((group) => (
                              <optgroup key={group.kategori} label={group.kategori}>
                                {group.options.map((item) => (
                                  <option key={item.value} value={item.value}>
                                    {item.label}
                                  </option>
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
                          <div className="relative" ref={statusFilterRef}>
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
                              <svg
                                className={`w-3 h-3 transition-transform ${isStatusFilterOpen ? 'rotate-180' : ''}`}
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                              </svg>
                            </button>
                          </div>
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
                                <div className="p-2 space-y-1">
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
                                </div>
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
                              <svg
                                className={`w-3 h-3 transition-transform ${isKategoriFilterOpen ? 'rotate-180' : ''}`}
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
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
                                    <div className="pt-1 border-t border-gray-200 dark:border-gray-600">
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
                                    </div>
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
                            onClick={() => refreshList()}
                            disabled={loading}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors disabled:opacity-50"
                            title="Refresh"
                          >
                            <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                              setLembagaFilter(lembagaAccess.allowedLembagaIds?.length === 1 ? lembagaAccess.allowedLembagaIds[0] : '')
                              setTidakDiniyahFilter(false)
                              setTidakFormalFilter(false)
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
        </div>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            {/* Tabel Santri */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden">
              <div className="px-4 sm:px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                <div className="flex flex-row items-center justify-between gap-2 min-w-0">
                  <h2 className="text-base sm:text-lg font-semibold text-gray-500 dark:text-gray-400 shrink-0">
                    {filteredList.length}
                  </h2>
                  <div className="flex items-center gap-2 shrink-0" ref={menuRef}>
                    <select
                      value={itemsPerPage >= filteredList.length ? 'all' : itemsPerPage}
                      onChange={(e) => handleItemsPerPageChange(e.target.value)}
                      className="h-8 pr-6 pl-1 py-1 text-xs bg-transparent border-none text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-0 min-w-0 w-14 sm:w-16 cursor-pointer appearance-none bg-[length:12px] bg-[right_2px_center] bg-no-repeat [background-image:url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20fill%3D%22none%22%20viewBox%3D%220%200%2024%2024%22%20stroke%3D%22%236b7280%22%3E%3Cpath%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%20stroke-width%3D%222%22%20d%3D%22M19%209l-7%207-7-7%22%2F%3E%3C%2Fsvg%3E')] dark:[background-image:url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20fill%3D%22none%22%20viewBox%3D%220%200%2024%2024%22%20stroke%3D%22%239ca3af%22%3E%3Cpath%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%20stroke-width%3D%222%22%20d%3D%22M19%209l-7%207-7-7%22%2F%3E%3C%2Fsvg%3E')]"
                    >
                      <option value="25">25</option>
                      <option value="50">50</option>
                      <option value="100">100</option>
                      <option value="200">200</option>
                      <option value="500">500</option>
                      <option value="all">Semua</option>
                    </select>
                    {/* PC: tombol Eksport & Pilih Check tampil sejajar */}
                    <div className="hidden sm:flex items-center gap-2">
                      {canOpenExcelEditor && (
                        <button
                          type="button"
                          onClick={openExcelEditor}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 h-8 text-xs font-medium rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-teal-500/50"
                          title="Editor spreadsheet santri"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 17v-2m3 2v-4m3 4v-6M7 7h10M7 3h10a2 2 0 012 2v14a2 2 0 01-2 2H7a2 2 0 01-2-2V5a2 2 0 012-2z" />
                          </svg>
                          Excel
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setIsExportOffcanvasOpen(true)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 h-8 text-xs font-medium rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-teal-500/50"
                        title="Eksport data"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                        Eksport
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectionMode((m) => { if (m) setSelectedIds(new Set()); return !m })}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 h-8 text-xs font-medium rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/50 ${selectionMode ? 'text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-900/20' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        {selectionMode ? 'Selesai Pilih' : 'Pilih Check'}
                      </button>
                    </div>
                    {/* Mobile: menu dropdown */}
                    <div className="relative sm:hidden">
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setMenuOpen((o) => !o) }}
                        className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-teal-500/50"
                        title="Menu"
                        aria-expanded={menuOpen}
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
                        </svg>
                      </button>
                      <AnimatePresence>
                        {menuOpen && (
                          <motion.div
                            initial={{ opacity: 0, y: -4 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -4 }}
                            transition={{ duration: 0.15 }}
                            className="absolute right-0 top-full mt-1 py-1 w-44 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 shadow-lg z-50"
                          >
                            <button
                              type="button"
                              onClick={() => { setMenuOpen(false); setIsExportOffcanvasOpen(true) }}
                              className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                              </svg>
                              Eksport
                            </button>
                            {canOpenExcelEditor && (
                              <button
                                type="button"
                                onClick={() => { setMenuOpen(false); openExcelEditor() }}
                                className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 17v-2m3 2v-4m3 4v-6M7 7h10M7 3h10a2 2 0 012 2v14a2 2 0 01-2 2H7a2 2 0 01-2-2V5a2 2 0 012-2z" />
                                </svg>
                                Excel
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => { setSelectionMode((m) => { if (m) setSelectedIds(new Set()); return !m }); setMenuOpen(false) }}
                              className={`w-full px-3 py-2 text-left text-sm flex items-center gap-2 ${selectionMode ? 'text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-900/20' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                              {selectionMode ? 'Selesai Pilih' : 'Pilih Check'}
                            </button>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                </div>
              </div>

              {filteredList.length === 0 ? (
                <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                  <svg className="w-12 h-12 mx-auto mb-4 text-gray-300 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <p>Belum ada data santri</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 dark:bg-gray-900">
                      <tr>
                        {selectionMode && (
                          <th className="px-2 sm:px-4 py-3 w-10">
                            <input
                              type="checkbox"
                              checked={paginatedList.length > 0 && paginatedList.every((s) => selectedIds.has(s.id))}
                              onChange={toggleSelectAllPage}
                              onClick={(e) => e.stopPropagation()}
                              className="rounded border-gray-300 dark:border-gray-600 text-teal-600 focus:ring-teal-500"
                            />
                          </th>
                        )}
                        <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">No</th>
                        <th onClick={() => handleSort('nama')} className="px-4 sm:px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors whitespace-nowrap">
                          <div className="flex items-center gap-2">Nama <SortIcon columnKey="nama" /></div>
                        </th>
                        {isUgtGuruTugasPage ? (
                          <>
                            <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Madrasah</th>
                            <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">PJGT</th>
                            <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Koordinator</th>
                            <th onClick={() => handleSort('status_santri')} className="px-4 sm:px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors whitespace-nowrap">
                              <div className="flex items-center gap-2">Status Santri <SortIcon columnKey="status_santri" /></div>
                            </th>
                            <th onClick={() => handleSort('kategori')} className="px-4 sm:px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors whitespace-nowrap">
                              <div className="flex items-center gap-2">Kategori <SortIcon columnKey="kategori" /></div>
                            </th>
                            <th onClick={() => handleSort('nis')} className="px-4 sm:px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors whitespace-nowrap">
                              <div className="flex items-center gap-2">NIS <SortIcon columnKey="nis" /></div>
                            </th>
                            <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">NIK</th>
                          </>
                        ) : (
                          <>
                            <th onClick={() => handleSort('nis')} className="px-4 sm:px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors whitespace-nowrap">
                              <div className="flex items-center gap-2">NIS <SortIcon columnKey="nis" /></div>
                            </th>
                            <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">NIK</th>
                            <th onClick={() => handleSort('diniyah')} className="px-4 sm:px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors whitespace-nowrap">
                              <div className="flex items-center gap-2">Diniyah <SortIcon columnKey="diniyah" /></div>
                            </th>
                            <th onClick={() => handleSort('formal')} className="px-4 sm:px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors whitespace-nowrap">
                              <div className="flex items-center gap-2">Formal <SortIcon columnKey="formal" /></div>
                            </th>
                            <th onClick={() => handleSort('status_santri')} className="px-4 sm:px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors whitespace-nowrap">
                              <div className="flex items-center gap-2">Status Santri <SortIcon columnKey="status_santri" /></div>
                            </th>
                            <th onClick={() => handleSort('kategori')} className="px-4 sm:px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors whitespace-nowrap">
                              <div className="flex items-center gap-2">Kategori <SortIcon columnKey="kategori" /></div>
                            </th>
                            <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Daerah.Kamar</th>
                          </>
                        )}
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                      {paginatedList.map((santri, index) => (
                        <motion.tr
                          key={santri.id}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ duration: 0.3, delay: index * 0.02 }}
                          onClick={() => openDetailForRow(santri)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetailForRow(santri) } }}
                          className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors duration-150 cursor-pointer"
                        >
                          {selectionMode && (
                            <td className="px-2 sm:px-4 py-4 w-10" onClick={(e) => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                checked={selectedIds.has(santri.id)}
                                onChange={(e) => toggleSelectOne(santri.id, e)}
                                className="rounded border-gray-300 dark:border-gray-600 text-teal-600 focus:ring-teal-500"
                              />
                            </td>
                          )}
                          <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-200">
                            {startIndex + index + 1}
                          </td>
                          <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-200">{santri.nama || '-'}</td>
                          {isUgtGuruTugasPage ? (
                            <>
                              <td className="px-4 sm:px-6 py-4 text-sm text-gray-700 dark:text-gray-300 max-w-[14rem] sm:max-w-xs">
                                <span className="line-clamp-2" title={santri.madrasah_gt || ''}>
                                  {(santri.madrasah_gt && String(santri.madrasah_gt).trim()) || '—'}
                                </span>
                              </td>
                              <td className="px-4 sm:px-6 py-4 text-sm text-gray-700 dark:text-gray-300 max-w-[12rem]">
                                <span className="line-clamp-2" title={santri.pjgt_nama || ''}>
                                  {(santri.pjgt_nama && String(santri.pjgt_nama).trim()) || '—'}
                                </span>
                              </td>
                              <td className="px-4 sm:px-6 py-4 text-sm text-gray-700 dark:text-gray-300 max-w-[12rem]">
                                <span className="line-clamp-2" title={santri.koordinator_nama || ''}>
                                  {(santri.koordinator_nama && String(santri.koordinator_nama).trim()) || '—'}
                                </span>
                              </td>
                              <td className="px-4 sm:px-6 py-4 whitespace-nowrap">
                                <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${santri.status_santri ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400' : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'}`}>
                                  {santri.status_santri || '-'}
                                </span>
                              </td>
                              <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">{santri.kategori || '-'}</td>
                              <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-700 dark:text-gray-300">{santri.nis ?? santri.id ?? '-'}</td>
                              <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-700 dark:text-gray-300">{santri.nik || '-'}</td>
                            </>
                          ) : (
                            <>
                              <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-700 dark:text-gray-300">{santri.nis ?? santri.id ?? '-'}</td>
                              <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-700 dark:text-gray-300">{santri.nik || '-'}</td>
                              <td className="px-4 sm:px-6 py-4 whitespace-nowrap">
                                <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${santri.diniyah ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'}`}>
                                  {santri.diniyah || '-'}
                                </span>
                              </td>
                              <td className="px-4 sm:px-6 py-4 whitespace-nowrap">
                                <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${santri.formal ? 'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-400' : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'}`}>
                                  {santri.formal || '-'}
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
                            </>
                          )}
                        </motion.tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {filteredList.length > 0 && totalPages > 1 && (
                <div className="px-4 sm:px-6 py-4 border-t border-gray-200 dark:border-gray-700">
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="text-sm text-gray-700 dark:text-gray-300">
                      Menampilkan {startIndex + 1} - {Math.min(endIndex, filteredList.length)} dari {filteredList.length} santri
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handlePageChange(currentPage - 1)}
                        disabled={currentPage === 1}
                        className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
                        </svg>
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
                              onClick={() => handlePageChange(pageNum)}
                              className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${currentPage === pageNum ? 'bg-teal-600 text-white' : 'border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'}`}
                            >
                              {pageNum}
                            </button>
                          )
                        })}
                      </div>
                      <button
                        onClick={() => handlePageChange(currentPage + 1)}
                        disabled={currentPage === totalPages}
                        className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {createPortal(
              <ExportSantriOffcanvas
                isOpen={isExportOffcanvasOpen}
                onClose={() => setIsExportOffcanvasOpen(false)}
                filteredData={exportData}
              />,
              document.body
            )}
            {isUgtGuruTugasPage && createPortal(
              <BulkEditGuruTugasOffcanvas
                isOpen={showBulkEditGtOffcanvas}
                onClose={() => setShowBulkEditGtOffcanvas(false)}
                selectedRows={selectedGtRows}
                currentTahunAjaran={ugtTahunAjaran}
                onSuccess={() => {
                  setSelectedIds(new Set())
                  refreshList()
                }}
              />,
              document.body
            )}
            {/* Spacer agar bagian bawah tidak tertutup nav bawah di HP */}
            <div className="h-20 sm:h-0 flex-shrink-0" aria-hidden="true" />
          </motion.div>
        </div>
      </div>
    </div>
  )
}

export default DataSantri
