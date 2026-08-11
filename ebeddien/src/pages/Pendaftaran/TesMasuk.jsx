import { useState, useEffect, useMemo, useCallback, useRef, lazy, Suspense } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { pendaftaranAPI } from '../../services/api'
import { usePageTahunAjaranFilter } from '../../hooks/usePageTahunAjaranFilter'
import TahunAjaranPageFilterBar from '../../components/TahunAjaran/TahunAjaranPageFilterBar'
import { useNotification } from '../../contexts/NotificationContext'
import { useTesMasukFiturAccess } from '../../hooks/useTesMasukFiturAccess'
import TesMasukOffcanvas from './components/TesMasukOffcanvas'
import TesMasukBulkPrintOffcanvas from './components/TesMasukBulkPrintOffcanvas'
import { buildTesMadinPayload, resolveKeputusanMasukTerakhir } from './print/raporTesMadinUtils'
import {
  makeTesMasukPendaftarScopeKey,
  getPendaftarListOrdered,
  applyPendaftarServerPayload,
  getLocalPendaftarSinceWatermark,
  subscribePendaftarListForScope,
  patchPendaftarRowFields,
} from '../../services/pendaftarListCache'

const TesMasukExcelEditorModal = lazy(() => import('./components/TesMasukExcelEditorModal'))

const KEPUTUSAN_MASUK_KOSONG = '__kosong__'

function getKeputusanMasukLabel(pendaftar) {
  const v = pendaftar?.keputusan_masuk
  return v != null && String(v).trim() !== '' ? String(v) : null
}

function TesMasukSortIcon({ columnKey, sortKey, direction }) {
  if (sortKey !== columnKey) {
    return (
      <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
      </svg>
    )
  }
  return direction === 'asc' ? (
    <svg className="w-4 h-4 text-teal-600 dark:text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 15l7-7 7 7" />
    </svg>
  ) : (
    <svg className="w-4 h-4 text-teal-600 dark:text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
    </svg>
  )
}

export default function TesMasuk() {
  const { showNotification } = useNotification()
  const { canSimpan, canPrint, canAktifDiniyah, canVerifikasi } = useTesMasukFiturAccess()
  const {
    selectedHijriyah: tahunAjaran,
    setSelectedHijriyah: setTahunAjaran,
    selectedMasehi: tahunAjaranMasehi,
    setSelectedMasehi: setTahunAjaranMasehi,
    hijriyahOptions,
    masehiOptions,
  } = usePageTahunAjaranFilter({ defaultFromPengaturan: true })

  const pendaftarScopeKey = useMemo(
    () => makeTesMasukPendaftarScopeKey(tahunAjaran, tahunAjaranMasehi),
    [tahunAjaran, tahunAjaranMasehi]
  )

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [listDariLokal, setListDariLokal] = useState(false)
  const skipLiveQueryRef = useRef(true)
  const [pendaftarList, setPendaftarList] = useState([])
  const [filteredList, setFilteredList] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage] = useState(50)
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [isInputFocused, setIsInputFocused] = useState(false)
  const [keteranganStatusFilter, setKeteranganStatusFilter] = useState('')
  const [statusPendaftarFilter, setStatusPendaftarFilter] = useState('')
  const [formalFilter, setFormalFilter] = useState('')
  const [diniyahFilter, setDiniyahFilter] = useState('')
  const [gelombangTesFilter, setGelombangTesFilter] = useState('')
  const [keputusanMasukFilter, setKeputusanMasukFilter] = useState('')
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' })
  const [selectedPendaftar, setSelectedPendaftar] = useState(null)
  const [isOffcanvasOpen, setIsOffcanvasOpen] = useState(false)
  const [modalExcelOpen, setModalExcelOpen] = useState(false)
  const [savingExcelBulk, setSavingExcelBulk] = useState(false)
  const [excelSaveProgress, setExcelSaveProgress] = useState({
    current: 0,
    total: 0,
    ok: 0,
    fail: 0,
    currentNama: null,
  })
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedItems, setSelectedItems] = useState(() => new Set())
  const [showBulkPrintOffcanvas, setShowBulkPrintOffcanvas] = useState(false)

  useEffect(() => {
    skipLiveQueryRef.current = true
    setSelectedItems(new Set())
    setSelectionMode(false)
  }, [tahunAjaran, tahunAjaranMasehi])

  useEffect(() => {
    const sub = subscribePendaftarListForScope(pendaftarScopeKey, (list) => {
      if (skipLiveQueryRef.current) return
      setPendaftarList(list)
    })
    return () => sub.unsubscribe()
  }, [pendaftarScopeKey])

  useEffect(() => {
    loadPendaftarData(true)
  }, [tahunAjaran, tahunAjaranMasehi])

  const loadPendaftarData = async (forceFull = false) => {
    skipLiveQueryRef.current = true
    setLoading(true)
    setError('')
    setListDariLokal(false)

    const h = tahunAjaran
    const m = tahunAjaranMasehi
    if (!String(h || '').trim() || !String(m || '').trim()) {
      setPendaftarList([])
      skipLiveQueryRef.current = false
      setLoading(false)
      return
    }
    const scopeKey = makeTesMasukPendaftarScopeKey(h, m)

    let hadCache = false
    try {
      const cached = await getPendaftarListOrdered(scopeKey)
      if (cached.length) {
        hadCache = true
        setPendaftarList(cached)
        setError('')
        setLoading(false)
      }
    } catch (_) { /* abaikan */ }

    const online = typeof navigator === 'undefined' || navigator.onLine !== false
    if (!online) {
      if (hadCache) setListDariLokal(true)
      else setError('Tidak ada koneksi dan belum ada data pendaftar tersimpan lokal untuk filter ini.')
      skipLiveQueryRef.current = false
      setLoading(false)
      return
    }

    try {
      const since = forceFull ? null : await getLocalPendaftarSinceWatermark(scopeKey)
      const incremental = !forceFull && since != null && since !== ''
      const result = await pendaftaranAPI.getAllPendaftar(h, m, incremental ? since : undefined, { forTesMasuk: true })

      if (result.success) {
        const rows = result.data || []
        await applyPendaftarServerPayload(scopeKey, rows, incremental)
        const list = await getPendaftarListOrdered(scopeKey)
        setPendaftarList(list)
        setCurrentPage(1)
        setListDariLokal(false)
        setError('')
      } else if (hadCache) {
        setListDariLokal(true)
        setError('')
      } else {
        setError(result.message || 'Gagal memuat data pendaftar')
      }
    } catch (err) {
      if (hadCache) {
        setListDariLokal(true)
        setError('')
        showNotification('Memakai data lokal; server tidak terjangkau.', 'info')
      } else {
        setError(err.message || 'Terjadi kesalahan saat memuat data')
      }
    } finally {
      skipLiveQueryRef.current = false
      setLoading(false)
    }
  }

  const sameLembagaForMemo = (a, b) => (a != null && b != null && String(a) === String(b))

  const buildFilteredBase = useCallback((rows, excludeKey) => {
    let filtered = rows
    if (excludeKey !== 'status_pendaftar' && statusPendaftarFilter) {
      filtered = filtered.filter((p) => p.status_pendaftar === statusPendaftarFilter)
    }
    if (excludeKey !== 'keterangan_status' && keteranganStatusFilter) {
      filtered = filtered.filter((p) => p.keterangan_status === keteranganStatusFilter)
    }
    if (excludeKey !== 'formal' && formalFilter) {
      filtered = filtered.filter((p) => sameLembagaForMemo(p.daftar_formal ?? p.formal, formalFilter))
    }
    if (excludeKey !== 'diniyah' && diniyahFilter) {
      filtered = filtered.filter((p) => sameLembagaForMemo(p.daftar_diniyah ?? p.diniyah, diniyahFilter))
    }
    if (excludeKey !== 'gelombang_tes' && gelombangTesFilter) {
      filtered = filtered.filter((p) => (p.gelombang_tes != null && p.gelombang_tes !== '') ? String(p.gelombang_tes) === gelombangTesFilter : false)
    }
    if (excludeKey !== 'keputusan_masuk' && keputusanMasukFilter) {
      if (keputusanMasukFilter === KEPUTUSAN_MASUK_KOSONG) {
        filtered = filtered.filter((p) => !getKeputusanMasukLabel(p))
      } else {
        filtered = filtered.filter((p) => getKeputusanMasukLabel(p) === keputusanMasukFilter)
      }
    }
    return filtered
  }, [statusPendaftarFilter, keteranganStatusFilter, formalFilter, diniyahFilter, gelombangTesFilter, keputusanMasukFilter])

  const dynamicUniqueStatusPendaftar = useMemo(() => {
    const filtered = buildFilteredBase(pendaftarList, 'status_pendaftar')
    const values = [...new Set(filtered.map((p) => p.status_pendaftar).filter(Boolean))]
    return values.map((val) => ({
      value: val,
      count: filtered.filter((p) => p.status_pendaftar === val).length,
    })).sort((a, b) => (a.value || '').localeCompare(b.value || ''))
  }, [pendaftarList, buildFilteredBase])

  const dynamicUniqueKeteranganStatus = useMemo(() => {
    const filtered = buildFilteredBase(pendaftarList, 'keterangan_status')
    const values = [...new Set(filtered.map((p) => p.keterangan_status).filter(Boolean))]
    return values.map((val) => ({
      value: val,
      count: filtered.filter((p) => p.keterangan_status === val).length,
    })).sort((a, b) => (a.value || '').localeCompare(b.value || ''))
  }, [pendaftarList, buildFilteredBase])

  const dynamicUniqueFormal = useMemo(() => {
    const filtered = buildFilteredBase(pendaftarList, 'formal')
    const values = [...new Set(filtered.map((p) => p.daftar_formal ?? p.formal).filter(Boolean))]
    return values.map((val) => ({
      value: val,
      count: filtered.filter((p) => sameLembagaForMemo(p.daftar_formal ?? p.formal, val)).length,
    })).sort((a, b) => String(a.value || '').localeCompare(String(b.value || '')))
  }, [pendaftarList, buildFilteredBase])

  const dynamicUniqueDiniyah = useMemo(() => {
    const filtered = buildFilteredBase(pendaftarList, 'diniyah')
    const values = [...new Set(filtered.map((p) => p.daftar_diniyah ?? p.diniyah).filter(Boolean))]
    return values.map((val) => ({
      value: val,
      count: filtered.filter((p) => sameLembagaForMemo(p.daftar_diniyah ?? p.diniyah, val)).length,
    })).sort((a, b) => String(a.value || '').localeCompare(String(b.value || '')))
  }, [pendaftarList, buildFilteredBase])

  const dynamicUniqueGelombangTes = useMemo(() => {
    const filtered = buildFilteredBase(pendaftarList, 'gelombang_tes')
    const values = [...new Set(filtered.map((p) => (p.gelombang_tes != null && p.gelombang_tes !== '') ? String(p.gelombang_tes) : null).filter(Boolean))]
    return values.map((val) => ({
      value: val,
      count: filtered.filter((p) => (p.gelombang_tes != null && p.gelombang_tes !== '') ? String(p.gelombang_tes) === val : false).length,
    })).sort((a, b) => (a.value || '').localeCompare(b.value || ''))
  }, [pendaftarList, buildFilteredBase])

  const dynamicUniqueKeputusanMasuk = useMemo(() => {
    const filtered = buildFilteredBase(pendaftarList, 'keputusan_masuk')
    const values = [...new Set(filtered.map((p) => getKeputusanMasukLabel(p)).filter(Boolean))]
    const items = values.map((val) => ({
      value: val,
      count: filtered.filter((p) => getKeputusanMasukLabel(p) === val).length,
    })).sort((a, b) => (a.value || '').localeCompare(b.value || ''))
    const kosongCount = filtered.filter((p) => !getKeputusanMasukLabel(p)).length
    if (kosongCount > 0) {
      items.unshift({ value: KEPUTUSAN_MASUK_KOSONG, label: 'Belum ada', count: kosongCount })
    }
    return items
  }, [pendaftarList, buildFilteredBase])

  useEffect(() => {
    let filtered = pendaftarList
    const sameLembaga = (a, b) => (a != null && b != null && String(a) === String(b))
    const df = (p) => p.daftar_formal ?? p.formal
    const dd = (p) => p.daftar_diniyah ?? p.diniyah

    if (formalFilter && diniyahFilter) {
      filtered = filtered.filter((p) => sameLembaga(df(p), formalFilter) || sameLembaga(dd(p), diniyahFilter))
    } else if (formalFilter) {
      filtered = filtered.filter((p) => sameLembaga(df(p), formalFilter))
    } else if (diniyahFilter) {
      filtered = filtered.filter((p) => sameLembaga(dd(p), diniyahFilter))
    }

    if (keteranganStatusFilter) {
      filtered = filtered.filter((p) => p.keterangan_status === keteranganStatusFilter)
    }
    if (statusPendaftarFilter) {
      filtered = filtered.filter((p) => p.status_pendaftar === statusPendaftarFilter)
    }
    if (gelombangTesFilter) {
      filtered = filtered.filter((p) => (p.gelombang_tes != null && p.gelombang_tes !== '') ? String(p.gelombang_tes) === gelombangTesFilter : false)
    }
    if (keputusanMasukFilter) {
      if (keputusanMasukFilter === KEPUTUSAN_MASUK_KOSONG) {
        filtered = filtered.filter((p) => !getKeputusanMasukLabel(p))
      } else {
        filtered = filtered.filter((p) => getKeputusanMasukLabel(p) === keputusanMasukFilter)
      }
    }

    if (searchQuery.trim() !== '') {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter((p) =>
        (p.nama || '').toLowerCase().includes(query)
        || (p.nis ?? p.id).toString().includes(query)
        || (p.nik && p.nik.toString().includes(query))
      )
    }

    if (sortConfig.key) {
      const getSortVal = (p) => {
        if (sortConfig.key === 'daftar_formal') return p.daftar_formal ?? p.formal
        if (sortConfig.key === 'daftar_diniyah') return p.daftar_diniyah ?? p.diniyah
        if (sortConfig.key === 'keterangan_status') return p.keterangan_status
        if (sortConfig.key === 'status_pendaftar') return p.status_pendaftar
        if (sortConfig.key === 'gelombang_tes') return p.gelombang_tes
        if (sortConfig.key === 'keputusan_masuk') return getKeputusanMasukLabel(p) || ''
        if (sortConfig.key === 'rombel_diniyah') return p.rombel_diniyah || ''
        return p[sortConfig.key]
      }
      filtered = [...filtered].sort((a, b) => {
        const aVal = getSortVal(a)
        const bVal = getSortVal(b)
        if (aVal == null && bVal == null) return 0
        if (aVal == null) return 1
        if (bVal == null) return -1
        if (typeof aVal === 'string') {
          return sortConfig.direction === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal)
        }
        return sortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal
      })
    }

    setFilteredList(filtered)
  }, [searchQuery, pendaftarList, formalFilter, diniyahFilter, keteranganStatusFilter, statusPendaftarFilter, gelombangTesFilter, keputusanMasukFilter, sortConfig])

  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery, keteranganStatusFilter, statusPendaftarFilter, formalFilter, diniyahFilter, gelombangTesFilter, keputusanMasukFilter, sortConfig])

  const totalPages = Math.ceil(filteredList.length / itemsPerPage) || 1
  const startIndex = (currentPage - 1) * itemsPerPage
  const paginatedList = filteredList.slice(startIndex, startIndex + itemsPerPage)

  const selectedPendaftarList = useMemo(
    () => filteredList.filter((p) => selectedItems.has(p.id_registrasi)),
    [filteredList, selectedItems]
  )

  const isAllPageSelected = selectionMode
    && paginatedList.length > 0
    && paginatedList.every((p) => selectedItems.has(p.id_registrasi))
  const isSomePageSelected = selectionMode && paginatedList.some((p) => selectedItems.has(p.id_registrasi))

  const handleToggleSelect = (idRegistrasi) => {
    setSelectedItems((prev) => {
      const next = new Set(prev)
      if (next.has(idRegistrasi)) next.delete(idRegistrasi)
      else next.add(idRegistrasi)
      return next
    })
  }

  const handleToggleSelectAllPage = () => {
    if (paginatedList.length === 0) return
    if (isAllPageSelected) {
      setSelectedItems((prev) => {
        const next = new Set(prev)
        paginatedList.forEach((p) => next.delete(p.id_registrasi))
        return next
      })
    } else {
      setSelectedItems((prev) => {
        const next = new Set(prev)
        paginatedList.forEach((p) => next.add(p.id_registrasi))
        return next
      })
    }
  }

  const handleToggleSelectionMode = () => {
    setSelectionMode((mode) => {
      if (mode) setSelectedItems(new Set())
      return !mode
    })
  }

  const tableColSpan = selectionMode ? 8 : 7

  const handleSort = (key) => {
    let direction = 'asc'
    if (sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc'
    setSortConfig({ key, direction })
  }

  const handleRowClick = (pendaftar) => {
    setSelectedPendaftar(pendaftar)
    setIsOffcanvasOpen(true)
  }

  const handleCloseOffcanvas = () => {
    setIsOffcanvasOpen(false)
    setSelectedPendaftar(null)
  }

  const handleApplyExcelTes = useCallback(async (updates) => {
    const th = String(tahunAjaran ?? '').trim()
    const tm = String(tahunAjaranMasehi ?? '').trim()
    if (!th || !tm || !Array.isArray(updates) || updates.length === 0) return

    const total = updates.length
    const yieldToUi = () => new Promise((resolve) => {
      setTimeout(resolve, 0)
    })

    setSavingExcelBulk(true)
    setExcelSaveProgress({ current: 0, total, ok: 0, fail: 0, currentNama: null })
    await yieldToUi()

    let ok = 0
    let fail = 0

    for (let i = 0; i < updates.length; i += 1) {
      const item = updates[i]
      const label = item.nama || item.nis || `Santri #${item.id_santri ?? i + 1}`

      setExcelSaveProgress({
        current: i,
        total,
        ok,
        fail,
        currentNama: label,
      })
      await yieldToUi()

      const sid = item.id_santri
      if (!sid) {
        fail += 1
        setExcelSaveProgress({ current: i + 1, total, ok, fail, currentNama: label })
        await yieldToUi()
        continue
      }

      try {
        const payload = buildTesMadinPayload(sid, th, tm, item.form, item.id_registrasi)
        const res = await pendaftaranAPI.saveTesMadin(payload)
        if (res?.success) {
          ok += 1
          const gelombangTes = item.form.gelombang ? String(item.form.gelombang) : null
          const keputusanMasuk = resolveKeputusanMasukTerakhir(item.form)
          if (pendaftarScopeKey && item.id_registrasi) {
            await patchPendaftarRowFields(pendaftarScopeKey, item.id_registrasi, {
              gelombang_tes: gelombangTes,
              keputusan_masuk: keputusanMasuk,
            })
          }
        } else {
          fail += 1
        }
      } catch {
        fail += 1
      }

      setExcelSaveProgress({ current: i + 1, total, ok, fail, currentNama: label })
      await yieldToUi()
    }

    setSavingExcelBulk(false)
    setExcelSaveProgress({ current: 0, total: 0, ok: 0, fail: 0, currentNama: null })

    if (ok > 0) {
      showNotification(`Import Excel: ${ok} berhasil${fail > 0 ? `, ${fail} gagal` : ''}`, fail > 0 ? 'warning' : 'success')
      await loadPendaftarData(true)
    } else {
      showNotification(`Import Excel gagal (${fail} baris)`, 'error')
    }
  }, [tahunAjaran, tahunAjaranMasehi, pendaftarScopeKey, showNotification])

  if (loading) {
    return (
      <div className="h-full overflow-hidden" style={{ minHeight: 0 }}>
        <div className="h-full overflow-y-auto page-content-scroll" style={{ minHeight: 0 }}>
          <div className="p-4 sm:p-6 lg:p-8 flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600" />
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="h-full overflow-hidden" style={{ minHeight: 0 }}>
        <div className="h-full overflow-y-auto page-content-scroll p-4 sm:p-6 lg:p-8">
          <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg">
            {error}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-hidden" style={{ minHeight: 0 }}>
      <div className="h-full overflow-y-auto page-content-scroll" style={{ minHeight: 0 }}>
        <div className="p-4 sm:p-6 lg:p-8">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            {listDariLokal && (
              <div className="mb-3 text-xs bg-amber-50 dark:bg-amber-900/30 text-amber-900 dark:text-amber-100 border border-amber-200/80 dark:border-amber-800/60 rounded-lg px-3 py-2">
                Menampilkan data dari penyimpanan lokal.
              </div>
            )}

            <TahunAjaranPageFilterBar
              variant="dual"
              hideLabels
              alignRight
              showHint={false}
              className="mb-3"
              selectedHijriyah={tahunAjaran}
              selectedMasehi={tahunAjaranMasehi}
              onHijriyahChange={setTahunAjaran}
              onMasehiChange={setTahunAjaranMasehi}
              hijriyahOptions={hijriyahOptions}
              masehiOptions={masehiOptions}
            />

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
                        type="button"
                        onClick={() => setIsFilterOpen((f) => !f)}
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
                  <div className="absolute left-0 right-0 bottom-0 h-0.5 bg-gray-300 dark:bg-gray-600" />
                  <div className={`absolute left-0 right-0 bottom-0 h-0.5 bg-teal-500 transition-opacity ${isInputFocused ? 'opacity-100' : 'opacity-0'}`} />
                </div>

                {savingExcelBulk && excelSaveProgress.total > 0 ? (
                  <div
                    className="px-4 pb-3 pt-2 border-b border-gray-200 dark:border-gray-700 bg-teal-50/80 dark:bg-teal-950/30"
                    role="status"
                    aria-live="polite"
                    aria-busy="true"
                  >
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <span className="text-xs font-medium text-teal-900 dark:text-teal-200">
                        Menyimpan data Excel…
                      </span>
                      <span className="text-xs font-semibold text-teal-800 dark:text-teal-300 tabular-nums shrink-0">
                        {excelSaveProgress.current} / {excelSaveProgress.total}
                        {' '}
                        ({excelSaveProgress.total > 0
                          ? Math.round((excelSaveProgress.current / excelSaveProgress.total) * 100)
                          : 0}%)
                      </span>
                    </div>
                    <div className="w-full bg-teal-200/80 dark:bg-teal-900/50 rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-teal-600 dark:bg-teal-500 h-2 rounded-full transition-[width] duration-150 ease-out"
                        style={{
                          width: `${excelSaveProgress.total > 0
                            ? Math.min(100, (excelSaveProgress.current / excelSaveProgress.total) * 100)
                            : 0}%`,
                        }}
                      />
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 text-[11px] text-teal-800/90 dark:text-teal-300/90">
                      {excelSaveProgress.currentNama ? (
                        <span className="truncate min-w-0">
                          Memproses: <span className="font-medium">{excelSaveProgress.currentNama}</span>
                        </span>
                      ) : (
                        <span>Menyiapkan…</span>
                      )}
                      {(excelSaveProgress.ok > 0 || excelSaveProgress.fail > 0) && (
                        <span className="tabular-nums shrink-0">
                          {excelSaveProgress.ok} berhasil
                          {excelSaveProgress.fail > 0 ? ` · ${excelSaveProgress.fail} gagal` : ''}
                        </span>
                      )}
                    </div>
                  </div>
                ) : null}

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
                      <div className="flex flex-wrap gap-2 items-center">
                      <select
                        value={statusPendaftarFilter}
                        onChange={(e) => setStatusPendaftarFilter(e.target.value)}
                        className="border rounded p-1 h-7 min-w-0 text-xs bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 focus:ring-1 focus:ring-teal-400"
                      >
                        <option value="">Status Pendaftar</option>
                        {dynamicUniqueStatusPendaftar.map((item) => (
                          <option key={item.value} value={item.value}>{item.value} ({item.count})</option>
                        ))}
                      </select>
                      <select
                        value={formalFilter}
                        onChange={(e) => setFormalFilter(e.target.value)}
                        className="border rounded p-1 h-7 min-w-0 text-xs bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 focus:ring-1 focus:ring-teal-400"
                      >
                        <option value="">Daftar Formal</option>
                        {dynamicUniqueFormal.map((item) => (
                          <option key={item.value} value={item.value}>{item.value} ({item.count})</option>
                        ))}
                      </select>
                      <select
                        value={diniyahFilter}
                        onChange={(e) => setDiniyahFilter(e.target.value)}
                        className="border rounded p-1 h-7 min-w-0 text-xs bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 focus:ring-1 focus:ring-teal-400"
                      >
                        <option value="">Daftar Diniyah</option>
                        {dynamicUniqueDiniyah.map((item) => (
                          <option key={item.value} value={item.value}>{item.value} ({item.count})</option>
                        ))}
                      </select>
                      <select
                        value={keputusanMasukFilter}
                        onChange={(e) => setKeputusanMasukFilter(e.target.value)}
                        className="border rounded p-1 h-7 min-w-0 text-xs bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 focus:ring-1 focus:ring-teal-400"
                      >
                        <option value="">Keputusan Masuk</option>
                        {dynamicUniqueKeputusanMasuk.map((item) => (
                          <option key={item.value} value={item.value}>
                            {item.label ?? item.value} ({item.count})
                          </option>
                        ))}
                      </select>
                      <select
                        value={gelombangTesFilter}
                        onChange={(e) => setGelombangTesFilter(e.target.value)}
                        className="border rounded p-1 h-7 min-w-0 text-xs bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 focus:ring-1 focus:ring-teal-400"
                      >
                        <option value="">Gelombang Tes</option>
                        {dynamicUniqueGelombangTes.map((item) => (
                          <option key={item.value} value={item.value}>{item.value} ({item.count})</option>
                        ))}
                      </select>
                      </div>
                      <div className="flex flex-wrap items-center justify-end gap-2 pt-3 mt-2 border-t border-gray-200 dark:border-gray-600">
                      {(statusPendaftarFilter || keteranganStatusFilter || formalFilter || diniyahFilter || keputusanMasukFilter || gelombangTesFilter) && (
                        <button
                          type="button"
                          onClick={() => {
                            setStatusPendaftarFilter('')
                            setKeteranganStatusFilter('')
                            setFormalFilter('')
                            setDiniyahFilter('')
                            setKeputusanMasukFilter('')
                            setGelombangTesFilter('')
                          }}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
                          title="Reset filter"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
                          </svg>
                          Reset filter
                        </button>
                      )}
                      {canPrint ? (
                        <button
                          type="button"
                          onClick={handleToggleSelectionMode}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                            selectionMode
                              ? 'border-teal-400 dark:border-teal-600 text-teal-700 dark:text-teal-300 bg-teal-50 dark:bg-teal-900/30'
                              : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600'
                          }`}
                          title={selectionMode ? 'Selesai memilih' : 'Pilih baris untuk print massal'}
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          {selectionMode ? 'Selesai Pilih' : 'Pilih'}
                        </button>
                      ) : null}
                      {canPrint && selectionMode && selectedItems.size > 0 ? (
                        <button
                          type="button"
                          onClick={() => setShowBulkPrintOffcanvas(true)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white transition-colors"
                          title="Cetak rapor tes untuk baris terpilih"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                          </svg>
                          Print massal ({selectedItems.size})
                        </button>
                      ) : null}
                      {canSimpan ? (
                        <button
                          type="button"
                          onClick={() => setModalExcelOpen(true)}
                          disabled={savingExcelBulk || filteredList.length === 0}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-teal-300 dark:border-teal-700 text-teal-700 dark:text-teal-300 hover:bg-teal-50 dark:hover:bg-teal-900/30 disabled:opacity-50 transition-colors"
                          title="Paste nilai tes dari Excel (cocokkan lewat NIS)"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                          {savingExcelBulk ? 'Menyimpan…' : 'Excel'}
                        </button>
                      ) : null}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
              {selectionMode && selectedItems.size > 0 && (
                <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700 bg-indigo-50/80 dark:bg-indigo-900/20 text-xs text-indigo-800 dark:text-indigo-200 flex flex-wrap items-center justify-between gap-2">
                  <span>{selectedItems.size} pendaftar dipilih (lintas halaman filter)</span>
                  <button
                    type="button"
                    onClick={() => setSelectedItems(new Set())}
                    className="text-indigo-700 dark:text-indigo-300 hover:underline"
                  >
                    Hapus pilihan
                  </button>
                </div>
              )}
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead className="bg-gray-50 dark:bg-gray-700/50">
                    <tr>
                      {selectionMode && (
                        <th className="px-3 py-3 text-center w-10">
                          <input
                            type="checkbox"
                            checked={isAllPageSelected}
                            ref={(el) => {
                              if (el) el.indeterminate = isSomePageSelected && !isAllPageSelected
                            }}
                            onChange={handleToggleSelectAllPage}
                            className="w-4 h-4 text-teal-600 bg-gray-100 border-gray-300 rounded focus:ring-teal-500 dark:bg-gray-700 dark:border-gray-600"
                            title="Pilih semua di halaman ini"
                          />
                        </th>
                      )}
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase">No</th>
                      <th
                        onClick={() => handleSort('nama')}
                        className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600"
                      >
                        <div className="flex items-center gap-1">
                          Nama
                          <TesMasukSortIcon columnKey="nama" sortKey={sortConfig.key} direction={sortConfig.direction} />
                        </div>
                      </th>
                      <th
                        onClick={() => handleSort('daftar_diniyah')}
                        className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600"
                      >
                        <div className="flex items-center gap-1">
                          Diniyah
                          <TesMasukSortIcon columnKey="daftar_diniyah" sortKey={sortConfig.key} direction={sortConfig.direction} />
                        </div>
                      </th>
                      <th
                        onClick={() => handleSort('keputusan_masuk')}
                        className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600"
                      >
                        <div className="flex items-center gap-1">
                          Keputusan
                          <TesMasukSortIcon columnKey="keputusan_masuk" sortKey={sortConfig.key} direction={sortConfig.direction} />
                        </div>
                      </th>
                      <th
                        onClick={() => handleSort('rombel_diniyah')}
                        className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600"
                      >
                        <div className="flex items-center gap-1">
                          Rombel
                          <TesMasukSortIcon columnKey="rombel_diniyah" sortKey={sortConfig.key} direction={sortConfig.direction} />
                        </div>
                      </th>
                      <th
                        onClick={() => handleSort('gelombang_tes')}
                        className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600"
                      >
                        <div className="flex items-center gap-1">
                          Gel
                          <TesMasukSortIcon columnKey="gelombang_tes" sortKey={sortConfig.key} direction={sortConfig.direction} />
                        </div>
                      </th>
                      <th
                        onClick={() => handleSort('daftar_formal')}
                        className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600"
                      >
                        <div className="flex items-center gap-1">
                          Formal
                          <TesMasukSortIcon columnKey="daftar_formal" sortKey={sortConfig.key} direction={sortConfig.direction} />
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                    {paginatedList.length === 0 ? (
                      <tr>
                        <td colSpan={tableColSpan} className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                          Tidak ada data pendaftar.
                        </td>
                      </tr>
                    ) : (
                      paginatedList.map((pendaftar, index) => {
                        const isSelected = selectedItems.has(pendaftar.id_registrasi)
                        return (
                        <tr
                          key={pendaftar.id_registrasi ?? `${pendaftar.id}-${index}`}
                          onClick={(e) => {
                            if (e.target.type === 'checkbox') return
                            handleRowClick(pendaftar)
                          }}
                          className={`hover:bg-teal-50 dark:hover:bg-teal-900/20 cursor-pointer transition-colors ${
                            isSelected ? 'bg-teal-50/70 dark:bg-teal-900/20' : ''
                          }`}
                        >
                          {selectionMode && (
                            <td className="px-3 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => handleToggleSelect(pendaftar.id_registrasi)}
                                className="w-4 h-4 text-teal-600 bg-gray-100 border-gray-300 rounded focus:ring-teal-500 dark:bg-gray-700 dark:border-gray-600"
                              />
                            </td>
                          )}
                          <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">{startIndex + index + 1}</td>
                          <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100">{pendaftar.nama}</td>
                          <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">{pendaftar.daftar_diniyah ?? pendaftar.diniyah ?? '-'}</td>
                          <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">{getKeputusanMasukLabel(pendaftar) ?? '-'}</td>
                          <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">{pendaftar.rombel_diniyah ?? '-'}</td>
                          <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">{pendaftar.gelombang_tes ?? '-'}</td>
                          <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">{pendaftar.daftar_formal ?? pendaftar.formal ?? '-'}</td>
                        </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {filteredList.length > itemsPerPage && (
                <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {startIndex + 1}–{Math.min(startIndex + itemsPerPage, filteredList.length)} dari {filteredList.length}
                  </p>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={currentPage <= 1}
                      onClick={() => setCurrentPage((p) => p - 1)}
                      className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm disabled:opacity-50"
                    >
                      Sebelumnya
                    </button>
                    <span className="text-xs px-2">{currentPage} / {totalPages}</span>
                    <button
                      type="button"
                      disabled={currentPage >= totalPages}
                      onClick={() => setCurrentPage((p) => p + 1)}
                      className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm disabled:opacity-50"
                    >
                      Berikutnya
                    </button>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      </div>

      <TesMasukOffcanvas
        isOpen={isOffcanvasOpen}
        onClose={handleCloseOffcanvas}
        pendaftar={selectedPendaftar}
        pendaftarScopeKey={pendaftarScopeKey}
        tahunHijriyah={tahunAjaran}
        tahunMasehi={tahunAjaranMasehi}
        onRefreshList={() => loadPendaftarData(true)}
        canPrint={canPrint}
        canAktifDiniyah={canAktifDiniyah}
        canSimpan={canSimpan}
        canVerifikasi={canVerifikasi}
        onPendaftarUpdate={(patch) => {
          setSelectedPendaftar((prev) => (prev ? { ...prev, ...patch } : null))
        }}
        showNotification={showNotification}
      />

      {modalExcelOpen && (
        <Suspense fallback={null}>
          <TesMasukExcelEditorModal
            open={modalExcelOpen}
            pendaftarList={filteredList}
            tahunHijriyah={tahunAjaran}
            tahunMasehi={tahunAjaranMasehi}
            onClose={() => setModalExcelOpen(false)}
            onApply={handleApplyExcelTes}
            onNotify={showNotification}
          />
        </Suspense>
      )}

      <TesMasukBulkPrintOffcanvas
        isOpen={showBulkPrintOffcanvas}
        onClose={() => setShowBulkPrintOffcanvas(false)}
        selectedPendaftarList={selectedPendaftarList}
        tahunHijriyah={tahunAjaran}
        tahunMasehi={tahunAjaranMasehi}
      />
    </div>
  )
}
