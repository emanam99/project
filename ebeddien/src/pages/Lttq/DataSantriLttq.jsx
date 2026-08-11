import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { subscribeSantriRowsOrdered } from '../../services/offcanvasSearchCache'
import { useSantriDetailOffcanvas } from '../../contexts/SantriDetailOffcanvasContext'
import { lttqTingkatanAPI, lembagaAPI } from '../../services/api'
import { useLembagaFilterAccess } from '../../hooks/useLembagaFilterAccess'
import { LEMBAGA_FILTER_ACTION_CODES } from '../../config/lembagaFilterFiturCodes'

const EMPTY_FILTER_VALUE = '__empty__'
const EMPTY_FILTER_LABEL = 'Kosong'

function kelompokLabel(s) {
  const v = s?.lttq_kelompok ?? s?.kelas_lttq ?? s?.kel_lttq ?? ''
  return String(v).trim()
}

export default function DataSantriLttq() {
  const { openSantriDetail } = useSantriDetailOffcanvas()
  const lembagaAccess = useLembagaFilterAccess(LEMBAGA_FILTER_ACTION_CODES.santriSemua)

  const [santriList, setSantriList] = useState([])
  const [lembagaRows, setLembagaRows] = useState([])
  const [tingkatanMaster, setTingkatanMaster] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [lembagaFilter, setLembagaFilter] = useState('')
  const [kelasFilter, setKelasFilter] = useState('')
  const [kelFilter, setKelFilter] = useState('')
  const [tingkatanFilter, setTingkatanFilter] = useState('')
  const [kelompokFilter, setKelompokFilter] = useState('')
  const [statusSantriFilter, setStatusSantriFilter] = useState(['mukim', 'khoriji'])
  const [isStatusFilterOpen, setIsStatusFilterOpen] = useState(false)
  const [kategoriFilter, setKategoriFilter] = useState([])
  const [isKategoriFilterOpen, setIsKategoriFilterOpen] = useState(false)
  const [tidakDiniyahFilter, setTidakDiniyahFilter] = useState(false)
  const [tidakFormalFilter, setTidakFormalFilter] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(50)
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [isInputFocused, setIsInputFocused] = useState(false)
  const [sortConfig, setSortConfig] = useState({ key: 'nama', direction: 'asc' })

  const statusFilterRef = useRef(null)
  const statusFilterButtonRef = useRef(null)
  const statusFilterDropdownRef = useRef(null)
  const [statusFilterPosition, setStatusFilterPosition] = useState({ top: 0, left: 0, width: 0 })
  const kategoriFilterRef = useRef(null)
  const kategoriFilterButtonRef = useRef(null)
  const kategoriFilterDropdownRef = useRef(null)
  const [kategoriFilterPosition, setKategoriFilterPosition] = useState({ top: 0, left: 0, width: 0 })

  const sameLembaga = (a, b) => a != null && b != null && String(a) === String(b)
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
  const filterOptionLabel = (value) => (value === EMPTY_FILTER_VALUE ? EMPTY_FILTER_LABEL : value)
  const isStatusSantriSelected = useCallback(
    (value) => statusSantriFilter.includes(normalizeStatusSantri(value)),
    [statusSantriFilter]
  )
  const isKategoriSelected = useCallback(
    (value) => kategoriFilter.includes(normalizeKategori(value)),
    [kategoriFilter]
  )

  useEffect(() => {
    const sub = subscribeSantriRowsOrdered(setSantriList)
    return () => sub.unsubscribe()
  }, [])

  useEffect(() => {
    let cancelled = false
    lembagaAPI
      .getAll()
      .then((res) => {
        if (!cancelled) setLembagaRows(res?.success && Array.isArray(res.data) ? res.data : [])
      })
      .catch(() => {
        if (!cancelled) setLembagaRows([])
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    lttqTingkatanAPI.getAll({ lembaga_id: 'LTTQ', limit: 500, status: 'aktif' })
      .then((res) => {
        setTingkatanMaster(res?.success && Array.isArray(res.data) ? res.data : [])
      })
      .catch(() => setTingkatanMaster([]))
  }, [])

  useEffect(() => {
    const allowed = lembagaAccess.allowedLembagaIds
    if (!allowed || allowed.length === 0) return
    if (allowed.length === 1 && lembagaFilter !== allowed[0]) {
      setLembagaFilter(allowed[0])
    }
  }, [lembagaAccess.allowedLembagaIds, lembagaFilter])

  const lembagaMasterFilterOptions = useMemo(() => {
    const rows = Array.isArray(lembagaRows) ? lembagaRows : []
    const allowedSet = lembagaAccess.allowedLembagaIds ? new Set(lembagaAccess.allowedLembagaIds.map(String)) : null
    return rows
      .filter((l) => !allowedSet || allowedSet.has(String(l.id)))
      .map((l) => {
        const id = String(l.id)
        const count = santriList.filter((s) => sameLembaga(s.diniyah, id) || sameLembaga(s.formal, id)).length
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
        options: [...options].sort((a, b) => a.label.localeCompare(b.label))
      }))
  }, [lembagaMasterFilterOptions])

  useEffect(() => {
    const valid = new Set(['', ...lembagaMasterFilterOptions.map((o) => o.value)])
    if (lembagaFilter && !valid.has(lembagaFilter)) setLembagaFilter('')
  }, [lembagaFilter, lembagaMasterFilterOptions])

  const getKelasForLembaga = useCallback(
    (s) => {
      if (sameLembaga(s.diniyah, lembagaFilter)) {
        return s.kelas_diniyah != null && s.kelas_diniyah !== '' ? String(s.kelas_diniyah) : null
      }
      if (sameLembaga(s.formal, lembagaFilter)) {
        return s.kelas_formal != null && s.kelas_formal !== '' ? String(s.kelas_formal) : null
      }
      return null
    },
    [lembagaFilter]
  )

  const getKelForLembaga = useCallback(
    (s) => {
      if (sameLembaga(s.diniyah, lembagaFilter)) {
        return s.kel_diniyah != null && s.kel_diniyah !== '' ? String(s.kel_diniyah) : null
      }
      if (sameLembaga(s.formal, lembagaFilter)) {
        return s.kel_formal != null && s.kel_formal !== '' ? String(s.kel_formal) : null
      }
      return null
    },
    [lembagaFilter]
  )

  const santriInLembaga = useMemo(() => {
    if (!lembagaFilter) return []
    return santriList.filter((s) => sameLembaga(s.diniyah, lembagaFilter) || sameLembaga(s.formal, lembagaFilter))
  }, [santriList, lembagaFilter])

  const dynamicUniqueKelas = useMemo(() => {
    if (!lembagaFilter) return []
    let filtered = santriInLembaga
    if (statusSantriFilter.length > 0) filtered = filtered.filter((s) => isStatusSantriSelected(s.status_santri))
    if (kategoriFilter.length > 0) filtered = filtered.filter((s) => isKategoriSelected(s.kategori))
    if (tingkatanFilter) filtered = filtered.filter((s) => String(s.id_lttq_tingkatan || '') === tingkatanFilter)
    const values = [...new Set(filtered.map(getKelasForLembaga).filter(Boolean))]
    return values
      .map((val) => ({ value: val, count: filtered.filter((s) => getKelasForLembaga(s) === val).length }))
      .sort((a, b) => String(a.value).localeCompare(String(b.value)))
  }, [
    lembagaFilter,
    santriInLembaga,
    statusSantriFilter,
    kategoriFilter,
    tingkatanFilter,
    isStatusSantriSelected,
    isKategoriSelected,
    getKelasForLembaga
  ])

  const dynamicUniqueKel = useMemo(() => {
    if (!lembagaFilter) return []
    let filtered = santriInLembaga
    if (statusSantriFilter.length > 0) filtered = filtered.filter((s) => isStatusSantriSelected(s.status_santri))
    if (kategoriFilter.length > 0) filtered = filtered.filter((s) => isKategoriSelected(s.kategori))
    if (tingkatanFilter) filtered = filtered.filter((s) => String(s.id_lttq_tingkatan || '') === tingkatanFilter)
    if (kelasFilter) filtered = filtered.filter((s) => getKelasForLembaga(s) === kelasFilter)
    const values = [...new Set(filtered.map(getKelForLembaga).filter(Boolean))]
    return values
      .map((val) => ({ value: val, count: filtered.filter((s) => getKelForLembaga(s) === val).length }))
      .sort((a, b) => String(a.value).localeCompare(String(b.value)))
  }, [
    lembagaFilter,
    kelasFilter,
    santriInLembaga,
    statusSantriFilter,
    kategoriFilter,
    tingkatanFilter,
    isStatusSantriSelected,
    isKategoriSelected,
    getKelasForLembaga,
    getKelForLembaga
  ])

  const dynamicUniqueStatusSantri = useMemo(() => {
    let filtered = santriList
    if (lembagaFilter) {
      filtered = filtered.filter((s) => sameLembaga(s.diniyah, lembagaFilter) || sameLembaga(s.formal, lembagaFilter))
    }
    if (kategoriFilter.length > 0) filtered = filtered.filter((s) => isKategoriSelected(s.kategori))
    if (tingkatanFilter) filtered = filtered.filter((s) => String(s.id_lttq_tingkatan || '') === tingkatanFilter)
    const grouped = new Map()
    filtered.forEach((s) => {
      const value = normalizeStatusSantri(s.status_santri)
      const label = filterOptionLabel(value === EMPTY_FILTER_VALUE ? value : String(s.status_santri ?? '').trim())
      const current = grouped.get(value)
      if (current) current.count += 1
      else grouped.set(value, { value, label, count: 1 })
    })
    return Array.from(grouped.values()).sort((a, b) => a.label.localeCompare(b.label))
  }, [santriList, lembagaFilter, kategoriFilter, tingkatanFilter, isKategoriSelected])

  const dynamicUniqueKategori = useMemo(() => {
    let filtered = santriList
    if (lembagaFilter) {
      filtered = filtered.filter((s) => sameLembaga(s.diniyah, lembagaFilter) || sameLembaga(s.formal, lembagaFilter))
    }
    if (statusSantriFilter.length > 0) filtered = filtered.filter((s) => isStatusSantriSelected(s.status_santri))
    if (tingkatanFilter) filtered = filtered.filter((s) => String(s.id_lttq_tingkatan || '') === tingkatanFilter)
    const grouped = new Map()
    filtered.forEach((s) => {
      const value = normalizeKategori(s.kategori)
      const label = filterOptionLabel(value)
      const current = grouped.get(value)
      if (current) current.count += 1
      else grouped.set(value, { value, label, count: 1 })
    })
    return Array.from(grouped.values()).sort((a, b) => a.label.localeCompare(b.label))
  }, [santriList, lembagaFilter, statusSantriFilter, tingkatanFilter, isStatusSantriSelected])

  const tingkatanOptions = useMemo(
    () =>
      tingkatanMaster.map((t) => ({
        value: String(t.id),
        label: `${t.tingkatan || '–'}${t.kelompok ? ` · ${t.kelompok}` : ''}`
      })),
    [tingkatanMaster]
  )

  const santriForKelompokOptions = useMemo(() => {
    let rows = santriList
    if (tingkatanFilter) rows = rows.filter((s) => String(s.id_lttq_tingkatan || '') === tingkatanFilter)
    return rows
  }, [santriList, tingkatanFilter])

  const dynamicUniqueKelompok = useMemo(() => {
    const counts = new Map()
    for (const s of santriForKelompokOptions) {
      const v = kelompokLabel(s)
      if (!v) continue
      counts.set(v, (counts.get(v) || 0) + 1)
    }
    return Array.from(counts.entries())
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => a.value.localeCompare(b.value))
  }, [santriForKelompokOptions])

  const filteredList = useMemo(() => {
    let rows = [...santriList]

    if (lembagaAccess.allowedLembagaIds?.length) {
      const allowedSet = new Set(lembagaAccess.allowedLembagaIds.map(String))
      rows = rows.filter(
        (s) => allowedSet.has(String(s.diniyah || '')) || allowedSet.has(String(s.formal || ''))
      )
    }

    if (lembagaFilter) {
      rows = rows.filter((s) => sameLembaga(s.diniyah, lembagaFilter) || sameLembaga(s.formal, lembagaFilter))
    }
    if (kelasFilter) {
      rows = rows.filter(
        (s) =>
          (sameLembaga(s.diniyah, lembagaFilter) && (s.kelas_diniyah || '') === kelasFilter) ||
          (sameLembaga(s.formal, lembagaFilter) && (s.kelas_formal || '') === kelasFilter)
      )
    }
    if (kelFilter) {
      rows = rows.filter(
        (s) =>
          (sameLembaga(s.diniyah, lembagaFilter) && (s.kel_diniyah || '') === kelFilter) ||
          (sameLembaga(s.formal, lembagaFilter) && (s.kel_formal || '') === kelFilter)
      )
    }
    if (statusSantriFilter.length > 0) {
      rows = rows.filter((s) => isStatusSantriSelected(s.status_santri))
    }
    if (kategoriFilter.length > 0) {
      rows = rows.filter((s) => isKategoriSelected(s.kategori))
    }
    if (tingkatanFilter) {
      rows = rows.filter((s) => String(s.id_lttq_tingkatan || '') === tingkatanFilter)
    }
    if (kelompokFilter) {
      rows = rows.filter((s) => kelompokLabel(s) === kelompokFilter)
    }
    if (tidakDiniyahFilter) {
      rows = rows.filter((s) => s.diniyah == null || s.diniyah === '')
    }
    if (tidakFormalFilter) {
      rows = rows.filter((s) => s.formal == null || s.formal === '')
    }

    const q = searchQuery.trim().toLowerCase()
    if (q) {
      rows = rows.filter(
        (s) =>
          String(s.nama || '').toLowerCase().includes(q) ||
          String(s.nis || '').toLowerCase().includes(q) ||
          String(s.id || '').includes(q) ||
          String(s.nik || '').toLowerCase().includes(q)
      )
    }

    if (sortConfig.key) {
      rows.sort((a, b) => {
        let aVal = a[sortConfig.key]
        let bVal = b[sortConfig.key]
        if (sortConfig.key === 'kelompok') {
          aVal = kelompokLabel(a)
          bVal = kelompokLabel(b)
        }
        if (aVal == null && bVal == null) return 0
        if (aVal == null || aVal === '') return 1
        if (bVal == null || bVal === '') return -1
        const cmp = String(aVal).localeCompare(String(bVal), 'id', { numeric: true })
        return sortConfig.direction === 'asc' ? cmp : -cmp
      })
    }

    return rows
  }, [
    santriList,
    searchQuery,
    lembagaFilter,
    kelasFilter,
    kelFilter,
    statusSantriFilter,
    kategoriFilter,
    tingkatanFilter,
    kelompokFilter,
    tidakDiniyahFilter,
    tidakFormalFilter,
    sortConfig,
    lembagaAccess.allowedLembagaIds,
    isStatusSantriSelected,
    isKategoriSelected
  ])

  const totalPages = Math.max(1, Math.ceil(filteredList.length / itemsPerPage))
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const paginatedList = filteredList.slice(startIndex, endIndex)

  const handlePageChange = (page) => {
    setCurrentPage(page)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleItemsPerPageChange = (value) => {
    const newItemsPerPage = value === 'all' ? filteredList.length || 1 : Number(value)
    setItemsPerPage(newItemsPerPage)
    setCurrentPage(1)
  }

  const handleSort = (key) => {
    let direction = 'asc'
    if (sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc'
    setSortConfig({ key, direction })
  }

  const resetFilters = () => {
    if (lembagaAccess.allowedLembagaIds?.length === 1) {
      setLembagaFilter(lembagaAccess.allowedLembagaIds[0])
    } else {
      setLembagaFilter('')
    }
    setKelasFilter('')
    setKelFilter('')
    setTingkatanFilter('')
    setKelompokFilter('')
    setStatusSantriFilter(['mukim', 'khoriji'])
    setKategoriFilter([])
    setTidakDiniyahFilter(false)
    setTidakFormalFilter(false)
    setSearchQuery('')
    setCurrentPage(1)
  }

  useEffect(() => {
    setCurrentPage(1)
  }, [
    searchQuery,
    lembagaFilter,
    kelasFilter,
    kelFilter,
    statusSantriFilter,
    kategoriFilter,
    tingkatanFilter,
    kelompokFilter,
    tidakDiniyahFilter,
    tidakFormalFilter,
    sortConfig,
    itemsPerPage
  ])

  useEffect(() => {
    if (!lembagaFilter) {
      setKelasFilter('')
      setKelFilter('')
    }
  }, [lembagaFilter])

  useEffect(() => {
    if (!tingkatanFilter) return
    if (kelompokFilter && !dynamicUniqueKelompok.some((k) => k.value === kelompokFilter)) {
      setKelompokFilter('')
    }
  }, [tingkatanFilter, kelompokFilter, dynamicUniqueKelompok])

  useEffect(() => {
    const updatePosition = () => {
      if (statusFilterButtonRef.current) {
        const rect = statusFilterButtonRef.current.getBoundingClientRect()
        setStatusFilterPosition({
          top: rect.bottom + window.scrollY + 4,
          left: rect.left + window.scrollX,
          width: rect.width
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
          width: rect.width
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
      const inBtn = statusFilterButtonRef.current?.contains(event.target)
      const inDrop = statusFilterDropdownRef.current?.contains(event.target)
      const inWrap = statusFilterRef.current?.contains(event.target)
      if (!inBtn && !inDrop && !inWrap) setIsStatusFilterOpen(false)
    }
    if (isStatusFilterOpen) {
      setTimeout(() => document.addEventListener('mousedown', handleClickOutside), 0)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isStatusFilterOpen])

  useEffect(() => {
    const handleClickOutside = (event) => {
      const inBtn = kategoriFilterButtonRef.current?.contains(event.target)
      const inDrop = kategoriFilterDropdownRef.current?.contains(event.target)
      const inWrap = kategoriFilterRef.current?.contains(event.target)
      if (!inBtn && !inDrop && !inWrap) setIsKategoriFilterOpen(false)
    }
    if (isKategoriFilterOpen) {
      setTimeout(() => document.addEventListener('mousedown', handleClickOutside), 0)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isKategoriFilterOpen])

  const openDetailForRow = useCallback(
    (santri) => {
      openSantriDetail(santri)
    },
    [openSantriDetail]
  )

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
      <motion.div className="h-full overflow-y-auto page-content-scroll" style={{ minHeight: 0 }}>
        <motion.div className="p-4 sm:p-6 lg:p-8">
          <motion.div className="sticky top-0 z-10 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 mb-4">
            <motion.div className="rounded-xl overflow-hidden">
              <motion.div className="relative pb-2 px-4 pt-3">
                <motion.div className="relative">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onFocus={() => setIsInputFocused(true)}
                    onBlur={() => setIsInputFocused(false)}
                    className="w-full p-2 pr-12 focus:outline-none bg-transparent dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400"
                    placeholder="Cari"
                  />
                  <motion.div className="absolute right-0 top-0 bottom-0 flex items-center gap-1 pr-1 pointer-events-none">
                    <button
                      type="button"
                      onClick={() => setIsFilterOpen(!isFilterOpen)}
                      className="bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 p-1.5 rounded text-xs flex items-center gap-1 transition-colors pointer-events-auto"
                      title={isFilterOpen ? 'Sembunyikan Filter' : 'Tampilkan Filter'}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                      </svg>
                    </button>
                  </motion.div>
                </motion.div>
                <motion.div className="absolute left-0 right-0 bottom-0 h-0.5 bg-gray-300 dark:bg-gray-600" />
                <motion.div
                  className={`absolute left-0 right-0 bottom-0 h-0.5 bg-teal-500 transition-opacity ${isInputFocused ? 'opacity-100' : 'opacity-0'}`}
                />
              </motion.div>

              <AnimatePresence>
                {isFilterOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden border-t bg-gray-50 dark:bg-gray-700/50"
                  >
                    <motion.div className="px-4 py-2">
                      <motion.div className="flex flex-wrap gap-2">
                        <select
                          value={lembagaFilter}
                          onChange={(e) => setLembagaFilter(e.target.value)}
                          className="border rounded p-1 h-7 min-w-0 text-xs bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 focus:ring-1 focus:ring-teal-400 max-w-[200px]"
                          disabled={lembagaAccess.lembagaFilterLocked && lembagaAccess.allowedLembagaIds?.length === 1}
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
                                onChange={(e) => {
                                  setKelasFilter(e.target.value)
                                  setKelFilter('')
                                }}
                                className="border rounded p-1 h-7 min-w-0 text-xs bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 focus:ring-1 focus:ring-teal-400"
                              >
                                <option value="">Kelas</option>
                                {dynamicUniqueKelas.map((item) => (
                                  <option key={item.value} value={item.value}>
                                    {item.value} ({item.count})
                                  </option>
                                ))}
                              </select>
                              <select
                                value={kelFilter}
                                onChange={(e) => setKelFilter(e.target.value)}
                                className="border rounded p-1 h-7 min-w-0 text-xs bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 focus:ring-1 focus:ring-teal-400"
                              >
                                <option value="">Kel</option>
                                {dynamicUniqueKel.map((item) => (
                                  <option key={item.value} value={item.value}>
                                    {item.value} ({item.count})
                                  </option>
                                ))}
                              </select>
                            </motion.div>
                          )}
                        </AnimatePresence>

                        <select
                          value={tingkatanFilter}
                          onChange={(e) => {
                            setTingkatanFilter(e.target.value)
                            setKelompokFilter('')
                          }}
                          className="border rounded p-1 h-7 min-w-0 text-xs bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 focus:ring-1 focus:ring-teal-400"
                        >
                          <option value="">Semua Tingkatan</option>
                          {tingkatanOptions.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>

                        <select
                          value={kelompokFilter}
                          onChange={(e) => setKelompokFilter(e.target.value)}
                          className="border rounded p-1 h-7 min-w-0 text-xs bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 focus:ring-1 focus:ring-teal-400"
                        >
                          <option value="">Kelompok LTTQ</option>
                          {dynamicUniqueKelompok.map((item) => (
                            <option key={item.value} value={item.value}>
                              {item.value} ({item.count})
                            </option>
                          ))}
                        </select>

                        <motion.div className="relative" ref={statusFilterRef}>
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
                                  ? dynamicUniqueStatusSantri.find((s) => s.value === statusSantriFilter[0])?.label ||
                                    filterOptionLabel(statusSantriFilter[0])
                                  : `${statusSantriFilter.length} dipilih`}
                            </span>
                            <svg
                              className={`w-3 h-3 transition-transform shrink-0 ${isStatusFilterOpen ? 'rotate-180' : ''}`}
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                            </svg>
                          </button>
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
                                className="fixed z-[9999] bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded shadow-lg max-h-60 overflow-y-auto"
                                style={{
                                  top: `${statusFilterPosition.top}px`,
                                  left: `${statusFilterPosition.left}px`,
                                  width: `${Math.max(statusFilterPosition.width, 200)}px`
                                }}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <motion.div className="p-2 space-y-1">
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
                                              setStatusSantriFilter((prev) =>
                                                prev.includes(item.value) ? prev : [...prev, item.value]
                                              )
                                            } else {
                                              setStatusSantriFilter((prev) => prev.filter((v) => v !== item.value))
                                            }
                                          }}
                                          className="w-3.5 h-3.5 rounded border-gray-300 dark:border-gray-600 text-teal-600 focus:ring-teal-500"
                                        />
                                        <span className="text-gray-700 dark:text-gray-300 flex-1">
                                          {item.label} ({item.count})
                                        </span>
                                      </label>
                                    )
                                  })}
                                  {statusSantriFilter.length > 0 && (
                                    <motion.div className="pt-1 border-t border-gray-200 dark:border-gray-600">
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
                                    </motion.div>
                                  )}
                                </motion.div>
                              </motion.div>
                            </AnimatePresence>,
                            document.body
                          )}

                        <motion.div className="relative" ref={kategoriFilterRef}>
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
                                  ? dynamicUniqueKategori.find((s) => s.value === kategoriFilter[0])?.label ||
                                    filterOptionLabel(kategoriFilter[0])
                                  : `${kategoriFilter.length} dipilih`}
                            </span>
                            <svg
                              className={`w-3 h-3 transition-transform shrink-0 ${isKategoriFilterOpen ? 'rotate-180' : ''}`}
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                            </svg>
                          </button>
                        </motion.div>

                        {isKategoriFilterOpen &&
                          createPortal(
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
                                  width: `${Math.max(kategoriFilterPosition.width, 200)}px`
                                }}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <motion.div className="p-2 space-y-1">
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
                                            if (e.target.checked) {
                                              setKategoriFilter((prev) =>
                                                prev.includes(item.value) ? prev : [...prev, item.value]
                                              )
                                            } else {
                                              setKategoriFilter((prev) => prev.filter((v) => v !== item.value))
                                            }
                                          }}
                                          className="w-3.5 h-3.5 rounded border-gray-300 dark:border-gray-600 text-teal-600 focus:ring-teal-500"
                                        />
                                        <span className="text-gray-700 dark:text-gray-300 flex-1">
                                          {item.label} ({item.count})
                                        </span>
                                      </label>
                                    )
                                  })}
                                  {kategoriFilter.length > 0 && (
                                    <motion.div className="pt-1 border-t border-gray-200 dark:border-gray-600">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setKategoriFilter([])
                                          setIsKategoriFilterOpen(false)
                                        }}
                                        className="w-full text-left px-1.5 py-1 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                                      >
                                        Hapus semua
                                      </button>
                                    </motion.div>
                                  )}
                                </motion.div>
                              </motion.div>
                            </AnimatePresence>,
                            document.body
                          )}
                      </motion.div>

                      <motion.div className="flex flex-wrap items-center gap-4 pt-2 mt-2 border-t border-gray-200 dark:border-gray-600">
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
                      </motion.div>

                      <motion.div className="flex flex-wrap items-center justify-end gap-2 pt-3 mt-2 border-t border-gray-200 dark:border-gray-600">
                        <button
                          type="button"
                          onClick={resetFilters}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
                          title="Reset filter"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
                          </svg>
                          Reset filter
                        </button>
                      </motion.div>
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            <motion.div className="bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden">
              <motion.div className="px-4 sm:px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                <motion.div className="flex flex-row items-center justify-between gap-2 min-w-0">
                  <h2 className="text-base sm:text-lg font-semibold text-gray-500 dark:text-gray-400 shrink-0">
                    {filteredList.length}
                  </h2>
                  <select
                    value={itemsPerPage >= filteredList.length && filteredList.length > 0 ? 'all' : itemsPerPage}
                    onChange={(e) => handleItemsPerPageChange(e.target.value)}
                    className="h-8 pr-6 pl-1 py-1 text-xs bg-transparent border-none text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-0 min-w-0 w-14 sm:w-16 cursor-pointer appearance-none"
                  >
                    <option value="25">25</option>
                    <option value="50">50</option>
                    <option value="100">100</option>
                    <option value="200">200</option>
                    <option value="500">500</option>
                    <option value="all">Semua</option>
                  </select>
                </motion.div>
              </motion.div>

              {filteredList.length === 0 ? (
                <motion.div className="p-8 text-center text-gray-500 dark:text-gray-400">
                  <p>Belum ada data santri yang sesuai filter</p>
                </motion.div>
              ) : (
                <motion.div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 dark:bg-gray-900">
                      <tr>
                        <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                          No
                        </th>
                        <th
                          onClick={() => handleSort('nama')}
                          className="px-4 sm:px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 whitespace-nowrap"
                        >
                          <motion.div className="flex items-center gap-2">
                            Nama <SortIcon columnKey="nama" />
                          </motion.div>
                        </th>
                        <th
                          onClick={() => handleSort('nis')}
                          className="px-4 sm:px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 whitespace-nowrap"
                        >
                          <motion.div className="flex items-center gap-2">
                            NIS <SortIcon columnKey="nis" />
                          </motion.div>
                        </th>
                        <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                          NIK
                        </th>
                        <th
                          onClick={() => handleSort('lttq')}
                          className="px-4 sm:px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 whitespace-nowrap"
                        >
                          <motion.div className="flex items-center gap-2">
                            Tingkatan <SortIcon columnKey="lttq" />
                          </motion.div>
                        </th>
                        <th
                          onClick={() => handleSort('kelompok')}
                          className="px-4 sm:px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 whitespace-nowrap"
                        >
                          <motion.div className="flex items-center gap-2">
                            Kelompok <SortIcon columnKey="kelompok" />
                          </motion.div>
                        </th>
                        <th
                          onClick={() => handleSort('status_santri')}
                          className="px-4 sm:px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 whitespace-nowrap"
                        >
                          <motion.div className="flex items-center gap-2">
                            Status Santri <SortIcon columnKey="status_santri" />
                          </motion.div>
                        </th>
                        <th
                          onClick={() => handleSort('kategori')}
                          className="px-4 sm:px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 whitespace-nowrap"
                        >
                          <motion.div className="flex items-center gap-2">
                            Kategori <SortIcon columnKey="kategori" />
                          </motion.div>
                        </th>
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
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              openDetailForRow(santri)
                            }
                          }}
                          className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors cursor-pointer"
                        >
                          <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-200">
                            {startIndex + index + 1}
                          </td>
                          <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-200">
                            {santri.nama || '-'}
                          </td>
                          <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-700 dark:text-gray-300">
                            {santri.nis ?? santri.id ?? '-'}
                          </td>
                          <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-700 dark:text-gray-300">
                            {santri.nik || '-'}
                          </td>
                          <td className="px-4 sm:px-6 py-4 whitespace-nowrap">
                            <span
                              className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                                santri.lttq
                                  ? 'bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-400'
                                  : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                              }`}
                            >
                              {santri.lttq || '-'}
                            </span>
                          </td>
                          <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">
                            {kelompokLabel(santri) || '-'}
                          </td>
                          <td className="px-4 sm:px-6 py-4 whitespace-nowrap">
                            <span
                              className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                                santri.status_santri
                                  ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400'
                                  : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                              }`}
                            >
                              {santri.status_santri || '-'}
                            </span>
                          </td>
                          <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">
                            {santri.kategori || '-'}
                          </td>
                        </motion.tr>
                      ))}
                    </tbody>
                  </table>
                </motion.div>
              )}

              {filteredList.length > 0 && totalPages > 1 && (
                <motion.div className="px-4 sm:px-6 py-4 border-t border-gray-200 dark:border-gray-700">
                  <motion.div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                    <motion.div className="text-sm text-gray-700 dark:text-gray-300">
                      Menampilkan {startIndex + 1} - {Math.min(endIndex, filteredList.length)} dari {filteredList.length}{' '}
                      santri
                    </motion.div>
                    <motion.div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handlePageChange(currentPage - 1)}
                        disabled={currentPage === 1}
                        className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                      >
                        Sebelumnya
                      </button>
                      <motion.div className="flex items-center gap-1">
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
                              className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                                currentPage === pageNum
                                  ? 'bg-teal-600 text-white'
                                  : 'border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'
                              }`}
                            >
                              {pageNum}
                            </button>
                          )
                        })}
                      </motion.div>
                      <button
                        type="button"
                        onClick={() => handlePageChange(currentPage + 1)}
                        disabled={currentPage === totalPages}
                        className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                      >
                        Selanjutnya
                      </button>
                    </motion.div>
                  </motion.div>
                </motion.div>
              )}
            </motion.div>
            <motion.div className="h-20 sm:h-0 flex-shrink-0" aria-hidden="true" />
          </motion.div>
        </motion.div>
      </motion.div>
    </div>
  )
}
