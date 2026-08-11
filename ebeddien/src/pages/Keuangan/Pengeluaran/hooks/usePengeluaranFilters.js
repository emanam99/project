import { useState, useEffect, useCallback } from 'react'
import { pengeluaranAPI } from '../../../../services/api'
import { useNotification } from '../../../../contexts/NotificationContext'
import { hijriYmdToMasehiYmd } from '../../../../utils/hijriDate'

/**
 * Custom hook untuk mengelola filtering dan pagination pengeluaran
 * @param {string} activeTab - Tab yang aktif ('rencana' atau 'pengeluaran')
 * @param {number} itemsPerPage - Jumlah item per halaman
 * @param {{ lockedLembagaId?: string|null }} [options]
 * @returns {Object} State dan handlers untuk filtering pengeluaran
 */
export const usePengeluaranFilters = (activeTab, itemsPerPage = 50, options = {}) => {
  const { lockedLembagaId = null } = options
  const { showNotification } = useNotification()
  
  // Data state
  const [allPengeluaran, setAllPengeluaran] = useState([])
  const [filteredPengeluaran, setFilteredPengeluaran] = useState([])
  const [pengeluaranList, setPengeluaranList] = useState([])
  const [loading, setLoading] = useState(false)
  
  // Filter state
  const [pengeluaranPage, setPengeluaranPage] = useState(1)
  const [pengeluaranTotal, setPengeluaranTotal] = useState(0)
  const [pengeluaranSearchQuery, setPengeluaranSearchQuery] = useState('')
  const [pengeluaranKategoriFilter, setPengeluaranKategoriFilter] = useState('')
  const [pengeluaranLembagaFilter, setPengeluaranLembagaFilter] = useState('')
  const [pengeluaranTanggalDari, setPengeluaranTanggalDari] = useState('')
  const [pengeluaranTanggalSampai, setPengeluaranTanggalSampai] = useState('')
  const [pengeluaranTahunHijriyahDari, setPengeluaranTahunHijriyahDari] = useState('')
  const [pengeluaranTahunHijriyahSampai, setPengeluaranTahunHijriyahSampai] = useState('')
  const [pengeluaranTahunHijriyahDariMasehi, setPengeluaranTahunHijriyahDariMasehi] = useState('')
  const [pengeluaranTahunHijriyahSampaiMasehi, setPengeluaranTahunHijriyahSampaiMasehi] = useState('')
  
  // UI state
  const [isPengeluaranFilterOpen, setIsPengeluaranFilterOpen] = useState(false)
  const [isPengeluaranInputFocused, setIsPengeluaranInputFocused] = useState(false)

  // Load semua data pengeluaran dari server
  const loadAllPengeluaran = useCallback(async () => {
    try {
      setLoading(true)
      const response = await pengeluaranAPI.getPengeluaranList(
        null, // kategori
        null, // lembaga
        null, // tanggal_dari
        null, // tanggal_sampai
        1,
        10000 // limit besar untuk mendapatkan semua data
      )
      if (response.success) {
        setAllPengeluaran(response.data.pengeluaran || [])
      } else {
        showNotification(response.message || 'Gagal memuat daftar pengeluaran', 'error')
      }
    } catch (err) {
      console.error('Error loading pengeluaran:', err)
      showNotification(err.response?.data?.message || 'Terjadi kesalahan saat memuat daftar pengeluaran', 'error')
    } finally {
      setLoading(false)
    }
  }, [showNotification])

  useEffect(() => {
    if (lockedLembagaId) {
      setPengeluaranLembagaFilter(lockedLembagaId)
    }
  }, [lockedLembagaId])

  // Load data saat tab aktif
  useEffect(() => {
    if (activeTab === 'pengeluaran') {
      loadAllPengeluaran()
    }
  }, [activeTab, loadAllPengeluaran])

  // Apply filters untuk pengeluaran (client-side filtering)
  useEffect(() => {
    if (allPengeluaran.length === 0) {
      setFilteredPengeluaran([])
      return
    }

    let filtered = [...allPengeluaran]

    // Filter berdasarkan search query
    if (pengeluaranSearchQuery.trim()) {
      const query = pengeluaranSearchQuery.toLowerCase().trim()
      filtered = filtered.filter(pengeluaran =>
        (pengeluaran.keterangan && pengeluaran.keterangan.toLowerCase().includes(query)) ||
        (pengeluaran.admin_nama && pengeluaran.admin_nama.toLowerCase().includes(query)) ||
        (pengeluaran.id && pengeluaran.id.toString().includes(query))
      )
    }

    // Filter berdasarkan kategori
    if (pengeluaranKategoriFilter) {
      filtered = filtered.filter(pengeluaran => pengeluaran.kategori === pengeluaranKategoriFilter)
    }

    // Filter berdasarkan lembaga
    if (pengeluaranLembagaFilter) {
      filtered = filtered.filter(pengeluaran => pengeluaran.lembaga === pengeluaranLembagaFilter)
    }

    const effectiveTanggalDari = pengeluaranTahunHijriyahDariMasehi || pengeluaranTanggalDari
    const effectiveTanggalSampai = pengeluaranTahunHijriyahSampaiMasehi || pengeluaranTanggalSampai

    // Filter berdasarkan tanggal
    if (effectiveTanggalDari) {
      filtered = filtered.filter(pengeluaran => {
        const tanggalDibuat = new Date(pengeluaran.tanggal_dibuat).toISOString().split('T')[0]
        return tanggalDibuat >= effectiveTanggalDari
      })
    }

    if (effectiveTanggalSampai) {
      filtered = filtered.filter(pengeluaran => {
        const tanggalDibuat = new Date(pengeluaran.tanggal_dibuat).toISOString().split('T')[0]
        return tanggalDibuat <= effectiveTanggalSampai
      })
    }

    setFilteredPengeluaran(filtered)
    setPengeluaranPage(1) // Reset ke halaman pertama saat filter berubah
  }, [pengeluaranSearchQuery, pengeluaranKategoriFilter, pengeluaranLembagaFilter, pengeluaranTanggalDari, pengeluaranTanggalSampai, pengeluaranTahunHijriyahDariMasehi, pengeluaranTahunHijriyahSampaiMasehi, allPengeluaran])

  useEffect(() => {
    let cancelled = false
    const convertYearStart = async () => {
      if (!pengeluaranTahunHijriyahDari || !/^\d{4}$/.test(String(pengeluaranTahunHijriyahDari))) {
        setPengeluaranTahunHijriyahDariMasehi('')
        return
      }
      const converted = await hijriYmdToMasehiYmd(`${pengeluaranTahunHijriyahDari}-01-01`)
      if (!cancelled) {
        setPengeluaranTahunHijriyahDariMasehi(converted || '')
      }
    }
    convertYearStart()
    return () => { cancelled = true }
  }, [pengeluaranTahunHijriyahDari])

  useEffect(() => {
    let cancelled = false
    const convertYearEnd = async () => {
      if (!pengeluaranTahunHijriyahSampai || !/^\d{4}$/.test(String(pengeluaranTahunHijriyahSampai))) {
        setPengeluaranTahunHijriyahSampaiMasehi('')
        return
      }
      const converted30 = await hijriYmdToMasehiYmd(`${pengeluaranTahunHijriyahSampai}-12-30`)
      const converted29 = converted30 || await hijriYmdToMasehiYmd(`${pengeluaranTahunHijriyahSampai}-12-29`)
      if (!cancelled) {
        setPengeluaranTahunHijriyahSampaiMasehi(converted29 || '')
      }
    }
    convertYearEnd()
    return () => { cancelled = true }
  }, [pengeluaranTahunHijriyahSampai])

  // Pagination untuk pengeluaran
  useEffect(() => {
    const startIndex = (pengeluaranPage - 1) * itemsPerPage
    const endIndex = startIndex + itemsPerPage
    setPengeluaranList(filteredPengeluaran.slice(startIndex, endIndex))
    setPengeluaranTotal(filteredPengeluaran.length)
  }, [filteredPengeluaran, pengeluaranPage, itemsPerPage])

  // Search input handlers
  const handlePengeluaranSearchInputChange = useCallback((e) => {
    setPengeluaranSearchQuery(e.target.value)
  }, [])

  const handlePengeluaranSearchInputFocus = useCallback(() => {
    setIsPengeluaranInputFocused(true)
  }, [])

  const handlePengeluaranSearchInputBlur = useCallback(() => {
    setIsPengeluaranInputFocused(false)
  }, [])

  return {
    // Data
    allPengeluaran,
    filteredPengeluaran,
    pengeluaranList,
    loading,
    pengeluaranTotal,
    
    // Filters
    pengeluaranSearchQuery,
    pengeluaranKategoriFilter,
    pengeluaranLembagaFilter,
    pengeluaranTanggalDari,
    pengeluaranTanggalSampai,
    pengeluaranTahunHijriyahDari,
    pengeluaranTahunHijriyahSampai,
    pengeluaranTahunHijriyahDariMasehi,
    pengeluaranTahunHijriyahSampaiMasehi,
    
    // Pagination
    pengeluaranPage,
    setPengeluaranPage,
    
    // UI
    isPengeluaranFilterOpen,
    setIsPengeluaranFilterOpen,
    isPengeluaranInputFocused,
    
    // Handlers
    loadAllPengeluaran,
    handlePengeluaranSearchInputChange,
    handlePengeluaranSearchInputFocus,
    handlePengeluaranSearchInputBlur,
    
    // Setters
    setPengeluaranKategoriFilter,
    setPengeluaranLembagaFilter,
    setPengeluaranTanggalDari,
    setPengeluaranTanggalSampai,
    setPengeluaranTahunHijriyahDari,
    setPengeluaranTahunHijriyahSampai
  }
}

