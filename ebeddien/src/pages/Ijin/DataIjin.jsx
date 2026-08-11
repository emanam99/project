import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { ijinAPI, kalenderAPI, santriAPI } from '../../services/api'
import { useNotification } from '../../contexts/NotificationContext'
import { useOffcanvasBackClose } from '../../hooks/useOffcanvasBackClose'
import { useActiveHijriyahTahunAjaran } from '../../hooks/useActiveTahunAjaran'
import { useTahunAjaranStore } from '../../store/tahunAjaranStore'
import { getSortedHijriyahRentangRows } from '../../utils/tahunAjaranActive'
import { EBEDDIEN_IJIN_HINT, ijinHintMatches } from '../../services/ijinLiveEvents'
import { tryIjinMarkKembali } from '../../services/ijinOutbox/ijinOutboxService'
import { PickDateHijri, formatHijriDateDisplay } from '../../components/PickDateHijri'
import SearchOffcanvas from '../../components/Biodata/SearchOffcanvas'
import BukuTamuQrInlineScanner from '../Cashless/components/BukuTamuQrInlineScanner'
import DetailSantriOffcanvas from './components/DetailSantriOffcanvas'
import PrintIjinOffcanvas from './components/PrintIjinOffcanvas'
import DataIjinKelola from './DataIjinKelola'

const IJIN_ALASAN_FILTER_OPTIONS = ['Sakit', 'Walimah', 'Orang Tua Sakit', 'Orang Tua Wafat']

function uniqueCounts(rows, getter) {
  const map = new Map()
  for (const r of rows) {
    const raw = getter(r)
    if (raw == null || raw === '') continue
    const key = String(raw).trim()
    if (!key) continue
    map.set(key, (map.get(key) || 0) + 1)
  }
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], 'id'))
    .map(([value, count]) => ({ value, count }))
}

const selectFilterClass =
  'border rounded p-1 h-7 min-w-0 text-xs bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 focus:ring-1 focus:ring-teal-400'

function todayYmd() {
  const d = new Date()
  return todayYmdFromDate(d)
}

function todayYmdFromDate(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** N hari terakhir inklusif hari ini (Masehi, untuk filter tanggal_dibuat). */
function rangeLastDays(n) {
  const sampai = todayYmd()
  const d = new Date()
  d.setDate(d.getDate() - (Math.max(1, n) - 1))
  return { tanggal_dari: todayYmdFromDate(d), tanggal_sampai: sampai }
}

const LIST_PERIODS = [
  { id: 'hari', label: 'Hari ini' },
  { id: '3', label: '3 hari terakhir' },
  { id: '7', label: '7 hari terakhir' },
  { id: '30', label: '30 hari terakhir' },
]

function rangeForPeriod(period) {
  if (period === '3') return rangeLastDays(3)
  if (period === '7') return rangeLastDays(7)
  if (period === '30') return rangeLastDays(30)
  return rangeLastDays(1)
}

const IJIN_QR_PREFIXES = ['CS', 'CM']
const IJIN_QR_HINT = 'Arahkan kamera ke QR kartu santri (CS) atau mahrom (CM).'
const IJIN_QR_CAMERA_STORAGE_KEY = 'ebeddien.ijin.qrCameraMinimized'
const IJIN_LIST_FILTER_STORAGE_KEY = 'ebeddien.ijin.listFilter'
const IJIN_TAHUN_AJARAN_STORAGE_KEY = 'ebeddien.ijin.selectedTahunAjaran'

function readSavedTahunAjaran() {
  if (typeof window === 'undefined') return ''
  try {
    return String(window.localStorage.getItem(IJIN_TAHUN_AJARAN_STORAGE_KEY) || '').trim()
  } catch {
    return ''
  }
}

function writeSavedTahunAjaran(ta) {
  if (typeof window === 'undefined') return
  try {
    const v = String(ta || '').trim()
    if (v) window.localStorage.setItem(IJIN_TAHUN_AJARAN_STORAGE_KEY, v)
    else window.localStorage.removeItem(IJIN_TAHUN_AJARAN_STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

function readCameraMinimized() {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(IJIN_QR_CAMERA_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

function writeCameraMinimized(minimized) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(IJIN_QR_CAMERA_STORAGE_KEY, minimized ? '1' : '0')
  } catch {
    /* ignore */
  }
}

function readListFilter() {
  if (typeof window === 'undefined') {
    return { period: 'hari', hijriDari: '', hijriSampai: '', showRange: false }
  }
  try {
    const raw = window.localStorage.getItem(IJIN_LIST_FILTER_STORAGE_KEY)
    if (!raw) return { period: 'hari', hijriDari: '', hijriSampai: '', showRange: false }
    const parsed = JSON.parse(raw)
    const period = ['hari', '3', '7', '30', 'custom'].includes(parsed?.period)
      ? parsed.period
      : 'hari'
    const hijriDari =
      typeof parsed?.hijriDari === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(parsed.hijriDari)
        ? parsed.hijriDari
        : ''
    const hijriSampai =
      typeof parsed?.hijriSampai === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(parsed.hijriSampai)
        ? parsed.hijriSampai
        : ''
    const showRange = parsed?.showRange === true || period === 'custom'
    return { period, hijriDari, hijriSampai, showRange }
  } catch {
    return { period: 'hari', hijriDari: '', hijriSampai: '', showRange: false }
  }
}

function writeListFilter(filter) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(IJIN_LIST_FILTER_STORAGE_KEY, JSON.stringify(filter))
  } catch {
    /* ignore */
  }
}

async function hijriToMasehiYmd(hijriYmd) {
  if (!hijriYmd || !/^\d{4}-\d{2}-\d{2}$/.test(hijriYmd)) return null
  try {
    const r = await kalenderAPI.get({ action: 'to_masehi', tanggal: hijriYmd })
    const m = r?.masehi
    if (m && /^\d{4}-\d{2}-\d{2}/.test(m) && m.slice(0, 10) !== '0000-00-00') {
      return m.slice(0, 10)
    }
  } catch {
    /* ignore */
  }
  return null
}

function isDesktopIjinLayout() {
  if (typeof window === 'undefined') return true
  return window.matchMedia('(min-width: 1024px)').matches
}

function formatWaktuMasehi(iso) {
  if (!iso) return '—'
  try {
    const d = new Date(String(iso).replace(' ', 'T'))
    return d.toLocaleString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

function labelTanggalIjin(s) {
  if (!s) return '—'
  const t = String(s).trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return formatHijriDateDisplay(t)
  return t
}

function jamShort(raw) {
  if (raw == null || raw === '') return ''
  const m = String(raw).trim().match(/^(\d{1,2}):(\d{2})/)
  if (!m) return ''
  return `${String(m[1]).padStart(2, '0')}:${m[2]}`
}

function DataIjin() {
  const { showNotification } = useNotification()
  const activeTahunAjaran = useActiveHijriyahTahunAjaran()
  const hijriyahMasterRows = useTahunAjaranStore((s) => s.hijriyahMasterRows)
  const storeOptions = useTahunAjaranStore((s) => s.options)
  const [selectedTahunAjaran, setSelectedTahunAjaran] = useState(() => readSavedTahunAjaran())
  const [tahunPickerOpen, setTahunPickerOpen] = useState(false)
  const tahunPickerRef = useRef(null)
  const tahunInitializedRef = useRef(Boolean(readSavedTahunAjaran()))
  const [viewMode, setViewMode] = useState('desk')
  const [desktopLayout, setDesktopLayout] = useState(() => isDesktopIjinLayout())

  const tahunAjaranOptions = useMemo(() => {
    const fromRows = getSortedHijriyahRentangRows(hijriyahMasterRows).map((r) => r.tahun_ajaran)
    if (fromRows.length > 0) return fromRows
    return (storeOptions || [])
      .map((o) => String(o.value ?? o.label ?? '').trim())
      .filter(Boolean)
  }, [hijriyahMasterRows, storeOptions])

  const tahunAjaran = selectedTahunAjaran || activeTahunAjaran || ''

  useEffect(() => {
    if (activeTahunAjaran && !tahunInitializedRef.current) {
      setSelectedTahunAjaran(activeTahunAjaran)
      tahunInitializedRef.current = true
    }
  }, [activeTahunAjaran])

  useEffect(() => {
    if (tahunAjaran) writeSavedTahunAjaran(tahunAjaran)
  }, [tahunAjaran])

  useEffect(() => {
    if (!tahunPickerOpen) return undefined
    const onPointerDown = (e) => {
      if (tahunPickerRef.current && !tahunPickerRef.current.contains(e.target)) {
        setTahunPickerOpen(false)
      }
    }
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setTahunPickerOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [tahunPickerOpen])

  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [listPeriod, setListPeriod] = useState(() => readListFilter().period)
  const [customHijriDari, setCustomHijriDari] = useState(() => readListFilter().hijriDari)
  const [customHijriSampai, setCustomHijriSampai] = useState(() => readListFilter().hijriSampai)
  const [showRangePicker, setShowRangePicker] = useState(() => readListFilter().showRange)
  const [listRange, setListRange] = useState(() => {
    const f = readListFilter()
    return f.period === 'custom' ? null : rangeForPeriod(f.period === 'custom' ? 'hari' : f.period)
  })
  const [searchInput, setSearchInput] = useState('')
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [daerahFilter, setDaerahFilter] = useState('')
  const [kamarFilter, setKamarFilter] = useState('')
  const [diniyahFilter, setDiniyahFilter] = useState('')
  const [kelasDiniyahFilter, setKelasDiniyahFilter] = useState('')
  const [kelDiniyahFilter, setKelDiniyahFilter] = useState('')
  const [formalFilter, setFormalFilter] = useState('')
  const [kelasFormalFilter, setKelasFormalFilter] = useState('')
  const [kelFormalFilter, setKelFormalFilter] = useState('')
  const [alasanFilter, setAlasanFilter] = useState('')
  const [kembaliFilter, setKembaliFilter] = useState('') // '' | 'sudah' | 'belum'
  const [markingKembaliId, setMarkingKembaliId] = useState(null)

  const [selectedSantri, setSelectedSantri] = useState(null)
  const [selectedIjinId, setSelectedIjinId] = useState(null)
  const [editIjinSeed, setEditIjinSeed] = useState(null)
  const [panelLoading, setPanelLoading] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [scanError, setScanError] = useState(null)
  const [cameraMinimized, setCameraMinimized] = useState(() => readCameraMinimized())
  const [santriPickerOpen, setSantriPickerOpen] = useState(false)
  const [mobileFormOpen, setMobileFormOpen] = useState(false)
  const [mobileScanOpen, setMobileScanOpen] = useState(false)
  const [listPrintOpen, setListPrintOpen] = useState(false)
  const [listPrintSantriId, setListPrintSantriId] = useState(null)
  const [listPrintIjinId, setListPrintIjinId] = useState(null)

  const skipSearchBackCloseRef = useRef(false)
  const closeSantriPickerState = useCallback(() => setSantriPickerOpen(false), [])
  const closeSantriPicker = useOffcanvasBackClose(santriPickerOpen, closeSantriPickerState)
  const closeMobileForm = useOffcanvasBackClose(mobileFormOpen, () => {
    setMobileFormOpen(false)
    setSelectedSantri(null)
    setSelectedIjinId(null)
  })
  const closeMobileScan = useOffcanvasBackClose(mobileScanOpen, () => setMobileScanOpen(false))

  const handleSearchOffcanvasClose = useCallback(() => {
    if (skipSearchBackCloseRef.current) {
      closeSantriPickerState()
      return
    }
    closeSantriPicker()
  }, [closeSantriPicker, closeSantriPickerState])

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)')
    const update = () => setDesktopLayout(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    writeListFilter({
      period: listPeriod,
      hijriDari: customHijriDari,
      hijriSampai: customHijriSampai,
      showRange: showRangePicker,
    })
  }, [listPeriod, customHijriDari, customHijriSampai, showRangePicker])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (listPeriod !== 'custom') {
        const r = rangeForPeriod(listPeriod)
        if (!cancelled) setListRange(r)
        return
      }
      if (!customHijriDari || !customHijriSampai) {
        if (!cancelled) setListRange(null)
        return
      }
      const [mDari, mSampai] = await Promise.all([
        hijriToMasehiYmd(customHijriDari),
        hijriToMasehiYmd(customHijriSampai),
      ])
      if (cancelled) return
      if (!mDari || !mSampai) {
        setListRange(null)
        return
      }
      setListRange({
        tanggal_dari: mDari <= mSampai ? mDari : mSampai,
        tanggal_sampai: mDari <= mSampai ? mSampai : mDari,
      })
    })()
    return () => {
      cancelled = true
    }
  }, [listPeriod, customHijriDari, customHijriSampai])

  const loadList = useCallback(
    async ({ quiet = false } = {}) => {
      if (!listRange) {
        if (!quiet) {
          setList([])
          setLoading(false)
          setError(
            listPeriod === 'custom'
              ? 'Pilih tanggal Hijriyah dari dan sampai.'
              : null
          )
        }
        return
      }
      if (!quiet) {
        setLoading(true)
        setError(null)
      }
      try {
        const res = await ijinAPI.getByTanggal(listRange, tahunAjaran || null)
        if (res?.success) {
          setList(Array.isArray(res.data) ? res.data : [])
        } else if (!quiet) {
          setList([])
          setError(res?.message || 'Gagal memuat daftar ijin')
        }
      } catch (e) {
        if (!quiet) {
          setList([])
          setError(e?.response?.data?.message || 'Terjadi kesalahan saat memuat daftar ijin')
        }
      } finally {
        if (!quiet) setLoading(false)
      }
    },
    [listRange, listPeriod, tahunAjaran]
  )

  useEffect(() => {
    if (viewMode !== 'desk') return undefined
    loadList()
    return undefined
  }, [loadList, viewMode])

  const loadListRef = useRef(loadList)
  loadListRef.current = loadList
  const tahunAjaranRef = useRef(tahunAjaran)
  tahunAjaranRef.current = tahunAjaran

  useEffect(() => {
    const onHint = (e) => {
      const d = e?.detail || {}
      if (!ijinHintMatches(d, null, tahunAjaranRef.current)) return
      void loadListRef.current({ quiet: true })
    }
    window.addEventListener(EBEDDIEN_IJIN_HINT, onHint)
    return () => window.removeEventListener(EBEDDIEN_IJIN_HINT, onHint)
  }, [])

  const filterBaseForDaerah = useMemo(() => list, [list])

  const daerahOptions = useMemo(
    () => uniqueCounts(filterBaseForDaerah, (r) => r.daerah),
    [filterBaseForDaerah]
  )

  const kamarOptions = useMemo(() => {
    let rows = list
    if (daerahFilter) rows = rows.filter((r) => String(r.daerah || '') === daerahFilter)
    return uniqueCounts(rows, (r) => r.kamar)
  }, [list, daerahFilter])

  const diniyahOptions = useMemo(() => uniqueCounts(list, (r) => r.diniyah), [list])

  const kelasDiniyahOptions = useMemo(() => {
    let rows = list
    if (diniyahFilter) rows = rows.filter((r) => String(r.diniyah || '') === diniyahFilter)
    return uniqueCounts(rows, (r) => r.kelas_diniyah)
  }, [list, diniyahFilter])

  const kelDiniyahOptions = useMemo(() => {
    let rows = list
    if (diniyahFilter) rows = rows.filter((r) => String(r.diniyah || '') === diniyahFilter)
    if (kelasDiniyahFilter) rows = rows.filter((r) => String(r.kelas_diniyah || '') === kelasDiniyahFilter)
    return uniqueCounts(rows, (r) => r.kel_diniyah)
  }, [list, diniyahFilter, kelasDiniyahFilter])

  const formalOptions = useMemo(() => uniqueCounts(list, (r) => r.formal), [list])

  const kelasFormalOptions = useMemo(() => {
    let rows = list
    if (formalFilter) rows = rows.filter((r) => String(r.formal || '') === formalFilter)
    return uniqueCounts(rows, (r) => r.kelas_formal)
  }, [list, formalFilter])

  const kelFormalOptions = useMemo(() => {
    let rows = list
    if (formalFilter) rows = rows.filter((r) => String(r.formal || '') === formalFilter)
    if (kelasFormalFilter) rows = rows.filter((r) => String(r.kelas_formal || '') === kelasFormalFilter)
    return uniqueCounts(rows, (r) => r.kel_formal)
  }, [list, formalFilter, kelasFormalFilter])

  const alasanOptions = useMemo(() => {
    const fromData = uniqueCounts(list, (r) => r.alasan)
    const preset = IJIN_ALASAN_FILTER_OPTIONS.filter(
      (a) => !fromData.some((o) => o.value === a)
    ).map((value) => ({ value, count: 0 }))
    return [...fromData, ...preset].sort((a, b) => a.value.localeCompare(b.value, 'id'))
  }, [list])

  useEffect(() => {
    if (daerahFilter && !daerahOptions.some((o) => o.value === daerahFilter)) {
      setDaerahFilter('')
      setKamarFilter('')
    }
  }, [daerahFilter, daerahOptions])

  useEffect(() => {
    if (!daerahFilter) setKamarFilter('')
    else if (kamarFilter && !kamarOptions.some((o) => o.value === kamarFilter)) setKamarFilter('')
  }, [daerahFilter, kamarFilter, kamarOptions])

  useEffect(() => {
    if (!diniyahFilter) {
      setKelasDiniyahFilter('')
      setKelDiniyahFilter('')
    }
  }, [diniyahFilter])

  useEffect(() => {
    if (!kelasDiniyahFilter) setKelDiniyahFilter('')
  }, [kelasDiniyahFilter])

  useEffect(() => {
    if (!formalFilter) {
      setKelasFormalFilter('')
      setKelFormalFilter('')
    }
  }, [formalFilter])

  useEffect(() => {
    if (!kelasFormalFilter) setKelFormalFilter('')
  }, [kelasFormalFilter])

  const filteredList = useMemo(() => {
    const q = searchInput.trim().toLowerCase()
    return list.filter((row) => {
      if (daerahFilter && String(row.daerah || '') !== daerahFilter) return false
      if (kamarFilter && String(row.kamar || '') !== kamarFilter) return false
      if (diniyahFilter && String(row.diniyah || '') !== diniyahFilter) return false
      if (kelasDiniyahFilter && String(row.kelas_diniyah || '') !== kelasDiniyahFilter) return false
      if (kelDiniyahFilter && String(row.kel_diniyah || '') !== kelDiniyahFilter) return false
      if (formalFilter && String(row.formal || '') !== formalFilter) return false
      if (kelasFormalFilter && String(row.kelas_formal || '') !== kelasFormalFilter) return false
      if (kelFormalFilter && String(row.kel_formal || '') !== kelFormalFilter) return false
      if (alasanFilter && String(row.alasan || '').trim() !== alasanFilter) return false
      if (kembaliFilter === 'sudah' && !row.tanggal_kembali) return false
      if (kembaliFilter === 'belum' && row.tanggal_kembali) return false
      if (!q) return true
      const hay = [
        row.nama_santri,
        row.nis,
        row.alasan,
        row.daerah,
        row.kamar,
        row.diniyah,
        row.formal,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return hay.includes(q)
    })
  }, [
    list,
    searchInput,
    daerahFilter,
    kamarFilter,
    diniyahFilter,
    kelasDiniyahFilter,
    kelDiniyahFilter,
    formalFilter,
    kelasFormalFilter,
    kelFormalFilter,
    alasanFilter,
    kembaliFilter,
  ])

  const hasActiveFilters = Boolean(
    daerahFilter ||
      kamarFilter ||
      diniyahFilter ||
      kelasDiniyahFilter ||
      kelDiniyahFilter ||
      formalFilter ||
      kelasFormalFilter ||
      kelFormalFilter ||
      alasanFilter ||
      kembaliFilter
  )

  const clearFilters = () => {
    setDaerahFilter('')
    setKamarFilter('')
    setDiniyahFilter('')
    setKelasDiniyahFilter('')
    setKelDiniyahFilter('')
    setFormalFilter('')
    setKelasFormalFilter('')
    setKelFormalFilter('')
    setAlasanFilter('')
    setKembaliFilter('')
  }
  const emptyListMessage =
    hasActiveFilters || searchInput.trim()
      ? 'Tidak ada ijin yang sesuai filter / pencarian.'
      : listPeriod === 'custom'
        ? !customHijriDari || !customHijriSampai
          ? 'Pilih rentang tanggal Hijriyah.'
          : 'Belum ada ijin pada rentang tanggal ini.'
        : listPeriod === 'hari'
          ? 'Belum ada ijin dicatat hari ini.'
          : `Belum ada ijin dalam ${listPeriod} hari terakhir.`

  const setPresetPeriod = (id) => {
    setListPeriod(id)
    setShowRangePicker(false)
  }

  const toggleRangePicker = () => {
    setShowRangePicker((prev) => {
      const next = !prev
      if (!next && listPeriod === 'custom') {
        setListPeriod('hari')
      }
      return next
    })
  }

  const onCustomHijriDari = (ymd) => {
    const v = ymd != null ? ymd : ''
    setCustomHijriDari(v)
    setListPeriod('custom')
    setShowRangePicker(true)
  }

  const onCustomHijriSampai = (ymd) => {
    const v = ymd != null ? ymd : ''
    setCustomHijriSampai(v)
    setListPeriod('custom')
    setShowRangePicker(true)
  }
  const selectSantri = useCallback(
    async (santriLike, { openMobile = true } = {}) => {
      const sid = Number(santriLike?.id ?? santriLike?.id_santri)
      if (!sid) return
      setScanError(null)
      setPanelLoading(true)
      if (openMobile && !isDesktopIjinLayout()) {
        setMobileScanOpen(false)
        setMobileFormOpen(true)
      }
      try {
        const res = await santriAPI.getById(sid)
        const row = res?.data && typeof res.data === 'object' ? res.data : { ...santriLike, id: sid }
        setSelectedSantri(row)
      } catch {
        setSelectedSantri({ ...santriLike, id: sid })
      } finally {
        setPanelLoading(false)
      }
    },
    []
  )

  const handlePickSantri = useCallback(
    (santri) => {
      skipSearchBackCloseRef.current = true
      setSantriPickerOpen(false)
      setSelectedIjinId(null)
      setEditIjinSeed(null)
      setPanelLoading(true)
      void selectSantri(santri)
      window.setTimeout(() => {
        skipSearchBackCloseRef.current = false
      }, 120)
    },
    [selectSantri]
  )

  const handleScan = useCallback(
    async (token) => {
      setScanning(true)
      setScanError(null)
      setSelectedIjinId(null)
      setEditIjinSeed(null)
      try {
        const res = await ijinAPI.scanKartu(token)
        if (res?.success && res.data?.santri) {
          await selectSantri(res.data.santri)
          showNotification(
            res.data.card?.card_type === 'MAHROM'
              ? `Kartu mahrom: ${res.data.santri.nama}`
              : `Kartu santri: ${res.data.santri.nama}`,
            'success'
          )
        } else {
          const msg = res?.message || 'Gagal memindai kartu'
          setScanError({ code: res?.code, message: msg })
          showNotification(msg, 'error')
        }
      } catch (e) {
        const msg = e?.response?.data?.message || 'Gagal memindai kartu'
        setScanError({ code: e?.response?.data?.code, message: msg })
        showNotification(msg, 'error')
      } finally {
        setScanning(false)
      }
    },
    [selectSantri, showNotification]
  )

  const handleListRowClick = useCallback(
    (row) => {
      setSelectedIjinId(row.id)
      setEditIjinSeed(row)
      setPanelLoading(true)
      void selectSantri({
        id: row.id_santri,
        nama: row.nama_santri,
        nis: row.nis,
        gender: row.gender,
        status_santri: row.status_santri,
        daerah: row.daerah,
        kamar: row.kamar,
      })
    },
    [selectSantri]
  )

  const handleListPrint = useCallback(
    (row, e) => {
      e?.stopPropagation?.()
      // API ijin filter by id_santri (PK); NIS 7 digit juga sering = id
      const printId = String(row?.id_santri || row?.nis || '').trim()
      if (!printId) {
        showNotification('ID santri tidak ditemukan untuk print.', 'error')
        return
      }
      setListPrintSantriId(printId)
      setListPrintIjinId(row?.id ?? null)
      setListPrintOpen(true)
    },
    [showNotification]
  )

  const closeListPrint = useCallback(() => {
    setListPrintOpen(false)
    setListPrintSantriId(null)
    setListPrintIjinId(null)
  }, [])

  const handleListMarkKembali = useCallback(
    async (row, e) => {
      e?.stopPropagation?.()
      if (!row?.id || row.tanggal_kembali) return
      setMarkingKembaliId(row.id)
      try {
        const result = await tryIjinMarkKembali(
          row.id,
          true,
          row.id_santri,
          tahunAjaran || row.tahun_ajaran,
          row.nama_santri
        )
        if (result.success) {
          const tgl = result.tanggal_kembali || result.data?.tanggal_kembali || todayYmd()
          setList((prev) =>
            prev.map((r) =>
              Number(r.id) === Number(row.id)
                ? {
                    ...r,
                    tanggal_kembali: tgl,
                    admin_kembali: result.data?.admin_kembali ?? r.admin_kembali,
                    admin_kembali_nama: result.data?.admin_kembali_nama ?? r.admin_kembali_nama,
                  }
                : r
            )
          )
          if (editIjinSeed && Number(editIjinSeed.id) === Number(row.id)) {
            setEditIjinSeed((prev) => (prev ? { ...prev, tanggal_kembali: tgl } : prev))
          }
          showNotification(
            result.offline ? 'Kembali disimpan di antrean (offline)' : 'Kembali dicatat',
            result.offline ? 'info' : 'success'
          )
        } else {
          showNotification(result.message || 'Gagal mencatat kembali', 'error')
        }
      } catch (err) {
        showNotification(err?.message || 'Gagal mencatat kembali', 'error')
      } finally {
        setMarkingKembaliId(null)
      }
    },
    [tahunAjaran, editIjinSeed, showNotification]
  )

  const clearSelected = useCallback(() => {
    setSelectedSantri(null)
    setSelectedIjinId(null)
    setEditIjinSeed(null)
    setScanError(null)
    setPanelLoading(false)
  }, [])

  const openCariSantri = useCallback(() => setSantriPickerOpen(true), [])

  const toggleCamera = useCallback(() => {
    setCameraMinimized((prev) => {
      const next = !prev
      writeCameraMinimized(next)
      return next
    })
    setScanError(null)
  }, [])

  const handleCameraClick = useCallback(() => {
    if (isDesktopIjinLayout()) {
      toggleCamera()
    } else {
      setScanError(null)
      setMobileScanOpen(true)
    }
  }, [toggleCamera])

  if (viewMode === 'kelola') {
    return (
      <div className="h-full flex flex-col min-h-0">
        <div className="flex-shrink-0 px-4 sm:px-6 lg:px-8 pt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setViewMode('desk')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-teal-300 dark:border-teal-700 text-teal-800 dark:text-teal-200 bg-teal-50 dark:bg-teal-900/30 hover:bg-teal-100 dark:hover:bg-teal-900/50"
          >
            ← Meja input ijin
          </button>
        </div>
        <div className="flex-1 min-h-0">
          <DataIjinKelola />
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-hidden flex flex-col">
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden px-4 sm:px-6 lg:px-8 pt-2 pb-4 gap-3">
        {/* Kiri: daftar ijin per periode */}
        <div className="flex-1 min-w-0 flex flex-col min-h-0 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
          <div className="flex-shrink-0 p-3 border-b border-gray-200 dark:border-gray-700 space-y-2">
            <div className="flex flex-wrap items-center gap-1.5">
              {LIST_PERIODS.map((p) => {
                const active = listPeriod === p.id
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPresetPeriod(p.id)}
                    className={`px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                      active
                        ? 'bg-teal-600 border-teal-600 text-white'
                        : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:border-teal-400 dark:hover:border-teal-600'
                    }`}
                  >
                    {p.label}
                  </button>
                )
              })}
              <button
                type="button"
                onClick={toggleRangePicker}
                className={`px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                  showRangePicker || listPeriod === 'custom'
                    ? 'bg-teal-600 border-teal-600 text-white'
                    : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:border-teal-400 dark:hover:border-teal-600'
                }`}
                aria-pressed={showRangePicker}
                title="Pilih rentang tanggal Hijriyah"
              >
                Pilih rentang
              </button>
              <button
                type="button"
                onClick={() => loadList()}
                className="px-2 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300"
                title="Refresh"
              >
                Refresh
              </button>
              <div className="flex flex-wrap items-center justify-end gap-1.5 ml-auto">
                <span className="text-xs text-gray-500 dark:text-gray-400 tabular-nums">
                  {filteredList.length} ijin
                  {(searchInput.trim() || hasActiveFilters) && filteredList.length !== list.length
                    ? ` / ${list.length}`
                    : ''}
                </span>
                <button
                  type="button"
                  onClick={() => setViewMode('kelola')}
                  className="inline-flex items-center gap-1 h-7 px-2 text-xs font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  Kelola data
                </button>
                {tahunAjaran ? (
                  <div ref={tahunPickerRef} className="relative shrink-0">
                    <button
                      type="button"
                      onClick={() => setTahunPickerOpen((open) => !open)}
                      className="inline-flex items-center gap-1 h-7 px-2 text-xs font-medium text-teal-700 dark:text-teal-300 rounded-lg border border-teal-300 dark:border-teal-700 bg-teal-50/80 dark:bg-teal-900/30 hover:bg-teal-100 dark:hover:bg-teal-900/50 transition-colors"
                      aria-expanded={tahunPickerOpen}
                      aria-haspopup="listbox"
                      aria-label="Pilih tahun ajaran hijriyah"
                    >
                      <span>
                        TA <span className="font-semibold">{tahunAjaran}</span>
                      </span>
                      <svg
                        className={`w-3.5 h-3.5 transition-transform ${tahunPickerOpen ? 'rotate-180' : ''}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        aria-hidden
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    {tahunPickerOpen && (
                      <div
                        role="listbox"
                        aria-label="Daftar tahun ajaran hijriyah"
                        className="absolute right-0 top-full z-40 mt-1 min-w-[10rem] max-h-56 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 shadow-lg py-1"
                      >
                        {tahunAjaranOptions.length === 0 ? (
                          <p className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400">Memuat opsi...</p>
                        ) : (
                          tahunAjaranOptions.map((ta) => {
                            const isActive = ta === tahunAjaran
                            const isCurrent = ta === activeTahunAjaran
                            return (
                              <button
                                key={ta}
                                type="button"
                                role="option"
                                aria-selected={isActive}
                                onClick={() => {
                                  setSelectedTahunAjaran(ta)
                                  tahunInitializedRef.current = true
                                  setTahunPickerOpen(false)
                                }}
                                className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${
                                  isActive
                                    ? 'bg-teal-50 dark:bg-teal-900/40 text-teal-800 dark:text-teal-200 font-semibold'
                                    : 'text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/60'
                                }`}
                              >
                                <span>{ta}</span>
                                {isCurrent ? (
                                  <span className="ml-1.5 text-[10px] font-normal text-teal-600 dark:text-teal-400">
                                    (aktif)
                                  </span>
                                ) : null}
                              </button>
                            )
                          })
                        )}
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            </div>
            {showRangePicker && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 rounded-lg p-2 border border-teal-400 dark:border-teal-600 bg-teal-50/50 dark:bg-teal-900/20">
                <div>
                  <label className="block text-[10px] font-medium text-gray-500 dark:text-gray-400 mb-1">
                    Dari (Hijriyah)
                  </label>
                  <PickDateHijri
                    id="ijin-list-hijri-dari"
                    name="list_hijri_dari"
                    value={customHijriDari || null}
                    onChange={onCustomHijriDari}
                    max={customHijriSampai || undefined}
                    placeholder="Pilih tanggal"
                    className="w-full"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-medium text-gray-500 dark:text-gray-400 mb-1">
                    Sampai (Hijriyah)
                  </label>
                  <PickDateHijri
                    id="ijin-list-hijri-sampai"
                    name="list_hijri_sampai"
                    value={customHijriSampai || null}
                    onChange={onCustomHijriSampai}
                    min={customHijriDari || undefined}
                    placeholder="Pilih tanggal"
                    className="w-full"
                  />
                </div>
              </div>
            )}
            <p className="text-[10px] text-gray-400 dark:text-gray-500">
              {listPeriod === 'custom' && customHijriDari && customHijriSampai
                ? `${formatHijriDateDisplay(customHijriDari)} → ${formatHijriDateDisplay(customHijriSampai)}`
                : listRange
                  ? listRange.tanggal_dari === listRange.tanggal_sampai
                    ? listRange.tanggal_dari
                    : `${listRange.tanggal_dari} → ${listRange.tanggal_sampai}`
                  : '—'}
            </p>
            <div className="rounded-lg border border-gray-200 dark:border-gray-600 overflow-hidden bg-gray-50 dark:bg-gray-900/40">
              <div className="relative">
                <input
                  type="text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Cari nama, NIS, alasan…"
                  className="w-full px-3 py-2 pr-11 text-sm bg-transparent dark:text-gray-100 outline-none focus:ring-0"
                />
                <button
                  type="button"
                  onClick={() => setIsFilterOpen((o) => !o)}
                  className={`absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 rounded text-xs flex items-center gap-0.5 transition-colors ${
                    isFilterOpen || hasActiveFilters
                      ? 'bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300'
                      : 'bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300'
                  }`}
                  title={isFilterOpen ? 'Sembunyikan filter' : 'Tampilkan filter'}
                  aria-expanded={isFilterOpen}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                  </svg>
                  <svg
                    className={`w-3 h-3 transition-transform ${isFilterOpen ? 'rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              </div>
              <AnimatePresence>
                {isFilterOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden border-t border-gray-200 dark:border-gray-600"
                  >
                    <div className="px-2.5 py-2 flex flex-wrap gap-1.5">
                      <select
                        value={daerahFilter}
                        onChange={(e) => {
                          setDaerahFilter(e.target.value)
                          setKamarFilter('')
                        }}
                        className={selectFilterClass}
                      >
                        <option value="">Daerah</option>
                        {daerahOptions.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.value} ({o.count})
                          </option>
                        ))}
                      </select>
                      <AnimatePresence mode="wait">
                        {daerahFilter ? (
                          <motion.div
                            key="kamar-filter"
                            initial={{ opacity: 0, x: -8 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -8 }}
                            transition={{ duration: 0.2 }}
                          >
                            <select
                              value={kamarFilter}
                              onChange={(e) => setKamarFilter(e.target.value)}
                              className={selectFilterClass}
                            >
                              <option value="">Kamar</option>
                              {kamarOptions.map((o) => (
                                <option key={o.value} value={o.value}>
                                  {o.value} ({o.count})
                                </option>
                              ))}
                            </select>
                          </motion.div>
                        ) : null}
                      </AnimatePresence>

                      <select
                        value={diniyahFilter}
                        onChange={(e) => {
                          setDiniyahFilter(e.target.value)
                          setKelasDiniyahFilter('')
                          setKelDiniyahFilter('')
                        }}
                        className={selectFilterClass}
                      >
                        <option value="">Diniyah</option>
                        {diniyahOptions.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.value} ({o.count})
                          </option>
                        ))}
                      </select>
                      <AnimatePresence mode="wait">
                        {diniyahFilter ? (
                          <motion.div
                            key="diniyah-kelas-kel"
                            initial={{ opacity: 0, x: -8 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -8 }}
                            transition={{ duration: 0.2 }}
                            className="inline-flex items-center gap-1.5"
                          >
                            <select
                              value={kelasDiniyahFilter}
                              onChange={(e) => {
                                setKelasDiniyahFilter(e.target.value)
                                setKelDiniyahFilter('')
                              }}
                              className={selectFilterClass}
                            >
                              <option value="">Kelas</option>
                              {kelasDiniyahOptions.map((o) => (
                                <option key={o.value} value={o.value}>
                                  {o.value} ({o.count})
                                </option>
                              ))}
                            </select>
                            <select
                              value={kelDiniyahFilter}
                              onChange={(e) => setKelDiniyahFilter(e.target.value)}
                              className={selectFilterClass}
                            >
                              <option value="">Kel</option>
                              {kelDiniyahOptions.map((o) => (
                                <option key={o.value} value={o.value}>
                                  {o.value} ({o.count})
                                </option>
                              ))}
                            </select>
                          </motion.div>
                        ) : null}
                      </AnimatePresence>

                      <select
                        value={formalFilter}
                        onChange={(e) => {
                          setFormalFilter(e.target.value)
                          setKelasFormalFilter('')
                          setKelFormalFilter('')
                        }}
                        className={selectFilterClass}
                      >
                        <option value="">Formal</option>
                        {formalOptions.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.value} ({o.count})
                          </option>
                        ))}
                      </select>
                      <AnimatePresence mode="wait">
                        {formalFilter ? (
                          <motion.div
                            key="formal-kelas-kel"
                            initial={{ opacity: 0, x: -8 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -8 }}
                            transition={{ duration: 0.2 }}
                            className="inline-flex items-center gap-1.5"
                          >
                            <select
                              value={kelasFormalFilter}
                              onChange={(e) => {
                                setKelasFormalFilter(e.target.value)
                                setKelFormalFilter('')
                              }}
                              className={selectFilterClass}
                            >
                              <option value="">Kelas</option>
                              {kelasFormalOptions.map((o) => (
                                <option key={o.value} value={o.value}>
                                  {o.value} ({o.count})
                                </option>
                              ))}
                            </select>
                            <select
                              value={kelFormalFilter}
                              onChange={(e) => setKelFormalFilter(e.target.value)}
                              className={selectFilterClass}
                            >
                              <option value="">Kel</option>
                              {kelFormalOptions.map((o) => (
                                <option key={o.value} value={o.value}>
                                  {o.value} ({o.count})
                                </option>
                              ))}
                            </select>
                          </motion.div>
                        ) : null}
                      </AnimatePresence>

                      <select
                        value={alasanFilter}
                        onChange={(e) => setAlasanFilter(e.target.value)}
                        className={selectFilterClass}
                      >
                        <option value="">Alasan</option>
                        {alasanOptions.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.value}
                            {o.count ? ` (${o.count})` : ''}
                          </option>
                        ))}
                      </select>

                      <select
                        value={kembaliFilter}
                        onChange={(e) => setKembaliFilter(e.target.value)}
                        className={selectFilterClass}
                      >
                        <option value="">Kembali</option>
                        <option value="belum">Belum kembali</option>
                        <option value="sudah">Sudah kembali</option>
                      </select>

                      {hasActiveFilters && (
                        <button
                          type="button"
                          onClick={clearFilters}
                          className="h-7 px-2 text-[11px] font-medium rounded border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                        >
                          Reset
                        </button>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {error && (
            <div className="mx-3 mt-3 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-sm">
              {error}
            </div>
          )}

          <div className="flex-1 min-h-0 overflow-y-auto">
            {loading ? (
              <p className="p-4 text-sm text-gray-500">Memuat…</p>
            ) : filteredList.length === 0 ? (
              <p className="p-4 text-sm text-gray-500 dark:text-gray-400">
                {emptyListMessage}
              </p>
            ) : (
              <ul className="divide-y divide-gray-100 dark:divide-gray-700">
                {filteredList.map((row) => (
                  <li
                    key={row.id}
                    className={`px-3 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/40 cursor-pointer ${
                      selectedIjinId === row.id || Number(selectedSantri?.id) === Number(row.id_santri)
                        ? 'bg-teal-50/80 dark:bg-teal-900/20'
                        : ''
                    }`}
                    onClick={() => handleListRowClick(row)}
                  >
                    <div className="flex justify-between gap-2 items-start">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-sm text-gray-900 dark:text-gray-100 truncate">
                          {row.nama_santri || '—'}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          NIS {row.nis || '—'}
                          {row.alasan ? ` · ${row.alasan}` : ''}
                        </p>
                        <p className="text-xs text-teal-700 dark:text-teal-400 mt-1">
                          {(Number(row.ijin_sehari) === 1 || row.ijin_sehari === true) ? (
                            <>
                              Ijin sehari · {jamShort(row.jam_dari) || '—'}–{jamShort(row.jam_sampai) || '—'}
                              {row.dari ? ` · ${labelTanggalIjin(row.dari)}` : ''}
                            </>
                          ) : (
                            <>
                              {labelTanggalIjin(row.dari)}
                              {row.sampai ? ` → ${labelTanggalIjin(row.sampai)}` : ''}
                              {row.lama ? ` · ${row.lama}` : ''}
                            </>
                          )}
                        </p>
                      </div>
                      <div className="text-right shrink-0 flex flex-col items-end gap-1">
                        <p className="text-[10px] text-gray-500 dark:text-gray-400 leading-snug">
                          {formatWaktuMasehi(row.tanggal_dibuat)}
                        </p>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={(e) => handleListPrint(row, e)}
                            className="inline-flex items-center justify-center w-7 h-7 rounded-md border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-teal-700 dark:text-teal-300 hover:bg-teal-50 dark:hover:bg-teal-900/30"
                            title="Print surat ijin"
                            aria-label="Print surat ijin"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth="2"
                                d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"
                              />
                            </svg>
                          </button>
                          {row.tanggal_kembali ? (
                            <p className="text-[10px] text-emerald-600 dark:text-emerald-400 px-1">Sudah Kembali</p>
                          ) : (
                            <button
                              type="button"
                              disabled={markingKembaliId === row.id}
                              onClick={(e) => void handleListMarkKembali(row, e)}
                              className="px-2 py-0.5 text-[10px] font-medium rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
                              title="Catat sudah kembali"
                            >
                              {markingKembaliId === row.id ? '…' : 'Kembali'}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Kanan: scan + form (desktop) */}
        <div className="hidden lg:flex w-full lg:w-[24rem] xl:w-[26rem] lg:shrink-0 flex-col min-h-0 gap-3">
          {desktopLayout ? (
            <div className="flex-shrink-0 space-y-2">
              <motion.div
                initial={false}
                animate={cameraMinimized ? { height: 0, opacity: 0 } : { height: 'auto', opacity: 1 }}
                transition={{ duration: 0.28, ease: [0.25, 0.1, 0.25, 1] }}
                className="overflow-hidden"
                aria-hidden={cameraMinimized}
              >
                <BukuTamuQrInlineScanner
                  onScan={handleScan}
                  disabled={scanning}
                  active={!cameraMinimized && desktopLayout}
                  acceptPrefixes={IJIN_QR_PREFIXES}
                  hintText={IJIN_QR_HINT}
                />
              </motion.div>

              {scanError?.message && (
                <div className="px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-xs">
                  {scanError.message}
                </div>
              )}
            </div>
          ) : null}

          <div className="flex-1 min-h-0">
            <DetailSantriOffcanvas
              variant="panel"
              isOpen
              santri={selectedSantri}
              onClose={clearSelected}
              hideCloseButton={!selectedSantri && !panelLoading}
              tahunAjaran={tahunAjaran}
              contentLoading={panelLoading}
              editIjinId={selectedIjinId}
              editIjinSeed={editIjinSeed}
              onCariSantri={openCariSantri}
              onToggleCamera={handleCameraClick}
              cameraActive={!cameraMinimized && desktopLayout}
              onSuccess={() => loadList({ quiet: true })}
            />
          </div>
        </div>
      </div>

      {/* FAB kamera + cari (tablet / HP) */}
      {!desktopLayout && !mobileFormOpen && !mobileScanOpen && viewMode === 'desk' && (
        <div className="lg:hidden fixed bottom-[calc(5rem+env(safe-area-inset-bottom,0px))] right-4 z-50 flex flex-col items-end gap-3 pointer-events-none">
          <button
            type="button"
            onClick={handleCameraClick}
            className="pointer-events-auto w-14 h-14 rounded-full shadow-lg border border-teal-500/30 bg-teal-600 hover:bg-teal-700 text-white flex items-center justify-center transition-colors"
            title="Scan kamera"
            aria-label="Scan kamera"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
              />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
          <button
            type="button"
            onClick={openCariSantri}
            className="pointer-events-auto w-14 h-14 rounded-full shadow-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-teal-700 dark:text-teal-300 hover:bg-teal-50 dark:hover:bg-teal-900/40 flex items-center justify-center transition-colors"
            title="Cari santri"
            aria-label="Cari santri"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </button>
        </div>
      )}

      {/* Mobile scan offcanvas — portal ke body agar di atas nav bawah (z-100) */}
      {mobileScanOpen &&
        createPortal(
          <div
            className="lg:hidden fixed inset-0 flex flex-col bg-black/50"
            style={{ zIndex: 99998 }}
            onClick={closeMobileScan}
          >
            <div
              className="mt-auto bg-white dark:bg-gray-800 rounded-t-2xl p-4 space-y-3 max-h-[85vh] overflow-y-auto pb-[max(1rem,env(safe-area-inset-bottom,0px))]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-gray-900 dark:text-gray-100">Scan kartu CS / CM</h3>
                <button type="button" onClick={closeMobileScan} className="text-gray-400 p-1">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <BukuTamuQrInlineScanner
                onScan={handleScan}
                disabled={scanning}
                active={mobileScanOpen}
                acceptPrefixes={IJIN_QR_PREFIXES}
                hintText={IJIN_QR_HINT}
              />
              {scanError?.message && (
                <p className="text-xs text-red-600 dark:text-red-400">{scanError.message}</p>
              )}
            </div>
          </div>,
          document.body
        )}

      <DetailSantriOffcanvas
        isOpen={(mobileFormOpen && !desktopLayout) || (panelLoading && !desktopLayout)}
        onClose={closeMobileForm}
        santri={selectedSantri}
        onCariSantri={openCariSantri}
        onToggleCamera={handleCameraClick}
        cameraActive={false}
        tahunAjaran={tahunAjaran}
        contentLoading={panelLoading}
        editIjinId={selectedIjinId}
        editIjinSeed={editIjinSeed}
        onSuccess={() => loadList({ quiet: true })}
      />

      <PrintIjinOffcanvas
        isOpen={listPrintOpen}
        onClose={closeListPrint}
        santriId={listPrintSantriId}
        ijinId={listPrintIjinId}
      />

      <SearchOffcanvas
        isOpen={santriPickerOpen}
        onClose={handleSearchOffcanvasClose}
        onSelectSantriRecord={handlePickSantri}
      />
    </div>
  )
}

export default DataIjin
