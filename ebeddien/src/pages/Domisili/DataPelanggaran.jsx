import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { kalenderAPI, santriAPI, tarbiyahDomisiliSantriAPI } from '../../services/api'
import { useNotification } from '../../contexts/NotificationContext'
import { useOffcanvasBackClose } from '../../hooks/useOffcanvasBackClose'
import { PickDateHijri, formatHijriDateDisplay } from '../../components/PickDateHijri'
import SearchOffcanvas from '../../components/Biodata/SearchOffcanvas'
import { useDomisiliPelanggaranFiturAccess } from '../../hooks/useDomisiliPelanggaranFiturAccess'
import DetailPelanggaranOffcanvas from './components/DetailPelanggaranOffcanvas'
import { labelKategoriPelanggaran } from './components/PelanggaranMasterFormOffcanvas'

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

function todayYmdFromDate(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function todayYmd() {
  return todayYmdFromDate(new Date())
}

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

const LIST_FILTER_STORAGE_KEY = 'ebeddien.pelanggaran.listFilter'

function readListFilter() {
  if (typeof window === 'undefined') {
    return { period: 'hari', hijriDari: '', hijriSampai: '', showRange: false }
  }
  try {
    const raw = window.localStorage.getItem(LIST_FILTER_STORAGE_KEY)
    if (!raw) return { period: 'hari', hijriDari: '', hijriSampai: '', showRange: false }
    const parsed = JSON.parse(raw)
    const period = ['hari', '3', '7', '30', 'custom'].includes(parsed?.period) ? parsed.period : 'hari'
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
    window.localStorage.setItem(LIST_FILTER_STORAGE_KEY, JSON.stringify(filter))
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

function isDesktopLayout() {
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

export default function DataPelanggaran() {
  const { showNotification } = useNotification()
  const { canLoadMasterList } = useDomisiliPelanggaranFiturAccess()
  const [desktopLayout, setDesktopLayout] = useState(() => isDesktopLayout())

  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [listPeriod, setListPeriod] = useState(() => readListFilter().period)
  const [customHijriDari, setCustomHijriDari] = useState(() => readListFilter().hijriDari)
  const [customHijriSampai, setCustomHijriSampai] = useState(() => readListFilter().hijriSampai)
  const [showRangePicker, setShowRangePicker] = useState(() => readListFilter().showRange)
  const [listRange, setListRange] = useState(() => {
    const f = readListFilter()
    return f.period === 'custom' ? null : rangeForPeriod(f.period)
  })
  const [searchInput, setSearchInput] = useState('')
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [daerahFilter, setDaerahFilter] = useState('')
  const [kamarFilter, setKamarFilter] = useState('')
  const [kategoriFilter, setKategoriFilter] = useState('')
  const [diniyahFilter, setDiniyahFilter] = useState('')
  const [kelasDiniyahFilter, setKelasDiniyahFilter] = useState('')
  const [kelDiniyahFilter, setKelDiniyahFilter] = useState('')
  const [formalFilter, setFormalFilter] = useState('')
  const [kelasFormalFilter, setKelasFormalFilter] = useState('')
  const [kelFormalFilter, setKelFormalFilter] = useState('')

  const [selectedSantri, setSelectedSantri] = useState(null)
  const [panelLoading, setPanelLoading] = useState(false)
  const [santriPickerOpen, setSantriPickerOpen] = useState(false)
  const [mobileFormOpen, setMobileFormOpen] = useState(false)

  const skipSearchBackCloseRef = useRef(false)

  const closeSantriPickerState = useCallback(() => setSantriPickerOpen(false), [])
  const closeSantriPicker = useOffcanvasBackClose(santriPickerOpen, closeSantriPickerState)
  const closeMobileForm = useOffcanvasBackClose(mobileFormOpen, () => {
    setMobileFormOpen(false)
    setSelectedSantri(null)
  })

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
          setError(listPeriod === 'custom' ? 'Pilih tanggal Hijriyah dari dan sampai.' : null)
        }
        return
      }
      if (!quiet) {
        setLoading(true)
        setError(null)
      }
      try {
        const res = await tarbiyahDomisiliSantriAPI.getPelanggaranByTanggal(listRange)
        if (res?.success) {
          setList(Array.isArray(res.data) ? res.data : [])
        } else if (!quiet) {
          setList([])
          setError(res?.message || 'Gagal memuat daftar pelanggaran')
        }
      } catch (e) {
        if (!quiet) {
          setList([])
          setError(e?.response?.data?.message || 'Terjadi kesalahan saat memuat daftar')
        }
      } finally {
        if (!quiet) setLoading(false)
      }
    },
    [listRange, listPeriod]
  )

  useEffect(() => {
    loadList()
  }, [loadList])

  const daerahOptions = useMemo(() => uniqueCounts(list, (r) => r.daerah), [list])
  const kamarOptions = useMemo(() => {
    let rows = list
    if (daerahFilter) rows = rows.filter((r) => String(r.daerah || '') === daerahFilter)
    return uniqueCounts(rows, (r) => r.kamar)
  }, [list, daerahFilter])
  const kategoriOptions = useMemo(
    () => uniqueCounts(list, (r) => r.pelanggaran_kategori),
    [list]
  )
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

  const hasActiveFilters = Boolean(
    daerahFilter ||
      kamarFilter ||
      kategoriFilter ||
      diniyahFilter ||
      kelasDiniyahFilter ||
      kelDiniyahFilter ||
      formalFilter ||
      kelasFormalFilter ||
      kelFormalFilter
  )

  const filteredList = useMemo(() => {
    const q = searchInput.trim().toLowerCase()
    return list.filter((r) => {
      if (daerahFilter && String(r.daerah || '') !== daerahFilter) return false
      if (kamarFilter && String(r.kamar || '') !== kamarFilter) return false
      if (kategoriFilter && String(r.pelanggaran_kategori || '') !== kategoriFilter) return false
      if (diniyahFilter && String(r.diniyah || '') !== diniyahFilter) return false
      if (kelasDiniyahFilter && String(r.kelas_diniyah || '') !== kelasDiniyahFilter) return false
      if (kelDiniyahFilter && String(r.kel_diniyah || '') !== kelDiniyahFilter) return false
      if (formalFilter && String(r.formal || '') !== formalFilter) return false
      if (kelasFormalFilter && String(r.kelas_formal || '') !== kelasFormalFilter) return false
      if (kelFormalFilter && String(r.kel_formal || '') !== kelFormalFilter) return false
      if (!q) return true
      const hay = [
        r.nama_santri,
        r.nis,
        r.pelanggaran_nama,
        r.pelanggaran_kategori,
        r.catatan,
        r.daerah,
        r.kamar,
        r.diniyah,
        r.kelas_diniyah,
        r.kel_diniyah,
        r.formal,
        r.kelas_formal,
        r.kel_formal,
      ]
        .map((x) => String(x || '').toLowerCase())
        .join(' ')
      return hay.includes(q)
    })
  }, [
    list,
    searchInput,
    daerahFilter,
    kamarFilter,
    kategoriFilter,
    diniyahFilter,
    kelasDiniyahFilter,
    kelDiniyahFilter,
    formalFilter,
    kelasFormalFilter,
    kelFormalFilter,
  ])

  const setPresetPeriod = (id) => {
    setListPeriod(id)
    setShowRangePicker(false)
  }

  const toggleRangePicker = () => {
    setShowRangePicker((v) => {
      const next = !v
      if (next) setListPeriod('custom')
      else if (listPeriod === 'custom') setListPeriod('hari')
      return next
    })
  }

  const selectSantri = useCallback(
    async (santriLike, { openMobile = false } = {}) => {
      const id = santriLike?.id || santriLike?.id_santri
      if (!id) {
        showNotification('Santri tidak valid', 'error')
        return
      }
      setPanelLoading(true)
      try {
        let s = santriLike
        if (!santriLike.nama || !santriLike.nis) {
          const res = await santriAPI.getById(id)
          if (res?.success && res.data) s = { ...santriLike, ...res.data }
        }
        setSelectedSantri({
          id: Number(s.id || id),
          nama: s.nama || s.nama_santri || '',
          nis: s.nis || '',
          daerah: s.daerah || '',
          kamar: s.kamar || '',
          diniyah: s.diniyah || '',
          formal: s.formal || '',
          status_santri: s.status_santri || '',
        })
        if (openMobile || !isDesktopLayout()) {
          setMobileFormOpen(true)
        }
      } finally {
        setPanelLoading(false)
      }
    },
    [showNotification]
  )

  const handlePickSantri = useCallback(
    (record) => {
      skipSearchBackCloseRef.current = true
      closeSantriPickerState()
      void selectSantri(record, { openMobile: !isDesktopLayout() })
      setTimeout(() => {
        skipSearchBackCloseRef.current = false
      }, 0)
    },
    [closeSantriPickerState, selectSantri]
  )

  const handleRowClick = (row) => {
    void selectSantri(
      {
        id: row.id_santri,
        nama: row.nama_santri,
        nis: row.nis,
        daerah: row.daerah,
        kamar: row.kamar,
        diniyah: row.diniyah,
        formal: row.formal,
        status_santri: row.status_santri,
      },
      { openMobile: !desktopLayout }
    )
  }

  const openCariSantri = () => setSantriPickerOpen(true)

  return (
    <div className="h-full overflow-hidden flex flex-col">
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden px-4 sm:px-6 lg:px-8 pt-2 pb-4 gap-3">
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
                        : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:border-teal-400'
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
                    : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200'
                }`}
              >
                Pilih rentang
              </button>
              <button
                type="button"
                onClick={() => loadList()}
                className="px-2 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300"
              >
                Refresh
              </button>
              <div className="flex flex-wrap items-center justify-end gap-1.5 ml-auto">
                <span className="text-xs text-gray-500 dark:text-gray-400 tabular-nums">
                  {filteredList.length} catatan
                  {(searchInput.trim() || hasActiveFilters) && filteredList.length !== list.length
                    ? ` / ${list.length}`
                    : ''}
                </span>
                {canLoadMasterList ? (
                  <Link
                    to="/domisili/pelanggaran/master"
                    className="inline-flex items-center gap-1 h-7 px-2 text-xs font-medium rounded-lg border border-teal-300 dark:border-teal-700 text-teal-800 dark:text-teal-200 bg-teal-50 dark:bg-teal-900/30 hover:bg-teal-100 dark:hover:bg-teal-900/50"
                  >
                    Master pelanggaran
                  </Link>
                ) : null}
              </div>
            </div>

            <AnimatePresence>
              {(showRangePicker || listPeriod === 'custom') && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="flex flex-wrap items-end gap-2 pt-1">
                    <div>
                      <label className="block text-[10px] text-gray-500 mb-0.5">Dari (Hijriyah)</label>
                      <PickDateHijri
                        id="pelanggaran-list-hijri-dari"
                        name="list_hijri_dari"
                        value={customHijriDari || null}
                        onChange={(v) => {
                          setCustomHijriDari(v || '')
                          setListPeriod('custom')
                        }}
                        max={customHijriSampai || undefined}
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-gray-500 mb-0.5">Sampai (Hijriyah)</label>
                      <PickDateHijri
                        id="pelanggaran-list-hijri-sampai"
                        name="list_hijri_sampai"
                        value={customHijriSampai || null}
                        onChange={(v) => {
                          setCustomHijriSampai(v || '')
                          setListPeriod('custom')
                        }}
                        min={customHijriDari || undefined}
                      />
                    </div>
                    {customHijriDari && customHijriSampai ? (
                      <p className="text-[10px] text-gray-500 dark:text-gray-400 pb-1">
                        {formatHijriDateDisplay(customHijriDari)} – {formatHijriDateDisplay(customHijriSampai)}
                      </p>
                    ) : null}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="relative">
              <input
                type="search"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Cari nama, NIS, jenis…"
                className="w-full p-2 pr-10 text-sm rounded-lg border border-gray-200 dark:border-gray-600 bg-transparent dark:text-gray-100"
              />
              <button
                type="button"
                onClick={() => setIsFilterOpen((v) => !v)}
                className="absolute right-1 top-1 bottom-1 px-2 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300"
                title="Filter"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
                  />
                </svg>
              </button>
            </div>

            <AnimatePresence>
              {isFilterOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="flex flex-wrap gap-1.5 pt-1">
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
                    {daerahFilter ? (
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
                    ) : null}
                    <select
                      value={kategoriFilter}
                      onChange={(e) => setKategoriFilter(e.target.value)}
                      className={selectFilterClass}
                    >
                      <option value="">Kategori</option>
                      {kategoriOptions.map((o) => (
                        <option key={o.value} value={o.value}>
                          {labelKategoriPelanggaran(o.value)} ({o.count})
                        </option>
                      ))}
                    </select>
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
                          key="diniyah-kelas"
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
                          {kelasDiniyahFilter ? (
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
                          ) : null}
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
                          key="formal-kelas"
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
                          {kelasFormalFilter ? (
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
                          ) : null}
                        </motion.div>
                      ) : null}
                    </AnimatePresence>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex justify-center py-16">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-teal-600" />
              </div>
            ) : error ? (
              <p className="p-4 text-sm text-red-600 dark:text-red-400">{error}</p>
            ) : filteredList.length === 0 ? (
              <p className="p-8 text-center text-sm text-gray-500 dark:text-gray-400">
                Tidak ada catatan di periode ini.
              </p>
            ) : (
              <ul className="divide-y divide-gray-100 dark:divide-gray-700/80">
                {filteredList.map((row) => (
                  <li key={row.id}>
                    <button
                      type="button"
                      onClick={() => handleRowClick(row)}
                      className="w-full text-left px-3 py-2.5 hover:bg-teal-50/80 dark:hover:bg-teal-900/20 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                            {row.nama_santri || '—'}
                            {row.nis ? (
                              <span className="font-normal text-gray-500 dark:text-gray-400"> · {row.nis}</span>
                            ) : null}
                          </p>
                          <p className="text-xs text-gray-700 dark:text-gray-300 mt-0.5">
                            {row.pelanggaran_nama || '—'}
                            <span className="text-gray-500 dark:text-gray-400">
                              {' '}
                              · {labelKategoriPelanggaran(row.pelanggaran_kategori)}
                            </span>
                          </p>
                          {(row.daerah || row.kamar) && (
                            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                              {[row.daerah, row.kamar].filter(Boolean).join(' · ')}
                            </p>
                          )}
                        </div>
                        <span className="text-[10px] text-gray-500 dark:text-gray-400 shrink-0 tabular-nums">
                          {formatWaktuMasehi(row.tanggal_dibuat)}
                        </span>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="hidden lg:flex w-[24rem] xl:w-[26rem] shrink-0 flex-col min-h-0">
          <DetailPelanggaranOffcanvas
            variant="panel"
            isOpen
            santri={selectedSantri}
            loading={panelLoading}
            onCariSantri={openCariSantri}
            onRecorded={() => loadList({ quiet: true })}
          />
        </div>
      </div>

      <div className="lg:hidden fixed bottom-20 right-4 z-40 flex flex-col gap-2">
        {!mobileFormOpen ? (
          <button
            type="button"
            onClick={openCariSantri}
            className="w-12 h-12 rounded-full bg-teal-600 text-white shadow-lg flex items-center justify-center"
            title="Cari santri"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </button>
        ) : null}
      </div>

      <DetailPelanggaranOffcanvas
        variant="offcanvas"
        isOpen={(mobileFormOpen && !desktopLayout) || (panelLoading && !desktopLayout)}
        onClose={closeMobileForm}
        santri={selectedSantri}
        loading={panelLoading}
        onCariSantri={openCariSantri}
        onRecorded={() => loadList({ quiet: true })}
      />

      <SearchOffcanvas
        isOpen={santriPickerOpen}
        onClose={() => {
          if (skipSearchBackCloseRef.current) {
            closeSantriPickerState()
            return
          }
          closeSantriPicker()
        }}
        onSelectSantriRecord={handlePickSantri}
      />
    </div>
  )
}
