import { useState, useEffect, useCallback } from 'react'
import { pengeluaranAPI } from '../../../../services/api'
import { useNotification } from '../../../../contexts/NotificationContext'

/**
 * Custom hook untuk mengelola filtering dan pagination rencana pengeluaran
 * @param {string} activeTab - Tab yang aktif ('rencana' atau 'pengeluaran')
 * @param {number} itemsPerPage - Jumlah item per halaman
 * @param {{ lockedLembagaId?: string|null }} [options]
 * @returns {Object} State dan handlers untuk filtering rencana
 */
export const useRencanaFilters = (activeTab, itemsPerPage = 50, options = {}) => {
  const { lockedLembagaId = null } = options
  const { showNotification } = useNotification()
  
  // Data state
  const [allRencana, setAllRencana] = useState([])
  const [filteredRencana, setFilteredRencana] = useState([])
  const [rencanaList, setRencanaList] = useState([])
  const [loading, setLoading] = useState(false)
  
  // Filter state
  const [rencanaPage, setRencanaPage] = useState(1)
  const [rencanaTotal, setRencanaTotal] = useState(0)
  const [rencanaSearchQuery, setRencanaSearchQuery] = useState('')
  const [rencanaStatusFilter, setRencanaStatusFilter] = useState('')
  const [rencanaKategoriFilter, setRencanaKategoriFilter] = useState('')
  const [rencanaLembagaFilter, setRencanaLembagaFilter] = useState('')
  const [rencanaTanggalDari, setRencanaTanggalDari] = useState('')
  const [rencanaTanggalSampai, setRencanaTanggalSampai] = useState('')
  
  // UI state
  const [isRencanaFilterOpen, setIsRencanaFilterOpen] = useState(false)
  const [isRencanaInputFocused, setIsRencanaInputFocused] = useState(false)

  // Load semua data rencana dari server
  const loadAllRencana = useCallback(async () => {
    try {
      setLoading(true)
      const response = await pengeluaranAPI.getRencanaList(
        null, // status
        null, // kategori
        null, // lembaga
        null, // tanggal_dari
        null, // tanggal_sampai
        1,
        10000, // limit besar untuk mendapatkan semua data
        'rencana'
      )
      if (response.success) {
        setAllRencana(response.data.rencana || [])
      } else {
        showNotification(response.message || 'Gagal memuat daftar rencana', 'error')
      }
    } catch (err) {
      console.error('Error loading rencana:', err)
      showNotification(err.response?.data?.message || 'Terjadi kesalahan saat memuat daftar rencana', 'error')
    } finally {
      setLoading(false)
    }
  }, [showNotification])

  useEffect(() => {
    if (lockedLembagaId) {
      setRencanaLembagaFilter(lockedLembagaId)
    }
  }, [lockedLembagaId])

  // Load data saat tab aktif
  useEffect(() => {
    if (activeTab === 'rencana') {
      loadAllRencana()
    }
  }, [activeTab, loadAllRencana])

  // Apply filters untuk rencana (client-side filtering)
  useEffect(() => {
    if (allRencana.length === 0) {
      setFilteredRencana([])
      return
    }

    let filtered = [...allRencana]

    // Filter berdasarkan search query
    if (rencanaSearchQuery.trim()) {
      const query = rencanaSearchQuery.toLowerCase().trim()
      filtered = filtered.filter(rencana =>
        (rencana.keterangan && rencana.keterangan.toLowerCase().includes(query)) ||
        (rencana.admin_nama && rencana.admin_nama.toLowerCase().includes(query)) ||
        (rencana.id && rencana.id.toString().includes(query))
      )
    }

    // Filter berdasarkan status (exclude draft untuk tab rencana)
    if (activeTab === 'rencana') {
      filtered = filtered.filter(rencana => rencana.ket !== 'draft')
    }
    
    if (rencanaStatusFilter) {
      filtered = filtered.filter(rencana => rencana.ket === rencanaStatusFilter)
    }

    // Filter berdasarkan kategori
    if (rencanaKategoriFilter) {
      filtered = filtered.filter(rencana => rencana.kategori === rencanaKategoriFilter)
    }

    // Filter berdasarkan lembaga
    if (rencanaLembagaFilter) {
      filtered = filtered.filter(rencana => rencana.lembaga === rencanaLembagaFilter)
    }

    // Filter berdasarkan tanggal
    if (rencanaTanggalDari) {
      filtered = filtered.filter(rencana => {
        const tanggalDibuat = new Date(rencana.tanggal_dibuat).toISOString().split('T')[0]
        return tanggalDibuat >= rencanaTanggalDari
      })
    }

    if (rencanaTanggalSampai) {
      filtered = filtered.filter(rencana => {
        const tanggalDibuat = new Date(rencana.tanggal_dibuat).toISOString().split('T')[0]
        return tanggalDibuat <= rencanaTanggalSampai
      })
    }

    setFilteredRencana(filtered)
    setRencanaPage(1) // Reset ke halaman pertama saat filter berubah
  }, [rencanaSearchQuery, rencanaStatusFilter, rencanaKategoriFilter, rencanaLembagaFilter, rencanaTanggalDari, rencanaTanggalSampai, allRencana, activeTab])

  // Pagination untuk rencana
  useEffect(() => {
    const startIndex = (rencanaPage - 1) * itemsPerPage
    const endIndex = startIndex + itemsPerPage
    setRencanaList(filteredRencana.slice(startIndex, endIndex))
    setRencanaTotal(filteredRencana.length)
  }, [filteredRencana, rencanaPage, itemsPerPage])

  // Search input handlers
  const handleRencanaSearchInputChange = useCallback((e) => {
    setRencanaSearchQuery(e.target.value)
  }, [])

  const handleRencanaSearchInputFocus = useCallback(() => {
    setIsRencanaInputFocused(true)
  }, [])

  const handleRencanaSearchInputBlur = useCallback(() => {
    setIsRencanaInputFocused(false)
  }, [])

  return {
    // Data
    allRencana,
    filteredRencana,
    rencanaList,
    loading,
    rencanaTotal,
    
    // Filters
    rencanaSearchQuery,
    rencanaStatusFilter,
    rencanaKategoriFilter,
    rencanaLembagaFilter,
    rencanaTanggalDari,
    rencanaTanggalSampai,
    
    // Pagination
    rencanaPage,
    setRencanaPage,
    
    // UI
    isRencanaFilterOpen,
    setIsRencanaFilterOpen,
    isRencanaInputFocused,
    
    // Handlers
    loadAllRencana,
    handleRencanaSearchInputChange,
    handleRencanaSearchInputFocus,
    handleRencanaSearchInputBlur,
    
    // Setters
    setRencanaStatusFilter,
    setRencanaKategoriFilter,
    setRencanaLembagaFilter,
    setRencanaTanggalDari,
    setRencanaTanggalSampai
  }
}

