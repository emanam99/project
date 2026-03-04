import { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { pendaftaranAPI, lembagaAPI } from '../../services/api'
import { useTahunAjaranStore } from '../../store/tahunAjaranStore'
import { useAuthStore } from '../../store/authStore'
import { useNotification } from '../../contexts/NotificationContext'
import ExportPendaftarOffcanvas from './components/ExportPendaftarOffcanvas'
import BulkEditPendaftarOffcanvas from './components/BulkEditPendaftarOffcanvas'

function DataPendaftar() {
  const navigate = useNavigate()
  const { showNotification } = useNotification()
  const { tahunAjaran, tahunAjaranMasehi } = useTahunAjaranStore()
  const { user } = useAuthStore()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [pendaftarList, setPendaftarList] = useState([])
  const [filteredList, setFilteredList] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(50)
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [isInputFocused, setIsInputFocused] = useState(false)
  const [statusPendaftarFilter, setStatusPendaftarFilter] = useState('')
  const [formalFilter, setFormalFilter] = useState('')
  const [diniyahFilter, setDiniyahFilter] = useState('')
  const [keteranganStatusFilter, setKeteranganStatusFilter] = useState('')
  const [gelombangFilter, setGelombangFilter] = useState('')
  const [statusSantriFilter, setStatusSantriFilter] = useState('')
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' })
  const [userLembaga, setUserLembaga] = useState(null)
  const [loadingLembaga, setLoadingLembaga] = useState(false)
  const [selectedPendaftar, setSelectedPendaftar] = useState(null)
  const [isDetailOffcanvasOpen, setIsDetailOffcanvasOpen] = useState(false)
  const [verifikasiLoading, setVerifikasiLoading] = useState(false)
  const [isExportOffcanvasOpen, setIsExportOffcanvasOpen] = useState(false)
  const [selectedItems, setSelectedItems] = useState(new Set())
  const [showBulkEditOffcanvas, setShowBulkEditOffcanvas] = useState(false)

  // Cek apakah user adalah super_admin
  const isSuperAdmin = user?.role_key === 'super_admin' || user?.all_roles?.includes('super_admin')
  
  // Cek apakah user adalah admin_PSB atau petugas_PSB
  const isPsbUser = user?.role_key === 'admin_psb' || user?.role_key === 'petugas_psb' || 
                    user?.all_roles?.includes('admin_psb') || user?.all_roles?.includes('petugas_psb')
  
  // Cek apakah kategori lembaga user adalah Pesantren (bisa akses semua seperti super_admin)
  const isPesantrenUser = userLembaga?.kategori === 'Pesantren'
  
  // User dengan akses penuh (super_admin atau kategori Pesantren)
  const hasFullAccess = isSuperAdmin || isPesantrenUser

  // Load lembaga data untuk user
  useEffect(() => {
    if (isPsbUser && user?.lembaga_id) {
      loadUserLembaga()
    }
  }, [isPsbUser, user?.lembaga_id])

  // Set default filter berdasarkan kategori lembaga (hanya sekali saat userLembaga pertama kali dimuat)
  // Kategori Pesantren tidak perlu default filter (bisa akses semua)
  useEffect(() => {
    if (userLembaga && !hasFullAccess && !formalFilter && !diniyahFilter) {
      if (userLembaga.kategori === 'Formal' && userLembaga.id) {
        // Jika kategori formal, set default filter formal sesuai lembaga
        setFormalFilter(userLembaga.id)
      } else if (userLembaga.kategori === 'Diniyah' && userLembaga.id) {
        // Jika kategori diniyah, set default filter diniyah sesuai lembaga
        setDiniyahFilter(userLembaga.id)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userLembaga]) // Hanya trigger saat userLembaga berubah (ignore formalFilter dan diniyahFilter untuk avoid loop)

  useEffect(() => {
    loadPendaftarData()
  }, [tahunAjaran, tahunAjaranMasehi])

  const loadUserLembaga = async () => {
    if (!user?.lembaga_id) return
    
    setLoadingLembaga(true)
    try {
      const result = await lembagaAPI.getById(user.lembaga_id)
      if (result.success && result.data) {
        setUserLembaga(result.data)
      }
    } catch (err) {
      console.error('Error loading user lembaga:', err)
    } finally {
      setLoadingLembaga(false)
    }
  }

  // Dynamic unique values untuk filter (dengan count)
  // Filter berdasarkan role dan kategori lembaga
  const dynamicUniqueStatusPendaftar = useMemo(() => {
    if (!hasFullAccess) return [] // Hanya super_admin atau kategori Pesantren yang bisa filter status pendaftar
    
    const values = [...new Set(pendaftarList.map(p => p.status_pendaftar).filter(Boolean))]
    const counts = values.map(val => ({
      value: val,
      count: pendaftarList.filter(p => p.status_pendaftar === val).length
    }))
    return counts.sort((a, b) => (a.value || '').localeCompare(b.value || ''))
  }, [pendaftarList, hasFullAccess])

  const dynamicUniqueFormal = useMemo(() => {
    // Jika bukan super_admin/pesantren dan kategori lembaga bukan formal, return empty
    if (!hasFullAccess && userLembaga?.kategori !== 'Formal') {
      return []
    }
    
    let filtered = pendaftarList
    if (statusPendaftarFilter && hasFullAccess) filtered = filtered.filter(p => p.status_pendaftar === statusPendaftarFilter)
    if (diniyahFilter) filtered = filtered.filter(p => p.diniyah === diniyahFilter)
    if (keteranganStatusFilter) filtered = filtered.filter(p => p.keterangan_status === keteranganStatusFilter)
    if (gelombangFilter) filtered = filtered.filter(p => (p.gelombang != null && p.gelombang !== '') ? String(p.gelombang) === gelombangFilter : false)
    if (statusSantriFilter) filtered = filtered.filter(p => (p.status_santri || '') === statusSantriFilter)
    
    // Jika bukan super_admin/pesantren, filter hanya sesuai lembaga user
    if (!hasFullAccess && userLembaga?.kategori === 'Formal' && userLembaga?.id) {
      filtered = filtered.filter(p => p.formal === userLembaga.id)
    }
    
    const values = [...new Set(filtered.map(p => p.formal).filter(Boolean))]
    const counts = values.map(val => ({
      value: val,
      count: filtered.filter(p => p.formal === val).length
    }))
    return counts.sort((a, b) => (a.value || '').localeCompare(b.value || ''))
  }, [pendaftarList, statusPendaftarFilter, diniyahFilter, keteranganStatusFilter, gelombangFilter, statusSantriFilter, hasFullAccess, userLembaga])

  const dynamicUniqueDiniyah = useMemo(() => {
    // Jika bukan super_admin/pesantren dan kategori lembaga bukan diniyah, return empty
    if (!hasFullAccess && userLembaga?.kategori !== 'Diniyah') {
      return []
    }
    
    let filtered = pendaftarList
    if (statusPendaftarFilter && hasFullAccess) filtered = filtered.filter(p => p.status_pendaftar === statusPendaftarFilter)
    if (formalFilter) filtered = filtered.filter(p => p.formal === formalFilter)
    if (keteranganStatusFilter) filtered = filtered.filter(p => p.keterangan_status === keteranganStatusFilter)
    if (gelombangFilter) filtered = filtered.filter(p => (p.gelombang != null && p.gelombang !== '') ? String(p.gelombang) === gelombangFilter : false)
    if (statusSantriFilter) filtered = filtered.filter(p => (p.status_santri || '') === statusSantriFilter)
    
    // Jika bukan super_admin/pesantren, filter hanya sesuai lembaga user
    if (!hasFullAccess && userLembaga?.kategori === 'Diniyah' && userLembaga?.id) {
      filtered = filtered.filter(p => p.diniyah === userLembaga.id)
    }
    
    const values = [...new Set(filtered.map(p => p.diniyah).filter(Boolean))]
    const counts = values.map(val => ({
      value: val,
      count: filtered.filter(p => p.diniyah === val).length
    }))
    return counts.sort((a, b) => (a.value || '').localeCompare(b.value || ''))
  }, [pendaftarList, statusPendaftarFilter, formalFilter, keteranganStatusFilter, gelombangFilter, statusSantriFilter, hasFullAccess, userLembaga])

  const dynamicUniqueKeteranganStatus = useMemo(() => {
    let filtered = pendaftarList
    
    // Apply existing filters
    if (statusPendaftarFilter && hasFullAccess) filtered = filtered.filter(p => p.status_pendaftar === statusPendaftarFilter)
    if (formalFilter) filtered = filtered.filter(p => p.formal === formalFilter)
    if (diniyahFilter) filtered = filtered.filter(p => p.diniyah === diniyahFilter)
    if (gelombangFilter) filtered = filtered.filter(p => (p.gelombang || '') === gelombangFilter)
    if (statusSantriFilter) filtered = filtered.filter(p => (p.status_santri || '') === statusSantriFilter)
    
    // Filter by lembaga if not full access
    if (!hasFullAccess) {
      if (userLembaga?.kategori === 'Formal' && userLembaga?.id) {
        filtered = filtered.filter(p => p.formal === userLembaga.id)
      } else if (userLembaga?.kategori === 'Diniyah' && userLembaga?.id) {
        filtered = filtered.filter(p => p.diniyah === userLembaga.id)
      }
    }
    
    const values = [...new Set(filtered.map(p => p.keterangan_status).filter(Boolean))]
    const counts = values.map(val => ({
      value: val,
      count: filtered.filter(p => p.keterangan_status === val).length
    }))
    return counts.sort((a, b) => (a.value || '').localeCompare(b.value || ''))
  }, [pendaftarList, statusPendaftarFilter, formalFilter, diniyahFilter, gelombangFilter, statusSantriFilter, hasFullAccess, userLembaga])

  const dynamicUniqueGelombang = useMemo(() => {
    let filtered = pendaftarList
    if (statusPendaftarFilter && hasFullAccess) filtered = filtered.filter(p => p.status_pendaftar === statusPendaftarFilter)
    if (formalFilter) filtered = filtered.filter(p => p.formal === formalFilter)
    if (diniyahFilter) filtered = filtered.filter(p => p.diniyah === diniyahFilter)
    if (keteranganStatusFilter) filtered = filtered.filter(p => p.keterangan_status === keteranganStatusFilter)
    if (statusSantriFilter) filtered = filtered.filter(p => (p.status_santri || '') === statusSantriFilter)
    if (!hasFullAccess) {
      if (userLembaga?.kategori === 'Formal' && userLembaga?.id) {
        filtered = filtered.filter(p => p.formal === userLembaga.id)
      } else if (userLembaga?.kategori === 'Diniyah' && userLembaga?.id) {
        filtered = filtered.filter(p => p.diniyah === userLembaga.id)
      }
    }
    const values = [...new Set(filtered.map(p => (p.gelombang != null && p.gelombang !== '') ? String(p.gelombang) : null).filter(Boolean))]
    const counts = values.map(val => ({
      value: val,
      count: filtered.filter(p => (p.gelombang != null && p.gelombang !== '') ? String(p.gelombang) === val : false).length
    }))
    return counts.sort((a, b) => (a.value || '').localeCompare(b.value || ''))
  }, [pendaftarList, statusPendaftarFilter, formalFilter, diniyahFilter, keteranganStatusFilter, statusSantriFilter, hasFullAccess, userLembaga])

  const dynamicUniqueStatusSantri = useMemo(() => {
    let filtered = pendaftarList
    if (statusPendaftarFilter && hasFullAccess) filtered = filtered.filter(p => p.status_pendaftar === statusPendaftarFilter)
    if (formalFilter) filtered = filtered.filter(p => p.formal === formalFilter)
    if (diniyahFilter) filtered = filtered.filter(p => p.diniyah === diniyahFilter)
    if (keteranganStatusFilter) filtered = filtered.filter(p => p.keterangan_status === keteranganStatusFilter)
    if (gelombangFilter) filtered = filtered.filter(p => (p.gelombang != null && p.gelombang !== '') ? String(p.gelombang) === gelombangFilter : false)
    if (!hasFullAccess) {
      if (userLembaga?.kategori === 'Formal' && userLembaga?.id) {
        filtered = filtered.filter(p => p.formal === userLembaga.id)
      } else if (userLembaga?.kategori === 'Diniyah' && userLembaga?.id) {
        filtered = filtered.filter(p => p.diniyah === userLembaga.id)
      }
    }
    const values = [...new Set(filtered.map(p => (p.status_santri != null && p.status_santri !== '') ? String(p.status_santri) : null).filter(Boolean))]
    const counts = values.map(val => ({
      value: val,
      count: filtered.filter(p => (p.status_santri || '') === val).length
    }))
    return counts.sort((a, b) => (a.value || '').localeCompare(b.value || ''))
  }, [pendaftarList, statusPendaftarFilter, formalFilter, diniyahFilter, keteranganStatusFilter, gelombangFilter, hasFullAccess, userLembaga])

  // Filter data berdasarkan search query dan filter lainnya
  useEffect(() => {
    let filtered = pendaftarList

    // Filter by status pendaftar (hanya untuk super_admin atau kategori Pesantren)
    if (statusPendaftarFilter && hasFullAccess) {
      filtered = filtered.filter(p => p.status_pendaftar === statusPendaftarFilter)
    }

    // Filter by formal
    if (formalFilter) {
      filtered = filtered.filter(p => p.formal === formalFilter)
    } else if (!hasFullAccess && userLembaga?.kategori === 'Formal' && userLembaga?.id) {
      // Jika kategori formal dan belum ada filter formal, filter otomatis sesuai lembaga
      filtered = filtered.filter(p => p.formal === userLembaga.id)
    }

    // Filter by diniyah
    if (diniyahFilter) {
      filtered = filtered.filter(p => p.diniyah === diniyahFilter)
    } else if (!hasFullAccess && userLembaga?.kategori === 'Diniyah' && userLembaga?.id) {
      // Jika kategori diniyah dan belum ada filter diniyah, filter otomatis sesuai lembaga
      filtered = filtered.filter(p => p.diniyah === userLembaga.id)
    }

    // Filter by keterangan status
    if (keteranganStatusFilter) {
      filtered = filtered.filter(p => p.keterangan_status === keteranganStatusFilter)
    }

    // Filter by gelombang
    if (gelombangFilter) {
      filtered = filtered.filter(p => (p.gelombang != null && p.gelombang !== '') ? String(p.gelombang) === gelombangFilter : false)
    }

    // Filter by status santri
    if (statusSantriFilter) {
      filtered = filtered.filter(p => (p.status_santri || '') === statusSantriFilter)
    }

    // Validasi: Non super_admin/pesantren harus punya minimal 1 filter aktif
    // Jika tidak ada filter sama sekali, tampilkan kosong
    if (!hasFullAccess) {
      const hasActiveFilter = formalFilter || diniyahFilter || 
        (userLembaga?.kategori === 'Formal' && userLembaga?.id) ||
        (userLembaga?.kategori === 'Diniyah' && userLembaga?.id)
      if (!hasActiveFilter) {
        filtered = []
      }
    }

    // Filter by search query
    if (searchQuery.trim() !== '') {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(pendaftar => 
        pendaftar.nama.toLowerCase().includes(query) ||
        (pendaftar.nis ?? pendaftar.id).toString().includes(query) ||
        (pendaftar.nik && pendaftar.nik.toString().includes(query))
      )
    }

    // Sort: hanya jika user memilih sort per kolom; default tetap urutan API (id psb___registrasi DESC)
    if (sortConfig.key) {
      filtered = [...filtered].sort((a, b) => {
        const aVal = a[sortConfig.key]
        const bVal = b[sortConfig.key]
        
        // Handle null/undefined values
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
  }, [searchQuery, pendaftarList, statusPendaftarFilter, formalFilter, diniyahFilter, keteranganStatusFilter, gelombangFilter, statusSantriFilter, sortConfig, isSuperAdmin, userLembaga])

  const loadPendaftarData = async () => {
    setLoading(true)
    setError('')
    
    try {
      // Gunakan tahun ajaran langsung dari store (header)
      const result = await pendaftaranAPI.getAllPendaftar(tahunAjaran, tahunAjaranMasehi)
      
      if (result.success) {
        setPendaftarList(result.data || [])
        setFilteredList(result.data || [])
        setCurrentPage(1) // Reset ke halaman 1 saat data baru dimuat
      } else {
        setError(result.message || 'Gagal memuat data pendaftar')
      }
    } catch (err) {
      console.error('Error loading pendaftar data:', err)
      setError(err.message || 'Terjadi kesalahan saat memuat data')
    } finally {
      setLoading(false)
    }
  }

  const handlePendaftarClick = (pendaftar) => {
    setSelectedPendaftar(pendaftar)
    setIsDetailOffcanvasOpen(true)
  }

  const handleCloseDetailOffcanvas = () => {
    setIsDetailOffcanvasOpen(false)
    setSelectedPendaftar(null)
  }

  const handleEditClick = () => {
    if (!selectedPendaftar?.id) return
    // Halaman Pendaftaran memuat santri berdasarkan NIS di URL (param "nis", bukan "id"). Kirim NIS 7 digit.
    const nisForUrl = (selectedPendaftar.nis != null && selectedPendaftar.nis !== '')
      ? String(selectedPendaftar.nis)
      : String(selectedPendaftar.id).padStart(7, '0')
    handleCloseDetailOffcanvas()
    navigate(`/pendaftaran?nis=${encodeURIComponent(nisForUrl)}`)
  }

  // Tombol Verifikasi selalu muncul kecuali sudah verifikasi atau Aktif
  const showVerifikasiButton = (keterangan) => {
    if (!keterangan) return true
    const sudahVerifikasiAtauAktif = ['Sudah Diverivikasi', 'Sudah Diverifikasi', 'Aktif'].includes(keterangan)
    return !sudahVerifikasiAtauAktif
  }

  const handleVerifikasiClick = async () => {
    if (!selectedPendaftar?.id) return
    setVerifikasiLoading(true)
    try {
      const result = await pendaftaranAPI.updateKeteranganStatus({
        id_santri: selectedPendaftar.id,
        keterangan_status: 'Sudah Diverifikasi',
        tahun_hijriyah: selectedPendaftar.tahun_hijriyah || tahunAjaran,
        tahun_masehi: selectedPendaftar.tahun_masehi || tahunAjaranMasehi
      })
      if (result?.success) {
        showNotification('Status berhasil diverifikasi', 'success')
        setSelectedPendaftar(prev => prev ? { ...prev, keterangan_status: 'Sudah Diverifikasi' } : null)
        loadPendaftarData()
      } else {
        showNotification(result?.message || 'Gagal update status', 'error')
      }
    } catch (err) {
      showNotification(err?.response?.data?.message || 'Gagal verifikasi', 'error')
    } finally {
      setVerifikasiLoading(false)
    }
  }

  // Calculate pagination
  const totalPages = Math.ceil(filteredList.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const paginatedList = filteredList.slice(startIndex, endIndex)

  const handlePageChange = (page) => {
    setCurrentPage(page)
    // Scroll to top of table
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleItemsPerPageChange = (value) => {
    const newItemsPerPage = value === 'all' ? filteredList.length : Number(value)
    setItemsPerPage(newItemsPerPage)
    setCurrentPage(1)
  }

  // Handle sort
  const handleSort = (key) => {
    let direction = 'asc'
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc'
    }
    setSortConfig({ key, direction })
  }

  // Reset to page 1 when search, filters, sort, or itemsPerPage changes
  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery, statusPendaftarFilter, formalFilter, diniyahFilter, keteranganStatusFilter, gelombangFilter, statusSantriFilter, sortConfig, itemsPerPage])

  const handleToggleSelect = (idRegistrasi) => {
    setSelectedItems(prev => {
      const next = new Set(prev)
      if (next.has(idRegistrasi)) next.delete(idRegistrasi)
      else next.add(idRegistrasi)
      return next
    })
  }

  const handleToggleSelectAll = () => {
    if (paginatedList.length > 0 && paginatedList.every(p => selectedItems.has(p.id_registrasi))) {
      const next = new Set(selectedItems)
      paginatedList.forEach(p => next.delete(p.id_registrasi))
      setSelectedItems(next)
    } else {
      const next = new Set(selectedItems)
      paginatedList.forEach(p => next.add(p.id_registrasi))
      setSelectedItems(next)
    }
  }

  const isAllPageSelected = paginatedList.length > 0 && paginatedList.every(p => selectedItems.has(p.id_registrasi))
  const isSomePageSelected = paginatedList.some(p => selectedItems.has(p.id_registrasi))

  // Sort Icon Component
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

  // Keterangan bayar: Lunas / Belum / Kurang Rp x
  const getKeteranganBayar = (row) => {
    if (!row) return '-'
    const wajib = row.wajib != null ? Number(row.wajib) : 0
    const bayar = row.bayar != null ? Number(row.bayar) : 0
    const kurang = row.kurang != null ? Number(row.kurang) : Math.max(0, wajib - bayar)
    if (wajib <= 0) return '-'
    if (bayar >= wajib) return 'Lunas'
    if (bayar <= 0) return 'Belum'
    return `Kurang Rp ${Math.round(kurang).toLocaleString('id-ID')}`
  }

  // Fungsi untuk mendapatkan warna badge berdasarkan keterangan_status
  const getKeteranganStatusBadgeColor = (keteranganStatus) => {
    if (!keteranganStatus || keteranganStatus === '-') {
      return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
    }
    
    switch (keteranganStatus) {
      case 'Belum Upload':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
      case 'Belum Bayar':
        return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
      case 'Belum Diverifikasi':
      case 'Menunggu Verifikasi':
        return 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400'
      case 'Sudah Diverifikasi':
        return 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400'
      case 'Melengkapi Data':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
      case 'Upload Berkas':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'
      case 'Belum Aktif':
        return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
      case 'Aktif':
        return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400'
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
    }
  }

  // Format tanggal/waktu dari tabel psb___registrasi untuk tampilan
  const formatTanggalWaktu = (value) => {
    if (!value) return '-'
    try {
      const d = new Date(value)
      if (Number.isNaN(d.getTime())) return '-'
      return d.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })
    } catch {
      return '-'
    }
  }

  if (loading) {
    return (
      <div className="h-full overflow-hidden" style={{ minHeight: 0 }}>
        <div className="h-full overflow-y-auto" style={{ minHeight: 0 }}>
          <div className="p-4 sm:p-6 lg:p-8">
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600"></div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="h-full overflow-hidden" style={{ minHeight: 0 }}>
        <div className="h-full overflow-y-auto" style={{ minHeight: 0 }}>
          <div className="p-4 sm:p-6 lg:p-8">
            <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg">
              {error}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-hidden" style={{ minHeight: 0 }}>
      <div className="h-full overflow-y-auto" style={{ minHeight: 0 }}>
        <div className="p-4 sm:p-6 lg:p-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            {/* Header */}
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
                Data Pendaftar
              </h1>
              
              {/* Search & Filter */}
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden">
                {/* Search Input dengan tombol di kanan */}
                <div className="relative pb-2 px-4 pt-3">
                  <div className="relative">
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onFocus={() => setIsInputFocused(true)}
                      onBlur={() => setIsInputFocused(false)}
                      className="w-full p-2 pr-28 focus:outline-none bg-transparent dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400"
                      placeholder="Cari berdasarkan nama, ID, atau NIK..."
                    />
                    {/* Tombol Filter, Export, dan Refresh di kanan */}
                    <div className="absolute right-0 top-0 bottom-0 flex items-center gap-1 pr-1 pointer-events-none">
                      <button
                        onClick={() => setIsFilterOpen(!isFilterOpen)}
                        className="bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 p-1.5 rounded text-xs flex items-center gap-1 transition-colors pointer-events-auto"
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
                        onClick={loadPendaftarData}
                        className="bg-blue-100 hover:bg-blue-200 dark:bg-blue-700 dark:hover:bg-blue-600 text-blue-700 dark:text-blue-300 p-1.5 rounded text-xs transition-colors pointer-events-auto"
                        title="Refresh"
                        disabled={loading}
                      >
                        <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
                        </svg>
                      </button>
                    </div>
                  </div>
                  {/* Border bawah yang sampai ke kanan */}
                  <div className="absolute left-0 right-0 bottom-0 h-0.5 bg-gray-300 dark:bg-gray-600"></div>
                  <div className={`absolute left-0 right-0 bottom-0 h-0.5 bg-teal-500 transition-opacity ${isInputFocused ? 'opacity-100' : 'opacity-0'}`}></div>
                </div>

                {/* Filter Container dengan Accordion */}
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
                          {/* Status Pendaftar - hanya untuk super_admin atau kategori Pesantren */}
                          {hasFullAccess && (
                            <select
                              value={statusPendaftarFilter}
                              onChange={(e) => setStatusPendaftarFilter(e.target.value)}
                              className="border rounded p-1 h-7 min-w-0 text-xs bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 focus:ring-1 focus:ring-teal-400"
                            >
                              <option value="">Status Pendaftar</option>
                              {dynamicUniqueStatusPendaftar.map(item => (
                                <option key={item.value} value={item.value}>{item.value} ({item.count})</option>
                              ))}
                            </select>
                          )}
                          
                          {/* Formal - untuk super_admin/pesantren atau user dengan kategori formal */}
                          {(hasFullAccess || userLembaga?.kategori === 'Formal') && (
                            <select
                              value={formalFilter}
                              onChange={(e) => setFormalFilter(e.target.value)}
                              className="border rounded p-1 h-7 min-w-0 text-xs bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 focus:ring-1 focus:ring-teal-400"
                            >
                              {hasFullAccess && <option value="">Formal</option>}
                              {dynamicUniqueFormal.map(item => (
                                <option key={item.value} value={item.value}>{item.value} ({item.count})</option>
                              ))}
                            </select>
                          )}
                          
                          {/* Diniyah - untuk super_admin/pesantren atau user dengan kategori diniyah */}
                          {(hasFullAccess || userLembaga?.kategori === 'Diniyah') && (
                            <select
                              value={diniyahFilter}
                              onChange={(e) => setDiniyahFilter(e.target.value)}
                              className="border rounded p-1 h-7 min-w-0 text-xs bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 focus:ring-1 focus:ring-teal-400"
                            >
                              {hasFullAccess && <option value="">Diniyah</option>}
                              {dynamicUniqueDiniyah.map(item => (
                                <option key={item.value} value={item.value}>{item.value} ({item.count})</option>
                              ))}
                            </select>
                          )}
                          
                          {/* Keterangan Status - untuk semua user */}
                          <select
                            value={keteranganStatusFilter}
                            onChange={(e) => setKeteranganStatusFilter(e.target.value)}
                            className="border rounded p-1 h-7 min-w-0 text-xs bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 focus:ring-1 focus:ring-teal-400"
                          >
                            <option value="">Keterangan Status</option>
                            {dynamicUniqueKeteranganStatus.map(item => (
                              <option key={item.value} value={item.value}>{item.value} ({item.count})</option>
                            ))}
                          </select>
                          {/* Gelombang */}
                          <select
                            value={gelombangFilter}
                            onChange={(e) => setGelombangFilter(e.target.value)}
                            className="border rounded p-1 h-7 min-w-0 text-xs bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 focus:ring-1 focus:ring-teal-400"
                          >
                            <option value="">Gelombang</option>
                            {dynamicUniqueGelombang.map(item => (
                              <option key={item.value} value={item.value}>{item.value} ({item.count})</option>
                            ))}
                          </select>
                          {/* Status Santri */}
                          <select
                            value={statusSantriFilter}
                            onChange={(e) => setStatusSantriFilter(e.target.value)}
                            className="border rounded p-1 h-7 min-w-0 text-xs bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 focus:ring-1 focus:ring-teal-400"
                          >
                            <option value="">Status Santri</option>
                            {dynamicUniqueStatusSantri.map(item => (
                              <option key={item.value} value={item.value}>{item.value} ({item.count})</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* List Pendaftar */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden">
              <div className="px-4 sm:px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                    Daftar Pendaftar ({filteredList.length})
                  </h2>
                  
                  {/* Export (selalu tampil) + Ubah Massal + Items per page */}
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setIsExportOffcanvasOpen(true)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-green-600 hover:bg-green-700 text-white rounded transition-colors"
                      title={selectedItems.size > 0 ? `Eksport ${selectedItems.size} baris yang ditandai` : 'Eksport data'}
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      Eksport
                    </button>
                    {selectedItems.size > 0 && (
                      <>
                        <button
                          type="button"
                          onClick={() => setShowBulkEditOffcanvas(true)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-teal-600 hover:bg-teal-700 text-white rounded transition-colors"
                          title="Ubah massal data terpilih"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                          Ubah Massal ({selectedItems.size})
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelectedItems(new Set())}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-gray-600 hover:bg-gray-700 text-white rounded transition-colors"
                          title="Hapus semua pilihan"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                          Hapus
                        </button>
                      </>
                    )}
                    <label className="text-sm text-gray-700 dark:text-gray-300">
                      Tampilkan:
                    </label>
                    <select
                      value={itemsPerPage >= filteredList.length ? 'all' : itemsPerPage}
                      onChange={(e) => handleItemsPerPageChange(e.target.value)}
                      className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                    >
                      <option value="25">25</option>
                      <option value="50">50</option>
                      <option value="100">100</option>
                      <option value="200">200</option>
                      <option value="500">500</option>
                      <option value="all">Semua</option>
                    </select>
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      per halaman
                    </span>
                  </div>
                </div>
              </div>

              {filteredList.length === 0 ? (
                <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                  <svg
                    className="w-12 h-12 mx-auto mb-4 text-gray-300 dark:text-gray-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
                    />
                  </svg>
                  <p>Belum ada data pendaftar</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 dark:bg-gray-900">
                      <tr>
                        <th className="px-4 sm:px-6 py-3 text-center w-12">
                          <input
                            type="checkbox"
                            checked={isAllPageSelected}
                            ref={(el) => {
                              if (el) el.indeterminate = isSomePageSelected && !isAllPageSelected
                            }}
                            onChange={handleToggleSelectAll}
                            className="w-4 h-4 text-teal-600 bg-gray-100 border-gray-300 rounded focus:ring-teal-500 dark:focus:ring-teal-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                            title="Pilih semua di halaman ini"
                          />
                        </th>
                        <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                          No
                        </th>
                        <th
                          onClick={() => handleSort('keterangan_status')}
                          className="px-4 sm:px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors whitespace-nowrap"
                        >
                          <div className="flex items-center gap-2">
                            Status
                            <SortIcon columnKey="keterangan_status" />
                          </div>
                        </th>
                        <th
                          onClick={() => handleSort('nama')}
                          className="px-4 sm:px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors whitespace-nowrap"
                        >
                          <div className="flex items-center gap-2">
                            Nama
                            <SortIcon columnKey="nama" />
                          </div>
                        </th>
                        <th
                          onClick={() => handleSort('status_pendaftar')}
                          className="px-4 sm:px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors whitespace-nowrap"
                        >
                          <div className="flex items-center gap-2">
                            Status Pendaftar
                            <SortIcon columnKey="status_pendaftar" />
                          </div>
                        </th>
                        <th
                          onClick={() => handleSort('status_santri')}
                          className="px-4 sm:px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors whitespace-nowrap"
                        >
                          <div className="flex items-center gap-2">
                            Status Santri
                            <SortIcon columnKey="status_santri" />
                          </div>
                        </th>
                        <th
                          onClick={() => handleSort('formal')}
                          className="px-4 sm:px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors whitespace-nowrap"
                        >
                          <div className="flex items-center gap-2">
                            Formal
                            <SortIcon columnKey="formal" />
                          </div>
                        </th>
                        <th
                          onClick={() => handleSort('diniyah')}
                          className="px-4 sm:px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors whitespace-nowrap"
                        >
                          <div className="flex items-center gap-2">
                            Diniyah
                            <SortIcon columnKey="diniyah" />
                          </div>
                        </th>
                        <th
                          onClick={() => handleSort('gelombang')}
                          className="px-4 sm:px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors whitespace-nowrap"
                        >
                          <div className="flex items-center gap-2">
                            Gelombang
                            <SortIcon columnKey="gelombang" />
                          </div>
                        </th>
                        <th
                          onClick={() => handleSort('prodi')}
                          className="px-4 sm:px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors whitespace-nowrap"
                        >
                          <div className="flex items-center gap-2">
                            Prodi
                            <SortIcon columnKey="prodi" />
                          </div>
                        </th>
                        <th
                          onClick={() => handleSort('nik')}
                          className="px-4 sm:px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors whitespace-nowrap"
                        >
                          <div className="flex items-center gap-2">
                            NIK
                            <SortIcon columnKey="nik" />
                          </div>
                        </th>
                        <th
                          onClick={() => handleSort('id')}
                          className="px-4 sm:px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors whitespace-nowrap"
                        >
                          <div className="flex items-center gap-2">
                            ID
                            <SortIcon columnKey="id" />
                          </div>
                        </th>
                        <th
                          onClick={() => handleSort('tahun_hijriyah')}
                          className="px-4 sm:px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors whitespace-nowrap"
                        >
                          <div className="flex items-center gap-2">
                            Tahun Ajaran
                            <SortIcon columnKey="tahun_hijriyah" />
                          </div>
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                      {paginatedList.map((pendaftar, index) => {
                        const isSelected = selectedItems.has(pendaftar.id_registrasi)
                        return (
                        <motion.tr
                          key={pendaftar.id_registrasi || index}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ duration: 0.3, delay: index * 0.02 }}
                          onClick={(e) => {
                            if (e.target.type === 'checkbox') return
                            handlePendaftarClick(pendaftar)
                          }}
                          className={`hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors duration-150 cursor-pointer ${isSelected ? 'bg-teal-50 dark:bg-teal-900/20' : ''}`}
                        >
                          <td className="px-4 sm:px-6 py-4 text-center" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleToggleSelect(pendaftar.id_registrasi)}
                              className="w-4 h-4 text-teal-600 bg-gray-100 border-gray-300 rounded focus:ring-teal-500 dark:focus:ring-teal-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                            />
                          </td>
                          <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-200">
                            {startIndex + index + 1}
                          </td>
                          <td className="px-4 sm:px-6 py-4 whitespace-nowrap">
                            <span
                              className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getKeteranganStatusBadgeColor(pendaftar.keterangan_status)}`}
                            >
                              {pendaftar.keterangan_status || '-'}
                            </span>
                          </td>
                          <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-200">
                            {pendaftar.nama}
                          </td>
                          <td className="px-4 sm:px-6 py-4 whitespace-nowrap">
                            <span
                              className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                                pendaftar.status_pendaftar && pendaftar.status_pendaftar !== '-'
                                  ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400'
                                  : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                              }`}
                            >
                              {pendaftar.status_pendaftar || '-'}
                            </span>
                          </td>
                          <td className="px-4 sm:px-6 py-4 whitespace-nowrap">
                            <span
                              className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                                pendaftar.status_santri && pendaftar.status_santri !== '-'
                                  ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400'
                                  : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                              }`}
                            >
                              {pendaftar.status_santri || '-'}
                            </span>
                          </td>
                          <td className="px-4 sm:px-6 py-4 whitespace-nowrap">
                            <span
                              className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                                pendaftar.formal && pendaftar.formal !== '-'
                                  ? 'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-400'
                                  : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                              }`}
                            >
                              {pendaftar.formal || '-'}
                            </span>
                          </td>
                          <td className="px-4 sm:px-6 py-4 whitespace-nowrap">
                            <span
                              className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                                pendaftar.diniyah && pendaftar.diniyah !== '-'
                                  ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'
                                  : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                              }`}
                            >
                              {pendaftar.diniyah || '-'}
                            </span>
                          </td>
                          <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">
                            {pendaftar.gelombang != null && pendaftar.gelombang !== '' ? String(pendaftar.gelombang) : '-'}
                          </td>
                          <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">
                            {pendaftar.prodi || '-'}
                          </td>
                          <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300 font-mono">
                            {pendaftar.nik || '-'}
                          </td>
                          <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300 font-mono">
                            {pendaftar.nis ?? pendaftar.id}
                          </td>
                          <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">
                            {pendaftar.tahun_hijriyah && pendaftar.tahun_masehi
                              ? `${pendaftar.tahun_hijriyah} / ${pendaftar.tahun_masehi}`
                              : pendaftar.tahun_hijriyah || pendaftar.tahun_masehi || '-'}
                          </td>
                        </motion.tr>
                      )})}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Pagination */}
              {filteredList.length > 0 && totalPages > 1 && (
                <div className="px-4 sm:px-6 py-4 border-t border-gray-200 dark:border-gray-700">
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                    {/* Page info */}
                    <div className="text-sm text-gray-700 dark:text-gray-300">
                      Menampilkan {startIndex + 1} - {Math.min(endIndex, filteredList.length)} dari {filteredList.length} pendaftar
                    </div>

                    {/* Page navigation */}
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

                      {/* Page numbers */}
                      <div className="flex items-center gap-1">
                        {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                          let pageNum
                          if (totalPages <= 5) {
                            pageNum = i + 1
                          } else if (currentPage <= 3) {
                            pageNum = i + 1
                          } else if (currentPage >= totalPages - 2) {
                            pageNum = totalPages - 4 + i
                          } else {
                            pageNum = currentPage - 2 + i
                          }

                          return (
                            <button
                              key={pageNum}
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

            {/* Offcanvas Detail Pendaftar & Eksport - render via portal ke document.body agar overlay menutup seluruh layar (sidebar + nav) */}
            {createPortal(
              <>
                <AnimatePresence>
                  {isDetailOffcanvasOpen && selectedPendaftar && (
                    <>
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/50 z-[9998]"
                        onClick={handleCloseDetailOffcanvas}
                        aria-hidden="true"
                      />
                      <motion.div
                        initial={{ x: '100%' }}
                        animate={{ x: 0 }}
                        exit={{ x: '100%' }}
                        transition={{ type: 'tween', duration: 0.25 }}
                        className="fixed top-0 right-0 bottom-0 w-full max-w-md bg-white dark:bg-gray-800 shadow-xl z-[9999] flex flex-col"
                      >
                        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                            Detail Pendaftar
                          </h3>
                          <button
                            type="button"
                            onClick={handleCloseDetailOffcanvas}
                            className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                            aria-label="Tutup"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 space-y-4">
                          <div>
                            <dt className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">NIS</dt>
                            <dd className="mt-0.5 text-sm font-mono text-gray-900 dark:text-gray-100">{selectedPendaftar.nis ?? selectedPendaftar.id}</dd>
                          </div>
                          <div>
                            <dt className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Nama</dt>
                            <dd className="mt-0.5 text-sm font-medium text-gray-900 dark:text-gray-100">{selectedPendaftar.nama}</dd>
                          </div>
                          <div>
                            <dt className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">NIK</dt>
                            <dd className="mt-0.5 text-sm text-gray-700 dark:text-gray-300">{selectedPendaftar.nik || '-'}</dd>
                          </div>
                          <div>
                            <dt className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">No Telpon</dt>
                            <dd className="mt-0.5 text-sm text-gray-700 dark:text-gray-300 font-mono">{selectedPendaftar.no_telpon || '-'}</dd>
                          </div>
                          <div>
                            <dt className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">No WA</dt>
                            <dd className="mt-0.5 text-sm text-gray-700 dark:text-gray-300 font-mono">{selectedPendaftar.no_wa_santri || '-'}</dd>
                          </div>
                          <div>
                            <dt className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Total Wajib</dt>
                            <dd className="mt-0.5 text-sm text-gray-700 dark:text-gray-300">
                              {selectedPendaftar.wajib != null ? `Rp ${Number(selectedPendaftar.wajib).toLocaleString('id-ID')}` : '-'}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Total Bayar</dt>
                            <dd className="mt-0.5 text-sm text-gray-700 dark:text-gray-300">
                              {selectedPendaftar.bayar != null ? `Rp ${Number(selectedPendaftar.bayar).toLocaleString('id-ID')}` : '-'}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Keterangan</dt>
                            <dd className="mt-0.5 text-sm text-gray-700 dark:text-gray-300">
                              {getKeteranganBayar(selectedPendaftar)}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Ayah</dt>
                            <dd className="mt-0.5 text-sm text-gray-700 dark:text-gray-300">{selectedPendaftar.ayah || '-'}</dd>
                          </div>
                          <div>
                            <dt className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Ibu</dt>
                            <dd className="mt-0.5 text-sm text-gray-700 dark:text-gray-300">{selectedPendaftar.ibu || '-'}</dd>
                          </div>
                          <div>
                            <dt className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Alamat</dt>
                            <dd className="mt-0.5 text-sm text-gray-700 dark:text-gray-300">{selectedPendaftar.alamat || '-'}</dd>
                          </div>
                          <div>
                            <dt className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Formal</dt>
                            <dd className="mt-0.5 text-sm text-gray-700 dark:text-gray-300">{selectedPendaftar.formal || '-'}</dd>
                          </div>
                          <div>
                            <dt className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Diniyah</dt>
                            <dd className="mt-0.5 text-sm text-gray-700 dark:text-gray-300">{selectedPendaftar.diniyah || '-'}</dd>
                          </div>
                          <div>
                            <dt className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Prodi</dt>
                            <dd className="mt-0.5 text-sm text-gray-700 dark:text-gray-300">{selectedPendaftar.prodi || '-'}</dd>
                          </div>
                          <div>
                            <dt className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Status Pendaftar</dt>
                            <dd className="mt-0.5 text-sm text-gray-700 dark:text-gray-300">{selectedPendaftar.status_pendaftar || '-'}</dd>
                          </div>
                          <div>
                            <dt className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Keterangan Status</dt>
                            <dd className="mt-1">
                              <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getKeteranganStatusBadgeColor(selectedPendaftar.keterangan_status)}`}>
                                {selectedPendaftar.keterangan_status || '-'}
                              </span>
                            </dd>
                          </div>
                          <div>
                            <dt className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Tahun Ajaran</dt>
                            <dd className="mt-0.5 text-sm text-gray-700 dark:text-gray-300">
                              {selectedPendaftar.tahun_hijriyah && selectedPendaftar.tahun_masehi
                                ? `${selectedPendaftar.tahun_hijriyah} / ${selectedPendaftar.tahun_masehi}`
                                : selectedPendaftar.tahun_hijriyah || selectedPendaftar.tahun_masehi || '-'}
                            </dd>
                          </div>

                          {/* Riwayat / Milestone dari psb___registrasi */}
                          <div className="pt-3 mt-3 border-t border-gray-200 dark:border-gray-600">
                            <dt className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-2">Riwayat</dt>
                            <dl className="space-y-2">
                              <div>
                                <dt className="text-xs text-gray-500 dark:text-gray-400">Melengkapi data</dt>
                                <dd className="mt-0.5 text-sm text-gray-700 dark:text-gray-300">{formatTanggalWaktu(selectedPendaftar.tanggal_biodata_simpan)}</dd>
                              </div>
                              <div>
                                <dt className="text-xs text-gray-500 dark:text-gray-400">Berkas lengkap / upload berkas</dt>
                                <dd className="mt-0.5 text-sm text-gray-700 dark:text-gray-300">{formatTanggalWaktu(selectedPendaftar.tanggal_berkas_lengkap)}</dd>
                              </div>
                              <div>
                                <dt className="text-xs text-gray-500 dark:text-gray-400">Pembayaran pertama (bayar)</dt>
                                <dd className="mt-0.5 text-sm text-gray-700 dark:text-gray-300">{formatTanggalWaktu(selectedPendaftar.tanggal_pembayaran_pertama)}</dd>
                              </div>
                              <div>
                                <dt className="text-xs text-gray-500 dark:text-gray-400">Diverifikasi</dt>
                                <dd className="mt-0.5 text-sm text-gray-700 dark:text-gray-300">{formatTanggalWaktu(selectedPendaftar.tanggal_diverifikasi)}</dd>
                                {selectedPendaftar.nama_pengurus_verifikasi && (
                                  <dd className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">Oleh: {selectedPendaftar.nama_pengurus_verifikasi}</dd>
                                )}
                              </div>
                              <div>
                                <dt className="text-xs text-gray-500 dark:text-gray-400">Aktif di pondok</dt>
                                <dd className="mt-0.5 text-sm text-gray-700 dark:text-gray-300">{formatTanggalWaktu(selectedPendaftar.tanggal_aktif_pondok)}</dd>
                                {selectedPendaftar.nama_pengurus_aktif && (
                                  <dd className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">Oleh: {selectedPendaftar.nama_pengurus_aktif}</dd>
                                )}
                              </div>
                              <div>
                                <dt className="text-xs text-gray-500 dark:text-gray-400">Terakhir update</dt>
                                <dd className="mt-0.5 text-sm text-gray-700 dark:text-gray-300">{formatTanggalWaktu(selectedPendaftar.tanggal_update)}</dd>
                              </div>
                            </dl>
                          </div>
                        </div>
                        <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex flex-col gap-2">
                          <button
                            type="button"
                            onClick={handleEditClick}
                            className="w-full inline-flex justify-center items-center gap-2 px-4 py-2.5 bg-teal-600 hover:bg-teal-700 text-white font-medium rounded-lg transition-colors"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                            Edit
                          </button>
                          {showVerifikasiButton(selectedPendaftar.keterangan_status) && (
                            <button
                              type="button"
                              onClick={handleVerifikasiClick}
                              disabled={verifikasiLoading}
                              className="w-full inline-flex justify-center items-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {verifikasiLoading ? (
                                <>
                                  <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                  </svg>
                                  Memproses...
                                </>
                              ) : (
                                <>
                                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                  </svg>
                                  Verifikasi
                                </>
                              )}
                            </button>
                          )}
                        </div>
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
                <ExportPendaftarOffcanvas
                  isOpen={isExportOffcanvasOpen}
                  onClose={() => setIsExportOffcanvasOpen(false)}
                  filteredData={selectedItems.size > 0 ? filteredList.filter(p => selectedItems.has(p.id_registrasi)) : filteredList}
                  isExportSelected={selectedItems.size > 0}
                  tahunAjaran={tahunAjaran}
                  tahunAjaranMasehi={tahunAjaranMasehi}
                />
                <BulkEditPendaftarOffcanvas
                  isOpen={showBulkEditOffcanvas}
                  onClose={() => setShowBulkEditOffcanvas(false)}
                  selectedPendaftarList={filteredList.filter(p => selectedItems.has(p.id_registrasi))}
                  allPendaftarList={pendaftarList}
                  onSuccess={() => {
                    loadPendaftarData()
                    setSelectedItems(new Set())
                  }}
                />
              </>,
              document.body
            )}
          </motion.div>
        </div>
      </div>
    </div>
  )
}

export default DataPendaftar
