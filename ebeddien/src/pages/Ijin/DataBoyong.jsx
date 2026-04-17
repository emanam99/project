import { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import * as XLSX from 'xlsx'
import { boyongAPI, dashboardAPI, santriAPI, kalenderAPI } from '../../services/api'
import { getBulanName, BULAN_HIJRI } from '../Kalender/utils/bulanHijri'
import { useTahunAjaranStore } from '../../store/tahunAjaranStore'
import SearchOffcanvas from '../../components/Biodata/SearchOffcanvas'
import PrintBoyongOffcanvas from './components/PrintBoyongOffcanvas'

function DataBoyong() {
  const { tahunAjaran, tahunAjaranMasehi, options, optionsMasehi } = useTahunAjaranStore()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [list, setList] = useState([])
  const [santriOptions, setSantriOptions] = useState([])
  const [fullSantriList, setFullSantriList] = useState([])
  const [searchTerm, setSearchTerm] = useState('')
  const [isInputFocused, setIsInputFocused] = useState(false)
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [diniyahFilter, setDiniyahFilter] = useState('')
  const [formalFilter, setFormalFilter] = useState('')
  const [hijriyahFilter, setHijriyahFilter] = useState('')
  const [adminFilter, setAdminFilter] = useState('')
  const [tahunHijriyahFilter, setTahunHijriyahFilter] = useState('')
  const [tahunMasehiFilter, setTahunMasehiFilter] = useState('')
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' })
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(50)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState({
    id_santri: '',
    nisInput: '',
    selectedSantriNama: '',
    diniyah: '',
    formal: '',
    tanggal_hijriyah: '',
    tahun_hijriyah: '',
    tahun_masehi: '',
    sudah_mengurusi: 1
  })
  const [selectedSantriDetail, setSelectedSantriDetail] = useState(null)
  const [saving, setSaving] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [showPrintBoyongOffcanvas, setShowPrintBoyongOffcanvas] = useState(false)

  const loadBoyong = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await boyongAPI.get()
      if (res.success) {
        setList(res.data || [])
      } else {
        setError(res.message || 'Gagal memuat data boyong')
      }
    } catch (err) {
      setError(err.message || 'Terjadi kesalahan')
    } finally {
      setLoading(false)
    }
  }

  const loadSantriForForm = async () => {
    try {
      const [resDashboard, resAll] = await Promise.all([
        dashboardAPI.getDataSantri(tahunAjaran),
        santriAPI.getAll()
      ])
      if (resDashboard?.success && resDashboard?.data) {
        setSantriOptions(resDashboard.data)
      }
      if (resAll?.success && resAll?.data) {
        setFullSantriList(resAll.data)
      }
    } catch (err) {
      console.error('Load santri:', err)
    }
  }

  useEffect(() => {
    loadBoyong()
  }, [])

  useEffect(() => {
    if (showForm) loadSantriForForm()
  }, [showForm, tahunAjaran])

  useEffect(() => {
    if (showForm && form.id_santri && (fullSantriList.length > 0 || santriOptions.length > 0)) {
      const s =
        fullSantriList.find((x) => x.id === form.id_santri) ||
        santriOptions.find((x) => x.id === form.id_santri)
      if (s) setSelectedSantriDetail(s)
    }
  }, [showForm, form.id_santri, fullSantriList, santriOptions])

  const filteredList = useMemo(() => {
    let result = list
    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      result = result.filter(
        (row) =>
          (row.santri_nama || '').toLowerCase().includes(term) ||
          (row.santri_nis || '').toString().toLowerCase().includes(term) ||
          (row.id_santri || '').toString().includes(term)
      )
    }
    if (diniyahFilter) result = result.filter((row) => (row.diniyah || '') === diniyahFilter)
    if (formalFilter) result = result.filter((row) => (row.formal || '') === formalFilter)
    if (hijriyahFilter) result = result.filter((row) => (row.tanggal_hijriyah || '') === hijriyahFilter)
    if (adminFilter) result = result.filter((row) => (row.pengurus_nama || '') === adminFilter)
    if (tahunHijriyahFilter) result = result.filter((row) => (row.tahun_hijriyah || '') === tahunHijriyahFilter)
    if (tahunMasehiFilter) result = result.filter((row) => (row.tahun_masehi || '') === tahunMasehiFilter)
    return result
  }, [list, searchTerm, diniyahFilter, formalFilter, hijriyahFilter, adminFilter, tahunHijriyahFilter, tahunMasehiFilter])

  const uniqueDiniyah = useMemo(() => {
    const values = [...new Set(list.map((r) => r.diniyah).filter(Boolean))]
    return values.sort((a, b) => String(a).localeCompare(String(b))).map((v) => ({ value: v, count: list.filter((r) => (r.diniyah || '') === v).length }))
  }, [list])
  const uniqueFormal = useMemo(() => {
    const values = [...new Set(list.map((r) => r.formal).filter(Boolean))]
    return values.sort((a, b) => String(a).localeCompare(String(b))).map((v) => ({ value: v, count: list.filter((r) => (r.formal || '') === v).length }))
  }, [list])
  const uniqueHijriyah = useMemo(() => {
    const values = [...new Set(list.map((r) => r.tanggal_hijriyah).filter(Boolean))]
    return values.sort((a, b) => String(a).localeCompare(String(b))).map((v) => ({ value: v, count: list.filter((r) => (r.tanggal_hijriyah || '') === v).length }))
  }, [list])
  const uniqueAdmin = useMemo(() => {
    const values = [...new Set(list.map((r) => r.pengurus_nama).filter(Boolean))]
    return values.sort((a, b) => String(a).localeCompare(String(b))).map((v) => ({ value: v, count: list.filter((r) => (r.pengurus_nama || '') === v).length }))
  }, [list])
  const uniqueTahunHijriyah = useMemo(() => {
    const values = [...new Set(list.map((r) => r.tahun_hijriyah).filter(Boolean))]
    return values.sort((a, b) => String(a).localeCompare(String(b))).map((v) => ({ value: v, count: list.filter((r) => (r.tahun_hijriyah || '') === v).length }))
  }, [list])
  const uniqueTahunMasehi = useMemo(() => {
    const values = [...new Set(list.map((r) => r.tahun_masehi).filter(Boolean))]
    return values.sort((a, b) => String(a).localeCompare(String(b))).map((v) => ({ value: v, count: list.filter((r) => (r.tahun_masehi || '') === v).length }))
  }, [list])

  const filteredAndSortedList = useMemo(() => {
    const key = sortConfig.key
    const dir = sortConfig.direction === 'asc' ? 1 : -1
    if (!key) return filteredList
    return [...filteredList].sort((a, b) => {
      const av = a[key] ?? ''
      const bv = b[key] ?? ''
      let cmp
      if (key === 'sudah_mengurusi') {
        cmp = Number(av) - Number(bv)
      } else {
        cmp =
          typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv), 'id')
      }
      return cmp * dir
    })
  }, [filteredList, sortConfig.key, sortConfig.direction])

  const totalPages = Math.max(1, Math.ceil(filteredAndSortedList.length / itemsPerPage))
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const paginatedData = useMemo(
    () => filteredAndSortedList.slice(startIndex, endIndex),
    [filteredAndSortedList, startIndex, endIndex]
  )

  const handleSort = (key) => {
    let direction = 'asc'
    if (sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc'
    setSortConfig({ key, direction })
  }

  const handleToggleSudahMengurusi = async (e, row) => {
    e.stopPropagation()
    const next = Number(row.sudah_mengurusi) === 1 ? 0 : 1
    try {
      const res = await boyongAPI.update(row.id, { sudah_mengurusi: next })
      if (res.success) {
        setList((prev) => prev.map((r) => (r.id === row.id ? { ...r, sudah_mengurusi: next } : r)))
      } else {
        alert(res.message || 'Gagal memperbarui status')
      }
    } catch (err) {
      alert(err.message || 'Terjadi kesalahan')
    }
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

  const boyongTahunIniCount = useMemo(
    () => list.filter((b) => (b.tahun_hijriyah || '').trim() === tahunAjaran).length,
    [list, tahunAjaran]
  )

  const handleExportExcel = () => {
    const dataToExport = filteredAndSortedList
    if (dataToExport.length === 0) {
      alert('Tidak ada data untuk di-export')
      return
    }
    const excelData = dataToExport.map((row) => ({
      NIS: row.santri_nis ?? row.id_santri,
      Nama: row.santri_nama || '',
      'Diniyah Terakhir': row.diniyah || '',
      'Formal Terakhir': row.formal || '',
      'Tanggal Hijriyah': row.tanggal_hijriyah || '',
      'Tahun Ajaran (H)': row.tahun_hijriyah || '',
      'Tahun Ajaran (M)': row.tahun_masehi || '',
      'Sudah mengurusi': Number(row.sudah_mengurusi) === 1 ? 'Ya' : 'Belum',
      'Dibuat oleh': row.pengurus_nama || ''
    }))
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.json_to_sheet(excelData)
    XLSX.utils.book_append_sheet(wb, ws, 'Data Boyong')
    const filename = `Data_Boyong_${tahunAjaran || 'All'}_${new Date().toISOString().split('T')[0]}.xlsx`
    XLSX.writeFile(wb, filename)
  }

  const lookupSantriByNis = (nisOrId) => {
    const s = nisOrId ? String(nisOrId).trim() : ''
    if (!s) return null
    return (
      fullSantriList.find(
        (x) =>
          String(x.nis || x.id || '') === s || String(x.id ?? '').padStart(7, '0') === s
      ) ||
      santriOptions.find(
        (x) =>
          String(x.nis || x.id || '') === s || String(x.id ?? '').padStart(7, '0') === s
      )
    )
  }

  const handleSelectSantriFromSearch = (nisOrId) => {
    const santri = lookupSantriByNis(nisOrId)
    if (santri) {
      setForm((f) => ({
        ...f,
        id_santri: santri.id,
        nisInput: String(santri.nis ?? santri.id).padStart(7, '0'),
        selectedSantriNama: santri.nama || '-'
      }))
      setSelectedSantriDetail(santri)
    } else {
      setForm((f) => ({
        ...f,
        nisInput: String(nisOrId || ''),
        selectedSantriNama: '',
        id_santri: ''
      }))
      setSelectedSantriDetail(null)
    }
    setIsSearchOpen(false)
  }

  const handleNisBlur = () => {
    const santri = lookupSantriByNis(form.nisInput)
    if (santri) {
      setForm((f) => ({
        ...f,
        id_santri: santri.id,
        nisInput: String(santri.nis ?? santri.id).padStart(7, '0'),
        selectedSantriNama: santri.nama || '-'
      }))
      setSelectedSantriDetail(santri)
    } else if (form.nisInput.trim()) {
      setForm((f) => ({ ...f, id_santri: '', selectedSantriNama: '' }))
      setSelectedSantriDetail(null)
    }
  }

  const handleNisKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleNisBlur()
    }
  }

  const openAdd = async () => {
    setEditingId(null)
    setForm({
      id_santri: '',
      nisInput: '',
      selectedSantriNama: '',
      diniyah: '',
      formal: '',
      tanggal_hijriyah: '',
      tahun_hijriyah: tahunAjaran,
      tahun_masehi: tahunAjaranMasehi,
      sudah_mengurusi: 1
    })
    setSelectedSantriDetail(null)
    setShowForm(true)
    // Isi Tanggal Hijriyah Boyong dari API kalender hari ini (tanggal/waktu lokal), format: dd mmmm yyyy
    try {
      const now = new Date()
      const y = now.getFullYear()
      const m = now.getMonth() + 1
      const d = now.getDate()
      const tanggal = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      const h = now.getHours()
      const min = now.getMinutes()
      const sec = now.getSeconds()
      const waktu = `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
      const res = await kalenderAPI.get({ action: 'today', tanggal, waktu })
      const hijriyah = res?.hijriyah ?? (Array.isArray(res) ? undefined : res?.data?.hijriyah)
      if (hijriyah && hijriyah !== '0000-00-00') {
        const parts = String(hijriyah).slice(0, 10).split('-').map(Number)
        const [yr, mo, day] = parts.length >= 3 ? [parts[0], parts[1], parts[2]] : [0, 0, 0]
        const bulanName = getBulanName(mo, 'hijriyah')
        const formatted = `${day} ${bulanName} ${yr}`
        setForm((prev) => ({ ...prev, tanggal_hijriyah: formatted }))
      }
    } catch (_) {}
  }

  const openEdit = (row) => {
    setEditingId(row.id)
    const detail =
      fullSantriList.find((s) => s.id === row.id_santri) ||
      santriOptions.find((s) => s.id === row.id_santri) ||
      null
    setSelectedSantriDetail(
      detail
        ? { ...detail, nama: detail.nama || row.santri_nama, ayah: detail.ayah, ibu: detail.ibu }
        : { nama: row.santri_nama, id: row.id_santri, nis: row.santri_nis }
    )
    setForm({
      id_santri: row.id_santri,
      nisInput: String(row.santri_nis ?? row.id_santri ?? ''),
      selectedSantriNama: row.santri_nama || '',
      diniyah: row.diniyah || '',
      formal: row.formal || '',
      tanggal_hijriyah: row.tanggal_hijriyah || '',
      tahun_hijriyah: row.tahun_hijriyah || tahunAjaran,
      tahun_masehi: row.tahun_masehi || tahunAjaranMasehi,
      sudah_mengurusi: Number(row.sudah_mengurusi) === 1 ? 1 : 0
    })
    setShowForm(true)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.id_santri) {
      alert('Pilih atau ketik NIS santri terlebih dahulu')
      return
    }
    setSaving(true)
    try {
      const basePayload = {
        id_santri: parseInt(form.id_santri, 10),
        diniyah: form.diniyah || null,
        formal: form.formal || null,
        tanggal_hijriyah: form.tanggal_hijriyah || null,
        tahun_hijriyah: form.tahun_hijriyah || null,
        tahun_masehi: form.tahun_masehi || null
      }
      const payload = editingId
        ? { ...basePayload, sudah_mengurusi: Number(form.sudah_mengurusi) === 1 ? 1 : 0 }
        : basePayload
      if (editingId) {
        const res = await boyongAPI.update(editingId, payload)
        if (res.success) {
          setList((prev) =>
            prev.map((row) =>
              row.id === editingId
                ? {
                    ...row,
                    diniyah: payload.diniyah,
                    formal: payload.formal,
                    tanggal_hijriyah: payload.tanggal_hijriyah,
                    tahun_hijriyah: payload.tahun_hijriyah,
                    tahun_masehi: payload.tahun_masehi,
                    sudah_mengurusi: payload.sudah_mengurusi,
                    santri_nama: form.selectedSantriNama
                  }
                : row
            )
          )
          // Offcanvas tetap terbuka, tidak reload
        } else {
          alert(res.message || 'Gagal update')
        }
      } else {
        const res = await boyongAPI.create(payload)
        if (res.success) {
          await loadBoyong()
          setShowForm(false)
        } else {
          alert(res.message || 'Gagal simpan')
        }
      }
    } catch (err) {
      alert(err.message || 'Terjadi kesalahan')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id) => {
    try {
      const res = await boyongAPI.delete(id)
      if (res.success) {
        await loadBoyong()
        setDeleteConfirm(null)
        setShowForm(false)
      } else {
        alert(res.message || 'Gagal hapus')
      }
    } catch (err) {
      alert(err.message || 'Terjadi kesalahan')
    }
  }

  if (loading) {
    return (
      <div className="h-full overflow-y-auto">
        <div className="p-4 sm:p-6 lg:p-8">
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600" />
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="h-full overflow-y-auto">
        <div className="p-4 sm:p-6 lg:p-8">
          <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg">
            {error}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-4 sm:p-6 lg:p-8">
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
        >
          {/* Search & Filter - sama gaya Data Ijin */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 mb-6">
            <div className="relative pb-2 px-4 pt-3">
              <div className="relative">
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onFocus={() => setIsInputFocused(true)}
                  onBlur={() => setIsInputFocused(false)}
                  className="w-full p-2 pr-24 focus:outline-none bg-transparent dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400"
                  placeholder="Cari NIS atau Nama santri..."
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
                  <button
                    onClick={loadBoyong}
                    className="bg-blue-100 hover:bg-blue-200 dark:bg-blue-700 dark:hover:bg-blue-600 text-blue-700 dark:text-blue-300 p-1.5 rounded text-xs transition-colors pointer-events-auto"
                    title="Refresh"
                    disabled={loading}
                  >
                    <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={openAdd}
                    className="bg-teal-600 hover:bg-teal-700 text-white p-1.5 rounded text-xs font-medium transition-colors pointer-events-auto flex items-center gap-1"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                    </svg>
                    Tambah Boyong
                  </button>
                </div>
              </div>
              <div className="absolute left-0 right-0 bottom-0 h-0.5 bg-gray-300 dark:bg-gray-600" />
              <div className={`absolute left-0 right-0 bottom-0 h-0.5 bg-teal-500 transition-opacity ${isInputFocused ? 'opacity-100' : 'opacity-0'}`} />
            </div>

            <AnimatePresence>
              {isFilterOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden border-b bg-gray-50 dark:bg-gray-700/50"
                >
                  <div className="px-4 py-2 flex flex-wrap gap-2">
                    <select
                      value={diniyahFilter}
                      onChange={(e) => setDiniyahFilter(e.target.value)}
                      className="border rounded p-1 h-7 min-w-0 text-xs bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 focus:ring-1 focus:ring-teal-400"
                    >
                      <option value="">Diniyah</option>
                      {uniqueDiniyah.map((item) => (
                        <option key={item.value} value={item.value}>{item.value} ({item.count})</option>
                      ))}
                    </select>
                    <select
                      value={formalFilter}
                      onChange={(e) => setFormalFilter(e.target.value)}
                      className="border rounded p-1 h-7 min-w-0 text-xs bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 focus:ring-1 focus:ring-teal-400"
                    >
                      <option value="">Formal</option>
                      {uniqueFormal.map((item) => (
                        <option key={item.value} value={item.value}>{item.value} ({item.count})</option>
                      ))}
                    </select>
                    <select
                      value={hijriyahFilter}
                      onChange={(e) => setHijriyahFilter(e.target.value)}
                      className="border rounded p-1 h-7 min-w-0 text-xs bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 focus:ring-1 focus:ring-teal-400"
                    >
                      <option value="">Hijriyah</option>
                      {uniqueHijriyah.map((item) => (
                        <option key={item.value} value={item.value}>{item.value} ({item.count})</option>
                      ))}
                    </select>
                    <select
                      value={adminFilter}
                      onChange={(e) => setAdminFilter(e.target.value)}
                      className="border rounded p-1 h-7 min-w-0 text-xs bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 focus:ring-1 focus:ring-teal-400"
                    >
                      <option value="">Admin</option>
                      {uniqueAdmin.map((item) => (
                        <option key={item.value} value={item.value}>{item.value} ({item.count})</option>
                      ))}
                    </select>
                    <select
                      value={tahunHijriyahFilter}
                      onChange={(e) => setTahunHijriyahFilter(e.target.value)}
                      className="border rounded p-1 h-7 min-w-0 text-xs bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 focus:ring-1 focus:ring-teal-400"
                    >
                      <option value="">Tahun Hijriyah</option>
                      {uniqueTahunHijriyah.map((item) => (
                        <option key={item.value} value={item.value}>{item.value} ({item.count})</option>
                      ))}
                    </select>
                    <select
                      value={tahunMasehiFilter}
                      onChange={(e) => setTahunMasehiFilter(e.target.value)}
                      className="border rounded p-1 h-7 min-w-0 text-xs bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 focus:ring-1 focus:ring-teal-400"
                    >
                      <option value="">Tahun Masehi</option>
                      {uniqueTahunMasehi.map((item) => (
                        <option key={item.value} value={item.value}>{item.value} ({item.count})</option>
                      ))}
                    </select>
                    {(diniyahFilter || formalFilter || hijriyahFilter || adminFilter || tahunHijriyahFilter || tahunMasehiFilter) && (
                      <button
                        type="button"
                        onClick={() => {
                          setDiniyahFilter('')
                          setFormalFilter('')
                          setHijriyahFilter('')
                          setAdminFilter('')
                          setTahunHijriyahFilter('')
                          setTahunMasehiFilter('')
                        }}
                        className="text-xs text-red-600 dark:text-red-400 hover:underline"
                      >
                        Hapus filter
                      </button>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Summary Card - Total & Boyong Tahun Ini */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4 mb-6">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-800 rounded-xl p-3 md:p-4"
            >
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] md:text-xs font-medium text-sky-700 dark:text-sky-300">
                  Total Data Boyong
                </p>
                <span className="inline-flex items-center justify-center rounded-full bg-sky-100 dark:bg-sky-900/40 text-sky-600 dark:text-sky-300 p-1">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                </span>
              </div>
              <p className="text-sm md:text-lg font-bold text-sky-700 dark:text-sky-200">{list.length}</p>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-800 rounded-xl p-3 md:p-4"
            >
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] md:text-xs font-medium text-teal-700 dark:text-teal-300">
                  Boyong Tahun Ini ({tahunAjaran})
                </p>
                <span className="inline-flex items-center justify-center rounded-full bg-teal-100 dark:bg-teal-900/40 text-teal-600 dark:text-teal-300 p-1">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </span>
              </div>
              <p className="text-sm md:text-lg font-bold text-teal-700 dark:text-teal-200">{boyongTahunIniCount}</p>
            </motion.div>
          </div>

          {/* Toolbar: Export */}
          <div className="flex justify-end mb-3">
            <button
              type="button"
              onClick={handleExportExcel}
              disabled={filteredAndSortedList.length === 0}
              className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Export Excel
            </button>
          </div>

          {/* Table - sortable seperti Data Ijin, tanpa tombol Edit/Hapus; klik baris buka offcanvas */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden border border-gray-200 dark:border-gray-700"
          >
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-700">
                  <tr>
                    <th
                      className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider whitespace-nowrap cursor-pointer select-none"
                      onClick={() => handleSort('santri_nis')}
                    >
                      <span className="inline-flex items-center gap-1">NIS <SortIcon columnKey="santri_nis" /></span>
                    </th>
                    <th
                      className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider whitespace-nowrap cursor-pointer select-none"
                      onClick={() => handleSort('santri_nama')}
                    >
                      <span className="inline-flex items-center gap-1">Nama <SortIcon columnKey="santri_nama" /></span>
                    </th>
                    <th
                      className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider whitespace-nowrap cursor-pointer select-none"
                      onClick={() => handleSort('diniyah')}
                    >
                      <span className="inline-flex items-center gap-1">Diniyah <SortIcon columnKey="diniyah" /></span>
                    </th>
                    <th
                      className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider whitespace-nowrap cursor-pointer select-none"
                      onClick={() => handleSort('formal')}
                    >
                      <span className="inline-flex items-center gap-1">Formal <SortIcon columnKey="formal" /></span>
                    </th>
                    <th
                      className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider whitespace-nowrap cursor-pointer select-none"
                      onClick={() => handleSort('tanggal_hijriyah')}
                    >
                      <span className="inline-flex items-center gap-1">Hijriyah <SortIcon columnKey="tanggal_hijriyah" /></span>
                    </th>
                    <th
                      className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider whitespace-nowrap cursor-pointer select-none"
                      onClick={() => handleSort('pengurus_nama')}
                    >
                      <span className="inline-flex items-center gap-1">Admin <SortIcon columnKey="pengurus_nama" /></span>
                    </th>
                    <th
                      className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider whitespace-nowrap cursor-pointer select-none"
                      onClick={() => handleSort('tahun_hijriyah')}
                    >
                      <span className="inline-flex items-center gap-1">Th. Hijriyah <SortIcon columnKey="tahun_hijriyah" /></span>
                    </th>
                    <th
                      className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider whitespace-nowrap cursor-pointer select-none"
                      onClick={() => handleSort('tahun_masehi')}
                    >
                      <span className="inline-flex items-center gap-1">Th. Masehi <SortIcon columnKey="tahun_masehi" /></span>
                    </th>
                    <th
                      className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider whitespace-nowrap cursor-pointer select-none"
                      onClick={() => handleSort('sudah_mengurusi')}
                      title="Surat/administrasi dari halaman ini"
                    >
                      <span className="inline-flex items-center gap-1">Mengurusi <SortIcon columnKey="sudah_mengurusi" /></span>
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {paginatedData.length === 0 ? (
                    <tr>
                      <td
                        colSpan={9}
                        className="px-4 py-8 text-center text-gray-500 dark:text-gray-400 text-sm"
                      >
                        {(searchTerm || diniyahFilter || formalFilter || hijriyahFilter || adminFilter || tahunHijriyahFilter || tahunMasehiFilter)
                          ? 'Tidak ada data yang sesuai pencarian/filter'
                          : 'Belum ada data boyong. Klik "Tambah Boyong" untuk menambah.'}
                      </td>
                    </tr>
                  ) : (
                    paginatedData.map((row) => (
                      <tr
                        key={row.id}
                        onClick={() => openEdit(row)}
                        className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors cursor-pointer"
                      >
                        <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-800 dark:text-gray-200">
                          {row.santri_nis ?? row.id_santri}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-800 dark:text-gray-200">
                          {row.santri_nama || '-'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">
                          {row.diniyah || '-'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">
                          {row.formal || '-'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">
                          {row.tanggal_hijriyah || '-'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">
                          {row.pengurus_nama || '-'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">
                          {row.tahun_hijriyah || '-'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">
                          {row.tahun_masehi || '-'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={Number(row.sudah_mengurusi) === 1}
                            onClick={(e) => handleToggleSudahMengurusi(e, row)}
                            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-1 dark:focus:ring-offset-gray-800 ${
                              Number(row.sudah_mengurusi) === 1 ? 'bg-teal-600' : 'bg-gray-300 dark:bg-gray-600'
                            }`}
                            title={Number(row.sudah_mengurusi) === 1 ? 'Sudah mengurusi' : 'Belum mengurusi'}
                          >
                            <span
                              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
                                Number(row.sudah_mengurusi) === 1 ? 'translate-x-5' : 'translate-x-0.5'
                              }`}
                            />
                          </button>
                          <span className="sr-only">
                            {Number(row.sudah_mengurusi) === 1 ? 'Sudah mengurusi' : 'Belum mengurusi'}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {filteredAndSortedList.length > 0 && (
              <div className="px-4 py-3 bg-gray-50 dark:bg-gray-700 border-t border-gray-200 dark:border-gray-600">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <p className="text-xs text-gray-600 dark:text-gray-400">
                      Menampilkan {startIndex + 1}-
                      {Math.min(endIndex, filteredAndSortedList.length)} dari {filteredAndSortedList.length} data
                      {searchTerm && ` (filter: "${searchTerm}")`}
                    </p>
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-gray-600 dark:text-gray-400 whitespace-nowrap">
                        Per halaman:
                      </label>
                      <select
                        value={itemsPerPage >= filteredAndSortedList.length ? 'all' : itemsPerPage}
                        onChange={(e) => {
                          const v = e.target.value
                          setItemsPerPage(v === 'all' ? filteredAndSortedList.length : Number(v))
                          setCurrentPage(1)
                        }}
                        className="px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:ring-1 focus:ring-teal-500"
                      >
                        <option value="25">25</option>
                        <option value="50">50</option>
                        <option value="100">100</option>
                        <option value="200">200</option>
                        <option value="all">Semua</option>
                      </select>
                    </div>
                  </div>
                  {totalPages > 1 && (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        className="px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
                        </svg>
                      </button>
                      <span className="text-xs text-gray-600 dark:text-gray-400">
                        Halaman {currentPage} / {totalPages}
                      </span>
                      <button
                        type="button"
                        onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                        className="px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                        </svg>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </motion.div>
        </motion.div>
      </div>

      {/* Form Offcanvas - dengan NIS + Cari Santri */}
      <AnimatePresence>
        {showForm && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowForm(false)}
              className="fixed inset-0 bg-black/40 z-40"
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'tween', duration: 0.25 }}
              className="fixed top-0 right-0 bottom-0 w-full max-w-md bg-white dark:bg-gray-800 shadow-xl z-50 overflow-y-auto"
            >
              <div className="p-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                <h2 className="text-base font-semibold text-teal-600 dark:text-teal-400 flex items-center gap-2">
                  {editingId ? (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                      Edit Boyong
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                      </svg>
                      Tambah Boyong
                    </>
                  )}
                </h2>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400 transition-colors"
                  aria-label="Tutup"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <form onSubmit={handleSubmit} className="p-4 space-y-4">
                {/* NIS + Cari Santri - sama tampilan UWABA (BiodataBox) */}
                <div className="flex-shrink-0 bg-gray-200 dark:bg-gray-700/50 p-2 rounded-lg border border-gray-300 dark:border-gray-600">
                  <div className="flex gap-1.5 items-center justify-between">
                    <div className="flex gap-1.5 items-center">
                      <label className="text-teal-600 dark:text-teal-400 font-semibold whitespace-nowrap text-sm">
                        NIS
                      </label>
                      <input
                        type="text"
                        value={form.nisInput}
                        onChange={(e) => {
                          setForm((f) => ({
                            ...f,
                            nisInput: e.target.value,
                            id_santri: '',
                            selectedSantriNama: ''
                          }))
                          setSelectedSantriDetail(null)
                        }}
                        onBlur={handleNisBlur}
                        onKeyDown={handleNisKeyDown}
                        placeholder="7 digit"
                        maxLength={7}
                        inputMode="numeric"
                        className={`w-20 min-w-[4.5rem] max-w-[5rem] p-1.5 text-sm border-2 rounded-lg focus:outline-none focus:ring-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-center ${
                          form.nisInput && !form.id_santri && form.nisInput.length === 7
                            ? 'border-red-300 dark:border-red-600 focus:border-red-500'
                            : 'border-teal-500 dark:border-teal-400 focus:border-teal-500 dark:focus:border-teal-400 focus:ring-teal-500'
                        }`}
                        disabled={!!editingId}
                      />
                      {!editingId && (
                        <button
                          type="button"
                          onClick={() => setIsSearchOpen(true)}
                          className="bg-teal-500 text-white p-1.5 rounded-lg hover:bg-teal-600 transition-colors flex-shrink-0 border-2 border-teal-500 dark:border-teal-400"
                          title="Cari Santri"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>
                  {form.nisInput && form.nisInput.length !== 7 && form.nisInput.length > 0 && (
                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">NIS 7 digit</p>
                  )}
                </div>

                {/* Tampilan santri terpilih: nama, ayah, ibu, alamat, diniyah kelas kel, formal kelas kel */}
                {selectedSantriDetail && (
                  <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 border border-gray-200 dark:border-gray-600 space-y-2 text-sm">
                    <p className="font-semibold text-gray-800 dark:text-gray-100">
                      {selectedSantriDetail.nama || '-'}
                    </p>
                    <p className="text-gray-700 dark:text-gray-300">
                      <span className="text-gray-500 dark:text-gray-400">Ayah:</span> {selectedSantriDetail.ayah || '-'}
                    </p>
                    <p className="text-gray-700 dark:text-gray-300">
                      <span className="text-gray-500 dark:text-gray-400">Ibu:</span> {selectedSantriDetail.ibu || '-'}
                    </p>
                    <p className="text-gray-700 dark:text-gray-300">
                      <span className="text-gray-500 dark:text-gray-400">Alamat:</span>{' '}
                      {[
                        selectedSantriDetail.dusun,
                        selectedSantriDetail.rt && selectedSantriDetail.rw
                          ? `RT ${selectedSantriDetail.rt}/RW ${selectedSantriDetail.rw}`
                          : null,
                        selectedSantriDetail.desa,
                        selectedSantriDetail.kecamatan,
                        selectedSantriDetail.kabupaten,
                        selectedSantriDetail.provinsi
                      ]
                        .filter(Boolean)
                        .join(', ') || '-'}
                    </p>
                    <p className="text-gray-700 dark:text-gray-300">
                      <span className="text-gray-500 dark:text-gray-400">Diniyah:</span>{' '}
                      {[selectedSantriDetail.diniyah, selectedSantriDetail.kelas_diniyah, selectedSantriDetail.kel_diniyah]
                        .filter(Boolean)
                        .join(' / ') || '-'}
                    </p>
                    <p className="text-gray-700 dark:text-gray-300">
                      <span className="text-gray-500 dark:text-gray-400">Formal:</span>{' '}
                      {[selectedSantriDetail.formal, selectedSantriDetail.kelas_formal, selectedSantriDetail.kel_formal]
                        .filter(Boolean)
                        .join(' / ') || '-'}
                    </p>
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Diniyah Terakhir
                  </label>
                  <input
                    type="text"
                    value={form.diniyah}
                    onChange={(e) => setForm((f) => ({ ...f, diniyah: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    placeholder="Contoh: MA 3"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Formal Terakhir
                  </label>
                  <input
                    type="text"
                    value={form.formal}
                    onChange={(e) => setForm((f) => ({ ...f, formal: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    placeholder="Contoh: SMA 3"
                  />
                </div>
                <div>
                  <span className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-0.5">
                    Tanggal Hijriyah Boyong
                  </span>
                  <p className="text-gray-800 dark:text-gray-200 font-medium">
                    {form.tanggal_hijriyah || '-'}
                  </p>
                </div>
                <div>
                  <span className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-0.5">
                    Tahun Ajaran (Hijriyah)
                  </span>
                  <p className="text-gray-800 dark:text-gray-200 font-medium">
                    {options.find((o) => o.value === form.tahun_hijriyah)?.label || form.tahun_hijriyah || '-'}
                  </p>
                </div>
                <div>
                  <span className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-0.5">
                    Tahun Ajaran (Masehi)
                  </span>
                  <p className="text-gray-800 dark:text-gray-200 font-medium">
                    {optionsMasehi.find((o) => o.value === form.tahun_masehi)?.label || form.tahun_masehi || '-'}
                  </p>
                </div>
                <div>
                  <span className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">
                    Sudah mengurusi (surat / administrasi)
                  </span>
                  {editingId ? (
                    <button
                      type="button"
                      role="switch"
                      aria-checked={Number(form.sudah_mengurusi) === 1}
                      onClick={() =>
                        setForm((f) => ({
                          ...f,
                          sudah_mengurusi: Number(f.sudah_mengurusi) === 1 ? 0 : 1
                        }))
                      }
                      className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-teal-500 ${
                        Number(form.sudah_mengurusi) === 1 ? 'bg-teal-600' : 'bg-gray-300 dark:bg-gray-600'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow transition ${
                          Number(form.sudah_mengurusi) === 1 ? 'translate-x-5' : 'translate-x-0.5'
                        }`}
                      />
                    </button>
                  ) : (
                    <p className="text-sm text-gray-700 dark:text-gray-300">Ya (otomatis untuk entri dari halaman ini)</p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2 pt-4">
                  <button
                    type="submit"
                    disabled={saving || !form.id_santri}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white rounded-lg font-medium transition-colors"
                  >
                    {saving ? (
                      <>
                        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="32" strokeDashoffset="12" strokeLinecap="round" />
                        </svg>
                        Simpan...
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                        </svg>
                        {editingId ? 'Update' : 'Simpan'}
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowForm(false)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    Batal
                  </button>
                  {editingId && (
                    <button
                      type="button"
                      onClick={() => setDeleteConfirm({ id: editingId, santri_nama: form.selectedSantriNama })}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                      Hapus
                    </button>
                  )}
                  {selectedSantriDetail && (
                    <button
                      type="button"
                      onClick={() => setShowPrintBoyongOffcanvas(true)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-teal-500 hover:bg-teal-600 text-white rounded-lg transition-colors"
                      title="Print Surat Boyong"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                      </svg>
                      Print
                    </button>
                  )}
                </div>
              </form>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Search Offcanvas - sama dengan UWABA */}
      {createPortal(
        <SearchOffcanvas
          isOpen={isSearchOpen}
          onClose={() => setIsSearchOpen(false)}
          onSelectSantri={handleSelectSantriFromSearch}
        />,
        document.body
      )}

      {/* Print Surat Boyong Offcanvas (bawah) - nomor dari backend (nomor_surat) saat edit, atau dibangun dari form saat tambah */}
      <PrintBoyongOffcanvas
        isOpen={showPrintBoyongOffcanvas}
        onClose={() => setShowPrintBoyongOffcanvas(false)}
        data={{
          nama: selectedSantriDetail?.nama || form.selectedSantriNama || '',
          ayah: selectedSantriDetail?.ayah || '',
          formal: form.formal || '',
          tanggal_hijriyah: form.tanggal_hijriyah || '',
          nomor: (() => {
            if (editingId) {
              const row = list.find((r) => r.id === editingId)
              return row?.nomor_surat ?? ''
            }
            const th = (form.tanggal_hijriyah || '').trim()
            if (!th) return ''
            const match = th.match(/^\d+\s+(.+?)\s+(\d{4})$/)
            if (!match) return ''
            const [, monthName, year] = match
            const bulan = BULAN_HIJRI.find((b) => b.hijriyah && String(b.hijriyah).toLowerCase() === String(monthName).trim().toLowerCase())
            const bulanNum = bulan ? String(bulan.id).padStart(2, '0') : '00'
            return `–/SKU/RKM/${bulanNum}.${year}`
          })()
        }}
      />

      {/* Delete confirm modal */}
      <AnimatePresence>
        {deleteConfirm && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDeleteConfirm(null)}
              className="fixed inset-0 bg-black/40 z-40"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-sm bg-white dark:bg-gray-800 rounded-xl shadow-xl z-50 p-4"
            >
              <p className="text-gray-700 dark:text-gray-300 text-sm mb-4">
                Hapus data boyong santri <strong>{deleteConfirm.santri_nama || deleteConfirm.id_santri}</strong>?
              </p>
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setDeleteConfirm(null)}
                  className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(deleteConfirm.id)}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg"
                >
                  Hapus
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}

export default DataBoyong
